# 毛孩桌寵（子專案 A：桌面程式）實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做出一個 Windows 桌寵程式：內建的貓咪（第一隻是小昭）用透明影片住在工作列上方，會自己換姿勢、回應點擊和拖曳、聽右鍵指令、提醒喝水休息，並有系統列和控制面板。

**Architecture:** Electron 主程式管理每隻貓一個透明小視窗、系統列、控制面板、設定和提醒計時。「下一步播什麼」全部由 `src/shared/` 的純邏輯決定（姿勢圖找路、行為引擎、提醒排程、設定整理），亂數和時間由外部傳入，用 Vitest 測試。畫面層（貓咪視窗、控制面板）只負責執行決定，用 Playwright 的 Electron 模式做整合測試。所有畫面和寵物包透過自訂的 `app://local/` 協定提供，讓影片和頁面同源，才能讀取影片像素判斷點擊位置。

**Tech Stack:** Electron（最新穩定版）、TypeScript、esbuild（打包）、Vitest（單元測試）、@playwright/test（Electron 整合測試）、electron-builder（NSIS 安裝檔）、ffmpeg-static（產生測試用影片）。小昭素材轉換用試驗環境裡的 Python（numpy、Pillow、imageio-ffmpeg）。

**Spec:** `docs/superpowers/specs/2026-09-27-desktop-pet-design.md`

## Global Constraints

- 只支援 Windows 10/11；不做 Mac、不上架、不簽署。
- 使用者看得到的文字全部用繁體中文；程式碼、識別字、註解用英文。
- 寵物包格式 `schemaVersion: 1`；影片是 VP9＋透明通道的 WebM，960×540、24fps。
- 設定檔：`%APPDATA%\desktop-pet\settings.json`；記錄檔：`%APPDATA%\desktop-pet\logs\`，保留最近 5 個。
- 測試用環境變數：`DESKTOP_PET_PACKS`（寵物包資料夾）、`DESKTOP_PET_USERDATA`（使用者資料夾）、`DESKTOP_PET_DEBUG=1`（在貓咪視窗暴露 `window.__pet`，在主程式暴露 `global.__controller`）、`DESKTOP_PET_METRICS=1`（每分鐘記錄 CPU 和記憶體）。
- 大小三段：小 0.75、中 1.0、大 1.3；控制面板可在 0.6～1.5 之間調整。
- 提醒間隔只能是 0（關閉）、30、45、60、90 分鐘；「10 分鐘後」延後 10 分鐘；提醒泡泡 15 秒沒理會視同「好了」。
- 一般泡泡顯示 2.2 秒；片段之間交叉淡化 0.12 秒。
- 效能目標：一隻貓 CPU 平均 5% 以下、記憶體 250 MB 以下；三隻貓 CPU 平均 12% 以下。
- 所有指令在專案根目錄 `C:\Users\USER\Projects\desktop-pet` 執行，使用 Git Bash。
- 每個 commit 訊息結尾加上 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。

## 檔案結構

```
desktop-pet/
  package.json  tsconfig.json  vitest.config.ts  playwright.config.ts  .gitignore
  scripts/
    build.mjs              esbuild：主程式、preload、兩個畫面、檢查指令
    make-test-pack.mjs     用 ffmpeg 產生兩個測試寵物包（testcat、testcat2）
  src/
    types/global.d.ts      window.petApi / window.panelApi 型別
    shared/                純邏輯（不 import electron）
      types.ts             寵物包型別
      pack.ts              parsePack：格式檢查
      graph.ts             reachable、findPath、pathToSteps、idleStep、Step
      validate.ts          validatePack：規則檢查（檔案、可達性、指令）
      behavior.ts          BehaviorEngine
      pose-geometry.ts     poseValueAt、showsShadow、isAsleep
      lines.ts             pickLine、clickLine、commandLine、reminderLine
      reminders.ts         ReminderScheduler
      settings.ts          Settings 型別、defaultSettings、normalizeSettings
      placement.ts         findFreeCenter
      ipc.ts               PetInit、PetApi、PanelState、PanelAction、PanelApi
    main/
      main.ts              啟動、單一執行
      paths.ts             資料夾位置
      logger.ts            記錄檔
      settings-store.ts    設定讀寫（原子寫入、壞檔備份）
      pack-loader.ts       讀取並檢查寵物包
      app-protocol-core.ts app:// 的路徑解析、Range 解析（純函式）
      app-protocol.ts      註冊 app:// 協定
      pet-geometry.ts      視窗大小和位置（純函式）
      menus.ts             右鍵選單、系統列選單的內容（純函式）
      pet-window.ts        PetWindow：一隻貓的視窗
      panel-window.ts      PanelWindow：控制面板視窗
      tray.ts              TrayController
      controller.ts        AppController：把以上串起來
      preload-pet.ts  preload-panel.ts
    pet/   pet.html  pet.css  pet.ts  player.ts  interactions.ts  bubble.ts
    panel/ panel.html  panel.css  panel.ts
    cli/check-pack.ts      獨立的寵物包檢查指令
  tools/convert_xiaozhao.py 把試驗做好的小昭素材轉成寵物包
  packs/xiaozhao/          小昭寵物包（Task 16 產生）
  tests/
    fixtures/test-pack.json   測試寵物包的 pack.json（唯一來源）
    fixtures/packs/           make-test-pack.mjs 產生（不進 git）
    unit/*.test.ts            Vitest
    e2e/helpers.ts  e2e/*.spec.ts   Playwright
```

---

### Task 1: 專案骨架、寵物包型別與格式檢查

**Files:**
- Create: `package.json`、`tsconfig.json`、`vitest.config.ts`、`.gitignore`、`scripts/build.mjs`
- Create: `src/shared/types.ts`、`src/shared/pack.ts`
- Create: `tests/fixtures/test-pack.json`、`tests/unit/fixtures.ts`
- Test: `tests/unit/pack.test.ts`

**Interfaces:**
- Produces: 型別 `PoseId, ClipId, PoseDef, ClipDef, EdgeDef, LineSet, PoseLines, ReminderLines, ReminderType, PackLines, Command, Pack`；`REMINDER_TYPES: ReminderType[]`；`parsePack(raw: unknown): { pack: Pack | null; errors: string[] }`；測試用 `makePack(): Pack`（來自 `tests/fixtures/test-pack.json`）。

- [ ] **Step 1: 建立 npm 專案並安裝工具**

```bash
cd /c/Users/USER/Projects/desktop-pet
npm init -y
npm install -D electron electron-builder typescript vitest esbuild @playwright/test ffmpeg-static @types/node
```

- [ ] **Step 2: 改寫 `package.json`（保留 npm 寫入的 `devDependencies`，其他欄位換成下面內容）**

```json
{
  "name": "desktop-pet",
  "version": "0.1.0",
  "description": "毛孩桌寵",
  "private": true,
  "main": "dist/main.js",
  "scripts": {
    "build": "node scripts/build.mjs",
    "typecheck": "tsc --noEmit",
    "pretest": "node scripts/make-test-pack.mjs",
    "test": "vitest run",
    "test:e2e": "npm run build && node scripts/make-test-pack.mjs && playwright test",
    "start": "npm run build && electron .",
    "check-pack": "node dist/check-pack.js",
    "dist": "npm run build && electron-builder --win nsis"
  }
}
```

（`pretest` 用到的 `scripts/make-test-pack.mjs` 在 Task 8 才建立；Task 1～7 執行測試時改用 `npx vitest run`，不會觸發 `pretest`。）

- [ ] **Step 3: 建立設定檔**

`tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node"],
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "include": ["src", "tests", "scripts", "*.ts"]
}
```

`vitest.config.ts`：

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' } });
```

`.gitignore`：

```
node_modules/
dist/
release/
tests/fixtures/packs/
test-results/
playwright-report/
```

`scripts/build.mjs`（只打包已經存在的進入點，所以早期任務也能執行）：

```js
import { build } from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const common = { bundle: true, sourcemap: true, logLevel: 'info', target: 'es2022' };
const node = { ...common, platform: 'node', format: 'cjs', external: ['electron'] };
const browser = { ...common, platform: 'browser', format: 'iife' };
const entries = [
  ['src/main/main.ts', 'dist/main.js', node],
  ['src/main/preload-pet.ts', 'dist/preload-pet.js', node],
  ['src/main/preload-panel.ts', 'dist/preload-panel.js', node],
  ['src/pet/pet.ts', 'dist/pet.js', browser],
  ['src/panel/panel.ts', 'dist/panel.js', browser],
  ['src/cli/check-pack.ts', 'dist/check-pack.js', node],
];
await mkdir('dist', { recursive: true });
await Promise.all(entries.filter(([src]) => existsSync(src)).map(([src, out, opts]) => build({ ...opts, entryPoints: [src], outfile: out })));
for (const f of ['src/pet/pet.html', 'src/pet/pet.css', 'src/panel/panel.html', 'src/panel/panel.css']) {
  if (existsSync(f)) await cp(f, `dist/${f.split('/').pop()}`);
}
```

- [ ] **Step 4: 建立測試寵物包的設定（之後單元測試和整合測試共用）**

`tests/fixtures/test-pack.json`：

```json
{
  "schemaVersion": 1,
  "id": "testcat",
  "name": "測試貓",
  "personality": "測試用",
  "portrait": "portrait.png",
  "frame": { "aspect": 1.7777777777777777, "displayHeight": 300 },
  "start": "rest",
  "poses": {
    "rest": { "label": "休息", "idle": ["idle_rest", "idle_rest2"], "ground": 0.9, "centerX": 0.34, "head": 0.4, "shadow": true, "draggable": true, "stay": 0.7, "autoWeight": 1 },
    "restProp": { "label": "（道具出現）", "transient": true, "ground": 0.9, "centerX": 0.34, "head": 0.4, "shadow": true },
    "perch": { "label": "在台子上", "idle": ["idle_perch"], "ground": 0.9, "centerX": 0.75, "head": 0.5, "shadow": false, "draggable": false, "asleep": true, "stay": 0.8, "autoWeight": 2 },
    "sit": { "label": "坐著", "idle": ["idle_sit"], "ground": 0.9, "centerX": 0.34, "head": 0.6, "shadow": true, "stay": 0.5, "autoWeight": 1 }
  },
  "clips": {
    "idle_rest": { "file": "clips/idle_rest.webm" },
    "idle_rest2": { "file": "clips/idle_rest2.webm" },
    "idle_perch": { "file": "clips/idle_perch.webm" },
    "idle_sit": { "file": "clips/idle_sit.webm" },
    "go_perch": { "file": "clips/go_perch.webm", "rate": 0.8 },
    "leave_perch": { "file": "clips/leave_perch.webm" },
    "rest_to_sit": { "file": "clips/rest_to_sit.webm" },
    "sit_to_rest": { "file": "clips/sit_to_rest.webm" }
  },
  "edges": [
    { "from": "rest", "to": "restProp", "fade": 0.5 },
    { "from": "restProp", "to": "perch", "clip": "go_perch" },
    { "from": "perch", "to": "restProp", "clip": "leave_perch" },
    { "from": "restProp", "to": "rest", "fade": 0.5 },
    { "from": "rest", "to": "sit", "clip": "rest_to_sit" },
    { "from": "sit", "to": "rest", "clip": "sit_to_rest" }
  ],
  "lines": {
    "greet": ["嗨。"],
    "click": { "default": ["……"], "perch": ["zzz"] },
    "drag": ["隨便你"],
    "noDrag": ["不想動"],
    "command": { "rest": "嗯。", "perch": "（盯）" },
    "reminders": {
      "water": { "default": "喝水。", "perch": "（夢中）喝水。" },
      "stretch": { "default": "動一動。" },
      "eyes": { "default": "休息眼睛。" }
    }
  },
  "clickHeart": true,
  "commands": [
    { "label": "休息", "pose": "rest" },
    { "label": "上台子", "pose": "perch" },
    { "label": "坐下", "pose": "sit" }
  ]
}
```

`tests/unit/fixtures.ts`：

```ts
import base from '../fixtures/test-pack.json';
import type { Pack } from '../../src/shared/types';

/** A fresh deep copy of the test pack, safe to mutate in a test. */
export function makePack(): Pack {
  return structuredClone(base) as unknown as Pack;
}

/** An rng that always returns the same value. */
export const constRng = (v: number) => () => v;
```

- [ ] **Step 5: 寫會失敗的測試** `tests/unit/pack.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { parsePack } from '../../src/shared/pack';
import { makePack } from './fixtures';

describe('parsePack', () => {
  it('accepts the test pack', () => {
    const r = parsePack(makePack());
    expect(r.errors).toEqual([]);
    expect(r.pack?.id).toBe('testcat');
  });

  it('rejects a non-object', () => {
    expect(parsePack(null).errors).toEqual(['pack.json 不是一個物件']);
  });

  it('rejects an unknown schema version', () => {
    const p: any = makePack(); p.schemaVersion = 2;
    expect(parsePack(p).errors).toContain('不支援的 schemaVersion：2');
  });

  it('requires exactly one of clip or fade on an edge', () => {
    const p: any = makePack(); p.edges.push({ from: 'rest', to: 'sit', clip: 'rest_to_sit', fade: 0.5 });
    expect(parsePack(p).errors).toContain('轉換 rest→sit 要剛好有 clip 或 fade 其中一個');
  });

  it('checks that pose numbers are ratios', () => {
    const p: any = makePack(); p.poses.rest.ground = 1.5;
    expect(parsePack(p).errors).toContain('姿勢 rest 的 ground 要在 0 到 1 之間');
  });

  it('checks optional booleans on a pose', () => {
    const p: any = makePack(); p.poses.perch.asleep = 'yes';
    expect(parsePack(p).errors).toContain('姿勢 perch 的 asleep 要是 true 或 false');
  });

  it('needs a default click line and every reminder line', () => {
    const p: any = makePack(); delete p.lines.click.default; delete p.lines.reminders.eyes;
    const e = parsePack(p).errors;
    expect(e).toContain('lines.click.default 要是至少一句台詞的陣列');
    expect(e).toContain('lines.reminders.eyes.default 要是一句台詞');
  });
});
```

- [ ] **Step 6: 執行測試，確認失敗**

Run: `npx vitest run tests/unit/pack.test.ts`
Expected: FAIL（找不到 `../../src/shared/pack`）

- [ ] **Step 7: 寫型別** `src/shared/types.ts`

```ts
export type PoseId = string;
export type ClipId = string;

export interface PoseDef {
  label: string;
  idle?: ClipId[];
  transient?: boolean;
  ground: number;
  centerX: number;
  head: number;
  shadow?: boolean;
  draggable?: boolean;
  asleep?: boolean;
  stay?: number;
  autoWeight?: number;
}

export interface ClipDef { file: string; rate?: number }
export interface EdgeDef { from: PoseId; to: PoseId; clip?: ClipId; fade?: number }

export type LineSet = string[];
export interface PoseLines { default: LineSet; [pose: string]: LineSet }
export interface ReminderLines { default: string; [pose: string]: string }
export type ReminderType = 'water' | 'stretch' | 'eyes';

export interface PackLines {
  greet: LineSet;
  click: PoseLines;
  drag: LineSet;
  noDrag: LineSet;
  command: Record<PoseId, string>;
  reminders: Record<ReminderType, ReminderLines>;
}

export interface Command { label: string; pose: PoseId }

export interface Pack {
  schemaVersion: 1;
  id: string;
  name: string;
  personality: string;
  portrait: string;
  frame: { aspect: number; displayHeight: number };
  start: PoseId;
  poses: Record<PoseId, PoseDef>;
  clips: Record<ClipId, ClipDef>;
  edges: EdgeDef[];
  lines: PackLines;
  clickHeart: boolean;
  commands: Command[];
}
```

- [ ] **Step 8: 寫格式檢查** `src/shared/pack.ts`

```ts
import type { Pack, ReminderType } from './types';

export const REMINDER_TYPES: ReminderType[] = ['water', 'stretch', 'eyes'];

export interface ParseResult { pack: Pack | null; errors: string[] }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.length > 0 && v.every(isStr);

/** Structural check of a parsed pack.json. Graph and file rules live in validatePack. */
export function parsePack(raw: unknown): ParseResult {
  const errors: string[] = [];
  const err = (m: string) => { errors.push(m); };
  if (!isObj(raw)) return { pack: null, errors: ['pack.json 不是一個物件'] };

  if (raw.schemaVersion !== 1) err(`不支援的 schemaVersion：${String(raw.schemaVersion)}`);
  for (const k of ['id', 'name', 'personality', 'portrait', 'start'] as const) if (!isStr(raw[k])) err(`缺少或錯誤的欄位：${k}`);

  const frame = raw.frame;
  if (!isObj(frame) || !isNum(frame.aspect) || frame.aspect <= 0 || !isNum(frame.displayHeight) || frame.displayHeight <= 0) {
    err('frame 需要正數的 aspect 和 displayHeight');
  }

  const poses = raw.poses;
  if (!isObj(poses) || Object.keys(poses).length === 0) err('poses 至少要有一個姿勢');
  else for (const [id, p] of Object.entries(poses)) {
    if (!isObj(p)) { err(`姿勢 ${id} 不是物件`); continue; }
    if (!isStr(p.label)) err(`姿勢 ${id} 缺少 label`);
    for (const k of ['ground', 'centerX', 'head'] as const) {
      if (!isNum(p[k]) || (p[k] as number) < 0 || (p[k] as number) > 1) err(`姿勢 ${id} 的 ${k} 要在 0 到 1 之間`);
    }
    if (p.idle !== undefined && !isStrArr(p.idle)) err(`姿勢 ${id} 的 idle 要是片段名稱的陣列`);
    for (const k of ['transient', 'shadow', 'draggable', 'asleep'] as const) {
      if (p[k] !== undefined && typeof p[k] !== 'boolean') err(`姿勢 ${id} 的 ${k} 要是 true 或 false`);
    }
    for (const k of ['stay', 'autoWeight'] as const) {
      if (p[k] !== undefined && (!isNum(p[k]) || (p[k] as number) < 0)) err(`姿勢 ${id} 的 ${k} 要是非負數`);
    }
    if (isNum(p.stay) && p.stay > 1) err(`姿勢 ${id} 的 stay 不能大於 1`);
  }

  const clips = raw.clips;
  if (!isObj(clips)) err('缺少 clips');
  else for (const [id, c] of Object.entries(clips)) {
    if (!isObj(c) || !isStr(c.file)) err(`片段 ${id} 缺少 file`);
    else if (c.rate !== undefined && (!isNum(c.rate) || c.rate <= 0)) err(`片段 ${id} 的 rate 要是正數`);
  }

  if (!Array.isArray(raw.edges)) err('缺少 edges');
  else raw.edges.forEach((e, i) => {
    if (!isObj(e) || !isStr(e.from) || !isStr(e.to)) { err(`第 ${i + 1} 條轉換缺少 from／to`); return; }
    const hasClip = e.clip !== undefined;
    const hasFade = e.fade !== undefined;
    if (hasClip === hasFade) err(`轉換 ${e.from}→${e.to} 要剛好有 clip 或 fade 其中一個`);
    if (hasClip && !isStr(e.clip)) err(`轉換 ${e.from}→${e.to} 的 clip 要是片段名稱`);
    if (hasFade && (!isNum(e.fade) || e.fade <= 0)) err(`轉換 ${e.from}→${e.to} 的 fade 要是正數秒數`);
  });

  const lines = raw.lines;
  if (!isObj(lines)) err('缺少 lines');
  else {
    for (const k of ['greet', 'drag', 'noDrag'] as const) if (!isStrArr(lines[k])) err(`lines.${k} 要是至少一句台詞的陣列`);
    if (!isObj(lines.click) || !isStrArr(lines.click.default)) err('lines.click.default 要是至少一句台詞的陣列');
    if (!isObj(lines.command)) err('缺少 lines.command');
    if (!isObj(lines.reminders)) err('缺少 lines.reminders');
    else for (const t of REMINDER_TYPES) {
      const r = lines.reminders[t];
      if (!isObj(r) || !isStr(r.default)) err(`lines.reminders.${t}.default 要是一句台詞`);
    }
  }

  if (typeof raw.clickHeart !== 'boolean') err('clickHeart 要是 true 或 false');
  if (!Array.isArray(raw.commands)) err('缺少 commands');
  else raw.commands.forEach((c, i) => { if (!isObj(c) || !isStr(c.label) || !isStr(c.pose)) err(`第 ${i + 1} 個指令缺少 label／pose`); });

  return errors.length ? { pack: null, errors } : { pack: raw as unknown as Pack, errors };
}
```

- [ ] **Step 9: 執行測試和型別檢查，確認通過**

Run: `npx vitest run tests/unit/pack.test.ts && npx tsc --noEmit`
Expected: 7 tests PASS，tsc 沒有錯誤

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore scripts/build.mjs src/shared tests
git commit -m "Scaffold the project and parse pet pack files

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 姿勢圖找路

**Files:**
- Create: `src/shared/graph.ts`
- Test: `tests/unit/graph.test.ts`

**Interfaces:**
- Consumes: `Pack, EdgeDef, PoseId, ClipId`（Task 1）
- Produces:
  - `reachable(edges: EdgeDef[], from: PoseId, reverse?: boolean): Set<PoseId>`
  - `findPath(edges: EdgeDef[], from: PoseId, to: PoseId, broken?: ReadonlySet<ClipId>): EdgeDef[] | null`
  - `interface Step { clip: ClipId; from: PoseId; to: PoseId; rate: number; fadeIn: number }`
  - `pathToSteps(pack: Pack, path: EdgeDef[]): { steps: Step[]; pendingFade: number }`（連續的淡入淡出邊合併到下一段片段的 `fadeIn`；路徑最後剩下的淡化放在 `pendingFade`）
  - `idleStep(pack: Pack, pose: PoseId, clip: ClipId, fadeIn?: number): Step`

- [ ] **Step 1: 寫會失敗的測試** `tests/unit/graph.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { reachable, findPath, pathToSteps, idleStep } from '../../src/shared/graph';
import { makePack } from './fixtures';

const pack = makePack();

describe('findPath', () => {
  it('goes through a fade edge to reach a prop pose', () => {
    const path = findPath(pack.edges, 'rest', 'perch')!;
    expect(path.map(e => `${e.from}>${e.to}`)).toEqual(['rest>restProp', 'restProp>perch']);
  });
  it('returns an empty path when already there', () => {
    expect(findPath(pack.edges, 'sit', 'sit')).toEqual([]);
  });
  it('returns null when a broken clip blocks the only way', () => {
    expect(findPath(pack.edges, 'rest', 'perch', new Set(['go_perch']))).toBeNull();
  });
  it('returns null for an unknown target', () => {
    expect(findPath(pack.edges, 'rest', 'moon')).toBeNull();
  });
});

describe('reachable', () => {
  it('walks forwards and backwards', () => {
    expect([...reachable(pack.edges, 'rest')].sort()).toEqual(['perch', 'rest', 'restProp', 'sit']);
    expect(reachable(pack.edges, 'perch', true).has('rest')).toBe(true);
  });
});

describe('pathToSteps', () => {
  it('folds a leading fade into the next clip', () => {
    const { steps, pendingFade } = pathToSteps(pack, findPath(pack.edges, 'rest', 'perch')!);
    expect(steps).toEqual([{ clip: 'go_perch', from: 'restProp', to: 'perch', rate: 0.8, fadeIn: 0.5 }]);
    expect(pendingFade).toBe(0);
  });
  it('returns a trailing fade as pendingFade', () => {
    const { steps, pendingFade } = pathToSteps(pack, findPath(pack.edges, 'perch', 'rest')!);
    expect(steps).toEqual([{ clip: 'leave_perch', from: 'perch', to: 'restProp', rate: 1, fadeIn: 0 }]);
    expect(pendingFade).toBe(0.5);
  });
  it('builds idle steps', () => {
    expect(idleStep(pack, 'sit', 'idle_sit', 0.5)).toEqual({ clip: 'idle_sit', from: 'sit', to: 'sit', rate: 1, fadeIn: 0.5 });
  });
});
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `npx vitest run tests/unit/graph.test.ts`
Expected: FAIL（找不到 `../../src/shared/graph`）

- [ ] **Step 3: 實作** `src/shared/graph.ts`

```ts
import type { ClipId, EdgeDef, Pack, PoseId } from './types';

export interface Step { clip: ClipId; from: PoseId; to: PoseId; rate: number; fadeIn: number }

export function reachable(edges: EdgeDef[], from: PoseId, reverse = false): Set<PoseId> {
  const seen = new Set<PoseId>([from]);
  const queue = [from];
  while (queue.length) {
    const p = queue.shift()!;
    for (const e of edges) {
      const [a, b] = reverse ? [e.to, e.from] : [e.from, e.to];
      if (a === p && !seen.has(b)) { seen.add(b); queue.push(b); }
    }
  }
  return seen;
}

/** Shortest path (fewest edges) that avoids edges whose clip is broken. */
export function findPath(edges: EdgeDef[], from: PoseId, to: PoseId, broken: ReadonlySet<ClipId> = new Set()): EdgeDef[] | null {
  if (from === to) return [];
  const prev = new Map<PoseId, EdgeDef | null>([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const p = queue.shift()!;
    for (const e of edges) {
      if (e.from !== p || prev.has(e.to) || (e.clip !== undefined && broken.has(e.clip))) continue;
      prev.set(e.to, e);
      if (e.to === to) {
        const path: EdgeDef[] = [];
        let x: EdgeDef | null = e;
        while (x) { path.unshift(x); x = prev.get(x.from) ?? null; }
        return path;
      }
      queue.push(e.to);
    }
  }
  return null;
}

export function pathToSteps(pack: Pack, path: EdgeDef[]): { steps: Step[]; pendingFade: number } {
  const steps: Step[] = [];
  let fade = 0;
  for (const e of path) {
    if (e.fade !== undefined) { fade += e.fade; continue; }
    const clip = e.clip!;
    steps.push({ clip, from: e.from, to: e.to, rate: pack.clips[clip].rate ?? 1, fadeIn: fade });
    fade = 0;
  }
  return { steps, pendingFade: fade };
}

export function idleStep(pack: Pack, pose: PoseId, clip: ClipId, fadeIn = 0): Step {
  return { clip, from: pose, to: pose, rate: pack.clips[clip].rate ?? 1, fadeIn };
}
```

- [ ] **Step 4: 執行測試，確認通過**

Run: `npx vitest run tests/unit/graph.test.ts`
Expected: 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/graph.ts tests/unit/graph.test.ts
git commit -m "Add pose-graph path finding

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 寵物包規則檢查

**Files:**
- Create: `src/shared/validate.ts`
- Test: `tests/unit/validate.test.ts`

**Interfaces:**
- Consumes: `Pack`（Task 1）、`reachable`（Task 2）
- Produces: `validatePack(pack: Pack, fileExists: (relPath: string) => boolean): string[]`（規格 5.2 的第 2～6 條；回傳空陣列代表通過）

- [ ] **Step 1: 寫會失敗的測試** `tests/unit/validate.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { validatePack } from '../../src/shared/validate';
import { makePack } from './fixtures';

const allFiles = () => true;

describe('validatePack', () => {
  it('passes the test pack', () => {
    expect(validatePack(makePack(), allFiles)).toEqual([]);
  });
  it('reports missing files', () => {
    const e = validatePack(makePack(), f => f !== 'clips/go_perch.webm' && f !== 'portrait.png');
    expect(e).toContain('找不到頭像檔：portrait.png');
    expect(e).toContain('找不到片段 go_perch 的檔案：clips/go_perch.webm');
  });
  it('reports clips used but not defined', () => {
    const p = makePack(); p.poses.sit.idle = ['idle_nope'];
    expect(validatePack(p, allFiles)).toContain('姿勢 sit 用到未定義的片段：idle_nope');
  });
  it('needs an idle on every pose that is not transient', () => {
    const p = makePack(); delete p.poses.sit.idle;
    expect(validatePack(p, allFiles)).toContain('姿勢 sit 沒有待機片段');
  });
  it('needs a way out of a transient pose', () => {
    const p = makePack(); p.edges = p.edges.filter(e => e.from !== 'restProp');
    expect(validatePack(p, allFiles)).toContain('過渡姿勢 restProp 沒有往外的轉換');
  });
  it('rejects a transient start pose', () => {
    const p = makePack(); p.start = 'restProp';
    expect(validatePack(p, allFiles)).toContain('起始姿勢不能是過渡姿勢：restProp');
  });
  it('finds poses that cannot be reached or cannot get back', () => {
    const p = makePack();
    p.poses.island = { label: '孤島', idle: ['idle_sit'], ground: 0.9, centerX: 0.5, head: 0.4 };
    p.edges.push({ from: 'island', to: 'rest', clip: 'sit_to_rest' });
    const e = validatePack(p, allFiles);
    expect(e).toContain('從 rest 走不到姿勢 island');
    expect(e).not.toContain('姿勢 island 走不回 rest');
  });
  it('checks commands', () => {
    const p = makePack(); p.commands.push({ label: '道具', pose: 'restProp' }, { label: '月球', pose: 'moon' });
    const e = validatePack(p, allFiles);
    expect(e).toContain('指令「道具」不能指到過渡姿勢：restProp');
    expect(e).toContain('指令「月球」指到不存在的姿勢：moon');
  });
});
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `npx vitest run tests/unit/validate.test.ts`
Expected: FAIL（找不到 `../../src/shared/validate`）

- [ ] **Step 3: 實作** `src/shared/validate.ts`

```ts
import { reachable } from './graph';
import type { Pack } from './types';

/** Spec 5.2 rules 2-6: files, clips, idles, transient poses, reachability, commands. */
export function validatePack(pack: Pack, fileExists: (relPath: string) => boolean): string[] {
  const errors: string[] = [];
  const poseIds = new Set(Object.keys(pack.poses));

  if (!fileExists(pack.portrait)) errors.push(`找不到頭像檔：${pack.portrait}`);
  for (const [id, c] of Object.entries(pack.clips)) if (!fileExists(c.file)) errors.push(`找不到片段 ${id} 的檔案：${c.file}`);

  const needClip = (clip: string, where: string) => { if (!pack.clips[clip]) errors.push(`${where} 用到未定義的片段：${clip}`); };
  let graphOk = true;
  for (const e of pack.edges) {
    for (const p of [e.from, e.to]) if (!poseIds.has(p)) { errors.push(`轉換 ${e.from}→${e.to} 用到不存在的姿勢：${p}`); graphOk = false; }
    if (e.clip) needClip(e.clip, `轉換 ${e.from}→${e.to}`);
  }

  for (const [id, p] of Object.entries(pack.poses)) {
    for (const c of p.idle ?? []) needClip(c, `姿勢 ${id}`);
    if (p.transient) {
      if (!pack.edges.some(e => e.from === id)) errors.push(`過渡姿勢 ${id} 沒有往外的轉換`);
    } else if (!p.idle?.length) {
      errors.push(`姿勢 ${id} 沒有待機片段`);
    }
  }

  const start = pack.poses[pack.start];
  if (!start) { errors.push(`起始姿勢不存在：${pack.start}`); graphOk = false; }
  else if (start.transient) errors.push(`起始姿勢不能是過渡姿勢：${pack.start}`);

  if (graphOk) {
    const fwd = reachable(pack.edges, pack.start);
    const back = reachable(pack.edges, pack.start, true);
    for (const id of poseIds) {
      if (!fwd.has(id)) errors.push(`從 ${pack.start} 走不到姿勢 ${id}`);
      if (!back.has(id)) errors.push(`姿勢 ${id} 走不回 ${pack.start}`);
    }
  }

  for (const c of pack.commands) {
    const p = pack.poses[c.pose];
    if (!p) errors.push(`指令「${c.label}」指到不存在的姿勢：${c.pose}`);
    else if (p.transient) errors.push(`指令「${c.label}」不能指到過渡姿勢：${c.pose}`);
  }
  return errors;
}
```

- [ ] **Step 4: 執行測試，確認通過**

Run: `npx vitest run tests/unit/validate.test.ts`
Expected: 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/validate.ts tests/unit/validate.test.ts
git commit -m "Validate pet packs: files, idles, reachability and commands

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 行為引擎、姿勢幾何與台詞

**Files:**
- Create: `src/shared/behavior.ts`、`src/shared/pose-geometry.ts`、`src/shared/lines.ts`
- Test: `tests/unit/behavior.test.ts`、`tests/unit/pose-geometry.test.ts`、`tests/unit/lines.test.ts`

**Interfaces:**
- Consumes: `Pack, PoseId, ClipId, ReminderType`（Task 1）；`findPath, pathToSteps, idleStep, Step`（Task 2）
- Produces:
  - `type Rng = () => number`
  - `class BehaviorEngine`：`constructor(pack: Pack, rng: Rng)`；`auto: boolean`；`get endPose(): PoseId`（目前這段播完後的姿勢）；`get currentStep(): Step | null`；`start(): Step`；`next(): Step`（目前這段播完時呼叫）；`command(target: PoseId): boolean`；`markBroken(clip: ClipId): void`；`upcomingClips(): ClipId[]`
  - `type PoseKey = 'ground' | 'centerX' | 'head'`；`smooth(k: number): number`；`poseValueAt(pack: Pack, step: Step | null, progress: number, key: PoseKey): number`；`showsShadow(pack: Pack, step: Step | null): boolean`；`isAsleep(pack: Pack, pose: PoseId): boolean`
  - `pickLine(lines: string[], rng: Rng): string`；`clickLine(pack: Pack, pose: PoseId, rng: Rng): string`；`commandLine(pack: Pack, pose: PoseId): string | null`；`reminderLine(pack: Pack, type: ReminderType, pose: PoseId): string`

- [ ] **Step 1: 寫會失敗的測試** `tests/unit/behavior.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { BehaviorEngine } from '../../src/shared/behavior';
import { makePack, constRng } from './fixtures';

describe('BehaviorEngine', () => {
  it('starts with an idle of the start pose', () => {
    const e = new BehaviorEngine(makePack(), constRng(0));
    expect(e.start()).toEqual({ clip: 'idle_rest', from: 'rest', to: 'rest', rate: 1, fadeIn: 0 });
    expect(e.endPose).toBe('rest');
  });

  it('only loops idles when auto is off', () => {
    const e = new BehaviorEngine(makePack(), constRng(0.99));
    e.auto = false; e.start();
    for (let i = 0; i < 5; i++) expect(e.next().to).toBe('rest');
  });

  it('stays when the roll is below stay', () => {
    const e = new BehaviorEngine(makePack(), constRng(0)); e.start();
    expect(e.next()).toMatchObject({ from: 'rest', to: 'rest' });
  });

  it('moves to a weighted target when the roll is above stay', () => {
    // rng 0.99: leave rest (0.99 >= 0.7); targets perch(2) + sit(1): 0.99*3 = 2.97 lands on sit
    const e = new BehaviorEngine(makePack(), constRng(0.99)); e.start();
    expect(e.next().clip).toBe('rest_to_sit');
    expect(e.next()).toMatchObject({ clip: 'idle_sit', from: 'sit', to: 'sit' });
  });

  it('walks a command through the fade edge', () => {
    const e = new BehaviorEngine(makePack(), constRng(0)); e.start();
    expect(e.command('perch')).toBe(true);
    expect(e.next()).toEqual({ clip: 'go_perch', from: 'restProp', to: 'perch', rate: 0.8, fadeIn: 0.5 });
    expect(e.next()).toMatchObject({ clip: 'idle_perch', fadeIn: 0 });
    expect(e.command('rest')).toBe(true);
    expect(e.next()).toMatchObject({ clip: 'leave_perch', fadeIn: 0 });
    expect(e.next()).toMatchObject({ clip: 'idle_rest', fadeIn: 0.5 });
  });

  it('plans a command from the pose after the current clip', () => {
    const e = new BehaviorEngine(makePack(), constRng(0)); e.start();
    e.command('perch'); e.next();                        // now playing go_perch
    e.command('sit');                                    // replaces the queued idle_perch
    expect(e.next().clip).toBe('leave_perch');
    expect(e.next()).toMatchObject({ clip: 'rest_to_sit', fadeIn: 0.5 });
    expect(e.next().clip).toBe('idle_sit');
  });

  it('avoids broken clips', () => {
    const e = new BehaviorEngine(makePack(), constRng(0)); e.start();
    e.markBroken('go_perch');
    expect(e.command('perch')).toBe(false);
    expect(e.next().to).toBe('rest');
  });

  it('lists clips worth preloading', () => {
    const e = new BehaviorEngine(makePack(), constRng(0)); e.start();
    expect(e.upcomingClips().sort()).toEqual(['go_perch', 'idle_rest', 'idle_rest2', 'rest_to_sit']);
  });
});
```

`tests/unit/pose-geometry.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { poseValueAt, showsShadow, isAsleep, smooth } from '../../src/shared/pose-geometry';
import { makePack } from './fixtures';

const pack = makePack();
const goPerch = { clip: 'go_perch', from: 'restProp', to: 'perch', rate: 0.8, fadeIn: 0.5 };

describe('pose geometry', () => {
  it('uses the start pose before anything plays', () => {
    expect(poseValueAt(pack, null, 0, 'centerX')).toBe(0.34);
  });
  it('eases between poses during a transition', () => {
    expect(smooth(0.5)).toBe(0.5);
    expect(poseValueAt(pack, goPerch, 0, 'centerX')).toBe(0.34);
    expect(poseValueAt(pack, goPerch, 0.5, 'centerX')).toBeCloseTo(0.545);
    expect(poseValueAt(pack, goPerch, 1, 'centerX')).toBe(0.75);
  });
  it('shows a shadow only when both ends have one', () => {
    expect(showsShadow(pack, null)).toBe(true);
    expect(showsShadow(pack, goPerch)).toBe(false);
  });
  it('knows asleep poses', () => {
    expect(isAsleep(pack, 'perch')).toBe(true);
    expect(isAsleep(pack, 'rest')).toBe(false);
  });
});
```

`tests/unit/lines.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { pickLine, clickLine, commandLine, reminderLine } from '../../src/shared/lines';
import { makePack, constRng } from './fixtures';

const pack = makePack();

describe('lines', () => {
  it('picks by rng and never runs past the end', () => {
    expect(pickLine(['a', 'b'], constRng(0))).toBe('a');
    expect(pickLine(['a', 'b'], constRng(0.999999))).toBe('b');
    expect(pickLine(['a', 'b'], constRng(1))).toBe('b');
  });
  it('uses pose-specific click lines with a default', () => {
    expect(clickLine(pack, 'perch', constRng(0))).toBe('zzz');
    expect(clickLine(pack, 'sit', constRng(0))).toBe('……');
  });
  it('returns command and reminder lines', () => {
    expect(commandLine(pack, 'perch')).toBe('（盯）');
    expect(commandLine(pack, 'sit')).toBeNull();
    expect(reminderLine(pack, 'water', 'perch')).toBe('（夢中）喝水。');
    expect(reminderLine(pack, 'eyes', 'perch')).toBe('休息眼睛。');
  });
});
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `npx vitest run tests/unit/behavior.test.ts tests/unit/pose-geometry.test.ts tests/unit/lines.test.ts`
Expected: FAIL（找不到三個模組）

- [ ] **Step 3: 實作** `src/shared/behavior.ts`

```ts
import { findPath, idleStep, pathToSteps, type Step } from './graph';
import type { ClipId, Pack, PoseId } from './types';

export type Rng = () => number;

const DEFAULT_STAY = 0.6;

/** Decides which clip plays next. The player calls next() exactly when the current clip ends. */
export class BehaviorEngine {
  auto = true;
  private queue: Step[] = [];
  private current: Step | null = null;
  private readonly broken = new Set<ClipId>();

  constructor(private readonly pack: Pack, private readonly rng: Rng) {}

  get endPose(): PoseId { return this.current ? this.current.to : this.pack.start; }
  get currentStep(): Step | null { return this.current; }

  start(): Step {
    this.queue = [];
    return this.take(this.idleOf(this.pack.start, 0));
  }

  next(): Step {
    const queued = this.queue.shift();
    if (queued) return this.take(queued);
    const pose = this.endPose;
    const def = this.pack.poses[pose];
    if (def.transient) {
      if (this.plan(this.pack.start)) return this.take(this.queue.shift()!);
      return this.take(this.current!);   // stuck on a transient pose: replay the last clip rather than crash
    }
    if (!this.auto || this.rng() < (def.stay ?? DEFAULT_STAY)) return this.take(this.idleOf(pose, 0));
    const target = this.pickTarget(pose);
    if (target && this.plan(target)) return this.take(this.queue.shift()!);
    return this.take(this.idleOf(pose, 0));
  }

  /** Replace whatever was queued with the shortest way to `target`, starting after the current clip. */
  command(target: PoseId): boolean {
    this.queue = [];
    return this.plan(target);
  }

  markBroken(clip: ClipId): void {
    this.broken.add(clip);
    this.queue = [];
  }

  upcomingClips(): ClipId[] {
    const out = new Set<ClipId>();
    for (const s of this.queue.slice(0, 2)) out.add(s.clip);
    const add = (pose: PoseId, depth: number) => {
      for (const c of this.pack.poses[pose].idle ?? []) out.add(c);
      for (const e of this.pack.edges) {
        if (e.from !== pose) continue;
        if (e.clip) out.add(e.clip);
        else if (depth < 2) add(e.to, depth + 1);
      }
    };
    add(this.endPose, 0);
    return [...out];
  }

  private take(step: Step): Step { this.current = step; return step; }

  private plan(target: PoseId): boolean {
    const path = findPath(this.pack.edges, this.endPose, target, this.broken);
    if (!path) return false;
    const { steps, pendingFade } = pathToSteps(this.pack, path);
    this.queue.push(...steps, this.idleOf(target, pendingFade));
    return true;
  }

  private idleOf(pose: PoseId, fadeIn: number): Step {
    const all = this.pack.poses[pose].idle ?? [];
    const ok = all.filter(c => !this.broken.has(c));
    const pool = ok.length ? ok : all;
    const clip = pool[Math.min(pool.length - 1, Math.floor(this.rng() * pool.length))];
    return idleStep(this.pack, pose, clip, fadeIn);
  }

  private pickTarget(pose: PoseId): PoseId | null {
    const candidates = Object.entries(this.pack.poses)
      .filter(([id, p]) => id !== pose && !p.transient && (p.autoWeight ?? 1) > 0)
      .filter(([id]) => findPath(this.pack.edges, pose, id, this.broken) !== null);
    if (!candidates.length) return null;
    const total = candidates.reduce((s, [, p]) => s + (p.autoWeight ?? 1), 0);
    let r = this.rng() * total;
    for (const [id, p] of candidates) {
      r -= p.autoWeight ?? 1;
      if (r < 0) return id;
    }
    return candidates[candidates.length - 1][0];
  }
}
```

- [ ] **Step 4: 實作** `src/shared/pose-geometry.ts`

```ts
import type { Step } from './graph';
import type { Pack, PoseId } from './types';

export type PoseKey = 'ground' | 'centerX' | 'head';

export const smooth = (k: number): number => k * k * (3 - 2 * k);

/** A pose value (ground line, body centre, head height) eased from one pose to the next while a transition plays. */
export function poseValueAt(pack: Pack, step: Step | null, progress: number, key: PoseKey): number {
  if (!step) return pack.poses[pack.start][key];
  const a = pack.poses[step.from][key];
  const b = pack.poses[step.to][key];
  if (step.from === step.to) return a;
  return a + (b - a) * smooth(Math.min(1, Math.max(0, progress)));
}

export function showsShadow(pack: Pack, step: Step | null): boolean {
  if (!step) return !!pack.poses[pack.start].shadow;
  return !!pack.poses[step.from].shadow && !!pack.poses[step.to].shadow;
}

export function isAsleep(pack: Pack, pose: PoseId): boolean {
  return !!pack.poses[pose].asleep;
}
```

- [ ] **Step 5: 實作** `src/shared/lines.ts`

```ts
import type { Rng } from './behavior';
import type { Pack, PoseId, ReminderType } from './types';

export function pickLine(lines: string[], rng: Rng): string {
  return lines[Math.min(lines.length - 1, Math.floor(rng() * lines.length))];
}

export function clickLine(pack: Pack, pose: PoseId, rng: Rng): string {
  return pickLine(pack.lines.click[pose] ?? pack.lines.click.default, rng);
}

export function commandLine(pack: Pack, pose: PoseId): string | null {
  return pack.lines.command[pose] ?? null;
}

export function reminderLine(pack: Pack, type: ReminderType, pose: PoseId): string {
  const r = pack.lines.reminders[type];
  return r[pose] ?? r.default;
}
```

- [ ] **Step 6: 執行測試，確認通過**

Run: `npx vitest run tests/unit/behavior.test.ts tests/unit/pose-geometry.test.ts tests/unit/lines.test.ts`
Expected: 15 tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/shared/behavior.ts src/shared/pose-geometry.ts src/shared/lines.ts tests/unit/behavior.test.ts tests/unit/pose-geometry.test.ts tests/unit/lines.test.ts
git commit -m "Add the behaviour engine, pose geometry and lines

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 健康提醒排程

**Files:**
- Create: `src/shared/reminders.ts`
- Test: `tests/unit/reminders.test.ts`

**Interfaces:**
- Consumes: `ReminderType`（Task 1）
- Produces: `type ReminderIntervals = Record<ReminderType, number>`（分鐘，0 = 關閉）；`class ReminderScheduler`：`constructor(intervals: ReminderIntervals, now: number)`、`setIntervals(i: ReminderIntervals, now: number)`、`due(now: number): ReminderType[]`（回傳到期的種類，之後在 `done`／`snooze` 前不會再回傳）、`done(type, now)`、`snooze(type, now, minutes = 10)`、`pause(until: number)`、`resume(now: number)`、`isPaused(now: number): boolean`、`resetAll(now: number)`、`nextAt(type): number`

- [ ] **Step 1: 寫會失敗的測試** `tests/unit/reminders.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { ReminderScheduler } from '../../src/shared/reminders';

const M = 60_000;
const make = () => new ReminderScheduler({ water: 45, stretch: 60, eyes: 0 }, 0);

describe('ReminderScheduler', () => {
  it('fires each type after its interval and waits for an answer', () => {
    const s = make();
    expect(s.due(44 * M)).toEqual([]);
    expect(s.due(45 * M)).toEqual(['water']);
    expect(s.due(50 * M)).toEqual([]);
    expect(s.due(60 * M)).toEqual(['stretch']);
  });
  it('never fires a reminder set to 0', () => {
    expect(make().due(1000 * M)).not.toContain('eyes');
  });
  it('restarts after done and waits 10 minutes after snooze', () => {
    const s = make();
    s.due(45 * M);
    s.done('water', 50 * M);
    expect(s.nextAt('water')).toBe(95 * M);
    s.due(60 * M);
    s.snooze('stretch', 60 * M);
    expect(s.nextAt('stretch')).toBe(70 * M);
  });
  it('holds everything while paused and restarts timers when the pause ends', () => {
    const s = make();
    s.pause(60 * M);
    expect(s.isPaused(50 * M)).toBe(true);
    expect(s.due(50 * M)).toEqual([]);
    expect(s.due(61 * M)).toEqual([]);            // pause just ended: timers restart from 61 min
    expect(s.due(105 * M)).toEqual([]);
    expect(s.due(106 * M)).toEqual(['water']);
  });
  it('resume ends a pause early', () => {
    const s = make();
    s.pause(999 * M);
    s.resume(10 * M);
    expect(s.isPaused(10 * M)).toBe(false);
    expect(s.nextAt('water')).toBe(55 * M);
  });
  it('resetAll restarts every timer (after sleep or unlock)', () => {
    const s = make();
    s.resetAll(30 * M);
    expect(s.nextAt('water')).toBe(75 * M);
    expect(s.nextAt('stretch')).toBe(90 * M);
  });
  it('setIntervals only restarts the timers that changed', () => {
    const s = make();
    s.setIntervals({ water: 45, stretch: 30, eyes: 90 }, 20 * M);
    expect(s.nextAt('water')).toBe(45 * M);
    expect(s.nextAt('stretch')).toBe(50 * M);
    expect(s.nextAt('eyes')).toBe(110 * M);
  });
});
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `npx vitest run tests/unit/reminders.test.ts`
Expected: FAIL（找不到 `../../src/shared/reminders`）

- [ ] **Step 3: 實作** `src/shared/reminders.ts`

```ts
import type { ReminderType } from './types';

export type ReminderIntervals = Record<ReminderType, number>;

const TYPES: ReminderType[] = ['water', 'stretch', 'eyes'];
const MIN = 60_000;

/** Pure reminder timing: the caller passes the clock in, so tests control time. */
export class ReminderScheduler {
  private intervals: ReminderIntervals;
  private readonly next: Record<ReminderType, number> = { water: Infinity, stretch: Infinity, eyes: Infinity };
  private pausedUntil = 0;

  constructor(intervals: ReminderIntervals, now: number) {
    this.intervals = { ...intervals };
    this.resetAll(now);
  }

  setIntervals(intervals: ReminderIntervals, now: number): void {
    for (const t of TYPES) {
      if (intervals[t] === this.intervals[t]) continue;
      this.intervals[t] = intervals[t];
      this.restart(t, now);
    }
  }

  due(now: number): ReminderType[] {
    if (this.pausedUntil) {
      if (now < this.pausedUntil) return [];
      this.pausedUntil = 0;
      this.resetAll(now);
      return [];
    }
    const out = TYPES.filter(t => this.next[t] <= now);
    for (const t of out) this.next[t] = Infinity;   // pending until done() or snooze()
    return out;
  }

  done(type: ReminderType, now: number): void { this.restart(type, now); }
  snooze(type: ReminderType, now: number, minutes = 10): void { this.next[type] = now + minutes * MIN; }
  pause(until: number): void { this.pausedUntil = until; }
  resume(now: number): void { this.pausedUntil = 0; this.resetAll(now); }
  isPaused(now: number): boolean { return this.pausedUntil > now; }
  resetAll(now: number): void { for (const t of TYPES) this.restart(t, now); }
  nextAt(type: ReminderType): number { return this.next[type]; }

  private restart(t: ReminderType, now: number): void {
    this.next[t] = this.intervals[t] > 0 ? now + this.intervals[t] * MIN : Infinity;
  }
}
```

- [ ] **Step 4: 執行測試，確認通過**

Run: `npx vitest run tests/unit/reminders.test.ts`
Expected: 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/reminders.ts tests/unit/reminders.test.ts
git commit -m "Add the health reminder scheduler

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 設定整理與多隻貓的擺放

**Files:**
- Create: `src/shared/settings.ts`、`src/shared/placement.ts`
- Test: `tests/unit/settings.test.ts`、`tests/unit/placement.test.ts`

**Interfaces:**
- Produces:
  - `interface PetSettings { visible: boolean; scale: number; auto: boolean; x: number | null }`（`x` 是身體中心在工作區域的水平比例，`null` = 還沒擺過）
  - `interface ReminderSettings { water: number; stretch: number; eyes: number; notify: boolean; pausedUntil: number | null }`
  - `interface Settings { version: 1; firstRunDone: boolean; autoStart: boolean; pets: Record<string, PetSettings>; petOrder: string[]; reminders: ReminderSettings }`
  - `REMINDER_CHOICES = [0, 30, 45, 60, 90]`；`SIZE_PRESETS = { s: 0.75, m: 1, l: 1.3 }`；`DEFAULT_X = 0.62`
  - `defaultSettings(): Settings`；`normalizeSettings(raw: unknown, packIds: string[]): { settings: Settings; warnings: string[] }`
  - `interface Span { center: number; width: number }`（px）；`findFreeCenter(others: Span[], want: number, width: number, min: number, max: number, step?: number): number`

- [ ] **Step 1: 寫會失敗的測試** `tests/unit/settings.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { defaultSettings, normalizeSettings } from '../../src/shared/settings';

describe('normalizeSettings', () => {
  it('shows only the first cat on a fresh install', () => {
    const { settings } = normalizeSettings(undefined, ['xiaozhao', 'mimi']);
    expect(settings.petOrder).toEqual(['xiaozhao', 'mimi']);
    expect(settings.pets.xiaozhao).toEqual({ visible: true, scale: 1, auto: true, x: null });
    expect(settings.pets.mimi.visible).toBe(false);
    expect(settings.firstRunDone).toBe(false);
    expect(settings.reminders).toEqual(defaultSettings().reminders);
  });
  it('keeps saved values, clamps bad ones and hides newly added cats', () => {
    const raw = { firstRunDone: true, autoStart: false, petOrder: ['gone', 'xiaozhao'],
      pets: { xiaozhao: { visible: true, scale: 9, auto: false, x: 1.4 } },
      reminders: { water: 30, stretch: 17, eyes: 90, notify: false, pausedUntil: 123 } };
    const { settings } = normalizeSettings(raw, ['xiaozhao', 'mimi']);
    expect(settings.petOrder).toEqual(['xiaozhao', 'mimi']);
    expect(settings.pets.xiaozhao).toEqual({ visible: true, scale: 1.5, auto: false, x: 1 });
    expect(settings.pets.mimi.visible).toBe(false);
    expect(settings.autoStart).toBe(false);
    expect(settings.reminders).toEqual({ water: 30, stretch: 60, eyes: 90, notify: false, pausedUntil: 123 });
  });
  it('warns when the file content is not an object', () => {
    expect(normalizeSettings([], ['a']).warnings).toEqual(['設定檔格式不對，已改用預設值']);
  });
});
```

`tests/unit/placement.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { findFreeCenter } from '../../src/shared/placement';

describe('findFreeCenter', () => {
  it('keeps the wanted spot when it is free', () => {
    expect(findFreeCenter([{ center: 100, width: 100 }], 400, 100, 0, 1000)).toBe(400);
  });
  it('moves right past an overlapping cat', () => {
    expect(findFreeCenter([{ center: 400, width: 100 }], 420, 100, 0, 1000)).toBe(500);
  });
  it('tries the left side when the right is full', () => {
    expect(findFreeCenter([{ center: 900, width: 200 }], 950, 100, 0, 1000)).toBe(750);
  });
  it('gives up and overlaps when there is no room at all', () => {
    expect(findFreeCenter([{ center: 50, width: 100 }], 60, 100, 50, 100)).toBe(60);
  });
});
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `npx vitest run tests/unit/settings.test.ts tests/unit/placement.test.ts`
Expected: FAIL（找不到兩個模組）

- [ ] **Step 3: 實作** `src/shared/settings.ts`

```ts
export interface PetSettings { visible: boolean; scale: number; auto: boolean; x: number | null }
export interface ReminderSettings { water: number; stretch: number; eyes: number; notify: boolean; pausedUntil: number | null }
export interface Settings {
  version: 1;
  firstRunDone: boolean;
  autoStart: boolean;
  pets: Record<string, PetSettings>;
  petOrder: string[];
  reminders: ReminderSettings;
}

export const REMINDER_CHOICES = [0, 30, 45, 60, 90];
export const SIZE_PRESETS = { s: 0.75, m: 1, l: 1.3 } as const;
export const DEFAULT_X = 0.62;
export const MIN_SCALE = 0.6;
export const MAX_SCALE = 1.5;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function defaultSettings(): Settings {
  return {
    version: 1, firstRunDone: false, autoStart: true, pets: {}, petOrder: [],
    reminders: { water: 45, stretch: 60, eyes: 0, notify: true, pausedUntil: null },
  };
}

export function normalizeSettings(raw: unknown, packIds: string[]): { settings: Settings; warnings: string[] } {
  const warnings: string[] = [];
  if (raw !== undefined && !isObj(raw)) warnings.push('設定檔格式不對，已改用預設值');
  const r = isObj(raw) ? raw : {};
  const d = defaultSettings();
  const rawPets = isObj(r.pets) ? r.pets : {};
  const fresh = Object.keys(rawPets).length === 0;
  const order = Array.isArray(r.petOrder) ? r.petOrder.filter((x): x is string => typeof x === 'string' && packIds.includes(x)) : [];
  for (const id of packIds) if (!order.includes(id)) order.push(id);

  const settings: Settings = {
    version: 1,
    firstRunDone: typeof r.firstRunDone === 'boolean' ? r.firstRunDone : d.firstRunDone,
    autoStart: typeof r.autoStart === 'boolean' ? r.autoStart : d.autoStart,
    pets: {},
    petOrder: order,
    reminders: normalizeReminders(r.reminders, d.reminders),
  };
  order.forEach((id, i) => { settings.pets[id] = normalizePet(rawPets[id], fresh && i === 0); });
  return { settings, warnings };
}

function normalizePet(raw: unknown, visibleByDefault: boolean): PetSettings {
  const r = isObj(raw) ? raw : {};
  return {
    visible: typeof r.visible === 'boolean' ? r.visible : visibleByDefault,
    scale: finite(r.scale) ? clamp(r.scale, MIN_SCALE, MAX_SCALE) : 1,
    auto: typeof r.auto === 'boolean' ? r.auto : true,
    x: finite(r.x) ? clamp(r.x, 0, 1) : null,
  };
}

function normalizeReminders(raw: unknown, d: ReminderSettings): ReminderSettings {
  const r = isObj(raw) ? raw : {};
  const pick = (v: unknown, dflt: number) => (finite(v) && REMINDER_CHOICES.includes(v) ? v : dflt);
  return {
    water: pick(r.water, d.water),
    stretch: pick(r.stretch, d.stretch),
    eyes: pick(r.eyes, d.eyes),
    notify: typeof r.notify === 'boolean' ? r.notify : d.notify,
    pausedUntil: finite(r.pausedUntil) ? r.pausedUntil : null,
  };
}
```

- [ ] **Step 4: 實作** `src/shared/placement.ts`

```ts
export interface Span { center: number; width: number }

const overlaps = (a: Span, b: Span) => Math.abs(a.center - b.center) < (a.width + b.width) / 2;

/** Nearest body-centre (px) to `want` that does not overlap any other cat: search right, then left, else give up. */
export function findFreeCenter(others: Span[], want: number, width: number, min: number, max: number, step = 10): number {
  const free = (c: number) => !others.some(o => overlaps({ center: c, width }, o));
  const start = Math.min(max, Math.max(min, want));
  if (free(start)) return start;
  for (let c = start + step; c <= max; c += step) if (free(c)) return c;
  for (let c = start - step; c >= min; c -= step) if (free(c)) return c;
  return start;
}
```

- [ ] **Step 5: 執行測試，確認通過**

Run: `npx vitest run tests/unit/settings.test.ts tests/unit/placement.test.ts`
Expected: 7 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/shared/settings.ts src/shared/placement.ts tests/unit/settings.test.ts tests/unit/placement.test.ts
git commit -m "Normalise settings and place cats without overlapping

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 測試寵物包產生器、寵物包載入、檢查指令

**Files:**
- Create: `scripts/make-test-pack.mjs`、`src/main/pack-loader.ts`、`src/cli/check-pack.ts`
- Test: `tests/unit/pack-loader.test.ts`

**Interfaces:**
- Consumes: `parsePack`（Task 1）、`validatePack`（Task 3）
- Produces: `interface LoadedPack { id: string; dir: string; pack: Pack | null; errors: string[] }`；`loadPack(dir: string): LoadedPack`；`loadPacks(packsDir: string): LoadedPack[]`（依資料夾名稱排序）；`npm run check-pack -- <資料夾...>`；`tests/fixtures/packs/testcat`、`testcat2`（320×180 的 1 秒透明影片，畫面裡有一個色塊站在 90% 高的地面線上）

- [ ] **Step 1: 寫測試寵物包產生器** `scripts/make-test-pack.mjs`

```js
import ffmpeg from 'ffmpeg-static';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const base = JSON.parse(readFileSync('tests/fixtures/test-pack.json', 'utf8'));
const colors = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'white'];
const run = args => execFileSync(ffmpeg, ['-y', '-loglevel', 'error', ...args]);

for (const [id, name] of [['testcat', '測試貓'], ['testcat2', '測試貓二號']]) {
  const dir = join('tests/fixtures/packs', id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, 'clips'), { recursive: true });
  writeFileSync(join(dir, 'pack.json'), JSON.stringify({ ...base, id, name }, null, 2));
  Object.values(base.clips).forEach((def, i) => {
    // transparent 320x180 frame with an opaque box standing on the 90% ground line.
    // rgba must be negotiated inside the lavfi graph, or the source drops alpha;
    // replace=1 makes drawbox write the box's alpha instead of keeping the frame's.
    run(['-f', 'lavfi', '-i',
      `color=c=black@0.0:s=320x180:d=1:r=24,format=rgba,drawbox=x=60:y=90:w=100:h=72:color=${colors[i % colors.length]}@1:t=fill:replace=1`,
      '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '40', '-auto-alt-ref', '0', join(dir, def.file)]);
  });
  run(['-f', 'lavfi', '-i', 'color=c=gray:s=128x128', '-frames:v', '1', join(dir, 'portrait.png')]);
}
console.log('test packs written to tests/fixtures/packs');
```

Run: `node scripts/make-test-pack.mjs`
Expected: 印出 `test packs written to tests/fixtures/packs`，兩個資料夾各有 8 個 `.webm` 和 `portrait.png`

- [ ] **Step 2: 寫會失敗的測試** `tests/unit/pack-loader.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { cpSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadPack, loadPacks } from '../../src/main/pack-loader';

const FIXTURES = resolve('tests/fixtures/packs');

function copyPack(id = 'testcat'): string {
  const root = mkdtempSync(join(tmpdir(), 'dpet-pack-'));
  cpSync(join(FIXTURES, id), join(root, id), { recursive: true });
  return join(root, id);
}

describe('pack loader', () => {
  it('loads both test packs in folder order', () => {
    const packs = loadPacks(FIXTURES);
    expect(packs.map(p => [p.id, p.errors])).toEqual([['testcat', []], ['testcat2', []]]);
  });
  it('reports a missing clip file', () => {
    const dir = copyPack();
    rmSync(join(dir, 'clips/go_perch.webm'));
    expect(loadPack(dir).errors).toContain('找不到片段 go_perch 的檔案：clips/go_perch.webm');
  });
  it('reports a folder whose name differs from the pack id', () => {
    const dir = copyPack();
    const json = JSON.parse(readFileSync(join(dir, 'pack.json'), 'utf8'));
    writeFileSync(join(dir, 'pack.json'), JSON.stringify({ ...json, id: 'other' }));
    expect(loadPack(dir).errors).toEqual(['資料夾名稱 testcat 和 pack.json 的 id（other）要一樣']);
  });
  it('reports unreadable json', () => {
    const dir = copyPack();
    writeFileSync(join(dir, 'pack.json'), '{ nope');
    const r = loadPack(dir);
    expect(r.pack).toBeNull();
    expect(r.errors[0]).toMatch(/^讀不到 pack.json：/);
  });
  it('returns nothing for a missing packs folder', () => {
    expect(loadPacks(join(tmpdir(), 'no-such-folder-dpet'))).toEqual([]);
  });
});
```

- [ ] **Step 3: 執行測試，確認失敗**

Run: `npx vitest run tests/unit/pack-loader.test.ts`
Expected: FAIL（找不到 `../../src/main/pack-loader`）

- [ ] **Step 4: 實作** `src/main/pack-loader.ts`

```ts
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parsePack } from '../shared/pack';
import { validatePack } from '../shared/validate';
import type { Pack } from '../shared/types';

export interface LoadedPack { id: string; dir: string; pack: Pack | null; errors: string[] }

export function loadPack(dir: string): LoadedPack {
  const folder = basename(dir);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(join(dir, 'pack.json'), 'utf8'));
  } catch (e) {
    return { id: folder, dir, pack: null, errors: [`讀不到 pack.json：${(e as Error).message}`] };
  }
  const { pack, errors } = parsePack(raw);
  if (!pack) return { id: folder, dir, pack: null, errors };
  if (pack.id !== folder) return { id: folder, dir, pack: null, errors: [`資料夾名稱 ${folder} 和 pack.json 的 id（${pack.id}）要一樣`] };
  const more = validatePack(pack, rel => existsSync(join(dir, rel)));
  return more.length ? { id: folder, dir, pack: null, errors: more } : { id: folder, dir, pack, errors: [] };
}

export function loadPacks(packsDir: string): LoadedPack[] {
  if (!existsSync(packsDir)) return [];
  return readdirSync(packsDir)
    .filter(n => statSync(join(packsDir, n)).isDirectory())
    .sort()
    .map(n => loadPack(join(packsDir, n)));
}
```

- [ ] **Step 5: 實作檢查指令** `src/cli/check-pack.ts`

```ts
import { resolve } from 'node:path';
import { loadPack } from '../main/pack-loader';

const dirs = process.argv.slice(2);
if (!dirs.length) {
  console.error('用法：npm run check-pack -- <寵物包資料夾> [...]');
  process.exit(2);
}
let bad = 0;
for (const d of dirs) {
  const r = loadPack(resolve(d));
  if (r.pack) { console.log(`✓ ${r.id}：沒有問題`); continue; }
  bad++;
  console.log(`✗ ${r.id}：`);
  for (const e of r.errors) console.log(`   - ${e}`);
}
process.exit(bad ? 1 : 0);
```

- [ ] **Step 6: 執行測試、打包、檢查指令**

Run: `npx vitest run tests/unit/pack-loader.test.ts && npm run build && npm run check-pack -- tests/fixtures/packs/testcat`
Expected: 5 tests PASS；最後印出 `✓ testcat：沒有問題`

- [ ] **Step 7: 確認整套單元測試（這時 `npm test` 會先自動產生測試寵物包）**

Run: `npm test`
Expected: 所有測試 PASS

- [ ] **Step 8: Commit**

```bash
git add scripts/make-test-pack.mjs src/main/pack-loader.ts src/cli/check-pack.ts tests/unit/pack-loader.test.ts
git commit -m "Load and check pet packs from disk; generate test packs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 記錄檔與設定檔讀寫

**Files:**
- Create: `src/main/logger.ts`、`src/main/settings-store.ts`
- Test: `tests/unit/logger.test.ts`、`tests/unit/settings-store.test.ts`

**Interfaces:**
- Consumes: `normalizeSettings, Settings`（Task 6）
- Produces:
  - `class Logger`：`constructor(dir: string, keep = 5, now = new Date())`、`readonly file: string`、`info(m)`、`warn(m)`、`error(m)`
  - `class SettingsStore`：`constructor(file: string, log: Logger)`、`load(packIds: string[]): { settings: Settings; warning: string | null }`、`save(s: Settings)`（原子寫入）、`saveSoon(s: Settings, delayMs = 500)`、`flush(s: Settings)`

- [ ] **Step 1: 寫會失敗的測試** `tests/unit/logger.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger } from '../../src/main/logger';

describe('Logger', () => {
  it('writes lines and keeps only the newest files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dpet-log-'));
    let last!: Logger;
    for (let i = 0; i < 7; i++) last = new Logger(dir, 5, new Date(Date.UTC(2026, 8, 27, 10, i)));
    expect(readdirSync(dir).length).toBe(5);
    last.warn('哈囉');
    expect(readFileSync(last.file, 'utf8')).toMatch(/\[WARN\] 哈囉\n$/);
  });
});
```

`tests/unit/settings-store.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger } from '../../src/main/logger';
import { SettingsStore } from '../../src/main/settings-store';

const setup = () => {
  const dir = mkdtempSync(join(tmpdir(), 'dpet-set-'));
  return { dir, file: join(dir, 'settings.json'), store: new SettingsStore(join(dir, 'settings.json'), new Logger(join(dir, 'logs'))) };
};

describe('SettingsStore', () => {
  it('starts from defaults when there is no file, and round-trips', () => {
    const { store } = setup();
    const { settings, warning } = store.load(['testcat']);
    expect(warning).toBeNull();
    settings.pets.testcat.x = 0.3;
    store.save(settings);
    expect(store.load(['testcat']).settings.pets.testcat.x).toBe(0.3);
  });
  it('backs up a broken file and falls back to defaults', () => {
    const { dir, file, store } = setup();
    writeFileSync(file, '{ broken');
    const { settings, warning } = store.load(['testcat']);
    expect(warning).toBe('設定檔損壞，已備份成 settings.bad.json 並改用預設值');
    expect(existsSync(join(dir, 'settings.bad.json'))).toBe(true);
    expect(settings.pets.testcat.visible).toBe(true);
  });
  it('flush writes a pending save immediately', () => {
    const { file, store } = setup();
    const { settings } = store.load(['testcat']);
    settings.autoStart = false;
    store.saveSoon(settings, 10_000);
    store.flush(settings);
    expect(JSON.parse(readFileSync(file, 'utf8')).autoStart).toBe(false);
  });
});
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `npx vitest run tests/unit/logger.test.ts tests/unit/settings-store.test.ts`
Expected: FAIL（找不到兩個模組）

- [ ] **Step 3: 實作** `src/main/logger.ts`

```ts
import { appendFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export class Logger {
  readonly file: string;

  constructor(dir: string, keep = 5, now = new Date()) {
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, `app-${now.toISOString().replace(/[:.]/g, '-')}.log`);
    writeFileSync(this.file, '');
    const logs = readdirSync(dir).filter(f => /^app-.*\.log$/.test(f)).sort();
    for (const f of logs.slice(0, Math.max(0, logs.length - keep))) rmSync(join(dir, f), { force: true });
  }

  info(m: string): void { this.write('INFO', m); }
  warn(m: string): void { this.write('WARN', m); }
  error(m: string): void { this.write('ERROR', m); }

  private write(level: string, m: string): void {
    try { appendFileSync(this.file, `${new Date().toISOString()} [${level}] ${m}\n`); } catch { /* logging must never crash the app */ }
  }
}
```

- [ ] **Step 4: 實作** `src/main/settings-store.ts`

```ts
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { normalizeSettings, type Settings } from '../shared/settings';
import type { Logger } from './logger';

export class SettingsStore {
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly file: string, private readonly log: Logger) {}

  load(packIds: string[]): { settings: Settings; warning: string | null } {
    let raw: unknown;
    let warning: string | null = null;
    if (existsSync(this.file)) {
      try {
        raw = JSON.parse(readFileSync(this.file, 'utf8'));
      } catch (e) {
        renameSync(this.file, this.file.replace(/\.json$/, '.bad.json'));
        warning = '設定檔損壞，已備份成 settings.bad.json 並改用預設值';
        this.log.warn(`${warning}：${(e as Error).message}`);
      }
    }
    const { settings, warnings } = normalizeSettings(raw, packIds);
    for (const w of warnings) this.log.warn(w);
    return { settings, warning: warning ?? warnings[0] ?? null };
  }

  /** Write to a temp file, then rename, so a crash never leaves half a settings file. */
  save(settings: Settings): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(settings, null, 2), 'utf8');
    renameSync(tmp, this.file);
  }

  saveSoon(settings: Settings, delayMs = 500): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; this.save(settings); }, delayMs);
  }

  flush(settings: Settings): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.save(settings);
  }
}
```

- [ ] **Step 5: 執行測試，確認通過**

Run: `npx vitest run tests/unit/logger.test.ts tests/unit/settings-store.test.ts`
Expected: 4 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/logger.ts src/main/settings-store.ts tests/unit/logger.test.ts tests/unit/settings-store.test.ts
git commit -m "Add the log file and atomic settings storage

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: app:// 協定與貓咪視窗的位置計算

**Files:**
- Create: `src/main/app-protocol-core.ts`、`src/main/app-protocol.ts`、`src/main/pet-geometry.ts`
- Test: `tests/unit/app-protocol-core.test.ts`、`tests/unit/pet-geometry.test.ts`

**Interfaces:**
- Consumes: `Pack`（Task 1）
- Produces:
  - `interface AppRoots { ui: string; packs: string }`；`resolveAppPath(pathname: string, roots: AppRoots): string | null`（`/ui/...` 對應畫面檔、`/packs/...` 對應寵物包；擋掉 `..`）；`parseRange(header: string | null, size: number): { start: number; end: number } | null`；`contentType(file: string): string`
  - `SCHEME = 'app'`；`APP_ORIGIN = 'app://local'`；`registerSchemePrivileges()`（app ready 之前呼叫）；`handleAppProtocol(roots: AppRoots)`
  - `interface WorkArea { x: number; y: number; width: number; height: number }`；`type Bounds = WorkArea`；`windowSize(pack, scale): { width; height }`；`restY(pack, scale, wa): number`（視窗停在工作列上時的頂端 y）；`windowBounds(pack, scale, xRatio, wa): Bounds`；`xRatioFromBounds(b: { x: number; width: number }, pack, wa): number`；`bodyWidth(pack, scale): number`（擺放時用的身體寬度：視窗寬的 0.35）

- [ ] **Step 1: 寫會失敗的測試** `tests/unit/app-protocol-core.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { resolveAppPath, parseRange, contentType } from '../../src/main/app-protocol-core';

const roots = { ui: join('C:', 'app', 'dist'), packs: join('C:', 'app', 'packs') };

describe('app protocol helpers', () => {
  it('maps ui and pack paths', () => {
    expect(resolveAppPath('/ui/pet.html', roots)).toBe(join(roots.ui, 'pet.html'));
    expect(resolveAppPath('/packs/xiaozhao/clips/idle_lie.webm', roots)).toBe(join(roots.packs, 'xiaozhao', 'clips', 'idle_lie.webm'));
    expect(resolveAppPath('/packs/%E5%B0%8F/a.png', roots)).toBe(join(roots.packs, '小', 'a.png'));
  });
  it('refuses anything outside the roots', () => {
    expect(resolveAppPath('/ui/../../secret.txt', roots)).toBeNull();
    expect(resolveAppPath('/other/x', roots)).toBeNull();
    expect(resolveAppPath('/ui', roots)).toBeNull();
  });
  it('parses byte ranges', () => {
    expect(parseRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 });
    expect(parseRange('bytes=900-', 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange('bytes=0-5000', 1000)).toEqual({ start: 0, end: 999 });
    expect(parseRange('bytes=2000-', 1000)).toBeNull();
    expect(parseRange(null, 1000)).toBeNull();
  });
  it('knows the content types we serve', () => {
    expect(contentType('a.webm')).toBe('video/webm');
    expect(contentType('a.HTML')).toBe('text/html; charset=utf-8');
    expect(contentType('a.xyz')).toBe('application/octet-stream');
  });
});
```

`tests/unit/pet-geometry.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { windowSize, restY, windowBounds, xRatioFromBounds, bodyWidth } from '../../src/main/pet-geometry';
import { makePack } from './fixtures';

const pack = makePack();                                  // displayHeight 300, aspect 16:9, start centerX 0.34, ground 0.9
const wa = { x: 0, y: 0, width: 1920, height: 1040 };

describe('pet geometry', () => {
  it('sizes the window from the pack and scale', () => {
    expect(windowSize(pack, 1)).toEqual({ width: 533, height: 300 });
    expect(windowSize(pack, 1.3)).toEqual({ width: 693, height: 390 });
  });
  it('puts the ground line on the taskbar', () => {
    expect(restY(pack, 1, wa)).toBe(1040 - 270);
  });
  it('places the body centre at the saved ratio and round-trips it', () => {
    const b = windowBounds(pack, 1, 0.5, wa);
    expect(b).toEqual({ x: 960 - 181, y: 770, width: 533, height: 300 });
    expect(xRatioFromBounds(b, pack, wa)).toBeCloseTo(0.5, 3);
  });
  it('keeps the window inside the work area', () => {
    expect(windowBounds(pack, 1, 0, wa).x).toBe(0);
    expect(windowBounds(pack, 1, 1, wa).x).toBe(1920 - 533);
  });
  it('estimates the body width for placement', () => {
    expect(bodyWidth(pack, 1)).toBeCloseTo(186.55);
  });
});
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `npx vitest run tests/unit/app-protocol-core.test.ts tests/unit/pet-geometry.test.ts`
Expected: FAIL（找不到兩個模組）

- [ ] **Step 3: 實作** `src/main/app-protocol-core.ts`

```ts
import { extname, join, normalize, sep } from 'node:path';

export interface AppRoots { ui: string; packs: string }

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webm': 'video/webm',
  '.png': 'image/png',
};

export function contentType(file: string): string {
  return TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
}

export function resolveAppPath(pathname: string, roots: AppRoots): string | null {
  let parts: string[];
  try { parts = decodeURIComponent(pathname).split('/').filter(Boolean); } catch { return null; }
  const [area, ...rest] = parts;
  const root = area === 'ui' ? roots.ui : area === 'packs' ? roots.packs : null;
  if (!root || rest.length === 0) return null;
  const full = normalize(join(root, ...rest));
  const base = normalize(root.endsWith(sep) ? root : root + sep);
  return full.startsWith(base) ? full : null;
}

export function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start: number;
  let end: number;
  if (m[1] === '') { start = Math.max(0, size - Number(m[2])); end = size - 1; }
  else { start = Number(m[1]); end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1); }
  if (start > end || start >= size) return null;
  return { start, end };
}
```

- [ ] **Step 4: 實作** `src/main/app-protocol.ts`

```ts
import { protocol } from 'electron';
import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { contentType, parseRange, resolveAppPath, type AppRoots } from './app-protocol-core';

export const SCHEME = 'app';
export const APP_ORIGIN = 'app://local';

/** Pages and pack videos share one origin, so the pet window may read video pixels for hit-testing. */
export function registerSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  ]);
}

export function handleAppProtocol(roots: AppRoots): void {
  protocol.handle(SCHEME, req => {
    const file = resolveAppPath(new URL(req.url).pathname, roots);
    if (!file) return new Response('not found', { status: 404 });
    let size: number;
    try {
      const st = statSync(file);
      if (!st.isFile()) return new Response('not found', { status: 404 });
      size = st.size;
    } catch {
      return new Response('not found', { status: 404 });
    }
    const headers: Record<string, string> = { 'Content-Type': contentType(file), 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
    const range = parseRange(req.headers.get('range'), size);
    if (range) {
      headers['Content-Range'] = `bytes ${range.start}-${range.end}/${size}`;
      headers['Content-Length'] = String(range.end - range.start + 1);
      return new Response(Readable.toWeb(createReadStream(file, range)) as ReadableStream, { status: 206, headers });
    }
    headers['Content-Length'] = String(size);
    return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, { status: 200, headers });
  });
}
```

- [ ] **Step 5: 實作** `src/main/pet-geometry.ts`

```ts
import type { Pack } from '../shared/types';

export interface WorkArea { x: number; y: number; width: number; height: number }
export type Bounds = WorkArea;

export function windowSize(pack: Pack, scale: number): { width: number; height: number } {
  const height = Math.round(pack.frame.displayHeight * scale);
  return { width: Math.round(height * pack.frame.aspect), height };
}

/** Window top while the cat stands on the taskbar (the start pose's ground line on the work-area bottom). */
export function restY(pack: Pack, scale: number, wa: WorkArea): number {
  const { height } = windowSize(pack, scale);
  return Math.round(wa.y + wa.height - pack.poses[pack.start].ground * height);
}

/** `xRatio` is where the start pose's body centre sits across the work area. */
export function windowBounds(pack: Pack, scale: number, xRatio: number, wa: WorkArea): Bounds {
  const { width, height } = windowSize(pack, scale);
  const bodyX = wa.x + xRatio * wa.width;
  const x = Math.round(bodyX - pack.poses[pack.start].centerX * width);
  const clamped = Math.min(Math.max(x, wa.x), wa.x + Math.max(0, wa.width - width));
  return { x: clamped, y: restY(pack, scale, wa), width, height };
}

export function xRatioFromBounds(b: { x: number; width: number }, pack: Pack, wa: WorkArea): number {
  const bodyX = b.x + pack.poses[pack.start].centerX * b.width;
  return Math.min(1, Math.max(0, (bodyX - wa.x) / wa.width));
}

export function bodyWidth(pack: Pack, scale: number): number {
  return windowSize(pack, scale).width * 0.35;
}
```

- [ ] **Step 6: 執行測試，確認通過**

Run: `npx vitest run tests/unit/app-protocol-core.test.ts tests/unit/pet-geometry.test.ts && npx tsc --noEmit`
Expected: 9 tests PASS，tsc 沒有錯誤

- [ ] **Step 7: Commit**

```bash
git add src/main/app-protocol-core.ts src/main/app-protocol.ts src/main/pet-geometry.ts tests/unit/app-protocol-core.test.ts tests/unit/pet-geometry.test.ts
git commit -m "Serve pages and packs over app:// and compute pet window bounds

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 第一次跑起來：主程式與貓咪視窗播放

**Files:**
- Create: `src/shared/ipc.ts`、`src/types/global.d.ts`
- Create: `src/main/paths.ts`、`src/main/pet-window.ts`、`src/main/controller.ts`、`src/main/main.ts`、`src/main/preload-pet.ts`
- Create: `src/pet/pet.html`、`src/pet/pet.css`、`src/pet/player.ts`、`src/pet/pet.ts`
- Create: `playwright.config.ts`、`tests/e2e/helpers.ts`
- Test: `tests/e2e/playback.spec.ts`

**Interfaces:**
- Consumes: `loadPacks`（Task 7）、`Logger, SettingsStore`（Task 8）、`APP_ORIGIN, registerSchemePrivileges, handleAppProtocol, windowBounds, restY, xRatioFromBounds, bodyWidth`（Task 9）、`BehaviorEngine`（Task 4）、`poseValueAt, showsShadow`（Task 4）、`findFreeCenter, DEFAULT_X`（Task 6）
- Produces:
  - `interface PetInit { pack: Pack; packUrl: string; auto: boolean; restY: number; debug: boolean }`
  - `interface PetApi`（見 Step 1）；貓咪視窗 IPC 頻道：`pet:init`、`pet:command`、`pet:set-auto`、`pet:reminder`、`pet:pause`、`pet:rest-y`（主程式 → 貓咪）；`pet:ready`、`pet:set-interactive`、`pet:move`、`pet:drag-end`、`pet:menu`、`pet:status`、`pet:reminder-result`、`pet:log`（貓咪 → 主程式）
  - `class PetWindow`：`constructor(pack, bounds, init: Omit<PetInit, 'pack' | 'packUrl'>, events: PetEvents, preloadDir: string)`、`id`、`win`、`handle(channel, args)`、`send(channel, ...args)`、`setBounds(b)`、`close()`
  - `class AppController`：`start()`、`showPet(id)`、`hidePet(id)`、`validPacks()`、`workArea()`；除錯模式時放在 `global.__controller`
  - `class Player`（貓咪視窗）：`constructor(layer: HTMLElement, pack: Pack, packUrl: string)`、`onStepStart`、`onEnded`、`onError`、`step`、`progress`、`video`、`preload(clips)`、`play(step): Promise<void>`、`pause()`、`resume()`
  - 除錯模式時貓咪視窗有 `window.__pet = { id, history: string[], engine, player }`
  - `tests/e2e/helpers.ts`：`launch(env?, userDir?)`、`petPage(app, id)`、`controllerCall(app, fn)`

- [ ] **Step 1: IPC 型別** `src/shared/ipc.ts`

```ts
import type { Pack, PoseId, ReminderType } from './types';

export interface PetInit { pack: Pack; packUrl: string; auto: boolean; restY: number; debug: boolean }
export type ReminderResult = 'done' | 'snooze';
export type LogLevel = 'info' | 'warn' | 'error';

export interface PetApi {
  onInit(cb: (init: PetInit) => void): void;
  onCommand(cb: (pose: PoseId) => void): void;
  onSetAuto(cb: (auto: boolean) => void): void;
  onReminder(cb: (type: ReminderType) => void): void;
  onPause(cb: (paused: boolean) => void): void;
  onRestY(cb: (y: number) => void): void;
  ready(): void;
  setInteractive(interactive: boolean): void;
  moveWindow(x: number, y: number): void;
  dragEnded(): void;
  openMenu(): void;
  reportStatus(poseLabel: string): void;
  reminderResult(type: ReminderType, result: ReminderResult): void;
  log(level: LogLevel, message: string): void;
}

export interface PanelPet {
  id: string; name: string; personality: string; portraitUrl: string | null; errors: string[];
  visible: boolean; scale: number; auto: boolean; status: string; commands: { label: string; pose: PoseId }[];
}
export interface PanelState {
  pets: PanelPet[];
  reminders: { water: number; stretch: number; eyes: number; notify: boolean; pausedUntil: number | null };
  autoStart: boolean;
  version: string;
  warning: string | null;
}
export type PanelAction =
  | { kind: 'pet'; id: string; visible?: boolean; scale?: number; auto?: boolean }
  | { kind: 'command'; id: string; pose: PoseId }
  | { kind: 'reminders'; water?: number; stretch?: number; eyes?: number; notify?: boolean }
  | { kind: 'testReminder' }
  | { kind: 'autoStart'; on: boolean }
  | { kind: 'resetPositions' };
export interface PanelApi {
  getState(): Promise<PanelState>;
  act(action: PanelAction): Promise<PanelState>;
  onState(cb: (s: PanelState) => void): void;
}
```

`src/types/global.d.ts`：

```ts
import type { PanelApi, PetApi } from '../shared/ipc';

declare global {
  interface Window { petApi: PetApi; panelApi: PanelApi }
}
export {};
```

- [ ] **Step 2: 主程式的路徑與 preload**

`src/main/paths.ts`：

```ts
import { app } from 'electron';
import { join, resolve } from 'node:path';

export interface AppPaths { packsDir: string; userDir: string; logsDir: string; settingsFile: string; uiDir: string }

/** Call before app 'ready' (it redirects Chromium's userData too). */
export function resolvePaths(): AppPaths {
  const userDir = process.env.DESKTOP_PET_USERDATA ? resolve(process.env.DESKTOP_PET_USERDATA) : join(app.getPath('appData'), 'desktop-pet');
  app.setPath('userData', userDir);
  const packsDir = process.env.DESKTOP_PET_PACKS
    ? resolve(process.env.DESKTOP_PET_PACKS)
    : app.isPackaged ? join(process.resourcesPath, 'packs') : join(app.getAppPath(), 'packs');
  return { packsDir, userDir, logsDir: join(userDir, 'logs'), settingsFile: join(userDir, 'settings.json'), uiDir: __dirname };
}
```

`src/main/preload-pet.ts`：

```ts
import { contextBridge, ipcRenderer } from 'electron';
import type { PetApi } from '../shared/ipc';

const listen = (channel: string, cb: (...args: any[]) => void) => { ipcRenderer.on(channel, (_e, ...args) => cb(...args)); };

const api: PetApi = {
  onInit: cb => listen('pet:init', cb),
  onCommand: cb => listen('pet:command', cb),
  onSetAuto: cb => listen('pet:set-auto', cb),
  onReminder: cb => listen('pet:reminder', cb),
  onPause: cb => listen('pet:pause', cb),
  onRestY: cb => listen('pet:rest-y', cb),
  ready: () => ipcRenderer.send('pet:ready'),
  setInteractive: interactive => ipcRenderer.send('pet:set-interactive', interactive),
  moveWindow: (x, y) => ipcRenderer.send('pet:move', x, y),
  dragEnded: () => ipcRenderer.send('pet:drag-end'),
  openMenu: () => ipcRenderer.send('pet:menu'),
  reportStatus: label => ipcRenderer.send('pet:status', label),
  reminderResult: (type, result) => ipcRenderer.send('pet:reminder-result', type, result),
  log: (level, message) => ipcRenderer.send('pet:log', level, message),
};
contextBridge.exposeInMainWorld('petApi', api);
```

- [ ] **Step 3: 貓咪視窗** `src/main/pet-window.ts`

```ts
import { BrowserWindow } from 'electron';
import { join } from 'node:path';
import { APP_ORIGIN } from './app-protocol';
import type { Bounds } from './pet-geometry';
import type { LogLevel, PetInit, ReminderResult } from '../shared/ipc';
import type { Pack, ReminderType } from '../shared/types';

export interface PetEvents {
  status(id: string, label: string): void;
  menu(id: string): void;
  dragEnd(id: string): void;
  reminderResult(id: string, type: ReminderType, result: ReminderResult): void;
  crashed(id: string): void;
  log(id: string, level: LogLevel, message: string): void;
}

export class PetWindow {
  readonly win: BrowserWindow;
  private size: { width: number; height: number };

  constructor(readonly pack: Pack, bounds: Bounds, private init: Omit<PetInit, 'pack' | 'packUrl'>,
              private readonly events: PetEvents, preloadDir: string) {
    this.win = new BrowserWindow({
      ...bounds,
      transparent: true, frame: false, resizable: false, alwaysOnTop: true, skipTaskbar: true,
      hasShadow: false, show: false, backgroundColor: '#00000000',
      webPreferences: { preload: join(preloadDir, 'preload-pet.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
    });
    this.size = { width: bounds.width, height: bounds.height };
    // At fractional display scaling Windows creates the window a few pixels too big; setting the bounds again fixes it.
    this.win.setBounds(bounds);
    this.win.setIgnoreMouseEvents(true, { forward: true });
    this.win.webContents.on('render-process-gone', () => events.crashed(pack.id));
    void this.win.loadURL(`${APP_ORIGIN}/ui/pet.html`);
  }

  get id(): string { return this.pack.id; }

  /** Messages from this window's renderer, routed here by the controller. */
  handle(channel: string, args: unknown[]): void {
    switch (channel) {
      case 'pet:ready': {
        const init: PetInit = { ...this.init, pack: this.pack, packUrl: `${APP_ORIGIN}/packs/${this.pack.id}/` };
        this.send('pet:init', init);
        this.win.showInactive();
        break;
      }
      case 'pet:set-interactive': this.win.setIgnoreMouseEvents(!args[0], { forward: true }); break;
      // setBounds with a fixed size: at fractional display scaling each setPosition grows the window by a pixel
      case 'pet:move': this.win.setBounds({ x: Math.round(Number(args[0])), y: Math.round(Number(args[1])), ...this.size }); break;
      case 'pet:drag-end': this.events.dragEnd(this.id); break;
      case 'pet:menu': this.events.menu(this.id); break;
      case 'pet:status': this.events.status(this.id, String(args[0])); break;
      case 'pet:reminder-result': this.events.reminderResult(this.id, args[0] as ReminderType, args[1] as ReminderResult); break;
      case 'pet:log': this.events.log(this.id, args[0] as LogLevel, String(args[1])); break;
    }
  }

  send(channel: string, ...args: unknown[]): void {
    if (!this.win.isDestroyed()) this.win.webContents.send(channel, ...args);
  }

  updateInit(patch: Partial<Omit<PetInit, 'pack' | 'packUrl'>>): void { this.init = { ...this.init, ...patch }; }
  setBounds(b: Bounds): void {
    this.size = { width: b.width, height: b.height };
    if (!this.win.isDestroyed()) this.win.setBounds(b);
  }
  close(): void { if (!this.win.isDestroyed()) this.win.destroy(); }
}
```

- [ ] **Step 4: 控制器（第一版：載入、擺放、顯示／隱藏、拖曳結束、當掉重開）** `src/main/controller.ts`

```ts
import { ipcMain, screen, type WebContents } from 'electron';
import { findFreeCenter } from '../shared/placement';
import { DEFAULT_X, type Settings } from '../shared/settings';
import type { Pack } from '../shared/types';
import type { Logger } from './logger';
import { loadPacks, type LoadedPack } from './pack-loader';
import { bodyWidth, restY, windowBounds, xRatioFromBounds, type WorkArea } from './pet-geometry';
import { PetWindow, type PetEvents } from './pet-window';
import type { AppPaths } from './paths';
import { SettingsStore } from './settings-store';

const PET_CHANNELS = ['pet:ready', 'pet:set-interactive', 'pet:move', 'pet:drag-end', 'pet:menu', 'pet:status', 'pet:reminder-result', 'pet:log'];
const MAX_CRASH_RESTARTS = 3;

type ValidPack = LoadedPack & { pack: Pack };

export class AppController {
  readonly packs: LoadedPack[];
  settings: Settings;
  warning: string | null;
  readonly pets = new Map<string, PetWindow>();
  readonly status = new Map<string, string>();
  protected readonly store: SettingsStore;
  private readonly crashes = new Map<string, number>();

  constructor(protected readonly paths: AppPaths, readonly log: Logger, readonly debug: boolean) {
    this.packs = loadPacks(paths.packsDir);
    for (const p of this.packs) {
      if (p.pack) log.info(`載入寵物包 ${p.id}`);
      else log.warn(`寵物包 ${p.id} 無法使用：${p.errors.join('；')}`);
    }
    this.store = new SettingsStore(paths.settingsFile, log);
    const loaded = this.store.load(this.validPacks().map(p => p.id));
    this.settings = loaded.settings;
    this.warning = loaded.warning;
    for (const ch of PET_CHANNELS) ipcMain.on(ch, (e, ...args) => this.petFor(e.sender)?.handle(ch, args));
  }

  validPacks(): ValidPack[] { return this.packs.filter((p): p is ValidPack => p.pack !== null); }
  packOf(id: string): Pack | null { return this.validPacks().find(p => p.id === id)?.pack ?? null; }
  workArea(): WorkArea { return screen.getPrimaryDisplay().workArea; }

  start(): void {
    for (const id of this.settings.petOrder) if (this.settings.pets[id]?.visible) this.showPet(id);
    this.saveSoon();
  }

  showPet(id: string): void {
    const pack = this.packOf(id);
    if (!pack || this.pets.has(id)) return;
    const ps = this.settings.pets[id];
    const wa = this.workArea();
    const others = [...this.pets.values()].map(w => ({
      center: wa.x + xRatioFromBounds(w.win.getBounds(), w.pack, wa) * wa.width,
      width: bodyWidth(w.pack, this.settings.pets[w.id].scale),
    }));
    const want = wa.x + (ps.x ?? DEFAULT_X) * wa.width;
    const center = findFreeCenter(others, want, bodyWidth(pack, ps.scale), wa.x, wa.x + wa.width);
    ps.x = (center - wa.x) / wa.width;
    ps.visible = true;
    const pet = new PetWindow(pack, windowBounds(pack, ps.scale, ps.x, wa),
      { auto: ps.auto, restY: restY(pack, ps.scale, wa), debug: this.debug }, this.petEvents(), this.paths.uiDir);
    this.pets.set(id, pet);
    this.saveSoon();
    this.changed();
  }

  hidePet(id: string): void {
    this.pets.get(id)?.close();
    this.pets.delete(id);
    if (this.settings.pets[id]) this.settings.pets[id].visible = false;
    this.status.delete(id);
    this.saveSoon();
    this.changed();
  }

  saveSoon(): void { this.store.saveSoon(this.settings); }
  flush(): void { this.store.flush(this.settings); }

  /** Hook for later tasks (panel and tray refresh). */
  protected changed(): void {}

  protected petEvents(): PetEvents {
    return {
      status: (id, label) => { this.status.set(id, label); this.changed(); },
      menu: id => this.onPetMenu(id),
      dragEnd: id => this.onDragEnd(id),
      reminderResult: (id, type, result) => this.onReminderResult(id, type, result),
      crashed: id => this.onCrashed(id),
      log: (id, level, message) => this.log[level](`[${id}] ${message}`),
    };
  }

  protected onPetMenu(_id: string): void {}
  protected onReminderResult(_id: string, _type: string, _result: string): void {}

  private onDragEnd(id: string): void {
    const pet = this.pets.get(id);
    const ps = this.settings.pets[id];
    if (!pet || !ps) return;
    const wa = this.workArea();
    ps.x = xRatioFromBounds(pet.win.getBounds(), pet.pack, wa);
    pet.setBounds(windowBounds(pet.pack, ps.scale, ps.x, wa));
    this.saveSoon();
  }

  private onCrashed(id: string): void {
    const n = (this.crashes.get(id) ?? 0) + 1;
    this.crashes.set(id, n);
    this.log.error(`貓咪視窗 ${id} 當掉了（第 ${n} 次）`);
    this.pets.get(id)?.close();
    this.pets.delete(id);
    if (n <= MAX_CRASH_RESTARTS) this.showPet(id);
    else { this.settings.pets[id].visible = false; this.saveSoon(); this.changed(); }
  }

  private petFor(sender: WebContents): PetWindow | undefined {
    for (const p of this.pets.values()) if (!p.win.isDestroyed() && p.win.webContents === sender) return p;
    return undefined;
  }
}
```

- [ ] **Step 5: 程式進入點** `src/main/main.ts`

```ts
import { app } from 'electron';
import { handleAppProtocol, registerSchemePrivileges } from './app-protocol';
import { AppController } from './controller';
import { Logger } from './logger';
import { resolvePaths } from './paths';

registerSchemePrivileges();
const paths = resolvePaths();
const debug = process.env.DESKTOP_PET_DEBUG === '1';

void app.whenReady().then(() => {
  const log = new Logger(paths.logsDir);
  log.info(`啟動 ${app.getVersion()}`);
  handleAppProtocol({ ui: paths.uiDir, packs: paths.packsDir });
  const controller = new AppController(paths, log, debug);
  if (debug) (globalThis as Record<string, unknown>).__controller = controller;
  controller.start();
  app.on('before-quit', () => controller.flush());
});

// Pets live in small windows; keep running when the panel is closed.
app.on('window-all-closed', () => {});
```

- [ ] **Step 6: 貓咪畫面** `src/pet/pet.html`、`src/pet/pet.css`

```html
<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; media-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'">
  <link rel="stylesheet" href="pet.css">
</head>
<body>
  <div id="stage"><div id="shadow"></div><div id="layer"></div></div>
  <script src="pet.js"></script>
</body>
</html>
```

```css
html, body { margin: 0; height: 100%; overflow: hidden; background: transparent; user-select: none; font-family: "Microsoft JhengHei", "Segoe UI", sans-serif; }
#stage { position: absolute; inset: 0; }
#layer { position: absolute; inset: 0; }
#layer video { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; pointer-events: none; }
#shadow { position: absolute; height: 12px; border-radius: 50%; background: rgba(0, 0, 0, .2); filter: blur(3px); transition: opacity .6s; pointer-events: none; }
.bubble { position: absolute; transform: translate(-50%, -100%); background: #fff; color: #333; font-size: 15px; padding: 6px 12px; border-radius: 12px; box-shadow: 0 3px 10px rgba(0, 0, 0, .2); white-space: nowrap; pointer-events: none; }
.bubble.reminder { pointer-events: auto; }
.bubble .actions { display: flex; gap: 6px; margin-top: 8px; }
.bubble button { font: inherit; font-size: 12px; padding: 3px 10px; border-radius: 8px; border: 1px solid #ccd; background: #f6f7f9; cursor: pointer; }
.heart { position: absolute; color: #e88; font-size: 18px; pointer-events: none; transform: translate(-50%, -50%); }
```

- [ ] **Step 7: 影片播放器** `src/pet/player.ts`

```ts
import type { Step } from '../shared/graph';
import type { Pack } from '../shared/types';

const CROSSFADE_S = 0.12;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
type FrameVideo = HTMLVideoElement & { requestVideoFrameCallback(cb: () => void): number };
const firstFrame = (v: HTMLVideoElement) => Promise.race([
  new Promise<void>(r => (v as FrameVideo).requestVideoFrameCallback(() => r())),
  sleep(250),
]);
const seeked = (v: HTMLVideoElement) => (v.readyState >= 2 && !v.seeking ? Promise.resolve()
  : Promise.race([new Promise<void>(r => v.addEventListener('seeked', () => r(), { once: true })), sleep(300)]));

/** One <video> per clip; exactly one visible at a time. */
export class Player {
  onStepStart: (step: Step) => void = () => {};
  onEnded: () => void = () => {};
  onError: (clip: string) => void = () => {};
  private readonly videos = new Map<string, HTMLVideoElement>();
  private current: { step: Step; video: HTMLVideoElement } | null = null;
  private token = 0;
  private z = 1;

  constructor(layer: HTMLElement, pack: Pack, packUrl: string) {
    for (const [id, def] of Object.entries(pack.clips)) {
      const v = document.createElement('video');
      v.src = new URL(def.file, packUrl).href;
      v.muted = true; v.playsInline = true; v.preload = 'none';
      v.addEventListener('ended', () => { if (this.current?.video === v) this.onEnded(); });
      v.addEventListener('error', () => this.onError(id));
      layer.appendChild(v);
      this.videos.set(id, v);
    }
  }

  get step(): Step | null { return this.current?.step ?? null; }
  get video(): HTMLVideoElement | null { return this.current?.video ?? null; }
  get progress(): number {
    const v = this.current?.video;
    return v && v.duration ? v.currentTime / v.duration : 0;
  }

  preload(clips: string[]): void {
    for (const c of clips) {
      const v = this.videos.get(c);
      if (v && v.preload !== 'auto') { v.preload = 'auto'; v.load(); }
    }
  }

  async play(step: Step): Promise<void> {
    const token = ++this.token;
    const v = this.videos.get(step.clip)!;
    const same = this.current?.video === v;
    this.current = { step, video: v };
    this.onStepStart(step);
    v.style.zIndex = String(++this.z);
    v.defaultPlaybackRate = step.rate;
    v.playbackRate = step.rate;
    v.currentTime = 0;
    if (!same) { v.style.transition = 'none'; v.style.opacity = '0'; }
    if (step.fadeIn > 0 && !same) {       // a prop appears or disappears: dissolve to this clip's first frame, then play
      await seeked(v);
      if (token !== this.token) return;
      v.style.transition = `opacity ${step.fadeIn}s linear`;
      void v.offsetWidth;
      v.style.opacity = '1';
      await sleep(step.fadeIn * 1000 + 20);
      if (token !== this.token) return;
    }
    try { await v.play(); } catch { if (token === this.token) this.onError(step.clip); return; }
    await firstFrame(v);
    if (token !== this.token) return;
    const cross = same || step.fadeIn > 0 ? 0 : CROSSFADE_S;
    v.style.transition = cross ? `opacity ${cross}s linear` : 'none';
    v.style.opacity = '1';
    if (cross) await sleep(cross * 1000 + 10);
    if (token !== this.token) return;
    for (const o of this.videos.values()) {
      if (o !== v && o.style.opacity !== '0') { o.style.transition = 'none'; o.style.opacity = '0'; o.pause(); }
    }
  }

  pause(): void { this.current?.video.pause(); }
  resume(): void { void this.current?.video.play(); }
}
```

- [ ] **Step 8: 貓咪畫面主程式（第一版：播放和影子）** `src/pet/pet.ts`

```ts
import { BehaviorEngine } from '../shared/behavior';
import type { PetInit } from '../shared/ipc';
import { poseValueAt, showsShadow } from '../shared/pose-geometry';
import { Player } from './player';

const api = window.petApi;
const layer = document.getElementById('layer')!;
const shadow = document.getElementById('shadow')!;

api.onInit((init: PetInit) => {
  const { pack } = init;
  const engine = new BehaviorEngine(pack, Math.random);
  engine.auto = init.auto;
  const player = new Player(layer, pack, init.packUrl);
  const history: string[] = [];
  if (init.debug) (window as unknown as Record<string, unknown>).__pet = { id: pack.id, history, engine, player };

  const advance = () => { void player.play(engine.next()); };
  player.onStepStart = step => {
    history.push(step.clip);
    api.reportStatus(pack.poses[step.to].label);
    player.preload(engine.upcomingClips());
  };
  player.onEnded = advance;
  player.onError = clip => { api.log('warn', `片段 ${clip} 播放失敗，改走別的路`); engine.markBroken(clip); advance(); };

  api.onCommand(pose => { if (!engine.command(pose)) api.log('warn', `走不到姿勢 ${pose}`); });
  api.onSetAuto(on => { engine.auto = on; });
  api.onPause(paused => { if (paused) player.pause(); else player.resume(); });

  const g0 = pack.poses[pack.start].ground;
  const frame = () => {
    const H = window.innerHeight;
    const W = window.innerWidth;
    const step = player.step;
    const k = player.progress;
    // the window is placed for the start pose; shift the video if this pose's ground line differs
    layer.style.transform = `translateY(${(g0 - poseValueAt(pack, step, k, 'ground')) * H}px)`;
    const cx = poseValueAt(pack, step, k, 'centerX') * W;
    Object.assign(shadow.style, { width: `${H * 0.5}px`, left: `${cx - H * 0.25}px`, top: `${g0 * H - 7}px`, opacity: showsShadow(pack, step) ? '1' : '0' });
    requestAnimationFrame(frame);
  };

  void player.play(engine.start());
  requestAnimationFrame(frame);
});

api.ready();
```

- [ ] **Step 9: 整合測試工具** `playwright.config.ts`、`tests/e2e/helpers.ts`

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({ testDir: 'tests/e2e', timeout: 60_000, workers: 1, reporter: 'list' });
```

```ts
import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export async function launch(extraEnv: Record<string, string> = {}, userDir = mkdtempSync(join(tmpdir(), 'dpet-e2e-'))) {
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, DESKTOP_PET_PACKS: resolve('tests/fixtures/packs'), DESKTOP_PET_USERDATA: userDir, DESKTOP_PET_DEBUG: '1', ...extraEnv },
  });
  return { app, userDir };
}

/** The pet window of a given pack id, once it has initialised. */
export async function petPage(app: ElectronApplication, id = 'testcat'): Promise<Page> {
  let found: Page | undefined;
  await expect.poll(async () => {
    for (const w of app.windows()) {
      if (!w.url().endsWith('/ui/pet.html')) continue;
      const pid = await w.evaluate(() => (window as any).__pet?.id).catch(() => undefined);
      if (pid === id) { found = w; return true; }
    }
    return false;
  }, { timeout: 20_000 }).toBe(true);
  return found!;
}

export async function panelPage(app: ElectronApplication): Promise<Page> {
  let found: Page | undefined;
  await expect.poll(() => { found = app.windows().find(w => w.url().endsWith('/ui/panel.html')); return !!found; }, { timeout: 20_000 }).toBe(true);
  await found!.waitForSelector('[data-pet]');
  return found!;
}

/** Run a function against the main-process controller (exposed in debug mode). */
export function controllerCall<T>(app: ElectronApplication, fn: (c: any) => T): Promise<T> {
  return app.evaluate((_electron, body) => new Function('c', `return (${body})(c)`)((globalThis as any).__controller), fn.toString());
}
```

- [ ] **Step 10: 寫會失敗的整合測試** `tests/e2e/playback.spec.ts`

```ts
import { test, expect } from '@playwright/test';
import { controllerCall, launch, petPage } from './helpers';

test('the first cat appears and plays an idle of its start pose', async () => {
  const { app } = await launch();
  const page = await petPage(app, 'testcat');
  await expect.poll(() => page.evaluate(() => (window as any).__pet.history[0])).toMatch(/^idle_rest/);
  expect(await controllerCall(app, c => [...c.pets.keys()])).toEqual(['testcat']);
  // 533x300 at scale 1; display scaling may round up by one pixel
  const b = await controllerCall(app, c => c.pets.get('testcat').win.getBounds());
  expect(b.width - 533).toBeGreaterThanOrEqual(0);
  expect(b.width - 533).toBeLessThanOrEqual(1);
  expect(b.height - 300).toBeGreaterThanOrEqual(0);
  expect(b.height - 300).toBeLessThanOrEqual(1);
  await app.close();
});

test('a command walks the pose graph through the prop fade', async () => {
  const { app } = await launch();
  const page = await petPage(app);
  await page.evaluate(() => { (window as any).__pet.engine.auto = false; });
  await controllerCall(app, c => c.pets.get('testcat').send('pet:command', 'perch'));
  await expect.poll(() => page.evaluate(() => (window as any).__pet.history.join(',')), { timeout: 15_000 }).toMatch(/go_perch,idle_perch/);
  await app.close();
});
```

- [ ] **Step 11: 執行整合測試，確認通過**

Run: `npm run test:e2e`
Expected: 2 tests PASS（畫面上會短暫出現一個彩色方塊的「測試貓」）

- [ ] **Step 12: 手動確認**

Run: `DESKTOP_PET_PACKS=tests/fixtures/packs npm start`
Expected: 工作列上方出現色塊，每秒換一次顏色；透明的地方可以點到後面的視窗。關掉：在「工作管理員」結束 Electron（系統列在 Task 12 才加）。

- [ ] **Step 13: Commit**

```bash
git add src playwright.config.ts tests/e2e
git commit -m "Run the app: pet windows play their pack through the behaviour engine

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: 貓咪互動：點擊穿透、點擊台詞、拖曳落下、右鍵選單

**Files:**
- Create: `src/pet/bubble.ts`、`src/pet/interactions.ts`、`src/main/menus.ts`
- Modify: `src/pet/pet.ts`、`src/main/controller.ts`
- Test: `tests/unit/menus.test.ts`、`tests/e2e/interactions.spec.ts`

**Interfaces:**
- Consumes: `clickLine, commandLine, pickLine`、`poseValueAt, isAsleep`（Task 4）；`windowBounds, restY`（Task 9）；`SIZE_PRESETS`（Task 6）
- Produces:
  - `class Bubbles`：`constructor(stage: HTMLElement, anchor: () => { x: number; y: number })`、`say(text, ms = 2200)`、`ask(text, actions: { label: string; onClick: () => void }[], ms: number, onTimeout: () => void)`、`heart()`、`place()`、`clear()`
  - `class Interactions`：`constructor(deps: InteractionDeps)`、`setRestY(y: number)`
  - `SIZE_ITEMS: [string, number][]`；`petMenuTemplate(s: PetMenuState, h: PetMenuHandlers): MenuItemConstructorOptions[]`
  - `AppController`：`command(id, pose)`、`setAuto(id, on)`、`setScale(id, scale)`、`resetPosition(id)`

- [ ] **Step 1: 寫會失敗的測試** `tests/unit/menus.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest';
import { petMenuTemplate } from '../../src/main/menus';

const handlers = () => ({ command: vi.fn(), setAuto: vi.fn(), setScale: vi.fn(), resetPosition: vi.fn(), hide: vi.fn() });

describe('petMenuTemplate', () => {
  it('lists the commands, then auto, size, reset and hide', () => {
    const h = handlers();
    const t = petMenuTemplate({ commands: [{ label: '休息', pose: 'rest' }, { label: '上台子', pose: 'perch' }], auto: true, scale: 1 }, h);
    expect(t.map(i => i.label ?? i.type)).toEqual(['休息', '上台子', 'separator', '自動行動', '大小', '放回工作列', '先收起來']);
    expect(t[3]).toMatchObject({ type: 'checkbox', checked: true });
    const sizes = t[4].submenu as any[];
    expect(sizes.map(s => [s.label, s.checked])).toEqual([['小', false], ['中', true], ['大', false]]);
    (t[1] as any).click(); (t[3] as any).click(); sizes[2].click(); (t[5] as any).click(); (t[6] as any).click();
    expect(h.command).toHaveBeenCalledWith('perch');
    expect(h.setAuto).toHaveBeenCalledWith(false);
    expect(h.setScale).toHaveBeenCalledWith(1.3);
    expect(h.resetPosition).toHaveBeenCalled();
    expect(h.hide).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `npx vitest run tests/unit/menus.test.ts`
Expected: FAIL（找不到 `../../src/main/menus`）

- [ ] **Step 3: 實作** `src/main/menus.ts`

```ts
import type { MenuItemConstructorOptions } from 'electron';
import { SIZE_PRESETS } from '../shared/settings';
import type { Command } from '../shared/types';

export const SIZE_ITEMS: [string, number][] = [['小', SIZE_PRESETS.s], ['中', SIZE_PRESETS.m], ['大', SIZE_PRESETS.l]];

export interface PetMenuState { commands: Command[]; auto: boolean; scale: number }
export interface PetMenuHandlers {
  command(pose: string): void;
  setAuto(on: boolean): void;
  setScale(scale: number): void;
  resetPosition(): void;
  hide(): void;
}

export function petMenuTemplate(s: PetMenuState, h: PetMenuHandlers): MenuItemConstructorOptions[] {
  return [
    ...s.commands.map(c => ({ label: c.label, click: () => h.command(c.pose) })),
    { type: 'separator' },
    { label: '自動行動', type: 'checkbox', checked: s.auto, click: () => h.setAuto(!s.auto) },
    {
      label: '大小',
      submenu: SIZE_ITEMS.map(([label, v]) => ({ label, type: 'radio' as const, checked: Math.abs(s.scale - v) < 0.01, click: () => h.setScale(v) })),
    },
    { label: '放回工作列', click: () => h.resetPosition() },
    { label: '先收起來', click: () => h.hide() },
  ];
}
```

- [ ] **Step 4: 執行測試，確認通過**

Run: `npx vitest run tests/unit/menus.test.ts`
Expected: 1 test PASS

- [ ] **Step 5: 泡泡** `src/pet/bubble.ts`

```ts
export class Bubbles {
  private el: HTMLDivElement | null = null;
  private timer = 0;

  constructor(private readonly stage: HTMLElement, private readonly anchor: () => { x: number; y: number }) {}

  say(text: string, ms = 2200): void {
    this.clear();
    this.show(this.make('bubble', text), ms, () => {});
  }

  /** A reminder bubble with buttons; it stays clickable while the rest of the window lets clicks through. */
  ask(text: string, actions: { label: string; onClick: () => void }[], ms: number, onTimeout: () => void): void {
    this.clear();
    const el = this.make('bubble reminder', text);
    const row = document.createElement('div');
    row.className = 'actions';
    for (const a of actions) {
      const b = document.createElement('button');
      b.textContent = a.label;
      b.addEventListener('click', () => { this.clear(); a.onClick(); });
      row.appendChild(b);
    }
    el.appendChild(row);
    this.show(el, ms, onTimeout);
  }

  heart(): void {
    const { x, y } = this.anchor();
    const el = document.createElement('div');
    el.className = 'heart';
    el.textContent = '♡';
    el.style.left = `${x}px`;
    el.style.top = `${y + 30}px`;
    this.stage.appendChild(el);
    el.animate([{ opacity: 0 }, { opacity: 0.9, offset: 0.2 }, { transform: 'translate(-50%, -70px)', opacity: 0 }], { duration: 1600, easing: 'ease-out' })
      .onfinish = () => el.remove();
  }

  place(): void {
    if (!this.el) return;
    const { x, y } = this.anchor();
    const w = this.stage.clientWidth;
    this.el.style.left = `${Math.min(Math.max(x, 80), w - 80)}px`;
    this.el.style.top = `${Math.max(y, 44)}px`;
  }

  clear(): void {
    window.clearTimeout(this.timer);
    this.el?.remove();
    this.el = null;
  }

  private make(cls: string, text: string): HTMLDivElement {
    const el = document.createElement('div');
    el.className = cls;
    el.append(document.createTextNode(text));
    return el;
  }

  private show(el: HTMLDivElement, ms: number, onTimeout: () => void): void {
    this.stage.appendChild(el);
    this.el = el;
    this.place();
    this.timer = window.setTimeout(() => { if (this.el === el) { this.clear(); onTimeout(); } }, ms);
  }
}
```

- [ ] **Step 6: 點擊、穿透、拖曳和落下** `src/pet/interactions.ts`

```ts
import type { PetApi } from '../shared/ipc';

export interface InteractionDeps {
  api: PetApi;
  hitTest(x: number, y: number): boolean;
  canDrag(): boolean;
  onClick(): void;
  onDragStart(): void;
  onNoDrag(): void;
  wrap: HTMLElement;          // the element that swings while dragged
  restY: number;              // window top when standing on the taskbar
}

const DRAG_THRESHOLD = 6;
const GRAVITY = 2400;

export class Interactions {
  private interactive = false;
  private press: { x: number; y: number; winX: number; winY: number } | null = null;
  private dragging = false;
  private winX = window.screenX;
  private winY = window.screenY;
  private swing = 0;
  private swingV = 0;
  private lastX = 0;
  private lastT = 0;
  private vx = 0;
  private restY: number;

  constructor(private readonly d: InteractionDeps) {
    this.restY = d.restY;
    window.addEventListener('mousemove', e => this.onMove(e));
    window.addEventListener('mousedown', e => this.onDown(e));
    window.addEventListener('mouseup', () => this.onUp());
    window.addEventListener('contextmenu', e => { e.preventDefault(); if (d.hitTest(e.clientX, e.clientY)) d.api.openMenu(); });
  }

  setRestY(y: number): void { this.restY = y; }

  private setInteractive(on: boolean): void {
    if (on === this.interactive) return;
    this.interactive = on;
    this.d.api.setInteractive(on);
  }

  private onMove(e: MouseEvent): void {
    const now = performance.now();
    this.vx = this.vx * 0.5 + ((e.screenX - this.lastX) / Math.max(1, now - this.lastT)) * 1000 * 0.5;
    this.lastX = e.screenX; this.lastT = now;
    if (this.press && !this.dragging && Math.hypot(e.screenX - this.press.x, e.screenY - this.press.y) > DRAG_THRESHOLD) {
      if (!this.d.canDrag()) { this.press = null; this.d.onNoDrag(); return; }
      this.dragging = true;
      this.d.onDragStart();
      this.animateSwing();
    }
    if (this.dragging && this.press) {
      this.winX = this.press.winX + (e.screenX - this.press.x);
      this.winY = this.press.winY + (e.screenY - this.press.y);
      this.d.api.moveWindow(this.winX, this.winY);
      return;
    }
    if (!this.press) this.setInteractive(this.d.hitTest(e.clientX, e.clientY));
  }

  private onDown(e: MouseEvent): void {
    if (e.button !== 0 || !this.d.hitTest(e.clientX, e.clientY)) return;
    this.winX = window.screenX; this.winY = window.screenY;
    this.press = { x: e.screenX, y: e.screenY, winX: this.winX, winY: this.winY };
  }

  private onUp(): void {
    if (!this.press) return;
    const wasDragging = this.dragging;
    this.press = null;
    this.dragging = false;
    if (wasDragging) this.fall(); else this.d.onClick();
  }

  /** Limp, unbothered swing while held. */
  private animateSwing(): void {
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const target = this.dragging ? Math.max(-0.25, Math.min(0.25, this.vx * 0.0003)) : 0;
      this.swingV += ((target - this.swing) * 30 - this.swingV * 6) * dt;
      this.swing += this.swingV * dt;
      this.vx *= Math.exp(-dt * 6);
      this.d.wrap.style.transform = `rotate(${this.swing}rad)`;
      if (this.dragging || Math.abs(this.swing) > 0.002 || Math.abs(this.swingV) > 0.002) requestAnimationFrame(tick);
      else this.d.wrap.style.transform = '';
    };
    requestAnimationFrame(tick);
  }

  private fall(): void {
    let vy = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      vy += GRAVITY * dt;
      this.winY = Math.min(this.restY, this.winY + vy * dt);
      this.d.api.moveWindow(this.winX, this.winY);
      if (this.winY < this.restY) { requestAnimationFrame(tick); return; }
      this.d.wrap.animate([{ transform: 'scale(1.05, .95)' }, { transform: 'none' }], { duration: 350 });
      this.d.api.dragEnded();
    };
    requestAnimationFrame(tick);
  }
}
```

- [ ] **Step 7: 把泡泡和互動接進貓咪畫面** — 修改 `src/pet/pet.ts`

把 import 區換成：

```ts
import { BehaviorEngine } from '../shared/behavior';
import type { PetInit } from '../shared/ipc';
import { clickLine, commandLine, pickLine } from '../shared/lines';
import { isAsleep, poseValueAt, showsShadow } from '../shared/pose-geometry';
import { Bubbles } from './bubble';
import { Interactions } from './interactions';
import { Player } from './player';
```

在 `const g0 = pack.poses[pack.start].ground;` 這行後面加上：

```ts
  const stage = document.getElementById('stage')!;
  const bubbles = new Bubbles(stage, () => ({
    x: poseValueAt(pack, player.step, player.progress, 'centerX') * window.innerWidth,
    y: (g0 - poseValueAt(pack, player.step, player.progress, 'head')) * window.innerHeight - 8,
  }));
  if (init.debug) Object.assign((window as unknown as Record<string, object>).__pet, { bubbles });

  const probe = document.createElement('canvas');
  probe.width = 160; probe.height = 90;
  const ctx = probe.getContext('2d', { willReadFrequently: true })!;
  const hitTest = (x: number, y: number): boolean => {
    if ((document.elementFromPoint(x, y) as HTMLElement | null)?.closest('.bubble.reminder')) return true;
    const v = player.video;
    if (!v || v.readyState < 2) return false;
    const r = layer.getBoundingClientRect();
    const u = (x - r.left) / r.width;
    const t = (y - r.top) / r.height;
    if (u < 0 || u >= 1 || t < 0 || t >= 1) return false;
    ctx.clearRect(0, 0, 160, 90);
    ctx.drawImage(v, 0, 0, 160, 90);
    return ctx.getImageData(Math.floor(u * 160), Math.floor(t * 90), 1, 1).data[3] > 40;
  };
  const interactions = new Interactions({
    api, hitTest, wrap: stage, restY: init.restY,
    canDrag: () => { const s = engine.currentStep; return !!s && s.from === s.to && !!pack.poses[s.to].draggable; },
    onClick: () => {
      bubbles.say(clickLine(pack, engine.endPose, Math.random));
      if (pack.clickHeart && !isAsleep(pack, engine.endPose)) bubbles.heart();
    },
    onDragStart: () => bubbles.say(pickLine(pack.lines.drag, Math.random), 1600),
    onNoDrag: () => bubbles.say(pickLine(pack.lines.noDrag, Math.random)),
  });
  api.onRestY(y => interactions.setRestY(y));
```

把 `api.onCommand(...)` 這行換成：

```ts
  api.onCommand(pose => {
    if (!engine.command(pose)) { api.log('warn', `走不到姿勢 ${pose}`); return; }
    const line = commandLine(pack, pose);
    if (line) bubbles.say(line);
  });
```

在 `frame` 函式裡 `requestAnimationFrame(frame);` 這行前面加上 `bubbles.place();`，並在 `requestAnimationFrame(frame);`（最後那行啟動用的）後面加上：

```ts
  setTimeout(() => bubbles.say(pickLine(pack.lines.greet, Math.random)), 800);
```

- [ ] **Step 8: 控制器加上選單和指令** — 修改 `src/main/controller.ts`

import 區加上：

```ts
import { Menu } from 'electron';
import { petMenuTemplate } from './menus';
import { MAX_SCALE, MIN_SCALE } from '../shared/settings';
```

把 `protected onPetMenu(_id: string): void {}` 換成下面這些方法：

```ts
  protected onPetMenu(id: string): void {
    const pet = this.pets.get(id);
    const ps = this.settings.pets[id];
    if (!pet || !ps) return;
    Menu.buildFromTemplate(petMenuTemplate({ commands: pet.pack.commands, auto: ps.auto, scale: ps.scale }, {
      command: pose => this.command(id, pose),
      setAuto: on => this.setAuto(id, on),
      setScale: s => this.setScale(id, s),
      resetPosition: () => this.resetPosition(id),
      hide: () => this.hidePet(id),
    })).popup({ window: pet.win });
  }

  command(id: string, pose: string): void { this.pets.get(id)?.send('pet:command', pose); }

  setAuto(id: string, on: boolean): void {
    const ps = this.settings.pets[id];
    if (!ps) return;
    ps.auto = on;
    const pet = this.pets.get(id);
    pet?.updateInit({ auto: on });
    pet?.send('pet:set-auto', on);
    this.saveSoon();
    this.changed();
  }

  setScale(id: string, scale: number): void {
    const ps = this.settings.pets[id];
    if (!ps) return;
    ps.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
    const pet = this.pets.get(id);
    if (pet) {
      const wa = this.workArea();
      pet.setBounds(windowBounds(pet.pack, ps.scale, ps.x ?? DEFAULT_X, wa));
      const y = restY(pet.pack, ps.scale, wa);
      pet.updateInit({ restY: y });
      pet.send('pet:rest-y', y);
    }
    this.saveSoon();
    this.changed();
  }

  /** Put a cat back on the taskbar at its saved spot (rescues a cat dragged somewhere odd). */
  resetPosition(id: string): void {
    const pet = this.pets.get(id);
    const ps = this.settings.pets[id];
    if (!pet || !ps) return;
    pet.setBounds(windowBounds(pet.pack, ps.scale, ps.x ?? DEFAULT_X, this.workArea()));
  }
```

- [ ] **Step 9: 寫整合測試** `tests/e2e/interactions.spec.ts`

```ts
import { test, expect } from '@playwright/test';
import { controllerCall, launch, petPage } from './helpers';

test('clicking the cat shows a line and a heart', async () => {
  const { app } = await launch();
  const page = await petPage(app);
  // stay awake in the start pose: on the perch (asleep) a click says "zzz" and shows no heart
  await page.evaluate(() => { (window as any).__pet.engine.auto = false; });
  await expect.poll(() => page.evaluate(() => (window as any).__pet.engine.endPose)).toBe('rest');
  await expect.poll(() => page.evaluate(() => (window as any).__pet.player.video?.readyState ?? 0)).toBeGreaterThanOrEqual(2);
  await expect(page.locator('.bubble')).toHaveText('嗨。');   // wait for the greeting so it cannot replace the click line
  const box = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  // the test clips draw an opaque box at x 60-160 / y 90-162 of 320x180
  const x = box.w * (110 / 320);
  const y = box.h * (126 / 180);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.locator('.bubble')).toHaveText('……');
  await expect(page.locator('.heart')).toHaveCount(1);
  await app.close();
});

test('clicking a transparent spot does nothing', async () => {
  const { app } = await launch();
  const page = await petPage(app);
  await page.mouse.click(10, 10);
  await page.waitForTimeout(500);
  await expect(page.locator('.heart')).toHaveCount(0);
  expect(await page.locator('.bubble').allTextContents()).not.toContain('……');   // the greeting may still be showing
  await app.close();
});

test('dragging keeps the window size and the drop lands back on the taskbar', async () => {
  const { app } = await launch();
  const page = await petPage(app);
  const bounds = () => controllerCall(app, c => c.pets.get('testcat').win.getBounds());
  const start = await bounds();
  // many small moves, like a real drag (at fractional display scaling setPosition grows the window each call)
  await page.evaluate(async ([x, y]) => {
    for (let i = 1; i <= 40; i++) { window.petApi.moveWindow(x - i * 3, y - i * 4); await new Promise(r => setTimeout(r, 5)); }
  }, [start.x, start.y]);
  await expect.poll(async () => (await bounds()).y).toBe(start.y - 160);
  const moved = await bounds();
  expect(Math.abs(moved.width - start.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(moved.height - start.height)).toBeLessThanOrEqual(1);
  await page.evaluate(() => window.petApi.dragEnded());
  await expect.poll(async () => (await bounds()).y).toBe(start.y);
  expect((await bounds()).x).toBe(start.x - 120);
  await app.close();
});
```

- [ ] **Step 10: 執行單元和整合測試**

Run: `npm test && npm run test:e2e`
Expected: 全部 PASS

- [ ] **Step 11: 手動確認（用測試寵物包）**

Run: `DESKTOP_PET_PACKS=tests/fixtures/packs npm start`
Expected:
- 滑鼠移到色塊上，游標可以點；移到透明處，點擊會落到後面的視窗
- 點色塊出現「……」和愛心
- 按住色塊拖動，視窗跟著走、會輕輕晃；放開後落回工作列
- 右鍵出現「休息／上台子／坐下／自動行動／大小／放回工作列／先收起來」，選「上台子」後出現「（盯）」，播完目前片段就換到台子
- 在「上台子」狀態按住拖動，只出現「不想動」

- [ ] **Step 12: Commit**

```bash
git add src tests
git commit -m "Pet interactions: click-through, lines, drag and fall, context menu

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: 系統列與控制面板

**Files:**
- Create: `src/main/tray.ts`、`src/main/panel-window.ts`、`src/main/preload-panel.ts`、`src/panel/panel.html`、`src/panel/panel.css`、`src/panel/panel.ts`
- Modify: `src/main/menus.ts`、`src/main/controller.ts`、`src/main/main.ts`
- Test: `tests/unit/menus.test.ts`（新增）、`tests/e2e/panel.spec.ts`

**Interfaces:**
- Consumes: `PanelState, PanelAction, PanelApi`（Task 10）；`AppController` 的 `showPet, hidePet, command, setAuto, setScale, resetPosition`（Task 10、11）
- Produces:
  - `trayMenuTemplate(pets: { id: string; name: string; visible: boolean }[], s: { now: number; pausedUntil: number | null; autoStart: boolean }, h: TrayHandlers): MenuItemConstructorOptions[]`
  - `class TrayController`：`constructor(iconPath: string | null, build: () => MenuItemConstructorOptions[], onClick: () => void)`、`refresh()`、`destroy()`
  - `class PanelWindow`：`constructor(preloadDir: string)`、`open()`、`push(state)`
  - `AppController`：`openPanel()`、`panelState(): PanelState`、`act(a: PanelAction): PanelState`、`hideAll()`、`setReminders(patch)`、`setAutoStart(on)`、`resetAllPositions()`、`pauseReminders()`、`resumeReminders()`、`testReminder()`、`quit()`（提醒相關的四個方法在 Task 13 實作，這裡先放空的）
  - 控制面板 DOM：每隻貓一個 `[data-pet="<id>"]` 卡片，裡面有 `input.visible`、`input.auto`、`input.scale`、`button[data-pose]`；提醒分頁有 `select[data-reminder]`、`input.notify`、`button.test-reminder`；設定分頁有 `input.autostart`、`button.reset-positions`

- [ ] **Step 1: 寫會失敗的測試** — 在 `tests/unit/menus.test.ts` 最後加上

```ts
import { trayMenuTemplate } from '../../src/main/menus';

describe('trayMenuTemplate', () => {
  const h = () => ({ openPanel: vi.fn(), togglePet: vi.fn(), hideAll: vi.fn(), pauseReminders: vi.fn(), resumeReminders: vi.fn(), setAutoStart: vi.fn(), quit: vi.fn() });
  it('lists the panel, each cat, hide all, reminders, autostart and quit', () => {
    const t = trayMenuTemplate([{ id: 'a', name: '小昭', visible: true }], { now: 0, pausedUntil: null, autoStart: true }, h());
    expect(t.map(i => i.label ?? i.type)).toEqual(['打開控制面板', 'separator', '小昭', '全部收起來', 'separator', '提醒暫停 1 小時', '開機自動啟動', 'separator', '結束']);
    expect(t[2]).toMatchObject({ type: 'checkbox', checked: true });
  });
  it('offers to resume while paused', () => {
    const handlers = h();
    const until = new Date(2026, 8, 27, 15, 30).getTime();
    const t = trayMenuTemplate([], { now: until - 1000, pausedUntil: until, autoStart: false }, handlers);
    const item = t.find(i => i.label?.startsWith('恢復提醒'))!;
    expect(item.label).toBe('恢復提醒（目前暫停到 15:30）');
    (item as any).click();
    expect(handlers.resumeReminders).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `npx vitest run tests/unit/menus.test.ts`
Expected: FAIL（`trayMenuTemplate` 不存在）

- [ ] **Step 3: 實作** — 在 `src/main/menus.ts` 最後加上

```ts
export interface TrayHandlers {
  openPanel(): void;
  togglePet(id: string): void;
  hideAll(): void;
  pauseReminders(): void;
  resumeReminders(): void;
  setAutoStart(on: boolean): void;
  quit(): void;
}

const hhmm = (t: number) => {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export function trayMenuTemplate(pets: { id: string; name: string; visible: boolean }[],
  s: { now: number; pausedUntil: number | null; autoStart: boolean }, h: TrayHandlers): MenuItemConstructorOptions[] {
  const paused = s.pausedUntil !== null && s.pausedUntil > s.now;
  return [
    { label: '打開控制面板', click: () => h.openPanel() },
    { type: 'separator' },
    ...pets.map(p => ({ label: p.name, type: 'checkbox' as const, checked: p.visible, click: () => h.togglePet(p.id) })),
    { label: '全部收起來', click: () => h.hideAll() },
    { type: 'separator' },
    paused
      ? { label: `恢復提醒（目前暫停到 ${hhmm(s.pausedUntil!)}）`, click: () => h.resumeReminders() }
      : { label: '提醒暫停 1 小時', click: () => h.pauseReminders() },
    { label: '開機自動啟動', type: 'checkbox', checked: s.autoStart, click: () => h.setAutoStart(!s.autoStart) },
    { type: 'separator' },
    { label: '結束', click: () => h.quit() },
  ];
}
```

- [ ] **Step 4: 執行測試，確認通過**

Run: `npx vitest run tests/unit/menus.test.ts`
Expected: 3 tests PASS

- [ ] **Step 5: 系統列和控制面板視窗**

`src/main/tray.ts`：

```ts
import { Menu, nativeImage, Tray, type MenuItemConstructorOptions } from 'electron';

export class TrayController {
  private readonly tray: Tray;

  constructor(iconPath: string | null, private readonly build: () => MenuItemConstructorOptions[], onClick: () => void) {
    const icon = iconPath ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }) : nativeImage.createEmpty();
    this.tray = new Tray(icon);
    this.tray.setToolTip('毛孩桌寵');
    this.tray.on('click', onClick);
    this.refresh();
  }

  refresh(): void { this.tray.setContextMenu(Menu.buildFromTemplate(this.build())); }
  destroy(): void { this.tray.destroy(); }
}
```

`src/main/panel-window.ts`：

```ts
import { BrowserWindow } from 'electron';
import { join } from 'node:path';
import { APP_ORIGIN } from './app-protocol';
import type { PanelState } from '../shared/ipc';

export class PanelWindow {
  private win: BrowserWindow | null = null;

  constructor(private readonly preloadDir: string) {}

  open(): void {
    if (this.win && !this.win.isDestroyed()) { this.win.show(); this.win.focus(); return; }
    this.win = new BrowserWindow({
      width: 780, height: 560, title: '毛孩桌寵', autoHideMenuBar: true,
      webPreferences: { preload: join(this.preloadDir, 'preload-panel.js'), contextIsolation: true, nodeIntegration: false },
    });
    void this.win.loadURL(`${APP_ORIGIN}/ui/panel.html`);
    this.win.on('closed', () => { this.win = null; });
  }

  push(state: PanelState): void {
    if (this.win && !this.win.isDestroyed()) this.win.webContents.send('panel:state', state);
  }
}
```

`src/main/preload-panel.ts`：

```ts
import { contextBridge, ipcRenderer } from 'electron';
import type { PanelApi } from '../shared/ipc';

const api: PanelApi = {
  getState: () => ipcRenderer.invoke('panel:get-state'),
  act: action => ipcRenderer.invoke('panel:act', action),
  onState: cb => { ipcRenderer.on('panel:state', (_e, s) => cb(s)); },
};
contextBridge.exposeInMainWorld('panelApi', api);
```

- [ ] **Step 6: 控制器加上面板、系統列和動作** — 修改 `src/main/controller.ts`

import 區加上：

```ts
import { app } from 'electron';
import { join } from 'node:path';
import { APP_ORIGIN } from './app-protocol';
import { PanelWindow } from './panel-window';
import { TrayController } from './tray';
import { trayMenuTemplate } from './menus';
import type { PanelAction, PanelState } from '../shared/ipc';
```

在 class 欄位區加上：

```ts
  protected readonly panel: PanelWindow;
  private tray: TrayController | null = null;
```

在 constructor 最後加上：

```ts
    this.panel = new PanelWindow(paths.uiDir);
    ipcMain.handle('panel:get-state', () => this.panelState());
    ipcMain.handle('panel:act', (_e, a: PanelAction) => this.act(a));
```

在 `start()` 的第一行加上：

```ts
    const first = this.validPacks()[0];
    this.tray = new TrayController(first ? join(first.dir, first.pack.portrait) : null, () => this.trayMenu(), () => this.openPanel());
```

把 `protected changed(): void {}` 換成：

```ts
  protected changed(): void {
    this.tray?.refresh();
    this.panel.push(this.panelState());
  }

  openPanel(): void { this.panel.open(); }

  panelState(): PanelState {
    const r = this.settings.reminders;
    return {
      pets: this.packs.map(p => {
        const ps = this.settings.pets[p.id];
        return {
          id: p.id,
          name: p.pack?.name ?? p.id,
          personality: p.pack?.personality ?? '',
          portraitUrl: p.pack ? `${APP_ORIGIN}/packs/${p.id}/${p.pack.portrait}` : null,
          errors: p.errors,
          visible: this.pets.has(p.id),
          scale: ps?.scale ?? 1,
          auto: ps?.auto ?? true,
          status: this.status.get(p.id) ?? '',
          commands: p.pack?.commands ?? [],
        };
      }),
      reminders: { water: r.water, stretch: r.stretch, eyes: r.eyes, notify: r.notify, pausedUntil: r.pausedUntil },
      autoStart: this.settings.autoStart,
      version: app.getVersion(),
      warning: this.warning,
    };
  }

  act(a: PanelAction): PanelState {
    switch (a.kind) {
      case 'pet':
        if (a.visible === true) this.showPet(a.id);
        if (a.visible === false) this.hidePet(a.id);
        if (a.auto !== undefined) this.setAuto(a.id, a.auto);
        if (a.scale !== undefined) this.setScale(a.id, a.scale);
        break;
      case 'command': this.command(a.id, a.pose); break;
      case 'reminders': this.setReminders(a); break;
      case 'testReminder': this.testReminder(); break;
      case 'autoStart': this.setAutoStart(a.on); break;
      case 'resetPositions': this.resetAllPositions(); break;
    }
    return this.panelState();
  }

  hideAll(): void { for (const id of [...this.pets.keys()]) this.hidePet(id); }

  resetAllPositions(): void {
    for (const ps of Object.values(this.settings.pets)) ps.x = null;
    const visible = [...this.pets.keys()];
    for (const id of visible) this.pets.get(id)?.close();
    this.pets.clear();
    for (const id of this.settings.petOrder) if (visible.includes(id)) this.showPet(id);
  }

  setAutoStart(on: boolean): void { this.settings.autoStart = on; this.applyAutoStart(); this.saveSoon(); this.changed(); }
  quit(): void { app.quit(); }

  // Filled in by Task 13 / Task 14.
  protected applyAutoStart(): void {}
  setReminders(_patch: { water?: number; stretch?: number; eyes?: number; notify?: boolean }): void {}
  testReminder(): void {}
  pauseReminders(): void {}
  resumeReminders(): void {}

  private trayMenu() {
    return trayMenuTemplate(
      this.validPacks().map(p => ({ id: p.id, name: p.pack.name, visible: this.pets.has(p.id) })),
      { now: Date.now(), pausedUntil: this.settings.reminders.pausedUntil, autoStart: this.settings.autoStart },
      {
        openPanel: () => this.openPanel(),
        togglePet: id => (this.pets.has(id) ? this.hidePet(id) : this.showPet(id)),
        hideAll: () => this.hideAll(),
        pauseReminders: () => this.pauseReminders(),
        resumeReminders: () => this.resumeReminders(),
        setAutoStart: on => this.setAutoStart(on),
        quit: () => this.quit(),
      });
  }
```

- [ ] **Step 7: 控制面板畫面** `src/panel/panel.html`

```html
<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'">
  <title>毛孩桌寵</title>
  <link rel="stylesheet" href="panel.css">
</head>
<body>
  <nav>
    <div class="brand">毛孩桌寵</div>
    <button class="tab active" data-tab="pets">我的貓咪</button>
    <button class="tab" data-tab="reminders">健康提醒</button>
    <button class="tab" data-tab="settings">設定</button>
  </nav>
  <main>
    <div id="warning" hidden></div>
    <section id="tab-pets"></section>
    <section id="tab-reminders" hidden></section>
    <section id="tab-settings" hidden></section>
  </main>
  <script src="panel.js"></script>
</body>
</html>
```

`src/panel/panel.css`：

```css
body { margin: 0; display: grid; grid-template-columns: 150px 1fr; height: 100vh; font-family: "Microsoft JhengHei", "Segoe UI", sans-serif; font-size: 14px; color: #222; background: #f6f7f9; }
nav { background: #fff; border-right: 1px solid #e3e5ea; padding: 14px 8px; display: flex; flex-direction: column; gap: 4px; }
nav .brand { font-weight: 600; padding: 4px 10px 12px; }
.tab { text-align: left; border: 0; background: none; padding: 8px 10px; border-radius: 8px; font: inherit; cursor: pointer; color: #555; }
.tab.active { background: #eef1f6; color: #111; }
main { padding: 18px 22px; overflow: auto; }
#warning { background: #fff4e0; color: #8a5a00; border-radius: 8px; padding: 8px 12px; margin-bottom: 12px; }
.card { background: #fff; border: 1px solid #e3e5ea; border-radius: 12px; padding: 14px 16px; margin-bottom: 12px; }
.card .head { display: flex; align-items: center; gap: 12px; }
.card img { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; background: #eee; }
.card .name { font-weight: 600; font-size: 15px; }
.card .sub { color: #666; font-size: 13px; }
.status { margin-left: auto; font-size: 12px; background: #e7f5ea; color: #256b36; padding: 3px 10px; border-radius: 8px; }
.row { display: flex; align-items: center; gap: 16px; margin-top: 10px; flex-wrap: wrap; }
.row label { display: flex; align-items: center; gap: 6px; }
.commands { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
button.cmd, button.plain { font: inherit; font-size: 13px; padding: 6px 12px; border-radius: 8px; border: 1px solid #d6d9e0; background: #fff; cursor: pointer; }
.errors { color: #a33; font-size: 13px; margin: 8px 0 0; padding-left: 18px; }
.line { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid #eee; }
.line span { flex: 1; }
```

`src/panel/panel.ts`：

```ts
import type { PanelAction, PanelPet, PanelState } from '../shared/ipc';

const api = window.panelApi;
const $ = (id: string) => document.getElementById(id)!;
type ReminderKey = 'water' | 'stretch' | 'eyes';
const REMINDER_ROWS: [ReminderKey, string][] = [['water', '喝水'], ['stretch', '伸展'], ['eyes', '休息眼睛']];
const reminderPatch = (key: ReminderKey, minutes: number) => ({ kind: 'reminders', [key]: minutes }) as PanelAction;
const CHOICES = [0, 30, 45, 60, 90];

let state: PanelState;
const act = async (a: PanelAction) => { state = await api.act(a); render(); };

for (const b of document.querySelectorAll<HTMLButtonElement>('.tab')) {
  b.addEventListener('click', () => {
    for (const t of document.querySelectorAll('.tab')) t.classList.toggle('active', t === b);
    for (const id of ['pets', 'reminders', 'settings']) $(`tab-${id}`).hidden = id !== b.dataset.tab;
  });
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e: HTMLElementTagNameMap[K] = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
}

function petCard(p: PanelPet): HTMLElement {
  const card = el('div', { className: 'card' });
  card.dataset.pet = p.id;
  const head = el('div', { className: 'head' },
    p.portraitUrl ? el('img', { src: p.portraitUrl, alt: '' }) : el('div'),
    el('div', {}, el('div', { className: 'name' }, p.name), el('div', { className: 'sub' }, p.personality)));
  if (p.visible && p.status) head.append(el('span', { className: 'status' }, `目前：${p.status}`));
  card.append(head);
  if (p.errors.length) {
    card.append(el('div', { className: 'sub' }, '這隻貓的寵物包有問題，暫時不能使用：'),
      el('ul', { className: 'errors' }, ...p.errors.map(e => el('li', {}, e))));
    return card;
  }
  const visible = el('input', { type: 'checkbox', className: 'visible', checked: p.visible });
  visible.addEventListener('change', () => act({ kind: 'pet', id: p.id, visible: visible.checked }));
  const auto = el('input', { type: 'checkbox', className: 'auto', checked: p.auto });
  auto.addEventListener('change', () => act({ kind: 'pet', id: p.id, auto: auto.checked }));
  const scale = el('input', { type: 'range', className: 'scale', min: '0.6', max: '1.5', step: '0.05', value: String(p.scale) });
  scale.addEventListener('change', () => act({ kind: 'pet', id: p.id, scale: Number(scale.value) }));
  card.append(el('div', { className: 'row' },
    el('label', {}, visible, '出現在桌面'), el('label', {}, auto, '自動行動'), el('label', {}, '大小', scale)));
  const cmds = el('div', { className: 'commands' });
  for (const c of p.commands) {
    const b = el('button', { className: 'cmd', textContent: c.label, disabled: !p.visible });
    b.dataset.pose = c.pose;
    b.addEventListener('click', () => act({ kind: 'command', id: p.id, pose: c.pose }));
    cmds.append(b);
  }
  card.append(cmds);
  return card;
}

function remindersTab(): HTMLElement[] {
  const rows: HTMLElement[] = REMINDER_ROWS.map(([key, label]) => {
    const sel = el('select');
    sel.dataset.reminder = key;
    for (const c of CHOICES) sel.append(el('option', { value: String(c), textContent: c ? `每 ${c} 分鐘` : '關閉', selected: state.reminders[key] === c }));
    sel.addEventListener('change', () => act(reminderPatch(key, Number(sel.value))));
    return el('div', { className: 'line' }, el('span', {}, label), sel);
  });
  const notify = el('input', { type: 'checkbox', className: 'notify', checked: state.reminders.notify });
  notify.addEventListener('change', () => act({ kind: 'reminders', notify: notify.checked }));
  const test = el('button', { className: 'plain test-reminder', textContent: '試一次提醒' });
  test.addEventListener('click', () => act({ kind: 'testReminder' }));
  rows.push(el('div', { className: 'line' }, el('label', {}, notify, '同時跳出 Windows 通知'), test));
  return [el('div', { className: 'card' }, ...rows)];
}

function settingsTab(): HTMLElement[] {
  const autostart = el('input', { type: 'checkbox', className: 'autostart', checked: state.autoStart });
  autostart.addEventListener('change', () => act({ kind: 'autoStart', on: autostart.checked }));
  const reset = el('button', { className: 'plain reset-positions', textContent: '把所有貓放回工作列' });
  reset.addEventListener('click', () => act({ kind: 'resetPositions' }));
  return [el('div', { className: 'card' },
    el('div', { className: 'line' }, el('label', {}, autostart, '開機自動啟動')),
    el('div', { className: 'line' }, el('span', {}, '貓咪跑到奇怪的地方時'), reset),
    el('div', { className: 'line' }, el('span', {}, '版本'), `v${state.version}`))];
}

function render(): void {
  const w = $('warning');
  w.hidden = !state.warning;
  w.textContent = state.warning ?? '';
  $('tab-pets').replaceChildren(...state.pets.map(petCard),
    el('div', { className: 'card sub' }, '之後做好的貓咪會出現在這裡'));
  $('tab-reminders').replaceChildren(...remindersTab());
  $('tab-settings').replaceChildren(...settingsTab());
}

api.onState(s => { state = s; render(); });
void api.getState().then(s => { state = s; render(); });
```

- [ ] **Step 8: 寫整合測試** `tests/e2e/panel.spec.ts`

```ts
import { test, expect } from '@playwright/test';
import { controllerCall, launch, panelPage, petPage } from './helpers';

test('the panel lists both cats and can show the second one next to the first', async () => {
  const { app } = await launch();
  await petPage(app, 'testcat');
  await controllerCall(app, c => c.openPanel());
  const panel = await panelPage(app);
  await expect(panel.locator('[data-pet] .name')).toHaveText(['測試貓', '測試貓二號']);
  await panel.locator('[data-pet="testcat2"] input.visible').check();
  await petPage(app, 'testcat2');
  const centers = await controllerCall(app, c => [...c.pets.values()].map((p: any) => {
    const b = p.win.getBounds();
    return b.x + p.pack.poses[p.pack.start].centerX * b.width;
  }));
  const bodyWidth = await controllerCall(app, c => c.pets.get('testcat').win.getBounds().width * 0.35);
  expect(Math.abs(centers[0] - centers[1])).toBeGreaterThanOrEqual(bodyWidth);
  await panel.locator('[data-pet="testcat2"] input.visible').uncheck();
  await expect.poll(() => controllerCall(app, c => [...c.pets.keys()])).toEqual(['testcat']);
  await app.close();
});

test('a panel command reaches the cat', async () => {
  const { app } = await launch();
  const page = await petPage(app);
  await page.evaluate(() => { (window as any).__pet.engine.auto = false; });
  await controllerCall(app, c => c.openPanel());
  const panel = await panelPage(app);
  await panel.locator('[data-pet="testcat"] button[data-pose="sit"]').click();
  await expect.poll(() => page.evaluate(() => (window as any).__pet.history.join(',')), { timeout: 15_000 }).toMatch(/rest_to_sit,idle_sit/);
  await app.close();
});
```

- [ ] **Step 9: 執行全部測試**

Run: `npm test && npm run test:e2e`
Expected: 全部 PASS

- [ ] **Step 10: 手動確認**

Run: `DESKTOP_PET_PACKS=tests/fixtures/packs npm start`
Expected: 系統列有灰色小圖示；左鍵打開控制面板，三個分頁都能切換；右鍵選單的每一項都有作用；「結束」會關掉程式。

- [ ] **Step 11: Commit**

```bash
git add src tests
git commit -m "Add the tray menu and the control panel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: 健康提醒

**Files:**
- Modify: `src/main/controller.ts`、`src/pet/pet.ts`
- Test: `tests/e2e/reminders.spec.ts`

**Interfaces:**
- Consumes: `ReminderScheduler`（Task 5）、`reminderLine`（Task 4）、`Bubbles.ask`（Task 11）、控制器的 `setReminders / testReminder / pauseReminders / resumeReminders` 空殼（Task 12）
- Produces: 控制器欄位 `scheduler: ReminderScheduler`；提醒的真正行為；`REMINDER_TICK_MS = 15_000`、`BUBBLE_MS = 15_000`、`PAUSE_MS = 3_600_000`

- [ ] **Step 1: 寫會失敗的整合測試** `tests/e2e/reminders.spec.ts`

```ts
import { test, expect } from '@playwright/test';
import { controllerCall, launch, petPage } from './helpers';

test('a reminder bubble asks, and snoozing pushes the timer 10 minutes', async () => {
  const { app } = await launch();
  const page = await petPage(app);
  await controllerCall(app, c => c.setReminders({ notify: false }));
  await controllerCall(app, c => c.testReminder());
  const bubble = page.locator('.bubble.reminder');
  await expect(bubble).toContainText('喝水。');
  const before = Date.now();
  await bubble.locator('button', { hasText: '10 分鐘後' }).click();
  await expect(bubble).toHaveCount(0);
  await expect.poll(() => controllerCall(app, c => c.scheduler.nextAt('water'))).toBeGreaterThanOrEqual(before + 10 * 60_000 - 5_000);
  await app.close();
});

test('pausing from the tray holds reminders for an hour', async () => {
  const { app } = await launch();
  await petPage(app);
  await controllerCall(app, c => c.pauseReminders());
  const paused = await controllerCall(app, c => [c.scheduler.isPaused(Date.now()), c.settings.reminders.pausedUntil]);
  expect(paused[0]).toBe(true);
  expect(paused[1]).toBeGreaterThan(Date.now() + 59 * 60_000);
  await controllerCall(app, c => c.resumeReminders());
  expect(await controllerCall(app, c => c.scheduler.isPaused(Date.now()))).toBe(false);
  await app.close();
});
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `npm run test:e2e -- reminders`
Expected: FAIL（`c.scheduler` 不存在，泡泡沒出現）

- [ ] **Step 3: 控制器的提醒** — 修改 `src/main/controller.ts`

import 區加上：

```ts
import { Notification, powerMonitor } from 'electron';
import { ReminderScheduler } from '../shared/reminders';
import { reminderLine } from '../shared/lines';
import type { ReminderType } from '../shared/types';
```

檔案上方常數區加上：

```ts
const REMINDER_TICK_MS = 15_000;
const PAUSE_MS = 3_600_000;
const FALLBACK_LINES: Record<ReminderType, string> = { water: '該喝水了。', stretch: '起來動一動。', eyes: '讓眼睛休息一下。' };
```

class 欄位區加上：

```ts
  scheduler!: ReminderScheduler;
```

在 `start()` 最後加上：

```ts
    const r = this.settings.reminders;
    this.scheduler = new ReminderScheduler({ water: r.water, stretch: r.stretch, eyes: r.eyes }, Date.now());
    if (r.pausedUntil && r.pausedUntil > Date.now()) this.scheduler.pause(r.pausedUntil);
    setInterval(() => this.tickReminders(), REMINDER_TICK_MS);
    const pauseAll = (paused: boolean) => { for (const p of this.pets.values()) p.send('pet:pause', paused); };
    powerMonitor.on('suspend', () => pauseAll(true));
    powerMonitor.on('lock-screen', () => pauseAll(true));
    powerMonitor.on('resume', () => { pauseAll(false); this.scheduler.resetAll(Date.now()); });
    powerMonitor.on('unlock-screen', () => { pauseAll(false); this.scheduler.resetAll(Date.now()); });
```

把 Task 12 留下的四個空殼（`setReminders`、`testReminder`、`pauseReminders`、`resumeReminders`）和 `protected onReminderResult(...)` 換成：

```ts
  setReminders(patch: { water?: number; stretch?: number; eyes?: number; notify?: boolean }): void {
    const r = this.settings.reminders;
    Object.assign(r, patch);
    this.scheduler.setIntervals({ water: r.water, stretch: r.stretch, eyes: r.eyes }, Date.now());
    this.saveSoon();
    this.changed();
  }

  testReminder(): void { this.deliver('water'); }

  pauseReminders(): void {
    const until = Date.now() + PAUSE_MS;
    this.settings.reminders.pausedUntil = until;
    this.scheduler.pause(until);
    this.saveSoon();
    this.changed();
  }

  resumeReminders(): void {
    this.settings.reminders.pausedUntil = null;
    this.scheduler.resume(Date.now());
    this.saveSoon();
    this.changed();
  }

  protected onReminderResult(_id: string, type: string, result: string): void {
    const t = type as ReminderType;
    if (result === 'snooze') this.scheduler.snooze(t, Date.now());
    else this.scheduler.done(t, Date.now());
  }

  private tickReminders(): void {
    const now = Date.now();
    if (this.settings.reminders.pausedUntil && now >= this.settings.reminders.pausedUntil) {
      this.settings.reminders.pausedUntil = null;
      this.saveSoon();
      this.changed();
    }
    for (const t of this.scheduler.due(now)) this.deliver(t);
  }

  /** The first visible cat (in panel order) says it; without a cat only the notification shows. */
  private deliver(type: ReminderType): void {
    const id = this.settings.petOrder.find(i => this.pets.has(i));
    const pet = id ? this.pets.get(id) : undefined;
    if (pet) pet.send('pet:reminder', type);
    else this.scheduler.done(type, Date.now());
    if (this.settings.reminders.notify && Notification.isSupported()) {
      const body = pet ? reminderLine(pet.pack, type, pet.pack.start) : FALLBACK_LINES[type];
      new Notification({ title: '毛孩桌寵', body }).show();
    }
    this.log.info(`提醒：${type}${pet ? `（${pet.id}）` : '（沒有貓在桌面上）'}`);
  }
```

- [ ] **Step 4: 貓咪畫面的提醒泡泡** — 修改 `src/pet/pet.ts`

import 區把 lines 那行換成：

```ts
import { clickLine, commandLine, pickLine, reminderLine } from '../shared/lines';
```

在 `api.onRestY(...)` 那行後面加上：

```ts
  const DONE_LABEL = { water: '喝好了', stretch: '動好了', eyes: '休息好了' } as const;
  api.onReminder(type => {
    bubbles.ask(reminderLine(pack, type, engine.endPose), [
      { label: DONE_LABEL[type], onClick: () => api.reminderResult(type, 'done') },
      { label: '10 分鐘後', onClick: () => api.reminderResult(type, 'snooze') },
    ], 15_000, () => api.reminderResult(type, 'done'));
  });
```

- [ ] **Step 5: 執行測試，確認通過**

Run: `npm run test:e2e`
Expected: 全部 PASS

- [ ] **Step 6: 手動確認**

Run: `DESKTOP_PET_PACKS=tests/fixtures/packs npm start`，在控制面板「健康提醒」按「試一次提醒」
Expected: 色塊頭上出現「喝水。」泡泡和兩個按鈕，按鈕點得到（其他透明處仍然穿透）；Windows 右下角跳出通知；關掉「同時跳出 Windows 通知」後再試一次，就只有泡泡。

- [ ] **Step 7: Commit**

```bash
git add src tests
git commit -m "Wire health reminders to cats, notifications and power events

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: 開機啟動、單一執行、第一次執行、螢幕變化、效能記錄

**Files:**
- Modify: `src/main/main.ts`、`src/main/controller.ts`
- Test: `tests/e2e/lifecycle.spec.ts`

**Interfaces:**
- Consumes: `AppController`（Task 10～13）
- Produces: 第一次執行自動打開控制面板；`applyAutoStart()` 的實作（只在打包後的版本註冊）；第二次開程式時打開控制面板；螢幕解析度改變時把貓拉回工作區域；`DESKTOP_PET_METRICS=1` 時每分鐘記錄 CPU 和記憶體

- [ ] **Step 1: 寫會失敗的整合測試** `tests/e2e/lifecycle.spec.ts`

```ts
import { test, expect } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { controllerCall, launch, panelPage, petPage } from './helpers';

test('the first run opens the panel once and remembers it', async () => {
  const userDir = mkdtempSync(join(tmpdir(), 'dpet-first-'));
  const first = await launch({}, userDir);
  await panelPage(first.app);
  await controllerCall(first.app, c => c.flush());
  await first.app.close();

  const second = await launch({}, userDir);
  await petPage(second.app);
  await second.app.firstWindow();
  await expect.poll(() => second.app.windows().filter(w => w.url().endsWith('/ui/panel.html')).length).toBe(0);
  await second.app.close();
});

test('a dragged position survives a restart', async () => {
  const userDir = mkdtempSync(join(tmpdir(), 'dpet-pos-'));
  const first = await launch({}, userDir);
  await petPage(first.app);
  await controllerCall(first.app, c => { c.settings.pets.testcat.x = 0.25; c.flush(); });
  await first.app.close();

  const second = await launch({}, userDir);
  await petPage(second.app);
  expect(await controllerCall(second.app, c => c.settings.pets.testcat.x)).toBeCloseTo(0.25, 2);
  await second.app.close();
});
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `npm run test:e2e -- lifecycle`
Expected: FAIL（第一次執行沒有打開控制面板）

- [ ] **Step 3: 控制器** — 修改 `src/main/controller.ts`

（`screen` 在 Task 10 已經匯入，不用再加。）

在 `start()` 最後加上：

```ts
    if (!this.settings.firstRunDone) {
      this.openPanel();
      this.settings.firstRunDone = true;
      this.saveSoon();
    }
    this.applyAutoStart();
    screen.on('display-metrics-changed', () => this.relayoutAll());
    if (process.env.DESKTOP_PET_METRICS === '1') setInterval(() => this.logMetrics(), 60_000);
```

把 `protected applyAutoStart(): void {}` 換成：

```ts
  /** Registering electron.exe during development would be wrong, so only the installed app registers itself. */
  protected applyAutoStart(): void {
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: this.settings.autoStart });
  }

  /** After a resolution or monitor change, pull every cat back onto the work area's bottom edge. */
  relayoutAll(): void {
    const wa = this.workArea();
    for (const [id, pet] of this.pets) {
      const ps = this.settings.pets[id];
      pet.setBounds(windowBounds(pet.pack, ps.scale, ps.x ?? DEFAULT_X, wa));
      const y = restY(pet.pack, ps.scale, wa);
      pet.updateInit({ restY: y });
      pet.send('pet:rest-y', y);
    }
  }

  private logMetrics(): void {
    const m = app.getAppMetrics();
    const cpu = m.reduce((s, p) => s + p.cpu.percentCPUUsage, 0);
    const memMb = m.reduce((s, p) => s + p.memory.workingSetSize, 0) / 1024;
    this.log.info(`效能：CPU ${cpu.toFixed(1)}%，記憶體 ${memMb.toFixed(0)} MB，貓 ${this.pets.size} 隻`);
  }
```

- [ ] **Step 4: 單一執行** — 把 `src/main/main.ts` 的 `void app.whenReady()...` 整段換成：

```ts
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let controller: AppController | null = null;
  app.on('second-instance', () => controller?.openPanel());
  void app.whenReady().then(() => {
    const log = new Logger(paths.logsDir);
    log.info(`啟動 ${app.getVersion()}`);
    handleAppProtocol({ ui: paths.uiDir, packs: paths.packsDir });
    controller = new AppController(paths, log, debug);
    if (debug) (globalThis as Record<string, unknown>).__controller = controller;
    controller.start();
    app.on('before-quit', () => controller?.flush());
  });
}
```

- [ ] **Step 5: 執行全部測試**

Run: `npm test && npm run test:e2e`
Expected: 全部 PASS

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "First-run panel, single instance, autostart, display changes and metrics

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: 把小昭轉成寵物包

**前提：** 試驗資料夾 `C:\Users\USER\pet-ai-spike\work\xz\final\clips\` 已經有附錄 A 的 14 段片段（`idle_lie`、`idle_lie_groom`、`idle_sit`、`lie_to_sit`、`sit_to_lie`、`idle_sleep`、`lie_to_sleep`、`sleep_to_lie`、`box_enter`、`box_idle`、`box_exit`、`pillow_enter`、`pillow_idle`、`pillow_exit`），`final\` 裡也有定稿圖 `lie.png`、`sit.png`、`sleep.png`、`end_box.png`、`end_pillow.png`，其中 `sit.png`、`sleep.png` 必須是飼主確認過眼睛的版本。少任何一個就停下來回報，不要自己生成。

**Files:**
- Create: `tools/convert_xiaozhao.py`
- Create（產生）：`packs/xiaozhao/pack.json`、`packs/xiaozhao/portrait.png`、`packs/xiaozhao/clips/*.webm`

**Interfaces:**
- Consumes: 規格第 5 節格式、附錄 A；`npm run check-pack`（Task 7）
- Produces: 通過檢查的 `packs/xiaozhao`

- [ ] **Step 1: 寫轉換工具** `tools/convert_xiaozhao.py`

```python
"""Convert 小昭's approved clips from the feasibility spike into a desktop-pet pack (spec 2026-09-27, appendix A).

Run with the spike's Python (it has numpy, Pillow and imageio-ffmpeg):
  C:/Users/USER/pet-ai-spike/.venv/Scripts/python.exe tools/convert_xiaozhao.py
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg
import numpy as np
from PIL import Image

CLIPS = ['idle_lie', 'idle_lie_groom', 'idle_sit', 'lie_to_sit', 'sit_to_lie', 'idle_sleep', 'lie_to_sleep', 'sleep_to_lie',
         'box_enter', 'box_idle', 'box_exit', 'pillow_enter', 'pillow_idle', 'pillow_exit']
STILLS = {'lie': 'lie.png', 'sit': 'sit.png', 'sleep': 'sleep.png', 'boxBelly': 'end_box.png', 'pillow': 'end_pillow.png'}
GROUND = 652 / 720          # every still was staged with the feet / prop bottom on this line
FF = imageio_ffmpeg.get_ffmpeg_exe()


def keyed_alpha(img: Image.Image) -> np.ndarray:
    a = np.asarray(img.convert('RGB')).astype(np.float32)
    bg = np.median(np.concatenate([a[:15].reshape(-1, 3), a[:, :15].reshape(-1, 3), a[:, -15:].reshape(-1, 3)]), axis=0)
    return np.clip((np.linalg.norm(a - bg, axis=2) - 40) / 60, 0, 1)


def geometry(still: Path) -> dict:
    al = keyed_alpha(Image.open(still))
    ys, xs = np.nonzero(al > 0.5)
    h, w = al.shape
    return {'ground': round(GROUND, 3), 'centerX': round(float(xs.min() + xs.max()) / 2 / w, 3), 'head': round(GROUND - ys.min() / h, 3)}


def bg_colour(src: Path) -> str:
    raw = subprocess.run([FF, '-v', 'error', '-i', str(src), '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '64x36', '-'],
                         capture_output=True, check=True).stdout
    f = np.frombuffer(raw, np.uint8).reshape(36, 64, 3)
    bg = np.concatenate([f[:3, :3].reshape(-1, 3), f[:3, -3:].reshape(-1, 3)]).mean(0)
    return '0x%02X%02X%02X' % tuple(int(round(c)) for c in bg)


def key_clip(src: Path, dst: Path) -> None:
    vf = f'scale=960:540,format=rgba,chromakey={bg_colour(src)}:0.14:0.06,despill=type=green:mix=0.6:expand=0.1'
    subprocess.run([FF, '-y', '-loglevel', 'error', '-i', str(src), '-vf', vf, '-r', '24', '-c:v', 'libvpx-vp9',
                    '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '32', '-auto-alt-ref', '0', '-an', str(dst)], check=True)


def portrait(lie: Path, dst: Path) -> None:
    img = Image.open(lie).convert('RGB')
    al = keyed_alpha(img)
    ys, xs = np.nonzero(al > 0.5)
    top = ys.min()
    band = al[top:top + 60] > 0.5
    cx = np.nonzero(band.any(0))[0].mean()
    size = 220
    box = (int(cx - size / 2), int(top - 10), int(cx + size / 2), int(top - 10 + size))
    rgba = np.dstack([np.asarray(img), (al * 255).astype(np.uint8)])
    Image.fromarray(rgba, 'RGBA').crop(box).resize((256, 256), Image.LANCZOS).save(dst)


def build_pack(geo: dict) -> dict:
    lie = geo['lie']
    return {
        'schemaVersion': 1, 'id': 'xiaozhao', 'name': '小昭', 'personality': '淡定、愛翻肚、最愛紙箱', 'portrait': 'portrait.png',
        'frame': {'aspect': round(16 / 9, 4), 'displayHeight': 440},
        'start': 'lie',
        'poses': {
            'lie': {'label': '趴著', 'idle': ['idle_lie', 'idle_lie_groom'], **lie, 'shadow': True, 'draggable': True, 'stay': 0.7, 'autoWeight': 1},
            'sit': {'label': '坐著', 'idle': ['idle_sit'], **geo['sit'], 'shadow': True, 'draggable': False, 'stay': 0.6, 'autoWeight': 0.6},
            'sleep': {'label': '睡覺', 'idle': ['idle_sleep'], **geo['sleep'], 'shadow': True, 'draggable': False, 'asleep': True, 'stay': 0.85, 'autoWeight': 0.8},
            'lieBox': {'label': '（紙箱出現）', 'transient': True, **lie, 'shadow': True},
            'boxBelly': {'label': '紙箱翻肚', 'idle': ['box_idle'], **geo['boxBelly'], 'shadow': False, 'draggable': False, 'asleep': True, 'stay': 0.85, 'autoWeight': 1.4},
            'liePillow': {'label': '（抱枕出現）', 'transient': True, **lie, 'shadow': True},
            'pillow': {'label': '藍色抱枕', 'idle': ['pillow_idle'], **geo['pillow'], 'shadow': False, 'draggable': False, 'stay': 0.7, 'autoWeight': 1},
        },
        'clips': {c: {'file': f'clips/{c}.webm', **({'rate': 0.8} if c in ('box_exit', 'pillow_enter') else {})} for c in CLIPS},
        'edges': [
            {'from': 'lie', 'to': 'sit', 'clip': 'lie_to_sit'}, {'from': 'sit', 'to': 'lie', 'clip': 'sit_to_lie'},
            {'from': 'lie', 'to': 'sleep', 'clip': 'lie_to_sleep'}, {'from': 'sleep', 'to': 'lie', 'clip': 'sleep_to_lie'},
            {'from': 'lie', 'to': 'lieBox', 'fade': 0.5}, {'from': 'lieBox', 'to': 'boxBelly', 'clip': 'box_enter'},
            {'from': 'boxBelly', 'to': 'lieBox', 'clip': 'box_exit'}, {'from': 'lieBox', 'to': 'lie', 'fade': 0.5},
            {'from': 'lie', 'to': 'liePillow', 'fade': 0.5}, {'from': 'liePillow', 'to': 'pillow', 'clip': 'pillow_enter'},
            {'from': 'pillow', 'to': 'liePillow', 'clip': 'pillow_exit'}, {'from': 'liePillow', 'to': 'lie', 'fade': 0.5},
        ],
        'lines': {
            'greet': ['……喵。'],
            'click': {
                'default': ['……', '嗯。', '喵。', '（慢慢眨眼）'],
                'sit': ['……', '嗯？', '（歪頭）'],
                'sleep': ['……zzz', '（耳朵動了一下）', '……（不為所動）'],
                'boxBelly': ['……zzz', '（耳朵動了一下）', '……（不為所動）'],
            },
            'drag': ['……隨便你', '（液態貓）'],
            'noDrag': ['……（不想動）'],
            'command': {'lie': '……嗯。', 'sit': '……好啦。', 'sleep': '呼啊——', 'boxBelly': '（盯——紙箱）', 'pillow': '（看了抱枕一眼）'},
            'reminders': {
                'water': {'default': '……該喝水了。', 'sleep': '……（睡夢中）去喝水。', 'boxBelly': '……（睡夢中）去喝水。'},
                'stretch': {'default': '……起來動一動。', 'sleep': '……（睡夢中）起來動一動。', 'boxBelly': '……（睡夢中）起來動一動。'},
                'eyes': {'default': '……眼睛休息一下。', 'sleep': '……（睡夢中）眼睛休息一下。', 'boxBelly': '……（睡夢中）眼睛休息一下。'},
            },
        },
        'clickHeart': True,
        'commands': [{'label': '趴著', 'pose': 'lie'}, {'label': '坐下', 'pose': 'sit'}, {'label': '睡覺', 'pose': 'sleep'},
                     {'label': '紙箱翻肚', 'pose': 'boxBelly'}, {'label': '藍色抱枕', 'pose': 'pillow'}],
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default='C:/Users/USER/pet-ai-spike/work/xz/final')
    ap.add_argument('--out', default='packs/xiaozhao')
    args = ap.parse_args()
    src, out = Path(args.src), Path(args.out)
    missing = [f'clips/{c}.mp4' for c in CLIPS if not (src / 'clips' / f'{c}.mp4').exists()] + \
              [s for s in STILLS.values() if not (src / s).exists()]
    if missing:
        print('缺少這些素材，先把它們做好再轉換：', *missing, sep='\n  ')
        return 1
    (out / 'clips').mkdir(parents=True, exist_ok=True)
    for c in CLIPS:
        key_clip(src / 'clips' / f'{c}.mp4', out / 'clips' / f'{c}.webm')
        print('keyed', c)
    geo = {pose: geometry(src / f) for pose, f in STILLS.items()}
    portrait(src / 'lie.png', out / 'portrait.png')
    (out / 'pack.json').write_text(json.dumps(build_pack(geo), ensure_ascii=False, indent=1), encoding='utf-8')
    print('geometry', json.dumps(geo, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
```

- [ ] **Step 2: 執行轉換**

Run: `C:/Users/USER/pet-ai-spike/.venv/Scripts/python.exe tools/convert_xiaozhao.py`
Expected: 印出 14 行 `keyed ...` 和一行 `geometry {...}`；若印出「缺少這些素材」就停下來回報

- [ ] **Step 3: 檢查寵物包**

Run: `npm run build && npm run check-pack -- packs/xiaozhao`
Expected: `✓ xiaozhao：沒有問題`

- [ ] **Step 4: 看小昭本人**

Run: `npm start`
Expected（對照附錄 A 逐項確認）：
- 第一次執行打開控制面板，小昭趴在工作列上，冒出「……喵。」
- 右鍵的五個指令都走得到，而且回得來：坐下、睡覺、紙箱翻肚（紙箱淡入、走進去翻肚、「（盯——紙箱）」）、藍色抱枕、趴著
- 睡覺和紙箱翻肚時點牠不冒愛心；趴著時可以拖，其他姿勢會說「……（不想動）」
- 走出紙箱、爬上抱枕是慢速
- 在紙箱裡時提醒會變成「……（睡夢中）去喝水。」

- [ ] **Step 5: Commit**

```bash
git add tools/convert_xiaozhao.py packs/xiaozhao
git commit -m "Add 小昭's pet pack converted from the approved clips

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: 安裝檔與上線前檢查

**Files:**
- Modify: `package.json`（新增 `build` 設定）
- Create: `docs/release-checklist.md`

**Interfaces:**
- Consumes: 全部前面的任務
- Produces: `release\毛孩桌寵 Setup 0.1.0.exe`；上線前檢查清單

- [ ] **Step 1: 在 `package.json` 加上 electron-builder 設定**

```json
  "build": {
    "appId": "local.desktoppet",
    "productName": "毛孩桌寵",
    "directories": { "output": "release" },
    "files": ["dist/**", "package.json"],
    "extraResources": [{ "from": "packs", "to": "packs", "filter": ["**/*"] }],
    "win": { "target": "nsis" },
    "nsis": { "oneClick": false, "perMachine": false, "allowToChangeInstallationDirectory": true }
  }
```

- [ ] **Step 2: 產生安裝檔**

Run: `npm run dist`
Expected: `release/` 裡出現 `毛孩桌寵 Setup 0.1.0.exe`

- [ ] **Step 3: 寫上線前檢查清單** `docs/release-checklist.md`

```markdown
# 上線前檢查清單

每次產生新的安裝檔後，在自己的電腦上逐項確認：

## 安裝
- [ ] 執行安裝檔（未簽署，Windows 會出現「Windows 已保護您的電腦」：按「其他資訊」→「仍要執行」）
- [ ] 安裝完成後小昭出現在工作列上方，控制面板自動打開
- [ ] 重新開機後小昭自動出現（開機自動啟動）；在設定分頁關掉後重開機，就不再自動出現

## 互動
- [ ] 透明的地方點擊會穿透到後面的程式
- [ ] 點小昭出現台詞；睡覺和紙箱翻肚時不冒愛心
- [ ] 趴著時可以拖曳，放開落回工作列；其他姿勢只說「……（不想動）」
- [ ] 右鍵選單的每一項都有作用
- [ ] 系統列圖示左鍵打開控制面板、右鍵選單每一項都有作用、「結束」會關掉程式

## 多隻貓（有第二隻貓的寵物包時）
- [ ] 讓兩隻都出現，不會疊在一起
- [ ] 各自的位置和大小在重開程式後都還在

## 健康提醒
- [ ] 「試一次提醒」出現泡泡和按鈕；按鈕點得到
- [ ] 「10 分鐘後」會在 10 分鐘後再提醒；「好了」或 15 秒沒理會，照設定的間隔重新計時
- [ ] 鎖定螢幕再解鎖，提醒重新計時、小昭繼續動

## 其他
- [ ] 看全螢幕影片、玩全螢幕遊戲時小昭不會卡住畫面
- [ ] 改螢幕解析度後，小昭回到工作列上方
- [ ] 效能：用 `DESKTOP_PET_METRICS=1` 啟動，放著一小時，記錄檔裡 CPU 平均 5% 以下、記憶體 250 MB 以下，而且沒有持續上升
```

- [ ] **Step 4: 照清單實際測一次，並把結果回報給飼主**

Run: 安裝 `release\毛孩桌寵 Setup 0.1.0.exe`，照 `docs/release-checklist.md` 逐項確認
Expected: 全部打勾；沒過的項目記下原因，回報給飼主，不要默默略過

- [ ] **Step 5: Commit**

```bash
git add package.json docs/release-checklist.md
git commit -m "Package the app as an NSIS installer and add a release checklist

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

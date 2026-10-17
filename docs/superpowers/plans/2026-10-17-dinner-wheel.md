# 晚餐轉盤 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 小昭頭上的第三種卡片「今晚吃什麼」：轉盤選晚餐，菜單在卡片背面改，轉的時候卡片下的貓坐起來往上拍，轉完說出答案，避開昨天最後轉到的菜。

**Architecture:** 新的卡片種類 `dinner` 併入現有的 `CardController`／`CardWindow`／`card.html`。選菜、菜單規則、「昨天的菜」是 `src/shared/dinner.ts` 的純函式；主程式選好菜後叫貓拍（`pet:spin`），貓在爪子最高點回報（`pet:spin-hit`），主程式才叫卡片轉；卡片轉完回報（`spun`），主程式記錄並叫貓說話（`pet:dish`）。轉盤卡片用 CSS `zoom: 1.3` 放大、視窗寬 242 px；`layoutCards` 改成任意張數排成一排。

**Tech Stack:** TypeScript、Electron 44、esbuild、vitest（單元）、Playwright `_electron`（端到端，只在隱藏桌面跑）、Python（spike 的 venv，轉換程式）。

**Spec:** `docs/superpowers/specs/2026-10-17-dinner-wheel-design.md`

## Global Constraints

- 介面文字一律繁體中文；卡片標題「今晚吃什麼」、右鍵選單「今晚吃什麼」、面板名稱「{貓名}的晚餐轉盤」。
- 提醒事項、備忘錄卡片寬度維持 186 px；轉盤卡片 242 px（186 × 1.3 取整數）。
- 菜單：最少 2 樣、最多 12 樣；每樣 1～6 個字（去掉前後空白，以字元算）；不能重複。預設：便當、牛肉麵、滷肉飯、水餃、拉麵、火鍋、咖哩飯、炒飯。
- 轉盤卡片每天 17:30 自己跳出（`daily: 1050`），其他自動跳出預設關。
- 「日」用 `helloDay`（凌晨 5:00 換日，跟提醒事項一樣）；避開的是昨天**最後一次**轉到的菜；重轉次數不限。
- 主程式送出「拍轉盤」後最多等 4 秒，就算沒收到「拍到了」也開始轉；轉動 3.2 秒；說完約 5 秒貓咪回到 `pack.start`。
- 端到端測試**只能**用 `npm.cmd run test:e2e:hidden -- <spec>`（隱藏桌面）；絕不在主人的螢幕上跑 `playwright test`。
- PowerShell 會擋 `npm.ps1`：在 PowerShell 裡用 `npm.cmd`，或用 Bash 工具跑 `npm`。
- 寵物包 `packs/*/pack.json` 不手改：改轉換程式 `tools/convert_*.py` 再重新產生（用 `C:/Users/USER/pet-ai-spike/.venv/Scripts/python.exe`）。
- 不花 API 的錢、不做新影片。
- 這個資料夾有其他 session 共用：只 `git add` 自己改的檔案，不要 `git add -A`。commit 訊息用一句話描述行為（照 `git log` 的寫法），最後一行 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- 做完、測過之後先問主人要不要打包安裝檔，不要自己打包。

---

### Task 1: 菜單規則、選菜與「昨天的菜」

**Files:**
- Create: `src/shared/dinner.ts`
- Test: `tests/unit/dinner.test.ts`

**Interfaces:**
- Consumes: `helloDay(d: Date): string` from `src/shared/time-events.ts`
- Produces:
  - `DEFAULT_DISHES: string[]`, `MIN_DISHES = 2`, `MAX_DISHES = 12`, `MAX_DISH_CHARS = 6`, `SPIN_TURNS = 5`
  - `interface DinnerDay { day: string; dish: string }`
  - `interface Dinner { items: string[]; last: DinnerDay | null; prev: DinnerDay | null }`
  - `type DishChange = { items: string[] } | { error: string }`
  - `defaultDinner(): Dinner`
  - `normalizeDinner(raw: unknown): Dinner`
  - `addDish(items: string[], text: string): DishChange`
  - `renameDish(items: string[], from: string, to: string): DishChange`
  - `removeDish(items: string[], dish: string): DishChange`
  - `dishToAvoid(d: Dinner, now: number): string | null`
  - `pickDish(d: Dinner, now: number, rng: () => number): string`
  - `recordDish(d: Dinner, dish: string, now: number): Dinner`
  - `spinTo(current: number, index: number, count: number, turns?: number): number`

- [ ] **Step 1: Write the failing tests**

`tests/unit/dinner.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { addDish, defaultDinner, DEFAULT_DISHES, dishToAvoid, normalizeDinner, pickDish, recordDish, removeDish, renameDish, spinTo, type Dinner } from '../../src/shared/dinner';
import { constRng } from './fixtures';

const at = (y: number, m: number, d: number, h = 18) => new Date(y, m - 1, d, h).getTime();
const dinner = (items: string[], last: Dinner['last'] = null, prev: Dinner['prev'] = null): Dinner => ({ items, last, prev });

describe('the menu', () => {
  it('adds a dish, trimmed, up to six characters, once, up to twelve', () => {
    expect(addDish(['便當', '拉麵'], ' 水餃 ')).toEqual({ items: ['便當', '拉麵', '水餃'] });
    expect(addDish(['便當', '拉麵'], '   ')).toEqual({ error: '先輸入菜色' });
    expect(addDish(['便當', '拉麵'], '麥當勞大麥克')).toEqual({ items: ['便當', '拉麵', '麥當勞大麥克'] });
    expect(addDish(['便當', '拉麵'], '麥當勞大麥克餐')).toEqual({ error: '最多 6 個字' });
    expect(addDish(['便當', '拉麵'], '拉麵')).toEqual({ error: '已經有了' });
    const twelve = Array.from({ length: 12 }, (_, i) => `菜${i}`);
    expect(addDish(twelve, '水餃')).toEqual({ error: '最多 12 樣' });
  });
  it('renames a dish in its place, by the same rules', () => {
    expect(renameDish(['便當', '拉麵', '水餃'], '拉麵', '鍋貼')).toEqual({ items: ['便當', '鍋貼', '水餃'] });
    expect(renameDish(['便當', '拉麵'], '拉麵', '拉麵 ')).toEqual({ items: ['便當', '拉麵'] });   // itself is no clash
    expect(renameDish(['便當', '拉麵'], '拉麵', '便當')).toEqual({ error: '已經有了' });
    expect(renameDish(['便當', '拉麵'], '拉麵', '')).toEqual({ error: '先輸入菜色' });
    expect(renameDish(['便當', '拉麵'], '水餃', '鍋貼')).toEqual({ error: '找不到這道菜' });
  });
  it('removes a dish but keeps two', () => {
    expect(removeDish(['便當', '拉麵', '水餃'], '拉麵')).toEqual({ items: ['便當', '水餃'] });
    expect(removeDish(['便當', '拉麵'], '拉麵')).toEqual({ error: '至少要留兩樣' });
    expect(removeDish(['便當', '拉麵', '水餃'], '火鍋')).toEqual({ error: '找不到這道菜' });
  });
});

describe('normalizeDinner', () => {
  it('starts with the default menu', () => {
    expect(normalizeDinner(undefined)).toEqual({ items: DEFAULT_DISHES, last: null, prev: null });
    expect(defaultDinner().items).not.toBe(DEFAULT_DISHES);   // a copy: changing it leaves the defaults alone
  });
  it('drops broken dishes and days, keeps twelve at most, and falls back to the defaults under two', () => {
    const raw = { items: ['便當', ' 拉麵 ', '便當', '', 7, '麥當勞大麥克餐', '水餃'], last: { day: '2026-10-16', dish: '拉麵' }, prev: { day: 3 } };
    expect(normalizeDinner(raw)).toEqual({ items: ['便當', '拉麵', '水餃'], last: { day: '2026-10-16', dish: '拉麵' }, prev: null });
    expect(normalizeDinner({ items: Array.from({ length: 15 }, (_, i) => `菜${i}`) }).items).toHaveLength(12);
    expect(normalizeDinner({ items: ['便當'] }).items).toEqual(DEFAULT_DISHES);
  });
});

describe("yesterday's dish", () => {
  it("is yesterday's last spin, whether or not the wheel turned today", () => {
    const yesterday = { day: '2026-10-16', dish: '拉麵' };
    expect(dishToAvoid(dinner(['便當', '拉麵'], yesterday), at(2026, 10, 17))).toBe('拉麵');
    expect(dishToAvoid(dinner(['便當', '拉麵'], { day: '2026-10-17', dish: '便當' }, yesterday), at(2026, 10, 17))).toBe('拉麵');
  });
  it('is none from the day before yesterday, nor one no longer on the menu', () => {
    expect(dishToAvoid(dinner(['便當', '拉麵'], { day: '2026-10-15', dish: '拉麵' }), at(2026, 10, 17))).toBeNull();
    expect(dishToAvoid(dinner(['便當', '水餃'], { day: '2026-10-16', dish: '拉麵' }), at(2026, 10, 17))).toBeNull();
  });
  it('counts days as the reminders do: past midnight is still the evening before, and across months', () => {
    expect(dishToAvoid(dinner(['便當', '拉麵'], { day: '2026-10-16', dish: '拉麵' }), at(2026, 10, 18, 1))).toBe('拉麵');
    expect(dishToAvoid(dinner(['便當', '拉麵'], { day: '2026-10-31', dish: '拉麵' }), at(2026, 11, 1))).toBe('拉麵');
  });
});

describe('pickDish', () => {
  it("picks evenly, never yesterday's dish", () => {
    const d = dinner(['便當', '拉麵', '水餃'], { day: '2026-10-16', dish: '拉麵' });
    expect(pickDish(d, at(2026, 10, 17), constRng(0))).toBe('便當');
    expect(pickDish(d, at(2026, 10, 17), constRng(0.999))).toBe('水餃');
    expect(pickDish(dinner(['便當', '拉麵'], { day: '2026-10-16', dish: '便當' }), at(2026, 10, 17), constRng(0))).toBe('拉麵');
    expect(pickDish(dinner(['便當', '拉麵']), at(2026, 10, 17), constRng(0.6))).toBe('拉麵');
  });
});

describe('recordDish', () => {
  it("keeps the day's last spin, and the day before's once a new day starts", () => {
    const d1 = recordDish(dinner(['便當', '拉麵']), '便當', at(2026, 10, 16));
    expect(d1).toMatchObject({ last: { day: '2026-10-16', dish: '便當' }, prev: null });
    const d2 = recordDish(d1, '拉麵', at(2026, 10, 16, 19));   // a second spin the same day
    expect(d2).toMatchObject({ last: { day: '2026-10-16', dish: '拉麵' }, prev: null });
    const d3 = recordDish(d2, '便當', at(2026, 10, 17));
    expect(d3).toMatchObject({ last: { day: '2026-10-17', dish: '便當' }, prev: { day: '2026-10-16', dish: '拉麵' } });
    expect(dishToAvoid(d3, at(2026, 10, 17))).toBe('拉麵');
  });
});

describe('spinTo', () => {
  it('turns at least five times and stops with the slice under the pointer at the top', () => {
    const r = spinTo(0, 2, 8);
    expect(r).toBeGreaterThanOrEqual(5 * 360);
    expect(r).toBeLessThan(6 * 360);
    const under = (rot: number, n: number) => Math.floor((((360 - (rot % 360)) % 360) / (360 / n)));
    expect(under(r, 8)).toBe(2);
    const again = spinTo(r, 7, 8);
    expect(again - r).toBeGreaterThanOrEqual(5 * 360);
    expect(under(again, 8)).toBe(7);
    expect(under(spinTo(again, 0, 2), 2)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm.cmd test -- tests/unit/dinner.test.ts`
Expected: FAIL — `Failed to load url ../../src/shared/dinner`

- [ ] **Step 3: Write `src/shared/dinner.ts`**

```ts
import { helloDay } from './time-events';

/** The dishes the wheel starts with (the owner changes them on the back of the card). */
export const DEFAULT_DISHES = ['便當', '牛肉麵', '滷肉飯', '水餃', '拉麵', '火鍋', '咖哩飯', '炒飯'];
export const MIN_DISHES = 2;
export const MAX_DISHES = 12;
/** A dish's name fits on its slice up to this many characters. */
export const MAX_DISH_CHARS = 6;
/** The wheel turns at least this many whole times before it stops. */
export const SPIN_TURNS = 5;
const DAY_MS = 24 * 3600_000;

/** A day's dish: the last the wheel stopped at that day (days start at 5:00, as the reminders count them: see helloDay). */
export interface DinnerDay { day: string; dish: string }
/** notes.json's dinner wheel: the dishes round it, the latest day's dish, and the dish of the day before that one. */
export interface Dinner { items: string[]; last: DinnerDay | null; prev: DinnerDay | null }
/** A change to the menu: the dishes after it, or why it can not be made (the card shows that in red). */
export type DishChange = { items: string[] } | { error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export const defaultDinner = (): Dinner => ({ items: [...DEFAULT_DISHES], last: null, prev: null });

/** Why `text` can not be a dish beside `items` (`except`: the dish being renamed, which may keep its name), or null. */
function dishError(items: string[], text: string, except?: string): string | null {
  const t = text.trim();
  if (!t) return '先輸入菜色';
  if ([...t].length > MAX_DISH_CHARS) return `最多 ${MAX_DISH_CHARS} 個字`;
  if (items.some(d => d === t && d !== except)) return '已經有了';
  return null;
}

export function addDish(items: string[], text: string): DishChange {
  if (items.length >= MAX_DISHES) return { error: `最多 ${MAX_DISHES} 樣` };
  const e = dishError(items, text);
  return e ? { error: e } : { items: [...items, text.trim()] };
}

export function renameDish(items: string[], from: string, to: string): DishChange {
  if (!items.includes(from)) return { error: '找不到這道菜' };
  const e = dishError(items, to, from);
  return e ? { error: e } : { items: items.map(d => (d === from ? to.trim() : d)) };
}

export function removeDish(items: string[], dish: string): DishChange {
  if (!items.includes(dish)) return { error: '找不到這道菜' };
  if (items.length <= MIN_DISHES) return { error: '至少要留兩樣' };
  return { items: items.filter(d => d !== dish) };
}

function normalizeDay(raw: unknown): DinnerDay | null {
  if (!isObj(raw) || typeof raw.day !== 'string' || !raw.day || typeof raw.dish !== 'string' || !raw.dish) return null;
  return { day: raw.day, dish: raw.dish };
}

/** Whatever notes.json held, as the wheel: dishes that break the rules are dropped; under two left, the defaults. */
export function normalizeDinner(raw: unknown): Dinner {
  const r = isObj(raw) ? raw : {};
  let items: string[] = [];
  for (const d of Array.isArray(r.items) ? r.items : []) {
    if (typeof d !== 'string') continue;
    const added = addDish(items, d);
    if ('items' in added) items = added.items;
  }
  return { items: items.length >= MIN_DISHES ? items : [...DEFAULT_DISHES], last: normalizeDay(r.last), prev: normalizeDay(r.prev) };
}

/** Yesterday's dish (the last the wheel stopped at yesterday), if it is still on the menu: the wheel will not stop there today. */
export function dishToAvoid(d: Dinner, now: number): string | null {
  const today = helloDay(new Date(now));
  const yesterday = helloDay(new Date(now - DAY_MS));
  const rec = d.last?.day === today ? d.prev : d.last;
  return rec && rec.day === yesterday && d.items.includes(rec.dish) ? rec.dish : null;
}

/** Tonight's dish: any on the menu, all as likely, but not yesterday's. */
export function pickDish(d: Dinner, now: number, rng: () => number): string {
  const avoid = dishToAvoid(d, now);
  const pool = d.items.filter(x => x !== avoid);
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}

/** The wheel stopped at `dish`: it is today's (a later spin today replaces it); a new day keeps the last day's as `prev`. */
export function recordDish(d: Dinner, dish: string, now: number): Dinner {
  const day = helloDay(new Date(now));
  const prev = d.last && d.last.day !== day ? d.last : d.prev;
  return { ...d, last: { day, dish }, prev };
}

/**
 * How far (deg, clockwise) the wheel turns to, from `current`, so that slice `index` of `count` stops under the pointer at the
 * top: slice i spans i/count to (i+1)/count of a turn clockwise from the top, and the pointer lands on its middle.
 */
export function spinTo(current: number, index: number, count: number, turns = SPIN_TURNS): number {
  const want = 360 - ((index + 0.5) * 360) / count;
  return current + turns * 360 + ((((want - current) % 360) + 360) % 360);
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm.cmd test -- tests/unit/dinner.test.ts`
Expected: PASS（all tests in `dinner.test.ts`）

- [ ] **Step 5: Commit**

```bash
git add src/shared/dinner.ts tests/unit/dinner.test.ts
git commit -m "The dinner wheel's rules: its menu, tonight's pick and yesterday's dish

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 第三種卡片的資料：寵物包、notes.json、設定、台詞

**Files:**
- Modify: `src/shared/types.ts`（`CardKind`、`Pack.card`、`ToyDef.upPeak`、`PackLines.dinner`）
- Modify: `src/shared/pack.ts:170`（`card` 驗證）、`:158-168`（`toy.upPeak`）、`:148-156`（`lines.dinner`）；新增 `cardsOf`
- Modify: `src/shared/notes.ts`
- Modify: `src/shared/settings.ts:46-49`、`:74`
- Modify: `src/shared/lines.ts`
- Modify: `src/shared/toy.ts`（`UP_PEAK`）
- Test: `tests/unit/pack.test.ts:98-113`、`tests/unit/notes.test.ts`、`tests/unit/settings.test.ts:22-31`、`tests/unit/lines.test.ts`

**Interfaces:**
- Consumes: `Dinner`, `normalizeDinner` from Task 1
- Produces:
  - `type CardKind = 'memo' | 'todo' | 'dinner'`
  - `Pack.card?: CardKind | CardKind[]`（第一張是滾輪那張）
  - `cardsOf(pack: Pack): CardKind[]` in `src/shared/pack.ts`
  - `ToyDef.upPeak?: number`、`UP_PEAK = 0.45` in `src/shared/toy.ts`
  - `PackLines.dinner?: LineSet`、`dishLine(pack: Pack, dish: string, rng: Rng): string` in `src/shared/lines.ts`
  - `Notes.dinner: Dinner`
  - `Settings.cards.dinner: CardSettings`（預設 `{ start: false, resume: false, unlock: false, back: false, daily: 1050 }`）

- [ ] **Step 1: Write the failing tests**

In `tests/unit/pack.test.ts`, replace the test `'checks the optional card and alert'` (lines 98-106) and add a toy/lines test after `'checks the optional toy'`:

```ts
  it('checks the optional card (one, or several: the first is the wheel's) and alert', () => {
    const ok: any = makePack(); ok.card = 'memo'; ok.alert = 'sit';
    expect(parsePack(ok).errors).toEqual([]);
    const many: any = makePack(); many.card = ['todo', 'dinner'];
    expect(parsePack(many).errors).toEqual([]);
    expect(cardsOf(many)).toEqual(['todo', 'dinner']);
    expect(cardsOf(ok)).toEqual(['memo']);
    expect(cardsOf(makePack())).toEqual([]);
    const p: any = makePack(); p.card = 'diary'; p.alert = 3;
    const e = parsePack(p).errors;
    expect(e).toContain('card 要是 memo、todo、dinner，或它們排成的陣列（不重複）');
    expect(e).toContain('alert 要是姿勢名稱');
    expect(e).toHaveLength(2);
    for (const card of [[], ['todo', 'todo'], ['todo', 'diary']]) {
      const q: any = makePack(); q.card = card;
      expect(parsePack(q).errors).toEqual(['card 要是 memo、todo、dinner，或它們排成的陣列（不重複）']);
    }
  });
```

```ts
  it("checks the wand's paw peak and the dinner lines", () => {
    const ok: any = makePack(); ok.toy.upPeak = 0.4; ok.lines.dinner = ['今晚吃{dish}！'];
    expect(parsePack(ok).errors).toEqual([]);
    const p: any = makePack(); p.toy.upPeak = 1.2; p.lines.dinner = [];
    const e = parsePack(p).errors;
    expect(e).toContain('toy 的 upPeak 要在 0 到 1 之間');
    expect(e).toContain('lines.dinner 要是至少一句台詞的陣列');
  });
```

and change its import line to `import { cardsOf, parsePack } from '../../src/shared/pack';`.

`tests/unit/notes.test.ts` — the two expectations gain the default wheel, and a new test:

```ts
import { describe, it, expect } from 'vitest';
import { defaultDinner } from '../../src/shared/dinner';
import { normalizeNotes } from '../../src/shared/notes';

describe('normalizeNotes', () => {
  it('starts empty, with the default dinner menu', () => {
    expect(normalizeNotes(undefined)).toEqual({ version: 1, memo: '', todos: [], dinner: defaultDinner() });
  });
  it('keeps good reminders and drops broken ones', () => {
    const good = { id: 'a', text: '開會', hour: 15, minute: 0, repeat: 'once', at: 123, doneDay: null, firedAt: null };
    const daily = { id: 'b', text: '吃藥', hour: 9, minute: 30, repeat: 'daily', at: 5, doneDay: '2026-10-5', firedAt: 7 };
    const raw = { memo: '要買貓砂', todos: [good, daily, { ...good, minute: 15 }, { ...good, hour: 24 }, { ...good, repeat: 'yearly' }, { ...good, at: null }, 'x'] };
    expect(normalizeNotes(raw)).toEqual({ version: 1, memo: '要買貓砂', todos: [good, { ...daily, at: null }], dinner: defaultDinner() });
  });
  it('keeps the dinner wheel', () => {
    const dinner = { items: ['便當', '拉麵'], last: { day: '2026-10-16', dish: '拉麵' }, prev: null };
    expect(normalizeNotes({ dinner }).dinner).toEqual(dinner);
  });
});
```

`tests/unit/settings.test.ts` — inside `'pops the cards up by themselves at these times unless told otherwise'`, after line 25 add:

```ts
    expect(cards.dinner).toEqual({ start: false, resume: false, unlock: false, back: false, daily: 17 * 60 + 30 });
    expect(normalizeSettings({ cards: { dinner: { daily: 18 * 60, start: true } } }, ['a']).settings.cards.dinner)
      .toEqual({ start: true, resume: false, unlock: false, back: false, daily: 18 * 60 });
```

`tests/unit/lines.test.ts` — import `dishLine` too, and add:

```ts
  it('says the dish in one of its dinner lines, or a plain one', () => {
    expect(dishLine(pack, '拉麵', constRng(0))).toBe('今晚吃拉麵！');
    const own = makePack(); own.lines.dinner = ['……{dish}吧。', '就{dish}，{dish}！'];
    expect(dishLine(own, '拉麵', constRng(0.9))).toBe('就拉麵，拉麵！');
  });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm.cmd test -- tests/unit/pack.test.ts tests/unit/notes.test.ts tests/unit/settings.test.ts tests/unit/lines.test.ts`
Expected: FAIL — `cardsOf is not a function`、`dishLine is not a function`、dinner missing from notes and settings.

- [ ] **Step 3: Implement**

`src/shared/types.ts` — replace lines 77-79 and add to `PackLines` and `Pack`:

```ts
/**
 * The cat wand: sitting in `pose`, the cat swats with both front paws towards one of five sides; each clip goes from `pose` back
 * to it. `left` / `right` bound everything they draw, as shares of the frame width. `upPeak`: where in the upward swat (a share of
 * its length) the paws are highest - the dinner wheel starts turning then (none: UP_PEAK).
 */
export interface ToyDef { pose: PoseId; swats: Record<SwatDir, ClipId>; left: number; right: number; upPeak?: number }
/** A card a cat holds over its head: 小昭 the reminders (`todo`) and the dinner wheel (`dinner`), 阿胖 the memo (`memo`). */
export type CardKind = 'memo' | 'todo' | 'dinner';
```

In `PackLines`, after `time?: ...`:

```ts
  /** Said when the dinner wheel stops: `{dish}` is the dish. */
  dinner?: LineSet;
```

In `Pack`, replace the `card` field:

```ts
  /** The cards this cat holds (see the cards spec): one, or several, the first being the one the wheel over it brings. */
  card?: CardKind | CardKind[];
```

`src/shared/pack.ts` — import `CardKind` (`import type { CardKind, Pack, ReminderType, SwatDir, TimeEvent } from './types';`), add after `SWAT_DIRS`:

```ts
const CARD_KINDS: CardKind[] = ['memo', 'todo', 'dinner'];

/** The cards a cat holds, the wheel's first. */
export const cardsOf = (pack: Pack): CardKind[] => (pack.card === undefined ? [] : Array.isArray(pack.card) ? pack.card : [pack.card]);
```

replace line 170:

```ts
  if (raw.card !== undefined) {
    const list = Array.isArray(raw.card) ? raw.card : [raw.card];
    const ok = list.length > 0 && list.every(k => CARD_KINDS.includes(k as CardKind)) && new Set(list).size === list.length;
    if (!ok) err('card 要是 memo、todo、dinner，或它們排成的陣列（不重複）');
  }
```

inside the `toy` check, after the `left`/`right` loop (line 166):

```ts
      if (toy.upPeak !== undefined && (!isNum(toy.upPeak) || toy.upPeak < 0 || toy.upPeak > 1)) err('toy 的 upPeak 要在 0 到 1 之間');
```

after the `lines.back` check (line 149):

```ts
  if (isObj(lines) && lines.dinner !== undefined && !isStrArr(lines.dinner)) err('lines.dinner 要是至少一句台詞的陣列');
```

`src/shared/toy.ts` — after `MIN_SPEED`:

```ts
/** Where in the upward swat the paws are highest, as a share of its length, for a pack that does not say (ToyDef.upPeak). */
export const UP_PEAK = 0.45;
```

`src/shared/lines.ts` — append:

```ts
/** What a cat says when the dinner wheel stops at `dish`: one of its dinner lines (none: a plain one), the dish put in. */
export function dishLine(pack: Pack, dish: string, rng: Rng): string {
  return pickLine(pack.lines.dinner ?? ['今晚吃{dish}！'], rng).replaceAll('{dish}', dish);
}
```

`src/shared/notes.ts`:

```ts
import { normalizeDinner, type Dinner } from './dinner';
import { MINUTES, type Repeat, type Todo } from './todo';

/** notes.json: 阿胖's memo, 小昭's reminders and her dinner wheel. */
export interface Notes { version: 1; memo: string; todos: Todo[]; dinner: Dinner }
```

and in `normalizeNotes`:

```ts
  return { version: 1, memo: typeof r.memo === 'string' ? r.memo : '', todos, dinner: normalizeDinner(r.dinner) };
```

`src/shared/settings.ts` — in `defaultSettings().cards` add `dinner: { start: false, resume: false, unlock: false, back: false, daily: 17 * 60 + 30 },`, and line 74 becomes:

```ts
    cards: {
      memo: normalizeCardSettings(rawCards.memo, d.cards.memo),
      todo: normalizeCardSettings(rawCards.todo, d.cards.todo),
      dinner: normalizeCardSettings(rawCards.dinner, d.cards.dinner),
    },
```

- [ ] **Step 4: Run the tests and the type check**

`pack.card` may now be a list, so the two places that read it as one kind change with it:
- `src/main/controller.ts:114` → `ownerOf: kind => this.validPacks().find(p => cardsOf(p.pack).includes(kind))?.id ?? null,` (import `cardsOf` from `'../shared/pack'`)
- `src/main/cards.ts:160-161` →
  ```ts
      const pack = this.host.packOf(petId);
      const kind = pack ? cardsOf(pack)[0] : undefined;
      if (kind) this.show(kind, petId, 'hand');
  ```
  (import `cardsOf` from `'../shared/pack'`)

Run: `npm.cmd test` then `npm.cmd run typecheck`
Expected: both PASS（`CARD_KINDS` in cards.ts is a plain array, so it still compiles without `dinner`; Task 4 adds it）.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/shared/pack.ts src/shared/toy.ts src/shared/lines.ts src/shared/notes.ts src/shared/settings.ts src/main/controller.ts src/main/cards.ts tests/unit/pack.test.ts tests/unit/notes.test.ts tests/unit/settings.test.ts tests/unit/lines.test.ts
git commit -m "A cat may hold several cards; notes and settings keep a dinner wheel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 卡片寬度看種類，任意張數排成一排

**Files:**
- Modify: `src/main/pet-geometry.ts:49-69`
- Modify: `src/main/card-window.ts:8-9,18`
- Test: `tests/unit/pet-geometry.test.ts:58-71`

**Interfaces:**
- Consumes: `CardKind` (Task 2)
- Produces: `CARD_WIDTH = 186`, `DINNER_ZOOM = 1.3`, `cardWidth(kind: CardKind): number` in `src/main/pet-geometry.ts`; `layoutCards(cards: Bounds[], wa: WorkArea): Bounds[]` for any number of cards

- [ ] **Step 1: Write the failing tests**

Append inside `describe('layoutCards', …)` in `tests/unit/pet-geometry.test.ts` (keep the existing tests; they must still pass):

```ts
  it('lines up three that overlap, in the order of their middles, around the middle of them all', () => {
    const wheel = (x: number, y = 250) => ({ x, y, width: 242, height: 200 });
    // todo and the wheel over one cat, the memo over a cat beside it
    const out = layoutCards([card(400), wheel(372), card(450)], wa);
    expect(out.map(b => b.x)).toEqual([203, 389, 631]);   // centres 493, 493, 543: the row, 614 wide, round their mean 509.67
    expect(out[1].x).toBe(out[0].x + 186);
    expect(out[2].x).toBe(out[1].x + 242);
  });
  it('lines up only the ones that overlap', () => {
    const out = layoutCards([card(0), card(700), card(720)], wa);
    expect(out[0].x).toBe(0);
    expect(out[2].x).toBe(out[1].x + 186);
  });
  it('keeps a row of cards of two widths inside the work area', () => {
    const out = layoutCards([card(814), { x: 760, y: 250, width: 242, height: 200 }], wa);
    expect(out[1].x + 242 + 186).toBeLessThanOrEqual(1000);
    expect(out[0].x).toBe(out[1].x + 242);
  });
});

describe('cardWidth', () => {
  it('draws the dinner wheel 1.3 times as wide; the others stay 186', () => {
    expect(cardWidth('todo')).toBe(186);
    expect(cardWidth('memo')).toBe(186);
    expect(cardWidth('dinner')).toBe(242);
  });
```

and add `cardWidth` to the import on line 2. (The numbers use that `describe`'s own `wa = { x: 0, y: 0, width: 1000, height: 700 }` and its `card(x, y = 250, height = 150)`: a row's x = round(clamp(mean of the centres − row width / 2, 0, 1000 − row width)).)

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm.cmd test -- tests/unit/pet-geometry.test.ts`
Expected: FAIL — `cardWidth is not a function`, and the three-card row is not laid out.

- [ ] **Step 3: Implement**

`src/main/pet-geometry.ts` — add near `cardBounds` (import `type CardKind` from `'../shared/types'`):

```ts
/** The reminders and the memo are this wide: two thirds of what the reminders first had. */
export const CARD_WIDTH = 186;
/** The dinner wheel is drawn this much bigger (card.css zooms `.card.dinner` by the same), so its window is that much wider. */
export const DINNER_ZOOM = 1.3;
export const cardWidth = (kind: CardKind): number => (kind === 'dinner' ? Math.round(CARD_WIDTH * DINNER_ZOOM) : CARD_WIDTH);
```

replace `layoutCards` (lines 57-69):

```ts
/**
 * The cards over the cats' heads, where each would go: cards that would overlap (one another, or through a card between them) stand
 * in a row instead, touching, in the order of their middles, around the middle of them all, inside the work area.
 */
export function layoutCards(cards: Bounds[], wa: WorkArea): Bounds[] {
  const root = cards.map((_, i) => i);
  const find = (i: number): number => (root[i] === i ? i : (root[i] = find(root[i])));
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) if (overlaps(cards[i], cards[j])) root[find(i)] = find(j);
  const rows = new Map<number, number[]>();
  cards.forEach((_, i) => rows.set(find(i), [...(rows.get(find(i)) ?? []), i]));
  const centre = (i: number) => cards[i].x + cards[i].width / 2;
  const out = [...cards];
  for (const row of rows.values()) {
    if (row.length < 2) continue;
    row.sort((a, b) => centre(a) - centre(b) || a - b);
    const width = row.reduce((s, i) => s + cards[i].width, 0);
    const mid = row.reduce((s, i) => s + centre(i), 0) / row.length;
    let x = Math.round(Math.min(Math.max(mid - width / 2, wa.x), wa.x + wa.width - width));
    for (const i of row) { out[i] = { ...cards[i], x }; x += cards[i].width; }
  }
  return out;
}
```

`src/main/card-window.ts` — remove lines 8-9 (`CARD_WIDTH` moves to pet-geometry), import `cardWidth` with `Bounds` from `'./pet-geometry'`, and replace `readonly width = CARD_WIDTH;` with:

```ts
  readonly width: number;
```

and as the constructor's first line:

```ts
    this.width = cardWidth(kind);
```

(`this.width` is used by `new BrowserWindow({ width: this.width, … })` below, so it must be set before that.) Search for other uses: `rg CARD_WIDTH src tests` — any import of `CARD_WIDTH` from `card-window` now comes from `pet-geometry`.

- [ ] **Step 4: Run the tests and the type check**

Run: `npm.cmd test -- tests/unit/pet-geometry.test.ts` then `npm.cmd run typecheck`
Expected: PASS, including the old two-card tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/pet-geometry.ts src/main/card-window.ts tests/unit/pet-geometry.test.ts
git commit -m "Cards that would overlap stand in a row, however many; the dinner wheel's is wider

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 主程式：轉盤卡片、選單、轉盤流程、跟貓說話

**Files:**
- Modify: `src/shared/ipc.ts:67-73`（PetApi）、`:121-130`（CardState、CardAction）
- Modify: `src/main/cards.ts`
- Modify: `src/main/controller.ts:29`（channels）、`:111-132`（CardHost）、`:634-653`（petEvents）
- Modify: `src/main/pet-window.ts:9-21,84`
- Modify: `src/main/preload-pet.ts`
- Modify: `tests/e2e/helpers.ts:135-151`
- Create: `tests/e2e/dinner.spec.ts`

**Interfaces:**
- Consumes: Task 1 (`pickDish`, `recordDish`, `dishToAvoid`, `addDish`, `renameDish`, `removeDish`), Task 2 (`CardKind`, `cardsOf`, `Notes.dinner`, `Settings.cards.dinner`), Task 3 (`cardWidth`)
- Produces:
  - `interface DinnerView { items: string[]; yesterday: string | null; spin: { seq: number; index: number; started: boolean } | null }`
  - `CardState.dinner: DinnerView`
  - `CardAction` adds `{ kind: 'spin' }`, `{ kind: 'spun'; seq: number }`, `{ kind: 'dishAdd'; text: string }`, `{ kind: 'dishRename'; from: string; to: string }`, `{ kind: 'dishDelete'; dish: string }`
  - `PetApi` adds `onSpin(cb: () => void)`, `onDish(cb: (dish: string) => void)`, `onSpinCancel(cb: () => void)`, `spinHit(swatted: boolean)`; channels `pet:spin`, `pet:dish`, `pet:spin-cancel`（main → pet），`pet:spin-hit`（pet → main）
  - `CardHost` adds `spin(id: string): void`, `sayDish(id: string, dish: string): void`, `cancelSpin(id: string): void`
  - `CardController.spinHit(petId: string, swatted: boolean): void`
  - Log lines: `轉盤：轉到 {dish}`（picked）、`轉盤：今晚吃 {dish}`（stopped and recorded）

- [ ] **Step 1: Write the failing end-to-end test (main side only)**

`tests/e2e/helpers.ts` — testcat also holds the wheel, and the wheel never pops by itself unless asked:

```ts
export function cardPacks(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dpet-cards-'));
  cpSync(resolve('tests/fixtures/packs'), dir, { recursive: true });
  for (const [id, card] of [['testcat', ['todo', 'dinner']], ['testcat2', 'memo']] as const) {
    const file = join(dir, id, 'pack.json');
    writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), card }));
  }
  return dir;
}

/** A user folder whose settings let the cards pop up by themselves only as given (by default never). */
export function cardUserDir(cards: { memo?: object; todo?: object; dinner?: object } = {}): string {
  const userDir = mkdtempSync(join(tmpdir(), 'dpet-e2e-'));
  const never = { start: false, resume: false, unlock: false, back: false, daily: null };
  writeFileSync(join(userDir, 'settings.json'), JSON.stringify({ cards: {
    memo: { ...never, ...cards.memo }, todo: { ...never, ...cards.todo }, dinner: { ...never, ...cards.dinner } } }));
  return userDir;
}
```

`tests/e2e/dinner.spec.ts`:

```ts
import { test, expect, type ElectronApplication } from '@playwright/test';
import { calmPetPage, cardPacks, cardPage, cardUserDir, controllerCall, launch, readLog, readNotes } from './helpers';

const isOpen = (app: ElectronApplication) => controllerCall(app, c => c.cards.open.has('dinner'));

test('the dinner wheel is a third card: in the menu and the panel, 242 px beside the 186 px reminders', async () => {
  const { app } = await launch({ DESKTOP_PET_PACKS: cardPacks() }, cardUserDir());
  await calmPetPage(app);
  expect(await controllerCall(app, c => c.cards.menuItems())).toEqual([
    { kind: 'todo', label: '提醒事項' }, { kind: 'memo', label: '備忘錄' }, { kind: 'dinner', label: '今晚吃什麼' }]);
  expect(await controllerCall(app, c => c.cards.title('dinner'))).toBe('測試貓的晚餐轉盤');
  await controllerCall(app, c => { c.cards.show('todo', null, 'hand'); c.cards.show('dinner', null, 'hand'); });
  await cardPage(app, 'todo');
  const card = await cardPage(app, 'dinner');
  await expect(card.locator('#title')).toHaveText('今晚吃什麼');
  const [todo, dinner] = await controllerCall(app, c => [c.cards.open.get('todo').card.placed, c.cards.open.get('dinner').card.placed]);
  expect(todo.width).toBe(186);
  expect(dinner.width).toBe(242);
  const [l, r] = todo.x < dinner.x ? [todo, dinner] : [dinner, todo];
  expect(r.x).toBe(l.x + l.width);
  await app.close();
});

test('a spin picks a dish, waits for the cat at most 4 s, and is recorded once the card says the wheel stopped', async () => {
  const userDir = cardUserDir();
  const { app } = await launch({ DESKTOP_PET_PACKS: cardPacks() }, userDir);
  await calmPetPage(app);
  await controllerCall(app, c => c.cards.show('dinner', null, 'hand'));
  await cardPage(app, 'dinner');
  await controllerCall(app, c => c.cards.act({ kind: 'spin' }));
  const spin = await controllerCall(app, c => c.cards.state('dinner').dinner.spin);
  expect(spin).toMatchObject({ started: false });
  // a second press while it waits changes nothing
  await controllerCall(app, c => c.cards.act({ kind: 'spin' }));
  expect(await controllerCall(app, c => c.cards.state('dinner').dinner.spin.seq)).toBe(spin.seq);
  await expect.poll(() => controllerCall(app, c => c.cards.state('dinner').dinner.spin?.started), { timeout: 6_000 }).toBe(true);
  const dish = await controllerCall(app, c => c.cards.spin.dish);
  expect(readLog(userDir)).toContain(`轉盤：轉到 ${dish}`);
  const seq = await controllerCall(app, c => c.cards.spin.seq);
  await controllerCall(app, new Function('c', `return c.cards.act({ kind: 'spun', seq: ${seq} })`) as any);
  await expect.poll(() => readNotes(userDir)?.dinner?.last?.dish, { timeout: 5_000 }).toBe(dish);
  expect(readLog(userDir)).toContain(`轉盤：今晚吃 ${dish}`);
  expect(await controllerCall(app, c => c.cards.state('dinner').dinner.spin)).toBeNull();
  await app.close();
});
```

> `controllerCall` sends the function's source, so it can not close over `seq`; the `new Function` above builds a function whose source has the number in it. If `controllerCall`'s `fn.toString()` of a `new Function` gives `function anonymous(c\n) {…}`, that still evaluates as `(function anonymous(c) {…})(c)` — fine.

- [ ] **Step 2: Build and run it to see it fail**

Run: `npm.cmd run build` then `npm.cmd run test:e2e:hidden -- tests/e2e/dinner.spec.ts`
Expected: FAIL — `menuItems()` has no dinner; `c.cards.act` does not know `spin`.

- [ ] **Step 3: IPC types**

`src/shared/ipc.ts` — replace lines 121-130:

```ts
/** A reminder as the card shows it. */
export interface TodoView { id: string; text: string; time: string; repeat: Repeat; done: boolean; due: boolean; missed: boolean }
/**
 * The dinner wheel as its card shows it: the dishes round the wheel (clockwise from the top), yesterday's (greyed: it will not stop
 * there), and the spin under way - which slice it stops at, and whether it turns yet (it waits for the cat's paw).
 */
export interface DinnerView { items: string[]; yesterday: string | null; spin: { seq: number; index: number; started: boolean } | null }
/** What a card shows: the memo's text, the reminders in the order of the day, or the dinner wheel. */
export interface CardState { kind: CardKind; title: string; memo: string; todos: TodoView[]; dinner: DinnerView }
export type CardAction =
  | { kind: 'memo'; text: string }
  | { kind: 'add'; text: string; hour: number; minute: number; repeat: Repeat }
  | { kind: 'toggle'; id: string; done: boolean }
  | { kind: 'edit'; id: string; text: string }
  | { kind: 'delete'; id: string }
  | DinnerAction;
/** The dinner wheel's card: spin it, it stopped (`seq`: which spin), and the menu's changes. */
export type DinnerAction =
  | { kind: 'spin' }
  | { kind: 'spun'; seq: number }
  | { kind: 'dishAdd'; text: string }
  | { kind: 'dishRename'; from: string; to: string }
  | { kind: 'dishDelete'; dish: string };
```

In `PetApi`, after `wheel(up: boolean): void;`:

```ts
  /**
   * The dinner wheel over its head was spun: sit up and swat it, saying `spinHit(true)` as the paw reaches it, or `spinHit(false)`
   * at once if it can not now (asleep, walking, dragged, ...).
   */
  onSpin(cb: () => void): void;
  spinHit(swatted: boolean): void;
  /** The wheel stopped at this dish: say it, then go back to its ways. */
  onDish(cb: (dish: string) => void): void;
  /** The wheel's card went before it stopped: never mind. */
  onSpinCancel(cb: () => void): void;
```

`src/main/preload-pet.ts` — add to `api`:

```ts
  onSpin: cb => listen('pet:spin', cb),
  spinHit: swatted => ipcRenderer.send('pet:spin-hit', swatted),
  onDish: cb => listen('pet:dish', cb),
  onSpinCancel: cb => listen('pet:spin-cancel', cb),
```

`src/main/pet-window.ts` — `PetEvents` gains `spinHit(id: string, swatted: boolean): void;` and `handle` gains:

```ts
      case 'pet:spin-hit': this.events.spinHit(this.id, !!args[0]); break;
```

`src/main/controller.ts` — add `'pet:spin-hit'` to the channel list on line 29; in `petEvents()` add `spinHit: (id, swatted) => this.cards.spinHit(id, swatted),`; in the `CardController` host (after `attend`):

```ts
      spin: id => this.pets.get(id)?.send('pet:spin'),
      sayDish: (id, dish) => this.pets.get(id)?.send('pet:dish', dish),
      cancelSpin: id => this.pets.get(id)?.send('pet:spin-cancel'),
```

- [ ] **Step 4: The controller**

`src/main/cards.ts`:

Imports:

```ts
import { addDish, dishToAvoid, pickDish, recordDish, removeDish, renameDish, type DishChange } from '../shared/dinner';
import type { CardAction, CardState, DinnerAction, TodoView } from '../shared/ipc';
```

Constants (replace line 12 and add):

```ts
export const CARD_KINDS: CardKind[] = ['todo', 'memo', 'dinner'];
/** In the cats' menus. */
const MENU_LABEL: Record<CardKind, string> = { todo: '提醒事項', memo: '備忘錄', dinner: '今晚吃什麼' };
/** In the panel, after the owner's name. */
const PANEL_NAME: Record<CardKind, string> = { todo: '提醒事項', memo: '備忘錄', dinner: '晚餐轉盤' };
/** The wheel waits this long for the cat's paw at most, then turns all the same. */
const SWAT_WAIT_MS = 4_000;
const DINNER_ACTIONS = new Set<CardAction['kind']>(['spin', 'spun', 'dishAdd', 'dishRename', 'dishDelete']);
const isDinnerAction = (a: CardAction): a is DinnerAction => DINNER_ACTIONS.has(a.kind);
```

`CardHost` gains (after `attend`):

```ts
  /** The dinner wheel: have the cat swat it (it answers through spinHit), say the dish it stopped at, or never mind. */
  spin(id: string): void;
  sayDish(id: string, dish: string): void;
  cancelSpin(id: string): void;
```

Fields of `CardController` (after `attending`):

```ts
  /** The wheel's spin under way: the dish picked, its slice, the cat under the card; `started` once it turns. */
  spin: { seq: number; dish: string; index: number; petId: string; started: boolean; timer: ReturnType<typeof setTimeout> } | null = null;
  private spinSeq = 0;
```

Replace `title` and `menuItems`:

```ts
  /** The card's name in the panel: its cat's name and what it is. */
  title(kind: CardKind): string {
    const owner = this.host.ownerOf(kind);
    return `${(owner && this.host.packOf(owner)?.name) ?? ''}的${PANEL_NAME[kind]}`;
  }

  menuItems(): { kind: CardKind; label: string }[] {
    return CARD_KINDS.filter(k => this.has(k)).map(kind => ({ kind, label: MENU_LABEL[kind] }));
  }
```

Replace `state`:

```ts
  state(kind: CardKind): CardState {
    const now = Date.now();
    const todos: TodoView[] = sortTodos(this.notes.todos).map(t => ({
      id: t.id, text: t.text, time: timeText(t), repeat: t.repeat, done: isDone(t, now),
      due: this.pending.has(t.id), missed: this.pending.get(t.id) === true,
    }));
    const s = this.spin;
    const dinner = { items: [...this.notes.dinner.items], yesterday: dishToAvoid(this.notes.dinner, now),
      spin: s ? { seq: s.seq, index: s.index, started: s.started } : null };
    return { kind, title: kind === 'dinner' ? '今晚吃什麼' : this.title(kind), memo: this.notes.memo, todos, dinner };
  }
```

In `close(kind)`, before `o.card.close();`:

```ts
    if (kind === 'dinner') this.cancelSpin();
```

At the top of `act(a)`:

```ts
    if (isDinnerAction(a)) { this.dinnerAct(a); return; }
```

New methods (after `answered`):

```ts
  /** The cat's paw reached the wheel, or it will not swat now: the wheel turns. */
  spinHit(petId: string, swatted: boolean): void {
    const s = this.spin;
    if (!s || s.petId !== petId) return;
    this.host.log.info(`轉盤：${petId} ${swatted ? '拍了轉盤' : '沒有拍'}`);
    this.startSpin(s.seq);
  }

  private dinnerAct(a: DinnerAction): void {
    if (a.kind === 'spin') { this.spinWheel(); return; }
    if (a.kind === 'spun') { this.spun(Number(a.seq)); return; }
    if (this.spin) return;   // while it turns the dishes stay as they are (the card does not offer the menu then)
    const items = this.notes.dinner.items;
    const r: DishChange = a.kind === 'dishAdd' ? addDish(items, String(a.text))
      : a.kind === 'dishRename' ? renameDish(items, String(a.from), String(a.to)) : removeDish(items, String(a.dish));
    if ('error' in r) return;   // the card showed why already
    this.notes.dinner = { ...this.notes.dinner, items: r.items };
    this.save();
    this.push('dinner');
  }

  /** 「轉一下」: tonight's dish is picked now (not yesterday's); the cat under the card swats the wheel, which turns as its paw lands. */
  private spinWheel(): void {
    const o = this.open.get('dinner');
    if (!o || this.spin) return;
    const dish = pickDish(this.notes.dinner, Date.now(), Math.random);
    const seq = ++this.spinSeq;
    this.spin = { seq, dish, index: this.notes.dinner.items.indexOf(dish), petId: o.petId, started: false,
      timer: setTimeout(() => this.startSpin(seq), SWAT_WAIT_MS) };
    this.host.log.info(`轉盤：轉到 ${dish}`);
    this.host.spin(o.petId);
    this.push('dinner');
  }

  private startSpin(seq: number): void {
    const s = this.spin;
    if (!s || s.seq !== seq || s.started) return;
    clearTimeout(s.timer);
    s.started = true;
    this.push('dinner');
  }

  /** The wheel stopped: tonight's dish is that (a later spin today replaces it), and the cat says so. */
  private spun(seq: number): void {
    const s = this.spin;
    if (!s || s.seq !== seq || !s.started) return;
    this.spin = null;
    this.notes.dinner = recordDish(this.notes.dinner, s.dish, Date.now());
    this.save();
    this.host.log.info(`轉盤：今晚吃 ${s.dish}`);
    this.host.sayDish(s.petId, s.dish);
    this.push('dinner');
  }

  /** The card went before the wheel stopped: that spin does not count, and the cat goes back to its ways. */
  private cancelSpin(): void {
    const s = this.spin;
    if (!s) return;
    clearTimeout(s.timer);
    this.spin = null;
    this.host.log.info(`轉盤：沒轉完就收起來了（${s.dish} 不算）`);
    this.host.cancelSpin(s.petId);
  }
```

The `CardWindow` is created with `kind`, and `cardWidth(kind)` already gives it 242 (Task 3); nothing else in `show` changes. `popFor`, `back` and `tick` loop over `CARD_KINDS`, so the wheel's 17:30 pop comes with them; `deliver`/`answered` stay the reminders' own.

- [ ] **Step 5: Type check, build, run the test**

Run: `npm.cmd run typecheck`, `npm.cmd test`, `npm.cmd run build`, `npm.cmd run test:e2e:hidden -- tests/e2e/dinner.spec.ts tests/e2e/cards.spec.ts`
Expected: PASS. (The card page still builds the reminders' body for `dinner` — Task 5 gives it its own; the tests here only read `#title` and the controller.) `cards.spec.ts` must still pass: the reminders and memo cards are unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/shared/ipc.ts src/main/cards.ts src/main/controller.ts src/main/pet-window.ts src/main/preload-pet.ts tests/e2e/helpers.ts tests/e2e/dinner.spec.ts
git commit -m "The dinner wheel is a third card: main picks the dish, waits for the cat's paw, and keeps the day's last

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 卡片畫面：轉盤、翻面改菜單、放大 1.3 倍

**Files:**
- Create: `src/card/dom.ts`
- Create: `src/card/dinner.ts`
- Modify: `src/card/card.ts`
- Modify: `src/card/card.css`
- Test: `tests/e2e/dinner.spec.ts`

**Interfaces:**
- Consumes: `DinnerView`, `CardAction` (Task 4); `addDish`, `renameDish`, `removeDish`, `spinTo` (Task 1)
- Produces: `el(tag, props?, ...kids)` in `src/card/dom.ts`; `buildDinner(body: HTMLElement, act: (a: CardAction) => void): { render(v: DinnerView): void; focus(): void }` in `src/card/dinner.ts`. DOM the tests use: `.disc`（the turning svg, `style.transform = rotate(Ndeg)`）, `.disc .name`（slice names, in order）, `.slice.old`, `.yesterday`, `.result`, `button.spin`, `button.edit-menu`, `.dishes li .text`, `.dishes li .del`, `.dishes input.edit`, `input.new-dish`, `button.plus`, `.error`, `button.done`

- [ ] **Step 1: Write the failing end-to-end tests**

Append to `tests/e2e/dinner.spec.ts` (and add `type Page` to the playwright import):

```ts
/** The dish under the pointer, worked out from how far the wheel has turned. */
const dishUnderPointer = (card: Page) => card.evaluate(() => {
  const turned = Number(/rotate\(([-\d.]+)deg\)/.exec((document.querySelector('.disc') as SVGElement).style.transform)?.[1] ?? 0);
  const names = [...document.querySelectorAll('.disc .name')].map(t => t.textContent);
  return names[Math.floor((((360 - (turned % 360)) % 360) / (360 / names.length)))];
});

test('the card turns the wheel to the dish main picked, and its zoomed page fits its window', async () => {
  const userDir = cardUserDir();
  const { app } = await launch({ DESKTOP_PET_PACKS: cardPacks() }, userDir);
  await calmPetPage(app);
  await controllerCall(app, c => c.cards.show('dinner', null, 'hand'));
  const card = await cardPage(app, 'dinner');
  await expect(card.locator('.disc .name')).toHaveText(['便當', '牛肉麵', '滷肉飯', '水餃', '拉麵', '火鍋', '咖哩飯', '炒飯']);
  expect(await card.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
  await card.locator('button.spin').click();
  await expect(card.locator('button.spin')).toBeDisabled();
  await expect(card.locator('button.edit-menu')).toBeDisabled();
  await expect(card.locator('.result')).toHaveText(/^今晚吃：/, { timeout: 15_000 });
  const dish = (await card.locator('.result').textContent())!.replace('今晚吃：', '');
  expect(await dishUnderPointer(card)).toBe(dish);
  await expect.poll(() => readNotes(userDir)?.dinner?.last?.dish, { timeout: 5_000 }).toBe(dish);
  await expect(card.locator('button.spin')).toBeEnabled();
  await app.close();
});

test('the menu is changed on the back of the card and kept; what breaks the rules shows in red', async () => {
  const userDir = cardUserDir();
  const { app } = await launch({ DESKTOP_PET_PACKS: cardPacks() }, userDir);
  await calmPetPage(app);
  await controllerCall(app, c => c.cards.show('dinner', null, 'hand'));
  const card = await cardPage(app, 'dinner');
  await card.locator('button.edit-menu').click();
  await card.locator('input.new-dish').fill('麥當勞');
  await card.locator('input.new-dish').press('Enter');
  await card.locator('input.new-dish').fill('便當');
  await card.locator('button.plus').click();
  await expect(card.locator('.error')).toHaveText('已經有了');
  await card.locator('.dishes .text', { hasText: '水餃' }).click();
  await card.locator('.dishes input.edit').fill('鍋貼');
  await card.locator('.dishes input.edit').press('Enter');
  const hotpot = card.locator('.dishes li', { hasText: '火鍋' });
  await hotpot.hover();
  await hotpot.locator('.del').click();
  const after = ['便當', '牛肉麵', '滷肉飯', '鍋貼', '拉麵', '咖哩飯', '炒飯', '麥當勞'];
  await expect(card.locator('.dishes .text')).toHaveText(after);
  await expect.poll(() => readNotes(userDir)?.dinner?.items, { timeout: 5_000 }).toEqual(after);
  await card.locator('button.done').click();
  await expect(card.locator('.disc .name')).toHaveText(after);
  // down to two, and no further
  await controllerCall(app, c => { c.cards.notes.dinner.items = ['便當', '拉麵']; c.cards.push('dinner'); });
  await card.locator('button.edit-menu').click();
  const first = card.locator('.dishes li').first();
  await first.hover();
  await first.locator('.del').click();
  await expect(card.locator('.error')).toHaveText('至少要留兩樣');
  await expect(card.locator('.dishes .text')).toHaveText(['便當', '拉麵']);
  await app.close();
});

test("yesterday's dish is greyed, and the wheel does not stop on it", async () => {
  const userDir = cardUserDir();
  const { app } = await launch({ DESKTOP_PET_PACKS: cardPacks() }, userDir);
  await calmPetPage(app);
  // yesterday as helloDay counts it: the date 29 hours ago (days start at 5:00)
  await controllerCall(app, c => {
    const t = new Date(Date.now() - 29 * 3600_000);
    c.cards.notes.dinner = { items: ['便當', '拉麵'], last: { day: `${t.getFullYear()}-${t.getMonth() + 1}-${t.getDate()}`, dish: '拉麵' }, prev: null };
    c.cards.show('dinner', null, 'hand');
  });
  const card = await cardPage(app, 'dinner');
  await expect(card.locator('.slice.old')).toHaveCount(1);
  await expect(card.locator('.yesterday')).toHaveText('昨天');
  await card.locator('button.spin').click();
  await expect(card.locator('.result')).toHaveText('今晚吃：便當', { timeout: 15_000 });
  expect(await dishUnderPointer(card)).toBe('便當');
  await app.close();
});
```

- [ ] **Step 2: Build and run to see them fail**

Run: `npm.cmd run build` then `npm.cmd run test:e2e:hidden -- tests/e2e/dinner.spec.ts`
Expected: the three new tests FAIL（no `.disc`）; the two from Task 4 pass.

- [ ] **Step 3: `src/card/dom.ts` (moved out of card.ts, unchanged)**

```ts
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e: HTMLElementTagNameMap[K] = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
}
```

In `src/card/card.ts` delete the `el` function (lines 12-16) and add `import { el } from './dom';`.

- [ ] **Step 4: `src/card/dinner.ts`**

```ts
import { addDish, removeDish, renameDish, spinTo, type DishChange } from '../shared/dinner';
import type { CardAction, DinnerView } from '../shared/ipc';
import { el } from './dom';

/** How long the wheel turns. */
const SPIN_MS = 3_200;
/** The wheel's radius and its centre in its svg (px, before the card's zoom). */
const R = 66;
const C = R + 2;
const NS = 'http://www.w3.org/2000/svg';

function svg(tag: string, attrs: Record<string, string | number>, text?: string): SVGElement {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}

/**
 * 小昭's dinner wheel: the front turns the wheel to the dish main picked (once the cat's paw reaches it), the back is the menu.
 * Main checks every change again; the card checks first only to say in red why one can not be made.
 */
export function buildDinner(body: HTMLElement, act: (a: CardAction) => void): { render(v: DinnerView): void; focus(): void } {
  let view: DinnerView = { items: [], yesterday: null, spin: null };
  let editing = false;
  let turned = 0;       // how far the wheel has turned (deg), growing spin by spin
  let turnedFor = 0;    // the spin it last turned for
  let said = '';        // what the last spin stopped at

  // ---- the front: the wheel ----
  const disc = svg('svg', { class: 'disc', width: 2 * C, height: 2 * C });
  disc.style.transition = `transform ${SPIN_MS}ms cubic-bezier(.17, .67, .21, 1)`;
  const over = svg('svg', { class: 'over', width: 150, height: 148 });
  over.append(svg('polygon', { points: '68,4 82,4 75,20', class: 'pointer' }), svg('circle', { cx: 75, cy: 78, r: 9, class: 'hub' }));
  const result = el('div', { className: 'result' });
  const editBtn = el('button', { className: 'edit-menu', textContent: '改菜單' });
  const spinBtn = el('button', { className: 'spin', textContent: '轉一下' });
  const front = el('div', { className: 'front' }, el('div', { className: 'wheel' }, disc, over), result,
    el('div', { className: 'bar' }, editBtn, spinBtn));

  // ---- the back: the menu ----
  const list = el('ul', { className: 'dishes' });
  const newDish = el('input', { className: 'new-dish', placeholder: '新增菜色……', maxLength: 6 });
  const plus = el('button', { className: 'plus', textContent: '＋', title: '新增' });
  const error = el('div', { className: 'error' });
  const done = el('button', { className: 'done', textContent: '完成' });
  const back = el('div', { className: 'back' }, list, el('div', { className: 'add-dish' }, newDish, plus), error,
    el('div', { className: 'bar end' }, done));

  const drawWheel = () => {
    const n = view.items.length;
    const s = 360 / n;
    const at = (deg: number) => `${C + R * Math.cos((deg - 90) * Math.PI / 180)} ${C + R * Math.sin((deg - 90) * Math.PI / 180)}`;
    disc.replaceChildren(...view.items.flatMap((dish, i) => {
      const old = dish === view.yesterday;
      const turn = `rotate(${(i + 0.5) * s} ${C} ${C})`;
      const parts = [
        svg('path', { d: `M${C} ${C}L${at(i * s)}A${R} ${R} 0 0 1 ${at((i + 1) * s)}Z`, class: old ? 'slice old' : i % 2 ? 'slice odd' : 'slice' }),
        svg('text', { x: C, y: C - R * 0.68, transform: turn, class: `name${n > 9 ? ' small' : ''}${old ? ' old' : ''}` }, dish),
      ];
      if (old) parts.push(svg('text', { x: C, y: C - R * 0.4, transform: turn, class: 'yesterday' }, '昨天'));
      return parts;
    }));
  };

  const turnTo = (seq: number, index: number) => {
    turnedFor = seq;
    const dish = view.items[index];
    turned = spinTo(turned, index, view.items.length);
    disc.style.transform = `rotate(${turned}deg)`;
    setTimeout(() => { said = `今晚吃：${dish}`; result.textContent = said; act({ kind: 'spun', seq }); }, SPIN_MS);
  };

  /** Show what a change would do: red words if it can not be made, else main is told. */
  const tryIt = (r: DishChange, a: CardAction): boolean => {
    if ('error' in r) { error.textContent = r.error; return false; }
    error.textContent = '';
    act(a);
    return true;
  };

  const drawList = () => {
    list.replaceChildren(...view.items.map(dish => {
      const name = el('span', { className: 'text', textContent: dish });
      name.addEventListener('click', () => rename(name, dish));
      const del = el('button', { className: 'del', textContent: '🗑', title: '刪除' });
      del.addEventListener('click', () => tryIt(removeDish(view.items, dish), { kind: 'dishDelete', dish }));
      return el('li', {}, name, del);
    }));
  };

  /** Click a dish to rename it: Enter or leaving the box keeps it, Esc does not (as with a reminder). */
  const rename = (span: HTMLSpanElement, dish: string) => {
    const input = el('input', { className: 'edit', value: dish, maxLength: 6 });
    let finished = false;
    const finish = (keep: boolean) => {
      if (finished) return;
      finished = true;
      if (keep && input.value.trim() !== dish) tryIt(renameDish(view.items, dish, input.value), { kind: 'dishRename', from: dish, to: input.value });
      drawList();
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
    input.addEventListener('blur', () => finish(true));
    span.replaceWith(input);
    input.focus();
    input.select();
  };

  const add = () => {
    if (tryIt(addDish(view.items, newDish.value), { kind: 'dishAdd', text: newDish.value })) newDish.value = '';
    newDish.focus();
  };
  plus.addEventListener('click', add);
  newDish.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
  newDish.addEventListener('input', () => { error.textContent = ''; });

  const flip = (toMenu: boolean) => {
    editing = toMenu;
    error.textContent = '';
    body.replaceChildren(toMenu ? back : front);
    if (toMenu) { drawList(); newDish.focus(); }
  };
  editBtn.addEventListener('click', () => { if (!view.spin) flip(true); });
  done.addEventListener('click', () => flip(false));
  spinBtn.addEventListener('click', () => { if (!view.spin) act({ kind: 'spin' }); });
  body.replaceChildren(front);

  return {
    render(v: DinnerView) {
      const redraw = v.items.join('\n') !== view.items.join('\n') || v.yesterday !== view.yesterday;
      view = v;
      if (redraw) drawWheel();
      spinBtn.disabled = editBtn.disabled = !!v.spin;
      if (v.spin?.started && v.spin.seq !== turnedFor) turnTo(v.spin.seq, v.spin.index);
      result.textContent = v.spin && !v.spin.started ? '……' : v.spin ? '轉呀轉……' : said;
      if (editing && !list.querySelector('.edit')) drawList();
    },
    focus() { (editing ? newDish : spinBtn).focus(); },
  };
}
```

- [ ] **Step 5: Hook it into `src/card/card.ts`**

Add `import { buildDinner } from './dinner';` and after `let state: CardState | null = null;`:

```ts
let dinner: ReturnType<typeof buildDinner> | null = null;
```

In `api.onState`, the `fresh` branch builds by kind:

```ts
    if (s.kind === 'memo') buildMemo(); else if (s.kind === 'dinner') dinner = buildDinner(body, act); else buildTodo();
```

and after the `todo` line at the end of the handler:

```ts
  if (s.kind === 'dinner') dinner?.render(s.dinner);
```

Replace `api.onFocus(...)`:

```ts
api.onFocus(() => { if (state?.kind === 'dinner') dinner?.focus(); else (state?.kind === 'memo' ? memo : newText)?.focus(); });
```

(The global Esc handler already ignores `.edit` boxes, so Esc while renaming a dish only cancels the rename.)

- [ ] **Step 6: `src/card/card.css`**

After line 5 (`.card.todo …`):

```css
/* 小昭's like the reminders, drawn 1.3 times as big: DINNER_ZOOM in pet-geometry.ts makes the window that much wider */
.card.dinner { --fur: #5b5c60; --accent: #ba7517; zoom: 1.3; }
```

Append:

```css
.front, .back { display: flex; flex-direction: column; gap: 6px; }
.front { align-items: center; }
.wheel { position: relative; width: 150px; height: 148px; }
.wheel .disc { position: absolute; left: 7px; top: 10px; }
.wheel .over { position: absolute; left: 0; top: 0; pointer-events: none; }
.pointer { fill: var(--accent); }
.hub { fill: #fff; stroke: var(--fur); stroke-width: 1.5; }
.slice { fill: #f1efe8; stroke: #d3d1c7; stroke-width: 1; }
.slice.odd { fill: #fff; }
.slice.old { fill: #d3d1c7; }
.name, .yesterday { text-anchor: middle; dominant-baseline: central; font-family: inherit; }
.name { font-size: 11px; font-weight: 500; fill: #2c2c2a; }
.name.small { font-size: 10px; }
.name.old, .yesterday { fill: #888780; }
.yesterday { font-size: 10px; }
.result { font-size: 12px; min-height: 18px; }
.bar { display: flex; justify-content: space-between; align-items: center; width: 100%; }
.bar.end { justify-content: flex-end; }
.edit-menu { background: none; border: 0; color: #888780; font: inherit; font-size: 11px; cursor: pointer; padding: 0 2px; }
button.spin, button.done { font: inherit; font-size: 12px; padding: 2px 12px; border-radius: 6px; border: 1px solid var(--accent); background: #fff; color: #854f0b; cursor: pointer; }
.front button:disabled { opacity: 0.45; cursor: default; }
.add-dish { display: flex; gap: 4px; align-items: center; border-top: 1px solid #f1efe8; padding-top: 6px; }
.add-dish input { flex: 1; min-width: 0; font: inherit; font-size: 12px; border: 1px solid #d3d1c7; border-radius: 4px; padding: 1px 3px; user-select: text; }
.add-dish .plus { background: none; border: 0; color: var(--accent); font-size: 17px; line-height: 1; cursor: pointer; padding: 0 2px; }
.error { font-size: 11px; color: #a32d2d; min-height: 15px; }
```

(`ul`, `li`, `.text`, `.edit`, `.del` and its hover rule are the reminders' styles and fit the dish list as they are.)

- [ ] **Step 7: Build and run**

Run: `npm.cmd run typecheck`, `npm.cmd run build`, `npm.cmd run test:e2e:hidden -- tests/e2e/dinner.spec.ts tests/e2e/cards.spec.ts`
Expected: PASS. If the "fits its window" check fails (the window is shorter than the zoomed card), `getBoundingClientRect()` did not include the zoom: in `card.ts`'s ResizeObserver, report `Math.ceil(card.getBoundingClientRect().bottom * (state?.kind === 'dinner' ? 1.3 : 1)) + 1` instead and re-run.

Then look at it: take a screenshot of the card page in the hidden run (add `await card.screenshot({ path: 'test-results/dinner-card.png' })` temporarily in the first test, run it, open the PNG, remove the line). Check: ears, header, wheel, names readable, nothing cut off; compare with the D mockup the owner picked.

- [ ] **Step 8: Commit**

```bash
git add src/card/dom.ts src/card/dinner.ts src/card/card.ts src/card/card.css tests/e2e/dinner.spec.ts
git commit -m "The dinner card: a wheel that turns to tonight's dish, and its menu on the back

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 貓咪坐起來拍轉盤、說出答案

**Files:**
- Modify: `src/pet/pet.ts`（after the wand's `api.onToy` block, line ~258；`applyAuto` line 59；`frame()` line 311-329）
- Test: `tests/e2e/dinner.spec.ts`

**Interfaces:**
- Consumes: `PetApi.onSpin/spinHit/onDish/onSpinCancel` (Task 4), `UP_PEAK` and `ToyDef.upPeak` (Task 2), `dishLine` (Task 2), `BehaviorEngine.perform/restingIn/command`, `fitsAt`, `actionExtent`, `union`, `isAsleep`
- Produces: the cat's side of the flow; `__pet.history` shows `swat_up` when it swatted

- [ ] **Step 1: Write the failing end-to-end tests**

Append to `tests/e2e/dinner.spec.ts`:

```ts
test('the cat under the card sits up and swats the wheel, which turns as its paw comes up, and then says the dish', async () => {
  const userDir = cardUserDir();
  const { app } = await launch({ DESKTOP_PET_PACKS: cardPacks() }, userDir);
  const page = await calmPetPage(app);
  await controllerCall(app, c => c.cards.show('dinner', null, 'hand'));
  const card = await cardPage(app, 'dinner');
  await card.locator('button.spin').click();
  await expect.poll(() => page.evaluate(() => (window as any).__pet.history.includes('swat_up')), { timeout: 15_000 }).toBe(true);
  // well before main's 4 s wait: the paw started it
  await expect.poll(() => readLog(userDir), { timeout: 8_000 }).toContain('轉盤：testcat 拍了轉盤');
  await expect(card.locator('.result')).toHaveText(/^今晚吃：/, { timeout: 15_000 });
  const dish = (await card.locator('.result').textContent())!.replace('今晚吃：', '');
  await expect(page.locator('.bubble')).toContainText(`今晚吃${dish}！`);
  // a while after saying it, it lies down again
  await expect.poll(() => page.evaluate(() => (window as any).__pet.engine.endPose), { timeout: 20_000 }).toBe('rest');
  await app.close();
});

test('a cat asleep does not get up: the wheel turns by itself, and it still says the dish', async () => {
  const userDir = cardUserDir();
  const { app } = await launch({ DESKTOP_PET_PACKS: cardPacks() }, userDir);
  const page = await calmPetPage(app);
  await controllerCall(app, c => c.command('testcat', 'perch'));
  await expect.poll(() => page.evaluate(() => (window as any).__pet.engine.endPose), { timeout: 20_000 }).toBe('perch');
  await controllerCall(app, c => c.cards.show('dinner', null, 'hand'));
  const card = await cardPage(app, 'dinner');
  await card.locator('button.spin').click();
  await expect.poll(() => readLog(userDir), { timeout: 3_000 }).toContain('轉盤：testcat 沒有拍');
  await expect(card.locator('.result')).toHaveText(/^今晚吃：/, { timeout: 10_000 });
  const dish = (await card.locator('.result').textContent())!.replace('今晚吃：', '');
  await expect(page.locator('.bubble')).toContainText(dish);
  expect(await page.evaluate(() => (window as any).__pet.history.includes('swat_up'))).toBe(false);
  expect(await page.evaluate(() => (window as any).__pet.engine.endPose)).toBe('perch');
  await app.close();
});

test('closing the card before the wheel stops: nothing is kept, and the cat goes back to its ways', async () => {
  const userDir = cardUserDir();
  const { app } = await launch({ DESKTOP_PET_PACKS: cardPacks() }, userDir);
  const page = await calmPetPage(app);
  await controllerCall(app, c => c.cards.show('dinner', null, 'hand'));
  const card = await cardPage(app, 'dinner');
  await card.locator('button.spin').click();
  await expect.poll(() => page.evaluate(() => (window as any).__pet.engine.endPose), { timeout: 15_000 }).toBe('sit');
  await card.keyboard.press('Escape').catch(() => {});
  await expect.poll(() => isOpen(app)).toBe(false);
  expect(readLog(userDir)).toContain('不算');
  await expect.poll(() => page.evaluate(() => (window as any).__pet.engine.endPose), { timeout: 20_000 }).toBe('rest');
  expect(readNotes(userDir)?.dinner?.last ?? null).toBeNull();
  await app.close();
});
```

- [ ] **Step 2: Build and run to see them fail**

Run: `npm.cmd run build` then `npm.cmd run test:e2e:hidden -- tests/e2e/dinner.spec.ts`
Expected: the three new tests FAIL（no `swat_up`, no `拍了轉盤`/`沒有拍` in the log, no bubble）.

- [ ] **Step 3: Implement in `src/pet/pet.ts`**

Imports: add `dishLine` to the `../shared/lines` import, `UP_PEAK` to the `../shared/toy` import, and `union` to the `../shared/pose-geometry` import.

Next to the other flags (after `let toying = false;`, line 57):

```ts
  let wheel: 'swat' | 'hit' | 'said' | null = null;   // the dinner wheel: swatting it, the paw has reached it, the dish said
```

`applyAuto` (line 59) holds off for the wheel too:

```ts
  const applyAuto = () => { engine.auto = userAuto && !fight && !away && !attending && !toying && !wheel; };
```

After the `api.onToy(...)` block (line 258), add:

```ts
  // the dinner wheel over its head: it sits up and swats it, and main turns the wheel as the paw comes up (or at once, when it
  // will not swat now); told the dish, it says it, and a while later goes back to its ways - or plays on, or keeps looking at the
  // user for a reminder
  const WHEEL_BACK_MS = 5_000;
  let wheelBack: ReturnType<typeof setTimeout> | undefined;
  const canSwat = (toy: ToyDef): boolean => {
    const pose = pack.poses[engine.endPose];
    return mode === 'live' && !busy && !moving && !fight && !away && !isAsleep(pack, engine.endPose) && !pose.brief && !pose.transient
      && fitsAt(union([actionExtent(pack, toy.pose), [toy.left, toy.right]]), frameX, frameW(), window.innerWidth);
  };
  const wheelDone = () => {
    clearTimeout(wheelBack);
    if (!wheel) return;
    wheel = null;
    applyAuto();
    if (mode === 'live' && !fight && !away && !attending && !toying) engine.command(pack.start);
  };
  api.onSpin(() => {
    clearTimeout(wheelBack);
    const toy = pack.toy;
    if (!toy || !canSwat(toy)) { api.spinHit(false); return; }
    wheel = 'swat';
    applyAuto();
    const step = engine.perform(toy.swats.up, toy.pose);   // now if it sits, else once it has sat up
    if (step) void player.play(step);
  });
  api.onDish(dish => {
    bubbles.say(dishLine(pack, dish, Math.random), SAY_MS);
    if (!wheel) return;   // it did not get up for it: it stays as it is
    wheel = 'said';
    wheelBack = setTimeout(wheelDone, WHEEL_BACK_MS);
  });
  api.onSpinCancel(wheelDone);
```

In `frame()` (line 311), before `bubbles.place();`:

```ts
    // the swat for the wheel: past the paws' highest point the wheel turns
    if (wheel === 'swat' && pack.toy && player.step?.clip === pack.toy.swats.up && player.progress >= (pack.toy.upPeak ?? UP_PEAK)) {
      wheel = 'hit';
      api.spinHit(true);
    }
```

> Do not clear the bubbles on a spin: a reminder's bubble with its buttons may be up, and it waits for its answer. `engine.perform` queues the swat in place of the idle it would sit in, so lying it plays `rest_to_sit` (小昭: `lie_to_sit`) and then the swat; sitting (with the wand, or for a reminder) it swats at once. If the swat never comes (dragged meanwhile), main's 4 s wait turns the wheel anyway, and `onDish` still ends the wheel.

- [ ] **Step 4: Build and run**

Run: `npm.cmd run typecheck`, `npm.cmd run build`, `npm.cmd run test:e2e:hidden -- tests/e2e/dinner.spec.ts tests/e2e/toy.spec.ts tests/e2e/cards.spec.ts`
Expected: PASS（`toy.spec.ts`'s known flaky test "a feather moving by a cat makes it sit up" may fail once in a full run; re-run it alone — it must pass alone）.

- [ ] **Step 5: Commit**

```bash
git add src/pet/pet.ts tests/e2e/dinner.spec.ts
git commit -m "The cat under the dinner wheel sits up and swats it, then says tonight's dish

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 寵物包：小昭拿轉盤、台詞、爪子最高點

**Files:**
- Modify: `tools/convert_xiaozhao.py:141-144`（`toy_section`）、`:179-208`（`lines`）、`:219`（`card`）
- Modify: `tools/convert_apang.py:135-171`（`lines`）
- Regenerate: `packs/xiaozhao/pack.json`, `packs/apang/pack.json`

**Interfaces:**
- Consumes: pack schema from Task 2 (`card` list, `lines.dinner`, `toy.upPeak`)
- Produces: real packs that hold the wheel

- [ ] **Step 1: Measure where the paws are highest, in the converter**

`tools/convert_xiaozhao.py` — add before `toy_section`:

```python
def up_peak(mp4: Path) -> float:
    """Where in the upward swat (a share of its length) the paws are highest: the frame whose topmost cat pixel is highest."""
    raw = subprocess.run([FF, '-v', 'error', '-i', str(mp4), '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '320x180', '-'],
                         capture_output=True, check=True).stdout
    fr = np.frombuffer(raw, np.uint8).reshape(-1, 180, 320, 3).astype(np.float32)
    bg = np.concatenate([fr[0, :4, :4].reshape(-1, 3), fr[0, :4, -4:].reshape(-1, 3)]).mean(0)
    rows = (np.linalg.norm(fr - bg, axis=3) > 70).any(axis=2)          # (frames, rows): the rows with cat in them
    top = np.where(rows.any(axis=1), rows.argmax(axis=1), 180)          # each frame's topmost cat row
    return round(float(np.argmin(top)) / len(top), 3)
```

and `toy_section` becomes:

```python
def toy_section(clips: Path) -> dict:
    """The wand: the swats from sitting, how far they reach, and when the upward one is highest (the dinner wheel turns then)."""
    left, right = clip_extent([clips / f'{c}.mp4' for c in SWATS.values()])
    return {'pose': 'sit', 'swats': SWATS, 'left': left, 'right': right, 'upPeak': up_peak(clips / f"{SWATS['up']}.mp4")}
```

(`convert_apang.py` imports `toy_section` from here, so 阿胖 gets his own `upPeak` too.)

- [ ] **Step 2: Her cards and both cats' lines**

`tools/convert_xiaozhao.py` — in `lines`, after `'time': {...},`:

```python
            # the dinner wheel stopped (2026-10-17; the owner approved these)
            'dinner': ['喵～今晚吃{dish}！', '喵～就決定是{dish}了！', '喵～{dish}，好像不錯喔'],
```

and line 219:

```python
        'card': ['todo', 'dinner'],   # she holds the reminders (the wheel over her brings them) and the dinner wheel
```

`tools/convert_apang.py` — in `lines`, after `'time': {...},`:

```python
            # the dinner wheel stopped over him (小昭 not out) (2026-10-17; the owner approved these)
            'dinner': ['今晚吃{dish}好不好～', '阿胖覺得{dish}！'],
```

- [ ] **Step 3: Regenerate the packs and check only those fields changed**

Run:

```bash
C:/Users/USER/pet-ai-spike/.venv/Scripts/python.exe tools/convert_xiaozhao.py
C:/Users/USER/pet-ai-spike/.venv/Scripts/python.exe tools/convert_apang.py
git status --short packs
git diff --stat packs
git diff packs/xiaozhao/pack.json packs/apang/pack.json
```

Expected: only the two `pack.json` files change, and their diffs show only `card`, `lines.dinner` and `toy.upPeak` (a value between about 0.3 and 0.7). If any clip, portrait or other field changes, stop: the converter's sources changed since the packs were last made — find out why (`git diff`, the spike's `work/` dates) before going on, and tell the owner.

- [ ] **Step 4: Check the packs and look at the peak**

Run: `npm.cmd run build` then `node dist/check-pack.js packs/xiaozhao packs/apang`
Expected: `✓ xiaozhao：沒有問題` and `✓ apang：沒有問題`.

Then check the measured peak by eye. Save this as `peek_peak.py` in your scratchpad directory (not the repo) and run it from the repo root with the scratchpad as its argument; it writes each cat's frame at the peak and three frames either side:

```python
import json, subprocess, sys
import imageio_ffmpeg

ff, out = imageio_ffmpeg.get_ffmpeg_exe(), sys.argv[1]
for pack, src in [('xiaozhao', 'C:/Users/USER/pet-ai-spike/work/xz/final/clips/swat_up.mp4'),
                  ('apang', 'C:/Users/USER/pet-ai-spike/work/af/final/pack/clips/swat_up.mp4')]:
    peak = json.load(open(f'packs/{pack}/pack.json', encoding='utf8'))['toy']['upPeak']
    raw = subprocess.run([ff, '-v', 'error', '-i', src, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '320x180', '-'],
                         capture_output=True, check=True).stdout
    count = len(raw) // (320 * 180 * 3)
    n = round(peak * count)
    for k in (n - 3, n, n + 3):
        subprocess.run([ff, '-v', 'error', '-y', '-i', src, '-vf', f'select=eq(n\\,{k})', '-frames:v', '1', f'{out}/{pack}_peak_{k}.png'], check=True)
    print(pack, 'upPeak', peak, 'frames', count, 'peak frame', n)
```

Run: `C:/Users/USER/pet-ai-spike/.venv/Scripts/python.exe <scratchpad>/peek_peak.py <scratchpad>`
Open the PNGs: in the middle one of each cat the paws must be at least as high as in the other two. If not, the measurement caught something else at the top (a leftover toy blob): look at which rows it found and fix `up_peak`, then regenerate.

- [ ] **Step 5: Commit**

```bash
git add tools/convert_xiaozhao.py tools/convert_apang.py packs/xiaozhao/pack.json packs/apang/pack.json
git commit -m "小昭 holds the dinner wheel; both cats say tonight's dish, and know when their paws are highest

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 全部驗證

**Files:** none new

- [ ] **Step 1: All unit tests and the type check**

Run: `npm.cmd run typecheck` and `npm.cmd test`
Expected: PASS, 0 failures.

- [ ] **Step 2: The whole end-to-end suite, hidden**

Run: `npm.cmd run test:e2e:hidden`
Expected: PASS. Known flaky: `toy.spec.ts` "a feather moving by a cat makes it sit up" and `break.spec.ts` "will not walk" under load — if one fails, run that spec alone; it must pass alone. Any other failure is real: fix it (superpowers:systematic-debugging) before going on.

- [ ] **Step 3: The real packs in the app, hidden**

Create a temporary spec `tests/e2e/real-dinner.spec.ts` (never commit it; delete it after this step):

```ts
import { test, expect } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { cardPage, controllerCall, launch, petPage } from './helpers';

for (const who of ['xiaozhao', 'apang']) {
  test(`the real ${who} swats the wheel and says the dish`, async () => {
    const userDir = mkdtempSync(join(tmpdir(), 'dpet-real-'));
    const never = { start: false, resume: false, unlock: false, back: false, daily: null };
    writeFileSync(join(userDir, 'settings.json'), JSON.stringify({
      pets: { xiaozhao: { visible: who === 'xiaozhao' }, apang: { visible: who === 'apang' } },
      cards: { memo: never, todo: never, dinner: never } }));
    const { app } = await launch({ DESKTOP_PET_PACKS: resolve('packs') }, userDir);
    const page = await petPage(app, who);
    await page.evaluate(() => { (window as any).__pet.engine.auto = false; });
    await controllerCall(app, c => c.cards.show('dinner', null, 'hand'));
    const card = await cardPage(app, 'dinner');
    await card.locator('button.spin').click();
    for (let i = 1; i <= 8; i++) {
      await page.waitForTimeout(800);
      await page.screenshot({ path: `test-results/real-dinner/${who}-${i}-cat.png` });
      await card.screenshot({ path: `test-results/real-dinner/${who}-${i}-card.png` });
    }
    await expect(page.locator('.bubble')).toHaveCount(1, { timeout: 10_000 });
    await page.screenshot({ path: `test-results/real-dinner/${who}-said.png` });
    await app.close();
  });
}
```

Run: `npm.cmd run build` then `npm.cmd run test:e2e:hidden -- tests/e2e/real-dinner.spec.ts`
Open the PNGs in `test-results/real-dinner/`: the cat sits up, its paws go up towards the card, the wheel starts as the paws are highest (compare the cat and card shots of the same number), the bubble stands beside the card with the cat's own line, and nothing on the card is cut off. Then `Remove-Item tests/e2e/real-dinner.spec.ts` and confirm `git status --short` does not list it.

- [ ] **Step 4: Report to the owner**

Tell the owner (Traditional Chinese): what was built, the commits, the test results (with numbers), the screenshots, anything that did not go as planned. Do **not** push or build an installer; ask whether to push to GitHub and whether to build an installer (Windows only, or with the Mac dmg).

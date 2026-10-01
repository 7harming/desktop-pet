# 提醒事項、備忘錄（加上離開時睡著、依時間行為的收尾）實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 小昭頭上的提醒事項卡、阿胖頭上的備忘錄卡（往上捲／右鍵／自動跳出／到點提醒），以及離開時睡著的收尾（隨機睡姿、回來坐起來），出 0.6.0。

**Architecture:** 時間和清單邏輯是 `src/shared/` 的純函式（`todo.ts`、`notes.ts`、`time-events.ts`），時間由外部傳入，用 Vitest 測。主程式新增 `CardController`（`src/main/cards.ts`）管兩張卡，每張卡是一個獨立的透明小視窗（`CardWindow`），畫面在 `src/card/`。貓咪視窗回報頭的位置、往上下捲、坐起來；`AppController` 只負責把事件接到 `CardController`。

**Tech Stack:** Electron、TypeScript、esbuild、Vitest、@playwright/test（Electron 模式）、electron-builder。

**Spec:** `docs/superpowers/specs/2026-10-01-cards-away-time-design.md`

## Global Constraints

- 在 worktree `C:\Users\USER\Projects\desktop-pet-away`（分支 `away-and-time`）執行，用 Git Bash；離開時睡著和依時間行為已在這個分支做好（尚未 commit）。
- 使用者看得到的文字用繁體中文；程式碼、識別字、註解用英文，風格跟周圍一致。
- Working copy 是 CRLF：用 Edit 改檔；新檔可以用 LF（Git 會轉）。
- 分鐘只能是 0、10、20、30、40、50；小時 0–23。
- 一天從 5:00 算起（`helloDay`）。
- 卡片寬：備忘錄 240 px、提醒事項 280 px；卡片底邊在頭上方 80 px。
- 自動跳出 30 秒沒碰就收（`DESKTOP_PET_CARD_SECONDS` 可改）；同一張卡 30 秒內的自動跳出只算一次；到點的卡全部回答後 3 秒收。
- 端到端測試都要設 `DESKTOP_PET_FAKE_IDLE`（`helpers.launch` 已設 0）。
- 執行單元測試前先 `node scripts/make-test-pack.mjs`；端到端前先 `npm run build`。
- 每個 commit 訊息結尾加上 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。

---

### Task 1：寵物包的 `card`、`alert` 欄位和睡姿清單

**Files:**
- Modify: `src/shared/types.ts`、`src/shared/pack.ts`、`src/shared/validate.ts`、`src/shared/pose-geometry.ts`
- Modify: `packs/xiaozhao/pack.json`、`packs/apang/pack.json`、`tests/fixtures/test-pack.json`
- Test: `tests/unit/pack.test.ts`、`tests/unit/validate.test.ts`、`tests/unit/pose-geometry.test.ts`

**Interfaces:**
- Produces: `type CardKind = 'memo' | 'todo'`（types.ts）；`Pack.alert?: PoseId`、`Pack.card?: CardKind`；`sleepPoses(pack: Pack): PoseId[]`（pose-geometry.ts）

- [ ] **Step 1：寫失敗的測試**

`tests/unit/pack.test.ts`（加在 `checks pounce commands` 前）：

```ts
  it('checks the optional card and alert', () => {
    const ok: any = makePack(); ok.card = 'memo'; ok.alert = 'sit';
    expect(parsePack(ok).errors).toEqual([]);
    const p: any = makePack(); p.card = 'diary'; p.alert = 3;
    const e = parsePack(p).errors;
    expect(e).toContain('card 要是 memo 或 todo');
    expect(e).toContain('alert 要是姿勢名稱');
    expect(e).toHaveLength(2);
  });
```

`tests/unit/validate.test.ts`：

```ts
  it('needs alert to be a pose it can stay awake in', () => {
    const p = makePack(); p.alert = 'nowhere';
    expect(validatePack(p, allFiles)).toContain('alert 指到不存在的姿勢：nowhere');
    p.alert = 'perch';   // asleep
    expect(validatePack(p, allFiles)).toContain('alert 要是清醒、可以停留的姿勢：perch');
    p.alert = 'sit';
    expect(validatePack(p, allFiles)).toEqual([]);
  });
```

`tests/unit/pose-geometry.test.ts`：

```ts
  it('lists the poses it can sleep in: asleep, neither passing nor visited', () => {
    const p = makePack();
    expect(sleepPoses(p)).toEqual(['perch']);
    p.poses.sit.asleep = true; p.poses.sit.brief = true;
    expect(sleepPoses(p)).toEqual(['perch']);
  });
```

（`sleepPoses` 加進該檔的 import。）

- [ ] **Step 2：跑測試確認失敗**

Run: `node scripts/make-test-pack.mjs && npx vitest run tests/unit/pack.test.ts tests/unit/validate.test.ts tests/unit/pose-geometry.test.ts`
Expected: 3 個新測試 FAIL（`sleepPoses is not a function`、少了錯誤訊息）

- [ ] **Step 3：實作**

`src/shared/types.ts`，在 `ReminderType` 之後：

```ts
/** The card a cat holds over its head: 小昭 the reminders (`todo`), 阿胖 the memo (`memo`). */
export type CardKind = 'memo' | 'todo';
```

`Pack` 介面最後加：

```ts
  /** The pose it sits up in to look at the user: woken when they are back, or with a reminder that is due. */
  alert?: PoseId;
  /** The card this cat holds (see the cards spec). */
  card?: CardKind;
```

`src/shared/pack.ts`，在 `if (typeof raw.clickHeart ...` 之前：

```ts
  if (raw.alert !== undefined && !isStr(raw.alert)) err('alert 要是姿勢名稱');
  if (raw.card !== undefined && raw.card !== 'memo' && raw.card !== 'todo') err('card 要是 memo 或 todo');
```

`src/shared/validate.ts`，在 `return errors;` 之前：

```ts
  if (pack.alert !== undefined) {
    const p = pack.poses[pack.alert];
    if (!p) errors.push(`alert 指到不存在的姿勢：${pack.alert}`);
    else if (p.transient || p.brief || p.asleep) errors.push(`alert 要是清醒、可以停留的姿勢：${pack.alert}`);
  }
```

`src/shared/pose-geometry.ts` 最後：

```ts
/** The poses it may go to sleep in when the user is away: asleep, and neither a passing pose nor one it only visits. */
export function sleepPoses(pack: Pack): PoseId[] {
  return Object.entries(pack.poses).filter(([, p]) => p.asleep && !p.transient && !p.brief).map(([id]) => id);
}
```

寵物包（用 Python 讀寫 JSON，保持原本縮排和 CRLF）：小昭 `"alert": "sit", "card": "todo"`；阿胖 `"alert": "sit", "card": "memo"`；`tests/fixtures/test-pack.json` 只加 `"alert": "sit"`（測試貓預設不拿卡）。

- [ ] **Step 4：跑測試確認通過**

Run: `node scripts/make-test-pack.mjs && npx vitest run`
Expected: 全部 PASS

- [ ] **Step 5：Commit**

```bash
git add -A src/shared tests/unit tests/fixtures/test-pack.json packs/xiaozhao/pack.json packs/apang/pack.json
git commit -m "Packs say which card a cat holds and the pose it sits up in"
```

（這個 commit 也包含前面已做好的離開時睡著、依時間行為的 shared 部分；之後各 task 一起 commit 其餘檔案。）

---

### Task 2：離開時隨機睡姿，回來坐起來並回報「醒了」

**Files:**
- Modify: `src/pet/pet.ts`、`src/shared/ipc.ts`、`src/main/preload-pet.ts`、`src/main/pet-window.ts`、`src/main/controller.ts`
- Test: `tests/e2e/away.spec.ts`

**Interfaces:**
- Consumes: `sleepPoses`、`Pack.alert`（Task 1）
- Produces: `PetApi.woke(): void`（頻道 `pet:woke`）；`PetEvents.woke(id: string): void`；`AppController.onWoke(id: string): void`

- [ ] **Step 1：改端到端測試（先失敗）**

`tests/e2e/away.spec.ts` 第一個測試：回來後 `toBe('rest')` 改成 `toBe('sit')`，並在 log 檢查加 `expect(log).toContain('[testcat] 醒了');`。

- [ ] **Step 2：跑測試確認失敗**

Run: `npm run build && node scripts/make-test-pack.mjs && npx playwright test tests/e2e/away.spec.ts`
Expected: 第一個測試 FAIL（endPose 是 `rest`）

- [ ] **Step 3：實作**

`src/shared/ipc.ts` 的 `PetApi`，在 `fightState` 後：

```ts
  /** It has sat up (or was up) after the user came back. */
  woke(): void;
```

`src/main/preload-pet.ts`：`woke: () => ipcRenderer.send('pet:woke'),`

`src/main/pet-window.ts`：`PetEvents` 加 `woke(id: string): void;`，`handle` 加 `case 'pet:woke': this.events.woke(this.id); break;`

`src/main/controller.ts`：`PET_CHANNELS` 加 `'pet:woke'`；`petEvents()` 加 `woke: id => this.onWoke(id),`；新增

```ts
  /** A cat has sat up after the user came back. */
  protected onWoke(id: string): void { this.log.info(`[${id}] 醒了`); }
```

`src/pet/pet.ts`：import 加 `sleepPoses`；把 `sleepPose` 和 `settle`、`api.onAway` 換成：

```ts
  // the user left: it goes to sleep in one of its sleeping poses (unless asleep already) and stays there; back, it sits up again
  // if it went to sleep for that, and says once it is up
  const settle = () => {
    if (!away || mode !== 'live' || fight || isAsleep(pack, engine.endPose)) return;
    const poses = sleepPoses(pack);
    const pose = poses[Math.floor(Math.random() * poses.length)];
    if (pose && engine.command(pose)) slept = true;
  };
  let waking = false;   // getting up because the user is back: tell main once it rests awake
  api.onAway(a => {
    away = a;
    applyAuto();
    if (a) { settle(); return; }
    if (slept && mode === 'live' && !fight && isAsleep(pack, engine.endPose) && engine.command(pack.alert ?? pack.start)) waking = true;
    else api.woke();
    slept = false;
  });
```

`player.onStepStart` 裡最後加：

```ts
    if (waking && step.from === step.to && !isAsleep(pack, step.to)) { waking = false; api.woke(); }
```

（`waking` 宣告在 `onStepStart` 之前，跟 `slept` 放一起。）

- [ ] **Step 4：跑測試確認通過**

Run: `npm run build && npx playwright test tests/e2e/away.spec.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 5：Commit**

```bash
git add src/pet/pet.ts src/shared/ipc.ts src/main tests/e2e src/panel tests/fixtures
git commit -m "Cats sleep while the user is away and sit up when they are back; lines for the time of day"
```

---

### Task 3：提醒事項的時間邏輯和 notes.json 格式

**Files:**
- Create: `src/shared/todo.ts`、`src/shared/notes.ts`
- Modify: `src/shared/time-events.ts`
- Test: `tests/unit/todo.test.ts`、`tests/unit/notes.test.ts`、`tests/unit/time-events.test.ts`

**Interfaces:**
- Produces（todo.ts）：`type Repeat = 'once' | 'daily' | 'weekdays'`；`interface Todo { id; text; hour; minute; repeat; at: number|null; doneDay: string|null; firedAt: number|null; snoozeUntil: number|null }`；`interface DueTodo { id: string; missed: boolean }`；`MINUTES: number[]`；`nextAt(hour, minute, now): number`；`dayStart(now): number`；`occurrence(t, now): number|null`；`isDone(t, now): boolean`；`dueTodos(todos, now, pending?): DueTodo[]`；`newTodo(id, text, hour, minute, repeat, now): Todo`；`markDone(t, now): Todo`；`markUndone(t): Todo`；`snooze(t, now): Todo`；`dropOldDone(todos, now): Todo[]`；`sortTodos(todos): Todo[]`；`timeText({hour, minute}): string`
- Produces（notes.ts）：`interface Notes { version: 1; memo: string; todos: Todo[] }`；`normalizeNotes(raw: unknown): Notes`
- Produces（time-events.ts）：`crossedMinute(minuteOfDay: number, from: Date, to: Date): boolean`

- [ ] **Step 1：寫失敗的測試**

`tests/unit/todo.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { dayStart, dropOldDone, dueTodos, isDone, markDone, markUndone, newTodo, nextAt, occurrence, snooze, sortTodos, timeText, type Todo } from '../../src/shared/todo';

// 2026-10-05 is a Monday; the 10th a Saturday
const at = (day: number, h: number, m = 0, s = 0) => new Date(2026, 9, day, h, m, s).getTime();

describe('when a reminder is due', () => {
  it('sets a one-off for the next time the clock shows its time', () => {
    expect(nextAt(15, 0, at(5, 14, 0))).toBe(at(5, 15, 0));
    expect(nextAt(15, 0, at(5, 15, 0))).toBe(at(6, 15, 0));
    expect(nextAt(9, 30, at(5, 16, 0))).toBe(at(6, 9, 30));
  });

  it('starts the day at 5:00', () => {
    expect(dayStart(at(6, 3, 0))).toBe(at(5, 5, 0));
    expect(dayStart(at(6, 9, 0))).toBe(at(6, 5, 0));
  });

  it('comes up every day, or on weekdays only, and counts the small hours as the day before', () => {
    const daily = newTodo('a', '吃藥', 9, 0, 'daily', at(5, 6, 0));
    expect(occurrence(daily, at(5, 12, 0))).toBe(at(5, 9, 0));
    const late = newTodo('b', '睡覺', 1, 0, 'daily', at(5, 6, 0));
    expect(occurrence(late, at(5, 12, 0))).toBe(at(6, 1, 0));
    expect(occurrence(late, at(6, 2, 0))).toBe(at(6, 1, 0));
    const work = newTodo('c', '打卡', 9, 0, 'weekdays', at(5, 6, 0));
    expect(occurrence(work, at(10, 12, 0))).toBeNull();
    expect(occurrence(work, at(9, 12, 0))).toBe(at(9, 9, 0));
  });
});

describe('dueTodos', () => {
  const once = newTodo('o', '開會', 15, 0, 'once', at(5, 14, 0));

  it('brings a reminder up at its time, once, and marks it missed when that is long gone', () => {
    expect(dueTodos([once], at(5, 14, 59))).toEqual([]);
    expect(dueTodos([once], at(5, 15, 0, 10))).toEqual([{ id: 'o', missed: false }]);
    expect(dueTodos([once], at(5, 15, 5))).toEqual([{ id: 'o', missed: true }]);
    expect(dueTodos([once], at(5, 15, 0, 10), new Set(['o']))).toEqual([]);   // already showing
  });

  it('does not bring up what was answered: done, or put off until its ten minutes are up', () => {
    expect(dueTodos([markDone(once, at(5, 15, 1))], at(5, 15, 2))).toEqual([]);
    const later = snooze(once, at(5, 15, 1));
    expect(dueTodos([later], at(5, 15, 10))).toEqual([]);
    expect(dueTodos([later], at(5, 15, 11))).toEqual([{ id: 'o', missed: false }]);
  });

  it('lets a new daily reminder whose time has gone today wait for tomorrow', () => {
    const daily = newTodo('d', '吃藥', 9, 0, 'daily', at(5, 14, 0));
    expect(dueTodos([daily], at(5, 14, 1))).toEqual([]);
    expect(dueTodos([daily], at(6, 9, 0, 5))).toEqual([{ id: 'd', missed: false }]);
  });

  it('has a daily reminder ticked today come back unticked tomorrow (from 5:00)', () => {
    const daily = markDone(newTodo('d', '吃藥', 9, 0, 'daily', at(5, 6, 0)), at(5, 9, 1));
    expect(isDone(daily, at(5, 23, 0))).toBe(true);
    expect(isDone(daily, at(6, 4, 59))).toBe(true);
    expect(isDone(daily, at(6, 5, 0))).toBe(false);
    expect(dueTodos([daily], at(5, 23, 0))).toEqual([]);
    expect(dueTodos([daily], at(6, 9, 0, 5))).toEqual([{ id: 'd', missed: false }]);
    expect(isDone(markUndone(daily), at(5, 23, 0))).toBe(false);
  });
});

describe('the list', () => {
  it('drops one-offs ticked on an earlier day, keeping today\'s and the repeating ones', () => {
    const old = markDone(newTodo('a', '舊的', 15, 0, 'once', at(5, 14, 0)), at(5, 15, 1));
    const today = markDone(newTodo('b', '今天的', 15, 0, 'once', at(6, 14, 0)), at(6, 15, 1));
    const daily = markDone(newTodo('c', '每天', 9, 0, 'daily', at(5, 6, 0)), at(5, 9, 1));
    expect(dropOldDone([old, today, daily], at(6, 16, 0)).map(t => t.id)).toEqual(['b', 'c']);
  });

  it('runs in the order of the day, the small hours last', () => {
    const t = (id: string, hour: number, minute: number): Todo => newTodo(id, id, hour, minute, 'daily', at(5, 6, 0));
    expect(sortTodos([t('a', 1, 0), t('b', 23, 0), t('c', 9, 30), t('d', 9, 0)]).map(x => x.id)).toEqual(['d', 'c', 'b', 'a']);
    expect(timeText({ hour: 7, minute: 0 })).toBe('07:00');
  });
});
```

`tests/unit/notes.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { normalizeNotes } from '../../src/shared/notes';

describe('normalizeNotes', () => {
  it('starts empty', () => {
    expect(normalizeNotes(undefined)).toEqual({ version: 1, memo: '', todos: [] });
  });
  it('keeps good reminders and drops broken ones', () => {
    const good = { id: 'a', text: '開會', hour: 15, minute: 0, repeat: 'once', at: 123, doneDay: null, firedAt: null, snoozeUntil: null };
    const daily = { id: 'b', text: '吃藥', hour: 9, minute: 30, repeat: 'daily', at: 5, doneDay: '2026-10-5', firedAt: 7, snoozeUntil: null };
    const raw = { memo: '要買貓砂', todos: [good, daily, { ...good, minute: 15 }, { ...good, hour: 24 }, { ...good, repeat: 'yearly' }, { ...good, at: null }, 'x'] };
    expect(normalizeNotes(raw)).toEqual({ version: 1, memo: '要買貓砂', todos: [good, { ...daily, at: null }] });
  });
});
```

`tests/unit/time-events.test.ts` 加：

```ts
describe('crossedMinute', () => {
  it('says when the clock passed a time of day, not across a sleep', () => {
    expect(crossedMinute(9 * 60, at(5, 8, 59, 50), at(5, 9, 0, 5))).toBe(true);
    expect(crossedMinute(9 * 60, at(5, 9, 0, 5), at(5, 9, 0, 20))).toBe(false);
    expect(crossedMinute(0, at(5, 23, 59, 50), at(6, 0, 0, 5))).toBe(true);
    expect(crossedMinute(9 * 60, at(5, 8, 0), at(5, 10, 0))).toBe(false);
  });
});
```

（`crossedMinute` 加進 import。）

- [ ] **Step 2：跑測試確認失敗**

Run: `npx vitest run tests/unit/todo.test.ts tests/unit/notes.test.ts tests/unit/time-events.test.ts`
Expected: FAIL（模組不存在、`crossedMinute` 不存在）

- [ ] **Step 3：實作**

`src/shared/time-events.ts` 加：

```ts
/** Whether the clock passed `minuteOfDay` (minutes after midnight) after `from`, up to and including `to`; not across a sleep. */
export function crossedMinute(minuteOfDay: number, from: Date, to: Date): boolean {
  if (to.getTime() - from.getTime() > MAX_GAP_MS) return false;
  const t = new Date(to);
  t.setHours(0, minuteOfDay, 0, 0);
  return from.getTime() < t.getTime() && t.getTime() <= to.getTime();
}
```

`src/shared/todo.ts`：

```ts
import { helloDay } from './time-events';

export type Repeat = 'once' | 'daily' | 'weekdays';
/**
 * A reminder on 小昭's list. `at`: when a one-off is due (ms). `doneDay`: the day (helloDay) it was ticked. `firedAt`: the time it
 * was last answered for (done or put off), so that time does not come up again. `snoozeUntil`: put off until then.
 */
export interface Todo {
  id: string; text: string; hour: number; minute: number; repeat: Repeat;
  at: number | null; doneDay: string | null; firedAt: number | null; snoozeUntil: number | null;
}
export interface DueTodo { id: string; missed: boolean }

const MIN = 60_000;
/** The minutes a reminder can be set to: on the tens. */
export const MINUTES = [0, 10, 20, 30, 40, 50];
/** A reminder that comes up later than this after its time is marked missed (the computer was off or asleep). */
const MISSED_AFTER_MS = 2 * MIN;
const SNOOZE_MS = 10 * MIN;

/** The next time the clock shows hour:minute after `now`: today if still to come, else tomorrow. */
export function nextAt(hour: number, minute: number, now: number): number {
  const d = new Date(now);
  d.setHours(hour, minute, 0, 0);
  if (d.getTime() <= now) d.setDate(d.getDate() + 1);
  return d.getTime();
}

/** When the day `now` belongs to began: days start at 5:00 (see helloDay). */
export function dayStart(now: number): number {
  const d = new Date(now - 5 * 60 * MIN);
  d.setHours(5, 0, 0, 0);
  return d.getTime();
}

/** When the reminder is due on the day `now` belongs to; null: not on this day (a weekday one at the weekend). */
export function occurrence(t: Todo, now: number): number | null {
  if (t.repeat === 'once') return t.at;
  const start = new Date(dayStart(now));
  if (t.repeat === 'weekdays' && (start.getDay() === 0 || start.getDay() === 6)) return null;
  const d = new Date(start);
  d.setHours(t.hour, t.minute, 0, 0);
  if (d.getTime() < start.getTime()) d.setDate(d.getDate() + 1);   // the small hours belong to the day before
  return d.getTime();
}

export const isDone = (t: Todo, now: number): boolean => t.doneDay === helloDay(new Date(now));

/** The reminders due now and not answered yet, leaving out those already showing (`pending`). */
export function dueTodos(todos: Todo[], now: number, pending: ReadonlySet<string> = new Set()): DueTodo[] {
  const out: DueTodo[] = [];
  for (const t of todos) {
    if (pending.has(t.id) || isDone(t, now)) continue;
    if (t.snoozeUntil !== null) {
      if (now >= t.snoozeUntil) out.push({ id: t.id, missed: false });
      continue;
    }
    const due = occurrence(t, now);
    if (due === null || due > now || t.firedAt === due) continue;
    out.push({ id: t.id, missed: now - due > MISSED_AFTER_MS });
  }
  return out;
}

/** A new reminder. One whose time has already gone today does not come up today. */
export function newTodo(id: string, text: string, hour: number, minute: number, repeat: Repeat, now: number): Todo {
  const t: Todo = { id, text, hour, minute, repeat, at: repeat === 'once' ? nextAt(hour, minute, now) : null, doneDay: null, firedAt: null, snoozeUntil: null };
  const due = occurrence(t, now);
  return due !== null && due <= now ? { ...t, firedAt: due } : t;
}

/** Ticked, or 完成 pressed: done for today, and its time does not come up again. */
export function markDone(t: Todo, now: number): Todo {
  return { ...t, doneDay: helloDay(new Date(now)), firedAt: occurrence(t, now) ?? t.firedAt, snoozeUntil: null };
}

export const markUndone = (t: Todo): Todo => ({ ...t, doneDay: null });

/** 10 分鐘後: it comes up again in ten minutes. */
export function snooze(t: Todo, now: number): Todo {
  return { ...t, firedAt: occurrence(t, now) ?? t.firedAt, snoozeUntil: now + SNOOZE_MS };
}

/** A new day (from 5:00): one-off reminders ticked on an earlier day go. */
export function dropOldDone(todos: Todo[], now: number): Todo[] {
  const today = helloDay(new Date(now));
  return todos.filter(t => !(t.repeat === 'once' && t.doneDay !== null && t.doneDay !== today));
}

/** In the order of the day (from 5:00), earliest first. */
export function sortTodos(todos: Todo[]): Todo[] {
  const key = (t: Todo) => ((t.hour + 19) % 24) * 60 + t.minute;
  return [...todos].sort((a, b) => key(a) - key(b) || a.id.localeCompare(b.id));
}

export const timeText = (t: Pick<Todo, 'hour' | 'minute'>): string =>
  `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
```

`src/shared/notes.ts`：

```ts
import { MINUTES, type Repeat, type Todo } from './todo';

/** notes.json: 阿胖's memo and 小昭's reminders. */
export interface Notes { version: 1; memo: string; todos: Todo[] }

const REPEATS: Repeat[] = ['once', 'daily', 'weekdays'];
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Whatever notes.json held, as notes: reminders that do not make sense are dropped. */
export function normalizeNotes(raw: unknown): Notes {
  const r = isObj(raw) ? raw : {};
  const todos = Array.isArray(r.todos) ? r.todos.flatMap(t => { const n = normalizeTodo(t); return n ? [n] : []; }) : [];
  return { version: 1, memo: typeof r.memo === 'string' ? r.memo : '', todos };
}

function normalizeTodo(raw: unknown): Todo | null {
  if (!isObj(raw)) return null;
  const { id, text, hour, minute, repeat } = raw;
  if (typeof id !== 'string' || !id || typeof text !== 'string') return null;
  if (!Number.isInteger(hour) || (hour as number) < 0 || (hour as number) > 23 || !MINUTES.includes(minute as number)) return null;
  if (!REPEATS.includes(repeat as Repeat)) return null;
  const at = finite(raw.at) ? raw.at : null;
  if (repeat === 'once' && at === null) return null;
  return {
    id, text, hour: hour as number, minute: minute as number, repeat: repeat as Repeat, at: repeat === 'once' ? at : null,
    doneDay: typeof raw.doneDay === 'string' ? raw.doneDay : null,
    firedAt: finite(raw.firedAt) ? raw.firedAt : null,
    snoozeUntil: finite(raw.snoozeUntil) ? raw.snoozeUntil : null,
  };
}
```

- [ ] **Step 4：跑測試確認通過**

Run: `npx vitest run`
Expected: 全部 PASS

- [ ] **Step 5：Commit**

```bash
git add src/shared/todo.ts src/shared/notes.ts src/shared/time-events.ts tests/unit/todo.test.ts tests/unit/notes.test.ts tests/unit/time-events.test.ts
git commit -m "Reminders' timing: once, every day, weekdays; missed, put off, ticked"
```

---

### Task 4：卡片的自動跳出設定，和 notes.json 的讀寫

**Files:**
- Modify: `src/shared/settings.ts`、`src/main/paths.ts`
- Create: `src/main/notes-store.ts`
- Test: `tests/unit/settings.test.ts`、`tests/unit/notes-store.test.ts`

**Interfaces:**
- Consumes: `CardKind`（Task 1）、`Notes`、`normalizeNotes`（Task 3）
- Produces: `interface CardSettings { start; resume; unlock; back: boolean; daily: number | null }`；`Settings.cards: Record<CardKind, CardSettings>`；`normalizeCardSettings(raw: unknown, d: CardSettings): CardSettings`；`AppPaths.notesFile`；`class NotesStore { load(): Notes; save(n): void; saveSoon(n, delayMs?): void; flush(n): void }`

- [ ] **Step 1：寫失敗的測試**

`tests/unit/settings.test.ts`：

```ts
  it('pops the cards up by themselves at these times unless told otherwise', () => {
    const { cards } = normalizeSettings(undefined, ['a']).settings;
    expect(cards.memo).toEqual({ start: true, resume: true, unlock: true, back: true, daily: 540 });
    expect(cards.todo).toEqual({ start: true, resume: true, unlock: true, back: false, daily: 540 });
    const raw = { cards: { memo: { start: false, back: 'yes', daily: null }, todo: { daily: 615 } } };
    const s = normalizeSettings(raw, ['a']).settings.cards;
    expect(s.memo).toEqual({ start: false, resume: true, unlock: true, back: true, daily: null });
    expect(s.todo.daily).toBe(540);      // not on the tens
    expect(normalizeSettings({ cards: { todo: { daily: 1430 } } }, ['a']).settings.cards.todo.daily).toBe(1430);
  });
```

`tests/unit/notes-store.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger } from '../../src/main/logger';
import { NotesStore } from '../../src/main/notes-store';

const setup = () => {
  const dir = mkdtempSync(join(tmpdir(), 'dpet-notes-'));
  return { dir, file: join(dir, 'notes.json'), store: new NotesStore(join(dir, 'notes.json'), new Logger(join(dir, 'logs'))) };
};

describe('NotesStore', () => {
  it('starts empty without a file, and round-trips', () => {
    const { store } = setup();
    const notes = store.load();
    expect(notes).toEqual({ version: 1, memo: '', todos: [] });
    notes.memo = '要買貓砂';
    store.save(notes);
    expect(store.load().memo).toBe('要買貓砂');
  });
  it('backs up a broken file and starts empty', () => {
    const { dir, file, store } = setup();
    writeFileSync(file, '{ broken');
    expect(store.load().todos).toEqual([]);
    expect(existsSync(join(dir, 'notes.bad.json'))).toBe(true);
  });
  it('flush writes a pending save at once', () => {
    const { store } = setup();
    const notes = store.load();
    notes.memo = 'x';
    store.saveSoon(notes, 60_000);
    store.flush(notes);
    expect(store.load().memo).toBe('x');
  });
});
```

- [ ] **Step 2：跑測試確認失敗**

Run: `npx vitest run tests/unit/settings.test.ts tests/unit/notes-store.test.ts`
Expected: FAIL

- [ ] **Step 3：實作**

`src/shared/settings.ts`：import `CardKind`；加

```ts
/**
 * When a card pops up by itself: the app starting, the computer waking from sleep, the screen being unlocked, the user back at
 * the computer, and every day at `daily` (minutes after midnight, on the tens; null: not).
 */
export interface CardSettings { start: boolean; resume: boolean; unlock: boolean; back: boolean; daily: number | null }
```

`Settings` 加 `cards: Record<CardKind, CardSettings>;`（放在 `reminders` 之後）。`defaultSettings()` 加

```ts
    cards: {
      memo: { start: true, resume: true, unlock: true, back: true, daily: 9 * 60 },
      todo: { start: true, resume: true, unlock: true, back: false, daily: 9 * 60 },
    },
```

`normalizeSettings` 的結果加 `cards: { memo: normalizeCardSettings(rawCards.memo, d.cards.memo), todo: normalizeCardSettings(rawCards.todo, d.cards.todo) },`（`const rawCards = isObj(r.cards) ? r.cards : {};`），並新增

```ts
export function normalizeCardSettings(raw: unknown, d: CardSettings): CardSettings {
  const r = isObj(raw) ? raw : {};
  const flag = (k: 'start' | 'resume' | 'unlock' | 'back') => (typeof r[k] === 'boolean' ? (r[k] as boolean) : d[k]);
  const daily = r.daily === null ? null
    : Number.isInteger(r.daily) && (r.daily as number) >= 0 && (r.daily as number) < 24 * 60 && (r.daily as number) % 10 === 0 ? (r.daily as number) : d.daily;
  return { start: flag('start'), resume: flag('resume'), unlock: flag('unlock'), back: flag('back'), daily };
}
```

`src/main/paths.ts`：`AppPaths` 加 `notesFile: string`，回傳加 `notesFile: join(userDir, 'notes.json')`。

`src/main/notes-store.ts`：

```ts
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { normalizeNotes, type Notes } from '../shared/notes';
import type { Logger } from './logger';

/** notes.json (the memo and the reminders), written like settings.json: a temp file, then a rename. */
export class NotesStore {
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly file: string, private readonly log: Logger) {}

  load(): Notes {
    if (!existsSync(this.file)) return normalizeNotes(undefined);
    try {
      return normalizeNotes(JSON.parse(readFileSync(this.file, 'utf8')));
    } catch (e) {
      renameSync(this.file, this.file.replace(/\.json$/, '.bad.json'));
      this.log.warn(`備忘錄檔損壞，已備份成 notes.bad.json 並從空的開始：${(e as Error).message}`);
      return normalizeNotes(undefined);
    }
  }

  save(notes: Notes): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(notes, null, 2), 'utf8');
    renameSync(tmp, this.file);
  }

  saveSoon(notes: Notes, delayMs = 500): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; this.save(notes); }, delayMs);
  }

  flush(notes: Notes): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.save(notes);
  }
}
```

- [ ] **Step 4：跑測試確認通過**

Run: `npx vitest run && npm run typecheck`
Expected: PASS

- [ ] **Step 5：Commit**

```bash
git add src/shared/settings.ts src/main/paths.ts src/main/notes-store.ts tests/unit/settings.test.ts tests/unit/notes-store.test.ts
git commit -m "When the cards pop up by themselves, and where the memo and reminders are kept"
```

---

### Task 5：卡片視窗和卡片畫面

**Files:**
- Create: `src/main/card-window.ts`、`src/main/preload-card.ts`、`src/card/card.html`、`src/card/card.css`、`src/card/card.ts`
- Modify: `src/shared/ipc.ts`、`src/types/global.d.ts`、`src/main/pet-geometry.ts`、`scripts/build.mjs`
- Test: `tests/unit/pet-geometry.test.ts`

**Interfaces:**
- Consumes: `Repeat`、`MINUTES`（Task 3）、`CardKind`（Task 1）
- Produces: `TodoView`、`CardState { kind; title; memo; todos: TodoView[] }`、`CardAction`（`memo`/`add`/`toggle`/`edit`/`delete`/`answer`）、`CardApi`（ipc.ts）；`cardBounds(head, width, height, wa, gap): Bounds`；`class CardWindow { constructor(kind, state, workArea, events: CardEvents, preloadDir); readonly win: BrowserWindow; showAt(head, focus): void; follow(head): void; push(state): void; close(): void }`；`interface CardEvents { act(a); hot(on); close() }`

- [ ] **Step 1：寫失敗的測試**

`tests/unit/pet-geometry.test.ts`（`cardBounds` 加進 import）：

```ts
describe('cardBounds', () => {
  const wa = { x: 0, y: 0, width: 1000, height: 700 };
  it('centres the card over the head, its bottom a gap above it', () => {
    expect(cardBounds({ x: 500, y: 400 }, 240, 150, wa, 80)).toEqual({ x: 380, y: 170, width: 240, height: 150 });
  });
  it('keeps the card inside the work area', () => {
    expect(cardBounds({ x: 980, y: 100 }, 240, 150, wa, 80)).toEqual({ x: 760, y: 0, width: 240, height: 150 });
    expect(cardBounds({ x: 10, y: 400 }, 240, 150, wa, 80).x).toBe(0);
  });
});
```

- [ ] **Step 2：跑測試確認失敗**

Run: `npx vitest run tests/unit/pet-geometry.test.ts`
Expected: FAIL（`cardBounds` 不存在）

- [ ] **Step 3：實作**

`src/main/pet-geometry.ts`：

```ts
/** Where a card `width`×`height` goes: centred over the head at `head` (screen px), its bottom `gap` above it, inside the work area. */
export function cardBounds(head: { x: number; y: number }, width: number, height: number, wa: WorkArea, gap: number): Bounds {
  const x = Math.round(Math.min(Math.max(head.x - width / 2, wa.x), wa.x + wa.width - width));
  const y = Math.round(Math.min(Math.max(head.y - gap - height, wa.y), wa.y + wa.height - height));
  return { x, y, width, height };
}
```

`src/shared/ipc.ts`（import `Repeat` from `./todo`、`CardKind` from `./types`）：

```ts
/** A reminder as the card shows it. */
export interface TodoView { id: string; text: string; time: string; repeat: Repeat; done: boolean; due: boolean; missed: boolean }
/** What a card shows: the memo's text, or the reminders in the order of the day. */
export interface CardState { kind: CardKind; title: string; memo: string; todos: TodoView[] }
export type CardAction =
  | { kind: 'memo'; text: string }
  | { kind: 'add'; text: string; hour: number; minute: number; repeat: Repeat }
  | { kind: 'toggle'; id: string; done: boolean }
  | { kind: 'edit'; id: string; text: string }
  | { kind: 'delete'; id: string }
  | { kind: 'answer'; id: string; how: 'done' | 'snooze' };
export interface CardApi {
  onState(cb: (s: CardState) => void): void;
  /** Opened by hand: put the cursor in the memo, or in the new reminder's box. */
  onFocus(cb: () => void): void;
  ready(): void;
  act(action: CardAction): void;
  /** The card is this tall (px), ears included: the window fits it. */
  resize(height: number): void;
  /** The pointer is over the card or it has the focus: it does not close by itself meanwhile. */
  hot(on: boolean): void;
  close(): void;
}
```

`src/types/global.d.ts`：import `CardApi`；`interface Window { ...; cardApi: CardApi }`

`src/main/preload-card.ts`：

```ts
import { contextBridge, ipcRenderer } from 'electron';
import type { CardApi } from '../shared/ipc';

const api: CardApi = {
  onState: cb => { ipcRenderer.on('card:state', (_e, s) => cb(s)); },
  onFocus: cb => { ipcRenderer.on('card:focus', () => cb()); },
  ready: () => ipcRenderer.send('card:ready'),
  act: action => ipcRenderer.send('card:act', action),
  resize: height => ipcRenderer.send('card:resize', height),
  hot: on => ipcRenderer.send('card:hot', on),
  close: () => ipcRenderer.send('card:close'),
};
contextBridge.exposeInMainWorld('cardApi', api);
```

`src/main/card-window.ts`：

```ts
import { BrowserWindow } from 'electron';
import { join } from 'node:path';
import { APP_ORIGIN } from './app-protocol';
import { cardBounds, type WorkArea } from './pet-geometry';
import type { CardAction, CardState } from '../shared/ipc';
import type { CardKind } from '../shared/types';

/** The card's bottom sits this far above the cat's head: its speech bubbles go in between. */
const GAP = 80;
const WIDTH: Record<CardKind, number> = { memo: 240, todo: 280 };
const MAX_HEIGHT = 560;

export interface CardEvents { act(a: CardAction): void; hot(on: boolean): void; close(): void }
type Point = { x: number; y: number };

/** One card's window: transparent, frameless, over everything and typed into; it sits over the head of the cat it is shown above. */
export class CardWindow {
  readonly win: BrowserWindow;
  private height = 160;
  private head: Point | null = null;
  private ready = false;
  private shown = false;
  private wantFocus = false;

  constructor(readonly kind: CardKind, private state: CardState, private readonly workArea: () => WorkArea, events: CardEvents,
              preloadDir: string) {
    this.win = new BrowserWindow({
      width: WIDTH[kind], height: this.height, transparent: true, frame: false, resizable: false, alwaysOnTop: true, skipTaskbar: true,
      hasShadow: false, show: false, minimizable: false, maximizable: false, fullscreenable: false, backgroundColor: '#00000000',
      webPreferences: { preload: join(preloadDir, 'preload-card.js'), contextIsolation: true, nodeIntegration: false },
    });
    this.win.setAlwaysOnTop(true, 'pop-up-menu');
    if (process.platform === 'darwin') this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    const ipc = this.win.webContents.ipc;
    ipc.on('card:ready', () => { this.ready = true; this.push(this.state); this.reveal(); });
    ipc.on('card:act', (_e, a: CardAction) => events.act(a));
    ipc.on('card:resize', (_e, h: number) => { this.height = Math.min(MAX_HEIGHT, Math.max(60, Math.round(Number(h)))); this.place(); });
    ipc.on('card:hot', (_e, on: boolean) => events.hot(!!on));
    ipc.on('card:close', () => events.close());
    void this.win.loadURL(`${APP_ORIGIN}/ui/card.html`);
  }

  /** Show it over the head at `head` (screen px); `focus`: take the keyboard (opened by hand). */
  showAt(head: Point, focus: boolean): void {
    this.head = head;
    this.wantFocus ||= focus;
    this.place();
    this.reveal();
  }

  /** The cat moved: follow it. */
  follow(head: Point): void { this.head = head; this.place(); }

  push(state: CardState): void {
    this.state = state;
    if (this.ready && !this.win.isDestroyed()) this.win.webContents.send('card:state', state);
  }

  close(): void { if (!this.win.isDestroyed()) this.win.destroy(); }

  private place(): void {
    if (!this.head || this.win.isDestroyed()) return;
    // the size every time: at fractional display scaling each setPosition grows the window by a pixel
    this.win.setBounds(cardBounds(this.head, WIDTH[this.kind], this.height, this.workArea(), GAP));
  }

  /** Once the page is ready and it has a place: show it, focused if asked. */
  private reveal(): void {
    if (!this.ready || !this.head || this.win.isDestroyed()) return;
    if (!this.shown) {
      this.shown = true;
      if (this.wantFocus) this.win.show(); else this.win.showInactive();
      this.win.moveTop();
    }
    if (this.wantFocus) {
      this.wantFocus = false;
      this.win.focus();
      this.win.webContents.send('card:focus');
    }
  }
}
```

`src/card/card.html`：

```html
<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline'">
  <link rel="stylesheet" href="card.css">
</head>
<body>
  <div id="card" class="card">
    <div class="ears"><i></i><i></i></div>
    <header><span id="title"></span><button id="close" title="收起來">✕</button></header>
    <div id="body"></div>
  </div>
  <script src="card.js"></script>
</body>
</html>
```

`src/card/card.css`：

```css
html, body { margin: 0; background: transparent; overflow: hidden; }
body { font-family: "Microsoft JhengHei UI", "PingFang TC", sans-serif; font-size: 13px; color: #2c2c2a; user-select: none; }
.card { position: relative; margin: 13px 1px 1px; background: #fff; border: 1px solid var(--fur); border-radius: 12px; }
.card.memo { --fur: #8a96a8; --accent: #5f6b7d; }
.card.todo { --fur: #5b5c60; --accent: #ba7517; }
.ears { position: absolute; top: -13px; left: 0; right: 0; height: 13px; pointer-events: none; }
.ears i { position: absolute; bottom: 0; width: 0; height: 0; border-left: 10px solid transparent; border-right: 10px solid transparent; border-bottom: 13px solid var(--fur); }
.ears i:first-child { left: 16px; }
.ears i:last-child { right: 16px; }
header { display: flex; align-items: center; justify-content: space-between; background: var(--fur); color: #fff; border-radius: 11px 11px 0 0; padding: 3px 6px 3px 10px; font-size: 12px; }
header button { background: none; border: 0; color: #fff; font: inherit; cursor: pointer; padding: 0 2px; }
#body { padding: 8px 10px 10px; }
textarea { display: block; box-sizing: border-box; width: 100%; border: 0; outline: none; resize: none; font: inherit; line-height: 1.6; color: inherit; background: transparent; user-select: text; overflow-y: auto; }
ul { list-style: none; margin: 0; padding: 0; max-height: 236px; overflow-y: auto; }
li { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 3px 4px; border-radius: 6px; }
li.done .text, li.done .time { color: #b4b2a9; text-decoration: line-through; }
li.due { background: #faeeda; }
li input[type=checkbox] { accent-color: var(--accent); margin: 0; }
.time { font-variant-numeric: tabular-nums; }
.text { flex: 1; min-width: 0; overflow-wrap: anywhere; cursor: text; }
.edit { flex: 1; min-width: 0; font: inherit; border: 1px solid #d3d1c7; border-radius: 4px; padding: 0 3px; user-select: text; }
.tag { font-size: 11px; color: #888780; }
.tag.missed { color: #a32d2d; }
.del { visibility: hidden; background: none; border: 0; color: #888780; cursor: pointer; padding: 0 2px; font-size: 12px; }
li:hover .del { visibility: visible; }
.due-actions { display: flex; gap: 6px; width: 100%; padding-left: 19px; }
button.answer { font: inherit; font-size: 12px; padding: 1px 8px; border-radius: 6px; border: 1px solid #d3d1c7; background: #fff; cursor: pointer; }
button.answer.done { border-color: var(--accent); color: #854f0b; }
.empty { color: #888780; }
.add { border-top: 1px solid #f1efe8; margin-top: 6px; padding-top: 6px; display: grid; gap: 4px; }
.add .row { display: flex; gap: 4px; align-items: center; }
.add select, .add input { font: inherit; font-size: 12px; border: 1px solid #d3d1c7; border-radius: 4px; padding: 1px 3px; background: #fff; color: inherit; }
.add input { flex: 1; min-width: 0; user-select: text; }
.add button { background: none; border: 0; color: var(--accent); font-size: 17px; line-height: 1; cursor: pointer; padding: 0 2px; }
```

`src/card/card.ts`：

```ts
import type { CardAction, CardState, TodoView } from '../shared/ipc';
import { MINUTES, type Repeat } from '../shared/todo';

const api = window.cardApi;
const card = document.getElementById('card')!;
const body = document.getElementById('body')!;
/** The memo is saved this long after the last key. */
const SAVE_MS = 500;
/** The memo grows with its text up to this many lines, then scrolls. */
const MEMO_LINES = 10;
const REPEAT_LABEL: Record<Repeat, string> = { once: '一次', daily: '每天', weekdays: '平日' };
const pad = (n: number) => String(n).padStart(2, '0');

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e: HTMLElementTagNameMap[K] = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
}
const act = (a: CardAction) => api.act(a);

// the window fits the card, ears included
new ResizeObserver(() => api.resize(Math.ceil(card.getBoundingClientRect().bottom) + 1)).observe(card);

// hot while the pointer is over the card or it has the focus: it does not close by itself then
let over = false;
const hot = () => api.hot(over || document.hasFocus());
document.documentElement.addEventListener('mouseenter', () => { over = true; hot(); });
document.documentElement.addEventListener('mouseleave', () => { over = false; hot(); });
window.addEventListener('focus', hot);
window.addEventListener('blur', hot);

document.getElementById('close')!.addEventListener('click', () => api.close());
document.querySelector('header')!.addEventListener('wheel', e => { if (e.deltaY > 0) api.close(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !(e.target as HTMLElement).classList.contains('edit')) api.close(); });

let state: CardState | null = null;

// ---- 阿胖's memo: one free text, saved as it is typed ----
let memo: HTMLTextAreaElement | null = null;
let saveTimer = 0;
function buildMemo(): void {
  const m = el('textarea', { placeholder: '寫點什麼……', rows: 3 });
  const save = () => { window.clearTimeout(saveTimer); saveTimer = 0; act({ kind: 'memo', text: m.value }); };
  m.addEventListener('input', () => { fitMemo(); window.clearTimeout(saveTimer); saveTimer = window.setTimeout(save, SAVE_MS); });
  m.addEventListener('blur', () => { if (saveTimer) save(); });
  memo = m;
  body.replaceChildren(m);
}
function fitMemo(): void {
  if (!memo) return;
  const line = parseFloat(getComputedStyle(memo).lineHeight);
  memo.style.height = 'auto';
  memo.style.height = `${Math.min(memo.scrollHeight, line * MEMO_LINES)}px`;
}

// ---- 小昭's reminders: a list in the order of the day, and a row to add one ----
const list = el('ul');
let newText: HTMLInputElement | null = null;
function buildTodo(): void {
  const hour = el('select', { className: 'hour' });
  for (let h = 0; h < 24; h++) hour.append(el('option', { value: String(h), textContent: pad(h) }));
  const minute = el('select', { className: 'minute' });
  for (const m of MINUTES) minute.append(el('option', { value: String(m), textContent: pad(m) }));
  const repeat = el('select', { className: 'repeat' });
  for (const r of ['once', 'daily', 'weekdays'] as Repeat[]) repeat.append(el('option', { value: r, textContent: REPEAT_LABEL[r] }));
  // the next ten minutes at least ten minutes away
  const now = new Date();
  const next = Math.ceil((now.getHours() * 60 + now.getMinutes() + 10) / 10) * 10 % (24 * 60);
  hour.value = String(Math.floor(next / 60));
  minute.value = String(next % 60);
  const text = el('input', { className: 'new-text', placeholder: '新增提醒……' });
  const plus = el('button', { className: 'plus', textContent: '＋', title: '新增' });
  const add = () => {
    const t = text.value.trim();
    if (!t) { text.focus(); return; }
    act({ kind: 'add', text: t, hour: Number(hour.value), minute: Number(minute.value), repeat: repeat.value as Repeat });
    text.value = '';
  };
  plus.addEventListener('click', add);
  text.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
  newText = text;
  body.replaceChildren(list, el('div', { className: 'add' },
    el('div', { className: 'row' }, hour, '：', minute, repeat), el('div', { className: 'row' }, text, plus)));
}

function renderTodos(todos: TodoView[]): void {
  if (!todos.length) { list.replaceChildren(el('li', { className: 'empty', textContent: '還沒有提醒事項' })); return; }
  list.replaceChildren(...todos.map(item));
}

function item(t: TodoView): HTMLLIElement {
  const li = el('li', { className: [t.done ? 'done' : '', t.due ? 'due' : ''].filter(Boolean).join(' ') });
  li.dataset.id = t.id;
  const box = el('input', { type: 'checkbox', checked: t.done });
  box.addEventListener('change', () => act({ kind: 'toggle', id: t.id, done: box.checked }));
  const text = el('span', { className: 'text', textContent: t.text });
  text.addEventListener('click', () => editText(text, t));
  li.append(box, el('span', { className: 'time', textContent: t.time }), text);
  if (t.repeat !== 'once') li.append(el('span', { className: 'tag', textContent: REPEAT_LABEL[t.repeat] }));
  if (t.missed) li.append(el('span', { className: 'tag missed', textContent: '錯過' }));
  const del = el('button', { className: 'del', textContent: '🗑', title: '刪除' });
  del.addEventListener('click', () => act({ kind: 'delete', id: t.id }));
  li.append(del);
  if (t.due) {
    const answer = (label: string, how: 'done' | 'snooze') => {
      const b = el('button', { className: `answer ${how}`, textContent: label });
      b.addEventListener('click', () => act({ kind: 'answer', id: t.id, how }));
      return b;
    };
    li.append(el('div', { className: 'due-actions' }, answer('完成', 'done'), answer('10 分鐘後', 'snooze')));
  }
  return li;
}

/** Click a reminder's text to change it: Enter or leaving the box keeps it, Esc does not. */
function editText(span: HTMLSpanElement, t: TodoView): void {
  const input = el('input', { className: 'edit', value: t.text });
  let done = false;
  const finish = (keep: boolean) => {
    if (done) return;
    done = true;
    const text = input.value.trim();
    if (keep && text && text !== t.text) act({ kind: 'edit', id: t.id, text });
    if (state) renderTodos(state.todos);
  };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
  input.addEventListener('blur', () => finish(true));
  span.replaceWith(input);
  input.focus();
  input.select();
}

api.onState(s => {
  const fresh = state?.kind !== s.kind;
  state = s;
  if (fresh) {
    card.className = `card ${s.kind}`;
    document.body.dataset.kind = s.kind;
    if (s.kind === 'memo') buildMemo(); else buildTodo();
  }
  document.getElementById('title')!.textContent = s.title;
  // what is being typed wins over what main last saw
  if (s.kind === 'memo' && memo && (fresh || (document.activeElement !== memo && !saveTimer))) { memo.value = s.memo; fitMemo(); }
  if (s.kind === 'todo' && !list.querySelector('.edit')) renderTodos(s.todos);
});
api.onFocus(() => { (state?.kind === 'memo' ? memo : newText)?.focus(); });
api.ready();
```

`scripts/build.mjs`：`entries` 加

```js
  ['src/main/preload-card.ts', 'dist/preload-card.js', node],
  ['src/card/card.ts', 'dist/card.js', browser],
```

複製清單加 `'src/card/card.html', 'src/card/card.css'`。

- [ ] **Step 4：跑測試確認通過**

Run: `npx vitest run && npm run typecheck && npm run build`
Expected: PASS；`dist/card.html`、`dist/card.js`、`dist/preload-card.js` 存在

- [ ] **Step 5：Commit**

```bash
git add src/main/card-window.ts src/main/preload-card.ts src/card src/shared/ipc.ts src/types/global.d.ts src/main/pet-geometry.ts scripts/build.mjs tests/unit/pet-geometry.test.ts
git commit -m "A card window over a cat's head: 阿胖's memo, 小昭's reminders"
```

---

### Task 6：貓咪那邊：往上下捲、回報頭的位置、坐起來看著你

**Files:**
- Modify: `src/pet/interactions.ts`、`src/pet/pet.ts`、`src/shared/ipc.ts`、`src/main/preload-pet.ts`、`src/main/pet-window.ts`、`src/main/controller.ts`（只加頻道）

**Interfaces:**
- Produces: `PetApi.reportHead(x, y, settled)`（`pet:head`）、`PetApi.wheel(up)`（`pet:wheel`）、`PetApi.onAttend(cb)`（`pet:attend`）；`PetEvents.head(id, head: {x, y}, settled: boolean)`、`PetEvents.wheel(id, up: boolean)`；`InteractionDeps.onWheel(up)`、`InteractionDeps.onMoved(winY, dragging)`

（這個 task 的效果由 Task 8 的端到端測試驗證；這裡先確認型別和舊測試都過。）

- [ ] **Step 1：實作 IPC**

`src/shared/ipc.ts` 的 `PetApi`：

```ts
  /** A reminder is due (true): sit up and look at the user until it is answered (false). */
  onAttend(cb: (on: boolean) => void): void;
  /** Where the head is on screen (px), and whether the cat stands still there (not walking in, not dragged): cards go above it. */
  reportHead(x: number, y: number, settled: boolean): void;
  /** The wheel turned over the cat: up brings its card, down puts it away. */
  wheel(up: boolean): void;
```

`src/main/preload-pet.ts`：

```ts
  onAttend: cb => listen('pet:attend', cb),
  reportHead: (x, y, settled) => ipcRenderer.send('pet:head', x, y, settled),
  wheel: up => ipcRenderer.send('pet:wheel', up),
```

`src/main/pet-window.ts`：`PetEvents` 加 `head(id: string, head: { x: number; y: number }, settled: boolean): void;` 和 `wheel(id: string, up: boolean): void;`；`handle` 加

```ts
      case 'pet:head': this.events.head(this.id, { x: Number(args[0]), y: Number(args[1]) }, !!args[2]); break;
      case 'pet:wheel': this.events.wheel(this.id, !!args[0]); break;
```

`src/main/controller.ts`：`PET_CHANNELS` 加 `'pet:head', 'pet:wheel'`；`petEvents()` 暫時加 `head: () => {}, wheel: () => {},`（Task 7 換成 `CardController`）。

- [ ] **Step 2：實作 interactions**

`InteractionDeps` 加：

```ts
  /** The wheel turned over the cat (up: towards the user). */
  onWheel(up: boolean): void;
  /** The strip moved to `winY` while dragged or falling (`dragging`), or has landed. */
  onMoved(winY: number, dragging: boolean): void;
```

constructor 加：

```ts
    window.addEventListener('wheel', e => { if (e.deltaY && d.hitTest(e.clientX, e.clientY)) d.onWheel(e.deltaY < 0); }, { passive: true });
```

`onMove` 拖曳分支，`this.d.api.moveWindow(this.winY);` 之後加 `this.d.onMoved(this.winY, true);`。`fall()` 的 tick：`moveWindow` 之後加 `this.d.onMoved(this.winY, this.winY < this.restY);`。

- [ ] **Step 3：實作 pet.ts**

宣告（跟 `slept` 一起）：

```ts
  let attending = false;      // sitting up for a reminder that is due, until it is answered
  let moving = false;         // dragged or falling: cards wait for it to land
```

`applyAuto` 改成 `engine.auto = userAuto && !fight && !away && !attending;`；`onFightReady` 的拒絕條件加 `|| attending`。

在 `interactions` 建立之前加：

```ts
  /** Tell main where the head is (screen px) and whether the cat stands still; `winY`: the strip's top while it moves. */
  const reportHead = (winY = window.screenY) => {
    const step = player.step;
    const pose = pack.poses[step ? step.to : pack.start];
    api.reportHead(window.screenX + frameX + pose.centerX * frameW(), winY + (g0 - pose.head) * window.innerHeight, mode === 'live' && !moving);
  };
```

`new Interactions({...})` 加

```ts
    onWheel: up => api.wheel(up),
    onMoved: (winY, dragging) => { moving = dragging; reportHead(winY); },
```

`player.onStepStart` 最後加 `reportHead();`。`walkIn` 裡 `mode = 'live'; busy = false;` 之後加 `reportHead();`。`api.onFrameX(setFrameX)` 改成 `api.onFrameX(x => { setFrameX(x); reportHead(); });`；`api.onRestY` 改成 `api.onRestY(y => { interactions.setRestY(y); requestAnimationFrame(() => reportHead()); });`。

坐起來：

```ts
  api.onAttend(on => {
    if (on === attending) return;
    attending = on;
    applyAuto();
    if (mode !== 'live' || fight || away) return;
    if (on) { if (pack.alert) engine.command(pack.alert); }
    else engine.command(pack.start);
  });
```

- [ ] **Step 4：確認型別和舊測試**

Run: `npm run typecheck && npm run build && npx playwright test tests/e2e/interactions.spec.ts tests/e2e/away.spec.ts`
Expected: PASS

- [ ] **Step 5：Commit**

```bash
git add src/pet src/shared/ipc.ts src/main/preload-pet.ts src/main/pet-window.ts src/main/controller.ts
git commit -m "A cat says where its head is, passes the wheel on, and sits up when told"
```

---

### Task 7：CardController，接到主程式、右鍵選單和面板

**Files:**
- Create: `src/main/cards.ts`
- Modify: `src/main/controller.ts`、`src/main/menus.ts`、`src/shared/ipc.ts`、`src/panel/panel.html`、`src/panel/panel.ts`
- Test: `tests/unit/menus.test.ts`

**Interfaces:**
- Consumes: Task 3–6 的全部
- Produces: `class CardController { notes; pending: Map<string, boolean>; open: Map<CardKind, OpenCard>; has(kind); title(kind); show(kind, via: string | null, mode: 'auto' | 'hand' | 'due'): boolean; close(kind); head(petId, head, settled); petGone(petId); wheel(petId, up); popFor(trigger: 'start' | 'resume' | 'unlock'); back(); woke(petId); tick(now); menuItems(); flush() }`；`PetMenuState.cards`、`PetMenuHandlers.openCard(kind)`；`PanelState.cards: { kind; title; settings: CardSettings }[]`；`PanelAction` 的 `{ kind: 'cards'; card; patch }`、`{ kind: 'openCard'; card }`

- [ ] **Step 1：寫失敗的測試（選單）**

`tests/unit/menus.test.ts`：`handlers()` 加 `openCard: vi.fn()`；原本的測試呼叫加 `cards: []`；新增

```ts
  it('offers the cards after the commands', () => {
    const h = handlers();
    const t = petMenuTemplate({ commands: [{ label: '休息', pose: 'rest' }], auto: false, scale: 1,
      cards: [{ kind: 'todo', label: '提醒事項' }, { kind: 'memo', label: '備忘錄' }] }, h);
    expect(t.slice(0, 5).map(i => i.label ?? i.type)).toEqual(['休息', 'separator', '提醒事項', '備忘錄', 'separator']);
    (t[3] as any).click();
    expect(h.openCard).toHaveBeenCalledWith('memo');
  });
```

- [ ] **Step 2：跑測試確認失敗**

Run: `npx vitest run tests/unit/menus.test.ts`
Expected: FAIL

- [ ] **Step 3：選單**

`src/main/menus.ts`：

```ts
export interface PetMenuState { commands: { label: string; pose: string }[]; auto: boolean; scale: number; cards: { kind: CardKind; label: string }[] }
```

`PetMenuHandlers` 加 `openCard(kind: CardKind): void;`；`petMenuTemplate` 在 commands 之後：

```ts
    { type: 'separator' },
    ...(s.cards.length ? [...s.cards.map(c => ({ label: c.label, click: () => h.openCard(c.kind) })), { type: 'separator' as const }] : []),
```

（原本的 separator 保留在 commands 後面。）

- [ ] **Step 4：CardController**

`src/main/cards.ts`：

```ts
import { CardWindow } from './card-window';
import type { Logger } from './logger';
import type { NotesStore } from './notes-store';
import type { WorkArea } from './pet-geometry';
import type { CardAction, CardState, TodoView } from '../shared/ipc';
import type { Notes } from '../shared/notes';
import type { CardSettings } from '../shared/settings';
import { crossedMinute } from '../shared/time-events';
import { dropOldDone, dueTodos, isDone, markDone, markUndone, MINUTES, newTodo, snooze, sortTodos, timeText, type DueTodo, type Repeat, type Todo } from '../shared/todo';
import type { CardKind, Pack } from '../shared/types';

export const CARD_KINDS: CardKind[] = ['todo', 'memo'];
type Mode = 'auto' | 'hand' | 'due';
/** A due reminder outranks a card opened by hand, which outranks one that popped up by itself. */
const RANK: Record<Mode, number> = { auto: 0, hand: 1, due: 2 };
/** One card's pops by themselves closer together than this are one (waking, unlocking and coming back come together). */
const COALESCE_MS = 30_000;
/** A card that popped up by itself goes after this long untouched (DESKTOP_PET_CARD_SECONDS: tests). */
const AUTO_CLOSE_MS = (Number(process.env.DESKTOP_PET_CARD_SECONDS) || 30) * 1000;
/** Once every reminder that was due is answered, the card goes after this long. */
const ANSWERED_CLOSE_MS = 3_000;
/** Back at the computer: wait at most this long for the cat to sit up before its card pops. */
const WOKE_WAIT_MS = 8_000;
const REPEATS: Repeat[] = ['once', 'daily', 'weekdays'];

export interface CardHost {
  /** The cats on the desktop, in order. */
  onScreen(): string[];
  packOf(id: string): Pack | null;
  /** The cat whose pack holds this card, whether or not it is out; null: no cat holds it, so there is no such card. */
  ownerOf(kind: CardKind): string | null;
  workArea(): WorkArea;
  away(): boolean;
  settings(): Record<CardKind, CardSettings>;
  /** Have the cat sit up and look at the user (true), or go back to its ways (false). */
  attend(id: string, on: boolean): void;
  notify(body: string, onClick: () => void): void;
  log: Logger;
}

interface OpenCard { card: CardWindow; petId: string; mode: Mode; hot: boolean; timer: ReturnType<typeof setTimeout> | undefined }

/** The two cards (小昭's reminders, 阿胖's memo) over the cats' heads, the reminders' timing, and the cards popping up by themselves. */
export class CardController {
  notes: Notes;
  /** Reminders that came up and wait for an answer, each with whether it was missed. */
  readonly pending = new Map<string, boolean>();
  readonly open = new Map<CardKind, OpenCard>();
  readonly heads = new Map<string, { x: number; y: number; settled: boolean }>();
  /** Cards waiting for their cat to stand still (it walks in, or is being dragged) before they show. */
  private readonly waiting = new Map<CardKind, { petId: string; mode: Mode }>();
  private readonly lastPop = new Map<CardKind, number>();
  /** Pops that came while the user was away: shown once they are back and the cat has sat up. */
  private readonly deferred = new Set<CardKind>();
  private wokeWait: { kinds: CardKind[]; timer: ReturnType<typeof setTimeout> } | null = null;
  private lastTick = new Date();
  /** The cat sitting up for due reminders. */
  private attending: string | null = null;

  constructor(private readonly host: CardHost, private readonly store: NotesStore, private readonly preloadDir: string) {
    this.notes = store.load();
  }

  has(kind: CardKind): boolean { return this.host.ownerOf(kind) !== null; }

  title(kind: CardKind): string {
    const owner = this.host.ownerOf(kind);
    return `${(owner && this.host.packOf(owner)?.name) ?? ''}的${kind === 'todo' ? '提醒事項' : '備忘錄'}`;
  }

  menuItems(): { kind: CardKind; label: string }[] {
    return CARD_KINDS.filter(k => this.has(k)).map(kind => ({ kind, label: kind === 'todo' ? '提醒事項' : '備忘錄' }));
  }

  state(kind: CardKind): CardState {
    const now = Date.now();
    const todos: TodoView[] = sortTodos(this.notes.todos).map(t => ({
      id: t.id, text: t.text, time: timeText(t), repeat: t.repeat, done: isDone(t, now),
      due: this.pending.has(t.id), missed: this.pending.get(t.id) === true,
    }));
    return { kind, title: this.title(kind), memo: this.notes.memo, todos };
  }

  /** Over its own cat if that one is out; else over `via` (the cat asked); else over the first cat out. */
  private target(kind: CardKind, via: string | null): string | null {
    const out = this.host.onScreen();
    const owner = this.host.ownerOf(kind);
    if (owner && out.includes(owner)) return owner;
    if (via && out.includes(via)) return via;
    return out[0] ?? null;
  }

  /** Show the card; false: there is no such card, or no cat to show it over. */
  show(kind: CardKind, via: string | null, mode: Mode): boolean {
    if (!this.has(kind)) return false;
    const o = this.open.get(kind);
    if (o) {
      if (RANK[mode] > RANK[o.mode]) o.mode = mode;
      if (mode === 'hand') o.card.showAt(this.heads.get(o.petId)!, true);
      this.arm(kind);
      this.push(kind);
      return true;
    }
    const petId = this.target(kind, via);
    if (!petId) return false;
    const waiting = this.waiting.get(kind);
    if (waiting && RANK[waiting.mode] > RANK[mode]) mode = waiting.mode;
    const head = this.heads.get(petId);
    if (!head?.settled) { this.waiting.set(kind, { petId, mode }); return true; }
    this.waiting.delete(kind);
    const card = new CardWindow(kind, this.state(kind), () => this.host.workArea(), {
      act: a => this.act(a),
      hot: on => this.setHot(kind, on),
      close: () => this.close(kind),
    }, this.preloadDir);
    this.open.set(kind, { card, petId, mode, hot: false, timer: undefined });
    card.showAt(head, mode === 'hand');
    this.arm(kind);
    this.host.log.info(`卡片：${kind} 打開（${mode}，${petId}）`);
    return true;
  }

  close(kind: CardKind): void {
    this.waiting.delete(kind);
    const o = this.open.get(kind);
    if (!o) return;
    clearTimeout(o.timer);
    o.card.close();
    this.open.delete(kind);
    if (kind === 'todo') this.endAttend();
  }

  /** A cat says where its head is: cards over it follow it; cards waiting for it to stand still show. */
  head(petId: string, head: { x: number; y: number }, settled: boolean): void {
    this.heads.set(petId, { ...head, settled });
    for (const o of this.open.values()) if (o.petId === petId) o.card.follow(head);
    if (!settled) return;
    for (const [kind, w] of [...this.waiting]) if (w.petId === petId) this.show(kind, petId, w.mode);
  }

  /** The cat walks off or is gone: its cards go too (a due reminder stays due, and shows the next time the card opens). */
  petGone(petId: string): void {
    this.heads.delete(petId);
    for (const [kind, o] of [...this.open]) if (o.petId === petId) this.close(kind);
    for (const [kind, w] of [...this.waiting]) if (w.petId === petId) this.waiting.delete(kind);
    if (this.attending === petId) this.attending = null;
  }

  /** The wheel over a cat: up brings its own card, down puts away the cards over it. */
  wheel(petId: string, up: boolean): void {
    if (!up) {
      for (const [kind, o] of [...this.open]) if (o.petId === petId) this.close(kind);
      return;
    }
    const kind = this.host.packOf(petId)?.card;
    if (kind) this.show(kind, petId, 'hand');
  }

  /** The app started, the computer woke, the screen was unlocked: pop the cards ticked for it (after the cats sit up, if the user was away). */
  popFor(trigger: 'start' | 'resume' | 'unlock'): void {
    for (const kind of CARD_KINDS) {
      if (!this.has(kind) || !this.host.settings()[kind][trigger]) continue;
      if (this.host.away()) this.deferred.add(kind); else this.pop(kind, trigger);
    }
  }

  /** The user is back at the computer: once the cat has sat up, pop the cards ticked for it, and those that waited for them. */
  back(): void {
    const kinds = CARD_KINDS.filter(k => this.has(k) && (this.host.settings()[k].back || this.deferred.has(k)));
    this.deferred.clear();
    if (!kinds.length) return;
    if (this.wokeWait) clearTimeout(this.wokeWait.timer);
    this.wokeWait = { kinds, timer: setTimeout(() => this.popWoken(null), WOKE_WAIT_MS) };
  }

  /** A cat has sat up after the user came back. */
  woke(petId: string): void { this.popWoken(petId); }

  /** Every 15 s: a new day's tidying, the daily pops, the reminders that are due, and the cards' marks. */
  tick(now: number): void {
    const from = this.lastTick;
    const to = new Date(now);
    this.lastTick = to;
    const kept = dropOldDone(this.notes.todos, now);
    if (kept.length !== this.notes.todos.length) { this.notes.todos = kept; this.save(); }
    for (const kind of CARD_KINDS) {
      const daily = this.host.settings()[kind].daily;
      if (daily === null || !this.has(kind) || !crossedMinute(daily, from, to)) continue;
      if (this.host.away()) this.deferred.add(kind); else this.pop(kind, 'daily');
    }
    if (this.has('todo')) {
      const due = dueTodos(this.notes.todos, now, new Set(this.pending.keys()));
      if (due.length) this.deliver(due);
    }
    for (const kind of this.open.keys()) this.push(kind);
  }

  flush(): void { this.store.flush(this.notes); }

  private pop(kind: CardKind, why: string): void {
    const now = Date.now();
    if (now - (this.lastPop.get(kind) ?? -Infinity) < COALESCE_MS) return;
    if (!this.show(kind, null, 'auto')) return;
    this.lastPop.set(kind, now);
    this.host.log.info(`卡片：${kind} 自動跳出（${why}）`);
  }

  private popWoken(petId: string | null): void {
    const w = this.wokeWait;
    if (!w) return;
    const now = w.kinds.filter(k => petId === null || this.target(k, null) === petId);
    w.kinds = w.kinds.filter(k => !now.includes(k));
    for (const k of now) this.pop(k, 'back');
    if (!w.kinds.length) { clearTimeout(w.timer); this.wokeWait = null; }
  }

  private deliver(due: DueTodo[]): void {
    for (const d of due) this.pending.set(d.id, d.missed);
    const lines = due.map(d => {
      const t = this.notes.todos.find(x => x.id === d.id)!;
      return `${d.missed ? '（錯過）' : ''}${timeText(t)} ${t.text}`;
    });
    this.host.log.info(`提醒事項到了：${due.length} 則`);
    this.host.notify(lines.join('\n'), () => this.show('todo', null, 'hand'));
    if (!this.show('todo', null, 'due')) return;
    const petId = this.open.get('todo')?.petId ?? this.waiting.get('todo')?.petId ?? null;
    if (petId && petId !== this.attending && !this.host.away()) {
      this.endAttend();
      this.attending = petId;
      this.host.attend(petId, true);
    }
    this.push('todo');
  }

  private act(a: CardAction): void {
    const now = Date.now();
    const update = (id: string, f: (t: Todo) => Todo) => { this.notes.todos = this.notes.todos.map(t => (t.id === id ? f(t) : t)); };
    switch (a.kind) {
      case 'memo':
        this.notes.memo = String(a.text);
        this.save();
        return;   // the card shows it already
      case 'add': {
        const text = String(a.text).trim();
        if (!text || !Number.isInteger(a.hour) || a.hour < 0 || a.hour > 23 || !MINUTES.includes(a.minute) || !REPEATS.includes(a.repeat)) return;
        this.notes.todos.push(newTodo(`${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, text, a.hour, a.minute, a.repeat, now));
        break;
      }
      case 'toggle':
        update(a.id, t => (a.done ? markDone(t, now) : markUndone(t)));
        if (a.done) this.answered(a.id);
        break;
      case 'edit': {
        const text = String(a.text).trim();
        if (text) update(a.id, t => ({ ...t, text }));
        break;
      }
      case 'delete':
        this.notes.todos = this.notes.todos.filter(t => t.id !== a.id);
        this.answered(a.id);
        break;
      case 'answer':
        update(a.id, t => (a.how === 'done' ? markDone(t, now) : snooze(t, now)));
        this.answered(a.id);
        break;
    }
    this.save();
    this.push('todo');
  }

  /** A reminder that was due is answered (or gone): once none is left, the cat goes back to its ways and the card goes soon. */
  private answered(id: string): void {
    if (!this.pending.delete(id) || this.pending.size) return;
    this.endAttend();
    this.arm('todo');
  }

  private endAttend(): void {
    if (!this.attending) return;
    this.host.attend(this.attending, false);
    this.attending = null;
  }

  private setHot(kind: CardKind, on: boolean): void {
    const o = this.open.get(kind);
    if (!o) return;
    o.hot = on;
    this.arm(kind);
  }

  /** A card that popped up by itself goes after a while untouched; a due one once every reminder is answered; one opened by hand stays. */
  private arm(kind: CardKind): void {
    const o = this.open.get(kind);
    if (!o) return;
    clearTimeout(o.timer);
    o.timer = undefined;
    if (o.hot) return;
    if (o.mode === 'auto') o.timer = setTimeout(() => this.close(kind), AUTO_CLOSE_MS);
    if (o.mode === 'due' && !this.pending.size) o.timer = setTimeout(() => this.close(kind), ANSWERED_CLOSE_MS);
  }

  private push(kind: CardKind): void { this.open.get(kind)?.card.push(this.state(kind)); }

  private save(): void { this.store.saveSoon(this.notes); }
}
```

- [ ] **Step 5：接到 AppController**

`src/main/controller.ts`：

- import `CardController` from `./cards`、`NotesStore` from `./notes-store`、`normalizeCardSettings` from `../shared/settings`、`type CardKind` from types、`Notification` 已有。
- 欄位 `readonly cards: CardController;`，constructor 在 `this.awayWatch = ...` 之後：

```ts
    this.cards = new CardController({
      onScreen: () => this.settings.petOrder.filter(id => this.onScreen(id)),
      packOf: id => this.packOf(id),
      ownerOf: kind => this.validPacks().find(p => p.pack.card === kind)?.id ?? null,
      workArea: () => this.workArea(),
      away: () => this.awayWatch.away,
      settings: () => this.settings.cards,
      attend: (id, on) => this.pets.get(id)?.send('pet:attend', on),
      notify: (body, onClick) => {
        if (!Notification.isSupported()) return;
        const n = new Notification({ title: '打工貓貓', body });
        n.on('click', onClick);
        n.show();
      },
      log,
    }, new NotesStore(paths.notesFile, log), paths.uiDir);
```

- `start()`：showPet 迴圈之後 `this.cards.popFor('start');`；`powerMonitor.on('resume', ...)` 內加 `this.cards.popFor('resume');`；`unlock-screen` 內加 `this.cards.popFor('unlock');`。
- `checkAway()` 回來分支最後加 `this.cards.back();`。
- `tick()` 一開始（`const now` 之後）加 `this.cards.tick(now);`。
- `petEvents()`：`head: (id, head, settled) => this.cards.head(id, head, settled),`、`wheel: (id, up) => this.cards.wheel(id, up),`；`onWoke` 改成

```ts
  protected onWoke(id: string): void {
    this.log.info(`[${id}] 醒了`);
    this.cards.woke(id);
  }
```

- `walkOff(id)` 開頭（`const pet = ...` 之後）加 `this.cards.petGone(id);`；`resetAllPositions` 關視窗的迴圈裡加 `this.cards.petGone(id);`；`onCrashed` 裡加 `this.cards.petGone(id);`。
- `flush()` 改成 `flush(): void { this.store.flush(this.settings); this.cards.flush(); }`
- `onPetMenu` 的 state 加 `cards: this.cards.menuItems()`，handlers 加 `openCard: kind => { this.cards.show(kind, id, 'hand'); },`。
- `panelState()` 加

```ts
      cards: this.cards.menuItems().map(({ kind }) => ({ kind, title: this.cards.title(kind), settings: this.settings.cards[kind] })),
```

- `act()` 加

```ts
      case 'cards':
        this.settings.cards[a.card] = normalizeCardSettings({ ...this.settings.cards[a.card], ...a.patch }, this.settings.cards[a.card]);
        this.saveSoon();
        break;
      case 'openCard': this.cards.show(a.card, null, 'hand'); break;
```

`src/shared/ipc.ts`：import `CardSettings` from `./settings`；`PanelState` 加 `cards: { kind: CardKind; title: string; settings: CardSettings }[];`；`PanelAction` 加 `| { kind: 'cards'; card: CardKind; patch: Partial<CardSettings> }` 和 `| { kind: 'openCard'; card: CardKind }`。

- [ ] **Step 6：面板分頁**

`src/panel/panel.html` nav 在「健康提醒」後加 `<button class="tab" data-tab="cards">提醒與備忘</button>`，main 加 `<section id="tab-cards" hidden></section>`。

`src/panel/panel.ts`：分頁切換清單改成 `['pets', 'reminders', 'cards', 'settings']`；import `MINUTES` from `../shared/todo`、`type CardSettings` from `../shared/settings`；加

```ts
const TRIGGERS: ['start' | 'resume' | 'unlock' | 'back', string][] =
  [['start', '開啟打工貓貓時'], ['resume', '電腦從睡眠或休眠醒來'], ['unlock', '解除螢幕鎖定'], ['back', '離開電腦後回來']];
const pad = (n: number) => String(n).padStart(2, '0');

/** Each card: when it pops up by itself, and a button to open it now. */
function cardsTab(): HTMLElement[] {
  if (!state.cards.length) return [el('div', { className: 'card sub' }, '目前的貓咪都沒有拿卡片。')];
  return state.cards.map(c => {
    const patch = (p: Partial<CardSettings>) => act({ kind: 'cards', card: c.kind, patch: p });
    const boxes = TRIGGERS.map(([key, label]) => {
      const box = el('input', { type: 'checkbox', checked: c.settings[key] });
      box.dataset.trigger = key;
      box.addEventListener('change', () => patch({ [key]: box.checked }));
      return el('label', {}, box, label);
    });
    const daily = c.settings.daily;
    const on = el('input', { type: 'checkbox', className: 'daily-on', checked: daily !== null });
    const hour = el('select', { className: 'daily-hour', disabled: daily === null });
    for (let h = 0; h < 24; h++) hour.append(el('option', { value: String(h), textContent: pad(h), selected: Math.floor((daily ?? 540) / 60) === h }));
    const minute = el('select', { className: 'daily-minute', disabled: daily === null });
    for (const m of MINUTES) minute.append(el('option', { value: String(m), textContent: pad(m), selected: (daily ?? 540) % 60 === m }));
    const setDaily = () => patch({ daily: on.checked ? Number(hour.value) * 60 + Number(minute.value) : null });
    for (const x of [on, hour, minute]) x.addEventListener('change', setDaily);
    const open = el('button', { className: 'plain open-card', textContent: '現在打開' });
    open.addEventListener('click', () => act({ kind: 'openCard', card: c.kind }));
    const card = el('div', { className: 'card' },
      el('div', { className: 'line' }, el('span', { className: 'name' }, c.title), open),
      el('div', { className: 'sub' }, '自動跳出來的時機：'),
      el('div', { className: 'row' }, ...boxes),
      el('div', { className: 'line' }, el('label', {}, on, '每天'), el('span', {}, hour, '：', minute)));
    card.dataset.card = c.kind;
    return card;
  });
}
```

`render()` 加 `$('tab-cards').replaceChildren(...cardsTab());`。

- [ ] **Step 7：跑測試**

Run: `npx vitest run && npm run typecheck && npm run build`
Expected: PASS

- [ ] **Step 8：Commit**

```bash
git add src tests/unit/menus.test.ts
git commit -m "The cards come up over the cats: by the wheel, the menu, by themselves, and when a reminder is due"
```

---

### Task 8：卡片的端到端測試

**Files:**
- Modify: `tests/e2e/helpers.ts`
- Create: `tests/e2e/cards.spec.ts`

**Interfaces:**
- Consumes: `CardController` 的 `open`、`heads`、`notes`、`tick`、`show`、`popFor`、`setHot`（私有，執行時可呼叫）
- Produces: `cardPacks(): string`、`cardUserDir(cards?): string`、`cardPage(app, kind): Promise<Page>`

- [ ] **Step 1：helpers**

`tests/e2e/helpers.ts`（import 加 `cpSync`、`writeFileSync`）：

```ts
/** A copy of the test packs in which testcat holds the reminders and testcat2 the memo. */
export function cardPacks(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dpet-cards-'));
  cpSync(resolve('tests/fixtures/packs'), dir, { recursive: true });
  for (const [id, card] of [['testcat', 'todo'], ['testcat2', 'memo']]) {
    const file = join(dir, id, 'pack.json');
    writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), card }));
  }
  return dir;
}

/** A user folder whose settings let the cards pop up by themselves only as given (by default never). */
export function cardUserDir(cards: { memo?: object; todo?: object } = {}): string {
  const userDir = mkdtempSync(join(tmpdir(), 'dpet-e2e-'));
  const never = { start: false, resume: false, unlock: false, back: false, daily: null };
  writeFileSync(join(userDir, 'settings.json'), JSON.stringify({ cards: { memo: { ...never, ...cards.memo }, todo: { ...never, ...cards.todo } } }));
  return userDir;
}

/** The window of a card ('memo' or 'todo') once it shows. */
export async function cardPage(app: ElectronApplication, kind: string): Promise<Page> {
  let found: Page | undefined;
  await expect.poll(async () => {
    for (const w of app.windows()) {
      if (!w.url().endsWith('/ui/card.html')) continue;
      if (await w.evaluate(() => document.body.dataset.kind).catch(() => undefined) === kind) { found = w; return true; }
    }
    return false;
  }, { timeout: 20_000 }).toBe(true);
  return found!;
}

/** The memo and reminders as kept in notes.json (null before the first save). */
export function readNotes(userDir: string): any {
  try { return JSON.parse(readFileSync(join(userDir, 'notes.json'), 'utf8')); } catch { return null; }
}
```

- [ ] **Step 2：寫端到端測試**

`tests/e2e/cards.spec.ts`：

```ts
import { test, expect } from '@playwright/test';
import { calmPetPage, cardPacks, cardPage, cardUserDir, catPoint, controllerCall, launch, panelPage, petPage, readLog, readNotes } from './helpers';

const isOpen = (app: any, kind: string) => controllerCall(app, (c: any) => c.cards.open.has(kind));

test('scrolling up over a cat brings its card over its head, and scrolling down puts it away', async () => {
  const { app } = await launch({ DESKTOP_PET_PACKS: cardPacks() }, cardUserDir());
  const page = await calmPetPage(app);   // testcat holds the reminders
  const p = await catPoint(page, 0.35, 0.7);
  await page.mouse.move(p.x, p.y);
  await page.mouse.wheel(0, -100);
  const card = await cardPage(app, 'todo');
  await expect(card.locator('#title')).toHaveText('測試貓的提醒事項');
  const [bounds, head] = await controllerCall(app, c => [c.cards.open.get('todo').card.win.getBounds(), c.cards.heads.get('testcat')]);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(head.y - 79);
  await page.mouse.wheel(0, 100);
  await expect.poll(() => isOpen(app, 'todo')).toBe(false);
  await app.close();
});

test('the memo is typed on the card over its own cat and kept in notes.json', async () => {
  const userDir = cardUserDir();
  const { app } = await launch({ DESKTOP_PET_PACKS: cardPacks() }, userDir);
  await petPage(app);
  await controllerCall(app, c => c.showPet('testcat2'));
  await petPage(app, 'testcat2');
  await controllerCall(app, c => c.cards.show('memo', 'testcat', 'hand'));
  const card = await cardPage(app, 'memo');
  expect(await controllerCall(app, c => c.cards.open.get('memo').petId)).toBe('testcat2');   // over its own cat
  await card.locator('textarea').fill('要買貓砂');
  await expect.poll(() => readNotes(userDir)?.memo, { timeout: 5_000 }).toBe('要買貓砂');
  await app.close();
});

test('a reminder added on the card, and one that falls due: the cat sits up, 完成 ticks it, the card goes', async () => {
  const userDir = cardUserDir();
  const { app } = await launch({ DESKTOP_PET_PACKS: cardPacks() }, userDir);
  const page = await calmPetPage(app);
  await controllerCall(app, c => c.cards.show('todo', null, 'hand'));
  const card = await cardPage(app, 'todo');
  await card.locator('select.hour').selectOption('7');
  await card.locator('select.minute').selectOption('30');
  await card.locator('select.repeat').selectOption('daily');
  await card.locator('input.new-text').fill('吃藥');
  await card.locator('input.new-text').press('Enter');
  await expect(card.locator('li .text')).toHaveText(['吃藥']);
  await expect(card.locator('li .time')).toHaveText(['07:30']);
  await expect(card.locator('li .tag')).toHaveText(['每天']);
  await expect.poll(() => readNotes(userDir)?.todos?.length, { timeout: 5_000 }).toBe(1);
  // a one-off that fell due a second ago
  await controllerCall(app, c => {
    const now = Date.now();
    c.cards.notes.todos.push({ id: 'due1', text: '開會', hour: 15, minute: 0, repeat: 'once', at: now - 1000, doneDay: null, firedAt: null, snoozeUntil: null });
    c.cards.tick(now);
  });
  await expect(card.locator('li.due .text')).toHaveText('開會');
  await expect.poll(() => page.evaluate(() => (window as any).__pet.engine.endPose), { timeout: 20_000 }).toBe('sit');
  await card.locator('li.due button.answer.done').click();
  await expect(card.locator('li.done .text')).toHaveText('開會');
  await controllerCall(app, c => c.cards.setHot('todo', false));   // the pointer leaves the card
  await expect.poll(() => isOpen(app, 'todo'), { timeout: 10_000 }).toBe(false);
  await expect.poll(() => page.evaluate(() => (window as any).__pet.engine.endPose), { timeout: 20_000 }).toBe('rest');
  await app.close();
});

test('the cards pop up when the app starts, once the cats are home, only once in a while, and go by themselves', async () => {
  const userDir = cardUserDir({ memo: { start: true, unlock: true }, todo: { start: true } });
  const { app } = await launch({ DESKTOP_PET_PACKS: cardPacks(), DESKTOP_PET_CARD_SECONDS: '2' }, userDir);
  await controllerCall(app, c => c.showPet('testcat2'));
  await cardPage(app, 'todo');
  await cardPage(app, 'memo');
  await controllerCall(app, c => c.cards.popFor('unlock'));   // right after: the same pop
  const log = readLog(userDir);
  expect(log.split('卡片：memo 自動跳出').length - 1).toBe(1);
  expect(log).toContain('卡片：todo 自動跳出（start）');
  await controllerCall(app, c => { c.cards.setHot('todo', false); c.cards.setHot('memo', false); });
  await expect.poll(() => isOpen(app, 'memo'), { timeout: 10_000 }).toBe(false);
  await expect.poll(() => isOpen(app, 'todo'), { timeout: 10_000 }).toBe(false);
  await app.close();
});

test('back at the computer the cat sits up, then its memo pops up', async () => {
  const userDir = cardUserDir({ memo: { back: true } });
  const { app } = await launch({ DESKTOP_PET_PACKS: cardPacks() }, userDir);
  await petPage(app);
  await controllerCall(app, c => { c.hidePet('testcat'); c.showPet('testcat2'); });
  const page = await calmPetPage(app, 'testcat2');
  await controllerCall(app, c => { c.idleSeconds = () => 3600; });
  await expect.poll(() => page.evaluate(() => (window as any).__pet.engine.endPose), { timeout: 20_000 }).toBe('perch');
  await controllerCall(app, c => { c.idleSeconds = () => 0; });
  await cardPage(app, 'memo');
  expect(await page.evaluate(() => (window as any).__pet.engine.endPose)).toBe('sit');
  expect(readLog(userDir)).toContain('卡片：memo 自動跳出（back）');
  await app.close();
});

test('the panel sets when each card pops up by itself', async () => {
  const userDir = cardUserDir({ todo: { start: true } });
  const { app } = await launch({ DESKTOP_PET_PACKS: cardPacks() }, userDir);
  await petPage(app);
  await controllerCall(app, c => c.openPanel());
  const panel = await panelPage(app);
  await panel.locator('.tab[data-tab="cards"]').click();
  const todo = panel.locator('[data-card="todo"]');
  await todo.locator('input[data-trigger="start"]').uncheck();
  await todo.locator('select.daily-hour').selectOption('8');
  await todo.locator('select.daily-minute').selectOption('40');
  await expect.poll(() => controllerCall(app, c => c.settings.cards.todo)).toMatchObject({ start: false, daily: 8 * 60 + 40 });
  await app.close();
});
```

- [ ] **Step 3：跑測試，修到全部通過**

Run: `npm run build && node scripts/make-test-pack.mjs && npx playwright test tests/e2e/cards.spec.ts`
Expected: 6 passed。失敗時依錯誤訊息回頭修 Task 5–7 的程式（不要放寬測試的意思）。

- [ ] **Step 4：Commit**

```bash
git add tests/e2e
git commit -m "End-to-end tests for the cards"
```

---

### Task 9：0.6.0：檢查清單、全部測試、推上 GitHub、Windows 安裝檔和 Mac 版

**Files:**
- Modify: `package.json`、`package-lock.json`、`docs/release-checklist.md`

- [ ] **Step 1：版本號**

`package.json` 和 `package-lock.json` 最上面兩個 `"version": "0.5.2"` 改成 `"0.6.0"`。

- [ ] **Step 2：檢查清單**

`docs/release-checklist.md` 最後加一節：

```markdown
## 離開、時間、提醒事項與備忘錄（0.6.0）
- [ ] 5 分鐘不碰電腦：兩隻貓都去睡（小昭睡覺或紙箱翻肚、阿胖睡覺或側躺）；動一下滑鼠：坐起來，其中一隻說「你回來了」（當天第一次是早安）
- [ ] 面板「設定」的「離開電腦多久」選關閉：怎麼放都不會睡
- [ ] 12:00、18:00（平日）、週五 17:00、半夜每 30 分：只有一隻貓說話
- [ ] 游標在小昭身上往上捲：頭上出現「小昭的提醒事項」；往下捲收起；阿胖往上捲是「阿胖的備忘錄」
- [ ] 右鍵選單有「提醒事項」「備忘錄」；只有一隻貓在時，另一張卡出現在牠頭上
- [ ] 備忘錄打字後關掉再打開，內容還在；重開 app 也還在
- [ ] 新增「時：分」「一次／每天／平日」的提醒；到點時小昭坐起來、卡片亮起、跳系統通知；「完成」打勾，「10 分鐘後」十分鐘後再來；按完 3 秒後卡片收起、小昭趴回去
- [ ] 開機、睡眠醒來、解鎖、離開回來、每天固定時間：依「提醒與備忘」分頁的勾選自動跳出，30 秒沒碰自己收起；幾件事一起發生只跳一次
- [ ] 拖著貓咪走，卡片跟著；貓咪在螢幕邊緣時卡片不會超出螢幕
```

- [ ] **Step 3：全部測試**

Run: `npm run typecheck && node scripts/make-test-pack.mjs && npx vitest run && npm run build && npx playwright test`
Expected: 全部 PASS

- [ ] **Step 4：Commit、併回 main、推上 GitHub**

```bash
git add -A package.json package-lock.json docs
git commit -m "Version 0.6.0"
cd /c/Users/USER/Projects/desktop-pet && git status --short && git merge --ff-only away-and-time && git push origin main
```

（main 有其他 session 的未存檔變更時先停下來問。）

- [ ] **Step 5：Windows 安裝檔**

```bash
cd /c/Users/USER/Projects/desktop-pet-away && npm run dist
cp "release/打工貓貓 Setup 0.6.0.exe" /c/Users/USER/Projects/desktop-pet/release/
```

- [ ] **Step 6：Mac 版**

```bash
GH="/c/Program Files/GitHub CLI/gh.exe"
cd /c/Users/USER/Projects/desktop-pet
"$GH" workflow run mac-build.yml --ref main
sleep 5; RUN=$("$GH" run list --workflow mac-build.yml --limit 1 --json databaseId -q '.[0].databaseId')
"$GH" run watch "$RUN" --exit-status
"$GH" run download "$RUN" -n mac-dmg -D release/
```

- [ ] **Step 7：收掉 worktree**

刪 `node_modules` junction（非遞迴），`git worktree remove`，`git branch -d away-and-time`。

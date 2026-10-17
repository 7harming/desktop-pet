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

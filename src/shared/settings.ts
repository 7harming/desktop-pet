import type { CardKind } from './types';

/** `actions`: the poses auto mode may use (ticked in the panel); null = all of them. */
export interface PetSettings { visible: boolean; scale: number; auto: boolean; x: number | null; actions: string[] | null }
export interface ReminderSettings { water: number; stretch: number; eyes: number; notify: boolean; pausedUntil: number | null }
/**
 * When a card pops up by itself: the app starting, the computer waking from sleep, the screen being unlocked, the user back at
 * the computer, and every day at `daily` (minutes after midnight, on the tens; null: not).
 */
export interface CardSettings { start: boolean; resume: boolean; unlock: boolean; back: boolean; daily: number | null }
/**
 * `actionInterval`: in auto mode every cat rests about this many seconds in a pose before it does something else. `fightAuto`: two
 * cats close together play-fight now and then.
 */
export interface Settings {
  version: 1;
  firstRunDone: boolean;
  autoStart: boolean;
  actionInterval: number;
  fightAuto: boolean;
  /** No key or mouse for this many minutes counts as away: the cats go to sleep and the reminders wait. 0: never. */
  awayMinutes: number;
  pets: Record<string, PetSettings>;
  petOrder: string[];
  reminders: ReminderSettings;
  cards: Record<CardKind, CardSettings>;
}

export const REMINDER_CHOICES = [0, 30, 45, 60, 90];
export const ACTION_INTERVALS = [15, 30, 60];
export const AWAY_CHOICES = [0, 3, 5, 10];
export const SIZE_PRESETS = { s: 0.5, m: 1, l: 1.3 } as const;
/** A new cat rests in the bottom-right corner, as close to the edge as what it always needs room for allows (see extentOf). */
export const DEFAULT_X = 1;
export const MIN_SCALE = 0.4;
export const MAX_SCALE = 1.5;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function defaultSettings(): Settings {
  return {
    version: 1, firstRunDone: false, autoStart: true, actionInterval: 30, fightAuto: true, awayMinutes: 5, pets: {}, petOrder: [],
    reminders: { water: 45, stretch: 60, eyes: 0, notify: true, pausedUntil: null },
    cards: {
      memo: { start: true, resume: true, unlock: true, back: true, daily: 9 * 60 },
      todo: { start: true, resume: true, unlock: true, back: false, daily: 9 * 60 },
    },
  };
}

export function normalizeSettings(raw: unknown, packIds: string[]): { settings: Settings; warnings: string[] } {
  const warnings: string[] = [];
  if (raw !== undefined && !isObj(raw)) warnings.push('設定檔格式不對，已改用預設值');
  const r = isObj(raw) ? raw : {};
  const d = defaultSettings();
  const rawPets = isObj(r.pets) ? r.pets : {};
  const fresh = Object.keys(rawPets).length === 0;
  const rawCards = isObj(r.cards) ? r.cards : {};
  const order = Array.isArray(r.petOrder) ? r.petOrder.filter((x): x is string => typeof x === 'string' && packIds.includes(x)) : [];
  for (const id of packIds) if (!order.includes(id)) order.push(id);

  const settings: Settings = {
    version: 1,
    firstRunDone: typeof r.firstRunDone === 'boolean' ? r.firstRunDone : d.firstRunDone,
    autoStart: typeof r.autoStart === 'boolean' ? r.autoStart : d.autoStart,
    actionInterval: finite(r.actionInterval) && ACTION_INTERVALS.includes(r.actionInterval) ? r.actionInterval : d.actionInterval,
    fightAuto: typeof r.fightAuto === 'boolean' ? r.fightAuto : d.fightAuto,
    awayMinutes: finite(r.awayMinutes) && AWAY_CHOICES.includes(r.awayMinutes) ? r.awayMinutes : d.awayMinutes,
    pets: {},
    petOrder: order,
    reminders: normalizeReminders(r.reminders, d.reminders),
    cards: { memo: normalizeCardSettings(rawCards.memo, d.cards.memo), todo: normalizeCardSettings(rawCards.todo, d.cards.todo) },
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
    actions: Array.isArray(r.actions) ? r.actions.filter((a): a is string => typeof a === 'string') : null,
  };
}

export function normalizeCardSettings(raw: unknown, d: CardSettings): CardSettings {
  const r = isObj(raw) ? raw : {};
  const flag = (k: 'start' | 'resume' | 'unlock' | 'back') => (typeof r[k] === 'boolean' ? (r[k] as boolean) : d[k]);
  const daily = r.daily === null ? null
    : Number.isInteger(r.daily) && (r.daily as number) >= 0 && (r.daily as number) < 24 * 60 && (r.daily as number) % 10 === 0 ? (r.daily as number) : d.daily;
  return { start: flag('start'), resume: flag('resume'), unlock: flag('unlock'), back: flag('back'), daily };
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

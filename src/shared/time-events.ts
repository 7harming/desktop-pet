import type { TimeEvent } from './types';

/** After lunch the cats nap more; late at night they slow down and sleep more. */
export type DayPart = 'day' | 'nap' | 'night';

const MIN = 60_000;
/** Ticks further apart than this (the computer slept) let the events in between pass unsaid. */
const MAX_GAP_MS = 2 * MIN;
const WEEKDAYS = [1, 2, 3, 4, 5];
/** When each clock event is due: minutes after midnight, on which days (0: Sunday; none: every day). */
const CLOCK: { at: number; event: TimeEvent; days?: number[] }[] = [
  { at: 12 * 60, event: 'lunch' },
  { at: 17 * 60, event: 'friday', days: [5] },
  { at: 18 * 60, event: 'offWork', days: WEEKDAYS },
  ...[0, 1, 2, 3, 4].flatMap(h => [0, 30].map(m => ({ at: h * 60 + m, event: 'bedtime' as const }))),
];

export function dayPart(d: Date): DayPart {
  const h = d.getHours();
  if (h === 13) return 'nap';
  return h >= 22 || h < 5 ? 'night' : 'day';
}

/** The day a hello belongs to: days start at 5:00, so the small hours still count as the day before. */
export function helloDay(d: Date): string {
  const t = new Date(d.getTime() - 5 * 60 * MIN);
  return `${t.getFullYear()}-${t.getMonth() + 1}-${t.getDate()}`;
}

/** What the day's first hello (the app starting, or the user back at the computer) says: good morning (weekdays, 5:00–11:00), or on a weekend why are you working. */
export function helloEvent(d: Date): TimeEvent | null {
  const h = d.getHours();
  if (h < 5) return null;
  if (d.getDay() === 0 || d.getDay() === 6) return 'weekend';
  return h < 11 ? 'morning' : null;
}

/** The clock events due after `from`, up to and including `to`. */
export function clockEvents(from: Date, to: Date): TimeEvent[] {
  if (to.getTime() - from.getTime() > MAX_GAP_MS) return [];
  const out: TimeEvent[] = [];
  for (let t = Math.floor(from.getTime() / MIN) * MIN + MIN; t <= to.getTime(); t += MIN) {
    const d = new Date(t);
    const at = d.getHours() * 60 + d.getMinutes();
    for (const c of CLOCK) if (c.at === at && (!c.days || c.days.includes(d.getDay()))) out.push(c.event);
  }
  return out;
}

/** Whether the clock passed `minuteOfDay` (minutes after midnight) after `from`, up to and including `to`; not across a sleep. */
export function crossedMinute(minuteOfDay: number, from: Date, to: Date): boolean {
  if (to.getTime() - from.getTime() > MAX_GAP_MS) return false;
  const t = new Date(to);
  t.setHours(0, minuteOfDay, 0, 0);
  return from.getTime() < t.getTime() && t.getTime() <= to.getTime();
}

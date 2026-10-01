import { helloDay } from './time-events';

export type Repeat = 'once' | 'daily' | 'weekdays';
/**
 * A reminder on 小昭's list. `at`: when a one-off is due (ms). `doneDay`: the day (helloDay) it was ticked. `firedAt`: the time it
 * last came up for, so that time does not come up again, ticked or not.
 */
export interface Todo {
  id: string; text: string; hour: number; minute: number; repeat: Repeat;
  at: number | null; doneDay: string | null; firedAt: number | null;
}
export interface DueTodo { id: string; missed: boolean }

const MIN = 60_000;
/** The minutes a reminder can be set to: on the tens. */
export const MINUTES = [0, 10, 20, 30, 40, 50];
/** A reminder that comes up later than this after its time is marked missed (the computer was off or asleep). */
const MISSED_AFTER_MS = 2 * MIN;

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

/** The reminders due now that have not come up yet (and are not ticked), leaving out those already showing (`pending`). */
export function dueTodos(todos: Todo[], now: number, pending: ReadonlySet<string> = new Set()): DueTodo[] {
  const out: DueTodo[] = [];
  for (const t of todos) {
    if (pending.has(t.id) || isDone(t, now)) continue;
    const due = occurrence(t, now);
    if (due === null || due > now || t.firedAt === due) continue;
    out.push({ id: t.id, missed: now - due > MISSED_AFTER_MS });
  }
  return out;
}

/** A new reminder. One whose time has already gone today does not come up today. */
export function newTodo(id: string, text: string, hour: number, minute: number, repeat: Repeat, now: number): Todo {
  const t: Todo = { id, text, hour, minute, repeat, at: repeat === 'once' ? nextAt(hour, minute, now) : null, doneDay: null, firedAt: null };
  const due = occurrence(t, now);
  return due !== null && due <= now ? { ...t, firedAt: due } : t;
}

/** It came up: its time does not come up again, whether or not it is ticked. */
export function markFired(t: Todo, now: number): Todo {
  return { ...t, firedAt: occurrence(t, now) ?? t.firedAt };
}

/** Ticked: done for today, and its time does not come up again. */
export function markDone(t: Todo, now: number): Todo {
  return { ...markFired(t, now), doneDay: helloDay(new Date(now)) };
}

export const markUndone = (t: Todo): Todo => ({ ...t, doneDay: null });

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

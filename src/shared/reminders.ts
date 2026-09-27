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

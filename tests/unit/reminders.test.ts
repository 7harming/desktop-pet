import { describe, it, expect } from 'vitest';
import { ReminderScheduler } from '../../src/shared/reminders';

const M = 60_000;
const make = () => new ReminderScheduler({ water: 45, stretch: 60, eyes: 0 }, 0);

describe('ReminderScheduler', () => {
  it('fires each type after its interval, once', () => {
    const s = make();
    expect(s.due(44 * M)).toEqual([]);
    expect(s.due(45 * M)).toEqual(['water']);
    expect(s.due(50 * M)).toEqual([]);
    expect(s.due(60 * M)).toEqual(['stretch']);
  });
  it('comes again an interval after it came up, answered or not', () => {
    // a bubble can go unanswered (another reminder took its place, the cat walked off): that reminder must not stop for good
    const s = make();
    expect(s.due(45 * M)).toEqual(['water']);
    expect(s.nextAt('water')).toBe(90 * M);
    expect(s.due(89 * M)).toEqual(['stretch']);
    expect(s.due(90 * M)).toEqual(['water']);
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

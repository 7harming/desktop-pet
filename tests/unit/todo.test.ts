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

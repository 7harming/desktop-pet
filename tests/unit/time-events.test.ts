import { describe, it, expect } from 'vitest';
import { clockEvents, dayPart, helloDay, helloEvent } from '../../src/shared/time-events';

// 2026-10-05 is a Monday; the 9th a Friday, the 10th a Saturday
const at = (day: number, h: number, m = 0, s = 0) => new Date(2026, 9, day, h, m, s);

describe('dayPart', () => {
  it('naps after lunch and slows down late at night', () => {
    expect(dayPart(at(5, 12, 59))).toBe('day');
    expect(dayPart(at(5, 13, 0))).toBe('nap');
    expect(dayPart(at(5, 13, 59))).toBe('nap');
    expect(dayPart(at(5, 14, 0))).toBe('day');
    expect(dayPart(at(5, 21, 59))).toBe('day');
    expect(dayPart(at(5, 22, 0))).toBe('night');
    expect(dayPart(at(6, 4, 59))).toBe('night');
    expect(dayPart(at(6, 5, 0))).toBe('day');
  });
});

describe('the first hello of the day', () => {
  it('says good morning on a weekday morning, and on a weekend asks why you are working', () => {
    expect(helloEvent(at(5, 4, 59))).toBeNull();
    expect(helloEvent(at(5, 5, 0))).toBe('morning');
    expect(helloEvent(at(5, 10, 59))).toBe('morning');
    expect(helloEvent(at(5, 11, 0))).toBeNull();
    expect(helloEvent(at(10, 15, 0))).toBe('weekend');
    expect(helloEvent(at(11, 9, 0))).toBe('weekend');
  });

  it('counts the small hours as the day before', () => {
    expect(helloDay(at(6, 2, 0))).toBe(helloDay(at(5, 9, 0)));
    expect(helloDay(at(6, 5, 0))).not.toBe(helloDay(at(5, 9, 0)));
  });
});

describe('clockEvents', () => {
  it('calls lunch at noon every day', () => {
    expect(clockEvents(at(5, 11, 59, 50), at(5, 12, 0, 5))).toEqual(['lunch']);
    expect(clockEvents(at(10, 11, 59, 50), at(10, 12, 0, 5))).toEqual(['lunch']);
    expect(clockEvents(at(5, 12, 0, 5), at(5, 12, 0, 20))).toEqual([]);   // said once
  });

  it('asks about leaving work at six on weekdays, and cheers Friday at five', () => {
    expect(clockEvents(at(5, 17, 59, 50), at(5, 18, 0, 5))).toEqual(['offWork']);
    expect(clockEvents(at(10, 17, 59, 50), at(10, 18, 0, 5))).toEqual([]);
    expect(clockEvents(at(9, 16, 59, 50), at(9, 17, 0, 5))).toEqual(['friday']);
    expect(clockEvents(at(8, 16, 59, 50), at(8, 17, 0, 5))).toEqual([]);
  });

  it('says it is bedtime every half hour from midnight until half past four', () => {
    expect(clockEvents(at(5, 23, 59, 50), at(6, 0, 0, 5))).toEqual(['bedtime']);
    expect(clockEvents(at(6, 0, 29, 50), at(6, 0, 30, 5))).toEqual(['bedtime']);
    expect(clockEvents(at(6, 4, 29, 50), at(6, 4, 30, 5))).toEqual(['bedtime']);
    expect(clockEvents(at(6, 4, 59, 50), at(6, 5, 0, 5))).toEqual([]);
    expect(clockEvents(at(6, 0, 10), at(6, 0, 11))).toEqual([]);
  });

  it('lets events pass that were missed while the computer slept', () => {
    expect(clockEvents(at(5, 11, 0), at(5, 13, 0))).toEqual([]);
  });
});

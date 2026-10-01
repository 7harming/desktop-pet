import { describe, it, expect } from 'vitest';
import { normalizeNotes } from '../../src/shared/notes';

describe('normalizeNotes', () => {
  it('starts empty', () => {
    expect(normalizeNotes(undefined)).toEqual({ version: 1, memo: '', todos: [] });
  });
  it('keeps good reminders and drops broken ones', () => {
    const good = { id: 'a', text: '開會', hour: 15, minute: 0, repeat: 'once', at: 123, doneDay: null, firedAt: null };
    const daily = { id: 'b', text: '吃藥', hour: 9, minute: 30, repeat: 'daily', at: 5, doneDay: '2026-10-5', firedAt: 7 };
    const raw = { memo: '要買貓砂', todos: [good, daily, { ...good, minute: 15 }, { ...good, hour: 24 }, { ...good, repeat: 'yearly' }, { ...good, at: null }, 'x'] };
    expect(normalizeNotes(raw)).toEqual({ version: 1, memo: '要買貓砂', todos: [good, { ...daily, at: null }] });
  });
});

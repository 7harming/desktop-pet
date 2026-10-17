import { describe, it, expect, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger } from '../../src/main/logger';
import { NotesStore } from '../../src/main/notes-store';
import { defaultDinner } from '../../src/shared/dinner';

const setup = () => {
  const dir = mkdtempSync(join(tmpdir(), 'dpet-notes-'));
  return { dir, file: join(dir, 'notes.json'), store: new NotesStore(join(dir, 'notes.json'), new Logger(join(dir, 'logs'))) };
};

describe('NotesStore', () => {
  it('starts empty without a file, and round-trips', () => {
    const { store } = setup();
    const notes = store.load();
    expect(notes).toEqual({ version: 1, memo: '', todos: [], dinner: defaultDinner() });
    notes.memo = '要買貓砂';
    notes.dinner = { items: ['便當', '拉麵'], last: { day: '2026-10-17', dish: '拉麵' }, prev: null };
    store.save(notes);
    expect(store.load().memo).toBe('要買貓砂');
    expect(store.load().dinner).toEqual(notes.dinner);
  });
  it('backs up a broken file and starts empty', () => {
    const { dir, file, store } = setup();
    writeFileSync(file, '{ broken');
    expect(store.load().todos).toEqual([]);
    expect(existsSync(join(dir, 'notes.bad.json'))).toBe(true);
  });
  it('a save that fails later (the file held by another program) is logged, not thrown', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dpet-notes-'));
    const file = join(dir, 'notes.json');
    const log = new Logger(join(dir, 'logs'));
    const store = new NotesStore(file, log);
    const notes = store.load();
    mkdirSync(file);                                  // the rename onto it cannot succeed
    vi.useFakeTimers();
    try {
      store.saveSoon(notes, 10);
      expect(() => vi.runAllTimers()).not.toThrow();
    } finally { vi.useRealTimers(); }
    expect(readFileSync(log.file, 'utf8')).toContain('[ERROR] 備忘錄存不了');
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

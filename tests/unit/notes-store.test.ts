import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger } from '../../src/main/logger';
import { NotesStore } from '../../src/main/notes-store';

const setup = () => {
  const dir = mkdtempSync(join(tmpdir(), 'dpet-notes-'));
  return { dir, file: join(dir, 'notes.json'), store: new NotesStore(join(dir, 'notes.json'), new Logger(join(dir, 'logs'))) };
};

describe('NotesStore', () => {
  it('starts empty without a file, and round-trips', () => {
    const { store } = setup();
    const notes = store.load();
    expect(notes).toEqual({ version: 1, memo: '', todos: [] });
    notes.memo = '要買貓砂';
    store.save(notes);
    expect(store.load().memo).toBe('要買貓砂');
  });
  it('backs up a broken file and starts empty', () => {
    const { dir, file, store } = setup();
    writeFileSync(file, '{ broken');
    expect(store.load().todos).toEqual([]);
    expect(existsSync(join(dir, 'notes.bad.json'))).toBe(true);
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

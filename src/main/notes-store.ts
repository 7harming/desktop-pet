import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { normalizeNotes, type Notes } from '../shared/notes';
import type { Logger } from './logger';

/** notes.json (the memo and the reminders), written like settings.json: a temp file, then a rename. */
export class NotesStore {
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly file: string, private readonly log: Logger) {}

  load(): Notes {
    if (!existsSync(this.file)) return normalizeNotes(undefined);
    try {
      return normalizeNotes(JSON.parse(readFileSync(this.file, 'utf8')));
    } catch (e) {
      renameSync(this.file, this.file.replace(/\.json$/, '.bad.json'));
      this.log.warn(`備忘錄檔損壞，已備份成 notes.bad.json 並從空的開始：${(e as Error).message}`);
      return normalizeNotes(undefined);
    }
  }

  save(notes: Notes): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(notes, null, 2), 'utf8');
    renameSync(tmp, this.file);
  }

  saveSoon(notes: Notes, delayMs = 500): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; this.save(notes); }, delayMs);
  }

  flush(notes: Notes): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.save(notes);
  }
}

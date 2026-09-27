import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { normalizeSettings, type Settings } from '../shared/settings';
import type { Logger } from './logger';

export class SettingsStore {
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly file: string, private readonly log: Logger) {}

  load(packIds: string[]): { settings: Settings; warning: string | null } {
    let raw: unknown;
    let warning: string | null = null;
    if (existsSync(this.file)) {
      try {
        raw = JSON.parse(readFileSync(this.file, 'utf8'));
      } catch (e) {
        renameSync(this.file, this.file.replace(/\.json$/, '.bad.json'));
        warning = '設定檔損壞，已備份成 settings.bad.json 並改用預設值';
        this.log.warn(`${warning}：${(e as Error).message}`);
      }
    }
    const { settings, warnings } = normalizeSettings(raw, packIds);
    for (const w of warnings) this.log.warn(w);
    return { settings, warning: warning ?? warnings[0] ?? null };
  }

  /** Write to a temp file, then rename, so a crash never leaves half a settings file. */
  save(settings: Settings): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(settings, null, 2), 'utf8');
    renameSync(tmp, this.file);
  }

  saveSoon(settings: Settings, delayMs = 500): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; this.save(settings); }, delayMs);
  }

  flush(settings: Settings): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.save(settings);
  }
}

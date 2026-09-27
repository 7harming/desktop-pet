import { appendFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export class Logger {
  readonly file: string;

  constructor(dir: string, keep = 5, now = new Date()) {
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, `app-${now.toISOString().replace(/[:.]/g, '-')}.log`);
    writeFileSync(this.file, '');
    const logs = readdirSync(dir).filter(f => /^app-.*\.log$/.test(f)).sort();
    for (const f of logs.slice(0, Math.max(0, logs.length - keep))) rmSync(join(dir, f), { force: true });
  }

  info(m: string): void { this.write('INFO', m); }
  warn(m: string): void { this.write('WARN', m); }
  error(m: string): void { this.write('ERROR', m); }

  private write(level: string, m: string): void {
    try { appendFileSync(this.file, `${new Date().toISOString()} [${level}] ${m}\n`); } catch { /* logging must never crash the app */ }
  }
}

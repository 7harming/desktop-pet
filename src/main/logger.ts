import { appendFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { problemsIn, type Problem } from './diagnostics';

/** The panel lists the problems remembered: at most this many (the newest). */
const KEEP_PROBLEMS = 500;

export class Logger {
  readonly file: string;
  /** The warnings and errors of the runs whose logs are kept and of this one, oldest first (the panel's 問題紀錄). */
  readonly problems: Problem[] = [];
  /** A warning or an error was just written. */
  onProblem: () => void = () => {};

  constructor(readonly dir: string, keep = 5, now = new Date()) {
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, `app-${now.toISOString().replace(/[:.]/g, '-')}.log`);
    writeFileSync(this.file, '');
    const logs = readdirSync(dir).filter(f => /^app-.*\.log$/.test(f)).sort();
    for (const f of logs.slice(0, Math.max(0, logs.length - keep))) rmSync(join(dir, f), { force: true });
    for (const f of logs.slice(-keep)) {
      try { this.problems.push(...problemsIn(readFileSync(join(dir, f), 'utf8'))); } catch { /* an old log we can not read is no problem */ }
    }
    this.problems.splice(0, Math.max(0, this.problems.length - KEEP_PROBLEMS));
  }

  info(m: string): void { this.write('INFO', m); }
  warn(m: string): void { this.write('WARN', m); }
  error(m: string): void { this.write('ERROR', m); }

  private write(level: 'INFO' | 'WARN' | 'ERROR', m: string): void {
    const at = new Date().toISOString();
    try { appendFileSync(this.file, `${at} [${level}] ${m}\n`); } catch { /* logging must never crash the app */ }
    if (level === 'INFO') return;
    this.problems.push({ at, level, text: m });
    if (this.problems.length > KEEP_PROBLEMS) this.problems.shift();
    try { this.onProblem(); } catch { /* nor must telling of it */ }
  }
}

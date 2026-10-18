import { describe, it, expect } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger } from '../../src/main/logger';

describe('Logger', () => {
  it('writes lines and keeps only the newest files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dpet-log-'));
    let last!: Logger;
    for (let i = 0; i < 7; i++) last = new Logger(dir, 5, new Date(Date.UTC(2026, 8, 27, 10, i)));
    expect(readdirSync(dir).length).toBe(5);
    last.warn('哈囉');
    expect(readFileSync(last.file, 'utf8')).toMatch(/\[WARN\] 哈囉\n$/);
  });
  it('remembers the warnings and errors of the runs it keeps and of this one, and says when one comes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dpet-log-'));
    const a = new Logger(dir, 5, new Date(Date.UTC(2026, 9, 18, 1, 0)));
    a.info('啟動');
    a.error('上次的錯誤');
    const b = new Logger(dir, 5, new Date(Date.UTC(2026, 9, 18, 2, 0)));
    let told = 0;
    b.onProblem = () => { told++; };
    b.warn('這次的警告');
    b.info('平常的事');
    expect(b.problems.map(p => [p.level, p.text])).toEqual([['ERROR', '上次的錯誤'], ['WARN', '這次的警告']]);
    expect(told).toBe(1);
  });
});

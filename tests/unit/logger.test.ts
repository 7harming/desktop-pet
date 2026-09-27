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
});

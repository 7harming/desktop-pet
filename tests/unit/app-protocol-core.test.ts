import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { resolveAppPath, parseRange, contentType } from '../../src/main/app-protocol-core';

const roots = { ui: join('C:', 'app', 'dist'), packs: join('C:', 'app', 'packs') };

describe('app protocol helpers', () => {
  it('maps ui and pack paths', () => {
    expect(resolveAppPath('/ui/pet.html', roots)).toBe(join(roots.ui, 'pet.html'));
    expect(resolveAppPath('/packs/xiaozhao/clips/idle_lie.webm', roots)).toBe(join(roots.packs, 'xiaozhao', 'clips', 'idle_lie.webm'));
    expect(resolveAppPath('/packs/%E5%B0%8F/a.png', roots)).toBe(join(roots.packs, '小', 'a.png'));
  });
  it('refuses anything outside the roots', () => {
    expect(resolveAppPath('/ui/../../secret.txt', roots)).toBeNull();
    expect(resolveAppPath('/other/x', roots)).toBeNull();
    expect(resolveAppPath('/ui', roots)).toBeNull();
  });
  it('parses byte ranges', () => {
    expect(parseRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 });
    expect(parseRange('bytes=900-', 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange('bytes=0-5000', 1000)).toEqual({ start: 0, end: 999 });
    expect(parseRange('bytes=2000-', 1000)).toBeNull();
    expect(parseRange(null, 1000)).toBeNull();
  });
  it('knows the content types we serve', () => {
    expect(contentType('a.webm')).toBe('video/webm');
    expect(contentType('a.HTML')).toBe('text/html; charset=utf-8');
    expect(contentType('a.xyz')).toBe('application/octet-stream');
  });
});

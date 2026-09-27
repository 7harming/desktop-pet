import { describe, it, expect } from 'vitest';
import { cpSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadPack, loadPacks } from '../../src/main/pack-loader';

const FIXTURES = resolve('tests/fixtures/packs');

function copyPack(id = 'testcat'): string {
  const root = mkdtempSync(join(tmpdir(), 'dpet-pack-'));
  cpSync(join(FIXTURES, id), join(root, id), { recursive: true });
  return join(root, id);
}

describe('pack loader', () => {
  it('loads both test packs in folder order', () => {
    const packs = loadPacks(FIXTURES);
    expect(packs.map(p => [p.id, p.errors])).toEqual([['testcat', []], ['testcat2', []]]);
  });
  it('reports a missing clip file', () => {
    const dir = copyPack();
    rmSync(join(dir, 'clips/go_perch.webm'));
    expect(loadPack(dir).errors).toContain('找不到片段 go_perch 的檔案：clips/go_perch.webm');
  });
  it('reports a folder whose name differs from the pack id', () => {
    const dir = copyPack();
    const json = JSON.parse(readFileSync(join(dir, 'pack.json'), 'utf8'));
    writeFileSync(join(dir, 'pack.json'), JSON.stringify({ ...json, id: 'other' }));
    expect(loadPack(dir).errors).toEqual(['資料夾名稱 testcat 和 pack.json 的 id（other）要一樣']);
  });
  it('reports unreadable json', () => {
    const dir = copyPack();
    writeFileSync(join(dir, 'pack.json'), '{ nope');
    const r = loadPack(dir);
    expect(r.pack).toBeNull();
    expect(r.errors[0]).toMatch(/^讀不到 pack.json：/);
  });
  it('returns nothing for a missing packs folder', () => {
    expect(loadPacks(join(tmpdir(), 'no-such-folder-dpet'))).toEqual([]);
  });
});

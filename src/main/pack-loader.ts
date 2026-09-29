import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parsePack } from '../shared/pack';
import { validatePack } from '../shared/validate';
import type { Pack } from '../shared/types';

export interface LoadedPack { id: string; dir: string; pack: Pack | null; errors: string[] }

export function loadPack(dir: string): LoadedPack {
  const folder = basename(dir);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(join(dir, 'pack.json'), 'utf8'));
  } catch (e) {
    return { id: folder, dir, pack: null, errors: [`讀不到 pack.json：${(e as Error).message}`] };
  }
  const { pack, errors } = parsePack(raw);
  if (!pack) return { id: folder, dir, pack: null, errors };
  if (pack.id !== folder) return { id: folder, dir, pack: null, errors: [`資料夾名稱 ${folder} 和 pack.json 的 id（${pack.id}）要一樣`] };
  const more = validatePack(pack, rel => existsSync(join(dir, rel)));
  return more.length ? { id: folder, dir, pack: null, errors: more } : { id: folder, dir, pack, errors: [] };
}

/** Every pack in `packsDir`: by each pack's `order`, then (and packs without one after) by folder name. */
export function loadPacks(packsDir: string): LoadedPack[] {
  if (!existsSync(packsDir)) return [];
  const rank = (p: LoadedPack) => p.pack?.order ?? Infinity;
  return readdirSync(packsDir)
    .filter(n => statSync(join(packsDir, n)).isDirectory())
    .sort()
    .map(n => loadPack(join(packsDir, n)))
    .sort((a, b) => rank(a) - rank(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

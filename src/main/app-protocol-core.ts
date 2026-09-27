import { extname, join, normalize, sep } from 'node:path';

export interface AppRoots { ui: string; packs: string }

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webm': 'video/webm',
  '.png': 'image/png',
};

export function contentType(file: string): string {
  return TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
}

export function resolveAppPath(pathname: string, roots: AppRoots): string | null {
  let parts: string[];
  try { parts = decodeURIComponent(pathname).split('/').filter(Boolean); } catch { return null; }
  const [area, ...rest] = parts;
  const root = area === 'ui' ? roots.ui : area === 'packs' ? roots.packs : null;
  if (!root || rest.length === 0) return null;
  const full = normalize(join(root, ...rest));
  const base = normalize(root.endsWith(sep) ? root : root + sep);
  return full.startsWith(base) ? full : null;
}

export function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start: number;
  let end: number;
  if (m[1] === '') { start = Math.max(0, size - Number(m[2])); end = size - 1; }
  else { start = Number(m[1]); end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1); }
  if (start > end || start >= size) return null;
  return { start, end };
}

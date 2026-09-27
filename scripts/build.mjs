import { build } from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const common = { bundle: true, sourcemap: true, logLevel: 'info', target: 'es2022' };
const node = { ...common, platform: 'node', format: 'cjs', external: ['electron'] };
const browser = { ...common, platform: 'browser', format: 'iife' };
const entries = [
  ['src/main/main.ts', 'dist/main.js', node],
  ['src/main/preload-pet.ts', 'dist/preload-pet.js', node],
  ['src/main/preload-panel.ts', 'dist/preload-panel.js', node],
  ['src/main/preload-break.ts', 'dist/preload-break.js', node],
  ['src/pet/pet.ts', 'dist/pet.js', browser],
  ['src/panel/panel.ts', 'dist/panel.js', browser],
  ['src/break/break.ts', 'dist/break.js', browser],
  ['src/cli/check-pack.ts', 'dist/check-pack.js', node],
];
await mkdir('dist', { recursive: true });
await Promise.all(entries.filter(([src]) => existsSync(src)).map(([src, out, opts]) => build({ ...opts, entryPoints: [src], outfile: out })));
for (const f of ['src/pet/pet.html', 'src/pet/pet.css', 'src/panel/panel.html', 'src/panel/panel.css', 'src/break/break.html', 'src/break/break.css']) {
  if (existsSync(f)) await cp(f, `dist/${f.split('/').pop()}`);
}

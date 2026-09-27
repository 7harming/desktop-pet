import { resolve } from 'node:path';
import { loadPack } from '../main/pack-loader';

const dirs = process.argv.slice(2);
if (!dirs.length) {
  console.error('用法：npm run check-pack -- <寵物包資料夾> [...]');
  process.exit(2);
}
let bad = 0;
for (const d of dirs) {
  const r = loadPack(resolve(d));
  if (r.pack) { console.log(`✓ ${r.id}：沒有問題`); continue; }
  bad++;
  console.log(`✗ ${r.id}：`);
  for (const e of r.errors) console.log(`   - ${e}`);
}
process.exit(bad ? 1 : 0);

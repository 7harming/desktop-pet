import ffmpeg from 'ffmpeg-static';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const base = JSON.parse(readFileSync('tests/fixtures/test-pack.json', 'utf8'));
const colors = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'white'];
const run = args => execFileSync(ffmpeg, ['-y', '-loglevel', 'error', ...args]);

for (const [id, name] of [['testcat', '測試貓'], ['testcat2', '測試貓二號']]) {
  const dir = join('tests/fixtures/packs', id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, 'clips'), { recursive: true });
  writeFileSync(join(dir, 'pack.json'), JSON.stringify({ ...base, id, name }, null, 2));
  Object.values(base.clips).forEach((def, i) => {
    // transparent 320x180 frame with an opaque box standing on the 90% ground line.
    // rgba must be negotiated inside the lavfi graph, or the source drops alpha;
    // replace=1 makes drawbox write the box's alpha instead of keeping the frame's.
    run(['-f', 'lavfi', '-i',
      `color=c=black@0.0:s=320x180:d=1:r=24,format=rgba,drawbox=x=60:y=90:w=100:h=72:color=${colors[i % colors.length]}@1:t=fill:replace=1`,
      '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '40', '-auto-alt-ref', '0', join(dir, def.file)]);
  });
  run(['-f', 'lavfi', '-i', 'color=c=gray:s=128x128', '-frames:v', '1', join(dir, 'portrait.png')]);
}
console.log('test packs written to tests/fixtures/packs');

import ffmpeg from 'ffmpeg-static';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const base = JSON.parse(readFileSync('tests/fixtures/test-pack.json', 'utf8'));
const colors = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'white'];
const run = args => execFileSync(ffmpeg, ['-y', '-loglevel', 'error', ...args]);
// the walking clips move their box (t runs 0..23/24 over the 24 frames), matching walk.from/to/departX in test-pack.json
const glide = (a, b) => `${a}+${b - a}*t*24/23`;
const boxX = { walk_loop: glide(20, 200), walk_arrive: glide(20, 60), walk_depart: glide(60, 20) };

for (const [id, name] of [['testcat', '測試貓'], ['testcat2', '測試貓二號']]) {
  const dir = join('tests/fixtures/packs', id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, 'clips'), { recursive: true });
  writeFileSync(join(dir, 'pack.json'), JSON.stringify({ ...base, id, name }, null, 2));
  Object.entries(base.clips).forEach(([clip, def], i) => {
    // transparent 320x180 frame with an opaque box standing on the 90% ground line.
    // rgba must be negotiated inside the lavfi graph, or the source drops alpha.
    const color = colors[i % colors.length];
    const enc = ['-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '40', '-auto-alt-ref', '0', join(dir, def.file)];
    if (boxX[clip]) {
      // a moving box: overlay evaluates its position every frame (drawbox cannot)
      run(['-f', 'lavfi', '-i', 'color=c=black@0.0:s=320x180:d=1:r=24,format=rgba',
        '-f', 'lavfi', '-i', `color=c=${color}:s=100x72:d=1:r=24,format=rgba`,
        '-filter_complex', `[0][1]overlay=x='${boxX[clip]}':y=90:eval=frame:format=auto`, ...enc]);
    } else {
      // replace=1 makes drawbox write the box's alpha instead of keeping the frame's
      run(['-f', 'lavfi', '-i',
        `color=c=black@0.0:s=320x180:d=1:r=24,format=rgba,drawbox=x=60:y=90:w=100:h=72:color=${color}@1:t=fill:replace=1`, ...enc]);
    }
  });
  run(['-f', 'lavfi', '-i', 'color=c=gray:s=128x128', '-frames:v', '1', join(dir, 'portrait.png')]);
}
console.log('test packs written to tests/fixtures/packs');

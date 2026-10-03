import { test, expect } from '@playwright/test';
import { calmPetPage, controllerCall, launch, petPage, readLog, stallClips } from './helpers';

test('the first cat walks in, lies down and plays an idle of its start pose', async () => {
  const { app } = await launch();
  const page = await petPage(app, 'testcat', false);
  await page.evaluate(() => { (window as any).__pet.engine.auto = false; });   // or it may head for another pose right away
  await expect.poll(() => page.evaluate(() => (window as any).__pet.history.slice(0, 2).join(',')), { timeout: 20_000 }).toMatch(/^idle_rest/);   // arrive is drawn by the walker, then the engine's first idle
  expect(await controllerCall(app, c => [...c.pets.keys()])).toEqual(['testcat']);
  // the frame is 533x300 at scale 1 and sits in a strip as wide as the work area; display scaling may round up by one pixel
  const { strip, frame, wa } = await controllerCall(app, c => {
    const p = c.pets.get('testcat');
    return { strip: p.win.getBounds(), frame: p.frame, wa: c.workArea() };
  });
  expect([frame.width, frame.height]).toEqual([533, 300]);
  expect(strip.width - wa.width).toBeGreaterThanOrEqual(0);
  expect(strip.width - wa.width).toBeLessThanOrEqual(1);
  expect(strip.height - 300).toBeGreaterThanOrEqual(0);
  expect(strip.height - 300).toBeLessThanOrEqual(1);
  await app.close();
});

test('a command walks the pose graph through the prop fade', async () => {
  const { app } = await launch();
  const page = await petPage(app);
  await page.evaluate(() => { (window as any).__pet.engine.auto = false; });
  await controllerCall(app, c => c.pets.get('testcat').send('pet:command', 'perch'));
  await expect.poll(() => page.evaluate(() => (window as any).__pet.history.join(',')), { timeout: 15_000 }).toMatch(/go_perch,idle_perch/);
  await app.close();
});

const NEVER = { load: 'never loads', play: 'never starts', end: 'never ends' } as const;
const LOGGED = { load: '沒有開始播', play: '沒有開始播', end: '沒有播完' } as const;
for (const how of ['load', 'play', 'end'] as const) {
  test(`a clip that ${NEVER[how]} is given up on after a while and the cat rests on, the clip not taken for broken`, async () => {
    const { app, userDir } = await launch();
    await petPage(app, 'testcat');
    await stallClips(app, ['idle_rest2'], how);
    await controllerCall(app, c => c.showPet('testcat2'));
    const page = await calmPetPage(app, 'testcat2');   // auto off: it rests on, one idle (idle_rest or idle_rest2) after another
    // once it has picked the stalled idle, another one follows all the same
    await expect.poll(() => page.evaluate(() => (window as any).__pet.history.join(',')), { timeout: 25_000 }).toMatch(/idle_rest2,idle_rest/);
    const log = readLog(userDir);
    expect(log).toContain(`[testcat2] 片段 idle_rest2 ${LOGGED[how]}`);
    expect(log).not.toContain('播放失敗');
    expect(await page.evaluate(() => (window as any).__pet.engine.broken.has('idle_rest2'))).toBe(false);
    await app.close();
  });
}

test('an error in a cat window is written to the log', async () => {
  // the cat froze over its bowl on such an error, and the log said nothing
  const { app, userDir } = await launch();
  const page = await petPage(app);
  await page.evaluate(() => { setTimeout(() => { throw new Error('測試用的錯誤'); }); });
  await expect.poll(() => readLog(userDir)).toContain('[ERROR] [testcat] 出錯：測試用的錯誤');
  await app.close();
});

test('a paused cat stays still: its clip is not given up on as stalled, and it plays on once resumed', async () => {
  const { app, userDir } = await launch();
  const page = await calmPetPage(app);
  const clips = () => page.evaluate(() => (window as any).__pet.history.length);
  await controllerCall(app, c => c.pets.get('testcat').send('pet:pause', true));
  await expect.poll(() => page.evaluate(() => (window as any).__pet.player.paused)).toBe(true);
  const n = await clips();
  await page.waitForTimeout(7_000);   // longer than a 1 s idle may take before it counts as stalled (twice its length plus 3 s)
  expect(await clips()).toBe(n);
  await controllerCall(app, c => c.pets.get('testcat').send('pet:pause', false));
  await expect.poll(clips, { timeout: 10_000 }).toBeGreaterThan(n);
  expect(readLog(userDir)).not.toContain('不等了');
  await app.close();
});

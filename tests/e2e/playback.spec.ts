import { test, expect } from '@playwright/test';
import { controllerCall, launch, petPage } from './helpers';

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

import { test, expect } from '@playwright/test';
import { catPoint, controllerCall, launch, petPage } from './helpers';

test('clicking the cat shows a line and a heart', async () => {
  const { app } = await launch();
  const page = await petPage(app);
  // stay awake in the start pose: on the perch (asleep) a click says "zzz" and shows no heart
  await page.evaluate(() => { (window as any).__pet.engine.auto = false; });
  await expect.poll(() => page.evaluate(() => (window as any).__pet.engine.endPose)).toBe('rest');
  await expect.poll(() => page.evaluate(() => (window as any).__pet.player.video?.readyState ?? 0)).toBeGreaterThanOrEqual(2);
  await expect(page.locator('.bubble')).toHaveText('嗨。');   // wait for the greeting so it cannot replace the click line
  // the test clips draw an opaque box at x 60-160 / y 90-162 of 320x180
  const { x, y } = await catPoint(page, 110 / 320, 126 / 180);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.locator('.bubble')).toHaveText('……');
  await expect(page.locator('.heart')).toHaveCount(1);
  await app.close();
});

test('clicking a transparent spot does nothing', async () => {
  const { app } = await launch();
  const page = await petPage(app);
  await page.mouse.click(10, 10);
  await page.waitForTimeout(500);
  await expect(page.locator('.heart')).toHaveCount(0);
  expect(await page.locator('.bubble').allTextContents()).not.toContain('……');   // the greeting may still be showing
  await app.close();
});

test('dragging keeps the window size and the drop lands back on the taskbar', async () => {
  const { app } = await launch();
  const page = await petPage(app);
  const bounds = () => controllerCall(app, c => c.pets.get('testcat').win.getBounds());
  const frame = () => controllerCall(app, c => c.pets.get('testcat').frame);
  const start = await bounds();
  const frame0 = await frame();
  // many small lifts, like a real drag (at fractional display scaling setPosition grows the window each call)
  await page.evaluate(async y => {
    for (let i = 1; i <= 40; i++) { window.petApi.moveWindow(y - i * 4); await new Promise(r => setTimeout(r, 5)); }
  }, start.y);
  await expect.poll(async () => (await bounds()).y).toBe(start.y - 160);
  const moved = await bounds();
  expect(Math.abs(moved.width - start.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(moved.height - start.height)).toBeLessThanOrEqual(1);
  // dropped 120 px to the left of where it was picked up
  await page.evaluate(x => window.petApi.dragEnded(x), frame0.x - start.x - 120);
  await expect.poll(async () => (await bounds()).y).toBe(start.y);
  expect((await frame()).x).toBe(frame0.x - 120);
  await app.close();
});

test('a cat dropped at the right edge rests there, the empty part of its window past the edge', async () => {
  const { app } = await launch();
  const page = await petPage(app);
  const wa = await controllerCall(app, c => c.workArea());
  await page.evaluate(x => window.petApi.dragEnded(x), wa.width - 50);
  // everything the test cat draws is in the left half of its frame, so the right half may hang off the screen
  await expect.poll(async () => (await controllerCall(app, c => c.pets.get('testcat').frame)).x)
    .toBe(Math.floor(wa.x + wa.width - 0.5 * 533));
  await app.close();
});

test('a cat can be picked up in any pose, and near its edge', async () => {
  const { app } = await launch();
  const page = await petPage(app);
  await page.evaluate(() => { (window as any).__pet.engine.auto = false; });
  await controllerCall(app, c => c.pets.get('testcat').send('pet:command', 'sit'));   // sit used to refuse: 「不想動」
  await page.waitForFunction(() => { const s = (window as any).__pet.engine.currentStep; return s.from === 'sit' && s.to === 'sit'; });
  // the test clips draw an opaque box at x 60-160 / y 90-162 of 320x180: grab just outside its left edge
  const { x, y } = await catPoint(page, 57 / 320, 126 / 180);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 15, y - 10);
  await expect(page.locator('.bubble')).toHaveText('隨便你');
  await page.mouse.up();
  await app.close();
});

import { test, expect } from '@playwright/test';
import { controllerCall, launch, petPage } from './helpers';

test('clicking the cat shows a line and a heart', async () => {
  const { app } = await launch();
  const page = await petPage(app);
  // stay awake in the start pose: on the perch (asleep) a click says "zzz" and shows no heart
  await page.evaluate(() => { (window as any).__pet.engine.auto = false; });
  await expect.poll(() => page.evaluate(() => (window as any).__pet.engine.endPose)).toBe('rest');
  await expect.poll(() => page.evaluate(() => (window as any).__pet.player.video?.readyState ?? 0)).toBeGreaterThanOrEqual(2);
  await expect(page.locator('.bubble')).toHaveText('嗨。');   // wait for the greeting so it cannot replace the click line
  const box = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  // the test clips draw an opaque box at x 60-160 / y 90-162 of 320x180
  const x = box.w * (110 / 320);
  const y = box.h * (126 / 180);
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
  const start = await bounds();
  // many small moves, like a real drag (at fractional display scaling setPosition grows the window each call)
  await page.evaluate(async ([x, y]) => {
    for (let i = 1; i <= 40; i++) { window.petApi.moveWindow(x - i * 3, y - i * 4); await new Promise(r => setTimeout(r, 5)); }
  }, [start.x, start.y]);
  await expect.poll(async () => (await bounds()).y).toBe(start.y - 160);
  const moved = await bounds();
  expect(Math.abs(moved.width - start.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(moved.height - start.height)).toBeLessThanOrEqual(1);
  await page.evaluate(() => window.petApi.dragEnded());
  await expect.poll(async () => (await bounds()).y).toBe(start.y);
  expect((await bounds()).x).toBe(start.x - 120);
  await app.close();
});

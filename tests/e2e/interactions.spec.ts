import { test, expect } from '@playwright/test';
import { calmPetPage, catPoint, controllerCall, launch, packsWith, petPage } from './helpers';

test('clicking the cat shows a line and a heart', async () => {
  const { app } = await launch();
  // stay awake in the start pose: on the perch (asleep) a click says "zzz" and shows no heart
  const page = await calmPetPage(app);
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

test('double-clicking the resting cat pounces towards the side that was clicked', async () => {
  const { app } = await launch();
  const page = await calmPetPage(app);
  await expect.poll(() => page.evaluate(() => (window as any).__pet.player.video?.readyState ?? 0)).toBeGreaterThanOrEqual(2);
  const history = () => page.evaluate(() => (window as any).__pet.history.join(','));
  const resting = () => page.evaluate(() => (window as any).__pet.player.step?.clip);
  // the rest pose's body centre is at 34% of the frame; the test box spans 18.75%-50%
  const right = await catPoint(page, 0.45, 0.7);
  await page.mouse.move(right.x, right.y);
  await page.mouse.dblclick(right.x, right.y);
  await expect.poll(history).toMatch(/pounce_right/);
  await page.mouse.dblclick(right.x, right.y);                       // while pouncing: just a click, no second pounce
  await expect.poll(resting, { timeout: 10_000 }).toMatch(/^idle_rest/);
  expect((await history()).match(/pounce/g)).toHaveLength(1);
  const left = await catPoint(page, 0.22, 0.7);
  await page.mouse.move(left.x, left.y);
  await page.mouse.dblclick(left.x, left.y);
  await expect.poll(history).toMatch(/pounce_right.*pounce_left/);
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

test('a cat put by the right edge rests right by it, and by itself does not go where it has no room there', async () => {
  // owner: both cats rested well away from the right edge - room was kept there for poses like 小昭's box
  const { app } = await launch({ DESKTOP_PET_PACKS: packsWith(p => { p.poses.perch.right = 0.95; }) });
  const page = await petPage(app);
  const wa = await controllerCall(app, c => c.workArea());
  const frameX = async () => (await controllerCall(app, c => c.pets.get('testcat').frame)).x;
  const allowed = () => page.evaluate(() => [...((window as any).__pet.engine.allowed ?? [])]);
  const drop = (x: number) => page.evaluate(v => window.petApi.dragEnded(v), x);
  await drop(wa.width - 50);
  await expect.poll(frameX).toBe(Math.floor(wa.x + wa.width - 0.5 * 533));   // as far as resting needs, not as the perch does
  await expect.poll(allowed).not.toContain('perch');
  await drop(wa.width / 2);                                                  // in the middle it may go there again
  await expect.poll(allowed).toContain('perch');
  await drop(wa.width - 50);
  await expect.poll(allowed).not.toContain('perch');
  await controllerCall(app, c => c.command('testcat', 'perch'));            // told to, by the edge, it moves over first
  expect(await frameX()).toBeLessThanOrEqual(Math.floor(wa.x + wa.width - 0.95 * 533));
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

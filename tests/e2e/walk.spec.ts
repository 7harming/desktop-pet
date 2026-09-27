import { test, expect } from '@playwright/test';
import { controllerCall, launch, petPage } from './helpers';

test('a cat walks in from the left edge, loop after loop, and lies down at its spot', async () => {
  const { app } = await launch();
  const page = await petPage(app, 'testcat', false);
  // record where the walker draws each frame while it walks in
  await page.evaluate(() => {
    const w = (window as any).__pet.walker;
    const draw = w.draw.bind(w);
    (window as any).__drawn = [];
    w.draw = (origin: number, r: any) => { (window as any).__drawn.push(origin); draw(origin, r); };
  });
  await expect.poll(() => page.evaluate(() => (window as any).__pet.mode), { timeout: 20_000 }).toBe('live');
  const drawn: number[] = await page.evaluate(() => (window as any).__drawn);
  const { frameX, frameW } = await controllerCall(app, c => {
    const p = c.pets.get('testcat');
    return { frameX: p.frame.x - p.stripBounds.x, frameW: p.frame.width };
  });
  expect(drawn.length).toBeGreaterThan(3);
  // it starts with the cat off the left edge, glides steadily right, and the last frame drawn is where arrive takes over
  expect(drawn[0] + (0.34375 + 0.3125 / 2) * frameW).toBeLessThanOrEqual(frameW * 0.05);
  for (let i = 1; i < drawn.length; i++) expect(drawn[i]).toBeGreaterThanOrEqual(drawn[i - 1]);
  expect(drawn[drawn.length - 1]).toBeCloseTo(frameX, 0);
  expect(await page.evaluate(() => (window as any).__pet.history[0])).toBe('walk_arrive');
  await app.close();
});

test('hiding a cat walks it off the left edge before its window closes', async () => {
  const { app } = await launch();
  const page = await petPage(app);
  await page.evaluate(() => { (window as any).__pet.engine.auto = false; });
  await controllerCall(app, c => c.hidePet('testcat'));
  expect(await controllerCall(app, c => [c.pets.has('testcat'), c.onScreen('testcat')])).toEqual([true, false]);
  await expect.poll(() => page.evaluate(() => (window as any).__pet.history.at(-1)), { timeout: 10_000 }).toBe('walk_depart');
  await expect.poll(() => controllerCall(app, c => c.pets.has('testcat')), { timeout: 15_000 }).toBe(false);
  expect(await controllerCall(app, c => c.settings.pets.testcat.visible)).toBe(false);
  await app.close();
});

test('a cat away from its start pose goes back to it before walking off', async () => {
  const { app } = await launch();
  const page = await petPage(app);
  await page.evaluate(() => { (window as any).__pet.engine.auto = false; });
  await controllerCall(app, c => c.pets.get('testcat').send('pet:command', 'sit'));
  await page.waitForFunction(() => { const s = (window as any).__pet.engine.currentStep; return s.from === 'sit' && s.to === 'sit'; });
  await controllerCall(app, c => c.hidePet('testcat'));
  await expect.poll(() => page.evaluate(() => (window as any).__pet.history.join(',')), { timeout: 10_000 }).toMatch(/idle_sit,sit_to_rest,walk_depart$/);
  await app.close();
});

test('quitting from the tray lets the cats walk off first', async () => {
  const { app } = await launch();
  await petPage(app);
  const closed = new Promise(r => app.process().once('exit', r));
  const t0 = Date.now();
  await controllerCall(app, c => { void c.quit(); });
  await closed;
  expect(Date.now() - t0).toBeGreaterThan(500);   // not at once: the walk off takes a moment
});

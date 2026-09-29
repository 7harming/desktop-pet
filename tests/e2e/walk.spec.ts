import { test, expect } from '@playwright/test';
import { controllerCall, launch, petPage } from './helpers';

test('a cat walks in from the left edge, loop after loop, and lies down at its spot', async () => {
  const { app } = await launch();
  const page = await petPage(app, 'testcat', false);
  await expect.poll(() => page.evaluate(() => (window as any).__pet.mode), { timeout: 20_000 }).toBe('live');
  const drawn: number[] = await page.evaluate(() => (window as any).__pet.drawn);   // where the walker drew each frame
  const { frameX, frameW } = await controllerCall(app, c => {
    const p = c.pets.get('testcat');
    return { frameX: p.frame.x - p.stripBounds.x, frameW: p.frame.width };
  });
  expect(drawn.length).toBeGreaterThan(3);
  // it starts with the cat (about) off the left edge - the test box glides 1600 px/s, so a frame of start-up latency shows -
  // glides steadily right without ever stepping back (loop, then arrive), and the last frame drawn is the resting spot
  expect(drawn[0] + (0.34375 + 0.3125 / 2) * frameW).toBeLessThanOrEqual(frameW * 0.2);
  for (let i = 1; i < drawn.length; i++) expect(drawn[i]).toBeGreaterThanOrEqual(drawn[i - 1]);
  expect(drawn[drawn.length - 1]).toBeCloseTo(frameX, 0);
  expect(await page.evaluate(() => (window as any).__pet.history[0])).toMatch(/^idle_rest/);   // arrive is drawn by the walker
  await app.close();
});

test('resizing a cat while it walks keeps its proportions', async () => {
  const { app } = await launch();
  const page = await petPage(app, 'testcat', false);
  await expect.poll(() => page.evaluate(() => (window as any).__pet.drawn.length), { timeout: 20_000 }).toBeGreaterThan(0);
  await controllerCall(app, c => c.setScale('testcat', 0.5));   // at once: walking in takes about 2 s
  // frames drawn after the window shrank: as high as the window now, as wide as the frame's aspect makes that
  await expect.poll(() => page.evaluate(() => {
    const [w, h] = (window as any).__pet.sizes.at(-1);
    return Math.abs(h - window.innerHeight) < 1 ? Math.round((w / h) * 100) / 100 : null;
  }), { timeout: 10_000 }).toBe(1.78);
  // and the canvas has the pixels of its new size (else the browser stretches the old ones: the full width, the new height)
  const canvas = await page.evaluate(() => {
    const c = document.querySelector('canvas.walk') as HTMLCanvasElement;
    const dpr = window.devicePixelRatio || 1;
    return [c.width - Math.round(c.clientWidth * dpr), c.height - Math.round(c.clientHeight * dpr)];
  });
  expect(canvas).toEqual([0, 0]);
  await app.close();
});

test('hiding a cat walks it off the left edge before its window closes', async () => {
  const { app } = await launch();
  const page = await petPage(app);
  await page.evaluate(() => { (window as any).__pet.engine.auto = false; });
  await controllerCall(app, c => c.hidePet('testcat'));
  expect(await controllerCall(app, c => [c.pets.has('testcat'), c.onScreen('testcat')])).toEqual([true, false]);
  await expect.poll(() => page.evaluate(() => (window as any).__pet.mode), { timeout: 10_000 }).toBe('gone');
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
  await expect.poll(() => page.evaluate(() => (window as any).__pet.history.join(',')), { timeout: 10_000 }).toMatch(/idle_sit,sit_to_rest$/);
  await expect.poll(() => page.evaluate(() => (window as any).__pet.mode), { timeout: 10_000 }).toBe('gone');
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

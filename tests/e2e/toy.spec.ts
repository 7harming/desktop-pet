import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { calmPetPage, controllerCall, launch, readLog } from './helpers';

const endPose = (page: Page) => page.evaluate(() => (window as any).__pet.engine.endPose);
const history = (page: Page) => page.evaluate(() => (window as any).__pet.history.join(','));
/** The feather at (dx, dy) from testcat's head (screen px), moving at `speed` px/s, as the wand's window would say. */
const feather = (app: ElectronApplication, dx: number, dy: number, speed: number) => app.evaluate((_e, [dx, dy, speed]) => {
  const c = (globalThis as any).__controller;
  const h = c.cards.heads.get('testcat');
  c.toys.feather({ x: h.x + dx, y: h.y + dy }, speed);
}, [dx, dy, speed]);

async function toyPage(app: ElectronApplication): Promise<Page> {
  let found: Page | undefined;
  await expect.poll(() => { found = app.windows().find(w => w.url().endsWith('/ui/toy.html')); return !!found; }, { timeout: 20_000 }).toBe(true);
  return found!;
}

test('a feather moving by a cat makes it sit up and swat at it, and it tires once the feather stops', async () => {
  const { app, userDir } = await launch({ DESKTOP_PET_TOY_BORED_SECONDS: '1' });
  const page = await calmPetPage(app);
  await expect.poll(() => controllerCall(app, c => !!c.cards.heads.get('testcat')?.settled)).toBe(true);
  await controllerCall(app, c => c.toggleToy('testcat'));
  await toyPage(app);
  await feather(app, 120, -120, 400);                                   // near, moving: it notices
  await expect.poll(() => endPose(page), { timeout: 20_000 }).toBe('sit');
  // just above its head, moving: once it sits, it swats up
  await expect.poll(async () => { await feather(app, 10, -100, 400); return history(page); }, { timeout: 20_000 }).toMatch(/swat_up(,|$)/);
  // and to its left
  await expect.poll(async () => { await feather(app, -110, 0, 400); return history(page); }, { timeout: 20_000 }).toMatch(/swat_left/);
  // the feather stops: a second later it tires and lies down again
  await expect.poll(async () => { await feather(app, -110, 0, 0); return endPose(page); }, { timeout: 20_000 }).toBe('rest');
  expect(readLog(userDir)).toContain('拿出逗貓棒');
  await app.close();
});

test('the wand is dragged by its stick, the feather swings, and putting it away sends a watching cat back', async () => {
  const { app } = await launch();
  const page = await calmPetPage(app);
  await expect.poll(() => controllerCall(app, c => !!c.cards.heads.get('testcat')?.settled)).toBe(true);
  await controllerCall(app, c => c.toggleToy('testcat'));
  const toy = await toyPage(app);
  await app.evaluate(() => {   // note the fastest the feather is said to go
    const c = (globalThis as any).__controller;
    const feather = c.toys.feather.bind(c.toys);
    c.fastest = 0;
    c.toys.feather = (p: unknown, speed: number, now?: number) => { c.fastest = Math.max(c.fastest, speed); feather(p, speed, now); };
  });
  const before = await controllerCall(app, c => c.toys.window.placed);
  await toy.mouse.move(161, 58);                  // on the stick, half-way between the handle and its tip
  await toy.mouse.down();
  for (let i = 1; i <= 10; i++) await toy.mouse.move(161 - i * 12, 58 + i * 4);
  await toy.mouse.up();
  await expect.poll(() => controllerCall(app, c => c.toys.window.placed.x)).toBeLessThan(before.x - 60);
  await expect.poll(() => controllerCall(app, c => c.fastest), { timeout: 5_000 }).toBeGreaterThan(120);
  // a cat watching it goes back to its ways when it is put away
  await feather(app, 120, -120, 400);
  await expect.poll(() => endPose(page), { timeout: 20_000 }).toBe('sit');
  await controllerCall(app, c => c.toggleToy(null));
  await expect.poll(() => app.windows().some(w => w.url().endsWith('/ui/toy.html'))).toBe(false);
  await expect.poll(() => endPose(page), { timeout: 20_000 }).toBe('rest');
  await app.close();
});

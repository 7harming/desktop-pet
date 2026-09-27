import { test, expect } from '@playwright/test';
import { controllerCall, launch, petPage } from './helpers';

test('the first cat appears and plays an idle of its start pose', async () => {
  const { app } = await launch();
  const page = await petPage(app, 'testcat');
  await expect.poll(() => page.evaluate(() => (window as any).__pet.history[0])).toMatch(/^idle_rest/);
  expect(await controllerCall(app, c => [...c.pets.keys()])).toEqual(['testcat']);
  // 533x300 at scale 1; display scaling may round up by one pixel
  const b = await controllerCall(app, c => c.pets.get('testcat').win.getBounds());
  expect(b.width - 533).toBeGreaterThanOrEqual(0);
  expect(b.width - 533).toBeLessThanOrEqual(1);
  expect(b.height - 300).toBeGreaterThanOrEqual(0);
  expect(b.height - 300).toBeLessThanOrEqual(1);
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

import { test, expect } from '@playwright/test';
import { controllerCall, launch, panelPage, petPage } from './helpers';

test('the panel lists both cats and can show the second one next to the first', async () => {
  const { app } = await launch();
  await petPage(app, 'testcat');
  await controllerCall(app, c => c.openPanel());
  const panel = await panelPage(app);
  await expect(panel.locator('[data-pet] .name')).toHaveText(['測試貓', '測試貓二號']);
  await panel.locator('[data-pet="testcat2"] input.visible').check();
  await petPage(app, 'testcat2');
  const centers = await controllerCall(app, c => [...c.pets.values()].map((p: any) => {
    const b = p.frame;
    return b.x + p.pack.poses[p.pack.start].centerX * b.width;
  }));
  const bodyWidth = await controllerCall(app, c => c.pets.get('testcat').frame.width * 0.35);
  expect(Math.abs(centers[0] - centers[1])).toBeGreaterThanOrEqual(bodyWidth);
  await panel.locator('[data-pet="testcat2"] input.visible').uncheck();
  // it may first have to go back to its start pose, then it walks off
  await expect.poll(() => controllerCall(app, c => [...c.pets.keys()]), { timeout: 15_000 }).toEqual(['testcat']);
  await app.close();
});

test('a panel command reaches the cat', async () => {
  const { app } = await launch();
  const page = await petPage(app);
  await page.evaluate(() => { (window as any).__pet.engine.auto = false; });
  await controllerCall(app, c => c.openPanel());
  const panel = await panelPage(app);
  await panel.locator('[data-pet="testcat"] button[data-pose="sit"]').click();
  await expect.poll(() => page.evaluate(() => (window as any).__pet.history.join(',')), { timeout: 15_000 }).toMatch(/rest_to_sit,idle_sit/);
  await app.close();
});

test('ticking actions limits what the cat does on its own', async () => {
  const { app } = await launch();
  const page = await petPage(app);
  await controllerCall(app, c => c.openPanel());
  const panel = await panelPage(app);
  const card = panel.locator('[data-pet="testcat"]');
  await card.locator('input.action[data-pose="rest"]').uncheck();
  await card.locator('input.action[data-pose="perch"]').uncheck();
  await expect.poll(() => controllerCall(app, c => c.settings.pets.testcat.actions)).toEqual(['sit']);
  await expect(card.locator('input.action[data-pose="sit"]')).toBeDisabled();   // the last tick cannot be removed
  // resting is no longer ticked, so after the current clip the cat goes to sit by itself
  await expect.poll(() => page.evaluate(() => (window as any).__pet.history.join(',')), { timeout: 15_000 }).toMatch(/rest_to_sit,idle_sit/);
  await app.close();
});

import { test, expect } from '@playwright/test';
import { calmPetPage, controllerCall, launch, petPage } from './helpers';

test('a reminder bubble asks, and snoozing pushes the timer 10 minutes', async () => {
  const { app } = await launch();
  const page = await petPage(app);
  await controllerCall(app, c => c.setReminders({ notify: false }));
  await controllerCall(app, c => c.testReminder());
  const bubble = page.locator('.bubble.reminder');
  await expect(bubble).toContainText('喝水。');
  const before = Date.now();
  await bubble.locator('button', { hasText: '10 分鐘後' }).click();
  await expect(bubble).toHaveCount(0);
  await expect.poll(() => controllerCall(app, c => c.scheduler.nextAt('water'))).toBeGreaterThanOrEqual(before + 10 * 60_000 - 5_000);
  await app.close();
});

test('the water reminder sends the cat to its reminder pose and back', async () => {
  const { app } = await launch();
  const page = await calmPetPage(app);          // auto off: only the visit itself brings it back
  await controllerCall(app, c => c.setReminders({ notify: false }));
  const n = await page.evaluate(() => (window as any).__pet.history.length);
  await controllerCall(app, c => c.testReminder());
  await expect(page.locator('.bubble.reminder')).toContainText('喝水。');
  await expect.poll(() => page.evaluate(k => (window as any).__pet.history.slice(k).join(','), n), { timeout: 30_000 })
    .toMatch(/^rest_to_sit,idle_sit,(idle_sit,)*sit_to_rest,idle_rest/);
  await app.close();
});

test('pausing from the tray holds reminders for an hour', async () => {
  const { app } = await launch();
  await petPage(app);
  await controllerCall(app, c => c.pauseReminders());
  const paused = await controllerCall(app, c => [c.scheduler.isPaused(Date.now()), c.settings.reminders.pausedUntil]);
  expect(paused[0]).toBe(true);
  expect(paused[1]).toBeGreaterThan(Date.now() + 59 * 60_000);
  await controllerCall(app, c => c.resumeReminders());
  expect(await controllerCall(app, c => c.scheduler.isPaused(Date.now()))).toBe(false);
  await app.close();
});

test('a reminder bubble stays inside the window when the head is near the top', async () => {
  const { app } = await launch();
  const page = await petPage(app);
  // a sitting cat at the smallest size puts the anchor about 40 px from the top; the reminder bubble is taller
  const top = await page.evaluate(() => {
    const Bubbles = (window as any).__pet.bubbles.constructor;
    const b = new Bubbles(document.getElementById('stage'), () => ({ x: 200, y: 40 }));
    b.ask('喝水。', [{ label: '喝好了', onClick: () => {} }, { label: '10 分鐘後', onClick: () => {} }], 5_000, () => {});
    return document.querySelectorAll('.bubble.reminder')[0].getBoundingClientRect().top;
  });
  expect(top).toBeGreaterThanOrEqual(0);
  await app.close();
});

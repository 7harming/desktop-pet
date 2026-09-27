import { test, expect } from '@playwright/test';
import { breakOpen, breakPage, controllerCall, launch, petPage } from './helpers';

test('a break walks the cats off, shows the big cat with a countdown, then walks them back in', async () => {
  const { app } = await launch({ DESKTOP_PET_BREAK_SECONDS: '2' });
  await petPage(app);
  await controllerCall(app, c => c.setReminders({ eyes: 30 }));
  await controllerCall(app, c => { void c.startBreak(); });
  await expect.poll(() => controllerCall(app, c => c.pets.has('testcat')), { timeout: 15_000 }).toBe(false);   // walked off first
  const brk = await breakPage(app);
  await expect(brk.locator('#countdown')).toHaveText(/^0:0[0-2]$/);
  await expect.poll(() => breakOpen(app), { timeout: 30_000 }).toBe(false);
  await expect.poll(() => controllerCall(app, c => c.onScreen('testcat')), { timeout: 15_000 }).toBe(true);    // and back again
  const next = await controllerCall(app, c => c.scheduler.nextAt('eyes'));
  expect(next).toBeGreaterThan(Date.now() + 29 * 60_000);                                                        // the timer restarted
  await app.close();
});

test('a break can be skipped', async () => {
  const { app } = await launch({ DESKTOP_PET_BREAK_SECONDS: '60' });
  await petPage(app);
  await controllerCall(app, c => { void c.startBreak(); });
  const brk = await breakPage(app);
  await brk.locator('#skip').click();
  await expect.poll(() => breakOpen(app), { timeout: 30_000 }).toBe(false);
  await expect.poll(() => controllerCall(app, c => c.onScreen('testcat')), { timeout: 15_000 }).toBe(true);
  await app.close();
});

test('the eyes reminder starts a break instead of a bubble', async () => {
  const { app } = await launch({ DESKTOP_PET_BREAK_SECONDS: '2' });
  const page = await petPage(app);
  await controllerCall(app, c => c.setReminders({ eyes: 30, notify: false }));
  await controllerCall(app, c => c.deliver('eyes'));
  await expect(page.locator('.bubble.reminder')).toHaveCount(0);
  await breakPage(app);
  await app.close();
});

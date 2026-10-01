import { test, expect } from '@playwright/test';
import { calmPetPage, controllerCall, launch, readLog } from './helpers';

const endPose = (page: import('@playwright/test').Page) => page.evaluate(() => (window as any).__pet.engine.endPose);

test('a cat goes to sleep while the user is away, the reminders wait, and it wakes and says so when they are back', async () => {
  const { app, userDir } = await launch();
  const page = await calmPetPage(app);
  await controllerCall(app, c => { c.setReminders({ notify: false }); c.idleSeconds = () => 3600; });
  await expect.poll(() => endPose(page), { timeout: 20_000 }).toBe('perch');   // the test cat's asleep pose
  // a reminder that falls due while nobody is there waits
  await controllerCall(app, c => { c.scheduler.snooze('water', Date.now(), 0); c.tick(); });
  await page.waitForTimeout(500);
  expect(await page.locator('.bubble.reminder').count()).toBe(0);
  await controllerCall(app, c => { c.idleSeconds = () => 0; });
  await expect(page.locator('.bubble')).toHaveText('回來了。', { timeout: 10_000 });
  await expect.poll(() => endPose(page), { timeout: 20_000 }).toBe('sit');   // it sits up to look at the user
  await expect.poll(() => readLog(userDir), { timeout: 10_000 }).toContain('[testcat] 醒了');   // once it rests sitting
  // the reminders count again from now
  expect(await controllerCall(app, c => c.scheduler.nextAt('water'))).toBeGreaterThan(Date.now() + 10 * 60_000);
  const log = readLog(userDir);
  expect(log).toContain('離開電腦：貓咪去睡覺');
  expect(log).toContain('回到電腦');
  expect(log).not.toContain('提醒：water');
  await app.close();
});

test('with the away time switched off a cat stays up however long the computer sits idle', async () => {
  const { app } = await launch();
  const page = await calmPetPage(app);
  const state = await controllerCall(app, c => c.act({ kind: 'awayMinutes', minutes: 0 }));
  expect(state.awayMinutes).toBe(0);
  await controllerCall(app, c => { c.idleSeconds = () => 3600; });
  await page.waitForTimeout(5_000);
  expect(await endPose(page)).toBe('rest');
  await app.close();
});

test('a line for the time of day, and sleepier, slower cats late at night', async () => {
  const { app } = await launch();
  const page = await calmPetPage(app);
  await controllerCall(app, c => c.pets.get('testcat').send('pet:say', 'lunch'));
  await expect(page.locator('.bubble')).toHaveText('吃飯。');
  await controllerCall(app, c => c.pets.get('testcat').send('pet:day-part', 'night'));
  await expect.poll(() => page.evaluate(() => { const e = (window as any).__pet.engine; return [e.sleepiness, e.dwellMs]; }))
    .toEqual([3, 60_000]);   // the 30 s rest doubled
  await app.close();
});

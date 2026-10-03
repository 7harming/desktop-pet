import { test, expect } from '@playwright/test';
import { calmPetPage, controllerCall, failClips, launch, packsWith, petPage, readLog, stallClips } from './helpers';

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

test('the reminder settings keep only what the panel offers', async () => {
  // the panel's whole action went into settings.json, its `kind` too, and any number of minutes was taken
  const { app } = await launch();
  await petPage(app);
  const r = await controllerCall(app, c => { c.act({ kind: 'reminders', water: 0.01, stretch: 30, notify: false }); return c.settings.reminders; });
  expect(r).toEqual({ water: 45, stretch: 30, eyes: 0, notify: false, pausedUntil: null });
  await app.close();
});

test('with two cats out, both remind, and the first answer settles it for both', async () => {
  const { app } = await launch();
  await petPage(app, 'testcat');
  await controllerCall(app, c => { c.setReminders({ notify: false }); c.showPet('testcat2'); });
  const pages = [await petPage(app, 'testcat'), await petPage(app, 'testcat2')];
  await controllerCall(app, c => c.testReminder());
  for (const p of pages) await expect(p.locator('.bubble.reminder')).toContainText('喝水。');
  const before = Date.now();
  await pages[1].locator('.bubble.reminder button', { hasText: '10 分鐘後' }).click();
  await expect(pages[0].locator('.bubble.reminder')).toHaveCount(0);            // the other cat's bubble went with it
  await expect.poll(() => controllerCall(app, c => c.scheduler.nextAt('water'))).toBeGreaterThanOrEqual(before + 10 * 60_000 - 5_000);
  await app.close();
});

test("the other cat's answer to one reminder leaves a different one asking", async () => {
  const { app } = await launch();
  const page = await petPage(app);
  const bubble = page.locator('.bubble.reminder');
  await controllerCall(app, c => c.pets.get('testcat').send('pet:reminder', 'stretch'));
  await expect(bubble).toContainText('動一動。');
  await controllerCall(app, c => c.pets.get('testcat').send('pet:reminder-close', 'water'));   // the other cat answered water
  await page.waitForTimeout(500);
  await expect(bubble).toContainText('動一動。');
  await controllerCall(app, c => c.pets.get('testcat').send('pet:reminder-close', 'stretch'));
  await expect(bubble).toHaveCount(0);
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

test('a reminder pose whose one way back fails is left all the same: the cat dissolves back into its start pose', async () => {
  // 小昭 held her stretch for good once stretch_exit had failed
  const { app, userDir } = await launch();
  await petPage(app, 'testcat');
  await failClips(app, ['sit_to_rest']);
  await controllerCall(app, c => { c.setReminders({ notify: false }); c.hidePet('testcat'); c.showPet('testcat2'); });
  const page = await calmPetPage(app, 'testcat2');   // auto off: only the visit itself brings it back
  const n = await page.evaluate(() => (window as any).__pet.history.length);
  await controllerCall(app, c => c.testReminder());
  await expect.poll(() => page.evaluate(k => (window as any).__pet.history.slice(k).join(','), n), { timeout: 30_000 })
    .toMatch(/^rest_to_sit,(idle_sit,)*idle_rest2?(,|$)/);
  expect(await page.evaluate(() => (window as any).__pet.engine.currentStep)).toMatchObject({ from: 'rest', to: 'rest' });
  const log = readLog(userDir);
  expect(log).toContain('[testcat2] 片段 sit_to_rest 播放失敗（錯誤碼');
  expect(log).toContain('[testcat2] 姿勢 sit 的出路都壞了，直接淡回 rest');
  await app.close();
});

test('a reminder that comes as the cat gets up from a prop sends it to its reminder pose and back all the same', async () => {
  // 小昭 froze over her bowl when the water reminder came as she got up from it: the way back led into the bowl's prop pose
  const { app, userDir } = await launch();
  await petPage(app, 'testcat');
  await stallClips(app, ['leave_perch'], 'end');      // it takes its time getting off the perch: time enough to remind it then
  await controllerCall(app, c => { c.setReminders({ notify: false }); c.hidePet('testcat'); c.showPet('testcat2'); });
  const page = await calmPetPage(app, 'testcat2');
  await controllerCall(app, c => c.command('testcat2', 'perch'));
  await expect.poll(() => page.evaluate(() => (window as any).__pet.history.at(-1)), { timeout: 20_000 }).toBe('idle_perch');
  await controllerCall(app, c => c.command('testcat2', 'rest'));
  await expect.poll(() => page.evaluate(() => (window as any).__pet.engine.currentStep.clip), { timeout: 20_000 }).toBe('leave_perch');
  const n = await page.evaluate(() => (window as any).__pet.history.length);
  await page.evaluate(() => { (window as any).__pet.engine.rng = () => 0.99; });   // one idle of the reminder pose, then back
  await controllerCall(app, c => c.testReminder());
  await expect.poll(() => page.evaluate(k => (window as any).__pet.history.slice(k).join(','), n), { timeout: 30_000 })
    .toMatch(/^rest_to_sit,idle_sit,sit_to_rest,idle_rest/);
  expect(readLog(userDir)).not.toContain('[ERROR]');
  await app.close();
});

test('by the right edge, a reminder whose pose has no room there only asks: the cat stays where it is', async () => {
  // it was moved over to make room for drinking every time, and stayed there
  const { app } = await launch({ DESKTOP_PET_PACKS: packsWith(p => { p.poses.perch.right = 0.95; p.reminderPoses = { water: 'perch' }; }) });
  const page = await calmPetPage(app);
  await controllerCall(app, c => c.setReminders({ notify: false }));
  const wa = await controllerCall(app, c => c.workArea());
  const frameX = async () => (await controllerCall(app, c => c.pets.get('testcat').frame)).x;
  await page.evaluate(v => window.petApi.dragEnded(v), wa.width - 50);
  await expect.poll(frameX).toBe(Math.floor(wa.x + wa.width - 0.5 * 533));
  const n = await page.evaluate(() => (window as any).__pet.history.length);
  await controllerCall(app, c => c.testReminder());
  await expect(page.locator('.bubble.reminder')).toContainText('喝水。');
  await page.waitForTimeout(3_000);
  expect(await page.evaluate(k => (window as any).__pet.history.slice(k).join(','), n)).not.toContain('go_perch');
  expect(await frameX()).toBe(Math.floor(wa.x + wa.width - 0.5 * 533));
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

test('a reminder bubble over a small sitting cat floats above its head, inside its window', async () => {
  // owner: from lying to sitting for the reminder, the bubble did not go up with the head - at a small size the cat's window had
  // no room above the head, so the bubble was pushed down over the face
  const { app } = await launch();
  const page = await petPage(app);
  await page.evaluate(() => { (window as any).__pet.engine.auto = false; });
  await controllerCall(app, c => { c.setReminders({ notify: false }); c.setScale('testcat', 0.4); });
  await controllerCall(app, c => c.testReminder());
  await expect.poll(() => page.evaluate(() => (window as any).__pet.engine.currentStep?.clip), { timeout: 20_000 }).toBe('idle_sit');
  await page.waitForTimeout(300);                                   // the bubble follows the head every frame
  const bubble = await page.evaluate(() => {
    const r = document.querySelector('.bubble.reminder')!.getBoundingClientRect();
    return { top: r.top, bottom: window.screenY + r.bottom };
  });
  const head = await controllerCall(app, c => c.cards.heads.get('testcat').y);   // its ear tips, on screen
  expect(bubble.top).toBeGreaterThanOrEqual(0);
  expect(bubble.bottom).toBeLessThanOrEqual(head + 1);
  await app.close();
});

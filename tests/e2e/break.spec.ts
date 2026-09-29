import { test, expect } from '@playwright/test';
import { breakOpen, breakPage, controllerCall, launch, petPage, readLog, stallClips, stallWalking } from './helpers';

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

test('with two cats out, the break brings both, each lying in the middle of its own half, and both come back', async () => {
  const { app } = await launch({ DESKTOP_PET_BREAK_SECONDS: '4' });
  await petPage(app, 'testcat');
  await controllerCall(app, c => c.showPet('testcat2'));
  await petPage(app, 'testcat2');
  await controllerCall(app, c => { void c.startBreak(); });
  const brk = await breakPage(app);
  await expect(brk.locator('.cat')).toHaveCount(2);
  // once both lie there: each cat's resting body is centred in its half of the screen
  await expect.poll(() => brk.evaluate(() => [...document.querySelectorAll<HTMLElement>('.cat')].map(c => c.style.visibility)),
    { timeout: 20_000 }).toEqual(['', '']);
  const centres = await brk.evaluate(() => [...document.querySelectorAll<HTMLElement>('.cat')].map(c => {
    const r = c.getBoundingClientRect();
    return (r.left + 0.34 * r.width) / window.innerWidth;    // the test pack's resting pose is centred at 0.34 of its frame
  }));
  expect(centres[0]).toBeCloseTo(0.25, 1);
  expect(centres[1]).toBeCloseTo(0.75, 1);
  await expect.poll(() => breakOpen(app), { timeout: 40_000 }).toBe(false);
  await expect.poll(() => controllerCall(app, c => [c.onScreen('testcat'), c.onScreen('testcat2')]), { timeout: 20_000 }).toEqual([true, true]);
  await app.close();
});

test('a break whose cat will not walk still shows it lying there, and still ends', async () => {
  const { app, userDir } = await launch({ DESKTOP_PET_BREAK_SECONDS: '2' });
  await petPage(app);
  await stallWalking(app, 'play');
  await controllerCall(app, c => { void c.startBreak(); });
  const brk = await breakPage(app);
  await expect.poll(() => brk.evaluate(() => document.querySelector<HTMLElement>('.cat')!.style.visibility), { timeout: 20_000 }).toBe('');
  await expect.poll(() => breakOpen(app), { timeout: 30_000 }).toBe(false);
  const log = readLog(userDir);
  expect(log).toContain('[休息] testcat 走進來的影片卡住了');
  expect(log).toContain('[休息] testcat 走出去的影片卡住了');
  await app.close();
});

test('a break whose lying clips will not start has the cat try one after another, from its very first, and can be skipped', async () => {
  const { app, userDir } = await launch({ DESKTOP_PET_BREAK_SECONDS: '60' });
  await petPage(app);
  await stallClips(app, ['idle_rest', 'idle_rest2'], 'play');
  await controllerCall(app, c => { void c.startBreak(); });
  const brk = await breakPage(app);
  // its first idle stalls while it is still settling in; each next one stalls too, and is given up on in turn
  const stalls = () => readLog(userDir).split(/\[休息\] testcat：片段 idle_rest2? 沒有開始播/).length - 1;
  await expect.poll(stalls, { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
  await brk.locator('#skip').click();
  await expect.poll(() => breakOpen(app), { timeout: 30_000 }).toBe(false);
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

test('the break draws the big cat from the high-resolution clips', async () => {
  const { app } = await launch({ DESKTOP_PET_BREAK_SECONDS: '30' });
  await petPage(app);
  await controllerCall(app, c => { void c.startBreak(); });
  const brk = await breakPage(app);
  // the walker's loop comes from the copy; the lying cat's own clip does too once it is loaded
  const sources = await brk.evaluate(() => [...document.querySelectorAll('video')].map(v => v.getAttribute('src') ?? ''));
  expect(sources.some(s => s.endsWith('hd/walk_loop.webm'))).toBe(true);
  await expect.poll(() => brk.evaluate(() => (document.querySelector('video[data-clip="idle_rest"]') as HTMLVideoElement).src),
    { timeout: 20_000 }).toContain('hd/idle_rest.webm');
  await app.close();
});

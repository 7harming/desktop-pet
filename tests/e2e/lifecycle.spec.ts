import { test, expect } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { controllerCall, launch, panelPage, petPage } from './helpers';

test('the first run opens the panel once and remembers it', async () => {
  const userDir = mkdtempSync(join(tmpdir(), 'dpet-first-'));
  const first = await launch({}, userDir);
  await panelPage(first.app);
  await controllerCall(first.app, c => c.flush());
  await first.app.close();

  const second = await launch({}, userDir);
  await petPage(second.app);
  await second.app.firstWindow();
  await expect.poll(() => second.app.windows().filter(w => w.url().endsWith('/ui/panel.html')).length).toBe(0);
  await second.app.close();
});

test('a dragged position survives a restart', async () => {
  const userDir = mkdtempSync(join(tmpdir(), 'dpet-pos-'));
  const first = await launch({}, userDir);
  await petPage(first.app);
  await controllerCall(first.app, c => { c.settings.pets.testcat.x = 0.25; c.flush(); });
  await first.app.close();

  const second = await launch({}, userDir);
  await petPage(second.app);
  expect(await controllerCall(second.app, c => c.settings.pets.testcat.x)).toBeCloseTo(0.25, 2);
  await second.app.close();
});

test('opening the app by hand brings a hidden cat back; starting at login does not', async () => {
  const userDir = mkdtempSync(join(tmpdir(), 'dpet-hidden-'));
  writeFileSync(join(userDir, 'settings.json'), JSON.stringify({ firstRunDone: true, pets: { testcat: { visible: false }, testcat2: { visible: false } } }));
  const atLogin = await launch({}, userDir, ['--autostart']);
  await new Promise(r => setTimeout(r, 2500));
  expect(await controllerCall(atLogin.app, c => [...c.pets.keys()])).toEqual([]);
  await atLogin.app.close();

  const byHand = await launch({}, userDir);
  await petPage(byHand.app, 'testcat');
  expect(await controllerCall(byHand.app, c => c.settings.pets.testcat.visible)).toBe(true);
  await byHand.app.close();
});

test('putting the cats back on the taskbar lets a cat that is walking off go on', async () => {
  // it was brought straight back, and saved as out again, though the user had just put it away
  const { app } = await launch();
  await petPage(app, 'testcat');
  await controllerCall(app, c => c.showPet('testcat2'));
  await petPage(app, 'testcat2');
  await controllerCall(app, c => { c.hidePet('testcat'); c.resetAllPositions(); });
  await expect.poll(() => controllerCall(app, c => c.pets.has('testcat')), { timeout: 15_000 }).toBe(false);
  expect(await controllerCall(app, c => [c.settings.pets.testcat.visible, c.onScreen('testcat2')])).toEqual([false, true]);
  await app.close();
});

test('a cat whose window crashes as it walks off is gone, not brought back', async () => {
  const { app } = await launch();
  await petPage(app);
  await controllerCall(app, c => { c.hidePet('testcat'); c.pets.get('testcat').win.webContents.forcefullyCrashRenderer(); });
  await expect.poll(() => controllerCall(app, c => c.pets.has('testcat')), { timeout: 15_000 }).toBe(false);
  await new Promise(r => setTimeout(r, 1_000));
  expect(await controllerCall(app, c => [c.pets.has('testcat'), c.settings.pets.testcat.visible])).toEqual([false, false]);
  await app.close();
});

test('asking for the app again while it runs opens the panel and brings a cat back', async () => {
  const { app } = await launch();
  await petPage(app);
  await controllerCall(app, c => c.hidePet('testcat'));
  await expect.poll(() => controllerCall(app, c => c.pets.has('testcat')), { timeout: 15_000 }).toBe(false);
  await controllerCall(app, c => c.summon());
  await panelPage(app);
  await petPage(app, 'testcat');
  await app.close();
});

import { test, expect, type ElectronApplication } from '@playwright/test';
import { cardPacks, cardPage, cardUserDir, controllerCall, launch, petPage, readLog } from './helpers';

// a Mac left idle for a while showed only white windows, until the app was killed and opened again (2026-10-18): a page whose
// process had died was never loaded again, and nothing was logged

/** Make the page of the window showing `file` die, as when its process is gone (the computer short of memory, ...). */
const crash = (app: ElectronApplication, file: string) => app.evaluate(({ BrowserWindow }, file) => {
  BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith(`/${file}`))!.webContents.forcefullyCrashRenderer();
}, file);
/** Run `js` in the page of the window showing `file` (from main: Playwright's own handle on a page that died is gone). */
const inPage = (app: ElectronApplication, file: string, js: string) => app.evaluate(({ BrowserWindow }, [file, js]) => {
  const w = BrowserWindow.getAllWindows().find(x => x.webContents.getURL().endsWith(`/${file}`));
  return !w || w.webContents.isCrashed() ? null : w.webContents.executeJavaScript(js).catch(() => null);
}, [file, js]);

test('a control panel whose page dies is loaded again, and the log says so', async () => {
  const { app, userDir } = await launch();
  await petPage(app);
  await controllerCall(app, c => c.openPanel());
  const cats = () => inPage(app, 'panel.html', 'document.querySelectorAll("[data-pet]").length');
  await expect.poll(cats, { timeout: 20_000 }).toBeGreaterThan(0);
  await crash(app, 'panel.html');
  await expect.poll(() => readLog(userDir), { timeout: 10_000 }).toContain('控制面板的頁面停了');
  await expect.poll(cats, { timeout: 10_000 }).toBeGreaterThan(0);   // loaded again, its cats listed
  await app.close();
});

test('a card whose page dies is loaded again with what it showed', async () => {
  const { app, userDir } = await launch({ DESKTOP_PET_PACKS: cardPacks() }, cardUserDir());
  await petPage(app);
  await controllerCall(app, c => c.cards.show('todo', null, 'hand'));
  await cardPage(app, 'todo');
  await crash(app, 'card.html');
  await expect.poll(() => readLog(userDir), { timeout: 10_000 }).toContain('卡片的頁面停了');
  await expect.poll(() => inPage(app, 'card.html', 'document.getElementById("title").textContent'), { timeout: 10_000 }).toBe('測試貓的提醒事項');
  await app.close();
});

test('the drawing (GPU) process dying is logged, and the cats go on', async () => {
  const { app, userDir } = await launch();
  const page = await petPage(app);
  await app.evaluate(({ app }) => { const m = app.getAppMetrics().find(x => x.type === 'GPU'); if (m) process.kill(m.pid); });
  await expect.poll(() => readLog(userDir), { timeout: 10_000 }).toContain('GPU 程序停了');
  expect(await page.evaluate(() => (window as any).__pet.mode)).toBe('live');
  await app.close();
});

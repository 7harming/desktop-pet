import { test, expect, type ElectronApplication } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { calmPetPage, cardPacks, cardPage, cardUserDir, controllerCall, launch, readLog } from './helpers';

// the owner's cats (and their cards, the wand) ended up under every other program after the computer slept, until put away and
// brought out again (2026-10-18): Windows had taken their always-on-top away, and nothing gave it back

const win32 = (body: string) => execFileSync('powershell.exe', ['-NoProfile', '-Command',
  `Add-Type -Name W -Namespace U -MemberDefinition '[DllImport("user32.dll")] public static extern int GetWindowLong(System.IntPtr h, int i); `
  + `[DllImport("user32.dll")] public static extern bool SetWindowPos(System.IntPtr h, System.IntPtr a, int x, int y, int cx, int cy, uint f);'; ${body}`]).toString().trim();
/** Whether Windows itself has the window always on top (WS_EX_TOPMOST). */
const topmost = (hwnd: string) => win32(`([U.W]::GetWindowLong([System.IntPtr]${hwnd}, -20) -band 8) -ne 0`) === 'True';
/** Take the window's always-on-top away from outside the app, as Windows did after a sleep (HWND_NOTOPMOST; no move, size or focus). */
const takeTopmost = (hwnd: string) => { win32(`[U.W]::SetWindowPos([System.IntPtr]${hwnd}, [System.IntPtr](-2), 0, 0, 0, 0, 0x13) | Out-Null`); };
const hwndOf = (app: ElectronApplication, which: 'pet' | 'card') => controllerCall(app, which === 'pet'
  ? c => c.pets.get('testcat').win.getNativeWindowHandle().readBigUInt64LE().toString()
  : c => c.cards.open.get('todo').card.win.getNativeWindowHandle().readBigUInt64LE().toString());

test('back from sleep, a cat and its card that lost always-on-top are put back on top, and the log says so', async () => {
  test.skip(process.platform !== 'win32', 'how Windows orders windows');
  const { app, userDir } = await launch({ DESKTOP_PET_PACKS: cardPacks() }, cardUserDir());
  await calmPetPage(app);
  await controllerCall(app, c => c.cards.show('todo', null, 'hand'));
  await cardPage(app, 'todo');
  const [cat, card] = [await hwndOf(app, 'pet'), await hwndOf(app, 'card')];
  takeTopmost(cat);
  takeTopmost(card);
  expect([topmost(cat), topmost(card)]).toEqual([false, false]);
  await app.evaluate(({ powerMonitor }) => { powerMonitor.emit('resume'); });
  await expect.poll(() => [topmost(cat), topmost(card)], { timeout: 5_000 }).toEqual([true, true]);
  expect(readLog(userDir)).toContain('不在最上層');
  await app.close();
});

test('without a sleep to say so, the regular check puts a cat back on top', async () => {
  test.skip(process.platform !== 'win32', 'how Windows orders windows');
  const { app, userDir } = await launch({ DESKTOP_PET_TOPMOST_SECONDS: '1' });
  await calmPetPage(app);
  const cat = await hwndOf(app, 'pet');
  takeTopmost(cat);
  // (checked every second here: by the time PowerShell could look, it may be back already - the log tells who put it back)
  await expect.poll(() => readLog(userDir), { timeout: 5_000 }).toContain('視窗不在最上層了（定時檢查）');
  expect(topmost(cat)).toBe(true);
  await app.close();
});

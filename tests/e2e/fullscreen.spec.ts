import { test, expect } from '@playwright/test';
import { execFileSync, spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { calmPetPage, controllerCall, launch } from './helpers';

/** Whether a window still has the always-on-top flag (WS_EX_TOPMOST), asked from Windows itself. */
function topmost(hwnd: string): boolean {
  const script = `Add-Type -Name W -Namespace U -MemberDefinition '[DllImport("user32.dll")] public static extern int GetWindowLong(System.IntPtr h, int i);'; `
    + `([U.W]::GetWindowLong([System.IntPtr]${hwnd}, -20) -band 8) -ne 0`;
  return execFileSync('powershell.exe', ['-NoProfile', '-Command', script]).toString().trim() === 'True';
}

test('clicking the cat over another program\'s full-screen video keeps it on top', async () => {
  test.skip(process.platform !== 'win32', 'the taskbar ordering is a Windows matter');
  const { app } = await launch();
  await calmPetPage(app);
  const hwnd = await controllerCall(app, c => c.pets.get('testcat').win.getNativeWindowHandle().readBigUInt64LE().toString());
  for (const args of [[], ['--topmost']]) {
    const video = spawn(resolve('node_modules/electron/dist/electron.exe'), [resolve('tests/e2e/fullscreen-app/main.js'), ...args], { stdio: 'ignore' });
    try {
      await new Promise(r => setTimeout(r, 2500));                       // the video is full screen and in front
      await controllerCall(app, c => c.pets.get('testcat').win.moveTop());
      await controllerCall(app, c => c.pets.get('testcat').win.focus());  // what a click on the cat does
      await new Promise(r => setTimeout(r, 800));
      expect(topmost(hwnd)).toBe(true);
    } finally {
      video.kill();
    }
  }
  await app.close();
});

import { BrowserWindow, screen } from 'electron';
import { join } from 'node:path';
import { APP_ORIGIN } from './app-protocol';
import type { BreakInit } from '../shared/ipc';

/** A full-screen window over everything (the taskbar too) for the eye break; it closes itself when the big cat has walked off. */
export class BreakWindow {
  private readonly win: BrowserWindow;

  constructor(init: BreakInit, preloadDir: string, onDone: () => void) {
    const bounds = screen.getPrimaryDisplay().bounds;
    this.win = new BrowserWindow({
      ...bounds,
      transparent: true, frame: false, resizable: false, movable: false, skipTaskbar: true, hasShadow: false,
      alwaysOnTop: true, show: false, backgroundColor: '#00000000',
      webPreferences: { preload: join(preloadDir, 'preload-break.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
    });
    this.win.setBounds(bounds);   // fractional display scaling creates windows a few pixels off
    this.win.setAlwaysOnTop(true, 'screen-saver');
    this.win.webContents.ipc.on('break:ready', () => {
      this.win.webContents.send('break:init', init);
      this.win.show();
      this.win.focus();
    });
    this.win.webContents.ipc.on('break:done', () => onDone());
    this.win.on('closed', () => onDone());
    void this.win.loadURL(`${APP_ORIGIN}/ui/break.html`);
  }

  close(): void { if (!this.win.isDestroyed()) this.win.destroy(); }
}

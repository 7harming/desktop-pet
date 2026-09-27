import { BrowserWindow } from 'electron';
import { join } from 'node:path';
import { APP_ORIGIN } from './app-protocol';
import type { PanelState } from '../shared/ipc';

export class PanelWindow {
  private win: BrowserWindow | null = null;

  constructor(private readonly preloadDir: string) {}

  open(): void {
    if (this.win && !this.win.isDestroyed()) { this.win.show(); this.win.focus(); return; }
    this.win = new BrowserWindow({
      width: 780, height: 560, title: '毛孩桌寵', autoHideMenuBar: true,
      webPreferences: { preload: join(this.preloadDir, 'preload-panel.js'), contextIsolation: true, nodeIntegration: false },
    });
    void this.win.loadURL(`${APP_ORIGIN}/ui/panel.html`);
    this.win.on('closed', () => { this.win = null; });
  }

  push(state: PanelState): void {
    if (this.win && !this.win.isDestroyed()) this.win.webContents.send('panel:state', state);
  }
}

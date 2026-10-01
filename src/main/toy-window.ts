import { BrowserWindow } from 'electron';
import { join } from 'node:path';
import { APP_ORIGIN } from './app-protocol';
import type { Bounds, WorkArea } from './pet-geometry';
import { TOY_BASE, TOY_SCALE } from '../shared/toy';

/** The wand's window: the stick, the string and the feather swinging on it all stay inside. */
export const TOY_SIZE = { width: Math.round(TOY_BASE.width * TOY_SCALE), height: Math.round(TOY_BASE.height * TOY_SCALE) };

export interface ToyEvents { feather(p: { x: number; y: number }, speed: number): void }

/** The cat wand: a transparent window over everything; only the stick, string and feather catch the mouse, and they drag it. */
export class ToyWindow {
  readonly win: BrowserWindow;
  private bounds: Bounds;

  constructor(at: { x: number; y: number }, private readonly workArea: () => WorkArea, events: ToyEvents, preloadDir: string) {
    this.bounds = this.inside(at.x, at.y);
    this.win = new BrowserWindow({
      ...this.bounds, transparent: true, frame: false, resizable: false, alwaysOnTop: true, skipTaskbar: true, hasShadow: false,
      show: false, focusable: false, minimizable: false, maximizable: false, fullscreenable: false, backgroundColor: '#00000000',
      webPreferences: { preload: join(preloadDir, 'preload-toy.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
    });
    this.win.setBounds(this.bounds);   // fractional display scaling creates windows a few pixels off
    this.win.setIgnoreMouseEvents(true, { forward: true });
    this.win.setAlwaysOnTop(true, 'pop-up-menu');
    if (process.platform === 'darwin') this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    const ipc = this.win.webContents.ipc;
    ipc.on('toy:ready', () => { if (!this.win.isDestroyed()) this.win.showInactive(); });
    ipc.on('toy:set-interactive', (_e, on: boolean) => { if (!this.win.isDestroyed()) this.win.setIgnoreMouseEvents(!on, { forward: true }); });
    ipc.on('toy:move', (_e, x: number, y: number) => this.moveTo(Number(x), Number(y)));
    ipc.on('toy:feather', (_e, x: number, y: number, speed: number) => events.feather({ x: Number(x), y: Number(y) }, Number(speed)));
    void this.win.loadURL(`${APP_ORIGIN}/ui/toy.html`);
  }

  get placed(): Bounds { return this.bounds; }

  /** Put its top-left corner here, kept inside the work area; the size every time (fractional display scaling). */
  moveTo(x: number, y: number): void {
    this.bounds = this.inside(x, y);
    if (!this.win.isDestroyed()) this.win.setBounds(this.bounds);
  }

  close(): void { if (!this.win.isDestroyed()) this.win.destroy(); }

  private inside(x: number, y: number): Bounds {
    const wa = this.workArea();
    return {
      x: Math.round(Math.min(Math.max(x, wa.x), wa.x + wa.width - TOY_SIZE.width)),
      y: Math.round(Math.min(Math.max(y, wa.y), wa.y + wa.height - TOY_SIZE.height)),
      ...TOY_SIZE,
    };
  }
}

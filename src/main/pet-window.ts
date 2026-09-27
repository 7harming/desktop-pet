import { BrowserWindow } from 'electron';
import { join } from 'node:path';
import { APP_ORIGIN } from './app-protocol';
import type { Bounds } from './pet-geometry';
import type { LogLevel, PetInit, ReminderResult } from '../shared/ipc';
import type { Pack, ReminderType } from '../shared/types';

export interface PetEvents {
  status(id: string, label: string): void;
  menu(id: string): void;
  dragEnd(id: string): void;
  reminderResult(id: string, type: ReminderType, result: ReminderResult): void;
  crashed(id: string): void;
  log(id: string, level: LogLevel, message: string): void;
}

export class PetWindow {
  readonly win: BrowserWindow;

  constructor(readonly pack: Pack, bounds: Bounds, private init: Omit<PetInit, 'pack' | 'packUrl'>,
              private readonly events: PetEvents, preloadDir: string) {
    this.win = new BrowserWindow({
      ...bounds,
      transparent: true, frame: false, resizable: false, alwaysOnTop: true, skipTaskbar: true,
      hasShadow: false, show: false, backgroundColor: '#00000000',
      webPreferences: { preload: join(preloadDir, 'preload-pet.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
    });
    // At fractional display scaling Windows creates the window a few pixels too big; setting the bounds again fixes it.
    this.win.setBounds(bounds);
    this.win.setIgnoreMouseEvents(true, { forward: true });
    this.win.webContents.on('render-process-gone', () => events.crashed(pack.id));
    void this.win.loadURL(`${APP_ORIGIN}/ui/pet.html`);
  }

  get id(): string { return this.pack.id; }

  /** Messages from this window's renderer, routed here by the controller. */
  handle(channel: string, args: unknown[]): void {
    switch (channel) {
      case 'pet:ready': {
        const init: PetInit = { ...this.init, pack: this.pack, packUrl: `${APP_ORIGIN}/packs/${this.pack.id}/` };
        this.send('pet:init', init);
        this.win.showInactive();
        break;
      }
      case 'pet:set-interactive': this.win.setIgnoreMouseEvents(!args[0], { forward: true }); break;
      case 'pet:move': this.win.setPosition(Math.round(Number(args[0])), Math.round(Number(args[1]))); break;
      case 'pet:drag-end': this.events.dragEnd(this.id); break;
      case 'pet:menu': this.events.menu(this.id); break;
      case 'pet:status': this.events.status(this.id, String(args[0])); break;
      case 'pet:reminder-result': this.events.reminderResult(this.id, args[0] as ReminderType, args[1] as ReminderResult); break;
      case 'pet:log': this.events.log(this.id, args[0] as LogLevel, String(args[1])); break;
    }
  }

  send(channel: string, ...args: unknown[]): void {
    if (!this.win.isDestroyed()) this.win.webContents.send(channel, ...args);
  }

  updateInit(patch: Partial<Omit<PetInit, 'pack' | 'packUrl'>>): void { this.init = { ...this.init, ...patch }; }
  setBounds(b: Bounds): void { if (!this.win.isDestroyed()) this.win.setBounds(b); }
  close(): void { if (!this.win.isDestroyed()) this.win.destroy(); }
}

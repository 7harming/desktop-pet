import { BrowserWindow } from 'electron';
import { join } from 'node:path';
import { APP_ORIGIN } from './app-protocol';
import type { Bounds } from './pet-geometry';
import type { CardAction, CardState } from '../shared/ipc';
import type { CardKind } from '../shared/types';

/** Both cards are this wide: two thirds of what the reminders first had, the memo the same. */
export const CARD_WIDTH = 186;
const MAX_HEIGHT = 560;

/** `resized`: the card's content changed height, so where it goes may change. */
export interface CardEvents { act(a: CardAction): void; hot(on: boolean): void; close(): void; resized(): void }

/** One card's window: transparent, frameless, over everything and typed into; the CardController says where it goes. */
export class CardWindow {
  readonly win: BrowserWindow;
  readonly width = CARD_WIDTH;
  height = 160;
  private bounds: Bounds | null = null;
  private ready = false;
  private shown = false;
  private wantFocus = false;

  constructor(readonly kind: CardKind, private state: CardState, events: CardEvents, preloadDir: string) {
    this.win = new BrowserWindow({
      width: this.width, height: this.height, transparent: true, frame: false, resizable: false, alwaysOnTop: true, skipTaskbar: true,
      hasShadow: false, show: false, minimizable: false, maximizable: false, fullscreenable: false, backgroundColor: '#00000000',
      webPreferences: { preload: join(preloadDir, 'preload-card.js'), contextIsolation: true, nodeIntegration: false },
    });
    this.win.setAlwaysOnTop(true, 'pop-up-menu');
    if (process.platform === 'darwin') this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    const ipc = this.win.webContents.ipc;
    ipc.on('card:ready', () => { this.ready = true; this.push(this.state); this.reveal(); });
    ipc.on('card:act', (_e, a: CardAction) => events.act(a));
    ipc.on('card:resize', (_e, h: number) => {
      const height = Math.min(MAX_HEIGHT, Math.max(60, Math.round(Number(h))));
      if (height !== this.height) { this.height = height; events.resized(); }
    });
    ipc.on('card:hot', (_e, on: boolean) => events.hot(!!on));
    ipc.on('card:close', () => events.close());
    void this.win.loadURL(`${APP_ORIGIN}/ui/card.html`);
  }

  /** Where it is (screen px), once it has been placed. */
  get placed(): Bounds | null { return this.bounds; }

  /** Put it here (screen px), and show it once its page is ready. */
  place(b: Bounds): void {
    const same = this.bounds && this.bounds.x === b.x && this.bounds.y === b.y && this.bounds.width === b.width && this.bounds.height === b.height;
    this.bounds = b;
    // the size every time: at fractional display scaling each setPosition grows the window by a pixel
    if (!same && !this.win.isDestroyed()) this.win.setBounds(b);
    this.reveal();
  }

  /** Opened by hand: take the keyboard. */
  focus(): void {
    this.wantFocus = true;
    this.reveal();
  }

  push(state: CardState): void {
    this.state = state;
    if (this.ready && !this.win.isDestroyed()) this.win.webContents.send('card:state', state);
  }

  close(): void { if (!this.win.isDestroyed()) this.win.destroy(); }

  /** Once the page is ready and it has a place: show it, focused if asked. */
  private reveal(): void {
    if (!this.ready || !this.bounds || this.win.isDestroyed()) return;
    if (!this.shown) {
      this.shown = true;
      if (this.wantFocus) this.win.show(); else this.win.showInactive();
      this.win.moveTop();
    }
    if (this.wantFocus) {
      this.wantFocus = false;
      this.win.focus();
      this.win.webContents.send('card:focus');
    }
  }
}

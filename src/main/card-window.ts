import { BrowserWindow } from 'electron';
import { join } from 'node:path';
import { APP_ORIGIN } from './app-protocol';
import { cardBounds, type WorkArea } from './pet-geometry';
import type { CardAction, CardState } from '../shared/ipc';
import type { CardKind } from '../shared/types';

/** The card's bottom sits this far above the cat's head: its speech bubbles go in between. */
const GAP = 80;
const WIDTH: Record<CardKind, number> = { memo: 240, todo: 280 };
const MAX_HEIGHT = 560;

export interface CardEvents { act(a: CardAction): void; hot(on: boolean): void; close(): void }
type Point = { x: number; y: number };

/** One card's window: transparent, frameless, over everything and typed into; it sits over the head of the cat it is shown above. */
export class CardWindow {
  readonly win: BrowserWindow;
  private height = 160;
  private head: Point | null = null;
  private ready = false;
  private shown = false;
  private wantFocus = false;

  constructor(readonly kind: CardKind, private state: CardState, private readonly workArea: () => WorkArea, events: CardEvents,
              preloadDir: string) {
    this.win = new BrowserWindow({
      width: WIDTH[kind], height: this.height, transparent: true, frame: false, resizable: false, alwaysOnTop: true, skipTaskbar: true,
      hasShadow: false, show: false, minimizable: false, maximizable: false, fullscreenable: false, backgroundColor: '#00000000',
      webPreferences: { preload: join(preloadDir, 'preload-card.js'), contextIsolation: true, nodeIntegration: false },
    });
    this.win.setAlwaysOnTop(true, 'pop-up-menu');
    if (process.platform === 'darwin') this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    const ipc = this.win.webContents.ipc;
    ipc.on('card:ready', () => { this.ready = true; this.push(this.state); this.reveal(); });
    ipc.on('card:act', (_e, a: CardAction) => events.act(a));
    ipc.on('card:resize', (_e, h: number) => { this.height = Math.min(MAX_HEIGHT, Math.max(60, Math.round(Number(h)))); this.place(); });
    ipc.on('card:hot', (_e, on: boolean) => events.hot(!!on));
    ipc.on('card:close', () => events.close());
    void this.win.loadURL(`${APP_ORIGIN}/ui/card.html`);
  }

  /** Show it over the head at `head` (screen px); `focus`: take the keyboard (opened by hand). */
  showAt(head: Point, focus: boolean): void {
    this.head = head;
    this.wantFocus ||= focus;
    this.place();
    this.reveal();
  }

  /** The cat moved: follow it. */
  follow(head: Point): void { this.head = head; this.place(); }

  push(state: CardState): void {
    this.state = state;
    if (this.ready && !this.win.isDestroyed()) this.win.webContents.send('card:state', state);
  }

  close(): void { if (!this.win.isDestroyed()) this.win.destroy(); }

  private place(): void {
    if (!this.head || this.win.isDestroyed()) return;
    // the size every time: at fractional display scaling each setPosition grows the window by a pixel
    this.win.setBounds(cardBounds(this.head, WIDTH[this.kind], this.height, this.workArea(), GAP));
  }

  /** Once the page is ready and it has a place: show it, focused if asked. */
  private reveal(): void {
    if (!this.ready || !this.head || this.win.isDestroyed()) return;
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

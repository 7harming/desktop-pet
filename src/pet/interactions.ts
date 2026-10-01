import type { PetApi } from '../shared/ipc';

export interface InteractionDeps {
  api: PetApi;
  hitTest(x: number, y: number): boolean;
  canDrag(): boolean;
  onClick(): void;
  /** The second click of a double-click, at clientX `x`; false: nothing happened, so it counts as a plain click. */
  onDoubleClick(x: number): boolean;
  onDragStart(): void;
  onNoDrag(): void;
  wrap: HTMLElement;          // the element that swings while dragged
  restY: number;              // window top when standing on the taskbar
  getFrameX(): number;        // where the cat's frame sits inside the strip window
  setFrameX(x: number): void;
  /** The wheel turned over the cat (up: towards the user). */
  onWheel(up: boolean): void;
  /** The strip moved to `winY` while dragged or falling (`dragging`), or has landed. */
  onMoved(winY: number, dragging: boolean): void;
}

const DRAG_THRESHOLD = 6;
const DOUBLE_CLICK_MS = 400;
const GRAVITY = 2400;

export class Interactions {
  private interactive = false;
  private press: { x: number; y: number; clientX: number; frameX: number; winY: number } | null = null;
  private lastClick = 0;
  private dragging = false;
  private winY = window.screenY;
  private swing = 0;
  private swingV = 0;
  private lastX = 0;
  private lastT = 0;
  private vx = 0;
  private restY: number;

  constructor(private readonly d: InteractionDeps) {
    this.restY = d.restY;
    window.addEventListener('mousemove', e => this.onMove(e));
    window.addEventListener('mousedown', e => this.onDown(e));
    window.addEventListener('mouseup', () => this.onUp());
    window.addEventListener('contextmenu', e => { e.preventDefault(); if (d.hitTest(e.clientX, e.clientY)) d.api.openMenu(); });
    window.addEventListener('wheel', e => { if (e.deltaY && d.hitTest(e.clientX, e.clientY)) d.onWheel(e.deltaY < 0); }, { passive: true });
  }

  setRestY(y: number): void { this.restY = y; }

  private setInteractive(on: boolean): void {
    if (on === this.interactive) return;
    this.interactive = on;
    this.d.api.setInteractive(on);
  }

  private onMove(e: MouseEvent): void {
    const now = performance.now();
    this.vx = this.vx * 0.5 + ((e.screenX - this.lastX) / Math.max(1, now - this.lastT)) * 1000 * 0.5;
    this.lastX = e.screenX; this.lastT = now;
    if (this.press && !this.dragging && Math.hypot(e.screenX - this.press.x, e.screenY - this.press.y) > DRAG_THRESHOLD) {
      if (!this.d.canDrag()) { this.press = null; this.d.onNoDrag(); return; }
      this.dragging = true;
      this.d.onDragStart();
      this.animateSwing();
    }
    if (this.dragging && this.press) {
      // sideways the cat moves inside the strip; up and down the strip itself moves
      this.d.setFrameX(this.press.frameX + (e.screenX - this.press.x));
      this.winY = this.press.winY + (e.screenY - this.press.y);
      this.d.api.moveWindow(this.winY);
      this.d.onMoved(this.winY, true);
      return;
    }
    if (!this.press) this.setInteractive(this.d.hitTest(e.clientX, e.clientY));
  }

  private onDown(e: MouseEvent): void {
    if (e.button !== 0 || !this.d.hitTest(e.clientX, e.clientY)) return;
    this.winY = window.screenY;
    this.press = { x: e.screenX, y: e.screenY, clientX: e.clientX, frameX: this.d.getFrameX(), winY: this.winY };
  }

  private onUp(): void {
    const press = this.press;
    if (!press) return;
    const wasDragging = this.dragging;
    this.press = null;
    this.dragging = false;
    if (wasDragging) { this.fall(); return; }
    const now = performance.now();
    if (now - this.lastClick < DOUBLE_CLICK_MS && this.d.onDoubleClick(press.clientX)) { this.lastClick = 0; return; }
    this.lastClick = now;
    this.d.onClick();
  }

  /** Limp, unbothered swing while held. */
  private animateSwing(): void {
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const target = this.dragging ? Math.max(-0.25, Math.min(0.25, this.vx * 0.0003)) : 0;
      this.swingV += ((target - this.swing) * 30 - this.swingV * 6) * dt;
      this.swing += this.swingV * dt;
      this.vx *= Math.exp(-dt * 6);
      this.d.wrap.style.transform = `rotate(${this.swing}rad)`;
      if (this.dragging || Math.abs(this.swing) > 0.002 || Math.abs(this.swingV) > 0.002) requestAnimationFrame(tick);
      else this.d.wrap.style.transform = '';
    };
    requestAnimationFrame(tick);
  }

  private fall(): void {
    let vy = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      vy += GRAVITY * dt;
      this.winY = Math.min(this.restY, this.winY + vy * dt);
      this.d.api.moveWindow(this.winY);
      this.d.onMoved(this.winY, this.winY < this.restY);
      if (this.winY < this.restY) { requestAnimationFrame(tick); return; }
      this.d.wrap.animate([{ transform: 'scale(1.05, .95)' }, { transform: 'none' }], { duration: 350 });
      this.d.api.dragEnded(this.d.getFrameX());
    };
    requestAnimationFrame(tick);
  }
}

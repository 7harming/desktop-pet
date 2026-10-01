import type { WorkArea } from './pet-geometry';
import { TOY_SIZE, ToyWindow } from './toy-window';
import { ToyInterest, type ToyMove } from '../shared/toy';
import type { Pack } from '../shared/types';

/** A cat tires of a feather that has not moved for this long (DESKTOP_PET_TOY_BORED_SECONDS: tests). */
const BORED_MS = (Number(process.env.DESKTOP_PET_TOY_BORED_SECONDS) || 5) * 1000;
/** A cat notices a moving feather within this many of its window heights of its head, and swats it within REACH of them. */
const NOTICE = 1;
const REACH = 0.6;

export interface ToyHost {
  /** The cats on the desktop, in order. */
  onScreen(): string[];
  packOf(id: string): Pack | null;
  /** Where the cat's head is (its ear tips, as it reported them for the cards), and whether it stands still there. */
  head(id: string): { x: number; y: number; settled: boolean } | null;
  /** The height of the cat's window: how big it is drawn. */
  frameHeight(id: string): number;
  workArea(): WorkArea;
  send(id: string, move: ToyMove): void;
  /** The wand came out or was put away: menus and the panel say so. */
  changed(): void;
}

/** The cat wand: its window, and each cat's interest in the feather (watching it, swatting it, tiring of it). */
export class ToyController {
  private win: ToyWindow | null = null;
  readonly interest = new Map<string, ToyInterest>();

  constructor(private readonly host: ToyHost, private readonly preloadDir: string) {}

  get out(): boolean { return this.win !== null; }
  get window(): ToyWindow | null { return this.win; }

  /** Take it out: up and to the right of the head of the cat `near` (else near the bottom right), the feather by its head. */
  takeOut(near: string | null): void {
    if (this.win) return;
    const wa = this.host.workArea();
    const head = near ? this.host.head(near) : null;
    const at = head ? { x: head.x + 10, y: head.y - TOY_SIZE.height + 60 }
      : { x: wa.x + wa.width - TOY_SIZE.width - 80, y: wa.y + wa.height - TOY_SIZE.height - 280 };
    this.win = new ToyWindow(at, () => this.host.workArea(), { feather: (p, speed) => this.feather(p, speed) }, this.preloadDir);
    this.host.changed();
  }

  /** Put it away: the cats watching it go back to their ways. */
  putAway(): void {
    if (!this.win) return;
    this.win.close();
    this.win = null;
    for (const [id, t] of this.interest) if (t.reset()) this.host.send(id, { do: 'bored' });
    this.host.changed();
  }

  /** Where the feather is (screen px) and how fast it goes: each cat that can play takes it its own way. */
  feather(p: { x: number; y: number }, speed: number, now = Date.now()): void {
    for (const id of this.host.onScreen()) {
      const head = this.host.head(id);
      if (!this.host.packOf(id)?.toy || !head?.settled) continue;
      let t = this.interest.get(id);
      if (!t) {
        const h = this.host.frameHeight(id);
        t = new ToyInterest({ notice: NOTICE * h, reach: REACH * h, boredMs: BORED_MS });
        this.interest.set(id, t);
      }
      const move = t.update(head, p, speed, now);
      if (move) this.host.send(id, move);
    }
  }

  /** The cat walks off or is gone. */
  petGone(id: string): void { this.interest.delete(id); }
}

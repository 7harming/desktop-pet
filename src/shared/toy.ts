import type { SwatDir } from './types';

type Point = { x: number; y: number };
/** The feather moves when it goes at least this fast (px/s); slower, the cat takes it for still. */
export const MIN_SPEED = 120;

/** Which side of the head (`head`: its middle, at the ear tips) the feather is on; null: below the head, under its chin. */
export function swatDir(head: Point, feather: Point): SwatDir | null {
  const deg = (Math.atan2(head.y - feather.y, feather.x - head.x) * 180) / Math.PI;   // 0 right, 90 up, 180 / -180 left
  if (deg > -60 && deg <= 22.5) return 'right';
  if (deg > 22.5 && deg <= 67.5) return 'upRight';
  if (deg > 67.5 && deg <= 112.5) return 'up';
  if (deg > 112.5 && deg <= 157.5) return 'upLeft';
  if (deg > 157.5 || deg <= -120) return 'left';
  return null;
}

export type ToyMove = { do: 'watch' } | { do: 'swat'; dir: SwatDir } | { do: 'bored' };

/**
 * How one cat takes the wand: it starts watching when the feather moves within `notice` of its head, swats it while it moves
 * within `reach`, and tires once it has not moved within notice for `boredMs`. The caller passes the time in.
 */
export class ToyInterest {
  private watching = false;
  private lastMove = -Infinity;

  constructor(private readonly o: { notice: number; reach: number; boredMs: number }) {}

  update(head: Point, feather: Point, speed: number, now: number): ToyMove | null {
    const dist = Math.hypot(feather.x - head.x, feather.y - head.y);
    const moving = speed >= MIN_SPEED;
    if (moving && dist <= this.o.notice) this.lastMove = now;
    if (!this.watching) {
      if (!moving || dist > this.o.notice) return null;
      this.watching = true;
      return { do: 'watch' };
    }
    if (now - this.lastMove >= this.o.boredMs) {
      this.watching = false;
      return { do: 'bored' };
    }
    const dir = moving && dist <= this.o.reach ? swatDir(head, feather) : null;
    return dir ? { do: 'swat', dir } : null;
  }

  /** The wand was put away, or the cat went: it stops watching; true if it was. */
  reset(): boolean {
    const was = this.watching;
    this.watching = false;
    this.lastMove = -Infinity;
    return was;
  }
}

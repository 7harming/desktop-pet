import type { Pack } from '../shared/types';

export interface WorkArea { x: number; y: number; width: number; height: number }
export type Bounds = WorkArea;
/** Left and right edge of what the cat draws, as shares of the window width. */
export type Extent = [number, number];

export function windowSize(pack: Pack, scale: number): { width: number; height: number } {
  const height = Math.round(pack.frame.displayHeight * scale);
  return { width: Math.round(height * pack.frame.aspect), height };
}

/** Window top while the cat stands on the taskbar (the start pose's ground line on the work-area bottom). */
export function restY(pack: Pack, scale: number, wa: WorkArea): number {
  const { height } = windowSize(pack, scale);
  return Math.round(wa.y + wa.height - pack.poses[pack.start].ground * height);
}

/**
 * Everything the cat may draw at its resting spot: the ticked poses (null = all), the start pose it passes through, and walking.
 * A pose without `left`/`right` may use the whole frame.
 */
export function extentOf(pack: Pack, poses: string[] | null): Extent {
  const ticked = (poses ?? []).filter(p => pack.poses[p]);
  const ids = new Set([pack.start, ...(ticked.length ? ticked : Object.keys(pack.poses))]);
  const spans: Extent[] = [...ids].map(id => [pack.poses[id].left ?? 0, pack.poses[id].right ?? 1]);
  if (pack.walk) spans.push([pack.walk.left, pack.walk.right]);
  return [Math.min(...spans.map(e => e[0])), Math.max(...spans.map(e => e[1]))];
}

/**
 * `xRatio` is where the start pose's body centre sits across the work area. The window may hang past the screen edge as long as
 * `extent` (what the cat draws) stays on screen.
 */
export function windowBounds(pack: Pack, scale: number, xRatio: number, wa: WorkArea, extent: Extent = [0, 1]): Bounds {
  const { width, height } = windowSize(pack, scale);
  const bodyX = wa.x + xRatio * wa.width;
  const x = Math.round(bodyX - pack.poses[pack.start].centerX * width);
  const min = Math.ceil(wa.x - extent[0] * width);
  const max = Math.floor(wa.x + wa.width - extent[1] * width);
  const clamped = max < min ? min : Math.min(Math.max(x, min), max);
  return { x: clamped, y: restY(pack, scale, wa), width, height };
}

export function xRatioFromBounds(b: { x: number; width: number }, pack: Pack, wa: WorkArea): number {
  const bodyX = b.x + pack.poses[pack.start].centerX * b.width;
  return Math.min(1, Math.max(0, (bodyX - wa.x) / wa.width));
}

export function bodyWidth(pack: Pack, scale: number): number {
  return windowSize(pack, scale).width * 0.35;
}

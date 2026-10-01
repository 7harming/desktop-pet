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
 * Everything the cat may draw at its resting spot: the ticked poses (null = all), the start pose it passes through, walking,
 * pouncing and play-fighting.
 * A pose without `left`/`right` may use the whole frame.
 */
export function extentOf(pack: Pack, poses: string[] | null): Extent {
  const ticked = (poses ?? []).filter(p => pack.poses[p]);
  const ids = new Set([pack.start, ...(ticked.length ? ticked : Object.keys(pack.poses))]);
  const spans: Extent[] = [...ids].map(id => [pack.poses[id].left ?? 0, pack.poses[id].right ?? 1]);
  if (pack.walk) spans.push([pack.walk.left, pack.walk.right]);
  if (pack.pounce) spans.push([pack.pounce.left, pack.pounce.right]);
  if (pack.fight) spans.push([pack.fight.left, pack.fight.right]);
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

/** Where a card `width`×`height` goes: centred over the head at `head` (screen px), its bottom on it, inside the work area. */
export function cardBounds(head: { x: number; y: number }, width: number, height: number, wa: WorkArea): Bounds {
  const x = Math.round(Math.min(Math.max(head.x - width / 2, wa.x), wa.x + wa.width - width));
  const y = Math.round(Math.min(Math.max(head.y - height, wa.y), wa.y + wa.height - height));
  return { x, y, width, height };
}

const overlaps = (a: Bounds, b: Bounds) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** The cards over the cats' heads, where each would go: two that would overlap stand side by side instead, touching, around the middle of the two, inside the work area. */
export function layoutCards(cards: Bounds[], wa: WorkArea): Bounds[] {
  if (cards.length !== 2 || !overlaps(cards[0], cards[1])) return cards;
  const centre = (b: Bounds) => b.x + b.width / 2;
  const [l, r] = centre(cards[0]) <= centre(cards[1]) ? [0, 1] : [1, 0];
  const width = cards[l].width + cards[r].width;
  const mid = (centre(cards[0]) + centre(cards[1])) / 2;
  const x = Math.round(Math.min(Math.max(mid - width / 2, wa.x), wa.x + wa.width - width));
  const out = [...cards];
  out[l] = { ...cards[l], x };
  out[r] = { ...cards[r], x: x + cards[l].width };
  return out;
}

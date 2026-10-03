import { actionExtent, restExtent, union, type Extent } from '../shared/pose-geometry';
import type { Pack } from '../shared/types';

export interface WorkArea { x: number; y: number; width: number; height: number }
export type Bounds = WorkArea;

export function windowSize(pack: Pack, scale: number): { width: number; height: number } {
  const height = Math.round(pack.frame.displayHeight * scale);
  return { width: Math.round(height * pack.frame.aspect), height };
}

/** The frame's top while the cat stands on the taskbar (the start pose's ground line on the work-area bottom; see PetWindow). */
export function restY(pack: Pack, scale: number, wa: WorkArea): number {
  const { height } = windowSize(pack, scale);
  return Math.round(wa.y + wa.height - pack.poses[pack.start].ground * height);
}

/**
 * What must stay on screen where the cat rests: what it always has room for (restExtent: resting, sitting up, the wand,
 * walking), and `actions` it is about to do there (a pose or a pounce it was told to). Wider things it does by itself only where
 * they fit, so it can rest right by the screen's edge.
 */
export const extentOf = (pack: Pack, actions: string[] = []): Extent => union([restExtent(pack), ...actions.map(k => actionExtent(pack, k))]);

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

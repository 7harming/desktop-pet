import type { WalkDef } from './types';

/**
 * Where the walking loop's frame goes, as x positions (px, in the coordinates of the strip or screen it walks across, whose left
 * edge is 0). The frame glides from `start` to `end` at `pxPerSec` while the loop plays `loops` times, so the last loop ends exactly
 * at `end` and whatever plays next starts from the loop's first frame there.
 */
export interface WalkPlan { start: number; end: number; loops: number; pxPerSec: number }

const pxPerSec = (walk: WalkDef, frameW: number) => walk.speed * (walk.rate ?? 1) * frameW;

/** How far arrive and depart move their frame in all (px): arrive ends that far right of where it starts, depart that far left. */
export const arriveGlidePx = (walk: WalkDef, frameW: number) => (walk.arriveGlide?.at(-1) ?? 0) * frameW;
export const departGlidePx = (walk: WalkDef, frameW: number) => (walk.departGlide?.at(-1) ?? 0) * frameW;

/** Walking right, from off the left edge to `restX` (the frame x where the loop hands over to `arrive`). */
export function planWalkIn(walk: WalkDef, frameW: number, restX: number, loopSecs: number): WalkPlan {
  const perLoop = walk.speed * loopSecs * frameW;
  const reach = restX + (walk.centerX + walk.width / 2) * frameW;          // the cat's right edge at the resting spot
  const loops = Math.max(1, Math.ceil(reach / perLoop));
  return { start: restX - loops * perLoop, end: restX, loops, pxPerSec: pxPerSec(walk, frameW) };
}

/** Walking left, mirrored, from where `depart` leaves the cat (its frame ending at x `restX`) until it is off the left edge. */
export function planWalkOut(walk: WalkDef, frameW: number, restX: number, loopSecs: number): WalkPlan {
  const perLoop = walk.speed * loopSecs * frameW;
  // mirrored, the loop's cat is centred at 1 - centerX; line that up with where depart ends
  const start = restX + (walk.departX - (1 - walk.centerX)) * frameW;
  const reach = start + (1 - walk.centerX + walk.width / 2) * frameW;       // the cat's right edge when it sets off
  const loops = Math.max(1, Math.ceil(reach / perLoop));
  return { start, end: start - loops * perLoop, loops, pxPerSec: pxPerSec(walk, frameW) };
}

import type { WalkDef } from './types';

/**
 * Where to draw each walking loop, as the x of the loop's frame (px, in the coordinates of the strip or screen it walks across,
 * whose left edge is 0). Loop i+1 starts where loop i ends, so the cat's paws stay planted across the joins.
 */

/** Walking right, from off the left edge to `restX` (the frame x where `arrive` plays and the cat lies down). */
export function planWalkIn(walk: WalkDef, frameW: number, restX: number): number[] {
  const travel = (walk.to - walk.from) * frameW;
  // the last loop ends exactly where arrive starts; add loops until the first one starts with the cat off screen
  const reach = restX + (walk.from + walk.width / 2) * frameW;
  const loops = Math.max(1, Math.ceil(reach / travel));
  return Array.from({ length: loops }, (_, i) => restX - (loops - i) * travel);
}

/** Walking left, mirrored, from where `depart` (played at frame x `restX`) leaves the cat until it is off the left edge. */
export function planWalkOut(walk: WalkDef, frameW: number, restX: number): number[] {
  const travel = (walk.to - walk.from) * frameW;
  // mirrored, the loop's cat starts centred at 1 - from; line that up with where depart ends
  const first = restX + (walk.departX - (1 - walk.from)) * frameW;
  const rightEdge = (1 - walk.from + walk.width / 2) * frameW;
  const out: number[] = [];
  for (let x = first; x + rightEdge > 0; x -= travel) out.push(x);
  return out;
}

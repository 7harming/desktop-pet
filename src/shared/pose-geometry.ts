import { pounceSide } from './actions';
import type { Step } from './graph';
import type { Pack, PoseId } from './types';

export type PoseKey = 'ground' | 'centerX' | 'head';

/**
 * Clear space (px) at the top of a cat's window, above its frame: a speech bubble with buttons over a sitting cat's head fits at
 * any size (at the smallest, the head is only about 40 px below the frame's top).
 */
export const HEADROOM = 96;

export const smooth = (k: number): number => k * k * (3 - 2 * k);

/** A pose value (ground line, body centre, head height) eased from one pose to the next while a transition plays. */
export function poseValueAt(pack: Pack, step: Step | null, progress: number, key: PoseKey): number {
  if (!step) return pack.poses[pack.start][key];
  const a = pack.poses[step.from][key];
  const b = pack.poses[step.to][key];
  if (step.from === step.to) return a;
  return a + (b - a) * smooth(Math.min(1, Math.max(0, progress)));
}

export function showsShadow(pack: Pack, step: Step | null): boolean {
  if (!step) return !!pack.poses[pack.start].shadow;
  return !!pack.poses[step.from].shadow && !!pack.poses[step.to].shadow;
}

export function isAsleep(pack: Pack, pose: PoseId): boolean {
  return !!pack.poses[pose].asleep;
}

/** The poses it may go to sleep in when the user is away: asleep, and neither a passing pose nor one it only visits. */
export function sleepPoses(pack: Pack): PoseId[] {
  return Object.entries(pack.poses).filter(([, p]) => p.asleep && !p.transient && !p.brief).map(([id]) => id);
}

/** Left and right edge of what the cat draws, as shares of its frame's width. */
export type Extent = [number, number];

export const union = (spans: Extent[]): Extent => [Math.min(...spans.map(e => e[0])), Math.max(...spans.map(e => e[1]))];

/** What one action draws: a pose (one without an extent may use the whole frame), or a pounce, which reaches out to its side. */
export function actionExtent(pack: Pack, key: string): Extent {
  const side = pounceSide(key);
  const p = pack.pounce;
  if (side && p) {
    const [l, r] = actionExtent(pack, p.pose);
    return side === 'left' ? [Math.min(l, p.left), r] : [l, Math.max(r, p.right)];
  }
  const pose = pack.poses[key];
  return pose ? [pose.left ?? 0, pose.right ?? 1] : [0, 1];
}

/**
 * What a cat always has room for where it rests: its start pose, sitting up (for the user, and for the wand, swats included),
 * and walking in and out. Anything wider (小昭's box, a play-fight) it does there only if it has room (see fitsAt), or moves over
 * first when told to.
 */
export function restExtent(pack: Pack): Extent {
  const spans: Extent[] = [actionExtent(pack, pack.start)];
  if (pack.alert) spans.push(actionExtent(pack, pack.alert));
  if (pack.toy) spans.push(actionExtent(pack, pack.toy.pose), [pack.toy.left, pack.toy.right]);
  if (pack.walk) spans.push([pack.walk.left, pack.walk.right]);
  return union(spans);
}

/** Whether what draws `extent` stays on screen, its frame `frameW` wide at `frameX` in a strip `width` wide (half a px spare). */
export const fitsAt = (extent: Extent, frameX: number, frameW: number, width: number): boolean =>
  frameX + extent[0] * frameW >= -0.5 && frameX + extent[1] * frameW <= width + 0.5;

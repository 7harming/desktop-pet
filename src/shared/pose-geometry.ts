import type { Step } from './graph';
import type { Pack, PoseId } from './types';

export type PoseKey = 'ground' | 'centerX' | 'head';

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

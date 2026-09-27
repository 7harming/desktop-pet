import type { ClipId, EdgeDef, Pack, PoseId } from './types';

export interface Step { clip: ClipId; from: PoseId; to: PoseId; rate: number; fadeIn: number }

export function reachable(edges: EdgeDef[], from: PoseId, reverse = false): Set<PoseId> {
  const seen = new Set<PoseId>([from]);
  const queue = [from];
  while (queue.length) {
    const p = queue.shift()!;
    for (const e of edges) {
      const [a, b] = reverse ? [e.to, e.from] : [e.from, e.to];
      if (a === p && !seen.has(b)) { seen.add(b); queue.push(b); }
    }
  }
  return seen;
}

/** Shortest path (fewest edges) that avoids edges whose clip is broken. */
export function findPath(edges: EdgeDef[], from: PoseId, to: PoseId, broken: ReadonlySet<ClipId> = new Set()): EdgeDef[] | null {
  if (from === to) return [];
  const prev = new Map<PoseId, EdgeDef | null>([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const p = queue.shift()!;
    for (const e of edges) {
      if (e.from !== p || prev.has(e.to) || (e.clip !== undefined && broken.has(e.clip))) continue;
      prev.set(e.to, e);
      if (e.to === to) {
        const path: EdgeDef[] = [];
        let x: EdgeDef | null = e;
        while (x) { path.unshift(x); x = prev.get(x.from) ?? null; }
        return path;
      }
      queue.push(e.to);
    }
  }
  return null;
}

export function pathToSteps(pack: Pack, path: EdgeDef[]): { steps: Step[]; pendingFade: number } {
  const steps: Step[] = [];
  let fade = 0;
  for (const e of path) {
    if (e.fade !== undefined) { fade += e.fade; continue; }
    const clip = e.clip!;
    steps.push({ clip, from: e.from, to: e.to, rate: pack.clips[clip].rate ?? 1, fadeIn: fade });
    fade = 0;
  }
  return { steps, pendingFade: fade };
}

export function idleStep(pack: Pack, pose: PoseId, clip: ClipId, fadeIn = 0): Step {
  return { clip, from: pose, to: pose, rate: pack.clips[clip].rate ?? 1, fadeIn };
}

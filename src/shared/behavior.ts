import { findPath, idleStep, pathToSteps, type Step } from './graph';
import type { ClipId, Pack, PoseId } from './types';

export type Rng = () => number;

const DEFAULT_STAY = 0.6;

/** Decides which clip plays next. The player calls next() exactly when the current clip ends. */
export class BehaviorEngine {
  auto = true;
  private queue: Step[] = [];
  private current: Step | null = null;
  private readonly broken = new Set<ClipId>();

  constructor(private readonly pack: Pack, private readonly rng: Rng) {}

  get endPose(): PoseId { return this.current ? this.current.to : this.pack.start; }
  get currentStep(): Step | null { return this.current; }

  start(): Step {
    this.queue = [];
    return this.take(this.idleOf(this.pack.start, 0));
  }

  next(): Step {
    const queued = this.queue.shift();
    if (queued) return this.take(queued);
    const pose = this.endPose;
    const def = this.pack.poses[pose];
    if (def.transient) {
      if (this.plan(this.pack.start)) return this.take(this.queue.shift()!);
      return this.take(this.current!);   // stuck on a transient pose: replay the last clip rather than crash
    }
    if (!this.auto || this.rng() < (def.stay ?? DEFAULT_STAY)) return this.take(this.idleOf(pose, 0));
    const target = this.pickTarget(pose);
    if (target && this.plan(target)) return this.take(this.queue.shift()!);
    return this.take(this.idleOf(pose, 0));
  }

  /** Replace whatever was queued with the shortest way to `target`, starting after the current clip. */
  command(target: PoseId): boolean {
    this.queue = [];
    return this.plan(target);
  }

  markBroken(clip: ClipId): void {
    this.broken.add(clip);
    this.queue = [];
  }

  upcomingClips(): ClipId[] {
    const out = new Set<ClipId>();
    for (const s of this.queue.slice(0, 2)) out.add(s.clip);
    const add = (pose: PoseId, depth: number) => {
      for (const c of this.pack.poses[pose].idle ?? []) out.add(c);
      for (const e of this.pack.edges) {
        if (e.from !== pose) continue;
        if (e.clip) out.add(e.clip);
        else if (depth < 2) add(e.to, depth + 1);
      }
    };
    add(this.endPose, 0);
    return [...out];
  }

  private take(step: Step): Step { this.current = step; return step; }

  private plan(target: PoseId): boolean {
    const path = findPath(this.pack.edges, this.endPose, target, this.broken);
    if (!path) return false;
    const { steps, pendingFade } = pathToSteps(this.pack, path);
    this.queue.push(...steps, this.idleOf(target, pendingFade));
    return true;
  }

  private idleOf(pose: PoseId, fadeIn: number): Step {
    const all = this.pack.poses[pose].idle ?? [];
    const ok = all.filter(c => !this.broken.has(c));
    const pool = ok.length ? ok : all;
    const clip = pool[Math.min(pool.length - 1, Math.floor(this.rng() * pool.length))];
    return idleStep(this.pack, pose, clip, fadeIn);
  }

  private pickTarget(pose: PoseId): PoseId | null {
    const candidates = Object.entries(this.pack.poses)
      .filter(([id, p]) => id !== pose && !p.transient && (p.autoWeight ?? 1) > 0)
      .filter(([id]) => findPath(this.pack.edges, pose, id, this.broken) !== null);
    if (!candidates.length) return null;
    const total = candidates.reduce((s, [, p]) => s + (p.autoWeight ?? 1), 0);
    let r = this.rng() * total;
    for (const [id, p] of candidates) {
      r -= p.autoWeight ?? 1;
      if (r < 0) return id;
    }
    return candidates[candidates.length - 1][0];
  }
}

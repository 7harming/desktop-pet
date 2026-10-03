import { findPath, idleStep, pathToSteps, type Step } from './graph';
import { pounceSide } from './actions';
import type { ClipId, Pack, PoseDef, PoseId, PounceSide } from './types';

export type Rng = () => number;
export type Clock = () => number;

const DEFAULT_STAY = 0.6;
/** With a dwell set, each rest lasts the dwell give or take this share of it (picked when the rest begins). */
const DWELL_JITTER = 0.15;
/** How long it takes to dissolve into its start pose when every clip that would take it anywhere has broken. */
const DISSOLVE_S = 0.5;

/** Decides which clip plays next. The player calls next() exactly when the current clip ends. */
export class BehaviorEngine {
  auto = true;
  /** It was stuck in `pose` - every clip out of it had broken - and dissolves into its start pose instead. */
  onStranded: (pose: PoseId) => void = () => {};
  private queue: Step[] = [];
  private current: Step | null = null;
  private readonly broken = new Set<ClipId>();
  private allowed: Set<PoseId> | null = null;   // the poses ticked in the panel; null = all
  private commanded: PoseId | null = null;      // a commanded pose may stay even when it is not ticked
  private visiting: { pose: PoseId; back: PoseId } | null = null;   // a pose it only drops in on (drinking at a reminder)
  private pounces: Set<PounceSide> | null = null;                 // the pounce sides ticked in the panel; null = both
  private dwellMs: number | null = null;   // auto mode rests about this long in a pose before moving on; null: a `stay` roll per idle
  private restSince = 0;                   // when it began resting in the pose it is in
  private restFor = 0;                     // how long it means to rest there this time
  private sleepiness = 1;                  // auto mode picks asleep poses this many times as often

  constructor(private readonly pack: Pack, private readonly rng: Rng, private readonly now: Clock = Date.now) {}

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
    if (this.visiting?.pose === pose) {
      // one idle came with the visit; after that it lingers as `stay` allows, then goes back - even with auto off
      if (this.rng() < (def.stay ?? DEFAULT_STAY)) return this.take(this.idleOf(pose, 0));
      const { back } = this.visiting;
      this.visiting = null;
      this.commanded = null;
      if (this.plan(back) || this.plan(this.pack.start)) return this.take(this.queue.shift()!);
      return this.dissolveHome(pose);
    }
    const mayStay = !this.allowed || this.allowed.has(pose) || pose === this.commanded;
    if (!this.auto || (mayStay && this.restsOn(def))) return this.take(this.autoPounce(pose) ?? this.idleOf(pose, 0));
    const target = this.pickTarget(pose);
    if (target && this.plan(target)) {
      if (this.pack.poses[target].brief) this.visiting = { pose: target, back: this.wayBack(pose) };
      return this.take(this.queue.shift()!);
    }
    if (!findPath(this.pack.edges, pose, this.pack.start, this.broken)) return this.dissolveHome(pose);
    return this.take(this.idleOf(pose, 0));
  }

  /** A clip the engine did not choose is playing (walking in); carry on from where it ends. */
  follow(step: Step): void {
    this.queue = [];
    this.commanded = null;
    this.visiting = null;
    this.current = step;
  }

  /** Replace whatever was queued with the shortest way to `target`, starting after the current clip. A brief pose is visited. */
  command(target: PoseId): boolean {
    if (this.pack.poses[target]?.brief) return this.visit(target);
    return this.go(target);
  }

  /** Go to `target` for a while and come back to the pose it was in (or was heading for). */
  visit(target: PoseId): boolean {
    const back = this.visiting?.back ?? this.wayBack();
    if (!this.go(target)) return false;
    this.visiting = { pose: target, back };
    return true;
  }

  /** Resting in `pose` (playing one of its idles) with nothing planned: a clip could be played in at once. */
  restingIn(pose: PoseId): boolean {
    const s = this.current;
    return !!s && s.from === pose && s.to === pose && (this.pack.poses[pose]?.idle ?? []).includes(s.clip) && !this.queue.length;
  }

  /** Play `clip` now instead of the idle it rests in (a pounce, a play-fight): only while resting in `pose` with nothing planned. */
  interject(clip: ClipId, pose: PoseId): Step | null {
    if (!this.restingIn(pose)) return null;
    return this.take(idleStep(this.pack, pose, clip));
  }

  /** A pounce from a menu or button: now if resting in `pose`, else queued for when it is back there. Null: not now. */
  perform(clip: ClipId, pose: PoseId): Step | null {
    const now = this.interject(clip, pose);
    if (now || !this.go(pose)) return now;
    const arrive = this.queue.pop()!;                               // the idle it would rest in: pounce instead
    this.queue.push({ ...idleStep(this.pack, pose, clip), fadeIn: arrive.fadeIn });
    return null;
  }

  /**
   * Auto mode only moves between these poses, and pounces only to these sides (`pounce:left` / `pounce:right`). Unknown or
   * transient ids are ignored; no pose left means every pose.
   */
  setAllowed(keys: string[] | null): void {
    const ok = (keys ?? []).filter(p => this.pack.poses[p] && !this.pack.poses[p].transient);
    this.allowed = ok.length ? new Set(ok) : null;
    this.pounces = keys ? new Set(keys.map(pounceSide).filter((s): s is PounceSide => s !== null)) : null;
  }

  /**
   * Auto mode rests in each pose about `seconds` (give or take DWELL_JITTER) before it moves on, deciding as each idle ends; null
   * goes back to a `stay` roll per idle. A pose with `stay: 0` is never rested in, and brief visits keep their `stay` rolls.
   */
  setDwell(seconds: number | null): void {
    const ms = seconds === null ? null : seconds * 1000;
    if (ms !== null) this.restFor = this.dwellMs !== null ? this.restFor * (ms / this.dwellMs) : this.pickRest(ms);
    this.dwellMs = ms;
  }

  /** Auto mode picks asleep poses `k` times as often as their weight says (after lunch, late at night). */
  setSleepiness(k: number): void { this.sleepiness = k; }

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

  /** Now and then, resting in the pounce pose in auto mode, a pounce to a ticked side instead of an idle. */
  private autoPounce(pose: PoseId): Step | null {
    const p = this.pack.pounce;
    if (!this.auto || !p?.autoChance || p.pose !== pose) return null;
    const sides = (['left', 'right'] as const).filter(s => !this.pounces || this.pounces.has(s));
    if (!sides.length || this.rng() >= p.autoChance) return null;
    const side = sides[Math.min(sides.length - 1, Math.floor(this.rng() * sides.length))];
    return idleStep(this.pack, pose, side === 'left' ? p.toLeft : p.toRight);
  }

  private take(step: Step): Step {
    if (step.from !== step.to && step.from === this.commanded) this.commanded = null;   // it left the commanded pose
    const prev = this.current;
    // an idle after a way in (a clip, a fade, walking in) or at the start: a new rest begins
    if (step.from === step.to && (!prev || prev.from !== prev.to || prev.to !== step.to)) {
      this.restSince = this.now();
      if (this.dwellMs !== null) this.restFor = this.pickRest(this.dwellMs);
    }
    this.current = step;
    return step;
  }

  /** Auto mode, at the end of an idle in an ordinary pose: rest on there? */
  private restsOn(def: PoseDef): boolean {
    if (this.dwellMs === null) return this.rng() < (def.stay ?? DEFAULT_STAY);
    return def.stay !== 0 && this.now() - this.restSince < this.restFor;
  }

  private pickRest(ms: number): number { return ms * (1 - DWELL_JITTER + 2 * DWELL_JITTER * this.rng()); }

  private go(target: PoseId): boolean {
    if (!findPath(this.pack.edges, this.endPose, target, this.broken)) return false;   // no way there: it carries on as it was
    this.queue = [];
    this.commanded = target;
    this.visiting = null;
    return this.plan(target);
  }

  private plan(target: PoseId): boolean {
    const path = findPath(this.pack.edges, this.endPose, target, this.broken);
    if (!path) return false;
    const { steps, pendingFade } = pathToSteps(this.pack, path);
    this.queue.push(...steps, this.idleOf(target, pendingFade));
    return true;
  }

  /**
   * Where a visit comes back to: the pose it rests in once what is planned has played (by default the pose it is in, or is on its
   * way to). Not a prop's pose, which it cannot rest in, nor a brief one, which it would not leave again: then its start pose.
   */
  private wayBack(pose = this.queue.length ? this.queue[this.queue.length - 1].to : this.endPose): PoseId {
    const def = this.pack.poses[pose];
    return def && !def.transient && !def.brief ? pose : this.pack.start;
  }

  /** Stuck in `pose` for good otherwise: dissolve into the start pose, as a prop's pose does. */
  private dissolveHome(pose: PoseId): Step {
    this.queue = [];
    this.visiting = null;
    this.commanded = null;
    this.onStranded(pose);
    return this.take(this.idleOf(this.pack.start, DISSOLVE_S));
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
      .filter(([id, p]) => id !== pose && !p.transient && (p.autoWeight ?? 1) > 0 && (!this.allowed || this.allowed.has(id)))
      .filter(([id]) => findPath(this.pack.edges, pose, id, this.broken) !== null);
    if (!candidates.length) return null;
    const weight = (p: PoseDef) => (p.autoWeight ?? 1) * (p.asleep ? this.sleepiness : 1);
    const total = candidates.reduce((s, [, p]) => s + weight(p), 0);
    let r = this.rng() * total;
    for (const [id, p] of candidates) {
      r -= weight(p);
      if (r < 0) return id;
    }
    return candidates[candidates.length - 1][0];
  }
}

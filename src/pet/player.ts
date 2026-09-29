import type { Step } from '../shared/graph';
import type { Pack } from '../shared/types';

const CROSSFADE_S = 0.12;
/** A local clip starts playing well within a second; one that has not after this has stalled (it may only be slow: not broken). */
const START_WAIT_MS = 5_000;
/** A clip not over by twice its own length plus this has stalled (no frames, no 'ended'). */
const STALL_SLACK_MS = 3_000;
/** No clip is anywhere near this long; one whose length the browser does not know is given this long. */
const LONGEST_CLIP_S = 60;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
type FrameVideo = HTMLVideoElement & { requestVideoFrameCallback(cb: () => void): number };
const firstFrame = (v: HTMLVideoElement) => Promise.race([
  new Promise<void>(r => (v as FrameVideo).requestVideoFrameCallback(() => r())),
  sleep(250),
]);
const seeked = (v: HTMLVideoElement) => (v.readyState >= 2 && !v.seeking ? Promise.resolve()
  : Promise.race([new Promise<void>(r => v.addEventListener('seeked', () => r(), { once: true })), sleep(300)]));
/** How long `v` may still take to play to its end at `rate` before it counts as stalled. */
const endWait = (v: HTMLVideoElement, rate: number) =>
  (Math.max(0, Math.min(v.duration, LONGEST_CLIP_S) - v.currentTime) / rate) * 2000 + STALL_SLACK_MS;

interface Current { step: Step; video: HTMLVideoElement; state: 'starting' | 'playing' | 'over' }

/** One <video> per clip; exactly one visible at a time. Only the clips that may play next hold a decoder. */
export class Player {
  onStepStart: (step: Step) => void = () => {};
  onEnded: () => void = () => {};
  onError: (clip: string) => void = () => {};
  /**
   * The current clip stalled - it did not start within START_WAIT_MS, or is not over by twice its length plus STALL_SLACK_MS - and
   * was given up on: what comes next is up to the listener, as after onEnded. Not an error: the clip may only have been slow.
   */
  onStall: (clip: string, why: string) => void = () => {};
  private readonly videos = new Map<string, HTMLVideoElement>();
  private readonly urls = new Map<string, string>();
  private current: Current | null = null;
  private token = 0;
  private z = 1;
  private paused = false;
  private watchdog: ReturnType<typeof setTimeout> | undefined;

  constructor(layer: HTMLElement, pack: Pack, packUrl: string) {
    for (const [id, def] of Object.entries(pack.clips)) {
      const v = document.createElement('video');
      v.dataset.clip = id;
      this.urls.set(id, new URL(def.file, packUrl).href);
      v.muted = true; v.playsInline = true; v.preload = 'auto';
      v.addEventListener('ended', () => {
        const c = this.current;
        if (c?.video === v && c.state !== 'over') { this.finish(c); this.onEnded(); }
      });
      v.addEventListener('error', () => {
        if (!v.hasAttribute('src')) return;
        if (this.current?.video === v) this.finish(this.current);
        this.onError(id);
      });
      layer.appendChild(v);
      this.videos.set(id, v);
    }
  }

  get step(): Step | null { return this.current?.step ?? null; }
  get video(): HTMLVideoElement | null { return this.current?.video ?? null; }

  /** The clip actually on screen: the previous one stays visible until the next has its first frame. */
  get shown(): HTMLVideoElement | null {
    let top: HTMLVideoElement | null = null;
    for (const v of this.videos.values()) {
      if (v.style.opacity === '1' && v.readyState >= 2 && (!top || Number(v.style.zIndex) > Number(top.style.zIndex))) top = v;
    }
    return top;
  }
  get progress(): number {
    const v = this.current?.video;
    return v && v.duration ? v.currentTime / v.duration : 0;
  }

  /** Load the clips that may play next; release the other hidden ones (each loaded clip holds ~35 MB of decoder). */
  keep(clips: string[]): void {
    for (const [id, v] of this.videos) {
      if (clips.includes(id)) this.load(id);
      else if (v !== this.current?.video && v.style.opacity !== '1' && v.hasAttribute('src')) {
        v.pause();
        v.removeAttribute('src');
        v.load();
      }
    }
  }

  async play(step: Step): Promise<void> {
    const token = ++this.token;
    clearTimeout(this.watchdog);
    const v = this.load(step.clip);
    const same = this.current?.video === v && v.style.opacity === '1';   // on screen already (not one that stalled unseen)
    const c: Current = { step, video: v, state: 'starting' };
    this.current = c;
    this.onStepStart(step);
    v.style.zIndex = String(++this.z);
    v.defaultPlaybackRate = step.rate;
    v.playbackRate = step.rate;
    v.currentTime = 0;
    if (!same) { v.style.transition = 'none'; v.style.opacity = '0'; }
    if (step.fadeIn > 0 && !same) {       // a prop appears or disappears: dissolve to this clip's first frame, then play
      await seeked(v);
      if (token !== this.token) return;
      v.style.transition = `opacity ${step.fadeIn}s linear`;
      void v.offsetWidth;
      v.style.opacity = '1';
      await sleep(step.fadeIn * 1000 + 20);
      if (token !== this.token) return;
    }
    if (this.paused) return;           // resume() starts it
    // a clip can stall with no error at all - never start, or never end: give it a while, then move on without it
    this.arm(token, START_WAIT_MS, '沒有開始播');
    try { await v.play(); } catch {
      // pause() cut it short: resume() starts it again; or its 'error' event has already told
      if (token !== this.token || this.paused || c.state === 'over') return;
      this.finish(c);
      this.onError(step.clip);
      return;
    }
    if (token !== this.token) return;
    c.state = 'playing';
    this.arm(token, endWait(v, step.rate), '沒有播完');
    await firstFrame(v);
    if (token !== this.token) return;
    const cross = same || step.fadeIn > 0 ? 0 : CROSSFADE_S;
    v.style.transition = cross ? `opacity ${cross}s linear` : 'none';
    v.style.opacity = '1';
    if (cross) await sleep(cross * 1000 + 10);
    if (token !== this.token) return;
    for (const o of this.videos.values()) {
      if (o !== v && o.style.opacity !== '0') { o.style.transition = 'none'; o.style.opacity = '0'; o.pause(); }
    }
  }

  pause(): void {
    this.paused = true;
    clearTimeout(this.watchdog);           // a paused clip is not a stalled one
    this.current?.video.pause();
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    const c = this.current;
    if (c?.state === 'starting') void this.play(c.step);   // paused before it began: begin it afresh
    else if (c?.state === 'playing') {
      void c.video.play();
      this.arm(this.token, endWait(c.video, c.step.rate), '沒有播完');
    }
  }

  /** If the step `token` has not got on (started, or ended) within `ms`, give it up: stop its clip and tell onStall. */
  private arm(token: number, ms: number, why: string): void {
    clearTimeout(this.watchdog);
    this.watchdog = setTimeout(() => {
      if (token !== this.token) return;
      const c = this.current!;
      this.token++;                        // whatever the step's play() still awaits comes to nothing
      this.finish(c);
      const v = c.video;
      const where = `停在 ${v.currentTime.toFixed(2)} 秒，readyState ${v.readyState}，networkState ${v.networkState}`;
      v.pause();                           // should it get going after all, it does not end over the next step
      this.onStall(c.step.clip, `${why}（${where}）`);
    }, ms);
  }

  private finish(c: Current): void {
    c.state = 'over';
    clearTimeout(this.watchdog);
  }

  private load(id: string): HTMLVideoElement {
    const v = this.videos.get(id)!;
    if (!v.hasAttribute('src')) v.src = this.urls.get(id)!;
    return v;
  }
}

import type { Step } from '../shared/graph';
import type { Pack } from '../shared/types';

const CROSSFADE_S = 0.12;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
type FrameVideo = HTMLVideoElement & { requestVideoFrameCallback(cb: () => void): number };
const firstFrame = (v: HTMLVideoElement) => Promise.race([
  new Promise<void>(r => (v as FrameVideo).requestVideoFrameCallback(() => r())),
  sleep(250),
]);
const seeked = (v: HTMLVideoElement) => (v.readyState >= 2 && !v.seeking ? Promise.resolve()
  : Promise.race([new Promise<void>(r => v.addEventListener('seeked', () => r(), { once: true })), sleep(300)]));

/** One <video> per clip; exactly one visible at a time. */
export class Player {
  onStepStart: (step: Step) => void = () => {};
  onEnded: () => void = () => {};
  onError: (clip: string) => void = () => {};
  private readonly videos = new Map<string, HTMLVideoElement>();
  private current: { step: Step; video: HTMLVideoElement } | null = null;
  private token = 0;
  private z = 1;

  constructor(layer: HTMLElement, pack: Pack, packUrl: string) {
    for (const [id, def] of Object.entries(pack.clips)) {
      const v = document.createElement('video');
      v.src = new URL(def.file, packUrl).href;
      v.muted = true; v.playsInline = true; v.preload = 'none';
      v.addEventListener('ended', () => { if (this.current?.video === v) this.onEnded(); });
      v.addEventListener('error', () => this.onError(id));
      layer.appendChild(v);
      this.videos.set(id, v);
    }
  }

  get step(): Step | null { return this.current?.step ?? null; }
  get video(): HTMLVideoElement | null { return this.current?.video ?? null; }
  get progress(): number {
    const v = this.current?.video;
    return v && v.duration ? v.currentTime / v.duration : 0;
  }

  preload(clips: string[]): void {
    for (const c of clips) {
      const v = this.videos.get(c);
      if (v && v.preload !== 'auto') { v.preload = 'auto'; v.load(); }
    }
  }

  async play(step: Step): Promise<void> {
    const token = ++this.token;
    const v = this.videos.get(step.clip)!;
    const same = this.current?.video === v;
    this.current = { step, video: v };
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
    try { await v.play(); } catch { if (token === this.token) this.onError(step.clip); return; }
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

  pause(): void { this.current?.video.pause(); }
  resume(): void { void this.current?.video.play(); }
}

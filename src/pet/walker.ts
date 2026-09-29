import type { WalkDef } from '../shared/types';
import type { WalkPlan } from '../shared/walk-plan';

interface FrameMeta { mediaTime: number }
type FrameVideo = HTMLVideoElement & { requestVideoFrameCallback(cb: (now: number, meta: FrameMeta) => void): number };

/** The source clips' frame rate: glide tracks have one entry per frame. */
const FPS = 24;

interface Frame { frameW: number; frameH: number; ground: number }

export interface WalkRun extends Frame {
  plan: WalkPlan;
  mirror: boolean;       // walking left: the pack's own left loop if it has one (walk.leftward), else the loop drawn flipped
  onFirstFrame?: () => void;
}

export interface ClipRun extends Frame {
  url: string;
  base: number;          // the frame's x when the clip starts
  glide?: number[];      // how far the frame has moved by each frame of the clip (shares of the frame width)
  onFirstFrame?: () => void;
}

/**
 * Draws walking onto a canvas: the loop (the cat stepping on the spot) while its frame glides along, and arrive / depart with
 * their own glide. Positions follow the video's clock, smoothed and worked out afresh on every display frame, so the cat moves
 * evenly even though the clips have fewer frames per second than the screen, and its planted paws stay put.
 */
export class Walker {
  /** Called with where each frame is drawn (the debug build records them for the tests). */
  onDraw: (origin: number) => void = () => {};
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly video: FrameVideo;
  private readonly leftVideo: FrameVideo | null;
  private readonly sources = new Map<string, FrameVideo>();
  private token = 0;

  /** `leftUrl`: the pack's own left-walking loop (walk.leftward), if it has one. */
  constructor(private readonly parent: HTMLElement, url: string, private readonly walk: WalkDef, leftUrl?: string) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'walk';
    parent.prepend(this.canvas);          // under the cat's own clips, so a clip that takes over simply covers the last drawn frame
    this.ctx = this.canvas.getContext('2d')!;
    this.video = this.source(url, true);
    this.leftVideo = leftUrl ? this.source(leftUrl, true) : null;
  }

  /** How long one loop lasts (at playback rate 1): the right loop, or with `left` the one walking left uses. */
  duration(left = false): Promise<number> {
    const v = left && this.leftVideo ? this.leftVideo : this.video;
    if (v.readyState >= 1 && v.duration) return Promise.resolve(v.duration);
    return new Promise(resolve => v.addEventListener('loadedmetadata', () => resolve(v.duration), { once: true }));
  }

  /** Start loading a clip that playClip() will want soon. */
  preload(url: string): void { this.source(url, false); }

  /** Walk the planned loops; resolves when the last one has ended (its final frame stays drawn until clear()). */
  run(r: WalkRun): Promise<void> {
    const rate = this.walk.rate ?? 1;
    const { start, end, loops, pxPerSec } = r.plan;
    const dir = Math.sign(end - start) || 1;
    const x = (media: number) => {
      const p = start + dir * pxPerSec * (media / rate);
      return dir > 0 ? Math.min(p, end) : Math.max(p, end);
    };
    const own = r.mirror && this.leftVideo;              // walking left with its own loop: drawn as it is
    return this.play(own || this.video, rate, true, loops, r, dir, x, () => end, own ? false : r.mirror, r.onFirstFrame);
  }

  /** Play a clip once (arrive, depart), its frame following the clip's glide track. */
  playClip(r: ClipRun): Promise<void> {
    const g = r.glide ?? [0];
    const at = (f: number) => {
      const i = Math.max(0, Math.min(g.length - 1, Math.floor(f)));
      const j = Math.min(g.length - 1, i + 1);
      return g[i] + (g[j] - g[i]) * Math.max(0, Math.min(1, f - i));
    };
    const x = (media: number) => r.base + at(media * FPS) * r.frameW;          // glide[k]: where the frame is at frame k
    const dir = Math.sign(g[g.length - 1]);
    return this.play(this.source(r.url, false), 1, false, 1, r, dir, x, () => r.base + g[g.length - 1] * r.frameW, false, r.onFirstFrame);
  }

  clear(): void {
    this.token++;
    for (const v of this.sources.values()) v.pause();
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.canvas.style.visibility = 'hidden';
  }

  /**
   * The shared engine: play `v` (`loops` times if looping) and draw it at `x(media seconds so far)`. Media seconds =
   * (display seconds + offset) x rate; each presented frame gives a reading of the offset, which jitters, so the offset follows
   * the readings slowly and the frame never moves against `dir`.
   */
  private play(v: FrameVideo, rate: number, looping: boolean, loops: number, f: Frame, dir: number,
               x: (media: number) => number, endX: () => number, mirror: boolean, onFirstFrame?: () => void): Promise<void> {
    const token = ++this.token;
    this.prepareCanvas();
    v.loop = looping;
    v.playbackRate = rate;
    v.currentTime = 0;
    let loop = 0;
    let lastMedia = -1;
    let offset: number | null = null;
    let lastX: number | null = null;
    let done = false;
    return new Promise(resolve => {
      const finish = () => {
        if (done) return;
        done = true;
        v.pause();
        this.draw(v, endX(), f, mirror);
        resolve();
      };
      const onFrame = (now: number, meta: FrameMeta) => {
        if (token !== this.token || done) return;
        if (meta.mediaTime < lastMedia - 0.05) loop++;          // the video wrapped round: the next loop starts
        lastMedia = meta.mediaTime;
        const reading = (loop * (v.duration || 1) + meta.mediaTime) / rate - now / 1000;
        if (offset === null) { offset = reading; onFirstFrame?.(); }
        else offset += (reading - offset) * 0.1;
        // after the last loop, this frame is the loop's first one again: the pose the next clip starts from
        if (looping && loop >= loops) { finish(); return; }
        v.requestVideoFrameCallback(onFrame);
      };
      const onDisplay = (now: number) => {
        if (token !== this.token || done) return;
        if (offset !== null) {
          const media = Math.min((now / 1000 + offset) * rate, loops * (v.duration || 1));
          const p = x(media);
          lastX = lastX === null || dir === 0 ? p : dir > 0 ? Math.max(lastX, p) : Math.min(lastX, p);
          this.draw(v, lastX, f, mirror);
        }
        requestAnimationFrame(onDisplay);
      };
      if (!looping) v.addEventListener('ended', () => { if (token === this.token) finish(); }, { once: true });
      v.requestVideoFrameCallback(onFrame);
      requestAnimationFrame(onDisplay);
      void v.play();
    });
  }

  private source(url: string, looping: boolean): FrameVideo {
    let v = this.sources.get(url);
    if (!v) {
      v = document.createElement('video') as FrameVideo;
      v.className = 'walk-source';
      v.muted = true; v.playsInline = true; v.loop = looping; v.preload = 'auto';
      v.src = url;
      this.parent.append(v);
      this.sources.set(url, v);
    }
    return v;
  }

  private prepareCanvas(): void {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(this.canvas.clientWidth * dpr);
    this.canvas.height = Math.round(this.canvas.clientHeight * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingQuality = 'high';
    this.canvas.style.visibility = 'visible';
  }

  private draw(v: HTMLVideoElement, origin: number, f: Frame, mirror: boolean): void {
    const { ctx, walk: w } = this;
    const { frameW: W, frameH: H } = f;
    this.onDraw(origin);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    // a soft shadow under the walking cat
    const centre = v === this.leftVideo ? w.leftward!.centerX : mirror ? 1 - w.centerX : w.centerX;
    const cx = origin + centre * W;
    ctx.fillStyle = 'rgba(0, 0, 0, .18)';
    ctx.beginPath();
    ctx.ellipse(cx, f.ground * H - 1, H * 0.25, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    if (mirror) {
      ctx.save();
      ctx.translate(origin + W, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(v, 0, 0, W, H);
      ctx.restore();
    } else {
      ctx.drawImage(v, origin, 0, W, H);
    }
  }
}

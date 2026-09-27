import type { WalkDef } from '../shared/types';
import type { WalkPlan } from '../shared/walk-plan';

interface FrameMeta { mediaTime: number }
type FrameVideo = HTMLVideoElement & { requestVideoFrameCallback(cb: (now: number, meta: FrameMeta) => void): number };

export interface WalkRun {
  plan: WalkPlan;
  frameW: number;
  frameH: number;
  ground: number;        // the ground line, as a share of the frame height (for the shadow)
  mirror: boolean;       // walking left: the loop drawn flipped
  onFirstFrame?: () => void;
}

/**
 * Draws the walking loop (the cat stepping on the spot) onto a canvas while its frame glides along. The position follows the
 * video's own clock - the frame callbacks say how far the loop has played - and is worked out afresh on every display frame, so
 * the cat moves smoothly even though the clip has fewer frames per second than the screen, and its planted paws stay put.
 */
export class Walker {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly video: FrameVideo;
  private token = 0;

  constructor(parent: HTMLElement, url: string, private readonly walk: WalkDef) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'walk';
    parent.prepend(this.canvas);          // under the cat's own clips, so a clip that takes over simply covers the last drawn frame
    this.ctx = this.canvas.getContext('2d')!;
    this.video = document.createElement('video') as FrameVideo;
    this.video.className = 'walk-source';
    this.video.muted = true; this.video.playsInline = true; this.video.loop = true; this.video.preload = 'auto';
    this.video.src = url;
    parent.append(this.video);
  }

  /** How long one loop lasts (at playback rate 1). */
  duration(): Promise<number> {
    const v = this.video;
    if (v.readyState >= 1 && v.duration) return Promise.resolve(v.duration);
    return new Promise(resolve => v.addEventListener('loadedmetadata', () => resolve(v.duration), { once: true }));
  }

  /** Walk the planned loops; resolves when the last one has ended (its final frame stays drawn until clear()). */
  run(r: WalkRun): Promise<void> {
    const token = ++this.token;
    const rate = this.walk.rate ?? 1;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(this.canvas.clientWidth * dpr);
    this.canvas.height = Math.round(this.canvas.clientHeight * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingQuality = 'high';
    this.canvas.style.visibility = 'visible';
    const v = this.video;
    v.playbackRate = rate;
    v.currentTime = 0;
    const { start, end, loops, pxPerSec } = r.plan;
    const dir = Math.sign(end - start) || 1;
    // the loop's clock: media seconds (all loops counted) = (display seconds + offset) x rate. Each presented frame gives a
    // reading of the offset; the readings jitter, so the offset follows them slowly, and the frame never moves backwards
    let loop = 0;
    let lastMedia = -1;
    let offset: number | null = null;
    let lastX = start;
    let done = false;
    const x = (media: number) => {
      const p = start + dir * pxPerSec * (media / rate);
      return dir > 0 ? Math.min(p, end) : Math.max(p, end);
    };
    return new Promise(resolve => {
      const onFrame = (now: number, meta: FrameMeta) => {
        if (token !== this.token || done) return;
        if (meta.mediaTime < lastMedia - 0.05) loop++;          // the video wrapped round: the next loop starts
        lastMedia = meta.mediaTime;
        const dur = v.duration || 1;
        const reading = (loop * dur + meta.mediaTime) / rate - now / 1000;
        if (offset === null) { offset = reading; r.onFirstFrame?.(); }
        else offset += (reading - offset) * 0.1;
        if (loop >= loops) {
          // the last loop is over and this frame is the loop's first one: the pose the next clip starts from, at `end`
          done = true;
          v.pause();
          this.draw(end, r);
          resolve();
          return;
        }
        v.requestVideoFrameCallback(onFrame);
      };
      const onDisplay = (now: number) => {
        if (token !== this.token || done) return;
        if (offset !== null) {
          const media = (now / 1000 + offset) * rate;
          const p = x(Math.min(media, loops * (v.duration || 1)));
          lastX = dir > 0 ? Math.max(lastX, p) : Math.min(lastX, p);
          this.draw(lastX, r);
        }
        requestAnimationFrame(onDisplay);
      };
      v.requestVideoFrameCallback(onFrame);
      requestAnimationFrame(onDisplay);
      void v.play();
    });
  }

  clear(): void {
    this.token++;
    this.video.pause();
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.canvas.style.visibility = 'hidden';
  }

  private draw(origin: number, r: WalkRun): void {
    const { ctx, walk: w } = this;
    const { frameW: W, frameH: H } = r;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    // a soft shadow under the walking cat
    const cx = origin + (r.mirror ? 1 - w.centerX : w.centerX) * W;
    ctx.fillStyle = 'rgba(0, 0, 0, .18)';
    ctx.beginPath();
    ctx.ellipse(cx, r.ground * H - 1, H * 0.25, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    if (r.mirror) {
      ctx.save();
      ctx.translate(origin + W, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(this.video, 0, 0, W, H);
      ctx.restore();
    } else {
      ctx.drawImage(this.video, origin, 0, W, H);
    }
  }
}

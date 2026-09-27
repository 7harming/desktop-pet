import type { WalkDef } from '../shared/types';

interface FrameMeta { mediaTime: number }
type FrameVideo = HTMLVideoElement & { requestVideoFrameCallback(cb: (now: number, meta: FrameMeta) => void): number };

export interface WalkRun {
  origins: number[];     // frame x (px, in the canvas) of each loop, from planWalkIn / planWalkOut
  frameW: number;
  frameH: number;
  ground: number;        // the ground line, as a share of the frame height (for the shadow)
  mirror: boolean;       // walking left: the loop drawn flipped
  onFirstFrame?: () => void;
}

/**
 * Draws the walking loop onto a canvas, loop after loop at the planned positions. Drawing each frame from the video's own frame
 * callback keeps the jump from one loop's end to the next loop's start on the same frame, so the joins do not show.
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

  /** Walk the loops; resolves once the last one has ended (its final frame stays drawn until clear()). */
  run(r: WalkRun): Promise<void> {
    const token = ++this.token;
    const w = this.walk;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(this.canvas.clientWidth * dpr);
    this.canvas.height = Math.round(this.canvas.clientHeight * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.canvas.style.visibility = 'visible';
    const v = this.video;
    v.playbackRate = w.rate ?? 1;
    v.currentTime = 0;
    const travel = (w.to - w.from) * r.frameW * (r.mirror ? -1 : 1);
    return new Promise(resolve => {
      let loop = 0;
      let last = -1;
      let first = true;
      const onFrame = (_now: number, meta: FrameMeta) => {
        if (token !== this.token) return;
        if (meta.mediaTime < last - 0.05) loop++;          // the video wrapped round: the next loop starts
        last = meta.mediaTime;
        const done = loop >= r.origins.length;
        // after the last loop, its successor's first frame is the pose the next clip starts from: draw it there and stop
        const origin = done ? r.origins[r.origins.length - 1] + travel : r.origins[loop];
        this.draw(origin, meta.mediaTime, r);
        if (first) { first = false; r.onFirstFrame?.(); }
        if (done) { v.pause(); resolve(); return; }
        v.requestVideoFrameCallback(onFrame);
      };
      if (!r.origins.length) { resolve(); return; }
      v.requestVideoFrameCallback(onFrame);
      void v.play();
    });
  }

  clear(): void {
    this.token++;
    this.video.pause();
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.canvas.style.visibility = 'hidden';
  }

  private draw(origin: number, t: number, r: WalkRun): void {
    const { ctx, walk: w } = this;
    const { frameW: W, frameH: H } = r;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    // a soft shadow under the cat, following it across the frame
    const k = this.video.duration ? Math.min(1, t / this.video.duration) : 0;
    const centre = w.from + (w.to - w.from) * k;
    const cx = origin + (r.mirror ? 1 - centre : centre) * W;
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

import type { Pack } from '../shared/types';

export interface WorkArea { x: number; y: number; width: number; height: number }
export type Bounds = WorkArea;

export function windowSize(pack: Pack, scale: number): { width: number; height: number } {
  const height = Math.round(pack.frame.displayHeight * scale);
  return { width: Math.round(height * pack.frame.aspect), height };
}

/** Window top while the cat stands on the taskbar (the start pose's ground line on the work-area bottom). */
export function restY(pack: Pack, scale: number, wa: WorkArea): number {
  const { height } = windowSize(pack, scale);
  return Math.round(wa.y + wa.height - pack.poses[pack.start].ground * height);
}

/** `xRatio` is where the start pose's body centre sits across the work area. */
export function windowBounds(pack: Pack, scale: number, xRatio: number, wa: WorkArea): Bounds {
  const { width, height } = windowSize(pack, scale);
  const bodyX = wa.x + xRatio * wa.width;
  const x = Math.round(bodyX - pack.poses[pack.start].centerX * width);
  const clamped = Math.min(Math.max(x, wa.x), wa.x + Math.max(0, wa.width - width));
  return { x: clamped, y: restY(pack, scale, wa), width, height };
}

export function xRatioFromBounds(b: { x: number; width: number }, pack: Pack, wa: WorkArea): number {
  const bodyX = b.x + pack.poses[pack.start].centerX * b.width;
  return Math.min(1, Math.max(0, (bodyX - wa.x) / wa.width));
}

export function bodyWidth(pack: Pack, scale: number): number {
  return windowSize(pack, scale).width * 0.35;
}

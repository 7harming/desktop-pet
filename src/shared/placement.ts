export interface Span { center: number; width: number }

const overlaps = (a: Span, b: Span) => Math.abs(a.center - b.center) < (a.width + b.width) / 2;

/** Nearest body-centre (px) to `want` that does not overlap any other cat: search right, then left, else give up. */
export function findFreeCenter(others: Span[], want: number, width: number, min: number, max: number, step = 10): number {
  const free = (c: number) => !others.some(o => overlaps({ center: c, width }, o));
  const start = Math.min(max, Math.max(min, want));
  if (free(start)) return start;
  for (let c = start + step; c <= max; c += step) if (free(c)) return c;
  for (let c = start - step; c >= min; c -= step) if (free(c)) return c;
  return start;
}

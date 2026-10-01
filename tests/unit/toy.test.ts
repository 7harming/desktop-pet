import { describe, it, expect } from 'vitest';
import { swatDir, ToyInterest } from '../../src/shared/toy';

const head = { x: 500, y: 400 };
describe('swatDir', () => {
  it('splits the space round the head into five', () => {
    expect(swatDir(head, { x: 600, y: 420 })).toBe('right');      // a little below, beside
    expect(swatDir(head, { x: 600, y: 360 })).toBe('right');      // up to 22.5 degrees above
    expect(swatDir(head, { x: 560, y: 320 })).toBe('upRight');
    expect(swatDir(head, { x: 510, y: 300 })).toBe('up');
    expect(swatDir(head, { x: 440, y: 320 })).toBe('upLeft');
    expect(swatDir(head, { x: 380, y: 410 })).toBe('left');
    expect(swatDir(head, { x: 500, y: 520 })).toBeNull();          // straight below: under its chin
  });
});

describe('ToyInterest', () => {
  const make = () => new ToyInterest({ notice: 300, reach: 180, boredMs: 5000 });
  it('watches a feather moving near it, swats one in reach, and tires once it stops', () => {
    const t = make();
    expect(t.update(head, { x: 750, y: 300 }, 400, 0)).toEqual({ do: 'watch' });     // 270 px off: noticed
    expect(t.update(head, { x: 750, y: 300 }, 400, 100)).toBeNull();                 // still watching, out of reach
    expect(t.update(head, { x: 520, y: 280 }, 400, 200)).toEqual({ do: 'swat', dir: 'up' });
    expect(t.update(head, { x: 520, y: 280 }, 0, 300)).toBeNull();                   // stopped: no swat
    expect(t.update(head, { x: 520, y: 280 }, 0, 5199)).toBeNull();
    expect(t.update(head, { x: 520, y: 280 }, 0, 5200)).toEqual({ do: 'bored' });    // 5 s after it last moved
    expect(t.update(head, { x: 520, y: 280 }, 0, 5300)).toBeNull();
  });
  it('does not notice a feather far away, or one that does not move', () => {
    const t = make();
    expect(t.update(head, { x: 900, y: 400 }, 400, 0)).toBeNull();
    expect(t.update(head, { x: 520, y: 300 }, 50, 100)).toBeNull();
  });
  it('tires of a feather that moves away out of notice', () => {
    const t = make();
    t.update(head, { x: 600, y: 300 }, 400, 0);
    expect(t.update(head, { x: 1200, y: 300 }, 400, 5000)).toEqual({ do: 'bored' });
  });
});

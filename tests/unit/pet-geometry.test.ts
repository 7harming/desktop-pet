import { describe, it, expect } from 'vitest';
import { windowSize, restY, windowBounds, xRatioFromBounds, bodyWidth } from '../../src/main/pet-geometry';
import { makePack } from './fixtures';

const pack = makePack();                                  // displayHeight 300, aspect 16:9, start centerX 0.34, ground 0.9
const wa = { x: 0, y: 0, width: 1920, height: 1040 };

describe('pet geometry', () => {
  it('sizes the window from the pack and scale', () => {
    expect(windowSize(pack, 1)).toEqual({ width: 533, height: 300 });
    expect(windowSize(pack, 1.3)).toEqual({ width: 693, height: 390 });
  });
  it('puts the ground line on the taskbar', () => {
    expect(restY(pack, 1, wa)).toBe(1040 - 270);
  });
  it('places the body centre at the saved ratio and round-trips it', () => {
    const b = windowBounds(pack, 1, 0.5, wa);
    expect(b).toEqual({ x: 960 - 181, y: 770, width: 533, height: 300 });
    expect(xRatioFromBounds(b, pack, wa)).toBeCloseTo(0.5, 3);
  });
  it('keeps the window inside the work area', () => {
    expect(windowBounds(pack, 1, 0, wa).x).toBe(0);
    expect(windowBounds(pack, 1, 1, wa).x).toBe(1920 - 533);
  });
  it('estimates the body width for placement', () => {
    expect(bodyWidth(pack, 1)).toBeCloseTo(186.55);
  });
});

import { describe, it, expect } from 'vitest';
import { findFreeCenter } from '../../src/shared/placement';

describe('findFreeCenter', () => {
  it('keeps the wanted spot when it is free', () => {
    expect(findFreeCenter([{ center: 100, width: 100 }], 400, 100, 0, 1000)).toBe(400);
  });
  it('moves right past an overlapping cat', () => {
    expect(findFreeCenter([{ center: 400, width: 100 }], 420, 100, 0, 1000)).toBe(500);
  });
  it('tries the left side when the right is full', () => {
    expect(findFreeCenter([{ center: 900, width: 200 }], 950, 100, 0, 1000)).toBe(750);
  });
  it('gives up and overlaps when there is no room at all', () => {
    expect(findFreeCenter([{ center: 50, width: 100 }], 60, 100, 50, 100)).toBe(60);
  });
});

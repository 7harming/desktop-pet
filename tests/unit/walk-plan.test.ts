import { describe, it, expect } from 'vitest';
import { planWalkIn, planWalkOut } from '../../src/shared/walk-plan';
import { makePack } from './fixtures';

// the test walk: the loop goes from centre 0.21875 to 0.78125 (0.5625 frame widths), the cat is 0.3125 wide
const walk = makePack().walk!;
const W = 533;
const travel = 0.5625 * W;

describe('planWalkIn', () => {
  it('starts off the left edge and chains loops so the last one ends where arrive begins', () => {
    const origins = planWalkIn(walk, W, 700);
    expect(origins.length).toBe(4);
    origins.forEach((o, i) => expect(o).toBeCloseTo(700 - (4 - i) * travel));
    // at the start the cat's right edge is off screen
    expect(origins[0] + (walk.from + walk.width / 2) * W).toBeLessThanOrEqual(0);
  });
  it('walks at least one loop even when the resting spot is near the left edge', () => {
    expect(planWalkIn(walk, W, -300).length).toBe(1);
  });
});

describe('planWalkOut', () => {
  it('picks up where depart ends and walks left until the cat is off screen', () => {
    const origins = planWalkOut(walk, W, 700);
    // the mirrored loop starts with the cat centred where depart left it
    expect(origins[0] + (1 - walk.from) * W).toBeCloseTo(700 + walk.departX * W);
    origins.forEach((o, i) => expect(o).toBeCloseTo(origins[0] - i * travel));
    expect(origins.length).toBe(4);
    const last = origins[origins.length - 1];
    expect(last + (1 - walk.from + walk.width / 2) * W).toBeGreaterThan(0);          // still visible when it starts
    expect(last - travel + (1 - walk.from + walk.width / 2) * W).toBeLessThanOrEqual(0); // the next one would be off screen
  });
});

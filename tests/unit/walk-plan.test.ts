import { describe, it, expect } from 'vitest';
import { planWalkIn, planWalkOut } from '../../src/shared/walk-plan';
import { makePack } from './fixtures';

// the test walk: the cat walks on the spot centred at 0.34375 of the frame, 0.3125 frame widths wide, and its frame moves
// 1 frame width per second at rate 1; the loop lasts 1 s and plays at rate 3
const walk = makePack().walk!;
const W = 533;
const LOOP_SECS = 1;
const perLoop = walk.speed * LOOP_SECS * W;      // how far the frame moves during one loop

describe('planWalkIn', () => {
  it('starts off the left edge and walks whole loops, so the last one ends where arrive begins', () => {
    const p = planWalkIn(walk, W, 700, LOOP_SECS);
    expect(p.end).toBe(700);
    expect(p.loops).toBe(Math.ceil((700 + (walk.centerX + walk.width / 2) * W) / perLoop));
    expect(p.start).toBeCloseTo(700 - p.loops * perLoop);
    expect(p.start + (walk.centerX + walk.width / 2) * W).toBeLessThanOrEqual(0);    // the cat starts off screen
    expect(p.pxPerSec).toBeCloseTo(walk.speed * walk.rate! * W);                      // on screen it moves at speed x rate
  });
  it('walks at least one loop even when the resting spot is near the left edge', () => {
    expect(planWalkIn(walk, W, -400, LOOP_SECS).loops).toBe(1);
  });
});

describe('planWalkOut', () => {
  it('picks up where depart ends and walks left until the cat is off screen', () => {
    const p = planWalkOut(walk, W, 700, LOOP_SECS);
    // mirrored, the loop's cat is centred at 1 - centerX; it starts where depart left it
    expect(p.start + (1 - walk.centerX) * W).toBeCloseTo(700 + walk.departX * W);
    expect(p.end).toBeCloseTo(p.start - p.loops * perLoop);
    expect(p.end + (1 - walk.centerX + walk.width / 2) * W).toBeLessThanOrEqual(0);           // off screen at the end
    expect(p.end + perLoop + (1 - walk.centerX + walk.width / 2) * W).toBeGreaterThan(0);     // not a loop more than needed
  });

  it('walks a left loop of its own unmirrored, at its own speed and centre', () => {
    const w = { ...walk, departX: 0.5, leftward: { loop: 'walk_left', centerX: 0.5, width: 0.4, speed: 0.5 } };
    const per = 0.5 * LOOP_SECS * W;
    const p = planWalkOut(w, W, 700, LOOP_SECS);
    expect(p.start + 0.5 * W).toBeCloseTo(700 + 0.5 * W);                  // its cat (centred at 0.5) starts where depart left it
    expect(p.end).toBeCloseTo(p.start - p.loops * per);
    expect(p.end + (0.5 + 0.2) * W).toBeLessThanOrEqual(0);
    expect(p.end + per + (0.5 + 0.2) * W).toBeGreaterThan(0);
    expect(p.pxPerSec).toBeCloseTo(0.5 * walk.rate! * W);
  });
});

import { describe, it, expect } from 'vitest';
import { poseValueAt, showsShadow, isAsleep, smooth } from '../../src/shared/pose-geometry';
import { makePack } from './fixtures';

const pack = makePack();
const goPerch = { clip: 'go_perch', from: 'restProp', to: 'perch', rate: 0.8, fadeIn: 0.5 };

describe('pose geometry', () => {
  it('uses the start pose before anything plays', () => {
    expect(poseValueAt(pack, null, 0, 'centerX')).toBe(0.34);
  });
  it('eases between poses during a transition', () => {
    expect(smooth(0.5)).toBe(0.5);
    expect(poseValueAt(pack, goPerch, 0, 'centerX')).toBe(0.34);
    expect(poseValueAt(pack, goPerch, 0.5, 'centerX')).toBeCloseTo(0.545);
    expect(poseValueAt(pack, goPerch, 1, 'centerX')).toBe(0.75);
  });
  it('shows a shadow only when both ends have one', () => {
    expect(showsShadow(pack, null)).toBe(true);
    expect(showsShadow(pack, goPerch)).toBe(false);
  });
  it('knows asleep poses', () => {
    expect(isAsleep(pack, 'perch')).toBe(true);
    expect(isAsleep(pack, 'rest')).toBe(false);
  });
});

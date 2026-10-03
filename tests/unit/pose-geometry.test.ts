import { describe, it, expect } from 'vitest';
import { actionExtent, fitsAt, poseValueAt, restExtent, showsShadow, isAsleep, sleepPoses, smooth } from '../../src/shared/pose-geometry';
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
  it('lists the poses it can sleep in: asleep, neither passing nor visited', () => {
    const p = makePack();
    expect(sleepPoses(p)).toEqual(['perch']);
    p.poses.sit.asleep = true; p.poses.sit.brief = true;
    expect(sleepPoses(p)).toEqual(['perch']);
  });
});

describe('room for what a cat does', () => {
  it('knows how wide an action is: a pose, or a pounce to one side from its pose', () => {
    const p = makePack();
    p.poses.perch.right = 0.95;
    p.pounce!.left = 0.05; p.pounce!.right = 0.8;
    expect(actionExtent(p, 'perch')).toEqual([0.1875, 0.95]);
    expect(actionExtent(p, 'pounce:left')).toEqual([0.05, 0.5]);
    expect(actionExtent(p, 'pounce:right')).toEqual([0.1875, 0.8]);
    delete p.poses.sit.left;
    expect(actionExtent(p, 'sit')[0]).toBe(0);                     // a pose without an extent may use the whole frame
  });
  it('always keeps room for its start pose, sitting up, the wand and walking - not for the rest', () => {
    // 小昭 rested about 390 px from the right edge at most: room was kept for her box and pillow, which she rarely uses
    const p = makePack();
    p.poses.perch.right = 0.95;                                    // like the box: far to the right
    p.poses.sit.left = 0.1;                                        // sitting up (alert, the wand)
    p.toy!.right = 0.6;
    p.walk!.right = 0.55;
    p.pounce!.right = 0.8; p.fight!.right = 0.9;
    expect(restExtent(p)).toEqual([0.1, 0.6]);
  });
  it('says whether an action has room where the frame is', () => {
    const p = makePack();
    p.poses.perch.right = 0.95;
    // a 533 px frame at x 1500 on a 1920 px screen: the perch (to x 2006) reaches past the edge, resting (to x 1767) does not
    expect(fitsAt(actionExtent(p, 'perch'), 1500, 533, 1920)).toBe(false);
    expect(fitsAt(actionExtent(p, 'rest'), 1500, 533, 1920)).toBe(true);
    expect(fitsAt(actionExtent(p, 'perch'), 500, 533, 1920)).toBe(true);
    expect(fitsAt(actionExtent(p, 'rest'), -150, 533, 1920)).toBe(false);   // off the left edge
  });
});

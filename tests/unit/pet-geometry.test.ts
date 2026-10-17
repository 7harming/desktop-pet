import { describe, it, expect } from 'vitest';
import { windowSize, restY, windowBounds, xRatioFromBounds, bodyWidth, extentOf, cardBounds, cardWidth, layoutCards } from '../../src/main/pet-geometry';
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
  it('lets the empty part of the window go past the screen edge, but not the cat', () => {
    // everything the test cat draws lies between 18.75% and 50% of the frame width
    expect(windowBounds(pack, 1, 1, wa, [0.1875, 0.5]).x).toBe(1920 - 267);
    expect(windowBounds(pack, 1, 0, wa, [0.1875, 0.5]).x).toBe(-99);
  });
  it('covers what the cat always needs room for, and a pose it is about to go to', () => {
    const p = makePack();
    p.poses.perch.right = 0.9;                           // like the box: not kept room for where it rests
    p.walk!.left = 0.15; p.walk!.right = 0.55;
    expect(extentOf(p)).toEqual([0.15, 0.55]);
    expect(extentOf(p, ['perch'])).toEqual([0.15, 0.9]);
  });
  it('covers a pounce only to the side it goes', () => {
    const p = makePack(); p.pounce!.left = 0.05; p.pounce!.right = 0.8;
    expect(extentOf(p)).toEqual([0.1875, 0.5]);
    expect(extentOf(p, ['pounce:right'])).toEqual([0.1875, 0.8]);
  });
  it('estimates the body width for placement', () => {
    expect(bodyWidth(pack, 1)).toBeCloseTo(186.55);
  });
});

describe('cardBounds', () => {
  const wa = { x: 0, y: 0, width: 1000, height: 700 };
  it('centres the card over the head, its bottom on the head', () => {
    expect(cardBounds({ x: 500, y: 400 }, 186, 150, wa)).toEqual({ x: 407, y: 250, width: 186, height: 150 });
  });
  it('keeps the card inside the work area', () => {
    expect(cardBounds({ x: 980, y: 100 }, 186, 150, wa)).toEqual({ x: 814, y: 0, width: 186, height: 150 });
    expect(cardBounds({ x: 10, y: 400 }, 186, 150, wa).x).toBe(0);
  });
});

describe('layoutCards', () => {
  const wa = { x: 0, y: 0, width: 1000, height: 700 };
  const card = (x: number, y = 250, height = 150) => ({ x, y, width: 186, height });
  it('leaves cards that do not overlap where they are', () => {
    expect(layoutCards([card(100), card(400)], wa)).toEqual([card(100), card(400)]);
    expect(layoutCards([card(100, 0), card(150, 400)], wa)).toEqual([card(100, 0), card(150, 400)]);
  });
  it('stands two that would overlap side by side, touching, around the middle of the two', () => {
    expect(layoutCards([card(500), card(400, 280)], wa)).toEqual([card(543), card(357, 280)]);
    expect(layoutCards([card(400), card(400)], wa)).toEqual([card(307), card(493)]);   // both over the one cat
  });
  it('keeps a pair inside the work area', () => {
    expect(layoutCards([card(814), card(800)], wa)).toEqual([card(814), card(628)]);
  });
  it('lines up three that overlap, in the order of their middles, around the middle of them all', () => {
    const wheel = (x: number, y = 250) => ({ x, y, width: 242, height: 200 });
    // todo and the wheel over one cat, the memo over a cat beside it
    const out = layoutCards([card(400), wheel(372), card(450)], wa);
    expect(out.map(b => b.x)).toEqual([203, 389, 631]);   // centres 493, 493, 543: the row, 614 wide, round their mean 509.67
    expect(out[1].x).toBe(out[0].x + 186);
    expect(out[2].x).toBe(out[1].x + 242);
  });
  it('lines up only the ones that overlap', () => {
    const out = layoutCards([card(0), card(700), card(720)], wa);
    expect(out[0].x).toBe(0);
    expect(out[2].x).toBe(out[1].x + 186);
  });
  it('keeps a row of cards of two widths inside the work area', () => {
    const out = layoutCards([card(814), { x: 760, y: 250, width: 242, height: 200 }], wa);
    expect(out[1].x + 242 + 186).toBeLessThanOrEqual(1000);
    expect(out[0].x).toBe(out[1].x + 242);
  });
});

describe('cardWidth', () => {
  it('draws the dinner wheel 1.3 times as wide; the others stay 186', () => {
    expect(cardWidth('todo')).toBe(186);
    expect(cardWidth('memo')).toBe(186);
    expect(cardWidth('dinner')).toBe(242);
  });
});

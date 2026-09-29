import { describe, it, expect } from 'vitest';
import { closestPair, fightClip } from '../../src/shared/fight';

describe('closestPair', () => {
  it('pairs two cats up to one body apart, the left one first', () => {
    const b = { id: 'b', left: 300, right: 400 };
    expect(closestPair([b, { id: 'a', left: 100, right: 200 }])).toEqual({ left: 'a', right: 'b', gap: 100 });
    expect(closestPair([b, { id: 'a', left: 90, right: 190 }])).toBeNull();          // 110 apart: more than a body
  });
  it('counts overlapping cats as close', () => {
    expect(closestPair([{ id: 'a', left: 100, right: 300 }, { id: 'b', left: 250, right: 450 }])?.gap).toBe(-50);
  });
  it('picks the closest two of more', () => {
    const cats = [{ id: 'a', left: 0, right: 100 }, { id: 'b', left: 150, right: 250 }, { id: 'c', left: 260, right: 360 }];
    expect(closestPair(cats)).toMatchObject({ left: 'b', right: 'c' });
  });
  it('needs two cats', () => {
    expect(closestPair([{ id: 'a', left: 0, right: 100 }])).toBeNull();
  });
});

describe('fightClip', () => {
  it('faces the side the other cat is on', () => {
    const f = { pose: 'rest', toLeft: 'l', toRight: 'r', left: 0, right: 1 };
    expect([fightClip(f, 'left'), fightClip(f, 'right')]).toEqual(['l', 'r']);
  });
});

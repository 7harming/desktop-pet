import { describe, it, expect } from 'vitest';
import { addDish, defaultDinner, DEFAULT_DISHES, dishToAvoid, normalizeDinner, pickDish, recordDish, removeDish, renameDish, spinTo, type Dinner } from '../../src/shared/dinner';
import { constRng } from './fixtures';

const at = (y: number, m: number, d: number, h = 18) => new Date(y, m - 1, d, h).getTime();
const dinner = (items: string[], last: Dinner['last'] = null, prev: Dinner['prev'] = null): Dinner => ({ items, last, prev });

describe('the menu', () => {
  it('adds a dish, trimmed, up to six characters, once, up to twelve', () => {
    expect(addDish(['便當', '拉麵'], ' 水餃 ')).toEqual({ items: ['便當', '拉麵', '水餃'] });
    expect(addDish(['便當', '拉麵'], '   ')).toEqual({ error: '先輸入菜色' });
    expect(addDish(['便當', '拉麵'], '麥當勞大麥克')).toEqual({ items: ['便當', '拉麵', '麥當勞大麥克'] });
    expect(addDish(['便當', '拉麵'], '麥當勞大麥克餐')).toEqual({ error: '最多 6 個字' });
    expect(addDish(['便當', '拉麵'], '拉麵')).toEqual({ error: '已經有了' });
    const twelve = Array.from({ length: 12 }, (_, i) => `菜${i}`);
    expect(addDish(twelve, '水餃')).toEqual({ error: '最多 12 樣' });
  });
  it('renames a dish in its place, by the same rules', () => {
    expect(renameDish(['便當', '拉麵', '水餃'], '拉麵', '鍋貼')).toEqual({ items: ['便當', '鍋貼', '水餃'] });
    expect(renameDish(['便當', '拉麵'], '拉麵', '拉麵 ')).toEqual({ items: ['便當', '拉麵'] });   // itself is no clash
    expect(renameDish(['便當', '拉麵'], '拉麵', '便當')).toEqual({ error: '已經有了' });
    expect(renameDish(['便當', '拉麵'], '拉麵', '')).toEqual({ error: '先輸入菜色' });
    expect(renameDish(['便當', '拉麵'], '水餃', '鍋貼')).toEqual({ error: '找不到這道菜' });
  });
  it('removes a dish but keeps two', () => {
    expect(removeDish(['便當', '拉麵', '水餃'], '拉麵')).toEqual({ items: ['便當', '水餃'] });
    expect(removeDish(['便當', '拉麵'], '拉麵')).toEqual({ error: '至少要留兩樣' });
    expect(removeDish(['便當', '拉麵', '水餃'], '火鍋')).toEqual({ error: '找不到這道菜' });
  });
});

describe('normalizeDinner', () => {
  it('starts with the default menu', () => {
    expect(normalizeDinner(undefined)).toEqual({ items: DEFAULT_DISHES, last: null, prev: null });
    expect(defaultDinner().items).not.toBe(DEFAULT_DISHES);   // a copy: changing it leaves the defaults alone
  });
  it('drops broken dishes and days, keeps twelve at most, and falls back to the defaults under two', () => {
    const raw = { items: ['便當', ' 拉麵 ', '便當', '', 7, '麥當勞大麥克餐', '水餃'], last: { day: '2026-10-16', dish: '拉麵' }, prev: { day: 3 } };
    expect(normalizeDinner(raw)).toEqual({ items: ['便當', '拉麵', '水餃'], last: { day: '2026-10-16', dish: '拉麵' }, prev: null });
    expect(normalizeDinner({ items: Array.from({ length: 15 }, (_, i) => `菜${i}`) }).items).toHaveLength(12);
    expect(normalizeDinner({ items: ['便當'] }).items).toEqual(DEFAULT_DISHES);
  });
});

describe("yesterday's dish", () => {
  it("is yesterday's last spin, whether or not the wheel turned today", () => {
    const yesterday = { day: '2026-10-16', dish: '拉麵' };
    expect(dishToAvoid(dinner(['便當', '拉麵'], yesterday), at(2026, 10, 17))).toBe('拉麵');
    expect(dishToAvoid(dinner(['便當', '拉麵'], { day: '2026-10-17', dish: '便當' }, yesterday), at(2026, 10, 17))).toBe('拉麵');
  });
  it('is none from the day before yesterday, nor one no longer on the menu', () => {
    expect(dishToAvoid(dinner(['便當', '拉麵'], { day: '2026-10-15', dish: '拉麵' }), at(2026, 10, 17))).toBeNull();
    expect(dishToAvoid(dinner(['便當', '水餃'], { day: '2026-10-16', dish: '拉麵' }), at(2026, 10, 17))).toBeNull();
  });
  it('counts days as the reminders do: past midnight is still the evening before, and across months', () => {
    expect(dishToAvoid(dinner(['便當', '拉麵'], { day: '2026-10-16', dish: '拉麵' }), at(2026, 10, 18, 1))).toBe('拉麵');
    expect(dishToAvoid(dinner(['便當', '拉麵'], { day: '2026-10-31', dish: '拉麵' }), at(2026, 11, 1))).toBe('拉麵');
  });
});

describe('pickDish', () => {
  it("picks evenly, never yesterday's dish", () => {
    const d = dinner(['便當', '拉麵', '水餃'], { day: '2026-10-16', dish: '拉麵' });
    expect(pickDish(d, at(2026, 10, 17), constRng(0))).toBe('便當');
    expect(pickDish(d, at(2026, 10, 17), constRng(0.999))).toBe('水餃');
    expect(pickDish(dinner(['便當', '拉麵'], { day: '2026-10-16', dish: '便當' }), at(2026, 10, 17), constRng(0))).toBe('拉麵');
    expect(pickDish(dinner(['便當', '拉麵']), at(2026, 10, 17), constRng(0.6))).toBe('拉麵');
  });
});

describe('recordDish', () => {
  it("keeps the day's last spin, and the day before's once a new day starts", () => {
    const d1 = recordDish(dinner(['便當', '拉麵']), '便當', at(2026, 10, 16));
    expect(d1).toMatchObject({ last: { day: '2026-10-16', dish: '便當' }, prev: null });
    const d2 = recordDish(d1, '拉麵', at(2026, 10, 16, 19));   // a second spin the same day
    expect(d2).toMatchObject({ last: { day: '2026-10-16', dish: '拉麵' }, prev: null });
    const d3 = recordDish(d2, '便當', at(2026, 10, 17));
    expect(d3).toMatchObject({ last: { day: '2026-10-17', dish: '便當' }, prev: { day: '2026-10-16', dish: '拉麵' } });
    expect(dishToAvoid(d3, at(2026, 10, 17))).toBe('拉麵');
  });
});

describe('spinTo', () => {
  it('turns at least five times and stops with the slice under the pointer at the top', () => {
    const r = spinTo(0, 2, 8);
    expect(r).toBeGreaterThanOrEqual(5 * 360);
    expect(r).toBeLessThan(6 * 360);
    const under = (rot: number, n: number) => Math.floor((((360 - (rot % 360)) % 360) / (360 / n)));
    expect(under(r, 8)).toBe(2);
    const again = spinTo(r, 7, 8);
    expect(again - r).toBeGreaterThanOrEqual(5 * 360);
    expect(under(again, 8)).toBe(7);
    expect(under(spinTo(again, 0, 2), 2)).toBe(0);
  });
});

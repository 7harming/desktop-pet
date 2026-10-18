import { describe, it, expect } from 'vitest';
import { mayReload, pageName } from '../../src/main/process-watch';

describe('pageName', () => {
  it("names the app's pages as the log does", () => {
    expect(pageName('app://local/ui/panel.html')).toBe('控制面板');
    expect(pageName('app://local/ui/card.html')).toBe('卡片');
    expect(pageName('app://local/ui/toy.html?x=1')).toBe('逗貓棒');
    expect(pageName('app://local/ui/break.html#a')).toBe('休息畫面');
    expect(pageName('app://local/ui/pet.html')).toBe('貓咪視窗');
    expect(pageName('')).toBe('某個頁面');
  });
});

describe('mayReload', () => {
  it('lets a page be loaded again three times a minute, then no more till the minute is past', () => {
    const times: number[] = [];
    expect([0, 1_000, 2_000, 3_000].map(t => mayReload(times, t))).toEqual([true, true, true, false]);
    expect(mayReload(times, 61_000)).toBe(true);   // the first is over a minute old
  });
});

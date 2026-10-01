import { describe, it, expect } from 'vitest';
import { AwayWatch } from '../../src/shared/away';

describe('AwayWatch', () => {
  it('is away once the computer has had no input for the set minutes, and back at the next input', () => {
    const w = new AwayWatch(5);
    expect(w.update(60)).toBeNull();
    expect(w.update(299)).toBeNull();
    expect(w.update(300)).toBe('away');
    expect(w.away).toBe(true);
    expect(w.update(900)).toBeNull();                    // still away: said once
    expect(w.update(0)).toBe('back');
    expect(w.away).toBe(false);
    expect(w.update(2)).toBeNull();
  });

  it('never counts as away when switched off, and a user away is back once it is', () => {
    const w = new AwayWatch(0);
    expect(w.update(99_999)).toBeNull();
    w.setMinutes(3);
    expect(w.update(200)).toBe('away');
    w.setMinutes(0);
    expect(w.update(400)).toBe('back');
  });
});

import { describe, it, expect } from 'vitest';
import { actionKey, pounceSide } from '../../src/shared/actions';

describe('action keys', () => {
  it('names a pose command by its pose and a pounce by its side', () => {
    expect(actionKey({ label: '坐下', pose: 'sit' })).toBe('sit');
    expect(actionKey({ label: '向左撲', pounce: 'left' })).toBe('pounce:left');
    expect(pounceSide('pounce:right')).toBe('right');
    expect(pounceSide('sit')).toBeNull();
  });
});

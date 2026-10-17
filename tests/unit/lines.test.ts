import { describe, it, expect } from 'vitest';
import { pickLine, clickLine, commandLine, dishLine, reminderLine } from '../../src/shared/lines';
import { makePack, constRng } from './fixtures';

const pack = makePack();

describe('lines', () => {
  it('picks by rng and never runs past the end', () => {
    expect(pickLine(['a', 'b'], constRng(0))).toBe('a');
    expect(pickLine(['a', 'b'], constRng(0.999999))).toBe('b');
    expect(pickLine(['a', 'b'], constRng(1))).toBe('b');
  });
  it('uses pose-specific click lines with a default', () => {
    expect(clickLine(pack, 'perch', constRng(0))).toBe('zzz');
    expect(clickLine(pack, 'sit', constRng(0))).toBe('……');
  });
  it('returns command and reminder lines', () => {
    expect(commandLine(pack, 'perch')).toBe('（盯）');
    expect(commandLine(pack, 'sit')).toBeNull();
    expect(reminderLine(pack, 'water', 'perch')).toBe('（夢中）喝水。');
    expect(reminderLine(pack, 'eyes', 'perch')).toBe('休息眼睛。');
  });
  it('says the dish in one of its dinner lines, or a plain one', () => {
    expect(dishLine(pack, '拉麵', constRng(0))).toBe('今晚吃拉麵！');
    const own = makePack(); own.lines.dinner = ['……{dish}吧。', '就{dish}，{dish}！'];
    expect(dishLine(own, '拉麵', constRng(0.9))).toBe('就拉麵，拉麵！');
  });
});

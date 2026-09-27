import { describe, it, expect, vi } from 'vitest';
import { petMenuTemplate } from '../../src/main/menus';

const handlers = () => ({ command: vi.fn(), setAuto: vi.fn(), setScale: vi.fn(), resetPosition: vi.fn(), hide: vi.fn() });

describe('petMenuTemplate', () => {
  it('lists the commands, then auto, size, reset and hide', () => {
    const h = handlers();
    const t = petMenuTemplate({ commands: [{ label: '休息', pose: 'rest' }, { label: '上台子', pose: 'perch' }], auto: true, scale: 1 }, h);
    expect(t.map(i => i.label ?? i.type)).toEqual(['休息', '上台子', 'separator', '自動行動', '大小', '放回工作列', '先收起來']);
    expect(t[3]).toMatchObject({ type: 'checkbox', checked: true });
    const sizes = t[4].submenu as any[];
    expect(sizes.map(s => [s.label, s.checked])).toEqual([['小', false], ['中', true], ['大', false]]);
    (t[1] as any).click(); (t[3] as any).click(); sizes[2].click(); (t[5] as any).click(); (t[6] as any).click();
    expect(h.command).toHaveBeenCalledWith('perch');
    expect(h.setAuto).toHaveBeenCalledWith(false);
    expect(h.setScale).toHaveBeenCalledWith(1.3);
    expect(h.resetPosition).toHaveBeenCalled();
    expect(h.hide).toHaveBeenCalled();
  });
});

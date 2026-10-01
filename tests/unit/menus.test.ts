import { describe, it, expect, vi } from 'vitest';
import { petMenuTemplate, trayMenuTemplate } from '../../src/main/menus';

const handlers = () => ({ command: vi.fn(), setAuto: vi.fn(), setScale: vi.fn(), resetPosition: vi.fn(), hide: vi.fn(), openCard: vi.fn(), toggleToy: vi.fn() });

describe('petMenuTemplate', () => {
  it('lists the commands, then auto, size, reset and hide', () => {
    const h = handlers();
    const t = petMenuTemplate({ commands: [{ label: '休息', pose: 'rest' }, { label: '上台子', pose: 'perch' }], auto: true, scale: 1, cards: [], toy: null }, h);
    const putBack = process.platform === 'darwin' ? '放回 Dock 上方' : '放回工作列';   // the Mac has a Dock, not a taskbar
    expect(t.map(i => i.label ?? i.type)).toEqual(['休息', '上台子', 'separator', '自動行動', '大小', putBack, '先收起來']);
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
  it('offers the cards after the commands', () => {
    const h = handlers();
    const t = petMenuTemplate({ commands: [{ label: '休息', pose: 'rest' }], auto: false, scale: 1,
      cards: [{ kind: 'todo', label: '提醒事項' }, { kind: 'memo', label: '備忘錄' }], toy: null }, h);
    expect(t.slice(0, 5).map(i => i.label ?? i.type)).toEqual(['休息', 'separator', '提醒事項', '備忘錄', 'separator']);
    (t[3] as any).click();
    expect(h.openCard).toHaveBeenCalledWith('memo');
  });
  it('offers to take the wand out, or put it away, with the cards', () => {
    const h = handlers();
    const base = { commands: [{ label: '休息', pose: 'rest' }], auto: false, scale: 1, cards: [{ kind: 'todo' as const, label: '提醒事項' }] };
    const out = petMenuTemplate({ ...base, toy: 'in' }, h);
    expect(out.slice(0, 5).map(i => i.label ?? i.type)).toEqual(['休息', 'separator', '提醒事項', '拿出逗貓棒', 'separator']);
    (out[3] as any).click();
    expect(h.toggleToy).toHaveBeenCalled();
    expect(petMenuTemplate({ ...base, toy: 'out' }, h)[3].label).toBe('收起逗貓棒');
  });
});

describe('trayMenuTemplate', () => {
  const h = () => ({ openPanel: vi.fn(), togglePet: vi.fn(), hideAll: vi.fn(), pauseReminders: vi.fn(), resumeReminders: vi.fn(), setAutoStart: vi.fn(), quit: vi.fn(), toggleToy: vi.fn() });
  it('lists the panel, each cat, hide all, reminders, autostart and quit', () => {
    const t = trayMenuTemplate([{ id: 'a', name: '小昭', visible: true }], { now: 0, pausedUntil: null, autoStart: true, toy: null }, h());
    expect(t.map(i => i.label ?? i.type)).toEqual(['打開控制面板', 'separator', '小昭', '全部收起來', 'separator', '提醒暫停 1 小時', '開機自動啟動', 'separator', '結束']);
    expect(t[2]).toMatchObject({ type: 'checkbox', checked: true });
  });
  it('offers to resume while paused', () => {
    const handlers = h();
    const until = new Date(2026, 8, 27, 15, 30).getTime();
    const t = trayMenuTemplate([], { now: until - 1000, pausedUntil: until, autoStart: false, toy: null }, handlers);
    const item = t.find(i => i.label?.startsWith('恢復提醒'))!;
    expect(item.label).toBe('恢復提醒（目前暫停到 15:30）');
    (item as any).click();
    expect(handlers.resumeReminders).toHaveBeenCalled();
  });
  it('offers the wand after putting the cats away', () => {
    const handlers = h();
    const t = trayMenuTemplate([{ id: 'a', name: '小昭', visible: true }], { now: 0, pausedUntil: null, autoStart: true, toy: 'in' }, handlers);
    expect(t.map(i => i.label ?? i.type).slice(2, 5)).toEqual(['小昭', '全部收起來', '拿出逗貓棒']);
    (t[4] as any).click();
    expect(handlers.toggleToy).toHaveBeenCalled();
  });
});

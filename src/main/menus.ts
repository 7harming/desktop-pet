import type { MenuItemConstructorOptions } from 'electron';
import { SIZE_PRESETS } from '../shared/settings';

export const SIZE_ITEMS: [string, number][] = [['小', SIZE_PRESETS.s], ['中', SIZE_PRESETS.m], ['大', SIZE_PRESETS.l]];
const PUT_BACK = process.platform === 'darwin' ? '放回 Dock 上方' : '放回工作列';

/** `commands`: each named by its action key (a pose, or `pounce:left` / `pounce:right`). */
export interface PetMenuState { commands: { label: string; pose: string }[]; auto: boolean; scale: number }
export interface PetMenuHandlers {
  command(pose: string): void;
  setAuto(on: boolean): void;
  setScale(scale: number): void;
  resetPosition(): void;
  hide(): void;
}

export function petMenuTemplate(s: PetMenuState, h: PetMenuHandlers): MenuItemConstructorOptions[] {
  return [
    ...s.commands.map(c => ({ label: c.label, click: () => h.command(c.pose) })),
    { type: 'separator' },
    { label: '自動行動', type: 'checkbox', checked: s.auto, click: () => h.setAuto(!s.auto) },
    {
      label: '大小',
      submenu: SIZE_ITEMS.map(([label, v]) => ({ label, type: 'radio' as const, checked: Math.abs(s.scale - v) < 0.01, click: () => h.setScale(v) })),
    },
    { label: PUT_BACK, click: () => h.resetPosition() },
    { label: '先收起來', click: () => h.hide() },
  ];
}

export interface TrayHandlers {
  openPanel(): void;
  togglePet(id: string): void;
  hideAll(): void;
  pauseReminders(): void;
  resumeReminders(): void;
  setAutoStart(on: boolean): void;
  quit(): void;
}

const hhmm = (t: number) => {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export function trayMenuTemplate(pets: { id: string; name: string; visible: boolean }[],
  s: { now: number; pausedUntil: number | null; autoStart: boolean }, h: TrayHandlers): MenuItemConstructorOptions[] {
  const paused = s.pausedUntil !== null && s.pausedUntil > s.now;
  return [
    { label: '打開控制面板', click: () => h.openPanel() },
    { type: 'separator' },
    ...pets.map(p => ({ label: p.name, type: 'checkbox' as const, checked: p.visible, click: () => h.togglePet(p.id) })),
    { label: '全部收起來', click: () => h.hideAll() },
    { type: 'separator' },
    paused
      ? { label: `恢復提醒（目前暫停到 ${hhmm(s.pausedUntil!)}）`, click: () => h.resumeReminders() }
      : { label: '提醒暫停 1 小時', click: () => h.pauseReminders() },
    { label: '開機自動啟動', type: 'checkbox', checked: s.autoStart, click: () => h.setAutoStart(!s.autoStart) },
    { type: 'separator' },
    { label: '結束', click: () => h.quit() },
  ];
}

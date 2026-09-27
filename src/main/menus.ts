import type { MenuItemConstructorOptions } from 'electron';
import { SIZE_PRESETS } from '../shared/settings';
import type { Command } from '../shared/types';

export const SIZE_ITEMS: [string, number][] = [['小', SIZE_PRESETS.s], ['中', SIZE_PRESETS.m], ['大', SIZE_PRESETS.l]];

export interface PetMenuState { commands: Command[]; auto: boolean; scale: number }
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
    { label: '放回工作列', click: () => h.resetPosition() },
    { label: '先收起來', click: () => h.hide() },
  ];
}

import { describe, it, expect } from 'vitest';
import { defaultSettings, normalizeSettings } from '../../src/shared/settings';

describe('normalizeSettings', () => {
  it('shows only the first cat on a fresh install', () => {
    const { settings } = normalizeSettings(undefined, ['xiaozhao', 'mimi']);
    expect(settings.petOrder).toEqual(['xiaozhao', 'mimi']);
    expect(settings.pets.xiaozhao).toEqual({ visible: true, scale: 1, auto: true, x: null });
    expect(settings.pets.mimi.visible).toBe(false);
    expect(settings.firstRunDone).toBe(false);
    expect(settings.reminders).toEqual(defaultSettings().reminders);
  });
  it('keeps saved values, clamps bad ones and hides newly added cats', () => {
    const raw = { firstRunDone: true, autoStart: false, petOrder: ['gone', 'xiaozhao'],
      pets: { xiaozhao: { visible: true, scale: 9, auto: false, x: 1.4 } },
      reminders: { water: 30, stretch: 17, eyes: 90, notify: false, pausedUntil: 123 } };
    const { settings } = normalizeSettings(raw, ['xiaozhao', 'mimi']);
    expect(settings.petOrder).toEqual(['xiaozhao', 'mimi']);
    expect(settings.pets.xiaozhao).toEqual({ visible: true, scale: 1.5, auto: false, x: 1 });
    expect(settings.pets.mimi.visible).toBe(false);
    expect(settings.autoStart).toBe(false);
    expect(settings.reminders).toEqual({ water: 30, stretch: 60, eyes: 90, notify: false, pausedUntil: 123 });
  });
  it('warns when the file content is not an object', () => {
    expect(normalizeSettings([], ['a']).warnings).toEqual(['設定檔格式不對，已改用預設值']);
  });
});

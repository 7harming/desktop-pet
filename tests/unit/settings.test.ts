import { describe, it, expect } from 'vitest';
import { defaultSettings, normalizeSettings } from '../../src/shared/settings';

describe('normalizeSettings', () => {
  it('shows only the first cat on a fresh install', () => {
    const { settings } = normalizeSettings(undefined, ['xiaozhao', 'mimi']);
    expect(settings.petOrder).toEqual(['xiaozhao', 'mimi']);
    expect(settings.pets.xiaozhao).toEqual({ visible: true, scale: 1, auto: true, x: null, actions: null });
    expect(settings.pets.mimi.visible).toBe(false);
    expect(settings.firstRunDone).toBe(false);
    expect(settings.reminders).toEqual(defaultSettings().reminders);
    expect(settings.actionInterval).toBe(30);
    expect(settings.fightAuto).toBe(true);
    expect(normalizeSettings({ fightAuto: false }, ['a']).settings.fightAuto).toBe(false);
  });
  it('keeps a saved action interval that is one of the choices', () => {
    expect(normalizeSettings({ actionInterval: 60 }, ['a']).settings.actionInterval).toBe(60);
    expect(normalizeSettings({ actionInterval: 45 }, ['a']).settings.actionInterval).toBe(30);
  });
  it('lets a cat shrink to 0.4', () => {
    expect(normalizeSettings({ pets: { a: { scale: 0.4 } } }, ['a']).settings.pets.a.scale).toBe(0.4);
    expect(normalizeSettings({ pets: { a: { scale: 0.1 } } }, ['a']).settings.pets.a.scale).toBe(0.4);
  });
  it('keeps saved values, clamps bad ones and hides newly added cats', () => {
    const raw = { firstRunDone: true, autoStart: false, petOrder: ['gone', 'xiaozhao'],
      pets: { xiaozhao: { visible: true, scale: 9, auto: false, x: 1.4, actions: ['sit', 7, 'lie'] }, mimi: { actions: 'all' } },
      reminders: { water: 30, stretch: 17, eyes: 90, notify: false, pausedUntil: 123 } };
    const { settings } = normalizeSettings(raw, ['xiaozhao', 'mimi']);
    expect(settings.petOrder).toEqual(['xiaozhao', 'mimi']);
    expect(settings.pets.xiaozhao).toEqual({ visible: true, scale: 1.5, auto: false, x: 1, actions: ['sit', 'lie'] });
    expect(settings.pets.mimi.actions).toBeNull();
    expect(settings.pets.mimi.visible).toBe(false);
    expect(settings.autoStart).toBe(false);
    expect(settings.reminders).toEqual({ water: 30, stretch: 60, eyes: 90, notify: false, pausedUntil: 123 });
  });
  it('warns when the file content is not an object', () => {
    expect(normalizeSettings([], ['a']).warnings).toEqual(['設定檔格式不對，已改用預設值']);
  });
});

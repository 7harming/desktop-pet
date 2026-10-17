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
  it('counts the user away after 5 minutes unless told otherwise', () => {
    expect(normalizeSettings(undefined, ['a']).settings.awayMinutes).toBe(5);
    expect(normalizeSettings({ awayMinutes: 0 }, ['a']).settings.awayMinutes).toBe(0);
    expect(normalizeSettings({ awayMinutes: 10 }, ['a']).settings.awayMinutes).toBe(10);
    expect(normalizeSettings({ awayMinutes: 7 }, ['a']).settings.awayMinutes).toBe(5);
  });
  it('pops the cards up by themselves at these times unless told otherwise', () => {
    const { cards } = normalizeSettings(undefined, ['a']).settings;
    expect(cards.memo).toEqual({ start: true, resume: true, unlock: true, back: true, daily: 540 });
    expect(cards.todo).toEqual({ start: true, resume: true, unlock: true, back: false, daily: 540 });
    expect(cards.dinner).toEqual({ start: false, resume: false, unlock: false, back: false, daily: 17 * 60 + 30 });
    expect(normalizeSettings({ cards: { dinner: { daily: 18 * 60, start: true } } }, ['a']).settings.cards.dinner)
      .toEqual({ start: true, resume: false, unlock: false, back: false, daily: 18 * 60 });
    const raw = { cards: { memo: { start: false, back: 'yes', daily: null }, todo: { daily: 615 } } };
    const s = normalizeSettings(raw, ['a']).settings.cards;
    expect(s.memo).toEqual({ start: false, resume: true, unlock: true, back: true, daily: null });
    expect(s.todo.daily).toBe(540);      // not on the tens
    expect(normalizeSettings({ cards: { todo: { daily: 1430 } } }, ['a']).settings.cards.todo.daily).toBe(1430);
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

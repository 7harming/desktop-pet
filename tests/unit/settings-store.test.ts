import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger } from '../../src/main/logger';
import { SettingsStore } from '../../src/main/settings-store';

const setup = () => {
  const dir = mkdtempSync(join(tmpdir(), 'dpet-set-'));
  return { dir, file: join(dir, 'settings.json'), store: new SettingsStore(join(dir, 'settings.json'), new Logger(join(dir, 'logs'))) };
};

describe('SettingsStore', () => {
  it('starts from defaults when there is no file, and round-trips', () => {
    const { store } = setup();
    const { settings, warning } = store.load(['testcat']);
    expect(warning).toBeNull();
    settings.pets.testcat.x = 0.3;
    store.save(settings);
    expect(store.load(['testcat']).settings.pets.testcat.x).toBe(0.3);
  });
  it('backs up a broken file and falls back to defaults', () => {
    const { dir, file, store } = setup();
    writeFileSync(file, '{ broken');
    const { settings, warning } = store.load(['testcat']);
    expect(warning).toBe('設定檔損壞，已備份成 settings.bad.json 並改用預設值');
    expect(existsSync(join(dir, 'settings.bad.json'))).toBe(true);
    expect(settings.pets.testcat.visible).toBe(true);
  });
  it('flush writes a pending save immediately', () => {
    const { file, store } = setup();
    const { settings } = store.load(['testcat']);
    settings.autoStart = false;
    store.saveSoon(settings, 10_000);
    store.flush(settings);
    expect(JSON.parse(readFileSync(file, 'utf8')).autoStart).toBe(false);
  });
});

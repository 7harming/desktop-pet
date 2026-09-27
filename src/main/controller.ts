import { ipcMain, screen, type WebContents } from 'electron';
import { findFreeCenter } from '../shared/placement';
import { DEFAULT_X, type Settings } from '../shared/settings';
import type { Pack } from '../shared/types';
import type { Logger } from './logger';
import { loadPacks, type LoadedPack } from './pack-loader';
import { bodyWidth, restY, windowBounds, xRatioFromBounds, type WorkArea } from './pet-geometry';
import { PetWindow, type PetEvents } from './pet-window';
import type { AppPaths } from './paths';
import { SettingsStore } from './settings-store';

const PET_CHANNELS = ['pet:ready', 'pet:set-interactive', 'pet:move', 'pet:drag-end', 'pet:menu', 'pet:status', 'pet:reminder-result', 'pet:log'];
const MAX_CRASH_RESTARTS = 3;

type ValidPack = LoadedPack & { pack: Pack };

export class AppController {
  readonly packs: LoadedPack[];
  settings: Settings;
  warning: string | null;
  readonly pets = new Map<string, PetWindow>();
  readonly status = new Map<string, string>();
  protected readonly store: SettingsStore;
  private readonly crashes = new Map<string, number>();

  constructor(protected readonly paths: AppPaths, readonly log: Logger, readonly debug: boolean) {
    this.packs = loadPacks(paths.packsDir);
    for (const p of this.packs) {
      if (p.pack) log.info(`載入寵物包 ${p.id}`);
      else log.warn(`寵物包 ${p.id} 無法使用：${p.errors.join('；')}`);
    }
    this.store = new SettingsStore(paths.settingsFile, log);
    const loaded = this.store.load(this.validPacks().map(p => p.id));
    this.settings = loaded.settings;
    this.warning = loaded.warning;
    for (const ch of PET_CHANNELS) ipcMain.on(ch, (e, ...args) => this.petFor(e.sender)?.handle(ch, args));
  }

  validPacks(): ValidPack[] { return this.packs.filter((p): p is ValidPack => p.pack !== null); }
  packOf(id: string): Pack | null { return this.validPacks().find(p => p.id === id)?.pack ?? null; }
  workArea(): WorkArea { return screen.getPrimaryDisplay().workArea; }

  start(): void {
    for (const id of this.settings.petOrder) if (this.settings.pets[id]?.visible) this.showPet(id);
    this.saveSoon();
  }

  showPet(id: string): void {
    const pack = this.packOf(id);
    if (!pack || this.pets.has(id)) return;
    const ps = this.settings.pets[id];
    const wa = this.workArea();
    const others = [...this.pets.values()].map(w => ({
      center: wa.x + xRatioFromBounds(w.win.getBounds(), w.pack, wa) * wa.width,
      width: bodyWidth(w.pack, this.settings.pets[w.id].scale),
    }));
    const want = wa.x + (ps.x ?? DEFAULT_X) * wa.width;
    const center = findFreeCenter(others, want, bodyWidth(pack, ps.scale), wa.x, wa.x + wa.width);
    ps.x = (center - wa.x) / wa.width;
    ps.visible = true;
    const pet = new PetWindow(pack, windowBounds(pack, ps.scale, ps.x, wa),
      { auto: ps.auto, restY: restY(pack, ps.scale, wa), debug: this.debug }, this.petEvents(), this.paths.uiDir);
    this.pets.set(id, pet);
    this.saveSoon();
    this.changed();
  }

  hidePet(id: string): void {
    this.pets.get(id)?.close();
    this.pets.delete(id);
    if (this.settings.pets[id]) this.settings.pets[id].visible = false;
    this.status.delete(id);
    this.saveSoon();
    this.changed();
  }

  saveSoon(): void { this.store.saveSoon(this.settings); }
  flush(): void { this.store.flush(this.settings); }

  /** Hook for later tasks (panel and tray refresh). */
  protected changed(): void {}

  protected petEvents(): PetEvents {
    return {
      status: (id, label) => { this.status.set(id, label); this.changed(); },
      menu: id => this.onPetMenu(id),
      dragEnd: id => this.onDragEnd(id),
      reminderResult: (id, type, result) => this.onReminderResult(id, type, result),
      crashed: id => this.onCrashed(id),
      log: (id, level, message) => this.log[level](`[${id}] ${message}`),
    };
  }

  protected onPetMenu(_id: string): void {}
  protected onReminderResult(_id: string, _type: string, _result: string): void {}

  private onDragEnd(id: string): void {
    const pet = this.pets.get(id);
    const ps = this.settings.pets[id];
    if (!pet || !ps) return;
    const wa = this.workArea();
    ps.x = xRatioFromBounds(pet.win.getBounds(), pet.pack, wa);
    pet.setBounds(windowBounds(pet.pack, ps.scale, ps.x, wa));
    this.saveSoon();
  }

  private onCrashed(id: string): void {
    const n = (this.crashes.get(id) ?? 0) + 1;
    this.crashes.set(id, n);
    this.log.error(`貓咪視窗 ${id} 當掉了（第 ${n} 次）`);
    this.pets.get(id)?.close();
    this.pets.delete(id);
    if (n <= MAX_CRASH_RESTARTS) this.showPet(id);
    else { this.settings.pets[id].visible = false; this.saveSoon(); this.changed(); }
  }

  private petFor(sender: WebContents): PetWindow | undefined {
    for (const p of this.pets.values()) if (!p.win.isDestroyed() && p.win.webContents === sender) return p;
    return undefined;
  }
}

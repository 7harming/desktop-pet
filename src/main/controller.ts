import { app, ipcMain, Menu, screen, type WebContents } from 'electron';
import { join } from 'node:path';
import type { PanelAction, PanelState } from '../shared/ipc';
import { findFreeCenter } from '../shared/placement';
import { DEFAULT_X, MAX_SCALE, MIN_SCALE, type Settings } from '../shared/settings';
import type { Pack } from '../shared/types';
import { APP_ORIGIN } from './app-protocol';
import type { Logger } from './logger';
import { petMenuTemplate, trayMenuTemplate } from './menus';
import { loadPacks, type LoadedPack } from './pack-loader';
import { PanelWindow } from './panel-window';
import { bodyWidth, restY, windowBounds, xRatioFromBounds, type WorkArea } from './pet-geometry';
import { PetWindow, type PetEvents } from './pet-window';
import type { AppPaths } from './paths';
import { SettingsStore } from './settings-store';
import { TrayController } from './tray';

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
  protected readonly panel: PanelWindow;
  private tray: TrayController | null = null;

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
    this.panel = new PanelWindow(paths.uiDir);
    ipcMain.handle('panel:get-state', () => this.panelState());
    ipcMain.handle('panel:act', (_e, a: PanelAction) => this.act(a));
  }

  validPacks(): ValidPack[] { return this.packs.filter((p): p is ValidPack => p.pack !== null); }
  packOf(id: string): Pack | null { return this.validPacks().find(p => p.id === id)?.pack ?? null; }
  workArea(): WorkArea { return screen.getPrimaryDisplay().workArea; }

  start(): void {
    const first = this.validPacks()[0];
    this.tray = new TrayController(first ? join(first.dir, first.pack.portrait) : null, () => this.trayMenu(), () => this.openPanel());
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

  protected changed(): void {
    this.tray?.refresh();
    this.panel.push(this.panelState());
  }

  openPanel(): void { this.panel.open(); }

  panelState(): PanelState {
    const r = this.settings.reminders;
    return {
      pets: this.packs.map(p => {
        const ps = this.settings.pets[p.id];
        return {
          id: p.id,
          name: p.pack?.name ?? p.id,
          personality: p.pack?.personality ?? '',
          portraitUrl: p.pack ? `${APP_ORIGIN}/packs/${p.id}/${p.pack.portrait}` : null,
          errors: p.errors,
          visible: this.pets.has(p.id),
          scale: ps?.scale ?? 1,
          auto: ps?.auto ?? true,
          status: this.status.get(p.id) ?? '',
          commands: p.pack?.commands ?? [],
        };
      }),
      reminders: { water: r.water, stretch: r.stretch, eyes: r.eyes, notify: r.notify, pausedUntil: r.pausedUntil },
      autoStart: this.settings.autoStart,
      version: app.getVersion(),
      warning: this.warning,
    };
  }

  act(a: PanelAction): PanelState {
    switch (a.kind) {
      case 'pet':
        if (a.visible === true) this.showPet(a.id);
        if (a.visible === false) this.hidePet(a.id);
        if (a.auto !== undefined) this.setAuto(a.id, a.auto);
        if (a.scale !== undefined) this.setScale(a.id, a.scale);
        break;
      case 'command': this.command(a.id, a.pose); break;
      case 'reminders': this.setReminders(a); break;
      case 'testReminder': this.testReminder(); break;
      case 'autoStart': this.setAutoStart(a.on); break;
      case 'resetPositions': this.resetAllPositions(); break;
    }
    return this.panelState();
  }

  hideAll(): void { for (const id of [...this.pets.keys()]) this.hidePet(id); }

  resetAllPositions(): void {
    for (const ps of Object.values(this.settings.pets)) ps.x = null;
    const visible = [...this.pets.keys()];
    for (const id of visible) this.pets.get(id)?.close();
    this.pets.clear();
    for (const id of this.settings.petOrder) if (visible.includes(id)) this.showPet(id);
  }

  setAutoStart(on: boolean): void { this.settings.autoStart = on; this.applyAutoStart(); this.saveSoon(); this.changed(); }
  quit(): void { app.quit(); }

  // Filled in by Task 13 / Task 14.
  protected applyAutoStart(): void {}
  setReminders(_patch: { water?: number; stretch?: number; eyes?: number; notify?: boolean }): void {}
  testReminder(): void {}
  pauseReminders(): void {}
  resumeReminders(): void {}

  private trayMenu() {
    return trayMenuTemplate(
      this.validPacks().map(p => ({ id: p.id, name: p.pack.name, visible: this.pets.has(p.id) })),
      { now: Date.now(), pausedUntil: this.settings.reminders.pausedUntil, autoStart: this.settings.autoStart },
      {
        openPanel: () => this.openPanel(),
        togglePet: id => (this.pets.has(id) ? this.hidePet(id) : this.showPet(id)),
        hideAll: () => this.hideAll(),
        pauseReminders: () => this.pauseReminders(),
        resumeReminders: () => this.resumeReminders(),
        setAutoStart: on => this.setAutoStart(on),
        quit: () => this.quit(),
      });
  }

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

  protected onPetMenu(id: string): void {
    const pet = this.pets.get(id);
    const ps = this.settings.pets[id];
    if (!pet || !ps) return;
    Menu.buildFromTemplate(petMenuTemplate({ commands: pet.pack.commands, auto: ps.auto, scale: ps.scale }, {
      command: pose => this.command(id, pose),
      setAuto: on => this.setAuto(id, on),
      setScale: s => this.setScale(id, s),
      resetPosition: () => this.resetPosition(id),
      hide: () => this.hidePet(id),
    })).popup({ window: pet.win });
  }

  command(id: string, pose: string): void { this.pets.get(id)?.send('pet:command', pose); }

  setAuto(id: string, on: boolean): void {
    const ps = this.settings.pets[id];
    if (!ps) return;
    ps.auto = on;
    const pet = this.pets.get(id);
    pet?.updateInit({ auto: on });
    pet?.send('pet:set-auto', on);
    this.saveSoon();
    this.changed();
  }

  setScale(id: string, scale: number): void {
    const ps = this.settings.pets[id];
    if (!ps) return;
    ps.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
    const pet = this.pets.get(id);
    if (pet) {
      const wa = this.workArea();
      pet.setBounds(windowBounds(pet.pack, ps.scale, ps.x ?? DEFAULT_X, wa));
      const y = restY(pet.pack, ps.scale, wa);
      pet.updateInit({ restY: y });
      pet.send('pet:rest-y', y);
    }
    this.saveSoon();
    this.changed();
  }

  /** Put a cat back on the taskbar at its saved spot (rescues a cat dragged somewhere odd). */
  resetPosition(id: string): void {
    const pet = this.pets.get(id);
    const ps = this.settings.pets[id];
    if (!pet || !ps) return;
    pet.setBounds(windowBounds(pet.pack, ps.scale, ps.x ?? DEFAULT_X, this.workArea()));
  }

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

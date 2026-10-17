import { app, ipcMain, Menu, Notification, powerMonitor, screen, type WebContents } from 'electron';
import { join } from 'node:path';
import { actionKey } from '../shared/actions';
import { AwayWatch } from '../shared/away';
import { closestPair } from '../shared/fight';
import type { FightState, PanelAction, PanelState } from '../shared/ipc';
import { reminderLine } from '../shared/lines';
import { cardsOf } from '../shared/pack';
import { findFreeCenter } from '../shared/placement';
import { ReminderScheduler } from '../shared/reminders';
import { ACTION_INTERVALS, AWAY_CHOICES, DEFAULT_X, MAX_SCALE, MIN_SCALE, normalizeCardSettings, REMINDER_CHOICES, type Settings } from '../shared/settings';
import { clockEvents, dayPart, helloDay, helloEvent, type DayPart } from '../shared/time-events';
import type { Pack, ReminderType, TimeEvent } from '../shared/types';
import { APP_ORIGIN } from './app-protocol';
import { BreakWindow } from './break-window';
import { CardController } from './cards';
import { ToyController } from './toys';
import type { Logger } from './logger';
import { petMenuTemplate, trayMenuTemplate, type ToyState } from './menus';
import { NotesStore } from './notes-store';
import { loadPacks, type LoadedPack } from './pack-loader';
import { PanelWindow } from './panel-window';
import { bodyWidth, extentOf, restY, windowBounds, windowSize, xRatioFromBounds, type Bounds, type WorkArea } from './pet-geometry';
import { PetWindow, type PetEvents } from './pet-window';
import type { AppPaths } from './paths';
import { SettingsStore } from './settings-store';
import { TrayController } from './tray';

const PET_CHANNELS = ['pet:ready', 'pet:set-interactive', 'pet:move', 'pet:drag-end', 'pet:menu', 'pet:status', 'pet:reminder-result', 'pet:log', 'pet:exited',
  'pet:fight-state', 'pet:woke', 'pet:head', 'pet:wheel', 'pet:spin-hit'];
/** Walking off can mean first getting out of the box, then getting up and crossing the screen; never wait longer than this. */
const EXIT_TIMEOUT_MS = 45_000;
/** Passed by the login item, so a start at login can tell itself from being opened by hand. */
export const AUTOSTART_ARG = '--autostart';
/** Started at login rather than by hand: on Windows the login item passes AUTOSTART_ARG; macOS says so itself. */
const openedAtLogin = () => process.argv.includes(AUTOSTART_ARG) || (process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin);
const HOW_TO_RECALL = process.platform === 'darwin'
  ? '要牠回來：點 Dock 上的「打工貓貓」，或點螢幕上方選單列的貓咪圖示。'
  : '要牠回來：再點一次桌面或開始選單的「打工貓貓」，或點右下角 ^ 裡的貓咪圖示。';
/** A pack's commands for the menu and the panel, each named by its action key. */
const commandItems = (pack: Pack) => pack.commands.map(c => ({ label: c.label, pose: actionKey(c) }));
/** The eye break: this long, unless DESKTOP_PET_BREAK_SECONDS says otherwise (tests). */
const BREAK_SECONDS = Number(process.env.DESKTOP_PET_BREAK_SECONDS) || 30;
const MAX_CRASH_RESTARTS = 3;
const REMINDER_TICK_MS = 15_000;
/** How often to look whether the user has left the computer or come back. */
const AWAY_TICK_MS = 2_000;
/** Play-fights by themselves: looked for this often, started with this chance when two cats are close, at most once per gap. */
const FIGHT_TICK_MS = 20_000;
const FIGHT_CHANCE = 0.25;
const FIGHT_GAP_MS = 10 * 60_000;
/** Getting ready (walking over to the fight pose), then the fight itself: never wait longer than this. */
const FIGHT_TIMEOUT_MS = 30_000;
const NOTICE_MS = 6_000;
const PAUSE_MS = 3_600_000;
const FALLBACK_LINES: Record<ReminderType, string> = { water: '該喝水了。', stretch: '起來動一動。', eyes: '讓眼睛休息一下。' };

type ValidPack = LoadedPack & { pack: Pack };

export class AppController {
  readonly packs: LoadedPack[];
  settings: Settings;
  warning: string | null;
  readonly pets = new Map<string, PetWindow>();
  readonly status = new Map<string, string>();
  protected readonly store: SettingsStore;
  private readonly crashes = new Map<string, number>();
  /** Cats walking off the screen, and how to finish each one (close its window) early. */
  private readonly leaving = new Map<string, { done: Promise<void>; finish: () => void }>();
  private quitting = false;
  /** Ends the break now (closes its window), while one is on. */
  private endBreak: (() => void) | null = null;
  private breaking = false;
  /** A play-fight under way: the two cats, which of them are ready or done, whether it was asked for on the panel. */
  private fight: { ids: [string, string]; ready: Set<string>; done: Set<string>; manual: boolean; timer: ReturnType<typeof setTimeout> } | null = null;
  private lastFight = 0;
  /** Reminders out as bubbles, and the cats still asking (the first answer settles it for all). */
  private readonly reminding = new Map<ReminderType, Set<string>>();
  /** Why the panel's fight button did nothing, shown for a moment. */
  private notice: { text: string; until: number } | null = null;
  protected readonly panel: PanelWindow;
  private tray: TrayController | null = null;
  scheduler!: ReminderScheduler;
  private readonly awayWatch: AwayWatch;
  /** 小昭's reminders and 阿胖's memo, shown over the cats' heads. */
  readonly cards: CardController;
  /** The cat wand, and the cats' interest in it. */
  readonly toys: ToyController;
  /**
   * How long the computer has had no key or mouse input, in seconds. Tests set DESKTOP_PET_FAKE_IDLE (the machine running them
   * sits idle, which would send every cat to sleep) and replace this when they want the user away.
   */
  idleSeconds = () => (process.env.DESKTOP_PET_FAKE_IDLE ? Number(process.env.DESKTOP_PET_FAKE_IDLE) : powerMonitor.getSystemIdleTime());
  private part: DayPart = dayPart(new Date());
  private lastTick = new Date();
  /** The day the cats last said good morning (days start at 5:00). */
  private helloDay: string | null = null;
  /** Notifications that open a card when clicked, kept until they are (or are gone). */
  private readonly notices = new Set<Notification>();

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
    this.awayWatch = new AwayWatch(this.settings.awayMinutes);
    this.cards = new CardController({
      onScreen: () => this.settings.petOrder.filter(id => this.onScreen(id)),
      packOf: id => this.packOf(id),
      ownerOf: kind => this.validPacks().find(p => cardsOf(p.pack).includes(kind))?.id ?? null,
      workArea: () => this.workArea(),
      away: () => this.awayWatch.away,
      settings: () => this.settings.cards,
      attend: (id, on) => this.pets.get(id)?.send('pet:attend', on),
      bringOut: id => this.showPet(id),
      spin: id => this.pets.get(id)?.send('pet:spin'),
      sayDish: (id, dish) => this.pets.get(id)?.send('pet:dish', dish),
      cancelSpin: id => this.pets.get(id)?.send('pet:spin-cancel'),
      notify: (body, onClick) => {
        if (!Notification.isSupported()) return;
        const n = new Notification({ title: '打工貓貓', body });
        // held until clicked or gone: one collected as garbage no longer says it was clicked
        this.notices.add(n);
        const gone = () => this.notices.delete(n);
        n.on('click', () => { gone(); onClick(); });
        n.on('close', gone);
        n.on('failed', gone);
        n.show();
      },
      cardsAt: cards => { for (const pet of this.pets.values()) pet.send('pet:cards-at', cards); },
      log,
    }, new NotesStore(paths.notesFile, log), paths.uiDir);
    this.toys = new ToyController({
      onScreen: () => this.settings.petOrder.filter(id => this.onScreen(id)),
      packOf: id => this.packOf(id),
      head: id => this.cards.heads.get(id) ?? null,
      frameHeight: id => this.pets.get(id)?.frame.height ?? 300,
      workArea: () => this.workArea(),
      send: (id, move) => this.pets.get(id)?.send('pet:toy', move),
      changed: () => this.changed(),
    }, paths.uiDir);
    for (const ch of PET_CHANNELS) ipcMain.on(ch, (e, ...args) => this.petFor(e.sender)?.handle(ch, args));
    this.panel = new PanelWindow(paths.uiDir);
    ipcMain.handle('panel:get-state', () => this.panelState());
    ipcMain.handle('panel:act', (_e, a: PanelAction) => this.act(a));
    // however the app quits, open no new windows from then on (a break ending as it closes would bring the cats back)
    app.on('before-quit', () => { this.quitting = true; });
  }

  validPacks(): ValidPack[] { return this.packs.filter((p): p is ValidPack => p.pack !== null); }
  packOf(id: string): Pack | null { return this.validPacks().find(p => p.id === id)?.pack ?? null; }
  workArea(): WorkArea { return screen.getPrimaryDisplay().workArea; }

  start(): void {
    const first = this.validPacks()[0];
    this.tray = new TrayController(first ? join(first.dir, first.pack.portrait) : null, () => this.trayMenu(), () => this.openPanel());
    // opened by hand (not at login) with every cat put away: bring the first one back, or it looks as if nothing started
    if (!openedAtLogin() && !this.settings.petOrder.some(id => this.settings.pets[id]?.visible)) {
      const firstId = this.settings.petOrder[0];
      if (firstId) this.settings.pets[firstId].visible = true;
    }
    // the first cat out greets for the time of day (good morning), once a day
    const hello = this.takeHello(new Date());
    this.settings.petOrder.filter(id => this.settings.pets[id]?.visible).forEach((id, i) => this.showPet(id, true, i === 0 ? hello : null));
    this.cards.popFor('start');   // they show once their cats are home
    this.saveSoon();
    const r = this.settings.reminders;
    this.scheduler = new ReminderScheduler({ water: r.water, stretch: r.stretch, eyes: r.eyes }, Date.now());
    if (r.pausedUntil && r.pausedUntil > Date.now()) this.scheduler.pause(r.pausedUntil);
    setInterval(() => this.tick(), REMINDER_TICK_MS);
    setInterval(() => this.checkAway(), AWAY_TICK_MS);
    setInterval(() => {
      if (this.awayWatch.away) return;
      if (this.settings.fightAuto && Date.now() - this.lastFight > FIGHT_GAP_MS && Math.random() < FIGHT_CHANCE) this.startFight(false);
    }, FIGHT_TICK_MS);
    const pauseAll = (paused: boolean) => { for (const p of this.pets.values()) p.send('pet:pause', paused); };
    powerMonitor.on('suspend', () => pauseAll(true));
    powerMonitor.on('lock-screen', () => pauseAll(true));
    powerMonitor.on('resume', () => { pauseAll(false); this.scheduler.resetAll(Date.now()); this.cards.popFor('resume'); });
    powerMonitor.on('unlock-screen', () => { pauseAll(false); this.scheduler.resetAll(Date.now()); this.cards.popFor('unlock'); });
    if (!this.settings.firstRunDone) {
      this.openPanel();
      this.settings.firstRunDone = true;
      this.saveSoon();
    }
    this.applyAutoStart();
    screen.on('display-metrics-changed', () => this.relayoutAll());
    if (process.env.DESKTOP_PET_METRICS === '1') setInterval(() => this.logMetrics(), 60_000);
  }

  /** `enter`: walk in from the left edge (app start, showing it again) rather than appear in place. `hello`: greet with this. */
  showPet(id: string, enter = true, hello: TimeEvent | null = null): void {
    const pack = this.packOf(id);
    if (!pack) return;
    this.leaving.get(id)?.finish();           // shown again while walking off: that one goes at once
    if (this.pets.has(id)) return;
    const ps = this.settings.pets[id];
    const wa = this.workArea();
    const others = [...this.pets.values()].map(w => ({
      center: wa.x + xRatioFromBounds(w.frame, w.pack, wa) * wa.width,
      width: bodyWidth(w.pack, this.settings.pets[w.id].scale),
    }));
    const want = wa.x + (ps.x ?? DEFAULT_X) * wa.width;
    // search only where the cat can really rest: what it draws must stay on screen
    const [left, right] = extentOf(pack);
    const w = windowSize(pack, ps.scale).width;
    const cx = pack.poses[pack.start].centerX;
    const center = findFreeCenter(others, want, bodyWidth(pack, ps.scale), wa.x + (cx - left) * w, wa.x + wa.width - (right - cx) * w);
    ps.x = (center - wa.x) / wa.width;
    ps.visible = true;
    const pet = new PetWindow(pack, this.restBounds(id), wa,
      { auto: ps.auto, actions: ps.actions, interval: this.settings.actionInterval, restY: restY(pack, ps.scale, wa), debug: this.debug,
        enter: enter && !!pack.walk, away: this.awayWatch.away, dayPart: this.part, hello }, this.petEvents(), this.paths.uiDir);
    this.pets.set(id, pet);
    this.saveSoon();
    this.changed();
  }

  hidePet(id: string): void {
    void this.walkOff(id);
    if (!this.settings.petOrder.some(i => this.onScreen(i))) {
      const name = this.packOf(id)?.name ?? '貓咪';
      this.tray?.balloon(`${name}先去休息了`, HOW_TO_RECALL);
    }
    if (this.settings.pets[id]) this.settings.pets[id].visible = false;
    this.status.delete(id);
    this.saveSoon();
    this.changed();
  }

  saveSoon(): void { this.store.saveSoon(this.settings); }
  flush(): void { this.store.flush(this.settings); this.cards.flush(); }

  protected changed(): void {
    this.tray?.refresh();
    this.panel.push(this.panelState());
  }

  openPanel(): void { this.panel.open(); }

  /** The app was opened again while it runs: show the panel, and bring a cat out if none is. */
  summon(): void {
    if (!this.settings.petOrder.some(id => this.onScreen(id))) {
      const firstId = this.settings.petOrder[0];
      if (firstId) this.showPet(firstId);
    }
    this.openPanel();
  }

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
          visible: this.onScreen(p.id),
          scale: ps?.scale ?? 1,
          auto: ps?.auto ?? true,
          actions: ps?.actions ?? null,
          status: this.status.get(p.id) ?? '',
          commands: p.pack ? commandItems(p.pack) : [],
        };
      }),
      reminders: { water: r.water, stretch: r.stretch, eyes: r.eyes, notify: r.notify, pausedUntil: r.pausedUntil },
      autoStart: this.settings.autoStart,
      actionInterval: this.settings.actionInterval,
      fightAuto: this.settings.fightAuto,
      canFight: this.validPacks().filter(p => p.pack.fight).length >= 2,
      awayMinutes: this.settings.awayMinutes,
      cards: this.cards.menuItems().map(({ kind }) => ({ kind, title: this.cards.title(kind), settings: this.settings.cards[kind] })),
      toy: { available: this.hasToy(), out: this.toys.out },
      notice: this.notice && this.notice.until > Date.now() ? this.notice.text : null,
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
        if (a.actions !== undefined) this.setActions(a.id, a.actions);
        if (a.scale !== undefined) this.setScale(a.id, a.scale);
        break;
      case 'command': this.command(a.id, a.pose); break;
      case 'reminders': this.setReminders(a); break;
      case 'testReminder': this.testReminder(); break;
      case 'autoStart': this.setAutoStart(a.on); break;
      case 'actionInterval': this.setActionInterval(a.seconds); break;
      case 'fightAuto': this.settings.fightAuto = a.on; this.saveSoon(); break;
      case 'awayMinutes':
        if (!AWAY_CHOICES.includes(a.minutes)) break;
        this.settings.awayMinutes = a.minutes;
        this.awayWatch.setMinutes(a.minutes);
        this.saveSoon();
        break;
      case 'cards':
        this.settings.cards[a.card] = normalizeCardSettings({ ...this.settings.cards[a.card], ...a.patch }, this.settings.cards[a.card]);
        this.saveSoon();
        break;
      case 'openCard': this.cards.show(a.card, null, 'hand'); break;
      case 'toy': if (a.out !== this.toys.out) this.toggleToy(null); break;
      case 'fight': {
        const why = this.startFight(true);
        this.notice = why ? { text: why, until: Date.now() + NOTICE_MS } : null;
        if (why) setTimeout(() => this.changed(), NOTICE_MS + 50);   // clear it from the panel again
        break;
      }
      case 'resetPositions': this.resetAllPositions(); break;
      case 'testBreak': void this.startBreak(); break;
    }
    return this.panelState();
  }

  hideAll(): void { for (const id of [...this.pets.keys()]) this.hidePet(id); }

  /** On the desktop and not on its way out. */
  onScreen(id: string): boolean { return this.pets.has(id) && !this.leaving.has(id); }

  /** Let a cat walk off the left edge, then close its window. */
  walkOff(id: string): Promise<void> {
    const pet = this.pets.get(id);
    if (!pet) return Promise.resolve();
    this.cards.petGone(id);
    this.toys.petGone(id);
    const going = this.leaving.get(id);
    if (going) return going.done;
    let finish = () => {};
    const done = new Promise<void>(resolve => {
      const timer = setTimeout(() => finish(), EXIT_TIMEOUT_MS);
      finish = () => {
        clearTimeout(timer);
        pet.close();
        if (this.pets.get(id) === pet) this.pets.delete(id);
        this.leaving.delete(id);
        this.changed();
        resolve();
      };
    });
    this.leaving.set(id, { done, finish: () => finish() });
    pet.send('pet:exit');
    return done;
  }

  resetAllPositions(): void {
    for (const ps of Object.values(this.settings.pets)) ps.x = null;
    const visible = [...this.pets.keys()].filter(id => this.onScreen(id));   // not one walking off: it goes on
    for (const id of visible) { this.cards.petGone(id); this.toys.petGone(id); this.pets.get(id)?.close(); this.pets.delete(id); }
    for (const id of this.settings.petOrder) if (visible.includes(id)) this.showPet(id, false);
  }

  setAutoStart(on: boolean): void { this.settings.autoStart = on; this.applyAutoStart(); this.saveSoon(); this.changed(); }

  /**
   * A play-fight between the two cats on the desktop closest together (their resting bodies at most one body apart). Both get
   * ready - each to its fight pose, where it holds still - and main starts them together once both are. Returns why it can not
   * start, or null.
   */
  startFight(manual: boolean): string | null {
    if (this.fight || this.breaking || this.quitting) return '牠們正在忙，等一下再試。';
    // with the wand out they play with it: not a play-fight of their own just then (it kept them from the wand in 0.7.0)
    if (!manual && this.toys.out) return '逗貓棒拿出來時，牠們不會自己打鬧。';
    const spots = this.settings.petOrder.filter(id => this.onScreen(id)).flatMap(id => {
      const pet = this.pets.get(id)!;
      const f = pet.pack.fight;
      if (!f) return [];
      const pose = pet.pack.poses[f.pose];
      const { x, width } = pet.frame;
      return [{ id, left: x + (pose.left ?? 0) * width, right: x + (pose.right ?? 1) * width }];
    });
    if (spots.length < 2) return '要兩隻會打鬧的貓都在桌面上才行。';
    const pair = closestPair(spots);
    if (!pair) return '兩隻貓離太遠了，把牠們拖近一點再試。';
    // each one swats towards the other, reaching out that way: by the screen's edge there may be no room for it
    const wa = this.workArea();
    const room = (id: string, side: 'left' | 'right') => {
      const pet = this.pets.get(id)!;
      const f = pet.pack.fight!;
      return side === 'right' ? pet.frame.x + f.right * pet.frame.width <= wa.x + wa.width + 0.5
        : pet.frame.x + f.left * pet.frame.width >= wa.x - 0.5;
    };
    if (!room(pair.left, 'right') || !room(pair.right, 'left')) return '有一隻貓太靠螢幕邊緣，沒有空間打鬧。';
    const ids: [string, string] = [pair.left, pair.right];
    this.fight = { ids, ready: new Set(), done: new Set(), manual, timer: setTimeout(() => this.endFight(), FIGHT_TIMEOUT_MS) };
    this.log.info(`打鬧：${ids.join(' 和 ')}（${manual ? '面板' : '自己'}）`);
    this.pets.get(pair.left)!.send('pet:fight-ready', { side: 'right', manual });   // the left one turns right, to the other
    this.pets.get(pair.right)!.send('pet:fight-ready', { side: 'left', manual });
    return null;
  }

  private onFightState(id: string, state: FightState): void {
    const f = this.fight;
    if (!f || !f.ids.includes(id)) return;
    if (state === 'no') {                 // one of them can not now: call it off for both
      if (f.manual) {
        this.notice = { text: '牠們現在正忙（睡覺或走路中），等一下再試。', until: Date.now() + NOTICE_MS };
        this.changed();
      }
      this.endFight();
      return;
    }
    (state === 'ready' ? f.ready : f.done).add(id);
    if (state === 'ready' && f.ready.size === 2) {
      this.lastFight = Date.now();
      for (const i of f.ids) this.pets.get(i)?.send('pet:fight-go');
    }
    if (f.done.size === 2) this.endFight(false);
  }

  /** The fight is over or called off: `cancel` tells both cats to stop waiting for it. */
  private endFight(cancel = true): void {
    const f = this.fight;
    if (!f) return;
    clearTimeout(f.timer);
    this.fight = null;
    if (cancel) for (const i of f.ids) this.pets.get(i)?.send('pet:fight-cancel');
  }

  /** How long every cat rests in a pose (auto mode) before it does something else. */
  setActionInterval(seconds: number): void {
    if (!ACTION_INTERVALS.includes(seconds)) return;
    this.settings.actionInterval = seconds;
    for (const pet of this.pets.values()) {
      pet.updateInit({ interval: seconds });
      pet.send('pet:set-interval', seconds);
    }
    this.saveSoon();
    this.changed();
  }
  /** The cats walk off first (the tray's 結束); the app quits once they are gone. */
  async quit(): Promise<void> {
    if (this.quitting) return;
    this.quitting = true;
    this.endBreak?.();
    this.toys.putAway();
    await Promise.all([...this.pets.keys()].map(id => this.walkOff(id)));
    app.quit();
  }

  /** Registering electron.exe during development would be wrong, so only the installed app registers itself. */
  protected applyAutoStart(): void {
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: this.settings.autoStart, args: [AUTOSTART_ARG] });
  }

  /** After a resolution or monitor change, pull every cat back onto the work area's bottom edge. */
  relayoutAll(): void {
    const wa = this.workArea();
    for (const [id, pet] of this.pets) {
      const ps = this.settings.pets[id];
      pet.place(this.restBounds(id), wa);
      const y = restY(pet.pack, ps.scale, wa);
      pet.updateInit({ restY: y });
      pet.send('pet:rest-y', y);
    }
  }

  private logMetrics(): void {
    const m = app.getAppMetrics();
    const cpu = m.reduce((s, p) => s + p.cpu.percentCPUUsage, 0);
    const memMb = m.reduce((s, p) => s + p.memory.workingSetSize, 0) / 1024;
    // working sets count memory shared between processes more than once; private bytes are what the app really holds
    const privMb = m.reduce((s, p) => s + (p.memory.privateBytes ?? 0), 0) / 1024;
    this.log.info(`效能：CPU ${cpu.toFixed(1)}%，記憶體 ${privMb.toFixed(0)} MB（工作集 ${memMb.toFixed(0)} MB），貓 ${this.pets.size} 隻`);
  }

  setReminders(patch: { water?: number; stretch?: number; eyes?: number; notify?: boolean }): void {
    const r = this.settings.reminders;
    // only what the panel offers: its whole action comes in here, `kind` and all
    for (const t of ['water', 'stretch', 'eyes'] as const) if (REMINDER_CHOICES.includes(patch[t] as number)) r[t] = patch[t]!;
    if (typeof patch.notify === 'boolean') r.notify = patch.notify;
    this.scheduler.setIntervals({ water: r.water, stretch: r.stretch, eyes: r.eyes }, Date.now());
    this.saveSoon();
    this.changed();
  }

  testReminder(): void { this.deliver('water'); }

  pauseReminders(): void {
    const until = Date.now() + PAUSE_MS;
    this.settings.reminders.pausedUntil = until;
    this.scheduler.pause(until);
    this.saveSoon();
    this.changed();
  }

  resumeReminders(): void {
    this.settings.reminders.pausedUntil = null;
    this.scheduler.resume(Date.now());
    this.saveSoon();
    this.changed();
  }

  protected onReminderResult(id: string, type: string, result: string): void {
    const t = type as ReminderType;
    const asked = this.reminding.get(t);
    if (!asked?.has(id)) return;            // already settled by the other cat
    this.reminding.delete(t);               // the first answer counts; the other cat's bubble goes
    for (const other of asked) if (other !== id) this.pets.get(other)?.send('pet:reminder-close', t);
    if (result === 'snooze') this.scheduler.snooze(t, Date.now());
    else this.scheduler.done(t, Date.now());
  }

  tick(): void {
    const now = Date.now();
    this.cards.tick(now);
    if (this.settings.reminders.pausedUntil && now >= this.settings.reminders.pausedUntil) {
      this.settings.reminders.pausedUntil = null;
      this.saveSoon();
      this.changed();
    }
    this.tickClock(new Date(now));
    if (this.awayWatch.away) return;        // the reminders wait: they start counting again when the user is back
    for (const t of this.scheduler.due(now)) this.deliver(t);
  }

  /** What the time of day brings: a line now and then (lunch, bedtime, ...), and sleepier cats after lunch and late at night. */
  private tickClock(now: Date): void {
    const events = clockEvents(this.lastTick, now);
    this.lastTick = now;
    if (!this.awayWatch.away && !this.breaking) for (const e of events) this.sayFromOne(e);
    const part = dayPart(now);
    if (part === this.part) return;
    this.part = part;
    for (const pet of this.pets.values()) {
      pet.updateInit({ dayPart: part });
      pet.send('pet:day-part', part);
    }
  }

  /** The user left the computer, or is back: the cats go to sleep, or wake up and one of them says hello. */
  checkAway(): void {
    const change = this.awayWatch.update(this.idleSeconds());
    if (!change) return;
    const away = change === 'away';
    this.log.info(away ? '離開電腦：貓咪去睡覺' : '回到電腦');
    for (const pet of this.pets.values()) {
      pet.updateInit({ away });
      pet.send('pet:away', away);
    }
    if (away) { this.endFight(); return; }
    this.scheduler.resetAll(Date.now());
    this.sayFromOne(this.takeHello(new Date()) ?? 'back');
    this.cards.back();
  }

  /** The greeting for the day's first hello, if it is the first and the time is right (see helloEvent). */
  private takeHello(now: Date): TimeEvent | null {
    const day = helloDay(now);
    if (day === this.helloDay) return null;
    const hello = helloEvent(now);
    if (hello) this.helloDay = day;
    return hello;
  }

  /** One of the cats on the desktop says it (only one, so they do not both say the same). */
  private sayFromOne(what: TimeEvent | 'back'): void {
    const ids = this.settings.petOrder.filter(id => this.onScreen(id));
    if (!ids.length) return;
    const id = ids[Math.floor(Math.random() * ids.length)];
    this.pets.get(id)!.send('pet:say', what);
    this.log.info(`說：${what}（${id}）`);
  }

  /**
   * The eye break: the cats walk off, then big copies of them (or of the first cat, if none was out) walk in over a dimmed screen,
   * each lying in its own share of it while a countdown runs, and walk off together; then the cats walk back in.
   */
  async startBreak(): Promise<void> {
    if (this.breaking || this.quitting) return;
    this.breaking = true;
    this.endFight();
    const back = this.settings.petOrder.filter(id => this.onScreen(id));
    const first = this.settings.petOrder.find(id => this.packOf(id));
    const ids = back.length ? back : first ? [first] : [];
    const cats = ids.map(id => this.packOf(id)!).map(pack => ({ pack, packUrl: `${APP_ORIGIN}/packs/${pack.id}/` }));
    this.log.info(`休息 ${BREAK_SECONDS} 秒（${ids.join('、') || '沒有貓'}）`);
    await Promise.all(back.map(id => this.walkOff(id)));
    if (cats.length && !this.quitting) {
      await new Promise<void>(resolve => {
        let win: BreakWindow | null = null;
        const timer = setTimeout(() => this.endBreak?.(), (BREAK_SECONDS + 90) * 1000);
        this.endBreak = () => { clearTimeout(timer); this.endBreak = null; win?.close(); resolve(); };
        const { pack } = cats[0];
        win = new BreakWindow({ cats, seconds: BREAK_SECONDS, line: reminderLine(pack, 'eyes', pack.start), debug: this.debug },
          this.paths.uiDir, () => this.endBreak?.(), (level, message) => this.log[level](`[休息] ${message}`));
      });
    }
    this.scheduler.done('eyes', Date.now());
    this.breaking = false;
    if (!this.quitting) for (const id of back) if (this.settings.pets[id]?.visible) this.showPet(id);
  }

  /**
   * Every cat on the desktop reminds at once (each dropping in on its reminder pose, if it has one and room for it there); the
   * first answer, from either, settles it and closes the other's bubble. Without a cat only the notification shows.
   */
  private deliver(type: ReminderType): void {
    if (type === 'eyes') { void this.startBreak(); return; }   // resting the eyes is a full-screen break, not a bubble
    const ids = this.settings.petOrder.filter(i => this.pets.has(i) && this.onScreen(i));
    for (const id of ids) this.pets.get(id)!.send('pet:reminder', type);
    if (ids.length) this.reminding.set(type, new Set(ids));
    else this.scheduler.done(type, Date.now());
    if (this.settings.reminders.notify && Notification.isSupported()) {
      const pet = ids.length ? this.pets.get(ids[0])! : null;
      const body = pet ? reminderLine(pet.pack, type, pet.pack.reminderPoses?.[type] ?? pet.pack.start) : FALLBACK_LINES[type];
      new Notification({ title: '打工貓貓', body }).show();
    }
    this.log.info(`提醒：${type}${ids.length ? `（${ids.join('、')}）` : '（沒有貓在桌面上）'}`);
  }

  private trayMenu() {
    return trayMenuTemplate(
      this.validPacks().map(p => ({ id: p.id, name: p.pack.name, visible: this.onScreen(p.id) })),
      { now: Date.now(), pausedUntil: this.settings.reminders.pausedUntil, autoStart: this.settings.autoStart, toy: this.toyState() },
      {
        openPanel: () => this.openPanel(),
        togglePet: id => (this.onScreen(id) ? this.hidePet(id) : this.showPet(id)),
        hideAll: () => this.hideAll(),
        pauseReminders: () => this.pauseReminders(),
        resumeReminders: () => this.resumeReminders(),
        setAutoStart: on => this.setAutoStart(on),
        toggleToy: () => this.toggleToy(null),
        quit: () => void this.quit(),
      });
  }

  protected petEvents(): PetEvents {
    return {
      // reported at every clip start, mostly with the same pose: only a new one is news for the panel and the tray
      status: (id, label) => {
        if (this.status.get(id) === label) return;
        this.status.set(id, label);
        this.changed();
      },
      menu: id => this.onPetMenu(id),
      dragEnd: (id, frameX) => this.onDragEnd(id, frameX),
      reminderResult: (id, type, result) => this.onReminderResult(id, type, result),
      crashed: id => this.onCrashed(id),
      exited: id => this.leaving.get(id)?.finish(),
      log: (id, level, message) => this.log[level](`[${id}] ${message}`),
      fightState: (id, state) => this.onFightState(id, state),
      woke: id => this.onWoke(id),
      head: (id, head, settled) => this.cards.head(id, head, settled),
      wheel: (id, up) => this.cards.wheel(id, up),
      spinHit: (id, swatted) => this.cards.spinHit(id, swatted),
    };
  }

  /** Some cat can play with the wand. */
  hasToy(): boolean { return this.validPacks().some(p => p.pack.toy); }

  private toyState(): ToyState { return this.hasToy() ? (this.toys.out ? 'out' : 'in') : null; }

  /** Take the wand out (by the cat `near`, else by the first cat out) or put it away. */
  toggleToy(near: string | null): void {
    if (this.toys.out) { this.toys.putAway(); this.log.info('收起逗貓棒'); return; }
    this.toys.takeOut(near ?? this.settings.petOrder.find(id => this.onScreen(id)) ?? null);
    this.log.info('拿出逗貓棒');
  }

  /** A cat has sat up after the user came back. */
  protected onWoke(id: string): void {
    this.log.info(`[${id}] 醒了`);
    this.cards.woke(id);
  }

  protected onPetMenu(id: string): void {
    const pet = this.pets.get(id);
    const ps = this.settings.pets[id];
    if (!pet || !ps) return;
    Menu.buildFromTemplate(petMenuTemplate({ commands: commandItems(pet.pack), auto: ps.auto, scale: ps.scale, cards: this.cards.menuItems(id),
      toy: this.toyState() }, {
      openCard: kind => { this.cards.show(kind, id, 'hand'); },
      toggleToy: () => this.toggleToy(id),
      command: pose => this.command(id, pose),
      setAuto: on => this.setAuto(id, on),
      setScale: s => this.setScale(id, s),
      resetPosition: () => this.resetPosition(id),
      hide: () => this.hidePet(id),
    })).popup({ window: pet.win });
  }

  /** `key`: a pose, or a pounce (`pounce:left` / `pounce:right`). Told to, the cat makes room for it first if it must. */
  command(id: string, key: string): void {
    const pet = this.pets.get(id);
    if (!pet) return;
    this.makeRoom(id, pet, key);
    pet.send('pet:command', key);
  }

  /** A pose or pounce may need more room than the cat's spot leaves (the box, by the screen's edge): it moves over first. */
  private makeRoom(id: string, pet: PetWindow, key: string): void {
    const b = this.restBounds(id, key);
    if (b.x !== pet.frame.x) pet.place(b, this.workArea());
  }

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

  /** The poses the cat may pick by itself (ticked in the panel). */
  setActions(id: string, actions: string[]): void {
    const ps = this.settings.pets[id];
    if (!ps) return;
    ps.actions = actions;
    const pet = this.pets.get(id);
    pet?.updateInit({ actions });
    pet?.place(this.restBounds(id), this.workArea());
    pet?.send('pet:set-actions', actions);
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
      pet.place(this.restBounds(id), wa);
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
    pet.place(this.restBounds(id), this.workArea());
  }

  /**
   * The resting window for a cat: its saved spot, pulled in just enough that what it always has room for stays on screen
   * (see extentOf), and `extra`, a pose or pounce it was just told to do.
   */
  restBounds(id: string, extra?: string): Bounds {
    const pack = this.packOf(id)!;
    const ps = this.settings.pets[id];
    return windowBounds(pack, ps.scale, ps.x ?? DEFAULT_X, this.workArea(), extentOf(pack, extra ? [extra] : []));
  }


  private onDragEnd(id: string, frameX: number): void {
    const pet = this.pets.get(id);
    const ps = this.settings.pets[id];
    if (!pet || !ps) return;
    const wa = this.workArea();
    pet.frameMovedTo(frameX);
    ps.x = xRatioFromBounds(pet.frame, pet.pack, wa);
    const b = this.restBounds(id);
    pet.place(b, wa);
    ps.x = xRatioFromBounds(b, pet.pack, wa);   // remember where it really rests
    this.saveSoon();
  }

  private onCrashed(id: string): void {
    const n = (this.crashes.get(id) ?? 0) + 1;
    this.crashes.set(id, n);
    this.log.error(`貓咪視窗 ${id} 當掉了（第 ${n} 次）`);
    this.cards.petGone(id);
    this.toys.petGone(id);
    const going = this.leaving.get(id);
    if (going) { going.finish(); return; }   // it was walking off anyway: it is gone (and whoever waits for it hears so now)
    this.pets.get(id)?.close();
    this.pets.delete(id);
    if (n <= MAX_CRASH_RESTARTS) this.showPet(id, false);
    else { this.settings.pets[id].visible = false; this.saveSoon(); this.changed(); }
  }

  private petFor(sender: WebContents): PetWindow | undefined {
    for (const p of this.pets.values()) if (!p.win.isDestroyed() && p.win.webContents === sender) return p;
    return undefined;
  }
}

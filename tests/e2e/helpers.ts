import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test';
import { cpSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export async function launch(extraEnv: Record<string, string> = {}, userDir = mkdtempSync(join(tmpdir(), 'dpet-e2e-')), extraArgs: string[] = []) {
  const app = await electron.launch({
    args: ['.', ...extraArgs],
    env: { ...process.env, DESKTOP_PET_PACKS: resolve('tests/fixtures/packs'), DESKTOP_PET_USERDATA: userDir, DESKTOP_PET_DEBUG: '1',
      DESKTOP_PET_FAKE_IDLE: '0', ...extraEnv },
  });
  return { app, userDir };
}

/** The pet window of a given pack id, once it has walked in and lives its normal life (`live: false`: as soon as it exists). */
export async function petPage(app: ElectronApplication, id = 'testcat', live = true): Promise<Page> {
  let found: Page | undefined;
  await expect.poll(async () => {
    for (const w of app.windows()) {
      if (!w.url().endsWith('/ui/pet.html')) continue;
      const pid = await w.evaluate(() => (window as any).__pet?.id).catch(() => undefined);
      if (pid === id) { found = w; return true; }
    }
    return false;
  }, { timeout: 20_000 }).toBe(true);
  if (live) await expect.poll(() => found!.evaluate(() => (window as any).__pet.mode), { timeout: 20_000 }).toBe('live');
  return found!;
}

export async function panelPage(app: ElectronApplication): Promise<Page> {
  let found: Page | undefined;
  await expect.poll(() => { found = app.windows().find(w => w.url().endsWith('/ui/panel.html')); return !!found; }, { timeout: 20_000 }).toBe(true);
  await found!.waitForSelector('[data-pet]');
  return found!;
}

/** Run a function against the main-process controller (exposed in debug mode). */
export function controllerCall<T>(app: ElectronApplication, fn: (c: any) => T): Promise<T> {
  return app.evaluate((_electron, body) => new Function('c', `return (${body})(c)`)((globalThis as any).__controller), fn.toString());
}

/** The pet window with auto mode off from before it arrives, so it stays in its start pose once home. */
export async function calmPetPage(app: ElectronApplication, id = 'testcat'): Promise<Page> {
  const page = await petPage(app, id, false);
  await page.evaluate(() => { (window as any).__pet.engine.auto = false; });
  await expect.poll(() => page.evaluate(() => (window as any).__pet.mode), { timeout: 20_000 }).toBe('live');
  return page;
}

/** Client coordinates of a point inside the cat's frame, given as shares of the frame (the frame sits somewhere in the strip). */
export function catPoint(page: Page, fx: number, fy: number): Promise<{ x: number; y: number }> {
  return page.evaluate(([u, v]) => {
    const r = document.getElementById('layer')!.getBoundingClientRect();
    return { x: r.left + u * r.width, y: r.top + v * r.height };
  }, [fx, fy]);
}

/** The full-screen break window, once it has started. */
export async function breakPage(app: ElectronApplication): Promise<Page> {
  let found: Page | undefined;
  await expect.poll(() => { found = app.windows().find(w => w.url().endsWith('/ui/break.html')); return !!found; }, { timeout: 20_000 }).toBe(true);
  await found!.waitForSelector('#countdown:not(:empty)');
  return found!;
}

export const breakOpen = (app: ElectronApplication) => app.windows().some(w => w.url().endsWith('/ui/break.html'));

/**
 * From now on, walking clips in windows that open stall: with `load` they never load (no metadata), with `play` they load but
 * never start (no frames, no 'ended'), as if their decoder had stopped.
 */
export async function stallWalking(app: ElectronApplication, how: 'load' | 'play'): Promise<void> {
  await app.context().addInitScript(how => {
    const proto = HTMLMediaElement.prototype;
    if (how === 'load') {
      const src = Object.getOwnPropertyDescriptor(proto, 'src')!;
      Object.defineProperty(proto, 'src', {
        ...src,
        set(this: HTMLMediaElement, url: string) { if (!this.classList.contains('walk-source')) src.set!.call(this, url); },
      });
    } else {
      const play = proto.play;
      proto.play = function (this: HTMLMediaElement) { return this.classList.contains('walk-source') ? new Promise<void>(() => {}) : play.call(this); };
    }
  }, how);
}

/**
 * From now on, the cats' clips `clips` stall in windows that open: with `load` they never load, with `play` they load but never
 * start, with `end` they start but stop moving before their end (no 'ended'), as if their decoder had stopped.
 */
export async function stallClips(app: ElectronApplication, clips: string[], how: 'load' | 'play' | 'end'): Promise<void> {
  await app.context().addInitScript(([clips, how]) => {
    const proto = HTMLMediaElement.prototype;
    const stalls = (v: HTMLMediaElement) => clips.includes(v.dataset.clip ?? '');
    if (how === 'load') {
      const src = Object.getOwnPropertyDescriptor(proto, 'src')!;
      Object.defineProperty(proto, 'src', {
        ...src,
        set(this: HTMLMediaElement, url: string) { if (!stalls(this)) src.set!.call(this, url); },
      });
    } else {
      const play = proto.play;
      proto.play = function (this: HTMLMediaElement) {
        if (!stalls(this)) return play.call(this);
        return how === 'play' ? new Promise<void>(() => {}) : play.call(this).then(() => { this.playbackRate = 0; });
      };
    }
  }, [clips, how] as const);
}

/** From now on, the cats' clips `clips` fail in windows that open: the browser cannot decode them and says so. */
export async function failClips(app: ElectronApplication, clips: string[]): Promise<void> {
  await app.context().addInitScript(clips => {
    const src = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src')!;
    Object.defineProperty(HTMLMediaElement.prototype, 'src', {
      ...src,
      set(this: HTMLMediaElement, url: string) { src.set!.call(this, clips.includes(this.dataset.clip ?? '') ? 'data:video/webm;base64,AAAA' : url); },
    });
  }, clips);
}

/** A copy of the test packs with testcat's pack.json changed by `change` (say, a pose that reaches far right, like the box). */
export function packsWith(change: (pack: any) => void): string {
  const dir = mkdtempSync(join(tmpdir(), 'dpet-packs-'));
  cpSync(resolve('tests/fixtures/packs'), dir, { recursive: true });
  const file = join(dir, 'testcat', 'pack.json');
  const pack = JSON.parse(readFileSync(file, 'utf8'));
  change(pack);
  writeFileSync(file, JSON.stringify(pack));
  return dir;
}

/** A copy of the test packs in which testcat holds the reminders and testcat2 the memo. */
export function cardPacks(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dpet-cards-'));
  cpSync(resolve('tests/fixtures/packs'), dir, { recursive: true });
  for (const [id, card] of [['testcat', 'todo'], ['testcat2', 'memo']]) {
    const file = join(dir, id, 'pack.json');
    writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), card }));
  }
  return dir;
}

/** A user folder whose settings let the cards pop up by themselves only as given (by default never). */
export function cardUserDir(cards: { memo?: object; todo?: object } = {}): string {
  const userDir = mkdtempSync(join(tmpdir(), 'dpet-e2e-'));
  const never = { start: false, resume: false, unlock: false, back: false, daily: null };
  writeFileSync(join(userDir, 'settings.json'), JSON.stringify({ cards: { memo: { ...never, ...cards.memo }, todo: { ...never, ...cards.todo } } }));
  return userDir;
}

/** The window of a card ('memo' or 'todo') once it shows. */
export async function cardPage(app: ElectronApplication, kind: string): Promise<Page> {
  let found: Page | undefined;
  await expect.poll(async () => {
    for (const w of app.windows()) {
      if (!w.url().endsWith('/ui/card.html')) continue;
      if (await w.evaluate(() => document.body.dataset.kind).catch(() => undefined) === kind) { found = w; return true; }
    }
    return false;
  }, { timeout: 20_000 }).toBe(true);
  return found!;
}

/** The memo and reminders as kept in notes.json (null before the first save). */
export function readNotes(userDir: string): any {
  try { return JSON.parse(readFileSync(join(userDir, 'notes.json'), 'utf8')); } catch { return null; }
}

/** Everything the app has logged so far. */
export function readLog(userDir: string): string {
  const dir = join(userDir, 'logs');
  return readdirSync(dir).map(f => readFileSync(join(dir, f), 'utf8')).join('');
}

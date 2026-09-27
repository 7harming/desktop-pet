import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export async function launch(extraEnv: Record<string, string> = {}, userDir = mkdtempSync(join(tmpdir(), 'dpet-e2e-'))) {
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, DESKTOP_PET_PACKS: resolve('tests/fixtures/packs'), DESKTOP_PET_USERDATA: userDir, DESKTOP_PET_DEBUG: '1', ...extraEnv },
  });
  return { app, userDir };
}

/** The pet window of a given pack id, once it has initialised. */
export async function petPage(app: ElectronApplication, id = 'testcat'): Promise<Page> {
  let found: Page | undefined;
  await expect.poll(async () => {
    for (const w of app.windows()) {
      if (!w.url().endsWith('/ui/pet.html')) continue;
      const pid = await w.evaluate(() => (window as any).__pet?.id).catch(() => undefined);
      if (pid === id) { found = w; return true; }
    }
    return false;
  }, { timeout: 20_000 }).toBe(true);
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

/** Client coordinates of a point inside the cat's frame, given as shares of the frame (the frame sits somewhere in the strip). */
export function catPoint(page: Page, fx: number, fy: number): Promise<{ x: number; y: number }> {
  return page.evaluate(([u, v]) => {
    const r = document.getElementById('layer')!.getBoundingClientRect();
    return { x: r.left + u * r.width, y: r.top + v * r.height };
  }, [fx, fy]);
}

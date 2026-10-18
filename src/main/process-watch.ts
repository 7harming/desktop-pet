import type { App, WebContents } from 'electron';
import type { Logger } from './logger';

/** What each of the app's pages is called in the log. */
const PAGES: Record<string, string> = { 'panel.html': '控制面板', 'card.html': '卡片', 'toy.html': '逗貓棒', 'break.html': '休息畫面', 'pet.html': '貓咪視窗' };
/** A page that dies more often than this within RELOAD_WINDOW_MS is left as it is: loading it again would only go round in circles. */
const MAX_RELOADS = 3;
const RELOAD_WINDOW_MS = 60_000;

export const pageName = (url: string): string => PAGES[url.split(/[?#]/)[0].split('/').pop() ?? ''] ?? '某個頁面';

/** `times`: when this page was loaded again lately (kept up to date here); true if it may be once more now. */
export function mayReload(times: number[], now: number): boolean {
  while (times.length && now - times[0] >= RELOAD_WINDOW_MS) times.shift();
  if (times.length >= MAX_RELOADS) return false;
  times.push(now);
  return true;
}

/**
 * Every page whose process dies (the computer short of memory after a long sleep, ...) is loaded again, and the log says so: a
 * control panel or card left without its page showed only white until the app was killed (a Mac left idle a while, 2026-10-18).
 * A cat's window is made anew by the controller instead (PetWindow's 'render-process-gone'). The app's other processes dying (the
 * GPU's, which draws the windows) and pages not answering go in the log too.
 */
export function watchProcesses(app: App, log: Logger, now: () => number = Date.now): void {
  app.on('child-process-gone', (_e, d) =>
    log.error(`程式的 ${d.type} 程序停了（${d.reason}，結束代碼 ${d.exitCode}${d.name ? `，${d.name}` : ''}）`));
  app.on('web-contents-created', (_e, wc) => watchPage(wc, log, now));
}

function watchPage(wc: WebContents, log: Logger, now: () => number): void {
  const reloads: number[] = [];
  wc.on('render-process-gone', (_e, d) => {
    if (d.reason === 'clean-exit') return;
    const name = pageName(wc.getURL());
    log.error(`${name}的頁面停了（${d.reason}，結束代碼 ${d.exitCode}）`);
    if (name === PAGES['pet.html'] || wc.isDestroyed()) return;
    if (!mayReload(reloads, now())) { log.error(`${name}的頁面一直停，不再重新載入`); return; }
    wc.reload();
  });
  wc.on('unresponsive', () => log.warn(`${pageName(wc.getURL())}沒有回應`));
  wc.on('responsive', () => log.info(`${pageName(wc.getURL())}恢復回應`));
}

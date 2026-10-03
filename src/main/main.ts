import { app } from 'electron';
import { handleAppProtocol, registerSchemePrivileges } from './app-protocol';
import { AppController } from './controller';
import { Logger } from './logger';
import { resolvePaths } from './paths';

registerSchemePrivileges();
const paths = resolvePaths();
const debug = process.env.DESKTOP_PET_DEBUG === '1';
// Must match build.appId, so notifications carry the installed app's name and icon.
app.setAppUserModelId('local.desktoppet');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let controller: AppController | null = null;
  app.on('second-instance', () => controller?.summon());
  // macOS: opening the app again (or clicking its Dock icon) while it runs does not start a second instance
  app.on('activate', () => controller?.summon());
  void app.whenReady().then(() => {
    const log = new Logger(paths.logsDir);
    log.info(`啟動 ${app.getVersion()}`);
    // an error here would otherwise pop up Electron's error box, which holds up the whole app, and leave nothing in the log
    const logError = (e: unknown) => {
      const where = e instanceof Error ? e.stack?.split('\n')[1]?.trim() : undefined;
      log.error(`主程式出錯：${e instanceof Error ? e.message : String(e)}${where ? `（${where}）` : ''}`);
    };
    process.on('uncaughtException', logError);
    process.on('unhandledRejection', logError);
    handleAppProtocol({ ui: paths.uiDir, packs: paths.packsDir });
    controller = new AppController(paths, log, debug);
    if (debug) (globalThis as Record<string, unknown>).__controller = controller;
    controller.start();
    app.on('before-quit', () => controller?.flush());
  });
}

// Pets live in small windows; keep running when the panel is closed.
app.on('window-all-closed', () => {});

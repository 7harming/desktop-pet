import { app } from 'electron';
import { handleAppProtocol, registerSchemePrivileges } from './app-protocol';
import { AppController } from './controller';
import { Logger } from './logger';
import { resolvePaths } from './paths';

registerSchemePrivileges();
const paths = resolvePaths();
const debug = process.env.DESKTOP_PET_DEBUG === '1';

void app.whenReady().then(() => {
  const log = new Logger(paths.logsDir);
  log.info(`啟動 ${app.getVersion()}`);
  handleAppProtocol({ ui: paths.uiDir, packs: paths.packsDir });
  const controller = new AppController(paths, log, debug);
  if (debug) (globalThis as Record<string, unknown>).__controller = controller;
  controller.start();
  app.on('before-quit', () => controller.flush());
});

// Pets live in small windows; keep running when the panel is closed.
app.on('window-all-closed', () => {});

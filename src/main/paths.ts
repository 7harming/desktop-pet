import { app } from 'electron';
import { join, resolve } from 'node:path';

export interface AppPaths { packsDir: string; userDir: string; logsDir: string; settingsFile: string; uiDir: string }

/** Call before app 'ready' (it redirects Chromium's userData too). */
export function resolvePaths(): AppPaths {
  const userDir = process.env.DESKTOP_PET_USERDATA ? resolve(process.env.DESKTOP_PET_USERDATA) : join(app.getPath('appData'), 'desktop-pet');
  app.setPath('userData', userDir);
  const packsDir = process.env.DESKTOP_PET_PACKS
    ? resolve(process.env.DESKTOP_PET_PACKS)
    : app.isPackaged ? join(process.resourcesPath, 'packs') : join(app.getAppPath(), 'packs');
  return { packsDir, userDir, logsDir: join(userDir, 'logs'), settingsFile: join(userDir, 'settings.json'), uiDir: __dirname };
}

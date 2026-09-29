import { contextBridge, ipcRenderer } from 'electron';
import type { BreakApi } from '../shared/ipc';

const api: BreakApi = {
  onInit: cb => { ipcRenderer.on('break:init', (_e, init) => cb(init)); },
  ready: () => ipcRenderer.send('break:ready'),
  done: () => ipcRenderer.send('break:done'),
  log: (level, message) => ipcRenderer.send('break:log', level, message),
};
contextBridge.exposeInMainWorld('breakApi', api);

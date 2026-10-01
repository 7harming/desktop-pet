import { contextBridge, ipcRenderer } from 'electron';
import type { ToyApi } from '../shared/ipc';

const api: ToyApi = {
  ready: () => ipcRenderer.send('toy:ready'),
  setInteractive: on => ipcRenderer.send('toy:set-interactive', on),
  moveTo: (x, y) => ipcRenderer.send('toy:move', x, y),
  feather: (x, y, speed) => ipcRenderer.send('toy:feather', x, y, speed),
};
contextBridge.exposeInMainWorld('toyApi', api);

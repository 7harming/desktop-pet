import { contextBridge, ipcRenderer } from 'electron';
import type { CardApi } from '../shared/ipc';

const api: CardApi = {
  onState: cb => { ipcRenderer.on('card:state', (_e, s) => cb(s)); },
  onFocus: cb => { ipcRenderer.on('card:focus', () => cb()); },
  ready: () => ipcRenderer.send('card:ready'),
  act: action => ipcRenderer.send('card:act', action),
  resize: height => ipcRenderer.send('card:resize', height),
  hot: on => ipcRenderer.send('card:hot', on),
  close: () => ipcRenderer.send('card:close'),
};
contextBridge.exposeInMainWorld('cardApi', api);

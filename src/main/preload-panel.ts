import { contextBridge, ipcRenderer } from 'electron';
import type { PanelApi } from '../shared/ipc';

const api: PanelApi = {
  getState: () => ipcRenderer.invoke('panel:get-state'),
  act: action => ipcRenderer.invoke('panel:act', action),
  onState: cb => { ipcRenderer.on('panel:state', (_e, s) => cb(s)); },
};
contextBridge.exposeInMainWorld('panelApi', api);

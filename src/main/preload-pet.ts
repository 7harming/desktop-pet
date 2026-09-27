import { contextBridge, ipcRenderer } from 'electron';
import type { PetApi } from '../shared/ipc';

const listen = (channel: string, cb: (...args: any[]) => void) => { ipcRenderer.on(channel, (_e, ...args) => cb(...args)); };

const api: PetApi = {
  onInit: cb => listen('pet:init', cb),
  onCommand: cb => listen('pet:command', cb),
  onSetAuto: cb => listen('pet:set-auto', cb),
  onReminder: cb => listen('pet:reminder', cb),
  onPause: cb => listen('pet:pause', cb),
  onRestY: cb => listen('pet:rest-y', cb),
  ready: () => ipcRenderer.send('pet:ready'),
  setInteractive: interactive => ipcRenderer.send('pet:set-interactive', interactive),
  moveWindow: (x, y) => ipcRenderer.send('pet:move', x, y),
  dragEnded: () => ipcRenderer.send('pet:drag-end'),
  openMenu: () => ipcRenderer.send('pet:menu'),
  reportStatus: label => ipcRenderer.send('pet:status', label),
  reminderResult: (type, result) => ipcRenderer.send('pet:reminder-result', type, result),
  log: (level, message) => ipcRenderer.send('pet:log', level, message),
};
contextBridge.exposeInMainWorld('petApi', api);

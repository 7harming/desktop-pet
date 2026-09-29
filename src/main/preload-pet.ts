import { contextBridge, ipcRenderer } from 'electron';
import type { PetApi } from '../shared/ipc';

const listen = (channel: string, cb: (...args: any[]) => void) => { ipcRenderer.on(channel, (_e, ...args) => cb(...args)); };

const api: PetApi = {
  onInit: cb => listen('pet:init', cb),
  onCommand: cb => listen('pet:command', cb),
  onSetAuto: cb => listen('pet:set-auto', cb),
  onSetActions: cb => listen('pet:set-actions', cb),
  onSetInterval: cb => listen('pet:set-interval', cb),
  onReminder: cb => listen('pet:reminder', cb),
  onReminderClose: cb => listen('pet:reminder-close', cb),
  onPause: cb => listen('pet:pause', cb),
  onRestY: cb => listen('pet:rest-y', cb),
  onFrameX: cb => listen('pet:frame-x', cb),
  onExit: cb => listen('pet:exit', cb),
  onFightReady: cb => listen('pet:fight-ready', cb),
  onFightGo: cb => listen('pet:fight-go', cb),
  onFightCancel: cb => listen('pet:fight-cancel', cb),
  ready: () => ipcRenderer.send('pet:ready'),
  setInteractive: interactive => ipcRenderer.send('pet:set-interactive', interactive),
  moveWindow: y => ipcRenderer.send('pet:move', y),
  dragEnded: frameX => ipcRenderer.send('pet:drag-end', frameX),
  exited: () => ipcRenderer.send('pet:exited'),
  openMenu: () => ipcRenderer.send('pet:menu'),
  reportStatus: label => ipcRenderer.send('pet:status', label),
  reminderResult: (type, result) => ipcRenderer.send('pet:reminder-result', type, result),
  log: (level, message) => ipcRenderer.send('pet:log', level, message),
  fightState: state => ipcRenderer.send('pet:fight-state', state),
};
contextBridge.exposeInMainWorld('petApi', api);

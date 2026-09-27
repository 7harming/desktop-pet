import type { PanelApi, PetApi } from '../shared/ipc';

declare global {
  interface Window { petApi: PetApi; panelApi: PanelApi }
}
export {};

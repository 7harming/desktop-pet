import type { BreakApi, PanelApi, PetApi } from '../shared/ipc';

declare global {
  interface Window { petApi: PetApi; panelApi: PanelApi; breakApi: BreakApi }
}
export {};

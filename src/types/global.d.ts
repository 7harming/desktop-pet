import type { BreakApi, CardApi, PanelApi, PetApi } from '../shared/ipc';

declare global {
  interface Window { petApi: PetApi; panelApi: PanelApi; breakApi: BreakApi; cardApi: CardApi }
}
export {};

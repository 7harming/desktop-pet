import type { BreakApi, CardApi, PanelApi, PetApi, ToyApi } from '../shared/ipc';

declare global {
  interface Window { petApi: PetApi; panelApi: PanelApi; breakApi: BreakApi; cardApi: CardApi; toyApi: ToyApi }
}
export {};

import type { Command, PounceSide } from './types';

/** Menus, panel buttons and ticks name every command by one string: its pose, or `pounce:left` / `pounce:right`. */
export const actionKey = (c: Command): string => (c.pounce ? `pounce:${c.pounce}` : c.pose!);

export function pounceSide(key: string): PounceSide | null {
  return key === 'pounce:left' ? 'left' : key === 'pounce:right' ? 'right' : null;
}

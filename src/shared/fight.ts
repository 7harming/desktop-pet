import type { FightDef, PounceSide } from './types';

/** A cat on the desktop as the play-fight check sees it: where its resting body spans on screen, in px. */
export interface CatSpot { id: string; left: number; right: number }
/** Two cats close enough to play-fight: `left` is the one on the left, which turns right to face `right`. */
export interface FightPair { left: string; right: string; gap: number }

/**
 * The two cats closest together whose bodies are at most `reach` times the narrower one's width apart (overlapping counts as
 * close), or null.
 */
export function closestPair(cats: CatSpot[], reach = 1): FightPair | null {
  let best: FightPair | null = null;
  for (let i = 0; i < cats.length; i++) {
    for (let j = i + 1; j < cats.length; j++) {
      const [a, b] = cats[i].left + cats[i].right <= cats[j].left + cats[j].right ? [cats[i], cats[j]] : [cats[j], cats[i]];
      const gap = b.left - a.right;
      if (gap > reach * Math.min(a.right - a.left, b.right - b.left)) continue;
      if (!best || gap < best.gap) best = { left: a.id, right: b.id, gap };
    }
  }
  return best;
}

/** The clip for a cat that faces `side` (the other cat is on that side). */
export const fightClip = (f: FightDef, side: PounceSide) => (side === 'left' ? f.toLeft : f.toRight);

import base from '../fixtures/test-pack.json';
import type { Pack } from '../../src/shared/types';

/** A fresh deep copy of the test pack, safe to mutate in a test. */
export function makePack(): Pack {
  return structuredClone(base) as unknown as Pack;
}

/** An rng that always returns the same value. */
export const constRng = (v: number) => () => v;

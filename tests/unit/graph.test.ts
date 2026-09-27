import { describe, it, expect } from 'vitest';
import { reachable, findPath, pathToSteps, idleStep } from '../../src/shared/graph';
import { makePack } from './fixtures';

const pack = makePack();

describe('findPath', () => {
  it('goes through a fade edge to reach a prop pose', () => {
    const path = findPath(pack.edges, 'rest', 'perch')!;
    expect(path.map(e => `${e.from}>${e.to}`)).toEqual(['rest>restProp', 'restProp>perch']);
  });
  it('returns an empty path when already there', () => {
    expect(findPath(pack.edges, 'sit', 'sit')).toEqual([]);
  });
  it('returns null when a broken clip blocks the only way', () => {
    expect(findPath(pack.edges, 'rest', 'perch', new Set(['go_perch']))).toBeNull();
  });
  it('returns null for an unknown target', () => {
    expect(findPath(pack.edges, 'rest', 'moon')).toBeNull();
  });
});

describe('reachable', () => {
  it('walks forwards and backwards', () => {
    expect([...reachable(pack.edges, 'rest')].sort()).toEqual(['perch', 'rest', 'restProp', 'sit']);
    expect(reachable(pack.edges, 'perch', true).has('rest')).toBe(true);
  });
});

describe('pathToSteps', () => {
  it('folds a leading fade into the next clip', () => {
    const { steps, pendingFade } = pathToSteps(pack, findPath(pack.edges, 'rest', 'perch')!);
    expect(steps).toEqual([{ clip: 'go_perch', from: 'restProp', to: 'perch', rate: 0.8, fadeIn: 0.5 }]);
    expect(pendingFade).toBe(0);
  });
  it('returns a trailing fade as pendingFade', () => {
    const { steps, pendingFade } = pathToSteps(pack, findPath(pack.edges, 'perch', 'rest')!);
    expect(steps).toEqual([{ clip: 'leave_perch', from: 'perch', to: 'restProp', rate: 1, fadeIn: 0 }]);
    expect(pendingFade).toBe(0.5);
  });
  it('builds idle steps', () => {
    expect(idleStep(pack, 'sit', 'idle_sit', 0.5)).toEqual({ clip: 'idle_sit', from: 'sit', to: 'sit', rate: 1, fadeIn: 0.5 });
  });
});

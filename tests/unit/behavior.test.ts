import { describe, it, expect } from 'vitest';
import { BehaviorEngine } from '../../src/shared/behavior';
import { makePack, constRng } from './fixtures';

describe('BehaviorEngine', () => {
  it('starts with an idle of the start pose', () => {
    const e = new BehaviorEngine(makePack(), constRng(0));
    expect(e.start()).toEqual({ clip: 'idle_rest', from: 'rest', to: 'rest', rate: 1, fadeIn: 0 });
    expect(e.endPose).toBe('rest');
  });

  it('only loops idles when auto is off', () => {
    const e = new BehaviorEngine(makePack(), constRng(0.99));
    e.auto = false; e.start();
    for (let i = 0; i < 5; i++) expect(e.next().to).toBe('rest');
  });

  it('stays when the roll is below stay', () => {
    const e = new BehaviorEngine(makePack(), constRng(0)); e.start();
    expect(e.next()).toMatchObject({ from: 'rest', to: 'rest' });
  });

  it('moves to a weighted target when the roll is above stay', () => {
    // rng 0.99: leave rest (0.99 >= 0.7); targets perch(2) + sit(1): 0.99*3 = 2.97 lands on sit
    const e = new BehaviorEngine(makePack(), constRng(0.99)); e.start();
    expect(e.next().clip).toBe('rest_to_sit');
    expect(e.next()).toMatchObject({ clip: 'idle_sit', from: 'sit', to: 'sit' });
  });

  it('walks a command through the fade edge', () => {
    const e = new BehaviorEngine(makePack(), constRng(0)); e.start();
    expect(e.command('perch')).toBe(true);
    expect(e.next()).toEqual({ clip: 'go_perch', from: 'restProp', to: 'perch', rate: 0.8, fadeIn: 0.5 });
    expect(e.next()).toMatchObject({ clip: 'idle_perch', fadeIn: 0 });
    expect(e.command('rest')).toBe(true);
    expect(e.next()).toMatchObject({ clip: 'leave_perch', fadeIn: 0 });
    expect(e.next()).toMatchObject({ clip: 'idle_rest', fadeIn: 0.5 });
  });

  it('plans a command from the pose after the current clip', () => {
    const e = new BehaviorEngine(makePack(), constRng(0)); e.start();
    e.command('perch'); e.next();                        // now playing go_perch
    e.command('sit');                                    // replaces the queued idle_perch
    expect(e.next().clip).toBe('leave_perch');
    expect(e.next()).toMatchObject({ clip: 'rest_to_sit', fadeIn: 0.5 });
    expect(e.next().clip).toBe('idle_sit');
  });

  it('avoids broken clips', () => {
    const e = new BehaviorEngine(makePack(), constRng(0)); e.start();
    e.markBroken('go_perch');
    expect(e.command('perch')).toBe(false);
    expect(e.next().to).toBe('rest');
  });

  it('lists clips worth preloading', () => {
    const e = new BehaviorEngine(makePack(), constRng(0)); e.start();
    expect(e.upcomingClips().sort()).toEqual(['go_perch', 'idle_rest', 'idle_rest2', 'rest_to_sit']);
  });
});

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

  it('moves only between the allowed poses', () => {
    // rng 0.99 leaves rest; with only perch allowed besides rest, perch is the one target
    const e = new BehaviorEngine(makePack(), constRng(0.99)); e.start();
    e.setAllowed(['rest', 'perch']);
    expect(e.next().clip).toBe('go_perch');
  });

  it('does not linger in a pose that is not allowed', () => {
    // rng 0 would stay, but rest is not ticked
    const e = new BehaviorEngine(makePack(), constRng(0)); e.start();
    e.setAllowed(['sit']);
    expect(e.next().clip).toBe('rest_to_sit');
    expect(e.next()).toMatchObject({ clip: 'idle_sit', to: 'sit' });
    expect(e.next()).toMatchObject({ clip: 'idle_sit', to: 'sit' });
  });

  it('lets a commanded pose stay even when it is not ticked', () => {
    const e = new BehaviorEngine(makePack(), constRng(0)); e.start();
    e.setAllowed(['rest']);
    e.command('sit');
    expect(e.next().clip).toBe('rest_to_sit');
    expect(e.next().clip).toBe('idle_sit');
    expect(e.next().clip).toBe('idle_sit');
  });

  it('visits a pose and comes back to where it was', () => {
    // rng 0.99: no longer than the one idle the visit plans
    const e = new BehaviorEngine(makePack(), constRng(0.99)); e.start();
    e.command('sit'); e.next(); e.next();               // resting in sit
    expect(e.visit('perch')).toBe(true);
    expect(e.next().clip).toBe('sit_to_rest');
    expect(e.next()).toMatchObject({ clip: 'go_perch', fadeIn: 0.5 });
    expect(e.next().clip).toBe('idle_perch');
    expect(e.next().clip).toBe('leave_perch');
    expect(e.next()).toMatchObject({ clip: 'rest_to_sit', fadeIn: 0.5 });
    expect(e.next().clip).toBe('idle_sit');
  });

  it('lingers on a visit while the roll is below stay', () => {
    const e = new BehaviorEngine(makePack(), constRng(0)); e.start();
    e.visit('perch');
    expect(e.next().clip).toBe('go_perch');
    expect(e.next().clip).toBe('idle_perch');
    expect(e.next().clip).toBe('idle_perch');
  });

  it('comes back from a visit even when auto is off', () => {
    const e = new BehaviorEngine(makePack(), constRng(0.99)); e.auto = false; e.start();
    e.visit('perch');
    expect(e.next().clip).toBe('go_perch');
    expect(e.next().clip).toBe('idle_perch');
    expect(e.next().clip).toBe('leave_perch');
    expect(e.next()).toMatchObject({ to: 'rest', fadeIn: 0.5 });
    expect(e.next()).toMatchObject({ from: 'rest', to: 'rest' });
  });

  it('keeps the first way back when visited again', () => {
    const e = new BehaviorEngine(makePack(), constRng(0.99)); e.auto = false; e.start();
    e.visit('perch');
    expect(e.next().clip).toBe('go_perch');
    e.visit('perch');                                    // a second reminder on the way there
    expect(e.next().clip).toBe('idle_perch');
    expect(e.next().clip).toBe('leave_perch');
    expect(e.next()).toMatchObject({ to: 'rest' });
  });

  it('forgets the way back when told to go elsewhere', () => {
    const e = new BehaviorEngine(makePack(), constRng(0.99)); e.auto = false; e.start();
    e.visit('perch'); e.next();
    e.command('sit');
    expect(e.next().clip).toBe('leave_perch');
    expect(e.next().clip).toBe('rest_to_sit');
    expect(e.next().clip).toBe('idle_sit');
    expect(e.next().clip).toBe('idle_sit');              // auto off: it stays where it was told
  });

  it('treats an empty or unknown selection as every pose', () => {
    const e = new BehaviorEngine(makePack(), constRng(0.99)); e.start();
    e.setAllowed(['nope']);
    expect(e.next().clip).toBe('rest_to_sit');
  });

  it('takes over after a clip it did not choose (walking in)', () => {
    const e = new BehaviorEngine(makePack(), constRng(0));
    e.follow({ clip: 'walk_arrive', from: '__walk', to: 'rest', rate: 1, fadeIn: 0 });
    expect(e.endPose).toBe('rest');
    expect(e.next()).toMatchObject({ from: 'rest', to: 'rest' });
  });

  it('lists clips worth preloading', () => {
    const e = new BehaviorEngine(makePack(), constRng(0)); e.start();
    expect(e.upcomingClips().sort()).toEqual(['go_perch', 'idle_rest', 'idle_rest2', 'rest_to_sit']);
  });
});

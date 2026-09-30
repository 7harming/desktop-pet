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

  it('comes back from a brief pose it was told to go to', () => {
    const p = makePack(); p.poses.sit.brief = true;
    const e = new BehaviorEngine(p, constRng(0.99)); e.auto = false; e.start();
    e.command('sit');
    expect(e.next().clip).toBe('rest_to_sit');
    expect(e.next().clip).toBe('idle_sit');
    expect(e.next().clip).toBe('sit_to_rest');
    expect(e.next()).toMatchObject({ from: 'rest', to: 'rest' });
  });

  it('goes back to where it was after a brief pose it picked by itself', () => {
    // rng 0.99 picks sit from rest; from an ordinary sit it would go on to perch (see above), from a brief one it goes back
    const p = makePack(); p.poses.sit.brief = true;
    const e = new BehaviorEngine(p, constRng(0.99)); e.start();
    expect(e.next().clip).toBe('rest_to_sit');
    expect(e.next().clip).toBe('idle_sit');
    expect(e.next().clip).toBe('sit_to_rest');
    expect(e.next()).toMatchObject({ from: 'rest', to: 'rest' });
  });

  it('dissolves back into its start pose from a brief visit whose one way back has broken', () => {
    // 小昭's stretch: stretch_exit had failed once, and every stretch after that held on for good
    const p = makePack(); p.poses.sit.brief = true;
    const e = new BehaviorEngine(p, constRng(0.99)); e.auto = false; e.start();
    const stranded: string[] = [];
    e.onStranded = pose => stranded.push(pose);
    e.markBroken('sit_to_rest');
    expect(e.visit('sit')).toBe(true);
    expect(e.next().clip).toBe('rest_to_sit');
    expect(e.next().clip).toBe('idle_sit');
    expect(e.next()).toMatchObject({ from: 'rest', to: 'rest', fadeIn: 0.5 });
    expect(e.next()).toMatchObject({ from: 'rest', to: 'rest', fadeIn: 0 });
    expect(stranded).toEqual(['sit']);
  });

  it('keeps the way back of a visit when told to go somewhere it cannot get to', () => {
    const p = makePack(); p.poses.sit.brief = true;
    const e = new BehaviorEngine(p, constRng(0.99)); e.auto = false; e.start();
    e.markBroken('sit_to_rest');
    e.visit('sit'); e.next(); e.next();                  // holding the brief pose, no way out of it
    expect(e.command('perch')).toBe(false);
    expect(e.next()).toMatchObject({ from: 'rest', to: 'rest', fadeIn: 0.5 });
  });

  it('dissolves back into its start pose in auto mode when every way on has broken', () => {
    const e = new BehaviorEngine(makePack(), constRng(0.99)); e.start();
    expect(e.next().clip).toBe('rest_to_sit');
    e.markBroken('sit_to_rest');                         // sit has no way on now: rather than sit there for good
    expect(e.next()).toMatchObject({ from: 'rest', to: 'rest', fadeIn: 0.5 });
  });

  it('interjects a pounce while resting, then carries on', () => {
    const e = new BehaviorEngine(makePack(), constRng(0)); e.start();
    expect(e.interject('pounce_right', 'rest')).toEqual({ clip: 'pounce_right', from: 'rest', to: 'rest', rate: 1, fadeIn: 0 });
    expect(e.next()).toMatchObject({ from: 'rest', to: 'rest' });
    expect(e.interject('pounce_left', 'rest')).toMatchObject({ clip: 'pounce_left' });
  });

  it('does not interject unless resting in that pose with nothing planned', () => {
    const e = new BehaviorEngine(makePack(), constRng(0)); e.start();
    expect(e.interject('pounce_right', 'sit')).toBeNull();          // resting, but not in that pose
    e.command('sit');
    expect(e.interject('pounce_right', 'rest')).toBeNull();         // about to go somewhere
    e.next();                                                       // rest_to_sit
    expect(e.interject('pounce_right', 'rest')).toBeNull();
    const f = new BehaviorEngine(makePack(), constRng(0)); f.start();
    f.interject('pounce_right', 'rest');
    expect(f.interject('pounce_left', 'rest')).toBeNull();          // already pouncing
  });

  it('pounces on command: at once while resting, otherwise once it is back in that pose', () => {
    const e = new BehaviorEngine(makePack(), constRng(0)); e.start();
    expect(e.perform('pounce_left', 'rest')).toMatchObject({ clip: 'pounce_left', from: 'rest', to: 'rest' });
    e.next();
    e.command('sit'); e.next(); e.next();                           // rest_to_sit, idle_sit
    expect(e.perform('pounce_right', 'rest')).toBeNull();           // queued behind the way back
    expect(e.next().clip).toBe('sit_to_rest');
    expect(e.next()).toMatchObject({ clip: 'pounce_right', from: 'rest', to: 'rest' });
  });

  it('pounces now and then by itself while resting, only to the ticked sides', () => {
    const p = makePack(); p.pounce!.autoChance = 0.5;
    const rolls = [0, 0, 0.1, 0.9];                                 // start's idle, stay, pounce (0.1 < 0.5), which side
    const e = new BehaviorEngine(p, () => rolls.shift() ?? 0.99); e.start();
    e.setAllowed(['rest', 'pounce:right']);
    expect(e.next()).toMatchObject({ clip: 'pounce_right', from: 'rest', to: 'rest' });
    const f = new BehaviorEngine(p, constRng(0)); f.start();
    f.setAllowed(['rest']);                                         // no pounce ticked
    expect(f.next().clip).toMatch(/^idle_rest/);
    const g = new BehaviorEngine(makePack(), constRng(0)); g.start(); // no autoChance in the pack
    expect(g.next().clip).toMatch(/^idle_rest/);
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

describe('BehaviorEngine with a dwell', () => {
  it('rests in a pose about the dwell, then moves on', () => {
    // rng 0.99 would leave rest at once by the stay roll (0.99 >= 0.7); with a dwell the time decides. Rest: 30 s x 1.147
    let t = 0;
    const e = new BehaviorEngine(makePack(), constRng(0.99), () => t);
    e.setDwell(30); e.start();
    t = 20_000; expect(e.next()).toMatchObject({ from: 'rest', to: 'rest' });
    t = 34_000; expect(e.next()).toMatchObject({ from: 'rest', to: 'rest' });
    t = 35_000; expect(e.next().clip).toBe('rest_to_sit');
    expect(e.next()).toMatchObject({ clip: 'idle_sit', to: 'sit' });       // a new rest begins at 35 s
    t = 50_000; expect(e.next()).toMatchObject({ clip: 'idle_sit', to: 'sit' });
    t = 70_000; expect(e.next().to).not.toBe('sit');
  });

  it('never rests in a pose whose stay is 0', () => {
    const p = makePack(); p.poses.rest.stay = 0;
    const e = new BehaviorEngine(p, constRng(0.99), () => 0);
    e.setDwell(30); e.start();
    expect(e.next().clip).toBe('rest_to_sit');       // no time has passed, but rest is only passed through
  });

  it('keeps the stay rolls for brief visits', () => {
    const e = new BehaviorEngine(makePack(), constRng(0.99), () => 0);
    e.setDwell(30); e.start();
    e.visit('perch');
    expect(e.next().clip).toBe('go_perch');
    expect(e.next().clip).toBe('idle_perch');
    expect(e.next().clip).toBe('leave_perch');        // 0.99 >= perch's stay, though no time has passed
  });

  it('shortens the rest under way when the dwell is shortened', () => {
    // rng 0.5: the rest is exactly the dwell; 0.5 x (perch 2 + sit 1) = 1.5 picks perch
    let t = 0;
    const e = new BehaviorEngine(makePack(), constRng(0.5), () => t);
    e.setDwell(60); e.start();
    t = 40_000; expect(e.next()).toMatchObject({ from: 'rest', to: 'rest' });
    e.setDwell(30);
    expect(e.next().clip).toBe('go_perch');
  });
});

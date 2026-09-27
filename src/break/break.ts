import { BehaviorEngine } from '../shared/behavior';
import type { Step } from '../shared/graph';
import type { BreakInit } from '../shared/ipc';
import { planWalkIn, planWalkOut } from '../shared/walk-plan';
import { Player } from '../pet/player';
import { Walker } from '../pet/walker';

const api = window.breakApi;
const $ = (id: string) => document.getElementById(id)!;

/** The lying cat fills this share of the screen height. */
const CAT_HEIGHT = 0.6;

api.onInit((init: BreakInit) => {
  const { pack } = init;
  const start = pack.poses[pack.start];
  const walk = pack.walk;
  const sw = window.innerWidth;
  const sh = window.innerHeight;
  // `head` is how high the lying cat reaches above its ground line, as a share of the frame height
  const frameH = Math.round((CAT_HEIGHT * sh) / start.head);
  const frameW = Math.round(frameH * pack.frame.aspect);
  const restX = Math.round(sw / 2 - start.centerX * frameW);   // the lying cat centred on the screen
  const area = $('walkarea');
  Object.assign(area.style, { top: `${Math.round(sh * 0.97 - start.ground * frameH)}px`, height: `${frameH}px` });
  const cat = $('cat');
  Object.assign(cat.style, { left: `${restX}px`, width: `${frameW}px`, height: `${frameH}px` });

  const engine = new BehaviorEngine(pack, Math.random);
  engine.auto = false;                   // it just lies there, with its idles
  const player = new Player($('layer'), pack, init.packUrl);
  const walker = walk ? new Walker(area, new URL(pack.clips[walk.loop].file, init.packUrl).href, walk) : null;
  const clipStep = (clip: string, from: string, to: string): Step => ({ clip, from, to, rate: pack.clips[clip].rate ?? 1, fadeIn: 0 });
  const loops = (origins: number[], mirror: boolean, onFirstFrame?: () => void) =>
    walker!.run({ origins, frameW, frameH, ground: start.ground, mirror, onFirstFrame });
  if (init.debug) (window as unknown as Record<string, unknown>).__break = { engine, player, walker };

  // arriving: walking in or lying down; resting; leaving: getting up; gone
  let phase: 'arriving' | 'resting' | 'leaving' | 'gone' = 'arriving';
  let timeUp = false;
  const depart = () => {
    phase = 'leaving';
    if (walk) void player.play(clipStep(walk.depart, pack.start, pack.start));
    else finish();
  };
  const finish = () => { phase = 'gone'; api.done(); };
  player.onStepStart = () => player.keep([...engine.upcomingClips(), ...(walk ? [walk.depart] : [])]);
  player.onEnded = () => {
    if (phase === 'leaving') {
      void loops(planWalkOut(walk!, frameW, restX), true, () => { cat.style.visibility = 'hidden'; }).then(finish);
      return;
    }
    if (phase === 'arriving') phase = 'resting';
    if (timeUp) { depart(); return; }
    void player.play(engine.next());
  };
  player.onError = () => finish();

  /** Time is up (or skipped): go now if lying there, else as soon as it has lain down. */
  const end = () => {
    if (timeUp) return;
    timeUp = true;
    $('skip').style.visibility = 'hidden';
    if (phase === 'resting') depart();
  };
  $('skip').addEventListener('click', end);

  const countdown = $('countdown');
  const until = Date.now() + init.seconds * 1000;
  const tick = () => {
    const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
    countdown.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    if (left === 0) end(); else setTimeout(tick, 200);
  };
  tick();
  $('line').textContent = init.line;
  document.body.classList.add('on');

  const arrive = async () => {
    if (!walk) { phase = 'resting'; void player.play(engine.start()); return; }
    player.keep([walk.arrive]);
    cat.style.visibility = 'hidden';
    await loops(planWalkIn(walk, frameW, restX), false);
    cat.style.visibility = '';
    const step = clipStep(walk.arrive, pack.start, pack.start);
    engine.follow(step);
    await player.play(step);
    walker!.clear();
  };
  void arrive();
});

api.ready();

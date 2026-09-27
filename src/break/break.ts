import { BehaviorEngine } from '../shared/behavior';
import type { Step } from '../shared/graph';
import type { BreakInit } from '../shared/ipc';
import { arriveGlidePx, departGlidePx, planWalkIn, planWalkOut, type WalkPlan } from '../shared/walk-plan';
import { Player } from '../pet/player';
import { Walker } from '../pet/walker';

const api = window.breakApi;
const $ = (id: string) => document.getElementById(id)!;

/** The lying cat fills this share of the screen height. */
const CAT_HEIGHT = 0.6;

api.onInit((init: BreakInit) => {
  // the cat is drawn big here: use the pack's high-resolution copies where it has them
  const pack = { ...init.pack, clips: Object.fromEntries(Object.entries(init.pack.clips).map(([id, c]) =>
    [id, init.pack.hd?.[id] ? { ...c, file: init.pack.hd[id] } : c])) };
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
  const loops = (plan: WalkPlan, mirror: boolean, onFirstFrame?: () => void) =>
    walker!.run({ plan, frameW, frameH, ground: start.ground, mirror, onFirstFrame });
  if (init.debug) (window as unknown as Record<string, unknown>).__break = { engine, player, walker };

  const clipUrl = (clip: string) => new URL(pack.clips[clip].file, init.packUrl).href;

  // arriving: walking in and lying down; resting; leaving: getting up and walking off
  let phase: 'arriving' | 'resting' | 'leaving' = 'arriving';
  let timeUp = false;
  const finish = () => api.done();
  const depart = async () => {
    phase = 'leaving';
    if (!walk) { finish(); return; }
    // depart takes over from the lying cat's own clip, then the mirrored loop walks it off
    await walker!.playClip({ url: clipUrl(walk.depart), base: restX, glide: walk.departGlide, frameW, frameH, ground: start.ground,
      onFirstFrame: () => { cat.style.visibility = 'hidden'; } });
    await loops(planWalkOut(walk, frameW, restX + departGlidePx(walk, frameW), await walker!.duration()), true);
    finish();
  };
  player.onStepStart = () => player.keep(engine.upcomingClips());
  player.onEnded = () => {
    if (phase !== 'resting') return;
    if (timeUp) { void depart(); return; }
    void player.play(engine.next());
  };
  player.onError = () => finish();

  /** Time is up (or skipped): go now if lying there, else as soon as it has lain down. */
  const end = () => {
    if (timeUp) return;
    timeUp = true;
    $('skip').style.visibility = 'hidden';
    if (phase === 'resting') void depart();
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
    cat.style.visibility = 'hidden';
    walker!.preload(clipUrl(walk.arrive));
    walker!.preload(clipUrl(walk.depart));
    const from = restX - arriveGlidePx(walk, frameW);     // arrive glides from here to the middle of the screen
    await loops(planWalkIn(walk, frameW, from, await walker!.duration()), false);
    await walker!.playClip({ url: clipUrl(walk.arrive), base: from, glide: walk.arriveGlide, frameW, frameH, ground: start.ground });
    cat.style.visibility = '';
    engine.follow(clipStep(walk.arrive, pack.start, pack.start));
    phase = 'resting';
    await player.play(engine.next());   // its first idle covers the walker's last frame
    walker!.clear();
    if (timeUp) void depart();
  };
  void arrive();
});

api.ready();

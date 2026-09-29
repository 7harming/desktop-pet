import { BehaviorEngine } from '../shared/behavior';
import type { BreakInit } from '../shared/ipc';
import type { Pack } from '../shared/types';
import { arriveGlidePx, departGlidePx, planWalkIn, planWalkOut, type WalkPlan } from '../shared/walk-plan';
import { Player } from '../pet/player';
import { Walker } from '../pet/walker';

const api = window.breakApi;
const $ = (id: string) => document.getElementById(id)!;

/** One cat alone: the lying cat fills this share of the screen height. */
const CAT_HEIGHT = 0.6;
/** Several cats: each rests in the middle of its own share of the screen, lying no higher than this share of the screen ... */
const CAT_HEIGHT_MANY = 0.45;
/** ... and no wider than this share of its own part. */
const SLOT_FILL = 0.85;

const el = (cls: string) => Object.assign(document.createElement('div'), { className: cls });

/** The cat is drawn big here: use the pack's high-resolution copies where it has them. */
const withHd = (pack: Pack): Pack => ({ ...pack, clips: Object.fromEntries(Object.entries(pack.clips).map(([id, c]) =>
  [id, pack.hd?.[id] ? { ...c, file: pack.hd[id] } : c])) });

api.onInit((init: BreakInit) => {
  const sw = window.innerWidth;
  const sh = window.innerHeight;
  const n = init.cats.length;
  const cats = init.cats.map(c => ({ ...c, pack: withHd(c.pack) }));
  // one scale for all of them, so each keeps its size against the others (pack.frame.displayHeight)
  const k = Math.min(...cats.map(({ pack }) => {
    const start = pack.poses[pack.start];
    const dh = pack.frame.displayHeight;
    const byHeight = ((n > 1 ? CAT_HEIGHT_MANY : CAT_HEIGHT) * sh) / (start.head * dh);
    const byWidth = n > 1 ? (SLOT_FILL * sw / n) / (((start.right ?? 1) - (start.left ?? 0)) * pack.frame.aspect * dh) : Infinity;
    return Math.min(byHeight, byWidth);
  }));

  let timeUp = false;
  let walking = n;                                     // cats yet to walk off
  const finish = () => { if (--walking === 0) api.done(); };
  const departs: (() => void)[] = [];                   // each cat's own: go now if resting, else once it has lain down

  const runs = cats.map(({ pack, packUrl }, i) => {
    const start = pack.poses[pack.start];
    const walk = pack.walk;
    const frameH = Math.round(k * pack.frame.displayHeight);
    const frameW = Math.round(frameH * pack.frame.aspect);
    const restX = Math.round((sw * (i + 0.5)) / n - start.centerX * frameW);   // lying in the middle of its own part
    const area = el('walkarea');
    const cat = el('cat');
    const layer = el('layer');
    cat.append(layer);
    area.append(cat);
    $('cats').append(area);
    Object.assign(area.style, { top: `${Math.round(sh * 0.97 - start.ground * frameH)}px`, height: `${frameH}px` });
    Object.assign(cat.style, { left: `${restX}px`, width: `${frameW}px`, height: `${frameH}px` });

    const engine = new BehaviorEngine(pack, Math.random);
    engine.auto = false;                   // it just lies there, with its idles
    const player = new Player(layer, pack, packUrl);
    const walker = walk ? new Walker(area, new URL(pack.clips[walk.loop].file, packUrl).href, walk,
      walk.leftward ? new URL(pack.clips[walk.leftward.loop].file, packUrl).href : undefined) : null;
    const loops = (plan: WalkPlan, mirror: boolean, onFirstFrame?: () => void) =>
      walker!.run({ plan, frameW, frameH, ground: start.ground, mirror, onFirstFrame });
    const clipUrl = (clip: string) => new URL(pack.clips[clip].file, packUrl).href;

    // arriving: walking in and lying down; resting; leaving: getting up and walking off
    let phase: 'arriving' | 'resting' | 'leaving' = 'arriving';
    const depart = async () => {
      if (phase === 'leaving') return;
      phase = 'leaving';
      if (!walk) { finish(); return; }
      // depart takes over from the lying cat's own clip, then its left walk walks it off
      await walker!.playClip({ url: clipUrl(walk.depart), base: restX, glide: walk.departGlide, frameW, frameH, ground: start.ground,
        onFirstFrame: () => { cat.style.visibility = 'hidden'; } });
      await loops(planWalkOut(walk, frameW, restX + departGlidePx(walk, frameW), await walker!.duration(true)), true);
      finish();
    };
    departs.push(() => { if (phase === 'resting') void depart(); });
    player.onStepStart = () => player.keep(engine.upcomingClips());
    player.onEnded = () => {
      if (phase !== 'resting') return;
      if (timeUp) { void depart(); return; }
      void player.play(engine.next());
    };
    player.onError = () => { if (phase !== 'leaving') { phase = 'leaving'; finish(); } };

    const arrive = async () => {
      if (!walk) { phase = 'resting'; void player.play(engine.start()); return; }
      cat.style.visibility = 'hidden';
      walker!.preload(clipUrl(walk.arrive));
      walker!.preload(clipUrl(walk.depart));
      const from = restX - arriveGlidePx(walk, frameW);     // arrive glides from here to its resting spot
      await loops(planWalkIn(walk, frameW, from, await walker!.duration()), false);
      await walker!.playClip({ url: clipUrl(walk.arrive), base: from, glide: walk.arriveGlide, frameW, frameH, ground: start.ground });
      cat.style.visibility = '';
      await player.play(engine.start());  // its first idle covers the walker's last frame
      walker!.clear();
      phase = 'resting';                   // only now, so a depart cannot start before the clear above
      if (timeUp) void depart();
    };
    void arrive();
    return { engine, player, walker };
  });
  if (init.debug) (window as unknown as Record<string, unknown>).__break = { cats: runs, ...runs[0] };

  /** Time is up (or skipped): each goes now if lying there, else as soon as it has lain down. */
  const end = () => {
    if (timeUp) return;
    timeUp = true;
    $('skip').style.visibility = 'hidden';
    for (const d of departs) d();
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
});

api.ready();

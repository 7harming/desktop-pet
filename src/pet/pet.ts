import { pounceSide } from '../shared/actions';
import { BehaviorEngine } from '../shared/behavior';
import { fightClip } from '../shared/fight';
import type { PetInit, ReminderResult } from '../shared/ipc';
import type { DayPart } from '../shared/time-events';
import { swatRate } from '../shared/toy';
import type { PounceSide, ReminderType, ToyDef } from '../shared/types';
import { clickLine, commandLine, pickLine, reminderLine } from '../shared/lines';
import { HEADROOM, isAsleep, poseValueAt, showsShadow, sleepPoses } from '../shared/pose-geometry';
import { arriveGlidePx, departGlidePx, planWalkIn, planWalkOut, type WalkPlan } from '../shared/walk-plan';
import { Bubbles } from './bubble';
import { Interactions } from './interactions';
import { Player } from './player';
import { SETTLE_WAIT_MS, Walker, within } from './walker';

const api = window.petApi;
const layer = document.getElementById('layer')!;
const shadow = document.getElementById('shadow')!;
const cat = document.getElementById('cat')!;
const stage = document.getElementById('stage')!;
stage.style.top = `${HEADROOM}px`;   // the cat's frame starts below the room for speech bubbles (see frameH)
/** After lunch and late at night auto mode picks asleep poses this many times as often, and rests this many times as long. */
const SLEEPY: Record<DayPart, number> = { day: 1, nap: 3, night: 3 };
const SLOW: Record<DayPart, number> = { day: 1, nap: 1, night: 2 };
/** A line for the time of day stays up longer than a passing one, to be noticed. */
const SAY_MS = 5_000;
/** A card sits right on a sitting cat's ear tips; over a lying one it keeps this little gap (px). */
const CARD_GAP_LYING = 8;

// an error here shows only in devtools nobody opens: the cat just stops (it once froze over its bowl), so it goes in the log
window.addEventListener('error', e =>
  api.log('error', `出錯：${e.error instanceof Error ? e.error.message : e.message}（${e.filename.split('/').pop()}:${e.lineno}）`));
window.addEventListener('unhandledrejection', e =>
  api.log('error', `出錯：${e.reason instanceof Error ? e.reason.message : String(e.reason)}`));

api.onInit((init: PetInit) => {
  const { pack } = init;
  const engine = new BehaviorEngine(pack, Math.random);
  engine.auto = init.auto && !init.away;
  engine.setAllowed(init.actions);
  let interval = init.interval;
  let part = init.dayPart;
  const applyPart = () => { engine.setSleepiness(SLEEPY[part]); engine.setDwell(interval * SLOW[part]); };
  applyPart();
  const player = new Player(layer, pack, init.packUrl);
  const history: string[] = [];
  // entering: walking in; live: its normal life; leaving: heading back to the start pose; gone: getting up and walking off
  let mode: 'entering' | 'live' | 'leaving' | 'gone' = 'live';
  let exitWanted = false;   // told to leave while still walking in
  // a play-fight with the cat next to it: `ready` once resting in the fight pose, `clip` once fighting
  let fight: { side: PounceSide; ready: boolean; clip: string | null; timer: ReturnType<typeof setTimeout> } | null = null;
  let userAuto = init.auto;   // auto mode as the menu and the panel set it
  let away = init.away;       // the user has left the computer: sleep, and hold still
  let slept = false;          // it went to sleep because the user left, so it gets up when they are back
  let waking = false;         // getting up because the user is back: it tells main once it rests awake
  let attending = false;      // sitting up for a reminder that is due, until it is answered
  let moving = false;         // dragged or falling: cards wait for it to land
  let toying = false;         // watching the wand's feather, swatting it when it comes near
  // auto mode holds off while it fights, while the user is away, while it looks at them for a reminder, and while it plays
  const applyAuto = () => { engine.auto = userAuto && !fight && !away && !attending && !toying; };
  const debug = init.debug ? { id: pack.id, history, engine, player, get mode() { return mode; } } : null;
  if (debug) (window as unknown as Record<string, unknown>).__pet = debug;

  const advance = () => {
    if (mode === 'leaving' && engine.endPose === pack.start) { depart(); return; }
    void player.play(engine.next());
  };
  player.onStepStart = step => {
    history.push(step.clip);
    api.reportStatus(pack.poses[step.to].label);
    player.keep(engine.upcomingClips());
    const f = pack.fight;
    if (fight && !fight.ready && f && step.from === f.pose && step.to === f.pose) { fight.ready = true; api.fightState('ready'); }
    if (waking && step.from === step.to && !isAsleep(pack, step.to)) { waking = false; api.woke(); }
    reportHead();
  };
  player.onEnded = () => {
    if (fight?.clip) {                // the fight is over: back to its own ways, with a word about it
      const line = pack.lines.fight ? pickLine(pack.lines.fight, Math.random) : null;
      endFight();
      api.fightState('done');
      if (line) bubbles.say(line);
    }
    advance();
  };
  // a clip that fails while it only loads for later is just avoided: the one playing plays on
  player.onError = (clip, why) => {
    api.log('warn', `片段 ${clip} 播放失敗（${why}），改走別的路`);
    engine.markBroken(clip);
    if (player.step?.clip === clip) advance();
  };
  engine.onStranded = pose => api.log('warn', `姿勢 ${pose} 的出路都壞了，直接淡回 ${pack.start}`);
  // a clip that stalled is taken as over, but not as broken: it may only have been slow, and plays again another time
  player.onStall = (clip, why) => { api.log('warn', `片段 ${clip} ${why}，不等了`); player.onEnded(); };

  api.onCommand(key => {
    if (mode !== 'live') return;
    const side = pounceSide(key);
    if (side) {                     // a pounce from the menu: now if lying, else once it is back in its pounce pose
      const p = pack.pounce;
      if (!p) return;
      const step = engine.perform(side === 'left' ? p.toLeft : p.toRight, p.pose);
      if (step) void player.play(step);
      return;
    }
    if (!engine.command(key)) { api.log('warn', `走不到姿勢 ${key}`); return; }
    const line = commandLine(pack, key);
    if (line) bubbles.say(line);
  });
  api.onSetAuto(on => { userAuto = on; applyAuto(); });

  // Both cats must start the fight together: each gets to its fight pose and holds still there (auto off) until main, having heard
  // `ready` from both, says go.
  const endFight = () => {
    if (!fight) return;
    clearTimeout(fight.timer);
    fight = null;
    applyAuto();
    settle();
  };
  api.onFightReady(({ side, manual }) => {
    const f = pack.fight;
    if (fight || !f || mode !== 'live' || busy || away || attending || toying || (!manual && !userAuto) || isAsleep(pack, engine.endPose)) {
      api.fightState('no');
      return;
    }
    fight = { side, ready: false, clip: null, timer: setTimeout(() => { endFight(); api.fightState('no'); }, 20_000) };
    applyAuto();
    if (engine.restingIn(f.pose)) { fight.ready = true; api.fightState('ready'); }
    else if (!engine.command(f.pose)) { endFight(); api.fightState('no'); }
  });
  api.onFightGo(() => {
    const f = pack.fight;
    if (!fight || !f) return;
    clearTimeout(fight.timer);
    const step = engine.interject(fightClip(f, fight.side), f.pose);
    if (!step) { endFight(); api.fightState('done'); return; }
    fight.clip = step.clip;
    void player.play(step);
  });
  api.onFightCancel(endFight);
  api.onSetActions(actions => engine.setAllowed(actions));
  api.onSetInterval(seconds => { interval = seconds; applyPart(); });
  api.onDayPart(p => { part = p; applyPart(); });
  api.onPause(paused => { if (paused) player.pause(); else player.resume(); });

  const g0 = pack.poses[pack.start].ground;
  let busy = false;   // walking in or out: no dragging

  // the window is a strip as wide as the screen; the cat's frame sits at frameX inside it, HEADROOM below its top (the stage
  // starts there: room above for speech bubbles)
  const frameH = () => window.innerHeight - HEADROOM;
  const frameW = () => frameH() * pack.frame.aspect;
  let frameX = init.frameX;
  const setFrameX = (x: number) => { frameX = x; cat.style.left = `${x}px`; };
  setFrameX(frameX);
  /** Tell main where the head is (screen px) and whether the cat stands still; `winY`: the strip's top while it moves. */
  const reportHead = (winY = window.screenY) => {
    const to = player.step ? player.step.to : pack.start;
    const pose = pack.poses[to];
    const gap = to === pack.alert ? 0 : CARD_GAP_LYING;   // a pose's `head` is its ear tips at their highest
    api.reportHead(window.screenX + frameX + pose.centerX * frameW(), winY + HEADROOM + (g0 - pose.head) * frameH() - gap, mode === 'live' && !moving);
  };
  api.onFrameX(x => { setFrameX(x); reportHead(); });

  let cards: { x: number; y: number; width: number; height: number }[] = [];   // where the cards stand (screen px)
  api.onCardsAt(c => { cards = c; });
  // in the stage's px: a bubble may rise into the room above it, up to the window's top
  const bubbles = new Bubbles(stage, () => ({
    x: frameX + poseValueAt(pack, player.step, player.progress, 'centerX') * frameW(),
    y: (g0 - poseValueAt(pack, player.step, player.progress, 'head')) * frameH() - 8,
  }), () => cards.map(c => ({ ...c, x: c.x - window.screenX, y: c.y - window.screenY - HEADROOM })), -HEADROOM);
  if (init.debug) Object.assign((window as unknown as Record<string, object>).__pet, { bubbles });

  // a click this many probe pixels (~2% of the frame) beside a paw or the tail still picks the cat up
  const REACH = 2;
  const probe = document.createElement('canvas');
  probe.width = 160; probe.height = 90;
  const ctx = probe.getContext('2d', { willReadFrequently: true })!;
  const hitTest = (x: number, y: number): boolean => {
    if (busy) return false;
    if ((document.elementFromPoint(x, y) as HTMLElement | null)?.closest('.bubble.reminder')) return true;
    const v = player.shown;   // the clip on screen: while the next one decodes its first frame, the previous one still shows
    if (!v) return false;
    const r = layer.getBoundingClientRect();
    const u = (x - r.left) / r.width;
    const t = (y - r.top) / r.height;
    if (u < 0 || u >= 1 || t < 0 || t >= 1) return false;
    ctx.clearRect(0, 0, 160, 90);
    ctx.drawImage(v, 0, 0, 160, 90);
    const px = Math.floor(u * 160);
    const py = Math.floor(t * 90);
    const x0 = Math.max(0, px - REACH);
    const y0 = Math.max(0, py - REACH);
    const data = ctx.getImageData(x0, y0, Math.min(160, px + REACH + 1) - x0, Math.min(90, py + REACH + 1) - y0).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 40) return true;
    return false;
  };
  /** Double-clicked while resting: pounce towards the side of the cat that was clicked. */
  const pounce = (x: number): boolean => {
    const p = pack.pounce;
    if (!p || mode !== 'live' || busy) return false;
    const toLeft = x < frameX + pack.poses[p.pose].centerX * frameW();
    const step = engine.interject(toLeft ? p.toLeft : p.toRight, p.pose);
    if (!step) return false;
    void player.play(step);
    return true;
  };
  const interactions = new Interactions({
    // main says where the frame's top rests; the window's top is HEADROOM above it
    api, hitTest, wrap: cat, restY: init.restY - HEADROOM, getFrameX: () => frameX, setFrameX, onDoubleClick: pounce,
    canDrag: () => !busy,   // any pose; only not while it walks in or out
    onClick: () => {
      bubbles.say(clickLine(pack, engine.endPose, Math.random));
      if (pack.clickHeart && !isAsleep(pack, engine.endPose)) bubbles.heart();
    },
    onDragStart: () => bubbles.say(pickLine(pack.lines.drag, Math.random), 1600),
    onNoDrag: () => bubbles.say(pickLine(pack.lines.noDrag, Math.random)),
    onWheel: up => api.wheel(up),
    onMoved: (winY, dragging) => { moving = dragging; reportHead(winY); },
  });
  api.onRestY(y => { interactions.setRestY(y - HEADROOM); requestAnimationFrame(() => reportHead()); });
  // the wand: a feather moving near it - it sits up and watches; in reach - it swats towards it (each swat faster or slower than
  // the last, so repeats look less alike); still a while - it tires and goes back to its ways
  const watch = (toy: ToyDef) => {
    if (toying || mode !== 'live' || away || attending || fight || moving) return;
    toying = true;
    applyAuto();
    if (!engine.restingIn(toy.pose)) engine.command(toy.pose);
  };
  api.onToy(m => {
    const toy = pack.toy;
    if (!toy) return;
    if (m.do === 'watch') watch(toy);
    else if (m.do === 'swat') {
      if (!toying) { watch(toy); return; }    // it was busy when the feather came: it takes it up now
      // only while it sits: a swat plays to its end, back to sitting, before the next (one cutting in did not look smooth)
      const step = engine.interject(toy.swats[m.dir], toy.pose);
      if (step) void player.play({ ...step, rate: step.rate * swatRate(Math.random) });
    } else if (toying) {
      toying = false;
      applyAuto();
      if (mode === 'live' && !fight && !away && !attending) engine.command(pack.start);
    }
  });

  // a reminder is due: it sits up and looks at the user until it is answered, then lies down again (or, playing with the wand,
  // goes on playing)
  api.onAttend(on => {
    if (on === attending) return;
    attending = on;
    applyAuto();
    if (mode !== 'live' || fight || away) return;
    if (on) { if (pack.alert) engine.command(pack.alert); }
    else engine.command(toying && pack.toy ? pack.toy.pose : pack.start);
  });
  api.onSay(what => {
    if (mode !== 'live') return;
    const lines = what === 'back' ? pack.lines.back : pack.lines.time?.[what];
    if (lines) bubbles.say(pickLine(lines, Math.random), SAY_MS);
  });

  // the user left: it goes to sleep in one of its sleeping poses (unless asleep already) and stays there; back, it sits up again
  // if it went to sleep for that, and says so once it is up
  const settle = () => {
    if (!away || mode !== 'live' || fight || isAsleep(pack, engine.endPose)) return;
    const poses = sleepPoses(pack);
    const pose = poses[Math.floor(Math.random() * poses.length)];
    if (pose && engine.command(pose)) slept = true;
  };
  api.onAway(a => {
    away = a;
    applyAuto();
    if (a) { settle(); return; }
    if (slept && mode === 'live' && !fight && isAsleep(pack, engine.endPose) && engine.command(pack.alert ?? pack.start)) waking = true;
    else api.woke();
    slept = false;
  });

  const DONE_LABEL = { water: '喝好了', stretch: '動好了', eyes: '休息好了' } as const;
  let asking: ReminderType | null = null;   // the reminder its bubble asks about
  api.onReminder(type => {
    // a reminder pose (drinking from the bowl): go there for a while, then back to what it was doing
    const pose = pack.reminderPoses?.[type];
    const going = !!pose && mode === 'live' && engine.visit(pose);
    asking = type;
    const answer = (result: ReminderResult) => () => { asking = null; api.reminderResult(type, result); };
    bubbles.ask(reminderLine(pack, type, going ? pose : engine.endPose), [
      { label: DONE_LABEL[type], onClick: answer('done') },
      { label: '10 分鐘後', onClick: answer('snooze') },
    ], 15_000, answer('done'));
  });
  // the other cat answered it: its bubble goes, but not one that asks about another reminder
  api.onReminderClose(type => { if (type === asking) { asking = null; bubbles.clear(); } });

  // styles are written only when they change: rewriting them every frame kept the page repainting at 60 fps
  let drawn = '';
  const frame = () => {
    const H = frameH();
    const W = frameW();
    const step = player.step;
    const k = player.progress;
    // the window is placed for the start pose; shift the video if this pose's ground line differs
    const dy = Math.round((g0 - poseValueAt(pack, step, k, 'ground')) * H);
    const cx = Math.round(poseValueAt(pack, step, k, 'centerX') * W);
    const shade = showsShadow(pack, step) ? '1' : '0';
    const key = `${W}|${H}|${dy}|${cx}|${shade}`;
    if (key !== drawn) {
      drawn = key;
      cat.style.width = `${W}px`;
      layer.style.transform = `translateY(${dy}px)`;
      Object.assign(shadow.style, { width: `${H * 0.5}px`, left: `${cx - H * 0.25}px`, top: `${g0 * H - 7}px`, opacity: shade });
    }
    bubbles.place();
    requestAnimationFrame(frame);
  };

  // walking in and out: the loop is drawn on the strip by the walker; arrive and depart are ordinary clips at the resting spot
  const walk = pack.walk;
  const walker = walk ? new Walker(stage, new URL(pack.clips[walk.loop].file, init.packUrl).href, walk,
    walk.leftward ? new URL(pack.clips[walk.leftward.loop].file, init.packUrl).href : undefined) : null;
  if (walker) walker.onWarn = message => api.log('warn', message);
  if (debug && walker) {
    const drawn: number[] = [];                // from the very first frame: a test that hooks in later can miss the start
    const sizes: [number, number][] = [];      // and how big each one was drawn
    walker.onDraw = (x, w, h) => { drawn.push(x); sizes.push([w, h]); };
    Object.assign(debug, { walker, drawn, sizes });
  }
  const walkLoops = (plan: WalkPlan, mirror: boolean, onFirstFrame?: () => void) =>
    walker!.run({ plan, frameW: frameW(), frameH: frameH(), ground: g0, mirror, onFirstFrame });
  const greetLines = (init.hello && pack.lines.time?.[init.hello]) || pack.lines.greet;
  const greet = (ms: number) => setTimeout(() => { if (mode === 'live') bubbles.say(pickLine(greetLines, Math.random), init.hello ? SAY_MS : undefined); }, ms);

  const clipUrl = (clip: string) => new URL(pack.clips[clip].file, init.packUrl).href;

  const walkIn = async () => {
    mode = 'entering'; busy = true;
    cat.style.visibility = 'hidden';
    const W = frameW();
    walker!.preload(clipUrl(walk!.arrive));
    const arriveFrom = frameX - arriveGlidePx(walk!, W);   // arrive glides from here to the resting spot
    const secs = await walker!.duration();
    const walked = secs !== null && await walkLoops(planWalkIn(walk!, W, arriveFrom, secs), false)
      && await walker!.playClip({ url: clipUrl(walk!.arrive), base: arriveFrom, glide: walk!.arriveGlide, frameW: W, frameH: frameH(), ground: g0 });
    if (!walked) {                     // walking in stalled: rather than stay away, it is simply there, resting at its spot
      api.log('warn', '走進來的影片卡住了，直接在位置上休息');
      walker!.clear();
    }
    // home: the engine carries on from the start pose, and its first idle covers the walker's last frame
    cat.style.visibility = '';
    // home: it rests a moment in its start pose before doing anything else (if that clip will not start, it is home all the same)
    if (!await within(player.play(engine.start()), SETTLE_WAIT_MS)) api.log('warn', '回到位置後的片段沒有開始播');
    walker!.clear();
    // only now: leaving any earlier would start depart on the walker, and the clear above would stop it
    mode = 'live'; busy = false;
    reportHead();
    if (exitWanted) { leave(); return; }
    greet(300);
    settle();
  };

  /** Head back to the start pose (or go at once if resting there), get up and walk off the left edge. */
  const leave = () => {
    if (!walk) { mode = 'gone'; api.exited(); return; }
    if (mode === 'entering') { exitWanted = true; return; }
    if (mode !== 'live') return;
    busy = true;
    if (fight && !fight.clip) { endFight(); api.fightState('no'); }   // leaving before the fight began: call it off
    bubbles.clear();
    walker!.preload(clipUrl(walk.depart));
    const s = engine.currentStep;
    if (s && s.from === pack.start && s.to === pack.start) { depart(); return; }
    mode = 'leaving';
    if (!engine.command(pack.start)) depart();
  };
  const depart = () => { mode = 'gone'; void walkAway(); };
  const walkAway = async () => {
    const W = frameW();
    // depart takes over from the cat's own clip (both show it lying there), then the mirrored loop walks it off
    const departed = await walker!.playClip({ url: clipUrl(walk!.depart), base: frameX, glide: walk!.departGlide, frameW: W,
      frameH: frameH(), ground: g0, onFirstFrame: () => { cat.style.visibility = 'hidden'; } });
    const secs = departed ? await walker!.duration(true) : null;
    const walked = secs !== null && await walkLoops(planWalkOut(walk!, W, frameX + departGlidePx(walk!, W), secs), true);
    if (!walked) api.log('warn', '走出去的影片卡住了，直接離開');   // it is simply gone: its window closes
    walker!.clear();
    api.exited();
  };
  api.onExit(leave);

  requestAnimationFrame(frame);
  if (init.enter && walk) void walkIn();
  else { void player.play(engine.start()); greet(800); settle(); }
});

api.ready();

import { pounceSide } from '../shared/actions';
import { BehaviorEngine } from '../shared/behavior';
import type { PetInit } from '../shared/ipc';
import { clickLine, commandLine, pickLine, reminderLine } from '../shared/lines';
import { isAsleep, poseValueAt, showsShadow } from '../shared/pose-geometry';
import { arriveGlidePx, departGlidePx, planWalkIn, planWalkOut, type WalkPlan } from '../shared/walk-plan';
import { Bubbles } from './bubble';
import { Interactions } from './interactions';
import { Player } from './player';
import { Walker } from './walker';

const api = window.petApi;
const layer = document.getElementById('layer')!;
const shadow = document.getElementById('shadow')!;
const cat = document.getElementById('cat')!;
const stage = document.getElementById('stage')!;

api.onInit((init: PetInit) => {
  const { pack } = init;
  const engine = new BehaviorEngine(pack, Math.random);
  engine.auto = init.auto;
  engine.setAllowed(init.actions);
  engine.setDwell(init.interval);
  const player = new Player(layer, pack, init.packUrl);
  const history: string[] = [];
  // entering: walking in; live: its normal life; leaving: heading back to the start pose; gone: getting up and walking off
  let mode: 'entering' | 'live' | 'leaving' | 'gone' = 'live';
  let exitWanted = false;   // told to leave while still walking in
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
  };
  player.onEnded = advance;
  player.onError = clip => { api.log('warn', `片段 ${clip} 播放失敗，改走別的路`); engine.markBroken(clip); advance(); };

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
  api.onSetAuto(on => { engine.auto = on; });
  api.onSetActions(actions => engine.setAllowed(actions));
  api.onSetInterval(seconds => engine.setDwell(seconds));
  api.onPause(paused => { if (paused) player.pause(); else player.resume(); });

  const g0 = pack.poses[pack.start].ground;
  let busy = false;   // walking in or out: no dragging

  // the window is a strip as wide as the screen; the cat's frame sits at frameX inside it
  const frameW = () => window.innerHeight * pack.frame.aspect;
  let frameX = init.frameX;
  const setFrameX = (x: number) => { frameX = x; cat.style.left = `${x}px`; };
  setFrameX(frameX);
  api.onFrameX(setFrameX);

  const bubbles = new Bubbles(stage, () => ({
    x: frameX + poseValueAt(pack, player.step, player.progress, 'centerX') * frameW(),
    y: (g0 - poseValueAt(pack, player.step, player.progress, 'head')) * window.innerHeight - 8,
  }));
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
    api, hitTest, wrap: cat, restY: init.restY, getFrameX: () => frameX, setFrameX, onDoubleClick: pounce,
    canDrag: () => !busy,   // any pose; only not while it walks in or out
    onClick: () => {
      bubbles.say(clickLine(pack, engine.endPose, Math.random));
      if (pack.clickHeart && !isAsleep(pack, engine.endPose)) bubbles.heart();
    },
    onDragStart: () => bubbles.say(pickLine(pack.lines.drag, Math.random), 1600),
    onNoDrag: () => bubbles.say(pickLine(pack.lines.noDrag, Math.random)),
  });
  api.onRestY(y => interactions.setRestY(y));
  const DONE_LABEL = { water: '喝好了', stretch: '動好了', eyes: '休息好了' } as const;
  api.onReminder(type => {
    // a reminder pose (drinking from the bowl): go there for a while, then back to what it was doing
    const pose = pack.reminderPoses?.[type];
    const going = !!pose && mode === 'live' && engine.visit(pose);
    bubbles.ask(reminderLine(pack, type, going ? pose : engine.endPose), [
      { label: DONE_LABEL[type], onClick: () => api.reminderResult(type, 'done') },
      { label: '10 分鐘後', onClick: () => api.reminderResult(type, 'snooze') },
    ], 15_000, () => api.reminderResult(type, 'done'));
  });

  // styles are written only when they change: rewriting them every frame kept the page repainting at 60 fps
  let drawn = '';
  const frame = () => {
    const H = window.innerHeight;
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
  if (debug && walker) {
    const drawn: number[] = [];                // from the very first frame: a test that hooks in later can miss the start
    walker.onDraw = x => drawn.push(x);
    Object.assign(debug, { walker, drawn });
  }
  const walkLoops = (plan: WalkPlan, mirror: boolean, onFirstFrame?: () => void) =>
    walker!.run({ plan, frameW: frameW(), frameH: window.innerHeight, ground: g0, mirror, onFirstFrame });
  const greet = (ms: number) => setTimeout(() => { if (mode === 'live') bubbles.say(pickLine(pack.lines.greet, Math.random)); }, ms);

  const clipUrl = (clip: string) => new URL(pack.clips[clip].file, init.packUrl).href;

  const walkIn = async () => {
    mode = 'entering'; busy = true;
    cat.style.visibility = 'hidden';
    const W = frameW();
    walker!.preload(clipUrl(walk!.arrive));
    const arriveFrom = frameX - arriveGlidePx(walk!, W);   // arrive glides from here to the resting spot
    await walkLoops(planWalkIn(walk!, W, arriveFrom, await walker!.duration()), false);
    await walker!.playClip({ url: clipUrl(walk!.arrive), base: arriveFrom, glide: walk!.arriveGlide, frameW: W, frameH: window.innerHeight, ground: g0 });
    // home: the engine carries on from the start pose, and its first idle covers the walker's last frame
    cat.style.visibility = '';
    await player.play(engine.start());   // home: it rests a moment in its start pose before doing anything else
    walker!.clear();
    // only now: leaving any earlier would start depart on the walker, and the clear above would stop it
    mode = 'live'; busy = false;
    if (exitWanted) leave(); else greet(300);
  };

  /** Head back to the start pose (or go at once if resting there), get up and walk off the left edge. */
  const leave = () => {
    if (!walk) { mode = 'gone'; api.exited(); return; }
    if (mode === 'entering') { exitWanted = true; return; }
    if (mode !== 'live') return;
    busy = true;
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
    await walker!.playClip({ url: clipUrl(walk!.depart), base: frameX, glide: walk!.departGlide, frameW: W, frameH: window.innerHeight,
      ground: g0, onFirstFrame: () => { cat.style.visibility = 'hidden'; } });
    await walkLoops(planWalkOut(walk!, W, frameX + departGlidePx(walk!, W), await walker!.duration(true)), true);
    walker!.clear();
    api.exited();
  };
  api.onExit(leave);

  requestAnimationFrame(frame);
  if (init.enter && walk) void walkIn();
  else { void player.play(engine.start()); greet(800); }
});

api.ready();

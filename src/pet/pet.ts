import { BehaviorEngine } from '../shared/behavior';
import type { Step } from '../shared/graph';
import type { PetInit } from '../shared/ipc';
import { clickLine, commandLine, pickLine, reminderLine } from '../shared/lines';
import { isAsleep, poseValueAt, showsShadow } from '../shared/pose-geometry';
import type { Pack, PoseDef } from '../shared/types';
import { planWalkIn, planWalkOut } from '../shared/walk-plan';
import { Bubbles } from './bubble';
import { Interactions } from './interactions';
import { Player } from './player';
import { Walker } from './walker';

const api = window.petApi;
const layer = document.getElementById('layer')!;
const shadow = document.getElementById('shadow')!;
const cat = document.getElementById('cat')!;
const stage = document.getElementById('stage')!;

const WALK_IN = '__walkIn';
const WALK_OUT = '__walkOut';

/** The pack plus a pose for each end of walking, so the shadow, bubbles and status work while arrive and depart play. */
function withWalkPoses(pack: Pack): Pack {
  const w = pack.walk;
  if (!w) return pack;
  const start = pack.poses[pack.start];
  const walking = (label: string, centerX: number): PoseDef => ({ label, ground: start.ground, centerX, head: w.head, shadow: true });
  return { ...pack, poses: { ...pack.poses, [WALK_IN]: walking('走過來', w.from), [WALK_OUT]: walking('離開', w.departX) } };
}

api.onInit((init: PetInit) => {
  const { pack } = init;
  const geo = withWalkPoses(pack);   // geometry and labels; the engine keeps the plain pack
  const engine = new BehaviorEngine(pack, Math.random);
  engine.auto = init.auto;
  engine.setAllowed(init.actions);
  const player = new Player(layer, pack, init.packUrl);
  const history: string[] = [];
  // entering: walking in; live: its normal life; leaving: heading back to the start pose; departing: getting up to go; gone
  let mode: 'entering' | 'live' | 'leaving' | 'departing' | 'gone' = 'live';
  let exitWanted = false;   // told to leave while still walking in
  const debug = init.debug ? { id: pack.id, history, engine, player, get mode() { return mode; } } : null;
  if (debug) (window as unknown as Record<string, unknown>).__pet = debug;

  const advance = () => {
    if (mode === 'departing') { void walkAway(); return; }                    // depart has ended
    if (mode === 'entering') {                                                // arrive has ended: it is home
      mode = 'live'; busy = false;
      if (exitWanted) { leave(); return; }
      greet(300);
    }
    if (mode === 'leaving' && engine.endPose === pack.start) { depart(); return; }
    void player.play(engine.next());
  };
  player.onStepStart = step => {
    history.push(step.clip);
    api.reportStatus(geo.poses[step.to].label);
    player.keep(engine.upcomingClips());
  };
  player.onEnded = advance;
  player.onError = clip => { api.log('warn', `片段 ${clip} 播放失敗，改走別的路`); engine.markBroken(clip); advance(); };

  api.onCommand(pose => {
    if (mode !== 'live') return;
    if (!engine.command(pose)) { api.log('warn', `走不到姿勢 ${pose}`); return; }
    const line = commandLine(pack, pose);
    if (line) bubbles.say(line);
  });
  api.onSetAuto(on => { engine.auto = on; });
  api.onSetActions(actions => engine.setAllowed(actions));
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
    x: frameX + poseValueAt(geo, player.step, player.progress, 'centerX') * frameW(),
    y: (g0 - poseValueAt(geo, player.step, player.progress, 'head')) * window.innerHeight - 8,
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
  const interactions = new Interactions({
    api, hitTest, wrap: cat, restY: init.restY, getFrameX: () => frameX, setFrameX,
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
    bubbles.ask(reminderLine(pack, type, engine.endPose), [
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
    const dy = Math.round((g0 - poseValueAt(geo, step, k, 'ground')) * H);
    const cx = Math.round(poseValueAt(geo, step, k, 'centerX') * W);
    const shade = showsShadow(geo, step) ? '1' : '0';
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
  const walker = walk ? new Walker(stage, new URL(pack.clips[walk.loop].file, init.packUrl).href, walk) : null;
  if (debug) Object.assign(debug, { walker });
  const clipStep = (clip: string, from: string, to: string): Step => ({ clip, from, to, rate: pack.clips[clip].rate ?? 1, fadeIn: 0 });
  const walkLoops = (origins: number[], mirror: boolean, onFirstFrame?: () => void) =>
    walker!.run({ origins, frameW: frameW(), frameH: window.innerHeight, ground: g0, mirror, onFirstFrame });
  const greet = (ms: number) => setTimeout(() => { if (mode === 'live') bubbles.say(pickLine(pack.lines.greet, Math.random)); }, ms);

  const walkIn = async () => {
    mode = 'entering'; busy = true;
    cat.style.visibility = 'hidden';
    const arrive = clipStep(walk!.arrive, WALK_IN, pack.start);
    player.keep([arrive.clip]);
    await walkLoops(planWalkIn(walk!, frameW(), frameX), false);
    cat.style.visibility = '';
    engine.follow(arrive);
    await player.play(arrive);          // once arrive shows, it covers the walker's last frame
    walker!.clear();                    // it stays 'entering' until arrive ends (see advance)
  };

  /** Head back to the start pose (or go at once if resting there), get up and walk off the left edge. */
  const leave = () => {
    if (!walk) { mode = 'gone'; api.exited(); return; }
    if (mode === 'entering') { exitWanted = true; return; }
    if (mode !== 'live') return;
    busy = true;
    bubbles.clear();
    const s = engine.currentStep;
    if (s && s.from === pack.start && s.to === pack.start) { depart(); return; }
    mode = 'leaving';
    if (!engine.command(pack.start)) depart();
  };
  const depart = () => {
    mode = 'departing';
    void player.play(clipStep(walk!.depart, pack.start, WALK_OUT));
  };
  const walkAway = async () => {
    mode = 'gone';
    await walkLoops(planWalkOut(walk!, frameW(), frameX), true, () => { cat.style.visibility = 'hidden'; });
    walker!.clear();
    api.exited();
  };
  api.onExit(leave);

  requestAnimationFrame(frame);
  if (init.enter && walk) void walkIn();
  else { void player.play(engine.start()); greet(800); }
});

api.ready();

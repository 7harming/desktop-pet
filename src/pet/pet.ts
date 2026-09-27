import { BehaviorEngine } from '../shared/behavior';
import type { PetInit } from '../shared/ipc';
import { clickLine, commandLine, pickLine, reminderLine } from '../shared/lines';
import { isAsleep, poseValueAt, showsShadow } from '../shared/pose-geometry';
import { Bubbles } from './bubble';
import { Interactions } from './interactions';
import { Player } from './player';

const api = window.petApi;
const layer = document.getElementById('layer')!;
const shadow = document.getElementById('shadow')!;
const cat = document.getElementById('cat')!;

api.onInit((init: PetInit) => {
  const { pack } = init;
  const engine = new BehaviorEngine(pack, Math.random);
  engine.auto = init.auto;
  engine.setAllowed(init.actions);
  const player = new Player(layer, pack, init.packUrl);
  const history: string[] = [];
  if (init.debug) (window as unknown as Record<string, unknown>).__pet = { id: pack.id, history, engine, player };

  const advance = () => { void player.play(engine.next()); };
  player.onStepStart = step => {
    history.push(step.clip);
    api.reportStatus(pack.poses[step.to].label);
    player.keep(engine.upcomingClips());
  };
  player.onEnded = advance;
  player.onError = clip => { api.log('warn', `片段 ${clip} 播放失敗，改走別的路`); engine.markBroken(clip); advance(); };

  api.onCommand(pose => {
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

  const stage = document.getElementById('stage')!;
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

  const frame = () => {
    const H = window.innerHeight;
    const W = frameW();
    cat.style.width = `${W}px`;
    const step = player.step;
    const k = player.progress;
    // the window is placed for the start pose; shift the video if this pose's ground line differs
    layer.style.transform = `translateY(${(g0 - poseValueAt(pack, step, k, 'ground')) * H}px)`;
    const cx = poseValueAt(pack, step, k, 'centerX') * W;
    Object.assign(shadow.style, { width: `${H * 0.5}px`, left: `${cx - H * 0.25}px`, top: `${g0 * H - 7}px`, opacity: showsShadow(pack, step) ? '1' : '0' });
    bubbles.place();
    requestAnimationFrame(frame);
  };

  void player.play(engine.start());
  requestAnimationFrame(frame);
  setTimeout(() => bubbles.say(pickLine(pack.lines.greet, Math.random)), 800);
});

api.ready();

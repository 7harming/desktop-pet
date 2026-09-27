import { BehaviorEngine } from '../shared/behavior';
import type { PetInit } from '../shared/ipc';
import { clickLine, commandLine, pickLine } from '../shared/lines';
import { isAsleep, poseValueAt, showsShadow } from '../shared/pose-geometry';
import { Bubbles } from './bubble';
import { Interactions } from './interactions';
import { Player } from './player';

const api = window.petApi;
const layer = document.getElementById('layer')!;
const shadow = document.getElementById('shadow')!;

api.onInit((init: PetInit) => {
  const { pack } = init;
  const engine = new BehaviorEngine(pack, Math.random);
  engine.auto = init.auto;
  const player = new Player(layer, pack, init.packUrl);
  const history: string[] = [];
  if (init.debug) (window as unknown as Record<string, unknown>).__pet = { id: pack.id, history, engine, player };

  const advance = () => { void player.play(engine.next()); };
  player.onStepStart = step => {
    history.push(step.clip);
    api.reportStatus(pack.poses[step.to].label);
    player.preload(engine.upcomingClips());
  };
  player.onEnded = advance;
  player.onError = clip => { api.log('warn', `片段 ${clip} 播放失敗，改走別的路`); engine.markBroken(clip); advance(); };

  api.onCommand(pose => {
    if (!engine.command(pose)) { api.log('warn', `走不到姿勢 ${pose}`); return; }
    const line = commandLine(pack, pose);
    if (line) bubbles.say(line);
  });
  api.onSetAuto(on => { engine.auto = on; });
  api.onPause(paused => { if (paused) player.pause(); else player.resume(); });

  const g0 = pack.poses[pack.start].ground;
  const stage = document.getElementById('stage')!;
  const bubbles = new Bubbles(stage, () => ({
    x: poseValueAt(pack, player.step, player.progress, 'centerX') * window.innerWidth,
    y: (g0 - poseValueAt(pack, player.step, player.progress, 'head')) * window.innerHeight - 8,
  }));
  if (init.debug) Object.assign((window as unknown as Record<string, object>).__pet, { bubbles });

  const probe = document.createElement('canvas');
  probe.width = 160; probe.height = 90;
  const ctx = probe.getContext('2d', { willReadFrequently: true })!;
  const hitTest = (x: number, y: number): boolean => {
    if ((document.elementFromPoint(x, y) as HTMLElement | null)?.closest('.bubble.reminder')) return true;
    const v = player.video;
    if (!v || v.readyState < 2) return false;
    const r = layer.getBoundingClientRect();
    const u = (x - r.left) / r.width;
    const t = (y - r.top) / r.height;
    if (u < 0 || u >= 1 || t < 0 || t >= 1) return false;
    ctx.clearRect(0, 0, 160, 90);
    ctx.drawImage(v, 0, 0, 160, 90);
    return ctx.getImageData(Math.floor(u * 160), Math.floor(t * 90), 1, 1).data[3] > 40;
  };
  const interactions = new Interactions({
    api, hitTest, wrap: stage, restY: init.restY,
    canDrag: () => { const s = engine.currentStep; return !!s && s.from === s.to && !!pack.poses[s.to].draggable; },
    onClick: () => {
      bubbles.say(clickLine(pack, engine.endPose, Math.random));
      if (pack.clickHeart && !isAsleep(pack, engine.endPose)) bubbles.heart();
    },
    onDragStart: () => bubbles.say(pickLine(pack.lines.drag, Math.random), 1600),
    onNoDrag: () => bubbles.say(pickLine(pack.lines.noDrag, Math.random)),
  });
  api.onRestY(y => interactions.setRestY(y));

  const frame = () => {
    const H = window.innerHeight;
    const W = window.innerWidth;
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

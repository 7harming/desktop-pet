import { BehaviorEngine } from '../shared/behavior';
import type { PetInit } from '../shared/ipc';
import { poseValueAt, showsShadow } from '../shared/pose-geometry';
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

  api.onCommand(pose => { if (!engine.command(pose)) api.log('warn', `走不到姿勢 ${pose}`); });
  api.onSetAuto(on => { engine.auto = on; });
  api.onPause(paused => { if (paused) player.pause(); else player.resume(); });

  const g0 = pack.poses[pack.start].ground;
  const frame = () => {
    const H = window.innerHeight;
    const W = window.innerWidth;
    const step = player.step;
    const k = player.progress;
    // the window is placed for the start pose; shift the video if this pose's ground line differs
    layer.style.transform = `translateY(${(g0 - poseValueAt(pack, step, k, 'ground')) * H}px)`;
    const cx = poseValueAt(pack, step, k, 'centerX') * W;
    Object.assign(shadow.style, { width: `${H * 0.5}px`, left: `${cx - H * 0.25}px`, top: `${g0 * H - 7}px`, opacity: showsShadow(pack, step) ? '1' : '0' });
    requestAnimationFrame(frame);
  };

  void player.play(engine.start());
  requestAnimationFrame(frame);
});

api.ready();

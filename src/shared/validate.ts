import { reachable } from './graph';
import type { Pack } from './types';

/** Spec 5.2 rules 2-6: files, clips, idles, transient poses, reachability, commands. */
export function validatePack(pack: Pack, fileExists: (relPath: string) => boolean): string[] {
  const errors: string[] = [];
  const poseIds = new Set(Object.keys(pack.poses));

  if (!fileExists(pack.portrait)) errors.push(`找不到頭像檔：${pack.portrait}`);
  for (const [id, c] of Object.entries(pack.clips)) if (!fileExists(c.file)) errors.push(`找不到片段 ${id} 的檔案：${c.file}`);
  for (const [id, file] of Object.entries(pack.hd ?? {})) if (!fileExists(file)) errors.push(`找不到片段 ${id} 的高解析度檔案：${file}`);

  const needClip = (clip: string, where: string) => { if (!pack.clips[clip]) errors.push(`${where} 用到未定義的片段：${clip}`); };
  let graphOk = true;
  for (const e of pack.edges) {
    for (const p of [e.from, e.to]) if (!poseIds.has(p)) { errors.push(`轉換 ${e.from}→${e.to} 用到不存在的姿勢：${p}`); graphOk = false; }
    if (e.clip) needClip(e.clip, `轉換 ${e.from}→${e.to}`);
  }

  for (const [id, p] of Object.entries(pack.poses)) {
    for (const c of p.idle ?? []) needClip(c, `姿勢 ${id}`);
    if (p.transient) {
      if (!pack.edges.some(e => e.from === id)) errors.push(`過渡姿勢 ${id} 沒有往外的轉換`);
    } else if (!p.idle?.length) {
      errors.push(`姿勢 ${id} 沒有待機片段`);
    }
  }

  if (pack.walk) for (const c of [pack.walk.loop, pack.walk.arrive, pack.walk.depart]) needClip(c, 'walk');

  const start = pack.poses[pack.start];
  if (!start) { errors.push(`起始姿勢不存在：${pack.start}`); graphOk = false; }
  else if (start.transient) errors.push(`起始姿勢不能是過渡姿勢：${pack.start}`);

  if (graphOk) {
    const fwd = reachable(pack.edges, pack.start);
    const back = reachable(pack.edges, pack.start, true);
    for (const id of poseIds) {
      if (!fwd.has(id)) errors.push(`從 ${pack.start} 走不到姿勢 ${id}`);
      if (!back.has(id)) errors.push(`姿勢 ${id} 走不回 ${pack.start}`);
    }
  }

  for (const c of pack.commands) {
    const p = pack.poses[c.pose];
    if (!p) errors.push(`指令「${c.label}」指到不存在的姿勢：${c.pose}`);
    else if (p.transient) errors.push(`指令「${c.label}」不能指到過渡姿勢：${c.pose}`);
  }
  for (const [type, pose] of Object.entries(pack.reminderPoses ?? {})) {
    const p = pack.poses[pose!];
    if (!p) errors.push(`提醒 ${type} 指到不存在的姿勢：${pose}`);
    else if (p.transient) errors.push(`提醒 ${type} 不能指到過渡姿勢：${pose}`);
  }
  return errors;
}

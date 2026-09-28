import type { Pack, ReminderType } from './types';

export const REMINDER_TYPES: ReminderType[] = ['water', 'stretch', 'eyes'];

export interface ParseResult { pack: Pack | null; errors: string[] }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.length > 0 && v.every(isStr);

/** Structural check of a parsed pack.json. Graph and file rules live in validatePack. */
export function parsePack(raw: unknown): ParseResult {
  const errors: string[] = [];
  const err = (m: string) => { errors.push(m); };
  if (!isObj(raw)) return { pack: null, errors: ['pack.json 不是一個物件'] };

  if (raw.schemaVersion !== 1) err(`不支援的 schemaVersion：${String(raw.schemaVersion)}`);
  for (const k of ['id', 'name', 'personality', 'portrait', 'start'] as const) if (!isStr(raw[k])) err(`缺少或錯誤的欄位：${k}`);

  const frame = raw.frame;
  if (!isObj(frame) || !isNum(frame.aspect) || frame.aspect <= 0 || !isNum(frame.displayHeight) || frame.displayHeight <= 0) {
    err('frame 需要正數的 aspect 和 displayHeight');
  }

  const poses = raw.poses;
  if (!isObj(poses) || Object.keys(poses).length === 0) err('poses 至少要有一個姿勢');
  else for (const [id, p] of Object.entries(poses)) {
    if (!isObj(p)) { err(`姿勢 ${id} 不是物件`); continue; }
    if (!isStr(p.label)) err(`姿勢 ${id} 缺少 label`);
    for (const k of ['ground', 'centerX', 'head'] as const) {
      if (!isNum(p[k]) || (p[k] as number) < 0 || (p[k] as number) > 1) err(`姿勢 ${id} 的 ${k} 要在 0 到 1 之間`);
    }
    if (p.idle !== undefined && !isStrArr(p.idle)) err(`姿勢 ${id} 的 idle 要是片段名稱的陣列`);
    for (const k of ['transient', 'shadow', 'draggable', 'asleep', 'brief'] as const) {
      if (p[k] !== undefined && typeof p[k] !== 'boolean') err(`姿勢 ${id} 的 ${k} 要是 true 或 false`);
    }
    for (const k of ['stay', 'autoWeight'] as const) {
      if (p[k] !== undefined && (!isNum(p[k]) || (p[k] as number) < 0)) err(`姿勢 ${id} 的 ${k} 要是非負數`);
    }
    if (isNum(p.stay) && p.stay > 1) err(`姿勢 ${id} 的 stay 不能大於 1`);
    for (const k of ['left', 'right'] as const) {
      if (p[k] !== undefined && (!isNum(p[k]) || (p[k] as number) < 0 || (p[k] as number) > 1)) err(`姿勢 ${id} 的 ${k} 要在 0 到 1 之間`);
    }
    if (isNum(p.left) && isNum(p.right) && p.left >= p.right) err(`姿勢 ${id} 的 left 要小於 right`);
  }

  const clips = raw.clips;
  if (!isObj(clips)) err('缺少 clips');
  else for (const [id, c] of Object.entries(clips)) {
    if (!isObj(c) || !isStr(c.file)) err(`片段 ${id} 缺少 file`);
    else if (c.rate !== undefined && (!isNum(c.rate) || c.rate <= 0)) err(`片段 ${id} 的 rate 要是正數`);
  }

  if (!Array.isArray(raw.edges)) err('缺少 edges');
  else raw.edges.forEach((e, i) => {
    if (!isObj(e) || !isStr(e.from) || !isStr(e.to)) { err(`第 ${i + 1} 條轉換缺少 from／to`); return; }
    const hasClip = e.clip !== undefined;
    const hasFade = e.fade !== undefined;
    if (hasClip === hasFade) err(`轉換 ${e.from}→${e.to} 要剛好有 clip 或 fade 其中一個`);
    if (hasClip && !isStr(e.clip)) err(`轉換 ${e.from}→${e.to} 的 clip 要是片段名稱`);
    if (hasFade && (!isNum(e.fade) || e.fade <= 0)) err(`轉換 ${e.from}→${e.to} 的 fade 要是正數秒數`);
  });

  const lines = raw.lines;
  if (!isObj(lines)) err('缺少 lines');
  else {
    for (const k of ['greet', 'drag', 'noDrag'] as const) if (!isStrArr(lines[k])) err(`lines.${k} 要是至少一句台詞的陣列`);
    if (!isObj(lines.click) || !isStrArr(lines.click.default)) err('lines.click.default 要是至少一句台詞的陣列');
    if (!isObj(lines.command)) err('缺少 lines.command');
    if (!isObj(lines.reminders)) err('缺少 lines.reminders');
    else for (const t of REMINDER_TYPES) {
      const r = lines.reminders[t];
      if (!isObj(r) || !isStr(r.default)) err(`lines.reminders.${t}.default 要是一句台詞`);
    }
  }

  const walk = raw.walk;
  if (walk !== undefined) {
    if (!isObj(walk)) err('walk 要是一個物件');
    else {
      for (const k of ['loop', 'arrive', 'depart'] as const) if (!isStr(walk[k])) err(`walk 缺少 ${k}`);
      for (const k of ['centerX', 'departX', 'width', 'head', 'left', 'right'] as const) {
        if (!isNum(walk[k]) || (walk[k] as number) < 0 || (walk[k] as number) > 1) err(`walk 的 ${k} 要在 0 到 1 之間`);
      }
      if (!isNum(walk.speed) || walk.speed <= 0) err('walk 的 speed 要是正數');
      for (const k of ['arriveGlide', 'departGlide'] as const) {
        const g = walk[k];
        if (g !== undefined && (!Array.isArray(g) || !g.length || !g.every(isNum))) err(`walk 的 ${k} 要是數字的陣列`);
      }
      if (walk.rate !== undefined && (!isNum(walk.rate) || walk.rate <= 0)) err('walk 的 rate 要是正數');
    }
  }

  if (raw.hd !== undefined) {
    if (!isObj(raw.hd)) err('hd 要是一個物件');
    else for (const [id, file] of Object.entries(raw.hd)) {
      if (!isObj(clips) || !(id in clips)) err(`hd 裡的 ${id} 不是已定義的片段`);
      if (!isStr(file)) err(`hd.${id} 要是檔案路徑`);
    }
  }

  if (raw.reminderPoses !== undefined) {
    if (!isObj(raw.reminderPoses)) err('reminderPoses 要是一個物件');
    else for (const [t, pose] of Object.entries(raw.reminderPoses)) {
      if (!(REMINDER_TYPES as string[]).includes(t)) err(`reminderPoses 裡的 ${t} 不是提醒種類`);
      else if (!isStr(pose)) err(`reminderPoses.${t} 要是姿勢名稱`);
    }
  }

  const pounce = raw.pounce;
  if (pounce !== undefined) {
    if (!isObj(pounce)) err('pounce 要是一個物件');
    else {
      for (const k of ['pose', 'toLeft', 'toRight'] as const) if (!isStr(pounce[k])) err(`pounce 缺少 ${k}`);
      for (const k of ['left', 'right'] as const) {
        if (!isNum(pounce[k]) || (pounce[k] as number) < 0 || (pounce[k] as number) > 1) err(`pounce 的 ${k} 要在 0 到 1 之間`);
      }
      const chance = pounce.autoChance;
      if (chance !== undefined && (!isNum(chance) || chance < 0 || chance > 1)) err('pounce 的 autoChance 要在 0 到 1 之間');
    }
  }

  if (typeof raw.clickHeart !== 'boolean') err('clickHeart 要是 true 或 false');
  if (!Array.isArray(raw.commands)) err('缺少 commands');
  else raw.commands.forEach((c, i) => {
    if (!isObj(c) || !isStr(c.label)) { err(`第 ${i + 1} 個指令缺少 label`); return; }
    if ((c.pose !== undefined) === (c.pounce !== undefined)) err(`指令「${c.label}」要剛好有 pose 或 pounce 其中一個`);
    else if (c.pose !== undefined && !isStr(c.pose)) err(`指令「${c.label}」的 pose 要是姿勢名稱`);
    else if (c.pounce !== undefined && c.pounce !== 'left' && c.pounce !== 'right') err(`指令「${c.label}」的 pounce 要是 left 或 right`);
  });

  return errors.length ? { pack: null, errors } : { pack: raw as unknown as Pack, errors };
}

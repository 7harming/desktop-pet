import { describe, it, expect } from 'vitest';
import { validatePack } from '../../src/shared/validate';
import { makePack } from './fixtures';

const allFiles = () => true;

describe('validatePack', () => {
  it('passes the test pack', () => {
    expect(validatePack(makePack(), allFiles)).toEqual([]);
  });
  it('reports missing files', () => {
    const e = validatePack(makePack(), f => f !== 'clips/go_perch.webm' && f !== 'portrait.png');
    expect(e).toContain('找不到頭像檔：portrait.png');
    expect(e).toContain('找不到片段 go_perch 的檔案：clips/go_perch.webm');
  });
  it('reports clips used but not defined', () => {
    const p = makePack(); p.poses.sit.idle = ['idle_nope'];
    expect(validatePack(p, allFiles)).toContain('姿勢 sit 用到未定義的片段：idle_nope');
  });
  it('needs an idle on every pose that is not transient', () => {
    const p = makePack(); delete p.poses.sit.idle;
    expect(validatePack(p, allFiles)).toContain('姿勢 sit 沒有待機片段');
  });
  it('needs a way out of a transient pose', () => {
    const p = makePack(); p.edges = p.edges.filter(e => e.from !== 'restProp');
    expect(validatePack(p, allFiles)).toContain('過渡姿勢 restProp 沒有往外的轉換');
  });
  it('rejects a transient start pose', () => {
    const p = makePack(); p.start = 'restProp';
    expect(validatePack(p, allFiles)).toContain('起始姿勢不能是過渡姿勢：restProp');
  });
  it('finds poses that cannot be reached or cannot get back', () => {
    const p = makePack();
    p.poses.island = { label: '孤島', idle: ['idle_sit'], ground: 0.9, centerX: 0.5, head: 0.4 };
    p.edges.push({ from: 'island', to: 'rest', clip: 'sit_to_rest' });
    const e = validatePack(p, allFiles);
    expect(e).toContain('從 rest 走不到姿勢 island');
    expect(e).not.toContain('姿勢 island 走不回 rest');
  });
  it('checks commands', () => {
    const p = makePack(); p.commands.push({ label: '道具', pose: 'restProp' }, { label: '月球', pose: 'moon' });
    const e = validatePack(p, allFiles);
    expect(e).toContain('指令「道具」不能指到過渡姿勢：restProp');
    expect(e).toContain('指令「月球」指到不存在的姿勢：moon');
  });

  it('checks the reminder poses', () => {
    const p = makePack(); p.reminderPoses = { water: 'restProp', stretch: 'moon' };
    const e = validatePack(p, allFiles);
    expect(e).toContain('提醒 water 不能指到過渡姿勢：restProp');
    expect(e).toContain('提醒 stretch 指到不存在的姿勢：moon');
  });

  it('checks the pounce', () => {
    const p = makePack(); p.pounce = { ...p.pounce!, pose: 'restProp', toRight: 'nope' };
    const e = validatePack(p, allFiles);
    expect(e).toContain('pounce 不能從過渡姿勢開始：restProp');
    expect(e).toContain('pounce 用到未定義的片段：nope');
    p.pounce.pose = 'moon';
    expect(validatePack(p, allFiles)).toContain('pounce 指到不存在的姿勢：moon');
  });

  it('needs a pounce for pounce commands', () => {
    const p = makePack(); delete p.pounce;
    expect(validatePack(p, allFiles)).toContain('指令「向左撲」要撲，但寵物包沒有 pounce');
  });

  it('reports missing high-resolution clip files', () => {
    const p = makePack(); p.hd = { idle_rest: 'hd/idle_rest.webm' };
    expect(validatePack(p, f => f !== 'hd/idle_rest.webm')).toContain('找不到片段 idle_rest 的高解析度檔案：hd/idle_rest.webm');
  });

  it('checks the walking clips', () => {
    const p = makePack(); p.walk!.arrive = 'nope';
    expect(validatePack(p, allFiles)).toContain('walk 用到未定義的片段：nope');
  });
});

import { describe, it, expect } from 'vitest';
import { parsePack } from '../../src/shared/pack';
import { makePack } from './fixtures';

describe('parsePack', () => {
  it('accepts the test pack', () => {
    const r = parsePack(makePack());
    expect(r.errors).toEqual([]);
    expect(r.pack?.id).toBe('testcat');
  });

  it('rejects a non-object', () => {
    expect(parsePack(null).errors).toEqual(['pack.json 不是一個物件']);
  });

  it('rejects an unknown schema version', () => {
    const p: any = makePack(); p.schemaVersion = 2;
    expect(parsePack(p).errors).toContain('不支援的 schemaVersion：2');
  });

  it('requires exactly one of clip or fade on an edge', () => {
    const p: any = makePack(); p.edges.push({ from: 'rest', to: 'sit', clip: 'rest_to_sit', fade: 0.5 });
    expect(parsePack(p).errors).toContain('轉換 rest→sit 要剛好有 clip 或 fade 其中一個');
  });

  it('checks that pose numbers are ratios', () => {
    const p: any = makePack(); p.poses.rest.ground = 1.5;
    expect(parsePack(p).errors).toContain('姿勢 rest 的 ground 要在 0 到 1 之間');
  });

  it('checks optional booleans on a pose', () => {
    const p: any = makePack(); p.poses.perch.asleep = 'yes';
    expect(parsePack(p).errors).toContain('姿勢 perch 的 asleep 要是 true 或 false');
  });

  it('checks the optional pose extent', () => {
    const p: any = makePack(); p.poses.rest.left = 0.6; p.poses.sit.right = 1.2;
    const e = parsePack(p).errors;
    expect(e).toContain('姿勢 rest 的 left 要小於 right');
    expect(e).toContain('姿勢 sit 的 right 要在 0 到 1 之間');
  });

  it('checks the walk section', () => {
    const p: any = makePack(); delete p.walk.loop; p.walk.speed = 0; p.walk.departX = 2; p.walk.rate = 0; p.walk.arriveGlide = ['x'];
    const e = parsePack(p).errors;
    expect(e).toContain('walk 缺少 loop');
    expect(e).toContain('walk 的 speed 要是正數');
    expect(e).toContain('walk 的 arriveGlide 要是數字的陣列');
    expect(e).toContain('walk 的 departX 要在 0 到 1 之間');
    expect(e).toContain('walk 的 rate 要是正數');
  });

  it('checks the optional high-resolution clips', () => {
    const p: any = makePack(); p.hd = { idle_rest: 'hd/idle_rest.webm', nope: 'hd/x.webm', idle_sit: 3 };
    const e = parsePack(p).errors;
    expect(e).toContain('hd 裡的 nope 不是已定義的片段');
    expect(e).toContain('hd.idle_sit 要是檔案路徑');
  });

  it('checks the optional reminder poses', () => {
    const p: any = makePack(); p.reminderPoses = { water: 'perch', nap: 'sit', stretch: 3 };
    const e = parsePack(p).errors;
    expect(e).toContain('reminderPoses 裡的 nap 不是提醒種類');
    expect(e).toContain('reminderPoses.stretch 要是姿勢名稱');
    expect(e).toHaveLength(2);
  });

  it('allows a pack without walking', () => {
    const p: any = makePack(); delete p.walk;
    expect(parsePack(p).errors).toEqual([]);
  });

  it('needs a default click line and every reminder line', () => {
    const p: any = makePack(); delete p.lines.click.default; delete p.lines.reminders.eyes;
    const e = parsePack(p).errors;
    expect(e).toContain('lines.click.default 要是至少一句台詞的陣列');
    expect(e).toContain('lines.reminders.eyes.default 要是一句台詞');
  });
});

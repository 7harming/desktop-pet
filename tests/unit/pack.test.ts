import { describe, it, expect } from 'vitest';
import { cardsOf, parsePack } from '../../src/shared/pack';
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
    const p: any = makePack(); p.poses.perch.asleep = 'yes'; p.poses.sit.brief = 1;
    expect(parsePack(p).errors).toContain('姿勢 perch 的 asleep 要是 true 或 false');
    expect(parsePack(p).errors).toContain('姿勢 sit 的 brief 要是 true 或 false');
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

  it('checks the optional pounce', () => {
    const p: any = makePack(); p.pounce = { pose: 'rest', toLeft: 3, left: 0.1, right: 1.5 };
    const e = parsePack(p).errors;
    expect(e).toContain('pounce 缺少 toLeft');
    expect(e).toContain('pounce 缺少 toRight');
    expect(e).toContain('pounce 的 right 要在 0 到 1 之間');
    expect(e).toHaveLength(3);
  });

  it('checks the optional fight and its lines', () => {
    const p: any = makePack(); p.fight = { pose: 'rest', toRight: 'fight_right', left: -0.1, right: 1 }; p.lines.fight = [];
    const e = parsePack(p).errors;
    expect(e).toContain('fight 缺少 toLeft');
    expect(e).toContain('fight 的 left 要在 0 到 1 之間');
    expect(e).toContain('lines.fight 要是至少一句台詞的陣列');
    expect(e).toHaveLength(3);
  });

  it('checks the optional lines for coming back and for the clock', () => {
    const ok: any = makePack(); ok.lines.back = ['回來了']; ok.lines.time = { lunch: ['吃飯'], bedtime: ['睡覺'] };
    expect(parsePack(ok).errors).toEqual([]);
    const p: any = makePack(); p.lines.back = 'x'; p.lines.time = { lunch: [], teatime: ['喝茶'] };
    const e = parsePack(p).errors;
    expect(e).toContain('lines.back 要是至少一句台詞的陣列');
    expect(e).toContain('lines.time.lunch 要是至少一句台詞的陣列');
    expect(e).toContain('lines.time 沒有 teatime 這種時間');
    expect(e).toHaveLength(3);
  });

  it("checks the optional card (one, or several: the first is the wheel's) and alert", () => {
    const ok: any = makePack(); ok.card = 'memo'; ok.alert = 'sit';
    expect(parsePack(ok).errors).toEqual([]);
    const many: any = makePack(); many.card = ['todo', 'dinner'];
    expect(parsePack(many).errors).toEqual([]);
    expect(cardsOf(many)).toEqual(['todo', 'dinner']);
    expect(cardsOf(ok)).toEqual(['memo']);
    expect(cardsOf(makePack())).toEqual([]);
    const p: any = makePack(); p.card = 'diary'; p.alert = 3;
    const e = parsePack(p).errors;
    expect(e).toContain('card 要是 memo、todo、dinner，或它們排成的陣列（不重複）');
    expect(e).toContain('alert 要是姿勢名稱');
    expect(e).toHaveLength(2);
    for (const card of [[], ['todo', 'todo'], ['todo', 'diary']]) {
      const q: any = makePack(); q.card = card;
      expect(parsePack(q).errors).toEqual(['card 要是 memo、todo、dinner，或它們排成的陣列（不重複）']);
    }
  });

  it('checks the optional toy', () => {
    const p: any = makePack(); p.toy = { pose: 'sit', swats: { left: 'a', up: 3 }, left: 0, right: 2 };
    const e = parsePack(p).errors;
    expect(e).toContain('toy.swats 要有 left、upLeft、up、upRight、right 五個方向的片段');
    expect(e).toContain('toy 的 right 要在 0 到 1 之間');
  });

  it("checks the wand's paw peak and the dinner lines", () => {
    const ok: any = makePack(); ok.toy.upPeak = 0.4; ok.lines.dinner = ['今晚吃{dish}！'];
    expect(parsePack(ok).errors).toEqual([]);
    const p: any = makePack(); p.toy.upPeak = 1.2; p.lines.dinner = [];
    const e = parsePack(p).errors;
    expect(e).toContain('toy 的 upPeak 要在 0 到 1 之間');
    expect(e).toContain('lines.dinner 要是至少一句台詞的陣列');
  });

  it('checks pounce commands', () => {
    const p: any = makePack();
    p.commands.push({ label: '亂撲', pounce: 'up' }, { label: '兩個都有', pose: 'sit', pounce: 'left' }, { label: '都沒有' });
    p.pounce.autoChance = 2;
    const e = parsePack(p).errors;
    expect(e).toContain('指令「亂撲」的 pounce 要是 left 或 right');
    expect(e).toContain('指令「兩個都有」要剛好有 pose 或 pounce 其中一個');
    expect(e).toContain('指令「都沒有」要剛好有 pose 或 pounce 其中一個');
    expect(e).toContain('pounce 的 autoChance 要在 0 到 1 之間');
  });

  it('checks the optional left walk', () => {
    const p: any = makePack(); p.walk.leftward = { loop: 'walk_loop', centerX: 1.2, width: 0.3 };
    const e = parsePack(p).errors;
    expect(e).toContain('walk.leftward 的 centerX 要在 0 到 1 之間');
    expect(e).toContain('walk.leftward 的 speed 要是正數');
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

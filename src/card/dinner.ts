import { addDish, removeDish, renameDish, spinTo, type DishChange } from '../shared/dinner';
import type { CardAction, DinnerView } from '../shared/ipc';
import { el } from './dom';

/** How long the wheel turns. */
const SPIN_MS = 3_200;
/** The wheel's radius and its centre in its svg (px, before the card's zoom). */
const R = 66;
const C = R + 2;
const NS = 'http://www.w3.org/2000/svg';

function svg(tag: string, attrs: Record<string, string | number>, text?: string): SVGElement {
  const e = document.createElementNS(NS, tag) as SVGElement;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}

/**
 * 小昭's dinner wheel: the front turns the wheel to the dish main picked (once the cat's paw reaches it), the back is the menu.
 * Main checks every change again; the card checks first only to say in red why one can not be made.
 */
export function buildDinner(body: HTMLElement, act: (a: CardAction) => void): { render(v: DinnerView): void; focus(): void } {
  let view: DinnerView = { items: [], yesterday: null, spin: null };
  let editing = false;
  let turned = 0;       // how far the wheel has turned (deg), growing spin by spin
  let turnedFor = 0;    // the spin it last turned for
  let said = '';        // what the last spin stopped at

  // ---- the front: the wheel ----
  const disc = svg('svg', { class: 'disc', width: 2 * C, height: 2 * C });
  disc.style.transition = `transform ${SPIN_MS}ms cubic-bezier(.17, .67, .21, 1)`;
  const over = svg('svg', { class: 'over', width: 150, height: 148 });
  over.append(svg('polygon', { points: '68,4 82,4 75,20', class: 'pointer' }), svg('circle', { cx: 75, cy: 78, r: 9, class: 'hub' }));
  const result = el('div', { className: 'result' });
  const editBtn = el('button', { className: 'edit-menu', textContent: '改菜單' });
  const spinBtn = el('button', { className: 'spin', textContent: '轉一下' });
  const front = el('div', { className: 'front' }, el('div', { className: 'wheel' }, disc, over), result,
    el('div', { className: 'bar' }, editBtn, spinBtn));

  // ---- the back: the menu ----
  const list = el('ul', { className: 'dishes' });
  const newDish = el('input', { className: 'new-dish', placeholder: '新增菜色……', maxLength: 6 });
  const plus = el('button', { className: 'plus', textContent: '＋', title: '新增' });
  const error = el('div', { className: 'error' });
  const done = el('button', { className: 'done', textContent: '完成' });
  const back = el('div', { className: 'back' }, list, el('div', { className: 'add-dish' }, newDish, plus), error,
    el('div', { className: 'bar end' }, done));

  const drawWheel = () => {
    const n = view.items.length;
    const s = 360 / n;
    const at = (deg: number) => `${C + R * Math.cos((deg - 90) * Math.PI / 180)} ${C + R * Math.sin((deg - 90) * Math.PI / 180)}`;
    disc.replaceChildren(...view.items.flatMap((dish, i) => {
      const old = dish === view.yesterday;
      const turn = `rotate(${(i + 0.5) * s} ${C} ${C})`;
      const parts = [
        svg('path', { d: `M${C} ${C}L${at(i * s)}A${R} ${R} 0 0 1 ${at((i + 1) * s)}Z`, class: old ? 'slice old' : i % 2 ? 'slice odd' : 'slice' }),
        svg('text', { x: C, y: C - R * 0.68, transform: turn, class: `name${n > 9 ? ' small' : ''}${old ? ' old' : ''}` }, dish),
      ];
      if (old) parts.push(svg('text', { x: C, y: C - R * 0.4, transform: turn, class: 'yesterday' }, '昨天'));
      return parts;
    }));
  };

  const turnTo = (seq: number, index: number) => {
    turnedFor = seq;
    const dish = view.items[index];
    turned = spinTo(turned, index, view.items.length);
    disc.style.transform = `rotate(${turned}deg)`;
    setTimeout(() => { said = `今晚吃：${dish}`; result.textContent = said; act({ kind: 'spun', seq }); }, SPIN_MS);
  };

  /** Show what a change would do: red words if it can not be made, else main is told. */
  const tryIt = (r: DishChange, a: CardAction): boolean => {
    if ('error' in r) { error.textContent = r.error; return false; }
    error.textContent = '';
    act(a);
    return true;
  };

  const drawList = () => {
    list.replaceChildren(...view.items.map(dish => {
      const name = el('span', { className: 'text', textContent: dish });
      name.addEventListener('click', () => rename(name, dish));
      const del = el('button', { className: 'del', textContent: '🗑', title: '刪除' });
      del.addEventListener('click', () => tryIt(removeDish(view.items, dish), { kind: 'dishDelete', dish }));
      return el('li', {}, name, del);
    }));
  };

  /** Click a dish to rename it: Enter or leaving the box keeps it, Esc does not (as with a reminder). */
  const rename = (span: HTMLSpanElement, dish: string) => {
    const input = el('input', { className: 'edit', value: dish, maxLength: 6 });
    let finished = false;
    const finish = (keep: boolean) => {
      if (finished) return;
      finished = true;
      if (keep && input.value.trim() !== dish) tryIt(renameDish(view.items, dish, input.value), { kind: 'dishRename', from: dish, to: input.value });
      drawList();
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
    input.addEventListener('blur', () => finish(true));
    span.replaceWith(input);
    input.focus();
    input.select();
  };

  const add = () => {
    if (tryIt(addDish(view.items, newDish.value), { kind: 'dishAdd', text: newDish.value })) newDish.value = '';
    newDish.focus();
  };
  plus.addEventListener('click', add);
  newDish.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
  newDish.addEventListener('input', () => { error.textContent = ''; });

  const flip = (toMenu: boolean) => {
    editing = toMenu;
    error.textContent = '';
    body.replaceChildren(toMenu ? back : front);
    if (toMenu) { drawList(); newDish.focus(); }
  };
  editBtn.addEventListener('click', () => { if (!view.spin) flip(true); });
  done.addEventListener('click', () => flip(false));
  spinBtn.addEventListener('click', () => { if (!view.spin) act({ kind: 'spin' }); });
  body.replaceChildren(front);

  return {
    render(v: DinnerView) {
      const redraw = v.items.join('\n') !== view.items.join('\n') || v.yesterday !== view.yesterday;
      view = v;
      if (redraw) drawWheel();
      spinBtn.disabled = editBtn.disabled = !!v.spin;
      if (v.spin?.started && v.spin.seq !== turnedFor) turnTo(v.spin.seq, v.spin.index);
      result.textContent = v.spin && !v.spin.started ? '……' : v.spin ? '轉呀轉……' : said;
      if (editing && !list.querySelector('.edit')) drawList();
    },
    focus() { (editing ? newDish : spinBtn).focus(); },
  };
}

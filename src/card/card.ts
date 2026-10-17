import type { CardAction, CardState, TodoView } from '../shared/ipc';
import { MINUTES, type Repeat } from '../shared/todo';
import { buildDinner } from './dinner';
import { el } from './dom';

const api = window.cardApi;
const card = document.getElementById('card')!;
const body = document.getElementById('body')!;
/** The memo grows with its text up to this many lines, then scrolls. */
const MEMO_LINES = 10;
const REPEAT_LABEL: Record<Repeat, string> = { once: '一次', daily: '每天', weekdays: '平日' };
const pad = (n: number) => String(n).padStart(2, '0');
const act = (a: CardAction) => api.act(a);

// the window fits the card, ears included
new ResizeObserver(() => api.resize(Math.ceil(card.getBoundingClientRect().bottom) + 1)).observe(card);

// hot while the pointer is over the card or it has the focus: it does not close by itself then
let over = false;
const hot = () => api.hot(over || document.hasFocus());
document.documentElement.addEventListener('mouseenter', () => { over = true; hot(); });
document.documentElement.addEventListener('mouseleave', () => { over = false; hot(); });
window.addEventListener('focus', hot);
window.addEventListener('blur', hot);

document.getElementById('close')!.addEventListener('click', () => api.close());
document.querySelector('header')!.addEventListener('wheel', e => { if (e.deltaY > 0) api.close(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !(e.target as HTMLElement).classList.contains('edit')) api.close(); });

let state: CardState | null = null;
let dinner: ReturnType<typeof buildDinner> | null = null;

// ---- 阿胖's memo: one free text, saved as it is typed ----
let memo: HTMLTextAreaElement | null = null;
function buildMemo(): void {
  const m = el('textarea', { placeholder: '寫點什麼……', rows: 3 });
  // main has every key at once (it writes the file a moment later): a card closed straight after typing loses nothing
  m.addEventListener('input', () => { fitMemo(); act({ kind: 'memo', text: m.value }); });
  memo = m;
  body.replaceChildren(m);
}
function fitMemo(): void {
  if (!memo) return;
  const line = parseFloat(getComputedStyle(memo).lineHeight);
  memo.style.height = 'auto';
  memo.style.height = `${Math.min(memo.scrollHeight, line * MEMO_LINES)}px`;
}

// ---- 小昭's reminders: a list in the order of the day, and a row to add one ----
const list = el('ul');
let newText: HTMLInputElement | null = null;
function buildTodo(): void {
  const hour = el('select', { className: 'hour' });
  for (let h = 0; h < 24; h++) hour.append(el('option', { value: String(h), textContent: pad(h) }));
  const minute = el('select', { className: 'minute' });
  for (const m of MINUTES) minute.append(el('option', { value: String(m), textContent: pad(m) }));
  const repeat = el('select', { className: 'repeat' });
  for (const r of ['once', 'daily', 'weekdays'] as Repeat[]) repeat.append(el('option', { value: r, textContent: REPEAT_LABEL[r] }));
  // the next ten minutes at least ten minutes away
  const now = new Date();
  const next = (Math.ceil((now.getHours() * 60 + now.getMinutes() + 10) / 10) * 10) % (24 * 60);
  hour.value = String(Math.floor(next / 60));
  minute.value = String(next % 60);
  const text = el('input', { className: 'new-text', placeholder: '新增提醒……' });
  const plus = el('button', { className: 'plus', textContent: '＋', title: '新增' });
  const add = () => {
    const t = text.value.trim();
    if (!t) { text.focus(); return; }
    act({ kind: 'add', text: t, hour: Number(hour.value), minute: Number(minute.value), repeat: repeat.value as Repeat });
    text.value = '';
  };
  plus.addEventListener('click', add);
  text.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
  newText = text;
  body.replaceChildren(list, el('div', { className: 'add' },
    el('div', { className: 'row' }, hour, '：', minute, repeat), el('div', { className: 'row' }, text, plus)));
}

function renderTodos(todos: TodoView[]): void {
  if (!todos.length) { list.replaceChildren(el('li', { className: 'empty', textContent: '還沒有提醒事項' })); return; }
  list.replaceChildren(...todos.map(item));
}

function item(t: TodoView): HTMLLIElement {
  const li = el('li', { className: [t.done ? 'done' : '', t.due ? 'due' : ''].filter(Boolean).join(' ') });
  li.dataset.id = t.id;
  const box = el('input', { type: 'checkbox', checked: t.done });
  box.addEventListener('change', () => act({ kind: 'toggle', id: t.id, done: box.checked }));
  const text = el('span', { className: 'text', textContent: t.text });
  text.addEventListener('click', () => editText(text, t));
  li.append(box, el('span', { className: 'time', textContent: t.time }), text);
  if (t.repeat !== 'once') li.append(el('span', { className: 'tag', textContent: REPEAT_LABEL[t.repeat] }));
  if (t.missed) li.append(el('span', { className: 'tag missed', textContent: '錯過' }));
  const del = el('button', { className: 'del', textContent: '🗑', title: '刪除' });
  del.addEventListener('click', () => act({ kind: 'delete', id: t.id }));
  li.append(del);
  return li;
}

/** Click a reminder's text to change it: Enter or leaving the box keeps it, Esc does not. */
function editText(span: HTMLSpanElement, t: TodoView): void {
  const input = el('input', { className: 'edit', value: t.text });
  let done = false;
  const finish = (keep: boolean) => {
    if (done) return;
    done = true;
    const text = input.value.trim();
    if (keep && text && text !== t.text) act({ kind: 'edit', id: t.id, text });
    if (state) renderTodos(state.todos);
  };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
  input.addEventListener('blur', () => finish(true));
  span.replaceWith(input);
  input.focus();
  input.select();
}

api.onState(s => {
  const fresh = state?.kind !== s.kind;
  state = s;
  if (fresh) {
    card.className = `card ${s.kind}`;
    document.body.dataset.kind = s.kind;
    if (s.kind === 'memo') buildMemo(); else if (s.kind === 'dinner') dinner = buildDinner(body, act); else buildTodo();
  }
  document.getElementById('title')!.textContent = s.title;
  // what is being typed wins over what main last saw
  if (s.kind === 'memo' && memo && (fresh || document.activeElement !== memo)) { memo.value = s.memo; fitMemo(); }
  if (s.kind === 'todo' && !list.querySelector('.edit')) renderTodos(s.todos);
  if (s.kind === 'dinner') dinner?.render(s.dinner);
});
api.onFocus(() => { if (state?.kind === 'dinner') dinner?.focus(); else (state?.kind === 'memo' ? memo : newText)?.focus(); });
api.ready();

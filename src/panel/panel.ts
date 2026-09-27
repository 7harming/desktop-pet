import type { PanelAction, PanelPet, PanelState } from '../shared/ipc';

const api = window.panelApi;
const $ = (id: string) => document.getElementById(id)!;
type ReminderKey = 'water' | 'stretch' | 'eyes';
const REMINDER_ROWS: [ReminderKey, string][] = [['water', '喝水'], ['stretch', '伸展'], ['eyes', '休息眼睛（全螢幕休息 30 秒）']];
const reminderPatch = (key: ReminderKey, minutes: number) => ({ kind: 'reminders', [key]: minutes }) as PanelAction;
const CHOICES = [0, 30, 45, 60, 90];

let state: PanelState;
const act = async (a: PanelAction) => { state = await api.act(a); render(); };

for (const b of document.querySelectorAll<HTMLButtonElement>('.tab')) {
  b.addEventListener('click', () => {
    for (const t of document.querySelectorAll('.tab')) t.classList.toggle('active', t === b);
    for (const id of ['pets', 'reminders', 'settings']) $(`tab-${id}`).hidden = id !== b.dataset.tab;
  });
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e: HTMLElementTagNameMap[K] = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
}

function petCard(p: PanelPet): HTMLElement {
  const card = el('div', { className: 'card' });
  card.dataset.pet = p.id;
  const head = el('div', { className: 'head' },
    p.portraitUrl ? el('img', { src: p.portraitUrl, alt: '' }) : el('div'),
    el('div', {}, el('div', { className: 'name' }, p.name), el('div', { className: 'sub' }, p.personality)));
  if (p.visible && p.status) head.append(el('span', { className: 'status' }, `目前：${p.status}`));
  card.append(head);
  if (p.errors.length) {
    card.append(el('div', { className: 'sub' }, '這隻貓的寵物包有問題，暫時不能使用：'),
      el('ul', { className: 'errors' }, ...p.errors.map(e => el('li', {}, e))));
    return card;
  }
  const visible = el('input', { type: 'checkbox', className: 'visible', checked: p.visible });
  visible.addEventListener('change', () => act({ kind: 'pet', id: p.id, visible: visible.checked }));
  const auto = el('input', { type: 'checkbox', className: 'auto', checked: p.auto });
  auto.addEventListener('change', () => act({ kind: 'pet', id: p.id, auto: auto.checked }));
  const scale = el('input', { type: 'range', className: 'scale', min: '0.6', max: '1.5', step: '0.05', value: String(p.scale) });
  scale.addEventListener('change', () => act({ kind: 'pet', id: p.id, scale: Number(scale.value) }));
  card.append(el('div', { className: 'row' },
    el('label', {}, visible, '出現在桌面'), el('label', {}, auto, '自動行動'), el('label', {}, '大小', scale)));
  // the poses the cat may choose by itself; at least one stays ticked
  const ticked = new Set(p.actions ?? p.commands.map(c => c.pose));
  const actions = el('div', { className: 'row actions' }, el('span', { className: 'sub' }, '待機時會做：'));
  for (const c of p.commands) {
    const box = el('input', { type: 'checkbox', className: 'action', checked: ticked.has(c.pose), disabled: ticked.size === 1 && ticked.has(c.pose) });
    box.dataset.pose = c.pose;
    box.addEventListener('change', () => {
      const next = p.commands.map(x => x.pose).filter(pose => (pose === c.pose ? box.checked : ticked.has(pose)));
      act({ kind: 'pet', id: p.id, actions: next });
    });
    actions.append(el('label', {}, box, c.label));
  }
  card.append(actions);
  const cmds = el('div', { className: 'commands' });
  for (const c of p.commands) {
    const b = el('button', { className: 'cmd', textContent: c.label, disabled: !p.visible });
    b.dataset.pose = c.pose;
    b.addEventListener('click', () => act({ kind: 'command', id: p.id, pose: c.pose }));
    cmds.append(b);
  }
  card.append(cmds);
  return card;
}

function remindersTab(): HTMLElement[] {
  const rows: HTMLElement[] = REMINDER_ROWS.map(([key, label]) => {
    const sel = el('select');
    sel.dataset.reminder = key;
    for (const c of CHOICES) sel.append(el('option', { value: String(c), textContent: c ? `每 ${c} 分鐘` : '關閉', selected: state.reminders[key] === c }));
    sel.addEventListener('change', () => act(reminderPatch(key, Number(sel.value))));
    return el('div', { className: 'line' }, el('span', {}, label), sel);
  });
  const notify = el('input', { type: 'checkbox', className: 'notify', checked: state.reminders.notify });
  notify.addEventListener('change', () => act({ kind: 'reminders', notify: notify.checked }));
  const test = el('button', { className: 'plain test-reminder', textContent: '試一次提醒' });
  test.addEventListener('click', () => act({ kind: 'testReminder' }));
  const testBreak = el('button', { className: 'plain test-break', textContent: '試一次休息' });
  testBreak.addEventListener('click', () => act({ kind: 'testBreak' }));
  rows.push(el('div', { className: 'line' }, el('label', {}, notify, '同時跳出 Windows 通知'), test, testBreak));
  return [el('div', { className: 'card' }, ...rows)];
}

function settingsTab(): HTMLElement[] {
  const autostart = el('input', { type: 'checkbox', className: 'autostart', checked: state.autoStart });
  autostart.addEventListener('change', () => act({ kind: 'autoStart', on: autostart.checked }));
  const reset = el('button', { className: 'plain reset-positions', textContent: '把所有貓放回工作列' });
  reset.addEventListener('click', () => act({ kind: 'resetPositions' }));
  return [el('div', { className: 'card' },
    el('div', { className: 'line' }, el('label', {}, autostart, '開機自動啟動')),
    el('div', { className: 'line' }, el('span', {}, '貓咪跑到奇怪的地方時'), reset),
    el('div', { className: 'line' }, el('span', {}, '版本'), `v${state.version}`))];
}

function render(): void {
  const w = $('warning');
  w.hidden = !state.warning;
  w.textContent = state.warning ?? '';
  $('tab-pets').replaceChildren(...state.pets.map(petCard),
    el('div', { className: 'card sub' }, '之後做好的貓咪會出現在這裡'));
  $('tab-reminders').replaceChildren(...remindersTab());
  $('tab-settings').replaceChildren(...settingsTab());
}

api.onState(s => { state = s; render(); });
void api.getState().then(s => { state = s; render(); });

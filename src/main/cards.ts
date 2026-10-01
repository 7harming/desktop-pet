import { CardWindow } from './card-window';
import type { Logger } from './logger';
import type { NotesStore } from './notes-store';
import type { WorkArea } from './pet-geometry';
import type { CardAction, CardState, TodoView } from '../shared/ipc';
import type { Notes } from '../shared/notes';
import type { CardSettings } from '../shared/settings';
import { crossedMinute } from '../shared/time-events';
import { dropOldDone, dueTodos, isDone, markDone, markFired, markUndone, MINUTES, newTodo, sortTodos, timeText, type DueTodo, type Repeat, type Todo } from '../shared/todo';
import type { CardKind, Pack } from '../shared/types';

export const CARD_KINDS: CardKind[] = ['todo', 'memo'];
type Mode = 'auto' | 'hand' | 'due';
/** A due reminder outranks a card opened by hand, which outranks one that popped up by itself. */
const RANK: Record<Mode, number> = { auto: 0, hand: 1, due: 2 };
/** One card's pops by themselves closer together than this are one (waking, unlocking and coming back come together). */
const COALESCE_MS = 30_000;
/** A card that popped up by itself goes after this long untouched (DESKTOP_PET_CARD_SECONDS: tests). */
const AUTO_CLOSE_MS = (Number(process.env.DESKTOP_PET_CARD_SECONDS) || 30) * 1000;
/** Once every reminder that was due is ticked, the card goes after this long. */
const ANSWERED_CLOSE_MS = 3_000;
/** Back at the computer: wait at most this long for the cat to sit up before its card pops. */
const WOKE_WAIT_MS = 8_000;
const REPEATS: Repeat[] = ['once', 'daily', 'weekdays'];

export interface CardHost {
  /** The cats on the desktop, in order. */
  onScreen(): string[];
  packOf(id: string): Pack | null;
  /** The cat whose pack holds this card, whether or not it is out; null: no cat holds it, so there is no such card. */
  ownerOf(kind: CardKind): string | null;
  workArea(): WorkArea;
  away(): boolean;
  settings(): Record<CardKind, CardSettings>;
  /** Have the cat sit up and look at the user (true), or go back to its ways (false). */
  attend(id: string, on: boolean): void;
  notify(body: string, onClick: () => void): void;
  log: Logger;
}

interface OpenCard { card: CardWindow; petId: string; mode: Mode; hot: boolean; timer: ReturnType<typeof setTimeout> | undefined }

/** The two cards (小昭's reminders, 阿胖's memo) over the cats' heads, the reminders' timing, and the cards popping up by themselves. */
export class CardController {
  notes: Notes;
  /** Reminders that came up and are not ticked yet, each with whether it was missed: the card marks them. */
  readonly pending = new Map<string, boolean>();
  readonly open = new Map<CardKind, OpenCard>();
  readonly heads = new Map<string, { x: number; y: number; settled: boolean }>();
  /** Cards waiting for their cat to stand still (it walks in, or is being dragged) before they show. */
  private readonly waiting = new Map<CardKind, { petId: string; mode: Mode }>();
  private readonly lastPop = new Map<CardKind, number>();
  /** Pops that came while the user was away: shown once they are back and the cat has sat up. */
  private readonly deferred = new Set<CardKind>();
  private wokeWait: { kinds: CardKind[]; timer: ReturnType<typeof setTimeout> } | null = null;
  private lastTick = new Date();
  /** The cat sitting up for due reminders. */
  private attending: string | null = null;

  constructor(private readonly host: CardHost, private readonly store: NotesStore, private readonly preloadDir: string) {
    this.notes = store.load();
  }

  has(kind: CardKind): boolean { return this.host.ownerOf(kind) !== null; }

  title(kind: CardKind): string {
    const owner = this.host.ownerOf(kind);
    return `${(owner && this.host.packOf(owner)?.name) ?? ''}的${kind === 'todo' ? '提醒事項' : '備忘錄'}`;
  }

  menuItems(): { kind: CardKind; label: string }[] {
    return CARD_KINDS.filter(k => this.has(k)).map(kind => ({ kind, label: kind === 'todo' ? '提醒事項' : '備忘錄' }));
  }

  state(kind: CardKind): CardState {
    const now = Date.now();
    const todos: TodoView[] = sortTodos(this.notes.todos).map(t => ({
      id: t.id, text: t.text, time: timeText(t), repeat: t.repeat, done: isDone(t, now),
      due: this.pending.has(t.id), missed: this.pending.get(t.id) === true,
    }));
    return { kind, title: this.title(kind), memo: this.notes.memo, todos };
  }

  /** Over its own cat if that one is out; else over `via` (the cat asked); else over the first cat out. */
  private target(kind: CardKind, via: string | null): string | null {
    const out = this.host.onScreen();
    const owner = this.host.ownerOf(kind);
    if (owner && out.includes(owner)) return owner;
    if (via && out.includes(via)) return via;
    return out[0] ?? null;
  }

  /** Show the card; false: there is no such card, or no cat to show it over. */
  show(kind: CardKind, via: string | null, mode: Mode): boolean {
    if (!this.has(kind)) return false;
    const o = this.open.get(kind);
    if (o) {
      if (RANK[mode] > RANK[o.mode]) o.mode = mode;
      const head = this.heads.get(o.petId);
      if (mode === 'hand' && head) o.card.showAt(head, true);
      this.arm(kind);
      this.push(kind);
      return true;
    }
    const petId = this.target(kind, via);
    if (!petId) return false;
    const waiting = this.waiting.get(kind);
    if (waiting && RANK[waiting.mode] > RANK[mode]) mode = waiting.mode;
    const head = this.heads.get(petId);
    if (!head?.settled) { this.waiting.set(kind, { petId, mode }); return true; }
    this.waiting.delete(kind);
    const card = new CardWindow(kind, this.state(kind), () => this.host.workArea(), {
      act: a => this.act(a),
      hot: on => this.setHot(kind, on),
      close: () => this.close(kind),
    }, this.preloadDir);
    this.open.set(kind, { card, petId, mode, hot: false, timer: undefined });
    card.showAt(head, mode === 'hand');
    this.arm(kind);
    this.host.log.info(`卡片：${kind} 打開（${mode}，${petId}）`);
    return true;
  }

  close(kind: CardKind): void {
    this.waiting.delete(kind);
    const o = this.open.get(kind);
    if (!o) return;
    clearTimeout(o.timer);
    o.card.close();
    this.open.delete(kind);
    if (kind === 'todo') this.endAttend();
  }

  /** A cat says where its head is: cards over it follow it; cards waiting for it to stand still show. */
  head(petId: string, head: { x: number; y: number }, settled: boolean): void {
    this.heads.set(petId, { ...head, settled });
    for (const o of this.open.values()) if (o.petId === petId) o.card.follow(head);
    if (!settled) return;
    for (const [kind, w] of [...this.waiting]) if (w.petId === petId) this.show(kind, petId, w.mode);
  }

  /** The cat walks off or is gone: its cards go too (a due reminder stays due, and shows the next time the card opens). */
  petGone(petId: string): void {
    this.heads.delete(petId);
    for (const [kind, o] of [...this.open]) if (o.petId === petId) this.close(kind);
    for (const [kind, w] of [...this.waiting]) if (w.petId === petId) this.waiting.delete(kind);
    if (this.attending === petId) this.attending = null;
  }

  /** The wheel over a cat: up brings its own card, down puts away the cards over it. */
  wheel(petId: string, up: boolean): void {
    if (!up) {
      for (const [kind, o] of [...this.open]) if (o.petId === petId) this.close(kind);
      return;
    }
    const kind = this.host.packOf(petId)?.card;
    if (kind) this.show(kind, petId, 'hand');
  }

  /** The app started, the computer woke, the screen was unlocked: pop the cards ticked for it (after the cats sit up, if the user was away). */
  popFor(trigger: 'start' | 'resume' | 'unlock'): void {
    for (const kind of CARD_KINDS) {
      if (!this.has(kind) || !this.host.settings()[kind][trigger]) continue;
      if (this.host.away()) this.deferred.add(kind); else this.pop(kind, trigger);
    }
  }

  /** The user is back at the computer: once the cat has sat up, pop the cards ticked for it, and those that waited for them. */
  back(): void {
    const kinds = CARD_KINDS.filter(k => this.has(k) && (this.host.settings()[k].back || this.deferred.has(k)));
    this.deferred.clear();
    if (!kinds.length) return;
    if (this.wokeWait) clearTimeout(this.wokeWait.timer);
    this.wokeWait = { kinds, timer: setTimeout(() => this.popWoken(null), WOKE_WAIT_MS) };
  }

  /** A cat has sat up after the user came back. */
  woke(petId: string): void { this.popWoken(petId); }

  /** Every 15 s: a new day's tidying, the daily pops, the reminders that are due, and the cards' marks. */
  tick(now: number): void {
    const from = this.lastTick;
    const to = new Date(now);
    this.lastTick = to;
    const kept = dropOldDone(this.notes.todos, now);
    if (kept.length !== this.notes.todos.length) { this.notes.todos = kept; this.save(); }
    for (const kind of CARD_KINDS) {
      const daily = this.host.settings()[kind].daily;
      if (daily === null || !this.has(kind) || !crossedMinute(daily, from, to)) continue;
      if (this.host.away()) this.deferred.add(kind); else this.pop(kind, 'daily');
    }
    if (this.has('todo')) {
      const due = dueTodos(this.notes.todos, now, new Set(this.pending.keys()));
      if (due.length) this.deliver(due);
    }
    for (const kind of this.open.keys()) this.push(kind);
  }

  flush(): void { this.store.flush(this.notes); }

  private pop(kind: CardKind, why: string): void {
    const now = Date.now();
    if (now - (this.lastPop.get(kind) ?? -Infinity) < COALESCE_MS) return;
    if (!this.show(kind, null, 'auto')) return;
    this.lastPop.set(kind, now);
    this.host.log.info(`卡片：${kind} 自動跳出（${why}）`);
  }

  private popWoken(petId: string | null): void {
    const w = this.wokeWait;
    if (!w) return;
    const now = w.kinds.filter(k => petId === null || this.target(k, null) === petId);
    w.kinds = w.kinds.filter(k => !now.includes(k));
    for (const k of now) this.pop(k, 'back');
    if (!w.kinds.length) { clearTimeout(w.timer); this.wokeWait = null; }
  }

  /** Reminders came up: once only, ticked or not (the card marks them until they are), with a notification and the cat sitting up. */
  private deliver(due: DueTodo[]): void {
    const now = Date.now();
    for (const d of due) this.pending.set(d.id, d.missed);
    this.notes.todos = this.notes.todos.map(t => (this.pending.has(t.id) ? markFired(t, now) : t));
    this.save();
    const lines = due.map(d => {
      const t = this.notes.todos.find(x => x.id === d.id)!;
      return `${d.missed ? '（錯過）' : ''}${timeText(t)} ${t.text}`;
    });
    this.host.log.info(`提醒事項到了：${due.length} 則`);
    this.host.notify(lines.join('\n'), () => this.show('todo', null, 'hand'));
    if (!this.show('todo', null, 'due')) return;
    const petId = this.open.get('todo')?.petId ?? this.waiting.get('todo')?.petId ?? null;
    if (petId && petId !== this.attending && !this.host.away()) {
      this.endAttend();
      this.attending = petId;
      this.host.attend(petId, true);
    }
    this.push('todo');
  }

  private act(a: CardAction): void {
    const now = Date.now();
    const update = (id: string, f: (t: Todo) => Todo) => { this.notes.todos = this.notes.todos.map(t => (t.id === id ? f(t) : t)); };
    switch (a.kind) {
      case 'memo':
        this.notes.memo = String(a.text);
        this.save();
        return;   // the card shows it already
      case 'add': {
        const text = String(a.text).trim();
        if (!text || !Number.isInteger(a.hour) || a.hour < 0 || a.hour > 23 || !MINUTES.includes(a.minute) || !REPEATS.includes(a.repeat)) return;
        this.notes.todos.push(newTodo(`${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, text, a.hour, a.minute, a.repeat, now));
        break;
      }
      case 'toggle':
        update(a.id, t => (a.done ? markDone(t, now) : markUndone(t)));
        if (a.done) this.answered(a.id);
        break;
      case 'edit': {
        const text = String(a.text).trim();
        if (text) update(a.id, t => ({ ...t, text }));
        break;
      }
      case 'delete':
        this.notes.todos = this.notes.todos.filter(t => t.id !== a.id);
        this.answered(a.id);
        break;
    }
    this.save();
    this.push('todo');
  }

  /** A reminder that was due is ticked (or gone): once none is left, the cat goes back to its ways and the card goes soon. */
  private answered(id: string): void {
    if (!this.pending.delete(id) || this.pending.size) return;
    this.endAttend();
    this.arm('todo');
  }

  private endAttend(): void {
    if (!this.attending) return;
    this.host.attend(this.attending, false);
    this.attending = null;
  }

  private setHot(kind: CardKind, on: boolean): void {
    const o = this.open.get(kind);
    if (!o) return;
    o.hot = on;
    this.arm(kind);
  }

  /** A card that popped up by itself goes after a while untouched; a due one once every reminder is ticked; one opened by hand stays. */
  private arm(kind: CardKind): void {
    const o = this.open.get(kind);
    if (!o) return;
    clearTimeout(o.timer);
    o.timer = undefined;
    if (o.hot) return;
    if (o.mode === 'auto') o.timer = setTimeout(() => this.close(kind), AUTO_CLOSE_MS);
    if (o.mode === 'due' && !this.pending.size) o.timer = setTimeout(() => this.close(kind), ANSWERED_CLOSE_MS);
  }

  private push(kind: CardKind): void { this.open.get(kind)?.card.push(this.state(kind)); }

  private save(): void { this.store.saveSoon(this.notes); }
}

import { normalizeDinner, type Dinner } from './dinner';
import { MINUTES, type Repeat, type Todo } from './todo';

/** notes.json: 阿胖's memo, 小昭's reminders and her dinner wheel. */
export interface Notes { version: 1; memo: string; todos: Todo[]; dinner: Dinner }

const REPEATS: Repeat[] = ['once', 'daily', 'weekdays'];
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Whatever notes.json held, as notes: reminders that do not make sense are dropped. */
export function normalizeNotes(raw: unknown): Notes {
  const r = isObj(raw) ? raw : {};
  const todos = Array.isArray(r.todos) ? r.todos.flatMap(t => { const n = normalizeTodo(t); return n ? [n] : []; }) : [];
  return { version: 1, memo: typeof r.memo === 'string' ? r.memo : '', todos, dinner: normalizeDinner(r.dinner) };
}

function normalizeTodo(raw: unknown): Todo | null {
  if (!isObj(raw)) return null;
  const { id, text, hour, minute, repeat } = raw;
  if (typeof id !== 'string' || !id || typeof text !== 'string') return null;
  if (!Number.isInteger(hour) || (hour as number) < 0 || (hour as number) > 23 || !MINUTES.includes(minute as number)) return null;
  if (!REPEATS.includes(repeat as Repeat)) return null;
  const at = finite(raw.at) ? raw.at : null;
  if (repeat === 'once' && at === null) return null;
  return {
    id, text, hour: hour as number, minute: minute as number, repeat: repeat as Repeat, at: repeat === 'once' ? at : null,
    doneDay: typeof raw.doneDay === 'string' ? raw.doneDay : null,
    firedAt: finite(raw.firedAt) ? raw.firedAt : null,
  };
}

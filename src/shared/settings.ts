export interface PetSettings { visible: boolean; scale: number; auto: boolean; x: number | null }
export interface ReminderSettings { water: number; stretch: number; eyes: number; notify: boolean; pausedUntil: number | null }
export interface Settings {
  version: 1;
  firstRunDone: boolean;
  autoStart: boolean;
  pets: Record<string, PetSettings>;
  petOrder: string[];
  reminders: ReminderSettings;
}

export const REMINDER_CHOICES = [0, 30, 45, 60, 90];
export const SIZE_PRESETS = { s: 0.75, m: 1, l: 1.3 } as const;
export const DEFAULT_X = 0.62;
export const MIN_SCALE = 0.6;
export const MAX_SCALE = 1.5;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function defaultSettings(): Settings {
  return {
    version: 1, firstRunDone: false, autoStart: true, pets: {}, petOrder: [],
    reminders: { water: 45, stretch: 60, eyes: 0, notify: true, pausedUntil: null },
  };
}

export function normalizeSettings(raw: unknown, packIds: string[]): { settings: Settings; warnings: string[] } {
  const warnings: string[] = [];
  if (raw !== undefined && !isObj(raw)) warnings.push('設定檔格式不對，已改用預設值');
  const r = isObj(raw) ? raw : {};
  const d = defaultSettings();
  const rawPets = isObj(r.pets) ? r.pets : {};
  const fresh = Object.keys(rawPets).length === 0;
  const order = Array.isArray(r.petOrder) ? r.petOrder.filter((x): x is string => typeof x === 'string' && packIds.includes(x)) : [];
  for (const id of packIds) if (!order.includes(id)) order.push(id);

  const settings: Settings = {
    version: 1,
    firstRunDone: typeof r.firstRunDone === 'boolean' ? r.firstRunDone : d.firstRunDone,
    autoStart: typeof r.autoStart === 'boolean' ? r.autoStart : d.autoStart,
    pets: {},
    petOrder: order,
    reminders: normalizeReminders(r.reminders, d.reminders),
  };
  order.forEach((id, i) => { settings.pets[id] = normalizePet(rawPets[id], fresh && i === 0); });
  return { settings, warnings };
}

function normalizePet(raw: unknown, visibleByDefault: boolean): PetSettings {
  const r = isObj(raw) ? raw : {};
  return {
    visible: typeof r.visible === 'boolean' ? r.visible : visibleByDefault,
    scale: finite(r.scale) ? clamp(r.scale, MIN_SCALE, MAX_SCALE) : 1,
    auto: typeof r.auto === 'boolean' ? r.auto : true,
    x: finite(r.x) ? clamp(r.x, 0, 1) : null,
  };
}

function normalizeReminders(raw: unknown, d: ReminderSettings): ReminderSettings {
  const r = isObj(raw) ? raw : {};
  const pick = (v: unknown, dflt: number) => (finite(v) && REMINDER_CHOICES.includes(v) ? v : dflt);
  return {
    water: pick(r.water, d.water),
    stretch: pick(r.stretch, d.stretch),
    eyes: pick(r.eyes, d.eyes),
    notify: typeof r.notify === 'boolean' ? r.notify : d.notify,
    pausedUntil: finite(r.pausedUntil) ? r.pausedUntil : null,
  };
}

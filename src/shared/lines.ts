import type { Rng } from './behavior';
import type { Pack, PoseId, ReminderType } from './types';

export function pickLine(lines: string[], rng: Rng): string {
  return lines[Math.min(lines.length - 1, Math.floor(rng() * lines.length))];
}

export function clickLine(pack: Pack, pose: PoseId, rng: Rng): string {
  return pickLine(pack.lines.click[pose] ?? pack.lines.click.default, rng);
}

export function commandLine(pack: Pack, pose: PoseId): string | null {
  return pack.lines.command[pose] ?? null;
}

export function reminderLine(pack: Pack, type: ReminderType, pose: PoseId): string {
  const r = pack.lines.reminders[type];
  return r[pose] ?? r.default;
}

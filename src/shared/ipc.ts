import type { Pack, PoseId, PounceSide, ReminderType } from './types';

/**
 * A play-fight, pet to main: `ready` resting in its fight pose (holding there), `no` it can not now (asleep, walking, ...), `done`
 * its fight clip is over.
 */
export type FightState = 'ready' | 'no' | 'done';
/** Main to pet: get ready to fight facing `side`; `manual`: asked for on the panel (fights even with auto mode off). */
export interface FightCall { side: PounceSide; manual: boolean }

/** `frameX`: where the cat's frame starts inside the strip window, in px. `interval`: seconds it rests in a pose (auto mode). */
export interface PetInit {
  pack: Pack; packUrl: string; frameX: number; auto: boolean; actions: PoseId[] | null; interval: number; restY: number; debug: boolean;
  enter: boolean;   // walk in from the left edge (when the pack can walk)
}
export type ReminderResult = 'done' | 'snooze';
export type LogLevel = 'info' | 'warn' | 'error';

export interface PetApi {
  onInit(cb: (init: PetInit) => void): void;
  onCommand(cb: (pose: PoseId) => void): void;
  onSetAuto(cb: (auto: boolean) => void): void;
  onSetActions(cb: (actions: PoseId[] | null) => void): void;
  onSetInterval(cb: (seconds: number) => void): void;
  onReminder(cb: (type: ReminderType) => void): void;
  /** The other cat's reminder bubble was answered: close this one. */
  onReminderClose(cb: (type: ReminderType) => void): void;
  onPause(cb: (paused: boolean) => void): void;
  onRestY(cb: (y: number) => void): void;
  onFrameX(cb: (x: number) => void): void;
  onExit(cb: () => void): void;
  onFightReady(cb: (call: FightCall) => void): void;
  onFightGo(cb: () => void): void;
  onFightCancel(cb: () => void): void;
  ready(): void;
  setInteractive(interactive: boolean): void;
  /** Lift or lower the strip window (a drag moves the cat sideways inside it). */
  moveWindow(y: number): void;
  dragEnded(frameX: number): void;
  exited(): void;
  openMenu(): void;
  reportStatus(poseLabel: string): void;
  reminderResult(type: ReminderType, result: ReminderResult): void;
  log(level: LogLevel, message: string): void;
  fightState(state: FightState): void;
}

export interface PanelPet {
  id: string; name: string; personality: string; portraitUrl: string | null; errors: string[];
  visible: boolean; scale: number; auto: boolean; actions: PoseId[] | null; status: string; commands: { label: string; pose: PoseId }[];
}
export interface PanelState {
  pets: PanelPet[];
  reminders: { water: number; stretch: number; eyes: number; notify: boolean; pausedUntil: number | null };
  autoStart: boolean;
  actionInterval: number;
  /** Two cats close together play-fight now and then; `canFight`: at least two packs can. `notice`: why a fight did not start. */
  fightAuto: boolean;
  canFight: boolean;
  notice: string | null;
  version: string;
  warning: string | null;
}
export type PanelAction =
  | { kind: 'pet'; id: string; visible?: boolean; scale?: number; auto?: boolean; actions?: PoseId[] }
  | { kind: 'command'; id: string; pose: PoseId }
  | { kind: 'reminders'; water?: number; stretch?: number; eyes?: number; notify?: boolean }
  | { kind: 'testReminder' }
  | { kind: 'autoStart'; on: boolean }
  | { kind: 'actionInterval'; seconds: number }
  | { kind: 'fightAuto'; on: boolean }
  | { kind: 'fight' }
  | { kind: 'resetPositions' }
  | { kind: 'testBreak' };
/** The full-screen break: `cats` (each in its own share of the screen), `seconds` of rest, `line` shown under the countdown. */
export interface BreakInit { cats: { pack: Pack; packUrl: string }[]; seconds: number; line: string; debug: boolean }
export interface BreakApi {
  onInit(cb: (init: BreakInit) => void): void;
  ready(): void;
  /** The big cat has walked off: close the break. */
  done(): void;
  log(level: LogLevel, message: string): void;
}

export interface PanelApi {
  getState(): Promise<PanelState>;
  act(action: PanelAction): Promise<PanelState>;
  onState(cb: (s: PanelState) => void): void;
}

import type { Pack, PoseId, ReminderType } from './types';

/** `frameX`: where the cat's frame starts inside the strip window, in px. */
export interface PetInit {
  pack: Pack; packUrl: string; frameX: number; auto: boolean; actions: PoseId[] | null; restY: number; debug: boolean;
  enter: boolean;   // walk in from the left edge (when the pack can walk)
}
export type ReminderResult = 'done' | 'snooze';
export type LogLevel = 'info' | 'warn' | 'error';

export interface PetApi {
  onInit(cb: (init: PetInit) => void): void;
  onCommand(cb: (pose: PoseId) => void): void;
  onSetAuto(cb: (auto: boolean) => void): void;
  onSetActions(cb: (actions: PoseId[] | null) => void): void;
  onReminder(cb: (type: ReminderType) => void): void;
  onPause(cb: (paused: boolean) => void): void;
  onRestY(cb: (y: number) => void): void;
  onFrameX(cb: (x: number) => void): void;
  onExit(cb: () => void): void;
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
}

export interface PanelPet {
  id: string; name: string; personality: string; portraitUrl: string | null; errors: string[];
  visible: boolean; scale: number; auto: boolean; actions: PoseId[] | null; status: string; commands: { label: string; pose: PoseId }[];
}
export interface PanelState {
  pets: PanelPet[];
  reminders: { water: number; stretch: number; eyes: number; notify: boolean; pausedUntil: number | null };
  autoStart: boolean;
  version: string;
  warning: string | null;
}
export type PanelAction =
  | { kind: 'pet'; id: string; visible?: boolean; scale?: number; auto?: boolean; actions?: PoseId[] }
  | { kind: 'command'; id: string; pose: PoseId }
  | { kind: 'reminders'; water?: number; stretch?: number; eyes?: number; notify?: boolean }
  | { kind: 'testReminder' }
  | { kind: 'autoStart'; on: boolean }
  | { kind: 'resetPositions' };
export interface PanelApi {
  getState(): Promise<PanelState>;
  act(action: PanelAction): Promise<PanelState>;
  onState(cb: (s: PanelState) => void): void;
}

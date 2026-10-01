import type { CardSettings } from './settings';
import type { DayPart } from './time-events';
import type { Repeat } from './todo';
import type { CardKind, Pack, PoseId, PounceSide, ReminderType, TimeEvent } from './types';

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
  away: boolean;    // the user is away from the computer: the cat sleeps
  dayPart: DayPart;
  hello: TimeEvent | null;   // greet with this (good morning) rather than an ordinary greeting
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
  /** The user has left the computer (true), or is back (false). */
  onAway(cb: (away: boolean) => void): void;
  /** Say a line: one for the time of day, or `back` (the user is back at the computer). */
  onSay(cb: (what: TimeEvent | 'back') => void): void;
  onDayPart(cb: (part: DayPart) => void): void;
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
  /** It has sat up (or was up) after the user came back. */
  woke(): void;
  /** A reminder is due (true): sit up and look at the user until it is answered (false). */
  onAttend(cb: (on: boolean) => void): void;
  /**
   * Where a card over the head goes (screen px: the head's middle, and the ear tips or a little above them), and whether the cat
   * stands still there (not walking in, not dragged).
   */
  reportHead(x: number, y: number, settled: boolean): void;
  /** Where the cards stand now (screen px): speech bubbles go beside them, not under them. */
  onCardsAt(cb: (cards: { x: number; y: number; width: number; height: number }[]) => void): void;
  /** The wheel turned over the cat: up brings its card, down puts it away. */
  wheel(up: boolean): void;
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
  awayMinutes: number;
  /** The cards there are: when each pops up by itself. */
  cards: { kind: CardKind; title: string; settings: CardSettings }[];
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
  | { kind: 'awayMinutes'; minutes: number }
  | { kind: 'cards'; card: CardKind; patch: Partial<CardSettings> }
  | { kind: 'openCard'; card: CardKind }
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

/** A reminder as the card shows it. */
export interface TodoView { id: string; text: string; time: string; repeat: Repeat; done: boolean; due: boolean; missed: boolean }
/** What a card shows: the memo's text, or the reminders in the order of the day. */
export interface CardState { kind: CardKind; title: string; memo: string; todos: TodoView[] }
export type CardAction =
  | { kind: 'memo'; text: string }
  | { kind: 'add'; text: string; hour: number; minute: number; repeat: Repeat }
  | { kind: 'toggle'; id: string; done: boolean }
  | { kind: 'edit'; id: string; text: string }
  | { kind: 'delete'; id: string };
export interface CardApi {
  onState(cb: (s: CardState) => void): void;
  /** Opened by hand: put the cursor in the memo, or in the new reminder's box. */
  onFocus(cb: () => void): void;
  ready(): void;
  act(action: CardAction): void;
  /** The card is this tall (px), ears included: the window fits it. */
  resize(height: number): void;
  /** The pointer is over the card or it has the focus: it does not close by itself meanwhile. */
  hot(on: boolean): void;
  close(): void;
}

/** The cat wand's window. */
export interface ToyApi {
  ready(): void;
  setInteractive(on: boolean): void;
  /** Move the wand's window so its top-left corner is here (screen px): it is being dragged. */
  moveTo(x: number, y: number): void;
  /** Where the feather is on screen (px), and how fast it goes (px/s). */
  feather(x: number, y: number, speed: number): void;
}

export interface PanelApi {
  getState(): Promise<PanelState>;
  act(action: PanelAction): Promise<PanelState>;
  onState(cb: (s: PanelState) => void): void;
}

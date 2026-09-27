export type PoseId = string;
export type ClipId = string;

export interface PoseDef {
  label: string;
  idle?: ClipId[];
  transient?: boolean;
  ground: number;
  centerX: number;
  head: number;
  shadow?: boolean;
  draggable?: boolean;
  asleep?: boolean;
  stay?: number;
  autoWeight?: number;
}

export interface ClipDef { file: string; rate?: number }
export interface EdgeDef { from: PoseId; to: PoseId; clip?: ClipId; fade?: number }

export type LineSet = string[];
export interface PoseLines { default: LineSet; [pose: string]: LineSet }
export interface ReminderLines { default: string; [pose: string]: string }
export type ReminderType = 'water' | 'stretch' | 'eyes';

export interface PackLines {
  greet: LineSet;
  click: PoseLines;
  drag: LineSet;
  noDrag: LineSet;
  command: Record<PoseId, string>;
  reminders: Record<ReminderType, ReminderLines>;
}

export interface Command { label: string; pose: PoseId }

export interface Pack {
  schemaVersion: 1;
  id: string;
  name: string;
  personality: string;
  portrait: string;
  frame: { aspect: number; displayHeight: number };
  start: PoseId;
  poses: Record<PoseId, PoseDef>;
  clips: Record<ClipId, ClipDef>;
  edges: EdgeDef[];
  lines: PackLines;
  clickHeart: boolean;
  commands: Command[];
}

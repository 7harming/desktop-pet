export type PoseId = string;
export type ClipId = string;

export interface PoseDef {
  label: string;
  idle?: ClipId[];
  transient?: boolean;
  ground: number;
  centerX: number;
  head: number;
  /** Left and right edge of everything drawn in this pose (cat and prop), as a share of the frame width. */
  left?: number;
  right?: number;
  shadow?: boolean;
  draggable?: boolean;
  asleep?: boolean;
  stay?: number;
  autoWeight?: number;
}

export interface ClipDef { file: string; rate?: number }
export interface EdgeDef { from: PoseId; to: PoseId; clip?: ClipId; fade?: number }

/** Walking, for entrances, exits and breaks. It sits beside the pose graph: `arrive` ends in the start pose and `depart` starts there.
 * The loop walks right on the spot; walking left plays it mirrored around `centerX`. `speed` is how fast the planted paws move,
 * in frame widths per second at playback rate 1, so the window moves at speed x rate x its width. */
export interface WalkDef {
  loop: ClipId; arrive: ClipId; depart: ClipId;
  centerX: number; head: number; left: number; right: number;
  speed: number; rate?: number;
}

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
  walk?: WalkDef;
}

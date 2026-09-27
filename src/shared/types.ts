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

/**
 * Walking, for entrances, exits and breaks. It sits beside the pose graph. The camera never moves: in `loop` the cat really walks
 * right across the frame, its centre going from `from` to `to` (first and last frame are the same pose), so chaining loops shifted
 * by `to - from` frame widths walks it across the screen with its paws planted. `arrive` starts as the loop's first frame and ends in
 * the start pose; `depart` starts in the start pose and ends as the loop's first frame mirrored, centred at `departX`; walking left
 * plays the loop mirrored. All positions are shares of the frame width; `width` is the walking cat's width, `left`/`right` bound
 * everything arrive and depart draw.
 */
export interface WalkDef {
  loop: ClipId; from: number; to: number;
  arrive: ClipId; depart: ClipId; departX: number;
  width: number; head: number; left: number; right: number;
  rate?: number;
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

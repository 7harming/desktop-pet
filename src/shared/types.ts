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
  /** A pose it only drops in on (a stretch): afterwards it goes back to the pose it came from, even when told to go there. */
  brief?: boolean;
  stay?: number;
  autoWeight?: number;
}

export interface ClipDef { file: string; rate?: number }
export interface EdgeDef { from: PoseId; to: PoseId; clip?: ClipId; fade?: number }

/**
 * Walking, for entrances, exits and breaks. It sits beside the pose graph. `loop` is one clean stride cycle of the cat walking right
 * on the spot (a tracking shot), centred at `centerX`; its frame is moved along at `speed` - how fast the planted paws slide back, in
 * frame widths per second at playback rate 1 - so the paws stay planted on the screen. `arrive` starts as the loop's first frame and
 * ends in the start pose; `depart` starts in the start pose and ends as the loop's first frame mirrored, centred at `departX`; walking
 * left plays the loop mirrored. Positions are shares of the frame width; `width` is the walking cat's width, `left`/`right` bound
 * everything arrive and depart draw. Arrive and depart may walk nearly on the spot too: `arriveGlide` / `departGlide` give, for each
 * of their frames (24 fps), how far their frame has moved by then (shares of the frame width, + = right) so the paws stay planted.
 */
export interface WalkDef {
  loop: ClipId; centerX: number; speed: number;
  arrive: ClipId; depart: ClipId; departX: number;
  width: number; head: number; left: number; right: number;
  rate?: number;
  arriveGlide?: number[];
  departGlide?: number[];
  /**
   * A cat whose two sides differ can not walk left as the right walk mirrored: its own left-walking loop, drawn as it is. Its cat
   * is centred at `centerX`, `width` wide; `speed` as above. `depart` then ends as this loop's first frame.
   */
  leftward?: { loop: ClipId; centerX: number; width: number; speed: number };
}

/**
 * Double-clicking the cat while it rests in `pose` makes it pounce towards the side that was clicked: `toLeft` / `toRight` are clips
 * from `pose` back to `pose`. `left` / `right` bound everything the two clips draw, as shares of the frame width.
 */
export interface PounceDef {
  pose: PoseId; toLeft: ClipId; toRight: ClipId; left: number; right: number;
  /** Auto mode: the share of idles in `pose` it swaps for a pounce (to a ticked side). */
  autoChance?: number;
}
export type PounceSide = 'left' | 'right';

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

/** A menu / panel command: go to a pose, or pounce to one side. Exactly one of the two. */
export interface Command { label: string; pose?: PoseId; pounce?: PounceSide }

export interface Pack {
  schemaVersion: 1;
  id: string;
  /** Where the cat comes among the packs (the panel, the tray, the one shown on a first start): lower first; none: last. */
  order?: number;
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
  /** Larger copies of some clips (same timing, more pixels) for the full-screen break, where the cat is drawn big. */
  hd?: Record<ClipId, string>;
  /** A pose the cat drops in on when a reminder comes (drinking from its bowl at the water reminder), then leaves again. */
  reminderPoses?: Partial<Record<ReminderType, PoseId>>;
  pounce?: PounceDef;
}

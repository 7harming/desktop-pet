import { TOY_BASE, TOY_SCALE } from '../shared/toy';

const api = window.toyApi;
const canvas = document.getElementById('wand') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
// drawn at TOY_SCALE of the design (240 x 280): every length below is a designed one times K
const K = TOY_SCALE;
const W = (canvas.width = Math.round(TOY_BASE.width * K));
const H = (canvas.height = Math.round(TOY_BASE.height * K));

type P = { x: number; y: number };
/** In the window: where the stick is held, and its tip, where the string hangs from. */
const HANDLE: P = { x: 204 * K, y: 20 * K };
const TIP: P = { x: 118 * K, y: 96 * K };
const STRING = 110 * K;
const GRAVITY = 1800 * K;    // px/s²: scaled with the string, so it swings at the same pace whatever its size
const DAMPING = 2.2;         // 1/s: a swing dies down in a few seconds
const FEATHER = 54 * K;      // each feather's length
const FEATHER_R = 24 * K;    // the feather catches the mouse within this of its middle
const STICK_REACH = Math.max(6, 9 * K);
const STRING_REACH = 5;
/** How often main hears where the feather is; hanging still, only every STILL_EVERY-th time (a cat still tires of it). */
const REPORT_MS = 66;
const STILL_EVERY = 8;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: P, b: P, t: number): P => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
function segDist(p: P, a: P, b: P): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// where the window is on screen: while dragged, where it was asked to go (the window itself follows a moment later)
let win: P = { x: window.screenX, y: window.screenY };
let drag: { dx: number; dy: number } | null = null;
// the knot at the string's end, on screen: it swings on the string from the stick's tip
let knot: P = { x: win.x + TIP.x, y: win.y + TIP.y + STRING };
let vel: P = { x: 0, y: 0 };
let speed = 0;               // the feather's speed on screen, smoothed (px/s)
let interactive = false;
let drawn = '';              // where the knot was last drawn (in the window): there still, the canvas is left as it is
let still = 0;               // reports skipped while it hangs still

const local = (p: P): P => ({ x: p.x - win.x, y: p.y - win.y });
/** The angle the feathers hang at: along the string. */
const hang = (k: P) => Math.atan2(k.y - TIP.y, k.x - TIP.x) - Math.PI / 2;
/** The middle of the feathers, in the window. */
function featherMiddle(k: P): P {
  const a = hang(k) + Math.PI / 2;
  return { x: k.x + Math.cos(a) * FEATHER / 2, y: k.y + Math.sin(a) * FEATHER / 2 };
}

function step(dt: number): void {
  if (!drag) win = { x: window.screenX, y: window.screenY };
  const anchor = { x: win.x + TIP.x, y: win.y + TIP.y };
  const before = knot;
  const k = Math.exp(-DAMPING * dt);
  vel = { x: vel.x * k, y: (vel.y + GRAVITY * dt) * k };
  knot = { x: knot.x + vel.x * dt, y: knot.y + vel.y * dt };
  // the string pulls it back when it would stretch (it can go slack)
  const dx = knot.x - anchor.x, dy = knot.y - anchor.y, len = Math.hypot(dx, dy);
  if (len > STRING) {
    const nx = dx / len, ny = dy / len;
    knot = { x: anchor.x + nx * STRING, y: anchor.y + ny * STRING };
    const out = vel.x * nx + vel.y * ny;
    if (out > 0) vel = { x: vel.x - nx * out, y: vel.y - ny * out };
  }
  // the feathers stay inside the window
  const l = local(knot);
  const lx = clamp(l.x, FEATHER_R, W - FEATHER_R), ly = clamp(l.y, 10, H - FEATHER - 4);
  if (lx !== l.x) vel.x = 0;
  if (ly !== l.y) vel.y = 0;
  knot = { x: win.x + lx, y: win.y + ly };
  speed = speed * 0.7 + (Math.hypot(knot.x - before.x, knot.y - before.y) / dt) * 0.3;
}

/** One feather hanging down from the knot, drawn at its designed size (54 long) scaled by K. */
function feather(color: string, degrees: number): void {
  ctx.save();
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.scale(K, K);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 2);
  ctx.bezierCurveTo(-11, 14, -10, 40, 0, 54);
  ctx.bezierCurveTo(10, 40, 11, 14, 0, 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 2);
  ctx.lineTo(0, 50);
  ctx.stroke();
  ctx.restore();
}

function draw(): void {
  const k = local(knot);
  const at = `${k.x.toFixed(1)},${k.y.toFixed(1)}`;
  if (at === drawn) return;
  drawn = at;
  ctx.clearRect(0, 0, W, H);
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#8f8d86';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(TIP.x, TIP.y); ctx.lineTo(k.x, k.y); ctx.stroke();
  ctx.strokeStyle = '#a0703e';
  ctx.lineWidth = 6 * K;
  ctx.beginPath(); ctx.moveTo(HANDLE.x, HANDLE.y); ctx.lineTo(TIP.x, TIP.y); ctx.stroke();
  const grip = lerp(HANDLE, TIP, 0.25);
  ctx.strokeStyle = '#6b4423';
  ctx.lineWidth = 8 * K;
  ctx.beginPath(); ctx.moveTo(HANDLE.x, HANDLE.y); ctx.lineTo(grip.x, grip.y); ctx.stroke();
  ctx.save();
  ctx.translate(k.x, k.y);
  ctx.rotate(hang(k));
  feather('#D85A30', -24);
  feather('#378ADD', 24);
  feather('#EF9F27', 0);
  ctx.fillStyle = '#444441';
  ctx.beginPath(); ctx.arc(0, 1, 3 * K, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** Is (x, y) in the window on the stick, the string or the feathers? */
function over(x: number, y: number): boolean {
  const p = { x, y };
  const k = local(knot);
  const m = featherMiddle(k);
  return segDist(p, HANDLE, TIP) <= STICK_REACH || segDist(p, TIP, k) <= STRING_REACH || Math.hypot(x - m.x, y - m.y) <= FEATHER_R;
}

function setInteractive(on: boolean): void {
  if (on === interactive) return;
  interactive = on;
  document.body.classList.toggle('grab', on);
  api.setInteractive(on);
}

// the rest of the window lets the mouse through to what is behind it: only the wand itself catches it
window.addEventListener('mousemove', e => { if (!drag) setInteractive(over(e.clientX, e.clientY)); });
canvas.addEventListener('pointerdown', e => {
  if (e.button !== 0 || !over(e.offsetX, e.offsetY)) return;
  drag = { dx: e.clientX, dy: e.clientY };
  canvas.setPointerCapture(e.pointerId);
  document.body.classList.add('dragging');
});
canvas.addEventListener('pointermove', e => {
  if (!drag) return;
  win = { x: e.screenX - drag.dx, y: e.screenY - drag.dy };
  api.moveTo(win.x, win.y);
});
const endDrag = (e: PointerEvent) => {
  if (!drag) return;
  drag = null;
  if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  document.body.classList.remove('dragging');
  setInteractive(over(e.clientX, e.clientY));
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

let last = performance.now();
const tick = (now: number) => {
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;
  step(dt);
  draw();
  requestAnimationFrame(tick);
};
requestAnimationFrame(tick);
setInterval(() => {
  if (!drag && speed < 1 && ++still < STILL_EVERY) return;
  still = 0;
  const m = featherMiddle(local(knot));
  api.feather(win.x + m.x, win.y + m.y, Math.round(speed));
}, REPORT_MS);
api.ready();

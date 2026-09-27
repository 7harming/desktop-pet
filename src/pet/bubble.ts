export class Bubbles {
  private el: HTMLDivElement | null = null;
  private timer = 0;

  constructor(private readonly stage: HTMLElement, private readonly anchor: () => { x: number; y: number }) {}

  say(text: string, ms = 2200): void {
    if (this.el?.classList.contains('reminder')) return;   // a reminder waits for its answer; a passing line must not replace it
    this.clear();
    this.show(this.make('bubble', text), ms, () => {});
  }

  /** A reminder bubble with buttons; it stays clickable while the rest of the window lets clicks through. */
  ask(text: string, actions: { label: string; onClick: () => void }[], ms: number, onTimeout: () => void): void {
    this.clear();
    const el = this.make('bubble reminder', text);
    const row = document.createElement('div');
    row.className = 'actions';
    for (const a of actions) {
      const b = document.createElement('button');
      b.textContent = a.label;
      b.addEventListener('click', () => { this.clear(); a.onClick(); });
      row.appendChild(b);
    }
    el.appendChild(row);
    this.show(el, ms, onTimeout);
  }

  heart(): void {
    const { x, y } = this.anchor();
    const el = document.createElement('div');
    el.className = 'heart';
    el.textContent = '♡';
    el.style.left = `${x}px`;
    el.style.top = `${y + 30}px`;
    this.stage.appendChild(el);
    el.animate([{ opacity: 0 }, { opacity: 0.9, offset: 0.2 }, { transform: 'translate(-50%, -70px)', opacity: 0 }], { duration: 1600, easing: 'ease-out' })
      .onfinish = () => el.remove();
  }

  place(): void {
    if (!this.el) return;
    const { x, y } = this.anchor();
    const w = this.stage.clientWidth;
    const left = `${Math.round(Math.min(Math.max(x, 80), w - 80))}px`;
    if (this.el.style.left !== left) this.el.style.left = left;
    // the bubble hangs above its anchor: keep its whole height (taller with reminder buttons) inside the window
    const top = `${Math.round(Math.max(y, this.el.offsetHeight + 4))}px`;
    if (this.el.style.top !== top) this.el.style.top = top;
  }

  clear(): void {
    window.clearTimeout(this.timer);
    this.el?.remove();
    this.el = null;
  }

  private make(cls: string, text: string): HTMLDivElement {
    const el = document.createElement('div');
    el.className = cls;
    el.append(document.createTextNode(text));
    return el;
  }

  private show(el: HTMLDivElement, ms: number, onTimeout: () => void): void {
    this.stage.appendChild(el);
    this.el = el;
    this.place();
    this.timer = window.setTimeout(() => { if (this.el === el) { this.clear(); onTimeout(); } }, ms);
  }
}

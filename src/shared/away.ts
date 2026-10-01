/** Away from the computer: no key pressed or mouse moved for `minutes` (0: never counts as away). The caller passes the idle time in. */
export class AwayWatch {
  away = false;

  constructor(private minutes: number) {}

  setMinutes(minutes: number): void { this.minutes = minutes; }

  /** `idleSeconds`: how long the computer has had no input. Says when that has just made the user away, or back. */
  update(idleSeconds: number): 'away' | 'back' | null {
    const away = this.minutes > 0 && idleSeconds >= this.minutes * 60;
    if (away === this.away) return null;
    this.away = away;
    return away ? 'away' : 'back';
  }
}

/**
 * Circuit breaker for the match call.
 *
 * Section 1.3 of the source doc: the breaker opens at a 5% timeout rate. While
 * open, the match call is not attempted at all -- it returns empty immediately,
 * which is the same thing a miss looks like, so the user sees no difference.
 */

export interface BreakerOptions {
  window: number;
  timeoutRate: number;
  cooldownMs: number;
  now?: () => number;
}

export class CircuitBreaker {
  private readonly outcomes: boolean[] = [];
  private openedAt: number | null = null;
  private readonly now: () => number;

  constructor(private readonly options: BreakerOptions) {
    this.now = options.now ?? (() => Date.now());
  }

  get isOpen(): boolean {
    if (this.openedAt === null) return false;
    if (this.now() - this.openedAt >= this.options.cooldownMs) {
      // Cooldown elapsed: close and start a fresh window rather than
      // half-opening. One probe request per cooldown is not worth the
      // complexity at this traffic level.
      this.openedAt = null;
      this.outcomes.length = 0;
      return false;
    }
    return true;
  }

  record(timedOut: boolean): void {
    this.outcomes.push(timedOut);
    if (this.outcomes.length > this.options.window) this.outcomes.shift();
    if (this.outcomes.length < this.options.window) return;

    const rate = this.outcomes.filter(Boolean).length / this.outcomes.length;
    if (rate > this.options.timeoutRate) this.openedAt = this.now();
  }

  reset(): void {
    this.outcomes.length = 0;
    this.openedAt = null;
  }
}

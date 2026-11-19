/** Sliding-window limiter: at most `max` events in any `windowMs`. */
export class RateLimiter {
  private readonly stamps: number[] = [];

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  allow(): boolean {
    const now = this.now();
    while (this.stamps.length > 0 && now - this.stamps[0] >= this.windowMs) this.stamps.shift();
    if (this.stamps.length >= this.max) return false;
    this.stamps.push(now);
    return true;
  }
}

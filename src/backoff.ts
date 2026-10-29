/** Exponential backoff with "equal jitter": half fixed, half random. */
export class Backoff {
  private attempt = 0;

  constructor(
    private readonly minDelayMs: number,
    private readonly maxDelayMs: number,
    private readonly random: () => number = Math.random,
  ) {}

  next(): number {
    const ceiling = Math.min(this.maxDelayMs, this.minDelayMs * 2 ** this.attempt);
    this.attempt = Math.min(this.attempt + 1, 32);
    return Math.round(ceiling / 2 + (this.random() * ceiling) / 2);
  }

  reset(): void {
    this.attempt = 0;
  }
}

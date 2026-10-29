export interface HealthReport {
  ok: boolean;
  subscribed: boolean;
  lastSlot: number | null;
  lastBlockAgeMs: number | null;
}

/**
 * Liveness answers "is the process making progress?" and tolerates short
 * reconnects. Readiness answers "is data flowing right now?".
 */
export class HealthState {
  private subscribed = false;
  private lastSlot: number | null = null;
  private lastBlockAt: number | null = null;
  private readonly startedAt: number;

  constructor(
    private readonly stallTimeoutMs: number,
    private readonly now: () => number = Date.now,
  ) {
    this.startedAt = now();
  }

  markSubscribed(): void {
    this.subscribed = true;
  }

  markDisconnected(): void {
    this.subscribed = false;
  }

  markBlock(slot: number): void {
    this.lastSlot = slot;
    this.lastBlockAt = this.now();
  }

  liveness(): HealthReport {
    const progressAt = this.lastBlockAt ?? this.startedAt;
    return this.report(this.now() - progressAt <= this.stallTimeoutMs);
  }

  readiness(): HealthReport {
    const age = this.blockAge();
    return this.report(this.subscribed && age !== null && age <= this.stallTimeoutMs);
  }

  private blockAge(): number | null {
    return this.lastBlockAt === null ? null : this.now() - this.lastBlockAt;
  }

  private report(ok: boolean): HealthReport {
    return {
      ok,
      subscribed: this.subscribed,
      lastSlot: this.lastSlot,
      lastBlockAgeMs: this.blockAge(),
    };
  }
}

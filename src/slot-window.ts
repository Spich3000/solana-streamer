/**
 * Remembers the most recently seen slots so that blocks re-delivered after a
 * reconnect are emitted only once. Unlike a "highest slot wins" check, it does
 * not drop blocks that legitimately arrive out of order.
 */
export class SlotWindow {
  private readonly seen = new Set<number>();
  private readonly ring: (number | undefined)[];
  private next = 0;

  constructor(capacity = 4096) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError("capacity must be a positive integer");
    }
    this.ring = new Array<number | undefined>(capacity);
  }

  /** Returns `true` if the slot was not seen before. */
  add(slot: number): boolean {
    if (this.seen.has(slot)) return false;

    const evicted = this.ring[this.next];
    if (evicted !== undefined) this.seen.delete(evicted);

    this.ring[this.next] = slot;
    this.next = (this.next + 1) % this.ring.length;
    this.seen.add(slot);
    return true;
  }

  get size(): number {
    return this.seen.size;
  }
}

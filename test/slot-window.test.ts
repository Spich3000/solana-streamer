import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Backoff } from "../src/backoff.js";
import { SlotWindow } from "../src/slot-window.js";

describe("SlotWindow", () => {
  it("rejects slots it has already seen", () => {
    const window = new SlotWindow(8);

    assert.equal(window.add(10), true);
    assert.equal(window.add(10), false);
  });

  it("accepts blocks that arrive out of order", () => {
    const window = new SlotWindow(8);

    assert.equal(window.add(12), true);
    assert.equal(window.add(11), true);
    assert.equal(window.add(13), true);
  });

  it("forgets the oldest slot once full", () => {
    const window = new SlotWindow(3);
    [1, 2, 3, 4].forEach((slot) => window.add(slot));

    assert.equal(window.size, 3);
    assert.equal(window.add(1), true);
    assert.equal(window.add(4), false);
  });
});

describe("Backoff", () => {
  it("grows exponentially up to the cap and resets", () => {
    const backoff = new Backoff(100, 1_000, () => 1);

    assert.deepEqual(
      [1, 2, 3, 4, 5, 6].map(() => backoff.next()),
      [100, 200, 400, 800, 1_000, 1_000],
    );
    backoff.reset();
    assert.equal(backoff.next(), 100);
  });

  it("keeps at least half of the delay when jittering", () => {
    const backoff = new Backoff(100, 1_000, () => 0);

    assert.equal(backoff.next(), 50);
    assert.equal(backoff.next(), 100);
  });
});

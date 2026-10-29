import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { summarizeBlock } from "../src/block.js";
import { COMPUTE_BUDGET, JUPITER, SYSTEM_PROGRAM, TOKEN_PROGRAM, block, transaction } from "./fixtures.js";

const receivedAt = new Date("2025-12-23T20:43:03.589Z");

describe("summarizeBlock", () => {
  it("summarizes an empty block", () => {
    const summary = summarizeBlock(100, block([]), receivedAt);

    assert.deepEqual(summary, {
      slot: 100,
      blockhash: "D2oo3vc7W9vrGcK3fN258bLtzwejaUDbHPpFKsebL6sT",
      parentSlot: 99,
      blockHeight: 366_000_000,
      blockTime: 1_766_522_569,
      txCount: 0,
      failedTxCount: 0,
      totalFeeLamports: 0,
      signersCount: 0,
      programIds: [],
      receivedAt: "2025-12-23T20:43:03.589Z",
    });
  });

  it("counts only required signers, deduplicated across transactions", () => {
    const summary = summarizeBlock(
      100,
      block([
        transaction({
          accountKeys: ["alice", "bob", "carol", SYSTEM_PROGRAM],
          numRequiredSignatures: 2,
          programIdIndexes: [3],
        }),
        transaction({
          accountKeys: ["alice", "dave", SYSTEM_PROGRAM],
          numRequiredSignatures: 1,
          programIdIndexes: [2],
        }),
      ]),
      receivedAt,
    );

    assert.equal(summary.signersCount, 2);
  });

  it("sums fees and counts failed transactions", () => {
    const summary = summarizeBlock(
      100,
      block([
        transaction({
          accountKeys: ["a", SYSTEM_PROGRAM],
          numRequiredSignatures: 1,
          programIdIndexes: [1],
          fee: 5000,
        }),
        transaction({
          accountKeys: ["b", SYSTEM_PROGRAM],
          numRequiredSignatures: 1,
          programIdIndexes: [1],
          fee: 7500,
          err: { InstructionError: [0, "Custom"] },
        }),
      ]),
      receivedAt,
    );

    assert.equal(summary.totalFeeLamports, 12_500);
    assert.equal(summary.failedTxCount, 1);
    assert.equal(summary.txCount, 2);
  });

  it("resolves program ids through address lookup tables", () => {
    const summary = summarizeBlock(
      100,
      block([
        transaction({
          accountKeys: ["payer", COMPUTE_BUDGET],
          numRequiredSignatures: 1,
          // 0-1 static, 2 writable lookup, 3-4 readonly lookup
          programIdIndexes: [1, 3, 4],
          loadedAddresses: { writable: ["pool"], readonly: [JUPITER, TOKEN_PROGRAM] },
        }),
      ]),
      receivedAt,
    );

    assert.deepEqual(summary.programIds, [COMPUTE_BUDGET, JUPITER, TOKEN_PROGRAM]);
  });

  it("ignores out-of-range program indexes and missing meta", () => {
    const tx = transaction({ accountKeys: ["a"], numRequiredSignatures: 1, programIdIndexes: [7] });
    const summary = summarizeBlock(100, block([{ ...tx, meta: null }]), receivedAt);

    assert.deepEqual(summary.programIds, []);
    assert.equal(summary.totalFeeLamports, 0);
    assert.equal(summary.failedTxCount, 0);
  });
});

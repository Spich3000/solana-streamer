import type { RpcBlock, RpcTransaction } from "../src/block.js";

export const SYSTEM_PROGRAM = "11111111111111111111111111111111";
export const COMPUTE_BUDGET = "ComputeBudget111111111111111111111111111111";
export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const JUPITER = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";

export function transaction(overrides: {
  accountKeys: string[];
  numRequiredSignatures: number;
  programIdIndexes: number[];
  fee?: number;
  err?: unknown;
  loadedAddresses?: { writable: string[]; readonly: string[] };
}): RpcTransaction {
  return {
    transaction: {
      message: {
        accountKeys: overrides.accountKeys,
        header: { numRequiredSignatures: overrides.numRequiredSignatures },
        instructions: overrides.programIdIndexes.map((programIdIndex) => ({ programIdIndex })),
      },
    },
    meta: {
      err: overrides.err ?? null,
      fee: overrides.fee ?? 5000,
      ...(overrides.loadedAddresses ? { loadedAddresses: overrides.loadedAddresses } : {}),
    },
  };
}

export function block(transactions: RpcTransaction[], overrides: Partial<RpcBlock> = {}): RpcBlock {
  return {
    blockhash: "D2oo3vc7W9vrGcK3fN258bLtzwejaUDbHPpFKsebL6sT",
    previousBlockhash: "9nCehDf3nmFbEwRjo2JPqpCHa6omnTbgZ7e5n4KgT87z",
    parentSlot: 99,
    blockTime: 1_766_522_569,
    blockHeight: 366_000_000,
    transactions,
    ...overrides,
  };
}

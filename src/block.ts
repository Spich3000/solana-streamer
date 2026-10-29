/**
 * Subset of the `json`-encoded block returned by `blockSubscribe` with
 * `transactionDetails: "full"`. Only the fields the summary relies on are typed.
 */
export interface RpcBlock {
  blockhash: string;
  previousBlockhash: string;
  parentSlot: number;
  blockTime: number | null;
  blockHeight: number | null;
  transactions: RpcTransaction[];
}

export interface RpcTransaction {
  transaction: {
    message: {
      accountKeys: string[];
      header: { numRequiredSignatures: number };
      instructions: { programIdIndex: number }[];
    };
  };
  meta: {
    err: unknown;
    fee: number;
    loadedAddresses?: { writable: string[]; readonly: string[] };
  } | null;
}

export interface BlockSummary {
  slot: number;
  blockhash: string;
  parentSlot: number;
  blockHeight: number | null;
  blockTime: number | null;
  txCount: number;
  failedTxCount: number;
  totalFeeLamports: number;
  signersCount: number;
  programIds: string[];
  receivedAt: string;
}

export function summarizeBlock(slot: number, block: RpcBlock, receivedAt: Date): BlockSummary {
  const programIds = new Set<string>();
  const signers = new Set<string>();
  let totalFee = 0;
  let failed = 0;

  for (const { transaction, meta } of block.transactions) {
    const { accountKeys, header, instructions } = transaction.message;

    totalFee += meta?.fee ?? 0;
    if (meta?.err != null) failed++;

    // Signers always occupy the leading slots of the static account list.
    for (let i = 0; i < header.numRequiredSignatures && i < accountKeys.length; i++) {
      signers.add(accountKeys[i] as string);
    }

    // Instruction indices address static keys first, then lookup-table keys
    // (writable before readonly) for versioned transactions.
    const loaded = meta?.loadedAddresses;
    const keys = loaded ? [...accountKeys, ...loaded.writable, ...loaded.readonly] : accountKeys;
    for (const { programIdIndex } of instructions) {
      const programId = keys[programIdIndex];
      if (programId !== undefined) programIds.add(programId);
    }
  }

  return {
    slot,
    blockhash: block.blockhash,
    parentSlot: block.parentSlot,
    blockHeight: block.blockHeight,
    blockTime: block.blockTime,
    txCount: block.transactions.length,
    failedTxCount: failed,
    totalFeeLamports: totalFee,
    signersCount: signers.size,
    programIds: [...programIds],
    receivedAt: receivedAt.toISOString(),
  };
}

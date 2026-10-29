import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from "prom-client";

export type Metrics = ReturnType<typeof createMetrics>;

export function createMetrics(labels: Record<string, string> = {}) {
  const registry = new Registry();
  registry.setDefaultLabels(labels);
  collectDefaultMetrics({ register: registry });

  const registers = [registry];

  return {
    registry,
    connected: new Gauge({
      name: "solana_streamer_ws_connected",
      help: "1 while the blockSubscribe subscription is active",
      registers,
    }),
    reconnects: new Counter({
      name: "solana_streamer_ws_reconnects_total",
      help: "WebSocket reconnect attempts",
      registers,
    }),
    errors: new Counter({
      name: "solana_streamer_errors_total",
      help: "Recoverable errors by kind",
      labelNames: ["kind"] as const,
      registers,
    }),
    blocks: new Counter({
      name: "solana_streamer_blocks_total",
      help: "Blocks emitted to stdout",
      registers,
    }),
    duplicateBlocks: new Counter({
      name: "solana_streamer_duplicate_blocks_total",
      help: "Blocks dropped because the slot was already emitted",
      registers,
    }),
    skippedSlots: new Counter({
      name: "solana_streamer_skipped_slots_total",
      help: "Slots the node reported without a block",
      registers,
    }),
    lastSlot: new Gauge({
      name: "solana_streamer_last_slot",
      help: "Highest slot emitted",
      registers,
    }),
    transactions: new Counter({
      name: "solana_streamer_transactions_total",
      help: "Transactions contained in emitted blocks",
      registers,
    }),
    ingestLatency: new Histogram({
      name: "solana_streamer_block_ingest_latency_seconds",
      help: "Time between block production (blockTime) and receipt",
      buckets: [0.5, 1, 2, 3, 5, 10, 20, 30, 60],
      registers,
    }),
  };
}

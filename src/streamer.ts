import type { Writable } from "node:stream";
import type { Logger } from "pino";
import { Backoff } from "./backoff.js";
import { BlockStream } from "./block-stream.js";
import { summarizeBlock } from "./block.js";
import type { Config } from "./config.js";
import type { HealthState } from "./health.js";
import type { Metrics } from "./metrics.js";
import { SlotWindow } from "./slot-window.js";

export interface StreamerDeps {
  config: Config;
  logger: Logger;
  metrics: Metrics;
  health: HealthState;
  output: Writable;
  onFatal: (error: Error) => void;
}

/** Connects a {@link BlockStream} to stdout, metrics and health state. */
export function createStreamer({
  config,
  logger,
  metrics,
  health,
  output,
  onFatal,
}: StreamerDeps): BlockStream {
  const stream = new BlockStream({
    url: config.rpcWsUrl,
    commitment: config.commitment,
    heartbeatIntervalMs: config.heartbeatIntervalMs,
    idleTimeoutMs: config.idleTimeoutMs,
    backoff: new Backoff(config.reconnectMinDelayMs, config.reconnectMaxDelayMs),
  });
  const emitted = new SlotWindow();
  let highestSlot = 0;

  stream.on("connecting", (attempt) => {
    logger.info({ url: redact(config.rpcWsUrl), attempt }, "Connecting to RPC");
  });

  stream.on("subscribed", (subscriptionId) => {
    health.markSubscribed();
    metrics.connected.set(1);
    logger.info({ subscriptionId, commitment: config.commitment }, "Subscribed to blocks");
  });

  stream.on("block", (slot, block, receivedAt) => {
    if (!emitted.add(slot)) {
      metrics.duplicateBlocks.inc();
      logger.debug({ slot }, "Dropped duplicate block");
      return;
    }

    let line: string;
    try {
      const summary = summarizeBlock(slot, block, receivedAt);
      line = JSON.stringify(summary) + "\n";
      metrics.transactions.inc(summary.txCount);
    } catch (error) {
      metrics.errors.inc({ kind: "block_decode" });
      logger.warn({ err: error, slot }, "Failed to summarize block");
      return;
    }

    output.write(line);
    health.markBlock(slot);
    metrics.blocks.inc();
    if (slot > highestSlot) {
      highestSlot = slot;
      metrics.lastSlot.set(slot);
    }
    if (block.blockTime !== null) {
      metrics.ingestLatency.observe(Math.max(0, receivedAt.getTime() / 1000 - block.blockTime));
    }
  });

  stream.on("skippedSlot", (slot, error) => {
    metrics.skippedSlots.inc();
    logger.debug({ slot, error }, "Node reported slot without a block");
  });

  stream.on("warning", (message, details) => {
    metrics.errors.inc({ kind: "ws" });
    logger.warn(details, message);
  });

  stream.on("disconnected", (code, reason, retryInMs) => {
    health.markDisconnected();
    metrics.connected.set(0);
    if (retryInMs === null) {
      logger.info({ code, reason }, "Disconnected");
    } else {
      metrics.reconnects.inc();
      logger.warn({ code, reason, retryInMs }, "Disconnected, scheduling reconnect");
    }
  });

  stream.on("fatal", onFatal);

  return stream;
}

/** Strips credentials and API-key paths/queries from an RPC URL before logging. */
export function redact(rawUrl: string): string {
  const url = new URL(rawUrl);
  const hasSecrets = url.username || url.password || url.search || url.pathname.length > 1;
  return hasSecrets ? `${url.protocol}//${url.host}/***` : `${url.protocol}//${url.host}`;
}

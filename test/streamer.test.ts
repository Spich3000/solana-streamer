import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { PassThrough } from "node:stream";
import { afterEach, describe, it } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { pino } from "pino";
import { WebSocketServer, type WebSocket } from "ws";
import type { BlockStream } from "../src/block-stream.js";
import type { RpcBlock } from "../src/block.js";
import type { Config } from "../src/config.js";
import { HealthState } from "../src/health.js";
import { createMetrics } from "../src/metrics.js";
import { createStreamer, redact } from "../src/streamer.js";
import { SYSTEM_PROGRAM, block, transaction } from "./fixtures.js";

interface FakeRpc {
  url: string;
  connections: WebSocket[];
  requests: unknown[];
  nextConnection(): Promise<WebSocket>;
  close(): Promise<void>;
}

async function startFakeRpc(
  onSubscribe: (socket: WebSocket, id: number) => void,
  autoPong = true,
): Promise<FakeRpc> {
  // Own the HTTP server so teardown can drop connections that are still mid-handshake.
  const http = createServer();
  const server = new WebSocketServer({ server: http, autoPong });
  http.listen(0, "127.0.0.1");
  await once(http, "listening");

  const connections: WebSocket[] = [];
  const requests: unknown[] = [];
  const waiters: ((socket: WebSocket) => void)[] = [];

  server.on("connection", (socket) => {
    connections.push(socket);
    socket.on("message", (data: Buffer) => {
      const request = JSON.parse(data.toString("utf8")) as { id: number; method: string };
      requests.push(request);
      if (request.method === "blockSubscribe") onSubscribe(socket, request.id);
      waiters.shift()?.(socket);
    });
  });

  return {
    url: `ws://127.0.0.1:${(http.address() as AddressInfo).port}`,
    connections,
    requests,
    nextConnection: () =>
      new Promise((resolve) => {
        waiters.push(resolve);
      }),
    close: async () => {
      for (const socket of server.clients) socket.terminate();
      server.close();
      http.closeAllConnections();
      await new Promise<void>((resolve) => {
        http.close(() => {
          resolve();
        });
      });
    },
  };
}

function subscribeOk(socket: WebSocket, id: number): void {
  socket.send(JSON.stringify({ jsonrpc: "2.0", id, result: 7 }));
}

function sendBlock(socket: WebSocket, slot: number, payload: RpcBlock | null = sampleBlock(slot)): void {
  socket.send(
    JSON.stringify({
      jsonrpc: "2.0",
      method: "blockNotification",
      params: { subscription: 7, result: { context: { slot }, value: { slot, block: payload, err: null } } },
    }),
  );
}

function sampleBlock(slot: number): RpcBlock {
  return block(
    [
      transaction({
        accountKeys: ["payer", SYSTEM_PROGRAM],
        numRequiredSignatures: 1,
        programIdIndexes: [1],
      }),
    ],
    { parentSlot: slot - 1, blockTime: Math.floor(Date.now() / 1000) },
  );
}

function testConfig(url: string, overrides: Partial<Config> = {}): Config {
  return {
    rpcWsUrl: url,
    commitment: "confirmed",
    network: "test",
    httpPort: 0,
    logLevel: "silent",
    heartbeatIntervalMs: 1_000,
    idleTimeoutMs: 5_000,
    stallTimeoutMs: 60_000,
    reconnectMinDelayMs: 10,
    reconnectMaxDelayMs: 20,
    ...overrides,
  };
}

async function until(predicate: () => boolean, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for condition");
    await sleep(10);
  }
}

describe("streamer", () => {
  let rpc: FakeRpc | undefined;
  let stream: BlockStream | undefined;

  afterEach(async () => {
    await stream?.stop();
    await rpc?.close();
    stream = undefined;
    rpc = undefined;
  });

  function setup(config: Config) {
    const output = new PassThrough();
    const lines: { slot: number }[] = [];
    output.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString().split("\n").filter(Boolean))
        lines.push(JSON.parse(line) as { slot: number });
    });

    const metrics = createMetrics();
    const health = new HealthState(config.stallTimeoutMs);
    const fatal: Error[] = [];
    stream = createStreamer({
      config,
      logger: pino({ level: "silent" }),
      metrics,
      health,
      output,
      onFatal: (error) => {
        fatal.push(error);
      },
    });
    stream.start();
    return { lines, metrics, health, fatal };
  }

  it("sends a blockSubscribe request with the configured commitment", async () => {
    rpc = await startFakeRpc(subscribeOk);
    const connected = rpc.nextConnection();
    setup(testConfig(rpc.url, { commitment: "finalized" }));
    await connected;

    assert.deepEqual(rpc.requests[0], {
      jsonrpc: "2.0",
      id: 1,
      method: "blockSubscribe",
      params: [
        "all",
        {
          commitment: "finalized",
          encoding: "json",
          transactionDetails: "full",
          showRewards: false,
          maxSupportedTransactionVersion: 0,
        },
      ],
    });
  });

  it("emits one line per block and suppresses duplicates across reconnects", async () => {
    rpc = await startFakeRpc(subscribeOk);
    const first = rpc.nextConnection();
    const { lines, metrics, health } = setup(testConfig(rpc.url));

    const socket = await first;
    sendBlock(socket, 100);
    sendBlock(socket, 101);
    await until(() => lines.length === 2);
    assert.equal(health.readiness().ok, true);

    const second = rpc.nextConnection();
    socket.terminate();
    const reconnected = await second;
    sendBlock(reconnected, 101);
    sendBlock(reconnected, 102);
    await until(() => lines.length === 3);

    assert.deepEqual(
      lines.map((line) => line.slot),
      [100, 101, 102],
    );
    assert.equal((await metrics.reconnects.get()).values[0]?.value, 1);
    assert.equal((await metrics.duplicateBlocks.get()).values[0]?.value, 1);
    assert.equal((await metrics.lastSlot.get()).values[0]?.value, 102);
  });

  it("counts slots reported without a block", async () => {
    rpc = await startFakeRpc(subscribeOk);
    const connected = rpc.nextConnection();
    const { lines, metrics } = setup(testConfig(rpc.url));

    const socket = await connected;
    sendBlock(socket, 200, null);
    sendBlock(socket, 201);
    await until(() => lines.length === 1);

    assert.equal((await metrics.skippedSlots.get()).values[0]?.value, 1);
  });

  it("stops with a fatal error when blockSubscribe is not supported", async () => {
    rpc = await startFakeRpc((socket, id) => {
      socket.send(
        JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } }),
      );
    });
    const { fatal } = setup(testConfig(rpc.url));

    await until(() => fatal.length === 1);
    await sleep(100);
    assert.match(fatal[0]?.message ?? "", /does not support blockSubscribe/);
    assert.equal(rpc.connections.length, 1);
  });

  it("reconnects after other subscription errors", async () => {
    let calls = 0;
    rpc = await startFakeRpc((socket, id) => {
      if (calls++ === 0) {
        socket.send(
          JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32005, message: "Node is behind" } }),
        );
      } else {
        subscribeOk(socket, id);
      }
    });
    const { health } = setup(testConfig(rpc.url));

    await until(() => rpc?.connections.length === 2);
    await until(() => health.readiness().subscribed);
  });

  it("drops a connection that stops answering pings", async () => {
    rpc = await startFakeRpc(subscribeOk, false);
    setup(testConfig(rpc.url, { heartbeatIntervalMs: 30, idleTimeoutMs: 100 }));

    await until(() => (rpc?.connections.length ?? 0) >= 2);
  });
});

describe("redact", () => {
  it("hides API keys in the path and query", () => {
    assert.equal(redact("wss://mainnet.helius-rpc.com/?api-key=secret"), "wss://mainnet.helius-rpc.com/***");
    assert.equal(
      redact("wss://solana-mainnet.core.chainstack.com/abc123"),
      "wss://solana-mainnet.core.chainstack.com/***",
    );
    assert.equal(redact("ws://127.0.0.1:8900"), "ws://127.0.0.1:8900");
  });
});

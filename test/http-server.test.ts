import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { pino } from "pino";
import { HealthState } from "../src/health.js";
import { createHttpServer } from "../src/http-server.js";
import { createMetrics } from "../src/metrics.js";

describe("HTTP server", () => {
  let now = 0;
  const health = new HealthState(60_000, () => now);
  const metrics = createMetrics({ network: "test" });
  const server = createHttpServer({ health, registry: metrics.registry, logger: pino({ level: "silent" }) });
  let baseUrl = "";

  before(async () => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) =>
      server.close(() => {
        resolve();
      }),
    );
  });

  it("is live but not ready before the first block", async () => {
    assert.equal((await fetch(`${baseUrl}/healthz`)).status, 200);

    const ready = await fetch(`${baseUrl}/readyz`);
    assert.equal(ready.status, 503);
    assert.deepEqual(await ready.json(), {
      ok: false,
      subscribed: false,
      lastSlot: null,
      lastBlockAgeMs: null,
    });
  });

  it("becomes ready once subscribed and receiving blocks", async () => {
    health.markSubscribed();
    health.markBlock(42);
    now += 1_000;

    const ready = await fetch(`${baseUrl}/readyz`);
    assert.equal(ready.status, 200);
    assert.deepEqual(await ready.json(), { ok: true, subscribed: true, lastSlot: 42, lastBlockAgeMs: 1_000 });
  });

  it("stays live through a short reconnect but not ready", async () => {
    health.markDisconnected();

    assert.equal((await fetch(`${baseUrl}/healthz`)).status, 200);
    assert.equal((await fetch(`${baseUrl}/readyz`)).status, 503);
  });

  it("fails liveness when blocks stop for longer than the stall timeout", async () => {
    now += 60_001;

    assert.equal((await fetch(`${baseUrl}/healthz`)).status, 503);
  });

  it("exposes Prometheus metrics", async () => {
    metrics.blocks.inc();
    const res = await fetch(`${baseUrl}/metrics`);
    const body = await res.text();

    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/plain/);
    assert.match(body, /solana_streamer_blocks_total\{network="test"\} 1/);
    assert.match(body, /process_cpu_seconds_total/);
  });

  it("returns 404 for unknown paths and 405 for other methods", async () => {
    assert.equal((await fetch(`${baseUrl}/nope`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/metrics`, { method: "POST" })).status, 405);
  });
});

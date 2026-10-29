import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConfigError, loadConfig } from "../src/config.js";

const base = { RPC_WS_URL: "wss://rpc.example.com/key" };

describe("loadConfig", () => {
  it("applies defaults", () => {
    const config = loadConfig(base);

    assert.equal(config.rpcWsUrl, "wss://rpc.example.com/key");
    assert.equal(config.commitment, "confirmed");
    assert.equal(config.httpPort, 8080);
    assert.equal(config.logLevel, "info");
    assert.equal(config.network, "unknown");
  });

  it("reads overrides", () => {
    const config = loadConfig({
      ...base,
      COMMITMENT: "finalized",
      HTTP_PORT: "9090",
      LOG_LEVEL: "debug",
      NETWORK_NAME: "mainnet-beta",
    });

    assert.equal(config.commitment, "finalized");
    assert.equal(config.httpPort, 9090);
    assert.equal(config.logLevel, "debug");
    assert.equal(config.network, "mainnet-beta");
  });

  it("requires RPC_WS_URL", () => {
    assert.throws(() => loadConfig({}), ConfigError);
  });

  it("rejects non-WebSocket URLs", () => {
    assert.throws(() => loadConfig({ RPC_WS_URL: "https://rpc.example.com" }), /ws:\/\/ or wss:\/\//);
    assert.throws(() => loadConfig({ RPC_WS_URL: "not a url" }), /not a valid URL/);
  });

  it("rejects processed commitment, which blockSubscribe does not support", () => {
    assert.throws(() => loadConfig({ ...base, COMMITMENT: "processed" }), /COMMITMENT/);
  });

  it("validates integers and their relationships", () => {
    assert.throws(() => loadConfig({ ...base, HTTP_PORT: "0" }), /HTTP_PORT/);
    assert.throws(() => loadConfig({ ...base, HTTP_PORT: "80.5" }), /HTTP_PORT/);
    assert.throws(
      () => loadConfig({ ...base, RECONNECT_MIN_DELAY_MS: "5000", RECONNECT_MAX_DELAY_MS: "1000" }),
      /RECONNECT_MAX_DELAY_MS/,
    );
    assert.throws(
      () => loadConfig({ ...base, WS_HEARTBEAT_INTERVAL_MS: "30000", WS_IDLE_TIMEOUT_MS: "30000" }),
      /WS_IDLE_TIMEOUT_MS/,
    );
  });
});

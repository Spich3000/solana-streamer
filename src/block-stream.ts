import { EventEmitter } from "node:events";
import WebSocket from "ws";
import type { Backoff } from "./backoff.js";
import type { RpcBlock } from "./block.js";
import type { Commitment } from "./config.js";

const SUBSCRIBE_REQUEST_ID = 1;
const JSON_RPC_METHOD_NOT_FOUND = -32601;
const CLOSE_TIMEOUT_MS = 2_000;

export interface RpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface BlockStreamOptions {
  url: string;
  commitment: Commitment;
  heartbeatIntervalMs: number;
  idleTimeoutMs: number;
  backoff: Backoff;
}

export interface BlockStreamEvents {
  connecting: [attempt: number];
  subscribed: [subscriptionId: number];
  block: [slot: number, block: RpcBlock, receivedAt: Date];
  /** The node reported an error for a slot instead of a block. */
  skippedSlot: [slot: number, error: unknown];
  /** Recoverable failure; the stream reconnects on its own. */
  warning: [message: string, details: Record<string, unknown>];
  disconnected: [code: number, reason: string, retryInMs: number | null];
  /** Unrecoverable failure; the stream has stopped. */
  fatal: [error: Error];
}

interface JsonRpcMessage {
  id?: unknown;
  method?: unknown;
  result?: unknown;
  error?: RpcError;
  params?: { result?: { value?: BlockNotificationValue } };
}

interface BlockNotificationValue {
  slot: number;
  block: RpcBlock | null;
  err: unknown;
}

/**
 * Maintains a `blockSubscribe` subscription over a single WebSocket,
 * reconnecting with backoff whenever the connection drops or goes silent.
 */
export class BlockStream extends EventEmitter<BlockStreamEvents> {
  private socket: WebSocket | undefined;
  private heartbeat: NodeJS.Timeout | undefined;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private lastActivityAt = 0;
  private attempt = 0;
  private receivedBlockOnSocket = false;
  private running = false;

  constructor(private readonly options: BlockStreamOptions) {
    super();
  }

  start(): void {
    if (this.running) throw new Error("BlockStream is already running");
    this.running = true;
    this.connect();
  }

  async stop(): Promise<void> {
    this.running = false;
    clearTimeout(this.reconnectTimer);
    this.stopHeartbeat();

    const socket = this.socket;
    if (!socket || socket.readyState === WebSocket.CLOSED) return;

    // `events.once` would reject on the "error" emitted when closing a socket
    // that is still connecting, so wait for "close" explicitly.
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        socket.terminate();
      }, CLOSE_TIMEOUT_MS);
      socket.once("close", () => {
        clearTimeout(timeout);
        resolve();
      });
      socket.close(1000, "shutdown");
    });
  }

  private connect(): void {
    this.attempt++;
    this.receivedBlockOnSocket = false;
    this.emit("connecting", this.attempt);

    const socket = new WebSocket(this.options.url, {
      handshakeTimeout: this.options.idleTimeoutMs,
      perMessageDeflate: false,
    });
    this.socket = socket;

    socket.on("open", () => {
      this.touch();
      this.startHeartbeat(socket);
      socket.send(JSON.stringify(this.subscribeRequest()));
    });
    socket.on("message", (data: WebSocket.RawData) => {
      this.touch();
      this.handleMessage(socket, data);
    });
    socket.on("pong", () => {
      this.touch();
    });
    socket.on("error", (error) => {
      this.emit("warning", "WebSocket error", { error: error.message });
    });
    socket.on("close", (code, reason) => {
      this.onClose(socket, code, reason.toString());
    });
  }

  private subscribeRequest() {
    return {
      jsonrpc: "2.0",
      id: SUBSCRIBE_REQUEST_ID,
      method: "blockSubscribe",
      params: [
        "all",
        {
          commitment: this.options.commitment,
          encoding: "json",
          transactionDetails: "full",
          showRewards: false,
          maxSupportedTransactionVersion: 0,
        },
      ],
    };
  }

  private handleMessage(socket: WebSocket, data: WebSocket.RawData): void {
    const receivedAt = new Date();

    let message: JsonRpcMessage;
    try {
      message = JSON.parse(rawToString(data)) as JsonRpcMessage;
    } catch {
      this.emit("warning", "Discarded non-JSON message", {});
      return;
    }

    if (message.id === SUBSCRIBE_REQUEST_ID) {
      this.handleSubscribeResponse(socket, message);
      return;
    }

    if (message.method !== "blockNotification") return;

    const value = message.params?.result?.value;
    if (!value || typeof value.slot !== "number") {
      this.emit("warning", "Discarded malformed blockNotification", {});
      return;
    }

    if (value.err != null || !value.block) {
      this.emit("skippedSlot", value.slot, value.err);
      return;
    }

    if (!this.receivedBlockOnSocket) {
      this.receivedBlockOnSocket = true;
      this.attempt = 0;
      this.options.backoff.reset();
    }
    this.emit("block", value.slot, value.block, receivedAt);
  }

  private handleSubscribeResponse(socket: WebSocket, message: JsonRpcMessage): void {
    if (message.error) {
      const { code, message: text } = message.error;
      if (code === JSON_RPC_METHOD_NOT_FOUND) {
        // Retrying cannot help: the endpoint does not expose blockSubscribe.
        this.fail(new Error(`RPC endpoint does not support blockSubscribe: ${text} (${code})`));
        return;
      }
      this.emit("warning", "blockSubscribe rejected", { code, message: text });
      socket.terminate();
      return;
    }

    if (typeof message.result === "number") {
      this.emit("subscribed", message.result);
    }
  }

  private onClose(socket: WebSocket, code: number, reason: string): void {
    if (socket !== this.socket) return;
    this.socket = undefined;
    this.stopHeartbeat();

    if (!this.running) {
      this.emit("disconnected", code, reason, null);
      return;
    }

    const delay = this.options.backoff.next();
    this.emit("disconnected", code, reason, delay);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private fail(error: Error): void {
    void this.stop();
    this.emit("fatal", error);
  }

  private startHeartbeat(socket: WebSocket): void {
    this.stopHeartbeat();
    this.heartbeat = setInterval(() => {
      const idleFor = Date.now() - this.lastActivityAt;
      if (idleFor > this.options.idleTimeoutMs) {
        this.emit("warning", "Connection idle, forcing reconnect", { idleForMs: idleFor });
        socket.terminate();
        return;
      }
      if (socket.readyState === WebSocket.OPEN) socket.ping();
    }, this.options.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    clearInterval(this.heartbeat);
    this.heartbeat = undefined;
  }

  private touch(): void {
    this.lastActivityAt = Date.now();
  }
}

function rawToString(data: WebSocket.RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  return data.toString("utf8");
}

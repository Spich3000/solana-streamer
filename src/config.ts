export type Commitment = "confirmed" | "finalized";

const COMMITMENTS: readonly Commitment[] = ["confirmed", "finalized"];
const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface Config {
  readonly rpcWsUrl: string;
  readonly commitment: Commitment;
  readonly network: string;
  readonly httpPort: number;
  readonly logLevel: LogLevel;
  /** Interval between WebSocket pings. */
  readonly heartbeatIntervalMs: number;
  /** Connection is considered dead if nothing arrives within this window. */
  readonly idleTimeoutMs: number;
  /** Liveness fails if no block has been emitted within this window. */
  readonly stallTimeoutMs: number;
  readonly reconnectMinDelayMs: number;
  readonly reconnectMaxDelayMs: number;
}

export class ConfigError extends Error {
  override readonly name = "ConfigError";
}

type Env = Readonly<Record<string, string | undefined>>;

export function loadConfig(env: Env = process.env): Config {
  const config: Config = {
    rpcWsUrl: wsUrl(env, "RPC_WS_URL"),
    commitment: oneOf(env, "COMMITMENT", COMMITMENTS, "confirmed"),
    network: env.NETWORK_NAME?.trim() || "unknown",
    httpPort: integer(env, "HTTP_PORT", 8080, { min: 1, max: 65_535 }),
    logLevel: oneOf(env, "LOG_LEVEL", LOG_LEVELS, "info"),
    heartbeatIntervalMs: integer(env, "WS_HEARTBEAT_INTERVAL_MS", 10_000, { min: 1_000 }),
    idleTimeoutMs: integer(env, "WS_IDLE_TIMEOUT_MS", 30_000, { min: 1_000 }),
    stallTimeoutMs: integer(env, "STALL_TIMEOUT_MS", 120_000, { min: 1_000 }),
    reconnectMinDelayMs: integer(env, "RECONNECT_MIN_DELAY_MS", 500, { min: 0 }),
    reconnectMaxDelayMs: integer(env, "RECONNECT_MAX_DELAY_MS", 30_000, { min: 0 }),
  };

  if (config.reconnectMaxDelayMs < config.reconnectMinDelayMs) {
    throw new ConfigError("RECONNECT_MAX_DELAY_MS must be >= RECONNECT_MIN_DELAY_MS");
  }
  if (config.idleTimeoutMs <= config.heartbeatIntervalMs) {
    throw new ConfigError("WS_IDLE_TIMEOUT_MS must be greater than WS_HEARTBEAT_INTERVAL_MS");
  }
  return config;
}

function wsUrl(env: Env, name: string): string {
  const raw = env[name]?.trim();
  if (!raw) throw new ConfigError(`${name} is required`);

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigError(`${name} is not a valid URL`);
  }
  if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw new ConfigError(`${name} must use ws:// or wss://, got ${url.protocol}//`);
  }
  return url.toString();
}

function oneOf<T extends string>(env: Env, name: string, allowed: readonly T[], fallback: T): T {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  if (!(allowed as readonly string[]).includes(raw)) {
    throw new ConfigError(`${name} must be one of ${allowed.join(", ")}; got "${raw}"`);
  }
  return raw as T;
}

function integer(
  env: Env,
  name: string,
  fallback: number,
  bounds: { min?: number; max?: number } = {},
): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;

  const value = Number(raw);
  const { min = -Infinity, max = Infinity } = bounds;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ConfigError(`${name} must be an integer in [${min}, ${max}]; got "${raw}"`);
  }
  return value;
}

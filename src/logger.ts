import { pino, type Logger } from "pino";
import type { LogLevel } from "./config.js";

/**
 * Diagnostics go to stderr so that stdout carries nothing but block NDJSON
 * and can be piped straight into a consumer.
 */
export function createLogger(level: LogLevel, bindings: Record<string, string> = {}): Logger {
  return pino(
    {
      level,
      base: { service: "solana-streamer", ...bindings },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: { level: (label) => ({ level: label }) },
    },
    pino.destination({ fd: 2, sync: false }),
  );
}

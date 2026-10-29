import { ConfigError, loadConfig } from "./config.js";
import { HealthState } from "./health.js";
import { createHttpServer } from "./http-server.js";
import { createLogger } from "./logger.js";
import { createMetrics } from "./metrics.js";
import { createStreamer } from "./streamer.js";

const SHUTDOWN_TIMEOUT_MS = 10_000;

function main(): void {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(`Configuration error: ${error.message}\n`);
      process.exit(2);
    }
    throw error;
  }

  const logger = createLogger(config.logLevel, { network: config.network });
  const metrics = createMetrics({ network: config.network });
  const health = new HealthState(config.stallTimeoutMs);
  const server = createHttpServer({ health, registry: metrics.registry, logger });

  let shuttingDown = false;
  const shutdown = async (reason: string, exitCode: number): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ reason }, "Shutting down");

    setTimeout(() => {
      logger.error("Graceful shutdown timed out");
      logger.flush();
      process.exit(exitCode || 1);
    }, SHUTDOWN_TIMEOUT_MS).unref();

    await stream.stop();
    await new Promise<void>((resolve) =>
      server.close(() => {
        resolve();
      }),
    );
    logger.flush(() => process.exit(exitCode));
  };

  const stream = createStreamer({
    config,
    logger,
    metrics,
    health,
    output: process.stdout,
    onFatal: (error) => {
      logger.fatal({ err: error }, "Unrecoverable stream error");
      void shutdown("fatal error", 1);
    },
  });

  process.stdout.on("error", (error: NodeJS.ErrnoException) => {
    // The downstream consumer closed the pipe; there is nobody left to write to.
    if (error.code === "EPIPE") void shutdown("stdout closed", 0);
    else throw error;
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => void shutdown(signal, 0));
  }

  process.on("uncaughtException", (error) => {
    logger.fatal({ err: error }, "Uncaught exception");
    logger.flush();
    process.exit(1);
  });
  process.on("unhandledRejection", (reason) => {
    logger.fatal({ err: reason }, "Unhandled rejection");
    logger.flush();
    process.exit(1);
  });

  server.listen(config.httpPort, () => {
    logger.info({ port: config.httpPort }, "HTTP server listening");
    stream.start();
  });
}

main();

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Logger } from "pino";
import type { Registry } from "prom-client";
import type { HealthReport, HealthState } from "./health.js";

export interface HttpServerDeps {
  health: HealthState;
  registry: Registry;
  logger: Logger;
}

export function createHttpServer({ health, registry, logger }: HttpServerDeps): Server {
  const routes: Record<string, (res: ServerResponse) => Promise<void> | void> = {
    "/healthz": (res) => {
      sendHealth(res, health.liveness());
    },
    "/readyz": (res) => {
      sendHealth(res, health.readiness());
    },
    "/metrics": async (res) => {
      const body = await registry.metrics();
      res.writeHead(200, { "Content-Type": registry.contentType }).end(body);
    },
  };

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    const route = routes[path];

    if (!route) {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("not found\n");
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD", "Content-Type": "text/plain" }).end("method not allowed\n");
      return;
    }

    Promise.resolve(route(res)).catch((error: unknown) => {
      logger.error({ err: error, path }, "HTTP handler failed");
      if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("internal error\n");
    });
  });

  server.keepAliveTimeout = 5_000;
  server.headersTimeout = 10_000;
  return server;
}

function sendHealth(res: ServerResponse, report: HealthReport): void {
  res
    .writeHead(report.ok ? 200 : 503, { "Content-Type": "application/json", "Cache-Control": "no-store" })
    .end(JSON.stringify(report));
}

import http from "http";
import supertest from "supertest";
import { metricsHandler, wsConnectionStatus, lastProcessedSlot } from "../src/metrics";
import { health } from "../src/health";

let server: http.Server;
let request: ReturnType<typeof supertest>;

beforeAll(() => {
    server = http.createServer((req, res) => {
        if (req.url === "/healthz") {
            res.statusCode = health.wsConnected ? 200 : 503;
            return res.end();
        }
        if (req.url === "/readyz") {
            res.statusCode = health.firstBlockReceived ? 200 : 503;
            return res.end();
        }
        if (req.url === "/metrics") {
            return metricsHandler(req, res);
        }
        res.statusCode = 404;
        res.end();
    }).listen(0); // random free port

    request = supertest(server);
});

afterAll(() => server.close());

describe("Health endpoints", () => {
    test("should return 503 when WS not connected", async () => {
        health.wsConnected = false;
        const res = await request.get("/healthz");
        expect(res.status).toBe(503);
    });

    test("should return 200 when WS connected", async () => {
        health.wsConnected = true;
        const res = await request.get("/healthz");
        expect(res.status).toBe(200);
    });

    test("should return 503 when first block not received", async () => {
        health.firstBlockReceived = false;
        const res = await request.get("/readyz");
        expect(res.status).toBe(503);
    });

    test("should return 200 when first block received", async () => {
        health.firstBlockReceived = true;
        const res = await request.get("/readyz");
        expect(res.status).toBe(200);
    });
});

describe("Metrics endpoint", () => {
    test("should return metrics text", async () => {
        wsConnectionStatus.set(1);
        lastProcessedSlot.set(100);
        const res = await request.get("/metrics");
        expect(res.text).toContain("solana_ws_connection_status");
        expect(res.text).toContain("solana_last_processed_slot");
    });
});
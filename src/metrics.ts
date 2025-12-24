import client from "prom-client";

export const wsConnectionStatus = new client.Gauge({
    name: "solana_ws_connection_status",
    help: "1 if WS connected",
});

export const lastProcessedSlot = new client.Gauge({
    name: "solana_last_processed_slot",
    help: "Last processed slot",
});

export const blocksProcessed = new client.Counter({
    name: "solana_blocks_processed_total",
    help: "Blocks processed",
});

export const wsReconnects = new client.Counter({
    name: "solana_ws_reconnects_total",
    help: "WS reconnects",
});

export const rpcErrors = new client.Counter({
    name: "solana_rpc_errors_total",
    help: "RPC errors",
    labelNames: ["type"],
});

export const blockLatency = new client.Histogram({
    name: "solana_block_ingest_latency_seconds",
    help: "Block ingest latency",
    buckets: [1, 2, 5, 10, 20, 30],
});

export async function metricsHandler(_: any, res: any) {
    try {
        res.setHeader("Content-Type", client.register.contentType);
        res.end(await client.register.metrics());
    } catch (e) {
        res.statusCode = 500;
        res.end("metrics error");
    }
}

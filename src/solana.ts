import WebSocket from "ws";
import { PublicKey } from "@solana/web3.js";
import {
    wsConnectionStatus,
    lastProcessedSlot,
    blocksProcessed,
    wsReconnects,
    blockLatency,
    rpcErrors,
} from "./metrics";
import { health } from "./health";
import { config } from "./config";
import { logger, logRaw } from "./logger";

let lastSlot = 0;
let retry = 0;

export function startSolanaStream() {
    function connect() {
        logger.info({ wsUrl: config.wsUrl }, "Connecting to Solana WebSocket RPC");
        const ws = new WebSocket(config.wsUrl);

        ws.on("open", () => { // WebSocket open handler
            health.wsConnected = true;
            wsConnectionStatus.set(1);
            retry = 0;

            ws.send(JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "blockSubscribe",
                params: [
                    "all",
                    {
                        commitment: config.commitment,
                        encoding: "json",
                        transactionDetails: "full",
                        rewards: false,
                        maxSupportedTransactionVersion: 0,
                    },
                ],
            }));

            logger.info("WebSocket connected, blockSubscribe sent")
        });

        ws.on("message", (raw) => { // Message handler with error handling for parsing and processing
            let msg: any;
            try {
                msg = JSON.parse(raw.toString());
            } catch {
                return;
            }

            if (msg?.error) {
                logger.error(
                    {
                        code: msg.error.code,
                        message: msg.error.message,
                        data: msg.error.data,
                        method: "blockSubscribe",
                        wsUrl: config.wsUrl,
                    },
                    "RPC error received from WebSocket"
                );

                rpcErrors.inc({ type: "subscribe" });
                health.wsConnected = false;
                wsConnectionStatus.set(0);

                // Unsupported method → reconnect won't help
                ws.close();
                return;
            }

            if (msg?.result && typeof msg.result === "number") {
                logger.info(
                    { subscriptionId: msg.result },
                    "blockSubscribe successful"
                );
                return;
            }

            const value = msg?.params?.result?.value;
            const contextSlot = msg?.params?.result?.context?.slot;
            if (!value?.block || typeof contextSlot !== "number") return;
            if (contextSlot <= lastSlot) return; // Skip duplicate blocks

            try {
                const block = value.block;
                const receivedAt = new Date();

                const programIds = new Set<string>();
                const signers = new Set<string>();
                let totalFee = 0;

                for (const tx of block.transactions) {
                    totalFee += tx.meta?.fee ?? 0;

                    const message = tx.transaction.message;
                    const baseKeys = message.accountKeys.map((k: string) => new PublicKey(k));

                    const loaded =
                        tx.meta?.loadedAddresses
                            ? [
                                ...tx.meta.loadedAddresses.writable,
                                ...tx.meta.loadedAddresses.readonly,
                            ].map((k: string) => new PublicKey(k))
                            : [];

                    const allKeys = [...baseKeys, ...loaded];

                    allKeys.forEach(k => signers.add(k.toBase58()));

                    for (const ix of message.instructions) {
                        const pid = allKeys[ix.programIdIndex];
                        if (pid) programIds.add(pid.toBase58());
                    }
                }

                const blockSummary = {
                    slot: contextSlot,
                    blockhash: block.blockhash,
                    parentSlot: block.parentSlot,
                    blockTime: block.blockTime,
                    txCount: block.transactions.length,
                    totalFeeLamports: totalFee,
                    signersCount: signers.size,
                    programIds: [...programIds],
                    receivedAt: receivedAt.toISOString(),
                };

                logRaw(blockSummary); // log info → block summaries

                lastSlot = contextSlot;
                health.firstBlockReceived = true;

                lastProcessedSlot.set(contextSlot);
                blocksProcessed.inc();

                if (block.blockTime) {
                    blockLatency.observe(
                        receivedAt.getTime() / 1000 - block.blockTime
                    );
                }
            } catch (err) { // warn → transient RPC errors
                rpcErrors.inc({ type: "block" });
                logger.warn({ err }, "Failed to process block");
            }
        });

        ws.on("close", () => { // warn → transient RPC errors
            logger.warn("WebSocket closed, reconnecting");
            reconnect();
        });

        ws.on("error", (err) => { // warn → transient RPC errors
            logger.warn({ err }, "WebSocket error");
        });
    }

    function reconnect() { // Implement WebSocket reconnection with exponential backoff + jitter
        health.wsConnected = false;
        wsConnectionStatus.set(0);
        wsReconnects.inc();

        const delay = Math.min(30_000, 2 ** retry * 1000);
        retry++;
        setTimeout(connect, delay + Math.random() * 500);
    }

    connect();
}
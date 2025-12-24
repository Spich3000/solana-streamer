import { Commitment } from "@solana/web3.js";

function required(name: string): string {
    const v = process.env[name];
    if (!v) throw new Error(`Missing env var: ${name}`);
    return v;
}

function optional(name: string): string | undefined {
    return process.env[name];
}

function commitment(name: string, fallback: Commitment): Commitment {
    const v = process.env[name] as Commitment | undefined;
    if (!v) return fallback;
    if (!["processed", "confirmed", "finalized"].includes(v)) {
        throw new Error(`Invalid commitment for ${name}: ${v}`);
    }
    return v;
}

export const config = {
    wsUrl: required("RPC_WS_URL"),
    httpUrl: optional("RPC_HTTP_URL"),
    commitment: commitment("COMMITMENT", "confirmed"),
    network: process.env.NETWORK_NAME ?? "unknown",
    logLevel: process.env.LOG_LEVEL ?? "info",
};
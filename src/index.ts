import http from "http";
import { startSolanaStream } from "./solana";
import { metricsHandler } from "./metrics";
import { healthHandler, readyHandler } from "./health";
import { logger } from "./logger";

process.on("uncaughtException", (err) => { // error → unrecoverable errors
    logger.error({ err }, "Uncaught exception, shutting down");
    process.exit(1);
});

process.on("unhandledRejection", (err) => { // error → unrecoverable errors
    logger.error({ err }, "Unhandled promise rejection, shutting down");
    process.exit(1);
});

const server = http.createServer((req, res) => {
    switch (req.url) {
        case "/healthz":
            return healthHandler(req, res);
        case "/readyz":
            return readyHandler(req, res);
        case "/metrics":
            return metricsHandler(req, res);
        default:
            res.statusCode = 404;
            return res.end("Not Found");
    }
});

server.listen(8080, () => {
    console.log("Server listening on port 8080");
    startSolanaStream();
});
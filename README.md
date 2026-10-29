# solana-streamer

Subscribes to new Solana blocks over a WebSocket RPC connection (`blockSubscribe`)
and writes one JSON summary per block to stdout. Logs go to stderr, so stdout can
be piped directly into another process, a file, or a log shipper.

```console
$ RPC_WS_URL=wss://your-rpc.example/KEY npm start | jq -c '{slot, txCount, totalFeeLamports}'
{"slot":388702233,"txCount":1097,"totalFeeLamports":16519190}
{"slot":388702234,"txCount":1133,"totalFeeLamports":20194322}
```

`blockSubscribe` is not available on `api.mainnet-beta.solana.com`; use a provider
that enables it (Helius, Triton, QuickNode, Chainstack and others) or a validator
started with `--rpc-pubsub-enable-block-subscription`. If the endpoint rejects the
method the process exits with status 1 instead of retrying forever.

## Output

Each line is a self-contained JSON object:

```json
{
  "slot": 388702233,
  "blockhash": "D2oo3vc7W9vrGcK3fN258bLtzwejaUDbHPpFKsebL6sT",
  "parentSlot": 388702232,
  "blockHeight": 366810954,
  "blockTime": 1766522569,
  "txCount": 1097,
  "failedTxCount": 41,
  "totalFeeLamports": 16519190,
  "signersCount": 912,
  "programIds": [
    "ComputeBudget111111111111111111111111111111",
    "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"
  ],
  "receivedAt": "2025-12-23T20:43:03.589Z"
}
```

| Field              | Description                                                                 |
| ------------------ | --------------------------------------------------------------------------- |
| `txCount`          | Transactions in the block, including votes and failed transactions          |
| `failedTxCount`    | Transactions with a non-null `meta.err`                                     |
| `totalFeeLamports` | Sum of `meta.fee`; failed transactions pay fees too                         |
| `signersCount`     | Distinct accounts that signed at least one transaction                      |
| `programIds`       | Distinct programs invoked by top-level instructions, including ALT-resolved |
| `receivedAt`       | When the notification was received; `blockTime` has one-second resolution   |

## Running

Requires Node.js 22.13 or newer.

```bash
npm ci
npm run build
RPC_WS_URL=wss://your-rpc.example/KEY npm start
```

With Docker:

```bash
docker build -t solana-streamer .
docker run --rm -p 8080:8080 -e RPC_WS_URL=wss://your-rpc.example/KEY solana-streamer
```

On Kubernetes (the RPC URL is stored in a Secret; pass `rpc.existingSecret` to use
one you manage yourself):

```bash
helm upgrade --install solana-streamer helm/solana-streamer \
  --set image.repository=registry.example.com/solana-streamer \
  --set image.tag=1.0.0 \
  --set-string rpc.url="$RPC_WS_URL"
```

For Minikube, build into the cluster's Docker daemon and set `image.tag=local`:

```bash
eval "$(minikube docker-env)"
docker build -t solana-streamer:local .
helm upgrade --install solana-streamer helm/solana-streamer \
  --set image.tag=local --set-string rpc.url="$RPC_WS_URL"
```

## Configuration

| Variable                   | Default     | Description                                               |
| -------------------------- | ----------- | --------------------------------------------------------- |
| `RPC_WS_URL`               | required    | `ws://` or `wss://` endpoint that supports blockSubscribe |
| `COMMITMENT`               | `confirmed` | `confirmed` or `finalized`                                |
| `NETWORK_NAME`             | `unknown`   | Added to every log line and metric as `network`           |
| `HTTP_PORT`                | `8080`      | Port for health and metrics endpoints                     |
| `LOG_LEVEL`                | `info`      | `fatal`, `error`, `warn`, `info`, `debug`, `trace`        |
| `WS_HEARTBEAT_INTERVAL_MS` | `10000`     | Interval between WebSocket pings                          |
| `WS_IDLE_TIMEOUT_MS`       | `30000`     | Reconnect if nothing is received for this long            |
| `STALL_TIMEOUT_MS`         | `120000`    | Liveness fails if no block is emitted for this long       |
| `RECONNECT_MIN_DELAY_MS`   | `500`       | First reconnect delay                                     |
| `RECONNECT_MAX_DELAY_MS`   | `30000`     | Upper bound for the exponential backoff                   |

Invalid configuration is reported on stderr and the process exits with status 2.

## HTTP endpoints

| Path       | Purpose                                                                    |
| ---------- | -------------------------------------------------------------------------- |
| `/healthz` | Liveness. `503` only when no block has been emitted for `STALL_TIMEOUT_MS` |
| `/readyz`  | Readiness. `200` while subscribed and receiving blocks                     |
| `/metrics` | Prometheus exposition format                                               |

Both health endpoints return a JSON body such as
`{"ok":true,"subscribed":true,"lastSlot":388702234,"lastBlockAgeMs":412}`.

Liveness intentionally ignores the connection state: a reconnect that takes a few
seconds should not get the pod killed, while a process that has silently stopped
producing output should.

## Metrics

| Metric                                         | Type      |
| ---------------------------------------------- | --------- |
| `solana_streamer_ws_connected`                 | gauge     |
| `solana_streamer_ws_reconnects_total`          | counter   |
| `solana_streamer_blocks_total`                 | counter   |
| `solana_streamer_transactions_total`           | counter   |
| `solana_streamer_duplicate_blocks_total`       | counter   |
| `solana_streamer_skipped_slots_total`          | counter   |
| `solana_streamer_last_slot`                    | gauge     |
| `solana_streamer_errors_total{kind}`           | counter   |
| `solana_streamer_block_ingest_latency_seconds` | histogram |

Standard Node.js process metrics (`process_*`, `nodejs_*`) are exported as well.

## Design notes

**Delivery.** Blocks are emitted at most once per process. The last 4096 slots are
remembered, so a block re-sent after a reconnect is dropped, while blocks that
arrive out of order are still emitted. Slots produced while the connection is down
are not backfilled; doing so would require `getBlock` over HTTP and persisting the
last emitted slot.

**Connection health.** The client pings every `WS_HEARTBEAT_INTERVAL_MS` and drops
the connection if neither a pong nor a notification arrives within
`WS_IDLE_TIMEOUT_MS`. This catches half-open TCP connections that would otherwise
hang without an error. Reconnects use exponential backoff with jitter, and the
backoff resets only after a block is received, so an endpoint that accepts the
subscription and then disconnects does not cause a tight loop.

**Scaling.** The chart runs a single replica with the `Recreate` strategy, because
two replicas would emit every block twice. Higher throughput or redundancy calls for
a downstream deduplicating consumer keyed by `slot`.

## Development

```bash
npm run dev        # run from source with reload
npm run check      # typecheck, lint, formatting, tests
npm run format     # apply Prettier
```

Tests use the Node.js test runner. The stream tests run against an in-process
WebSocket server that mimics the RPC protocol, covering subscription, reconnects,
duplicate suppression, idle detection and unsupported endpoints.

## Project layout

```
src/
  index.ts          process wiring, signals, graceful shutdown
  config.ts         environment parsing and validation
  block-stream.ts   WebSocket client: subscribe, heartbeat, reconnect
  streamer.ts       connects the stream to stdout, metrics and health
  block.ts          block summary
  slot-window.ts    bounded duplicate filter
  backoff.ts        reconnect delays
  health.ts         liveness and readiness state
  http-server.ts    /healthz, /readyz, /metrics
  metrics.ts        Prometheus registry
  logger.ts         pino logger on stderr
helm/solana-streamer/   Kubernetes chart
```

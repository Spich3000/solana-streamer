# Solana Block Streamer

A **TypeScript** service that streams **new Solana blocks in real time** using **WebSocket subscriptions only** and outputs **one NDJSON line per block** to stdout.

The service is designed for observability, resiliency, and Kubernetes deployment.

---

### Project Structure

The application is intentionally kept small and self-contained, so all source
files live under a single `src/` directory. Each file represents a clear
responsibility (streaming, metrics, health, configuration), keeping the code
easy to review and extend without unnecessary abstraction.

---

## How It Works

- Connects to a Solana **WebSocket RPC endpoint**
- Subscribes to **new blocks via `blockSubscribe`**
- For each received block:
    - Uses block data included in `blockSubscribe` notifications
    - Aggregates metadata (fees, signers, program IDs)
    - Emits **one JSON object per line (NDJSON)** to stdout
- Exposes:
    - `/healthz`
    - `/readyz`
    - `/metrics` (Prometheus / VictoriaMetrics compatible)

---

# Design & tradeoffs section

RPC Compatibility Notes

This service is optimized for RPC providers that support
blockSubscribe over WebSocket (typically paid or enterprise RPCs).

### Alternative Architecture: slotSubscribe + HTTP getBlock

When blockSubscribe is unavailable, the same result can be achieved using a hybrid approach:
1.	WebSocket
      •	Subscribe to new slots using slotSubscribe
2.	HTTP RPC
      •	Fetch full block data for each slot via getBlock

⚠️ **Important:**  
The RPC endpoint **must support `blockSubscribe` over WebSocket** (some public endpoints do not).

### 🔐 Note on Configuration & Secrets

In this Helm chart, environment variables such as RPC_WS_URL and RPC_HTTP_URL
are defined via values.yaml and rendered into a Kubernetes ConfigMap.

This approach is intentional for local development and Minikube, but not recommended for production.


### Design Notes

#### WebSocket Client Choice
- Uses the **native WebSocket implementation** (Node.js / lightweight WS client).
- Chosen to minimize dependencies, reduce memory footprint, and keep behavior predictable during reconnects.

#### Reconnection Handling
- WebSocket disconnects are explicitly detected.
- The service automatically **reconnects and re-subscribes** to `blockSubscribe`.
- Reconnect attempts are tracked and exposed via metrics (`solana_ws_reconnects_total`).

#### Avoiding Block Duplication
- Each processed block is tracked by **slot number**.
- Blocks with a slot less than or equal to the last processed slot are ignored.
- Guarantees **at-most-once emission** even across reconnects.

#### Metrics & Health Checks
- `/healthz` — reports **WebSocket connection status**.
- `/readyz` — reports whether **at least one block has been received**.
- `/metrics` — Prometheus / VictoriaMetrics compatible metrics:
    - WebSocket connection status
    - Last processed slot
    - Total blocks processed
    - Reconnect count
    - RPC error count
    - Ingest latency

#### Future Improvements
- Persist last processed slot (disk / Redis) to survive restarts.
- Add structured logging and tracing (OpenTelemetry).
- Automatic fallback to `slotSubscribe` + HTTP `getBlock`.
- Horizontal scaling with leader election or slot partitioning.
- Secure configuration using Kubernetes Secrets for production.

---

# How To Run

## Run locally

```bash
npm ci
npm run build
RPC_WS_URL=wss://<solana-endpoint> \
COMMITMENT=confirmed \
npm start
```

## 🐳 Run with Docker

```bash
docker build -t solana-streamer:local .
docker run -p 8080:8080 \
-e RPC_WS_URL=wss://<solana-endpoint> \
-e COMMITMENT=confirmed \
solana-streamer:local
```
## ☸ Run on Minikube

Before running this commands, Replace RPC_WS_URL in values.yaml with an endpoint that supports blockSubscribe (paid Solana RPC required).


```bash
minikube start
eval "$(minikube docker-env)"
docker build -t solana-streamer:local .
helm upgrade --install solana-streamer helm/solana-streamer
kubectl port-forward deploy/solana-streamer 8080:8080
```

## 🧾 Sample Output (NDJSON)

> The following is a **real output sample** produced by the service when connected to a paid Solana RPC endpoint that supports `blockSubscribe` the `wss://api.mainnet-beta.solana.com` is not support it:

```json

{"slot":388702233,"blockhash":"D2oo3vc7W9vrGcK3fN258bLtzwejaUDbHPpFKsebL6sT","parentSlot":388702232,"blockTime":1766522569,"txCount":1097,"totalFeeLamports":16519190,"signersCount":3218,"programIds":["11111111111111111111111111111111","ComputeBudget111111111111111111111111111111","SoLFiHG9TfgtdUXUjWAxi3LtvYuFyDLVhBWxdMZxyCe","NA247a7YE9S3p9CdKmMyETx8TTwbSdVbVYHHxpnHTUV","ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL","cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG","SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE","mmm3XBJg5gk8XJxEKBvdgptZz6SgK4tXvn36sodowMc","TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA","TessVdML9pBGgG9yGks7o4HewRaXVAMuoVj4x83GLQH","BPFLoaderUpgradeab1e11111111111111111111111","JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4","pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA","CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK","dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH","proVF4pMXVaYqmy4NjniPh4pqKNfMmsihgd4wdkCX3u","7gETM2B8mgq5JcGHcE7C93uxVYDv9889FUk5FV7gDAct","ZERor4xhbUycZ6gb9ntrhqscUcZmAbQDjEAtCf4hbZY","dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN","MEViEnscUm6tsQRoGd9h6nLQaQspKj7DB2M5FwM3Xvz","Vote111111111111111111111111111111111111111","TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb","8Ue7UGaqgk9GR3YphyDMe9TX4rdUqsbVXfPcFbzM5LDE","3i5JeuZuUxeKtVysUnwQNGerJP2bSMX9fTFfS4Nxe3Br","FzuVV5WeLyWHDuX6SPbeLgqkvePDTzMCRKYAhDbiP3z3","L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95","MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr","LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo","GDDMwNyyx8uB6zrqwBFHjLLG3TBYk2F8Az4yrQC5RzMp","PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY","goonERTdGsjnkZqWuVjs73BZ3Pb9qoCUdBUL17BnS5j","6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P","FW6zUqn4iKRaeopwwhwsquTY6ABWLLgjxtrC3VPnaWBf","AMEAktCrii7mVFQKCM9i5hKES4YrV3zFagrawr8BY8pb","BiSoNHVpsVZW2F7rx2eQ59yQwKxzU5NvBcmKshCSUypi","CxvksNjwhdHDLr3qbCXNKVdeYACW8cs93vFqLqtgyFE5","DoVEsk76QybCEHQGzkvYPWLQu9gzNoZZZt3TPiL597e","3s1rAymURnacreXreMy718GfqW6kygQsLNka1xDyW8pC","routeUGWgWzqBWFcrCfv8tritsqukccJPu3q5GPP3xS","TCMPhJdwDryooaGtiocG1u3xcYbRpiJzb283XfCZsDp","M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K","EtrnLzgbS7nMMy5fbD42kXiUzGg8XQzJ972Xtk1cjWih","Ed25519SigVerify111111111111111111111111111","dijkbkCAKfFTCxQg3u1pg82gVU1jJGHBBRcteD11mBu","9H6tua7jkLhdm3w8BvgpTn5LZNU7g4ZynDmCiNN3q6Rp","3QUnrcMqCQoiGB73s1A6uDzxziywaNFpTLiZiiZbEUoN","troY36YiPGqMyAYCNbEqYCdN2tb91Zf7bHcQt7KUi61","FsU1rcaEC361jBr9JE5wm7bpWRSTYeAMN4R2MCs11rNF","E2uCGJ4TtYyKPGaK57UMfbs9sgaumwDEZF1aAY6fF3mS","LVJFnvzw4jDzjdhJ9onG8H7R27ph8bqhU1aN4bBj6pP","D4aBeFn9DBhU41kFNvr9kVKRuBy858ATxwTevmJCCJYL","mine9YMaEywEJyysaDLjYngt8pYXxQDsdakUewPEW8S","HVi6VyyLvTtFTA8f8atavxVjUKi8WjmnydfKgoZKzt7H","BoobsBSMpFRBA91sNwKLYShRRQPH5GjoCH4NhLUt4yRo","FLASHX8DrLbgeR8FcfNV1F5krxYcYMUdBkrP1EPBtxB9","77oqZNZKomqpumA3Xiio4S1PoJeS1bm4scuDPLbo5bQu"],"receivedAt":"2025-12-23T20:43:03.589Z"}
{"slot":388702234,"blockhash":"9nCehDf3nmFbEwRjo2JPqpCHa6omnTbgZ7e5n4KgT87z","parentSlot":388702233,"blockTime":1766522569,"txCount":1133,"totalFeeLamports":20194322,"signersCount":3418,"programIds":["ComputeBudget111111111111111111111111111111","11111111111111111111111111111111","BPFLoaderUpgradeab1e11111111111111111111111","TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA","ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL","pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA","3s1rAymURnacreXreMy718GfqW6kygQsLNka1xDyW8pC","NA247a7YE9S3p9CdKmMyETx8TTwbSdVbVYHHxpnHTUV","cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG","ZERor4xhbUycZ6gb9ntrhqscUcZmAbQDjEAtCf4hbZY","fastC7gqs2WUXgcyNna2BZAe9mte4zcTGprv3mv18N3","MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e","JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4","tayEHsBuPoFDwjuwBznf2T5LSUgqVBC8jD48b1gWPaZ","FLASHX8DrLbgeR8FcfNV1F5krxYcYMUdBkrP1EPBtxB9","dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN","9H6tua7jkLhdm3w8BvgpTn5LZNU7g4ZynDmCiNN3q6Rp","8Ue7UGaqgk9GR3YphyDMe9TX4rdUqsbVXfPcFbzM5LDE","Vote111111111111111111111111111111111111111","TessVdML9pBGgG9yGks7o4HewRaXVAMuoVj4x83GLQH","goonERTdGsjnkZqWuVjs73BZ3Pb9qoCUdBUL17BnS5j","SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE","HFn8GnPADiny6XqUoWE8uRPPxb29ikn4yTuPa9MF2fWJ","XxXxXwJhqsCqZ5yzrykvjwVnUpqBUJP6g6cYjFt2dfW","FsU1rcaEC361jBr9JE5wm7bpWRSTYeAMN4R2MCs11rNF","BoobsBSMpFRBA91sNwKLYShRRQPH5GjoCH4NhLUt4yRo","TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb","mmm3XBJg5gk8XJxEKBvdgptZz6SgK4tXvn36sodowMc","TCMPhJdwDryooaGtiocG1u3xcYbRpiJzb283XfCZsDp","term9YPb9mzAsABaqN71A4xdbxHmpBNZavpBiQKZzN3","RivcqadFtck4owDSAPHmYGZaLgBHeZwVemjffeQ6Szb","AWyHupJb5LBjgcAjDaLmLMRbj72dX4kTtnvNpbrMqpFF","AQU1FRd7papthgdrwPTTq5JacJh8YtwEXaBfKU3bTz45","GaaRXwUCbzQfr8SVedKbyjXYDuSmgrTheQSFUn8y2Vn1","dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH","E2uCGJ4TtYyKPGaK57UMfbs9sgaumwDEZF1aAY6fF3mS","6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P","KeccakSecp256k11111111111111111111111111111","SBondMDrcV3K4kxZR1HNVT7osZxAHVHgYXL5Ze1oMUv","MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr","StenDH7EmnXdcniwsXgTWtN1ogfQksZ1C5UGBr7dNBG","BiSoNHVpsVZW2F7rx2eQ59yQwKxzU5NvBcmKshCSUypi","3QUnrcMqCQoiGB73s1A6uDzxziywaNFpTLiZiiZbEUoN","GDDMwNyyx8uB6zrqwBFHjLLG3TBYk2F8Az4yrQC5RzMp","PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY","boreXQWsKpsJz5RR9BMtN8Vk4ndAk23sutj8spWYhwk","Ed25519SigVerify111111111111111111111111111","MEViEnscUm6tsQRoGd9h6nLQaQspKj7DB2M5FwM3Xvz","NA365bsPdvZ8sP58qJ5QFg7eXygCe8aPRRxR9oeMbR5","9Zzf9QqTy3TkyXysvJBsXyuRjda5aXCEJ9vXfL2HKSYv","CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK","GKybPT5ZzV5NgkXy1Pa8Bnu14MS7euEtK8j9zWHzYJpx","4pP8eDKACuV7T2rbFPE8CHxGKDYAzSdRsdMsGvz2k4oc","MashGQTqcKDZAMevJKST9RYqJTL2Ae9NpcSuCE9WYqK","hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8","PdMDrKEMaX8q7CCJb7NvUCxerBCcsFUa4LjBEynTtEd","M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K","HVi6VyyLvTtFTA8f8atavxVjUKi8WjmnydfKgoZKzt7H","EtrnLzgbS7nMMy5fbD42kXiUzGg8XQzJ972Xtk1cjWih","CVAU7TAbdfv7s6rxSmcNKg2AGswZAChXaovoKdvxVs5Q","MEViZt7uNtZs47XkjujUuMSAxxxVtQQ25SwToLcEckt","ojh19ojaKduoJZuaJADhcVGp4xt1TcdAvZmpVsCorch"],"receivedAt":"2025-12-23T20:43:03.745Z"}
```


## Simple CURL checks

```bash
> curl -i localhost:8080/healthz
HTTP/1.1 200 OK
Date: Tue, 24 Dec 2025 19:07:42 GMT

> curl -i localhost:8080/readyz
HTTP/1.1 200 OK
Date: Tue, 24 Dec 2025 19:07:42 GMT

> curl localhost:8080/metrics
# HELP solana_ws_connection_status 1 if WS connected
# TYPE solana_ws_connection_status gauge
solana_ws_connection_status 1

# HELP solana_last_processed_slot Last processed slot
# TYPE solana_last_processed_slot gauge
solana_last_processed_slot 388687438

# HELP solana_blocks_processed_total Blocks processed
# TYPE solana_blocks_processed_total counter
solana_blocks_processed_total 24

# HELP solana_ws_reconnects_total WS reconnects
# TYPE solana_ws_reconnects_total counter
solana_ws_reconnects_total 0

# HELP solana_rpc_errors_total RPC errors
# TYPE solana_rpc_errors_total counter

# HELP solana_block_ingest_latency_seconds Block ingest latency
# TYPE solana_block_ingest_latency_seconds histogram
solana_block_ingest_latency_seconds_bucket{le="1"} 0
solana_block_ingest_latency_seconds_bucket{le="2"} 9
solana_block_ingest_latency_seconds_bucket{le="5"} 24
solana_block_ingest_latency_seconds_bucket{le="10"} 24
solana_block_ingest_latency_seconds_bucket{le="20"} 24
solana_block_ingest_latency_seconds_bucket{le="30"} 24
solana_block_ingest_latency_seconds_bucket{le="+Inf"} 24
solana_block_ingest_latency_seconds_sum 53.53999948501587
solana_block_ingest_latency_seconds_count 24

```

## Tests

> The tests use Jest and verify the health endpoints and metrics reporting.
> File: test/health.test.ts

```azure
❯ npm test

> solana-streamer@0.1.0 test
> jest

 PASS  test/health.test.ts
  Health endpoints
    ✓ should return 503 when WS not connected (9 ms)
    ✓ should return 200 when WS connected (1 ms)
    ✓ should return 503 when first block not received (1 ms)
    ✓ should return 200 when first block received (2 ms)
  Metrics endpoint
    ✓ should return metrics text (2 ms)

Test Suites: 1 passed, 1 total
Tests:       5 passed, 5 total
Snapshots:   0 total
Time:        0.619 s, estimated 1 s
Ran all test suites.

```


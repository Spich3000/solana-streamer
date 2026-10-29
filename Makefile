IMAGE ?= solana-streamer:local
RELEASE ?= solana-streamer
CHART := helm/solana-streamer

.PHONY: install check build docker helm-lint helm-install helm-uninstall logs

install:
	npm ci

check:
	npm run check

build:
	npm run build

docker:
	docker build -t $(IMAGE) .

helm-lint:
	helm lint $(CHART) --set rpc.url=wss://example.invalid

# Requires RPC_WS_URL in the environment; it is stored in a Kubernetes Secret.
helm-install:
	@test -n "$(RPC_WS_URL)" || (echo "RPC_WS_URL is not set" >&2; exit 1)
	helm upgrade --install $(RELEASE) $(CHART) --set-string rpc.url="$(RPC_WS_URL)"

helm-uninstall:
	helm uninstall $(RELEASE)

logs:
	kubectl logs deploy/$(RELEASE) -f

dev:
	npm ci && npm run dev

docker:
	docker build -t solana-streamer:local .

helm-install:
	helm upgrade --install solana-streamer helm/solana-streamer

helm-uninstall:
	helm uninstall solana-streamer

minikube:
	minikube start
	eval "$$(minikube docker-env)"

logs:
	kubectl logs deploy/solana-streamer -f

SHELL := /bin/sh

.PHONY: help install db-up migrate seed api miniapp up down logs lambda-package test test-go test-frontend test-integration e2e-install e2e

help:
	@echo "install           Install Node dependencies"
	@echo "db-up             Start PostgreSQL"
	@echo "migrate           Apply all PostgreSQL migrations"
	@echo "seed              Load deterministic character and encounter data"
	@echo "api               Run the Go API on the host"
	@echo "miniapp           Run the Next.js Mini App on the host"
	@echo "up                 Build and start PostgreSQL plus the Go API"
	@echo "lambda-package     Build the arm64 provided.al2023 bootstrap archive"
	@echo "test               Run unit, contract, race, and frontend tests"
	@echo "test-integration   Run Go tests against local PostgreSQL"
	@echo "e2e                Start the API stack and run the Playwright journey"
	@echo "down               Stop local containers"

install:
	npm ci

db-up:
	docker compose up -d postgres redis

migrate:
	docker compose run --rm migrate

seed:
	docker compose run --rm seed

api:
	cd apps/api && go run ./cmd/api

miniapp:
	npm run dev --workspace @xuhuan/miniapp

up:
	docker compose up --build -d api

down:
	docker compose down

logs:
	docker compose logs -f api

lambda-package:
	mkdir -p apps/api/build
	cd apps/api && CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -tags lambda.norpc -trimpath -ldflags="-s -w" -o build/bootstrap ./cmd/lambda
	cd apps/api/build && zip -q -j lambda.zip bootstrap

test: test-go test-frontend

test-go:
	cd apps/api && gofmt -l . | tee /tmp/xuhuan-gofmt-files && test ! -s /tmp/xuhuan-gofmt-files
	cd apps/api && go vet ./...
	cd apps/api && go test -race ./...
	cd apps/api && CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -tags lambda.norpc -trimpath -o /tmp/xuhuan-lambda-bootstrap ./cmd/lambda

test-frontend:
	npm run build --workspace @xuhuan/game-types
	npm run check:api-types --workspace @xuhuan/miniapp
	npm run test --workspace @xuhuan/miniapp
	npm run lint --workspace @xuhuan/miniapp
	npm run typecheck --workspace @xuhuan/miniapp
	npm run build --workspace @xuhuan/miniapp

test-integration: db-up
	cd apps/api && TEST_DATABASE_URL="$${DATABASE_URL:-postgres://xuhuan:local_xuhuan_password@localhost:5432/xuhuan?sslmode=disable}" TEST_REDIS_URL="$${REDIS_URL:-redis://localhost:6379/0}" go test -race ./internal/postgres ./internal/platform/ratelimit

e2e-install:
	npx playwright install chromium

e2e:
	@set -eu; \
		DEV_TELEGRAM_USER_ID="$$(date +%s)"; \
		export DEV_TELEGRAM_USER_ID; \
		export RATE_LIMIT_PLAYER_REQUESTS=1000; \
		export RATE_LIMIT_IP_REQUESTS=2000; \
		trap 'docker compose down' EXIT; \
		docker compose up --build -d api; \
		npm run test:e2e --workspace @xuhuan/miniapp

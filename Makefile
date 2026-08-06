SHELL := /bin/sh

.PHONY: help install db-up migrate seed api miniapp up down logs test test-go test-frontend test-integration e2e-install e2e

help:
	@echo "install           Install Node dependencies"
	@echo "db-up             Start PostgreSQL"
	@echo "migrate           Apply all PostgreSQL migrations"
	@echo "seed              Load deterministic character and encounter data"
	@echo "api               Run the Go API on the host"
	@echo "miniapp           Run the Next.js Mini App on the host"
	@echo "up                 Build and start PostgreSQL plus the Go API"
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

test: test-go test-frontend

test-go:
	cd apps/api && gofmt -l . | tee /tmp/xuhuan-gofmt-files && test ! -s /tmp/xuhuan-gofmt-files
	cd apps/api && go vet ./...
	cd apps/api && go test -race ./...

test-frontend:
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
	docker compose up --build -d api
	npm run test:e2e --workspace @xuhuan/miniapp

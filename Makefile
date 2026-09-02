SHELL := /bin/sh
LOAD_ENV = set -a; [ ! -f .env ] || . ./.env; set +a;

.PHONY: db-up db-down migrate api miniapp lambda-package test test-go test-frontend test-integration e2e-install e2e

db-up:
	docker compose up -d --wait postgres redis

migrate:
	$(LOAD_ENV) cd apps/api && go run ./cmd/migrate

api:
	$(LOAD_ENV) cd apps/api && go run ./cmd/api

miniapp:
	$(LOAD_ENV) npm run dev --workspace @xuhuan/miniapp

db-down:
	docker compose down

lambda-package:
	mkdir -p apps/api/build
	cd apps/api && CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -tags lambda.norpc -trimpath -ldflags="-s -w" -o build/bootstrap ./cmd/lambda
	cd apps/api/build && zip -q -j lambda.zip bootstrap

test: test-go test-frontend

test-go:
	cd apps/api && gofmt -l . | tee /tmp/xuhuan-gofmt-files && test ! -s /tmp/xuhuan-gofmt-files
	cd apps/api && go vet ./...
	cd apps/api && go test ./...
	cd apps/api && CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -tags lambda.norpc -trimpath -o /tmp/xuhuan-lambda-bootstrap ./cmd/lambda

test-frontend:
	npm run check:portfolio-demo
	npm run check:api-types --workspace @xuhuan/miniapp
	npm run test --workspace @xuhuan/miniapp
	npm run lint --workspace @xuhuan/miniapp
	npm run build --workspace @xuhuan/miniapp

test-integration: db-up
	cd apps/api && TEST_DATABASE_URL="$${DATABASE_URL:-postgres://xuhuan:local_xuhuan_password@localhost:5432/xuhuan?sslmode=disable}" TEST_REDIS_URL="$${REDIS_URL:-redis://localhost:6379/0}" go test ./internal/postgres ./internal/platform/ratelimit

e2e-install:
	npx playwright install chromium

e2e:
	npm run test:e2e --workspace @xuhuan/miniapp

# syntax=docker/dockerfile:1.7

FROM golang:1.26.5-alpine AS build

WORKDIR /src/apps/api
COPY apps/api/go.mod apps/api/go.sum ./
RUN go mod download
COPY apps/api ./

ARG APP_VERSION=development
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api \
    && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/migrate ./cmd/migrate \
    && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/seed ./cmd/seed

FROM alpine:3.24

RUN apk add --no-cache ca-certificates \
    && addgroup -S -g 10001 xuhuan \
    && adduser -S -D -H -u 10001 -G xuhuan xuhuan
WORKDIR /app
COPY --from=build --chown=10001:10001 /out/api /out/migrate /out/seed /app/

USER 10001:10001
EXPOSE 8080
CMD ["/app/api"]

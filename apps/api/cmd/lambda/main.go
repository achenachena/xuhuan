package main

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"os"
	"time"

	"github.com/achenachena/xuhuan/apps/api/internal/application"
	"github.com/achenachena/xuhuan/apps/api/internal/lambdahttp"
	"github.com/achenachena/xuhuan/apps/api/internal/platform/config"
	"github.com/aws/aws-lambda-go/events"
	awslambda "github.com/aws/aws-lambda-go/lambda"
)

type operationEvent struct {
	Operation string `json:"operation"`
}

type operationResponse struct {
	Status    string           `json:"status"`
	Operation string           `json:"operation"`
	Counts    map[string]int64 `json:"counts,omitempty"`
}

func main() {
	if err := run(); err != nil {
		slog.Error("lambda_stopped", "error", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	runtime, err := application.New(context.Background(), cfg, os.Stdout)
	if err != nil {
		return err
	}
	defer func() {
		shutdownContext, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := runtime.Close(shutdownContext); err != nil {
			runtime.Logger.Warn("runtime_shutdown_failed")
		}
	}()

	adapter := lambdahttp.New(runtime.Handler)
	awslambda.Start(func(ctx context.Context, payload json.RawMessage) (any, error) {
		return handleEvent(ctx, payload, adapter.Serve, runtime.MigrateAndSeed, runtime.Check, runtime.DataSummary)
	})
	return nil
}

func handleEvent(
	ctx context.Context,
	payload json.RawMessage,
	serve func(context.Context, events.LambdaFunctionURLRequest) (events.LambdaFunctionURLResponse, error),
	migrateAndSeed func(context.Context) error,
	check func(context.Context) error,
	dataSummary func(context.Context) (map[string]int64, error),
) (any, error) {
	var operation operationEvent
	if err := json.Unmarshal(payload, &operation); err != nil {
		return nil, errors.New("decode Lambda event")
	}
	switch operation.Operation {
	case "migrate-and-seed":
		if err := migrateAndSeed(ctx); err != nil {
			return nil, err
		}
		return operationResponse{Status: "ok", Operation: operation.Operation}, nil
	case "check":
		if err := check(ctx); err != nil {
			return nil, err
		}
		return operationResponse{Status: "ok", Operation: operation.Operation}, nil
	case "data-summary":
		counts, err := dataSummary(ctx)
		if err != nil {
			return nil, err
		}
		return operationResponse{Status: "ok", Operation: operation.Operation, Counts: counts}, nil
	case "":
		var request events.LambdaFunctionURLRequest
		if err := json.Unmarshal(payload, &request); err != nil {
			return nil, errors.New("decode Lambda Function URL event")
		}
		if request.RequestContext.HTTP.Method == "" {
			return nil, errors.New("Lambda event has no operation or HTTP method")
		}
		return serve(ctx, request)
	default:
		return nil, errors.New("unsupported Lambda operation")
	}
}

package main

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"os"
	"time"

	"github.com/achenachena/xuhuan/apps/api/internal/application"
	gamecontent "github.com/achenachena/xuhuan/apps/api/internal/content"
	"github.com/achenachena/xuhuan/apps/api/internal/lambdahttp"
	"github.com/achenachena/xuhuan/apps/api/internal/platform/config"
	"github.com/aws/aws-lambda-go/events"
	awslambda "github.com/aws/aws-lambda-go/lambda"
)

type operationEvent struct {
	Operation string `json:"operation"`
}

type operationResponse struct {
	Status         string `json:"status"`
	Operation      string `json:"operation"`
	ContentVersion string `json:"content_version"`
	Protocol       string `json:"protocol"`
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
		return handleEvent(ctx, payload, adapter.Serve, runtime.Check)
	})
	return nil
}

func handleEvent(
	ctx context.Context,
	payload json.RawMessage,
	serve func(context.Context, events.LambdaFunctionURLRequest) (events.LambdaFunctionURLResponse, error),
	check func(context.Context) error,
) (any, error) {
	var operation operationEvent
	if err := json.Unmarshal(payload, &operation); err != nil {
		return nil, errors.New("decode lambda event")
	}
	switch operation.Operation {
	case "check":
		if err := check(ctx); err != nil {
			return nil, err
		}
		return operationResponse{
			Status:         "ok",
			Operation:      operation.Operation,
			ContentVersion: gamecontent.CurrentVersion,
			Protocol:       gamecontent.CurrentProtocol,
		}, nil
	case "":
		var request events.LambdaFunctionURLRequest
		if err := json.Unmarshal(payload, &request); err != nil {
			return nil, errors.New("decode lambda Function URL event")
		}
		if request.RequestContext.HTTP.Method == "" {
			return nil, errors.New("lambda event has no operation or HTTP method")
		}
		return serve(ctx, request)
	default:
		return nil, errors.New("unsupported Lambda operation")
	}
}

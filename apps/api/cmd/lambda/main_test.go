package main

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/aws/aws-lambda-go/events"
)

func TestHandleEventDispatchesMaintenanceOperations(t *testing.T) {
	migrations := 0
	checks := 0
	summaries := 0
	serve := func(context.Context, events.LambdaFunctionURLRequest) (events.LambdaFunctionURLResponse, error) {
		t.Fatal("HTTP adapter should not run for a maintenance operation")
		return events.LambdaFunctionURLResponse{}, nil
	}
	migrate := func(context.Context) error { migrations++; return nil }
	check := func(context.Context) error { checks++; return nil }
	summary := func(context.Context) (map[string]int64, error) {
		summaries++
		return map[string]int64{"players": 0, "characters": 14}, nil
	}

	for _, operation := range []string{"migrate-and-seed", "check", "data-summary"} {
		payload, _ := json.Marshal(operationEvent{Operation: operation})
		response, err := handleEvent(context.Background(), payload, serve, migrate, check, summary)
		if err != nil {
			t.Fatal(err)
		}
		operationResult, ok := response.(operationResponse)
		if !ok || operationResult.Status != "ok" || operationResult.Operation != operation {
			t.Fatalf("unexpected response: %#v", response)
		}
		if operation == "data-summary" && operationResult.Counts["characters"] != 14 {
			t.Fatalf("unexpected data summary: %#v", operationResult.Counts)
		}
	}
	if migrations != 1 || checks != 1 || summaries != 1 {
		t.Fatalf("unexpected operation counts: migrations=%d checks=%d summaries=%d", migrations, checks, summaries)
	}
}

func TestHandleEventDispatchesFunctionURLRequest(t *testing.T) {
	request := events.LambdaFunctionURLRequest{
		RawPath: "/healthz",
		RequestContext: events.LambdaFunctionURLRequestContext{HTTP: events.LambdaFunctionURLRequestContextHTTPDescription{
			Method: http.MethodGet,
		}},
	}
	payload, _ := json.Marshal(request)
	serve := func(_ context.Context, received events.LambdaFunctionURLRequest) (events.LambdaFunctionURLResponse, error) {
		if received.RawPath != request.RawPath {
			t.Fatalf("unexpected request: %#v", received)
		}
		return events.LambdaFunctionURLResponse{StatusCode: http.StatusOK}, nil
	}
	response, err := handleEvent(context.Background(), payload, serve, func(context.Context) error { return nil }, func(context.Context) error { return nil }, func(context.Context) (map[string]int64, error) { return nil, nil })
	if err != nil {
		t.Fatal(err)
	}
	if response.(events.LambdaFunctionURLResponse).StatusCode != http.StatusOK {
		t.Fatalf("unexpected response: %#v", response)
	}
}

func TestHandleEventRejectsUnknownOperation(t *testing.T) {
	payload, _ := json.Marshal(operationEvent{Operation: "delete-everything"})
	_, err := handleEvent(
		context.Background(),
		payload,
		func(context.Context, events.LambdaFunctionURLRequest) (events.LambdaFunctionURLResponse, error) {
			return events.LambdaFunctionURLResponse{}, nil
		},
		func(context.Context) error { return nil },
		func(context.Context) error { return nil },
		func(context.Context) (map[string]int64, error) { return nil, nil },
	)
	if err == nil || !strings.Contains(err.Error(), "unsupported Lambda operation") {
		t.Fatal("expected unsupported operation error")
	}
}

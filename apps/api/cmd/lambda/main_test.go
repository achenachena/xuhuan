package main

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/aws/aws-lambda-go/events"
)

func TestHandleEventDispatchesHealthCheck(t *testing.T) {
	checks := 0
	serve := func(context.Context, events.LambdaFunctionURLRequest) (events.LambdaFunctionURLResponse, error) {
		t.Fatal("HTTP adapter should not run for a maintenance operation")
		return events.LambdaFunctionURLResponse{}, nil
	}
	check := func(context.Context) error { checks++; return nil }

	payload, _ := json.Marshal(operationEvent{Operation: "check"})
	response, err := handleEvent(context.Background(), payload, serve, check)
	if err != nil {
		t.Fatal(err)
	}
	operationResult, ok := response.(operationResponse)
	if !ok || operationResult.Status != "ok" || operationResult.Operation != "check" || operationResult.ContentVersion != "v3" || operationResult.Protocol != "action-v2" {
		t.Fatalf("unexpected response: %#v", response)
	}
	if checks != 1 {
		t.Fatalf("unexpected check count: %d", checks)
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
	response, err := handleEvent(context.Background(), payload, serve, func(context.Context) error { return nil })
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
	)
	if err == nil || !strings.Contains(err.Error(), "unsupported Lambda operation") {
		t.Fatal("expected unsupported operation error")
	}
}

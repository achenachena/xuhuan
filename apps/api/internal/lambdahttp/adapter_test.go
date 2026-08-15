package lambdahttp

import (
	"context"
	"encoding/base64"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/aws/aws-lambda-go/events"
)

func TestServeTranslatesFunctionURLRequestAndResponse(t *testing.T) {
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatal(err)
		}
		if r.Method != http.MethodPost || r.URL.Path != "/v1/test" || r.URL.RawQuery != "page=2" {
			t.Fatalf("unexpected request target: %s %s", r.Method, r.URL.String())
		}
		if r.Header.Get("X-Test") != "value" || r.Header.Get("Cookie") != "a=1; b=2" {
			t.Fatalf("unexpected headers: %#v", r.Header)
		}
		if r.RemoteAddr != "203.0.113.10:0" || string(body) != `{"ok":true}` {
			t.Fatalf("unexpected request metadata: remote=%q body=%q", r.RemoteAddr, body)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Add("Set-Cookie", "session=one")
		w.Header().Add("Set-Cookie", "mode=game")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"created":true}`))
	})

	response, err := New(handler).Serve(context.Background(), events.LambdaFunctionURLRequest{
		RawPath:         "/v1/test",
		RawQueryString:  "page=2",
		Headers:         map[string]string{"Host": "example.lambda-url.us-east-1.on.aws", "x-test": "value"},
		Cookies:         []string{"a=1", "b=2"},
		Body:            base64.StdEncoding.EncodeToString([]byte(`{"ok":true}`)),
		IsBase64Encoded: true,
		RequestContext: events.LambdaFunctionURLRequestContext{HTTP: events.LambdaFunctionURLRequestContextHTTPDescription{
			Method: http.MethodPost, SourceIP: "203.0.113.10",
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusCreated || response.Body != `{"created":true}` || response.Headers["Content-Type"] != "application/json" {
		t.Fatalf("unexpected response: %#v", response)
	}
	if len(response.Cookies) != 2 || response.Cookies[0] != "session=one" || response.Cookies[1] != "mode=game" {
		t.Fatalf("unexpected cookies: %#v", response.Cookies)
	}
}

func TestServeRejectsOversizedHeaders(t *testing.T) {
	_, err := New(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {})).Serve(context.Background(), events.LambdaFunctionURLRequest{
		RawPath: "/",
		Headers: map[string]string{
			"host":    "example.lambda-url.us-east-1.on.aws",
			"x-large": strings.Repeat("x", maxEventHeaderBytes),
		},
		RequestContext: events.LambdaFunctionURLRequestContext{HTTP: events.LambdaFunctionURLRequestContextHTTPDescription{
			Method: http.MethodGet,
		}},
	})
	if err == nil {
		t.Fatal("expected oversized headers to fail")
	}
}

func TestServeRejectsInvalidBase64Body(t *testing.T) {
	_, err := New(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {})).Serve(context.Background(), events.LambdaFunctionURLRequest{
		RawPath:         "/",
		Body:            "not-base64",
		IsBase64Encoded: true,
		RequestContext: events.LambdaFunctionURLRequestContext{HTTP: events.LambdaFunctionURLRequestContextHTTPDescription{
			Method: http.MethodPost,
		}},
	})
	if err == nil {
		t.Fatal("expected invalid base64 body to fail")
	}
}

package lambdahttp

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"

	"github.com/aws/aws-lambda-go/events"
)

type Adapter struct {
	handler http.Handler
}

const maxEventHeaderBytes = 32 << 10

func New(handler http.Handler) *Adapter {
	return &Adapter{handler: handler}
}

func (adapter *Adapter) Serve(ctx context.Context, event events.LambdaFunctionURLRequest) (events.LambdaFunctionURLResponse, error) {
	request, err := requestFromEvent(ctx, event)
	if err != nil {
		return events.LambdaFunctionURLResponse{}, err
	}
	recorder := httptest.NewRecorder()
	adapter.handler.ServeHTTP(recorder, request)
	result := recorder.Result()
	defer result.Body.Close()

	headers := make(map[string]string, len(result.Header))
	for name, values := range result.Header {
		if strings.EqualFold(name, "Set-Cookie") {
			continue
		}
		headers[name] = strings.Join(values, ", ")
	}
	return events.LambdaFunctionURLResponse{
		StatusCode:      result.StatusCode,
		Headers:         headers,
		Body:            recorder.Body.String(),
		IsBase64Encoded: false,
	}, nil
}

func requestFromEvent(ctx context.Context, event events.LambdaFunctionURLRequest) (*http.Request, error) {
	if event.RequestContext.HTTP.Method == "" {
		return nil, errors.New("Lambda Function URL request has no HTTP method")
	}
	if headerBytes(event) > maxEventHeaderBytes {
		return nil, errors.New("Lambda Function URL request headers are too large")
	}
	body := []byte(event.Body)
	if event.IsBase64Encoded {
		decoded, err := base64.StdEncoding.DecodeString(event.Body)
		if err != nil {
			return nil, errors.New("decode base64 request body")
		}
		body = decoded
	}

	path := event.RawPath
	if path == "" {
		path = "/"
	}
	requestURL, err := url.ParseRequestURI(path + querySuffix(event.RawQueryString))
	if err != nil {
		return nil, errors.New("parse Lambda Function URL request target")
	}
	requestURL.Scheme = "https"
	requestURL.Host = headerValue(event.Headers, "Host")
	if requestURL.Host == "" {
		return nil, errors.New("Lambda Function URL request has no host")
	}

	request, err := http.NewRequestWithContext(ctx, event.RequestContext.HTTP.Method, requestURL.String(), bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	for name, value := range event.Headers {
		request.Header.Set(name, value)
	}
	request.Host = requestURL.Host
	request.RequestURI = requestURL.RequestURI()
	if sourceIP := event.RequestContext.HTTP.SourceIP; sourceIP != "" {
		request.RemoteAddr = sourceIP
		if net.ParseIP(sourceIP) != nil {
			request.RemoteAddr = net.JoinHostPort(sourceIP, "0")
		}
	}
	return request, nil
}

func headerBytes(event events.LambdaFunctionURLRequest) int {
	total := 0
	for name, value := range event.Headers {
		total += len(name) + len(value)
	}
	return total
}

func headerValue(headers map[string]string, name string) string {
	for candidate, value := range headers {
		if strings.EqualFold(candidate, name) {
			return value
		}
	}
	return ""
}

func querySuffix(rawQuery string) string {
	if rawQuery == "" {
		return ""
	}
	return "?" + rawQuery
}

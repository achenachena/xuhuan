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
	var cookies []string
	for name, values := range result.Header {
		if strings.EqualFold(name, "Set-Cookie") {
			cookies = append(cookies, values...)
			continue
		}
		headers[name] = strings.Join(values, ", ")
	}
	return events.LambdaFunctionURLResponse{
		StatusCode:      result.StatusCode,
		Headers:         headers,
		Body:            recorder.Body.String(),
		IsBase64Encoded: false,
		Cookies:         cookies,
	}, nil
}

func requestFromEvent(ctx context.Context, event events.LambdaFunctionURLRequest) (*http.Request, error) {
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
	requestURL.Host = event.Headers["host"]

	request, err := http.NewRequestWithContext(ctx, event.RequestContext.HTTP.Method, requestURL.String(), bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	for name, value := range event.Headers {
		request.Header.Set(name, value)
	}
	if len(event.Cookies) > 0 {
		request.Header.Set("Cookie", strings.Join(event.Cookies, "; "))
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

func querySuffix(rawQuery string) string {
	if rawQuery == "" {
		return ""
	}
	return "?" + rawQuery
}

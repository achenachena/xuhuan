package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/getkin/kin-openapi/openapi3"
)

func TestResponsesMatchOpenAPIContract(t *testing.T) {
	t.Parallel()

	document, err := openapi3.NewLoader().LoadFromFile("../../openapi/openapi.yaml")
	if err != nil {
		t.Fatalf("load OpenAPI: %v", err)
	}
	if err := document.Validate(context.Background()); err != nil {
		t.Fatalf("validate OpenAPI: %v", err)
	}

	tests := []struct {
		name   string
		router http.Handler
		method string
		path   string
		status int
	}{
		{
			name: "health", router: testRouter(ReadinessFunc(func(context.Context) error { return nil }), nil),
			method: http.MethodGet, path: "/healthz", status: http.StatusOK,
		},
		{
			name: "v2 content", router: func() http.Handler { router, _ := v2TestRouter(t); return router }(),
			method: http.MethodGet, path: "/v2/content/v1?locale=zh-CN", status: http.StatusOK,
		},
		{
			name: "game unauthorized", router: func() http.Handler { router, _ := v2TestRouter(t); return router }(),
			method: http.MethodGet, path: "/v2/game", status: http.StatusUnauthorized,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(test.method, test.path, nil)
			response := httptest.NewRecorder()
			test.router.ServeHTTP(response, request)
			if response.Code != test.status {
				t.Fatalf("status=%d want=%d body=%s", response.Code, test.status, response.Body.String())
			}
			validateContractResponse(t, document, test.path, test.method, response)
		})
	}
}

func validateContractResponse(t *testing.T, document *openapi3.T, path, method string, response *httptest.ResponseRecorder) {
	t.Helper()
	contractPath := strings.SplitN(path, "?", 2)[0]
	if strings.HasPrefix(contractPath, "/v2/content/") {
		contractPath = "/v2/content/{version}"
	}
	pathItem := document.Paths.Find(contractPath)
	if pathItem == nil {
		t.Fatalf("OpenAPI path %q missing", path)
	}
	operation := pathItem.GetOperation(method)
	if operation == nil {
		t.Fatalf("OpenAPI operation %s %s missing", method, path)
	}
	responseRef := operation.Responses.Value(strconv.Itoa(response.Code))
	if responseRef == nil || responseRef.Value == nil {
		t.Fatalf("OpenAPI response %d missing for %s %s", response.Code, method, path)
	}
	mediaType := responseRef.Value.Content.Get("application/json")
	if mediaType == nil || mediaType.Schema == nil || mediaType.Schema.Value == nil {
		t.Fatalf("JSON response schema missing for %s %s", method, path)
	}
	var body any
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if err := mediaType.Schema.Value.VisitJSON(body); err != nil {
		t.Fatalf("response does not match OpenAPI: %v\nbody=%s", err, response.Body.String())
	}
	if response.Header().Get(requestIDHeader) == "" {
		t.Fatal("response is missing X-Request-ID")
	}
}

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
	v2Router, _ := v2TestRouter(t)
	productionV2Router, _ := v2TestRouterWithLocalDevelopment(t, false)

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
			name: "readiness", router: testRouter(ReadinessFunc(func(context.Context) error { return nil }), nil),
			method: http.MethodGet, path: "/readyz", status: http.StatusOK,
		},
		{
			name: "v2 content", router: v2Router,
			method: http.MethodGet, path: "/v2/content/v4?locale=zh-CN", status: http.StatusOK,
		},
		{
			name: "public daily result", router: v2Router,
			method: http.MethodGet, path: "/v2/daily/results/10000000-0000-4000-8000-000000000001", status: http.StatusOK,
		},
		{
			name: "game unauthorized", router: productionV2Router,
			method: http.MethodGet, path: "/v2/game", status: http.StatusUnauthorized,
		},
		{
			name: "game snapshot", router: v2Router,
			method: http.MethodGet, path: "/v2/game", status: http.StatusOK,
		},
		{
			name: "authoritative run", router: v2Router,
			method: http.MethodGet, path: "/v2/runs/10000000-0000-4000-8000-000000000001", status: http.StatusOK,
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

func TestV4MutationResponsesMatchOpenAPIContract(t *testing.T) {
	t.Parallel()
	document, err := openapi3.NewLoader().LoadFromFile("../../openapi/openapi.yaml")
	if err != nil {
		t.Fatal(err)
	}
	if err := document.Validate(context.Background()); err != nil {
		t.Fatal(err)
	}
	router, _ := v2TestRouter(t)
	tests := []struct {
		name string
		path string
		body string
	}{
		{
			name: "run command",
			path: "/v2/runs/10000000-0000-4000-8000-000000000001/commands",
			body: `{"type":"choose_show_option","option_id":"double-take","expected_version":1}`,
		},
		{
			name: "story choice revision",
			path: "/v2/story/choices",
			body: `{"scene_slug":"seventh-dock-intermission","option_slug":"keep-ocean-noise","expected_version":1}`,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, test.path, strings.NewReader(test.body))
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set("Idempotency-Key", "contract-mutation-001")
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			if response.Code != http.StatusOK {
				t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
			}
			validateContractResponse(t, document, test.path, http.MethodPost, response)
		})
	}
}

func TestCreateRunResponseMatchesFullyTypedRuntimeContract(t *testing.T) {
	t.Parallel()
	document, err := openapi3.NewLoader().LoadFromFile("../../openapi/openapi.yaml")
	if err != nil {
		t.Fatal(err)
	}
	if err := document.Validate(context.Background()); err != nil {
		t.Fatal(err)
	}
	router, _ := v2TestRouter(t)
	request := httptest.NewRequest(http.MethodPost, "/v2/runs", strings.NewReader(`{"mode":"campaign","chapter_slug":"seventh-dock","character_slug":"nana7mi","encore_level":0}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Idempotency-Key", "contract-create-run-001")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusCreated {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
	validateContractResponse(t, document, "/v2/runs", http.MethodPost, response)
}

func validateContractResponse(t *testing.T, document *openapi3.T, path, method string, response *httptest.ResponseRecorder) {
	t.Helper()
	contractPath := strings.SplitN(path, "?", 2)[0]
	if strings.HasPrefix(contractPath, "/v2/content/") {
		contractPath = "/v2/content/{version}"
	} else if strings.HasPrefix(contractPath, "/v2/daily/results/") {
		contractPath = "/v2/daily/results/{id}"
	} else if strings.HasSuffix(contractPath, "/commands") && strings.HasPrefix(contractPath, "/v2/runs/") {
		contractPath = "/v2/runs/{id}/commands"
	} else if strings.HasPrefix(contractPath, "/v2/runs/") {
		contractPath = "/v2/runs/{id}"
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

package api

import (
	"net/http/httptest"
	"testing"
)

func TestResponseLanguageDefaultsToCanonicalEnglish(t *testing.T) {
	tests := []struct {
		header string
		want   string
	}{
		{header: "", want: "en"},
		{header: "fr-CA", want: "en"},
		{header: "en-CA,en;q=0.9", want: "en"},
		{header: "zh-CN,zh;q=0.9,en;q=0.8", want: "zh-CN"},
		{header: "fr-CA, zh-TW;q=0.8", want: "zh-CN"},
	}
	for _, test := range tests {
		request := httptest.NewRequest("GET", "/", nil)
		request.Header.Set("Accept-Language", test.header)
		if got := responseLanguage(request); got != test.want {
			t.Errorf("Accept-Language %q: got %q, want %q", test.header, got, test.want)
		}
	}
}

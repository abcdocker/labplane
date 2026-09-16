package internal

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestFetchVictoriaLogsNDJSONDetectsLimit(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if got := r.Form.Get("limit"); got != "3" {
			http.Error(w, "expected one look-ahead row", http.StatusBadRequest)
			return
		}
		for i := 0; i < 3; i++ {
			_, _ = fmt.Fprintf(w, "{\"_msg\":\"line-%d\"}\n", i)
		}
	}))
	defer server.Close()

	rows, truncated, warning, limit, err := fetchVictoriaLogsNDJSON(
		context.Background(),
		Config{},
		server.URL,
		"*",
		2,
		"",
		"",
	)
	if err != nil {
		t.Fatalf("fetch: %v", err)
	}
	if !truncated {
		t.Fatal("expected truncated=true")
	}
	if warning != "" {
		t.Fatalf("unexpected warning: %s", warning)
	}
	if limit != 2 || len(rows) != 2 {
		t.Fatalf("limit=%d rows=%d", limit, len(rows))
	}
}

package internal

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestMeshRouteUpdateDetectsUnpersistedRevocation(t *testing.T) {
	meshAllowLoopbackForTest = true
	defer func() { meshAllowLoopbackForTest = false }()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/api/v1/node/1/approve_routes":
			w.WriteHeader(http.StatusOK)
		case r.Method == http.MethodGet && r.URL.Path == "/api/v1/node":
			_, _ = w.Write([]byte(`{"nodes":[{"id":"1","approvedRoutes":["10.0.0.0/24"]}]}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()
	cli, err := newHeadscaleClient(srv.URL, "test-key", time.Second)
	if err != nil {
		t.Fatal(err)
	}
	if err := setAndVerifyMeshRoutes(context.Background(), cli, "1", []string{}); err == nil {
		t.Fatal("route revocation falsely reported success")
	}
}

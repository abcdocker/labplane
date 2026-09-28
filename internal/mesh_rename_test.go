package internal

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestHeadscaleRenameNodeV028(t *testing.T) {
	meshAllowLoopbackForTest = true
	defer func() { meshAllowLoopbackForTest = false }()
	called := false
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = r.Method == http.MethodPost && r.URL.Path == "/api/v1/node/12/rename/site-router"
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()
	cli, err := newHeadscaleClient(srv.URL, "k", time.Second)
	if err != nil {
		t.Fatal(err)
	}
	if err := cli.RenameNode(context.Background(), "12", "site-router"); err != nil || !called {
		t.Fatalf("rename endpoint wrong: called=%v err=%v", called, err)
	}
}

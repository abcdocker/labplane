package internal

import (
	"net/http"
	"testing"
)

func TestLegacyViewerForbiddenK8sPodsAPI(t *testing.T) {
	cases := []struct {
		method string
		path   string
		want   bool // true = forbidden for legacy viewer
	}{
		{http.MethodGet, "/api/k8s/pods", false},
		{http.MethodHead, "/api/k8s/pods", false},
		{http.MethodGet, "/api/k8s/pods/metrics", false},
		{http.MethodGet, "/api/k8s/pods/resource-efficiency", false},
		{http.MethodGet, "/api/k8s/pods/default/my-pod", false},
		{http.MethodGet, "/api/k8s/pods/default/my-pod/logs", false},
		{http.MethodDelete, "/api/k8s/pods/default/my-pod", true},
		{http.MethodGet, "/api/k8s/pods/default/my-pod/exec/ws", true},
		{http.MethodPost, "/api/k8s/pods", true},
	}
	for _, tc := range cases {
		got := legacyViewerForbiddenK8sPodsAPI(tc.method, tc.path)
		if got != tc.want {
			t.Errorf("%s %s: got %v want %v", tc.method, tc.path, got, tc.want)
		}
	}
}

func TestViewerEndpointForbidden_LegacyPodsReadAllowed(t *testing.T) {
	if viewerEndpointForbidden(http.MethodGet, "/api/k8s/pods") {
		t.Fatal("legacy viewer should allow GET /api/k8s/pods")
	}
	if viewerEndpointForbidden(http.MethodGet, "/api/k8s/pods/ns/x/logs") {
		t.Fatal("legacy viewer should allow GET pod logs path")
	}
	if !viewerEndpointForbidden(http.MethodDelete, "/api/k8s/pods/ns/x") {
		t.Fatal("legacy viewer must forbid DELETE pod")
	}
	if !viewerEndpointForbidden(http.MethodGet, "/api/k8s/pods/ns/x/exec/ws") {
		t.Fatal("legacy viewer must forbid exec websocket path")
	}
}

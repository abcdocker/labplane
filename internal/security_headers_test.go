package internal

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestSecurityHeadersMiddleware(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(securityHeadersMiddleware())
	r.GET("/probe", func(c *gin.Context) { c.String(http.StatusOK, "ok") })

	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/probe", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	cases := []struct{ key, want string }{
		{"X-Content-Type-Options", "nosniff"},
		{"X-Frame-Options", "SAMEORIGIN"},
		{"Referrer-Policy", "strict-origin-when-cross-origin"},
	}
	for _, tc := range cases {
		if got := rec.Header().Get(tc.key); got != tc.want {
			t.Errorf("%s = %q, want %q", tc.key, got, tc.want)
		}
	}
	csp := rec.Header().Get("Content-Security-Policy")
	if csp == "" {
		t.Fatal("Content-Security-Policy 缺失")
	}
	// WebSocket 终端与文档中心 CDN 资源是两类已知依赖，缺失会破坏现有功能。
	for _, must := range []string{"connect-src 'self' ws: wss:", "cdn.jsdelivr.net", "cdnjs.cloudflare.com", "frame-ancestors 'self'"} {
		if !strings.Contains(csp, must) {
			t.Errorf("CSP 缺少片段 %q: %s", must, csp)
		}
	}
}

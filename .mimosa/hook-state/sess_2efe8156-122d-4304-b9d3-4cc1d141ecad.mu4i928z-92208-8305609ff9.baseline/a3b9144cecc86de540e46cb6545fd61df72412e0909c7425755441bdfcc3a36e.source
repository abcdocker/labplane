package internal

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"github.com/gin-gonic/gin"
)

// KUBEBT_API_RESPONSE_CACHE=0 关闭全站 GET JSON 响应 Redis 缓存（默认开启，需 Redis）。
// KUBEBT_API_RESPONSE_CACHE_MAX_BODY_BYTES 单条缓存体上限，默认 1048576（1MiB）。

var apiCacheHit uint64
var apiCacheMiss uint64

func apiResponseCacheHits() uint64 { return atomic.LoadUint64(&apiCacheHit) }
func apiResponseCacheMisses() uint64 { return atomic.LoadUint64(&apiCacheMiss) }

func incAPICacheHit() { atomic.AddUint64(&apiCacheHit, 1) }
func incAPICacheMiss() { atomic.AddUint64(&apiCacheMiss, 1) }

func apiResponseCacheGloballyDisabled() bool {
	return strings.TrimSpace(os.Getenv("KUBEBT_API_RESPONSE_CACHE")) == "0"
}

func apiResponseCacheMaxBody() int {
	n := 1048576
	if s := strings.TrimSpace(os.Getenv("KUBEBT_API_RESPONSE_CACHE_MAX_BODY_BYTES")); s != "" {
		if v, err := strconv.Atoi(s); err == nil && v >= 4096 && v <= 8*1024*1024 {
			n = v
		}
	}
	return n
}

func apiResponseCacheRedisKey(cfg Config, role, path, rawQuery string) string {
	p := strings.TrimSpace(cfg.RedisKeyPrefix)
	if p == "" {
		p = "kubebt:"
	} else if !strings.HasSuffix(p, ":") {
		p += ":"
	}
	h := sha256.Sum256([]byte(strings.TrimSpace(role) + "\x00" + path + "\x00" + rawQuery))
	return p + "apicache:v1:" + hex.EncodeToString(h[:16])
}

// 按路径前缀配置 TTL；越长前缀应写在越前面（先匹配先使用）。
func apiResponseCacheTTL(path string) time.Duration {
	type rule struct {
		prefix string
		ttl    time.Duration
	}
	rules := []rule{
		{"/api/k8s/summary", 18 * time.Second},
		// /api/namespaces 在 PerformanceMode 下已由 handleGetNamespaces 单独写 Redis，避免双写。
		{"/api/k8s/nodes", 22 * time.Second},
		{"/api/k8s/rbac", 60 * time.Second},
		{"/api/k8s/namespace-stats", 35 * time.Second},
		{"/api/k8s/namespaces/stats", 35 * time.Second},
		{"/api/k8s/pod-restarts", 28 * time.Second},
		{"/api/k8s/pod-restart-insights", 35 * time.Second},
		{"/api/k8s/pods/resource-efficiency", 45 * time.Second},
		{"/api/k8s/workloads/resource-advisory", 50 * time.Second},
		{"/api/k8s/pods/metrics", 55 * time.Second},
		{"/api/k8s/addons/status", 90 * time.Second},
		{"/api/runtime/status", 12 * time.Second},
		{"/api/system/check", 20 * time.Second},
		{"/api/harbor/status", 25 * time.Second},
		{"/api/harbor/statistics", 40 * time.Second},
		{"/api/ingresses", 30 * time.Second},
		{"/api/services", 35 * time.Second},
		{"/api/status", 25 * time.Second},
	}
	for _, r := range rules {
		if strings.HasPrefix(path, r.prefix) {
			return r.ttl
		}
	}
	return 0
}

type responseCacheWriter struct {
	gin.ResponseWriter
	buf    *bytes.Buffer
	status int
	max    int
}

func (w *responseCacheWriter) WriteHeader(statusCode int) {
	w.status = statusCode
	w.ResponseWriter.WriteHeader(statusCode)
}

func (w *responseCacheWriter) Write(b []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}
	if w.buf != nil && w.buf.Len() < w.max {
		w.buf.Write(b)
	}
	return w.ResponseWriter.Write(b)
}

// apiResponseCacheMiddleware 对安全只读 GET JSON 做短 TTL Redis 缓存（按路径+Query+角色区分）。
func apiResponseCacheMiddleware(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		if apiResponseCacheGloballyDisabled() {
			c.Next()
			return
		}
		if c.Request.Method != http.MethodGet {
			c.Next()
			return
		}
		if strings.TrimSpace(c.GetHeader("Cache-Control")) == "no-cache" || c.Query("nocache") == "1" {
			c.Next()
			return
		}
		path := c.Request.URL.Path
		ttl := apiResponseCacheTTL(path)
		if ttl <= 0 {
			c.Next()
			return
		}
		rdb := app.Redis()
		if rdb == nil {
			c.Next()
			return
		}
		role := getDashboardRoleFromGin(c)
		key := apiResponseCacheRedisKey(app.Cfg(), role, path, c.Request.URL.RawQuery)
		ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
		defer cancel()
		if raw, err := rdb.Get(ctx, key); err == nil && strings.TrimSpace(raw) != "" {
			incAPICacheHit()
			c.Data(http.StatusOK, "application/json; charset=utf-8", []byte(raw))
			c.Abort()
			return
		}
		incAPICacheMiss()
		maxB := apiResponseCacheMaxBody()
		buf := &bytes.Buffer{}
		cw := &responseCacheWriter{ResponseWriter: c.Writer, buf: buf, max: maxB}
		c.Writer = cw
		c.Next()
		if cw.status != http.StatusOK || buf.Len() == 0 || buf.Len() >= maxB {
			return
		}
		ct := strings.ToLower(cw.Header().Get("Content-Type"))
		if !strings.Contains(ct, "json") {
			return
		}
		stashCtx, stashCancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer stashCancel()
		_ = rdb.Set(stashCtx, key, buf.Bytes(), ttl)
	}
}

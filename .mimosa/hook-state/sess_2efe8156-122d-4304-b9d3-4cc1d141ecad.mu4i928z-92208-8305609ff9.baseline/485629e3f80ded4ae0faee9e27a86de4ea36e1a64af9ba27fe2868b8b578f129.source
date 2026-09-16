package internal

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const registryTagsHTTPTimeout = 18 * time.Second

// FetchRedisImageTags 拉取 redis 镜像可用标签：registryPrefix 为空时用 Docker Hub 公共 API；否则用 OCI /v2/.../tags/list（匿名，仅当仓库允许匿名列举时可用）。
func FetchRedisImageTags(ctx context.Context, registryPrefix string) ([]string, string, error) {
	reg := strings.TrimSpace(registryPrefix)
	if reg == "" {
		tags, err := fetchDockerHubRedisTags(ctx)
		return tags, "docker-hub", err
	}
	tags, err := fetchOCIRepositoryTags(ctx, reg)
	return tags, "registry-v2", err
}

func fetchDockerHubRedisTags(ctx context.Context) ([]string, error) {
	u := "https://hub.docker.com/v2/repositories/library/redis/tags?page_size=100"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	client := &http.Client{Timeout: registryTagsHTTPTimeout}
	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	body, err := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if err != nil {
		return nil, err
	}
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Docker Hub HTTP %d", res.StatusCode)
	}
	var parsed struct {
		Results []struct {
			Name string `json:"name"`
		} `json:"results"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, err
	}
	out := make([]string, 0, len(parsed.Results))
	for _, r := range parsed.Results {
		if strings.TrimSpace(r.Name) != "" {
			out = append(out, r.Name)
		}
	}
	sort.Strings(out)
	return out, nil
}

func ociRedisRepositoryPath(registryPrefix string) string {
	reg := strings.TrimSpace(strings.TrimRight(registryPrefix, "/"))
	if reg == "" {
		return "library/redis"
	}
	idx := strings.IndexByte(reg, '/')
	if idx < 0 {
		return "redis"
	}
	return reg[idx+1:] + "/redis"
}

func fetchOCIRepositoryTags(ctx context.Context, registryPrefix string) ([]string, error) {
	repoPath := ociRedisRepositoryPath(registryPrefix)
	reg := strings.TrimSpace(strings.TrimRight(registryPrefix, "/"))
	host := reg
	if i := strings.IndexByte(reg, '/'); i >= 0 {
		host = reg[:i]
	}
	u := fmt.Sprintf("https://%s/v2/%s/tags/list", host, repoPath)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	client := &http.Client{Timeout: registryTagsHTTPTimeout}
	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	body, err := io.ReadAll(io.LimitReader(res.Body, 2<<20))
	if err != nil {
		return nil, err
	}
	if res.StatusCode == http.StatusUnauthorized || res.StatusCode == http.StatusForbidden {
		return nil, fmt.Errorf("registry 返回 %d：私有项目需仓库匿名可读或在界面手动填写镜像标签", res.StatusCode)
	}
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("registry HTTP %d", res.StatusCode)
	}
	var parsed struct {
		Tags []string `json:"tags"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, err
	}
	out := append([]string(nil), parsed.Tags...)
	sort.Strings(out)
	return out, nil
}

func handleAppRedisRegistryTags(c *gin.Context, app *ServerApp) {
	prefix := strings.TrimSpace(c.Query("registryPrefix"))
	if prefix == "" {
		prefix = strings.TrimSpace(app.Cfg().RedisImageRegistry)
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), registryTagsHTTPTimeout+2*time.Second)
	defer cancel()
	tags, source, err := FetchRedisImageTags(ctx, prefix)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"tags":       []string{},
			"source":     source,
			"error":      err.Error(),
			"harborHint": prefix == "",
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"tags":       tags,
		"source":     source,
		"harborHint": prefix == "",
	})
}

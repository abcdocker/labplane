package internal

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"strconv"
	"strings"
	"sync/atomic"
)

// HarborImageIndexEntry 一条可拉取的镜像引用（细到 tag）。
type HarborImageIndexEntry struct {
	Project  string `json:"project"`
	Repo     string `json:"repo"`     // 相对 project 的仓库路径（与 Harbor API 一致）
	Tag      string `json:"tag"`      // 空表示仅 digest
	Digest   string `json:"digest,omitempty"`
	PushTime string `json:"pushTime,omitempty"`
	Reference string `json:"reference"` // registry/project/repo:tag
}

type harborImageIndexPayload struct {
	V       int                     `json:"v"`
	Entries []HarborImageIndexEntry `json:"entries"`
}

type harborImageIndexMeta struct {
	UpdatedAt        string `json:"updatedAt"`
	LastDurationMs   int64  `json:"lastDurationMs"`
	EntryCount       int    `json:"entryCount"`
	ContentSHA256    string `json:"contentSha256,omitempty"`
	LastError        string `json:"lastError,omitempty"`
	LastErrorAt      string `json:"lastErrorAt,omitempty"`
	SkippedIdentical bool   `json:"skippedIdentical,omitempty"`
	RegistryHost     string `json:"registryHost,omitempty"`
}

// HarborImageIndexProgress Redis 中的同步进度（供控制台轮询）。
type HarborImageIndexProgress struct {
	State          string `json:"state"` // running, idle, error
	Phase          string `json:"phase"` // listing_projects, crawling, writing_redis, idle
	Message        string `json:"message,omitempty"`
	ProjectsTotal  int    `json:"projectsTotal"`
	ProjectsDone   int    `json:"projectsDone"`
	ReposScanned   int    `json:"reposScanned"`
	TagsIndexed    int    `json:"tagsIndexed"` // 索引行数（含无 tag 的 digest 行）
	CurrentProject string `json:"currentProject,omitempty"`
	CurrentRepo    string `json:"currentRepo,omitempty"`
	StartedAt      string `json:"startedAt,omitempty"`
	FinishedAt     string `json:"finishedAt,omitempty"`
	PercentApprox  int    `json:"percentApprox"`
	LastError      string `json:"lastError,omitempty"`
}

func harborIndexRedisPayloadKey(cfg Config) string {
	return harborCacheRedisPrefix(cfg) + "harbor:ix:" + harborCacheInstanceTag(cfg) + ":payload"
}

func harborIndexRedisMetaKey(cfg Config) string {
	return harborCacheRedisPrefix(cfg) + "harbor:ix:" + harborCacheInstanceTag(cfg) + ":meta"
}

func harborIndexRedisProgressKey(cfg Config) string {
	return harborCacheRedisPrefix(cfg) + "harbor:ix:" + harborCacheInstanceTag(cfg) + ":progress"
}

func harborIndexProjectConcurrency() int {
	n := 4
	if s := strings.TrimSpace(os.Getenv("KUBEBT_HARBOR_INDEX_PROJECT_CONCURRENCY")); s != "" {
		if x, err := strconv.Atoi(s); err == nil && x >= 1 && x <= 32 {
			n = x
		}
	}
	return n
}

func harborIndexIntervalSec() int {
	sec := 60
	if s := strings.TrimSpace(os.Getenv("KUBEBT_HARBOR_INDEX_INTERVAL_SEC")); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n >= 0 {
			sec = n
		}
	}
	return sec
}

func harborIndexCrawlTimeoutSec() int {
	sec := 900
	if s := strings.TrimSpace(os.Getenv("KUBEBT_HARBOR_INDEX_CRAWL_TIMEOUT_SEC")); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n >= 60 && n <= 7200 {
			sec = n
		}
	}
	return sec
}

func harborIndexMaxRepoPages() int {
	n := 100
	if s := strings.TrimSpace(os.Getenv("KUBEBT_HARBOR_INDEX_MAX_REPO_PAGES")); s != "" {
		if x, err := strconv.Atoi(s); err == nil && x >= 1 && x <= 500 {
			n = x
		}
	}
	return n
}

func harborIndexMaxArtifactPages() int {
	n := 50
	if s := strings.TrimSpace(os.Getenv("KUBEBT_HARBOR_INDEX_MAX_ARTIFACT_PAGES")); s != "" {
		if x, err := strconv.Atoi(s); err == nil && x >= 1 && x <= 200 {
			n = x
		}
	}
	return n
}

func harborIndexMaxProjectPages() int {
	n := 100
	if s := strings.TrimSpace(os.Getenv("KUBEBT_HARBOR_INDEX_MAX_PROJECT_PAGES")); s != "" {
		if x, err := strconv.Atoi(s); err == nil && x >= 1 && x <= 500 {
			n = x
		}
	}
	return n
}

var harborIndexRunning atomic.Bool

func harborImageReference(host, project, repo, tag string) string {
	host = strings.TrimSpace(host)
	project = strings.Trim(strings.TrimSpace(project), "/")
	repo = strings.Trim(strings.TrimSpace(repo), "/")
	tag = strings.TrimSpace(tag)
	if host == "" || project == "" || repo == "" {
		return ""
	}
	if tag == "" {
		return host + "/" + project + "/" + repo
	}
	if strings.HasPrefix(tag, "sha256:") {
		return host + "/" + project + "/" + repo + "@" + tag
	}
	return host + "/" + project + "/" + repo + ":" + tag
}

func harborIndexSearchMatch(entry *HarborImageIndexEntry, tokens []string) bool {
	if entry == nil || len(tokens) == 0 {
		return true
	}
	hay := strings.ToLower(strings.TrimSpace(entry.Project) + " " + strings.TrimSpace(entry.Repo) + " " +
		strings.TrimSpace(entry.Tag) + " " + strings.TrimSpace(entry.Reference) + " " + strings.TrimSpace(entry.Digest))
	for _, t := range tokens {
		t = strings.TrimSpace(strings.ToLower(t))
		if t == "" {
			continue
		}
		if !strings.Contains(hay, t) {
			return false
		}
	}
	return true
}

func harborIndexSearchTokenize(q string) []string {
	q = strings.TrimSpace(q)
	if q == "" {
		return nil
	}
	var out []string
	for _, p := range strings.Fields(q) {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func harborIndexPayloadHashJSON(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

// harborIndexReadPayloadFromRedis 从 Redis 读取索引快照（仅 GET，供查询接口使用）。
func harborIndexReadPayloadFromRedis(ctx context.Context, rdb *RedisLight, cfg Config) (*harborImageIndexPayload, *harborImageIndexMeta, error) {
	if rdb == nil {
		return nil, nil, errHarborIndexRedisUnavailable
	}
	raw, err := rdb.Get(ctx, harborIndexRedisPayloadKey(cfg))
	if err != nil {
		return nil, nil, err
	}
	if strings.TrimSpace(raw) == "" {
		return nil, nil, errors.New("索引尚未写入")
	}
	var p harborImageIndexPayload
	if json.Unmarshal([]byte(raw), &p) != nil {
		return nil, nil, errors.New("索引数据损坏")
	}
	metaRaw, _ := rdb.Get(ctx, harborIndexRedisMetaKey(cfg))
	var m harborImageIndexMeta
	if strings.TrimSpace(metaRaw) != "" {
		_ = json.Unmarshal([]byte(metaRaw), &m)
	}
	return &p, &m, nil
}

var errHarborIndexRedisUnavailable = errors.New("Redis 未连接")

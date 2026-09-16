package internal

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const openSearchHTTPTimeout = 45 * time.Second

var errOpenSearchNoBaseURL = errors.New("实例未配置可访问的 OpenSearch HTTP 地址（internalHttp）")

func openSearchBaseURLFromInstanceConfigJSON(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", errOpenSearchNoBaseURL
	}
	var m map[string]interface{}
	if err := json.Unmarshal([]byte(raw), &m); err != nil {
		return "", fmt.Errorf("解析实例配置: %w", err)
	}
	for _, k := range []string{"internalHttp", "vectorOpenSearchUrl"} {
		if v, ok := m[k].(string); ok {
			s := strings.TrimSpace(v)
			if s != "" {
				return openSearchNormalizeBaseURL(s)
			}
		}
	}
	return "", errOpenSearchNoBaseURL
}

func openSearchNormalizeBaseURL(s string) (string, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return "", errOpenSearchNoBaseURL
	}
	u, err := url.Parse(s)
	if err != nil {
		return "", fmt.Errorf("无效的 OpenSearch 地址: %w", err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return "", errors.New("OpenSearch 地址仅支持 http/https")
	}
	if strings.TrimSpace(u.Host) == "" {
		return "", errors.New("OpenSearch 地址缺少主机名")
	}
	// 禁止向其它内网任意地址转发（配置必须来自已登记实例）
	u.Path = strings.TrimRight(u.Path, "/")
	u.RawQuery = ""
	u.Fragment = ""
	return u.String(), nil
}

func openSearchDo(ctx context.Context, baseURL, method, path string, body []byte) (int, []byte, string, error) {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	path = strings.TrimSpace(path)
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	full := baseURL + path
	req, err := http.NewRequestWithContext(ctx, method, full, bytes.NewReader(body))
	if err != nil {
		return 0, nil, "", err
	}
	if len(body) > 0 {
		req.Header.Set("Content-Type", "application/json")
	}
	cli := &http.Client{Timeout: openSearchHTTPTimeout}
	resp, err := cli.Do(req)
	if err != nil {
		return 0, nil, "", err
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return resp.StatusCode, nil, "", err
	}
	ct := resp.Header.Get("Content-Type")
	return resp.StatusCode, b, ct, nil
}

func openSearchIndexPathSegment(index string) string {
	return url.PathEscape(strings.TrimSpace(index))
}

// openSearchCatIndices 返回 _cat/indices JSON 行数组。
func openSearchCatIndices(ctx context.Context, base string) ([]map[string]interface{}, error) {
	code, b, _, err := openSearchDo(ctx, base, http.MethodGet, "/_cat/indices?format=json&bytes=b", nil)
	if err != nil {
		return nil, err
	}
	if code < 200 || code >= 300 {
		return nil, fmt.Errorf("OpenSearch HTTP %d: %s", code, openSearchTruncateStr(string(b), 500))
	}
	var rows []map[string]interface{}
	if err := json.Unmarshal(b, &rows); err != nil {
		return nil, fmt.Errorf("解析索引列表: %w", err)
	}
	return rows, nil
}

func openSearchIndexCreationMillis(ctx context.Context, base, index string) (int64, error) {
	p := "/" + openSearchIndexPathSegment(index) + "/_settings?flat_settings=true&include_defaults=false"
	code, b, _, err := openSearchDo(ctx, base, http.MethodGet, p, nil)
	if err != nil {
		return 0, err
	}
	if code < 200 || code >= 300 {
		return 0, fmt.Errorf("OpenSearch HTTP %d", code)
	}
	var root map[string]json.RawMessage
	if err := json.Unmarshal(b, &root); err != nil {
		return 0, err
	}
	raw, ok := root[index]
	if !ok && len(root) == 1 {
		for _, v := range root {
			raw = v
			ok = true
			break
		}
	}
	if !ok {
		return 0, errors.New("settings 响应缺少索引键")
	}
	var wrap struct {
		Settings struct {
			Index struct {
				CreationDate string `json:"creation_date"`
			} `json:"index"`
		} `json:"settings"`
	}
	if err := json.Unmarshal(raw, &wrap); err != nil {
		return 0, err
	}
	ms := strings.TrimSpace(wrap.Settings.Index.CreationDate)
	if ms == "" {
		return 0, errors.New("无 creation_date")
	}
	n, err := strconv.ParseInt(ms, 10, 64)
	if err != nil {
		return 0, err
	}
	return n, nil
}

type openSearchPruneInput struct {
	Pattern       string `json:"pattern"`
	OlderThanDays int    `json:"olderThanDays"`
	DryRun        bool   `json:"dryRun"`
}

type openSearchPruneResult struct {
	DryRun         bool                `json:"dryRun"`
	Pattern        string              `json:"pattern"`
	OlderThanDays  int                 `json:"olderThanDays"`
	CutoffRFC3339  string              `json:"cutoffRFC3339"`
	Evaluated      int                 `json:"evaluated"`
	MatchedPattern int                 `json:"matchedPattern"`
	Deleted        []string            `json:"deleted,omitempty"`
	Skipped        []map[string]string `json:"skipped,omitempty"`
	WouldDelete    []string            `json:"wouldDelete,omitempty"`
	Errors         []string            `json:"errors,omitempty"`
}

func openSearchPruneIndices(ctx context.Context, base string, in openSearchPruneInput) (*openSearchPruneResult, error) {
	pat := strings.TrimSpace(in.Pattern)
	if pat == "" {
		return nil, errors.New("pattern 不能为空（如 kubebt-vmlog-*）")
	}
	if in.OlderThanDays < 1 {
		return nil, errors.New("olderThanDays 须 >= 1")
	}
	cutoff := time.Now().UTC().AddDate(0, 0, -in.OlderThanDays)
	out := &openSearchPruneResult{
		DryRun:        in.DryRun,
		Pattern:       pat,
		OlderThanDays: in.OlderThanDays,
		CutoffRFC3339: cutoff.Format(time.RFC3339),
	}
	rows, err := openSearchCatIndices(ctx, base)
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		idx, _ := row["index"].(string)
		idx = strings.TrimSpace(idx)
		if idx == "" {
			continue
		}
		out.Evaluated++
		ok, err := filepath.Match(pat, idx)
		if err != nil || !ok {
			continue
		}
		out.MatchedPattern++
		ms, err := openSearchIndexCreationMillis(ctx, base, idx)
		if err != nil {
			out.Skipped = append(out.Skipped, map[string]string{"index": idx, "reason": err.Error()})
			continue
		}
		created := time.UnixMilli(ms).UTC()
		if !created.Before(cutoff) {
			continue
		}
		if in.DryRun {
			out.WouldDelete = append(out.WouldDelete, idx)
			continue
		}
		delPath := "/" + openSearchIndexPathSegment(idx)
		code, body, _, derr := openSearchDo(ctx, base, http.MethodDelete, delPath, nil)
		if derr != nil {
			out.Errors = append(out.Errors, fmt.Sprintf("%s: %v", idx, derr))
			continue
		}
		if code < 200 || code >= 300 {
			out.Errors = append(out.Errors, fmt.Sprintf("%s: HTTP %d %s", idx, code, openSearchTruncateStr(string(body), 200)))
			continue
		}
		out.Deleted = append(out.Deleted, idx)
	}
	return out, nil
}

func openSearchTruncateStr(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

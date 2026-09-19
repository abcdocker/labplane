package internal

import (
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const maxGrafanaDashboardBytes = 900_000

func grafanaHTTPClient(skipTLS bool) *http.Client {
	tr := &http.Transport{
		TLSClientConfig: &tls.Config{
			InsecureSkipVerify: skipTLS,
			MinVersion:         tls.VersionTLS12,
		},
	}
	return &http.Client{Timeout: 120 * time.Second, Transport: tr}
}

// SyncGrafanaDashboards 从 Grafana 拉取看板列表与 JSON，写入 dataDir/ops_grafana/<uid>.json。
func SyncGrafanaDashboards(app *ServerApp, cfg Config, meta *OpsGrafanaMeta, plainPassword string) error {
	base := strings.TrimRight(strings.TrimSpace(meta.BaseURL), "/")
	if base == "" {
		return fmt.Errorf("缺少 Grafana 地址")
	}
	u, err := url.Parse(base)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return fmt.Errorf("Grafana 地址无效")
	}
	user := strings.TrimSpace(meta.User)
	mode := strings.ToLower(strings.TrimSpace(meta.AuthMode))
	if mode == "" {
		mode = "basic"
	}
	if mode == "api_token" {
		if strings.TrimSpace(plainPassword) == "" {
			return fmt.Errorf("缺少 Grafana API Token（请在密码框保存 Token）")
		}
	} else {
		if user == "" || plainPassword == "" {
			return fmt.Errorf("缺少 Grafana 用户名或密码")
		}
	}
	dir := filepath.Join(app.DataDir(), "ops_grafana")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	cli := grafanaHTTPClient(meta.SkipTLSVerify)
	searchURL := base + "/api/search?type=dash-db&limit=5000"
	req, err := http.NewRequest(http.MethodGet, searchURL, nil)
	if err != nil {
		return err
	}
	applyGrafanaHTTPAuth(req, meta, user, plainPassword)
	resp, err := cli.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	if resp.StatusCode >= 400 {
		return fmt.Errorf("Grafana search %d: %s", resp.StatusCode, opsTruncateStr(string(body), 400))
	}
	var refs []struct {
		UID   string `json:"uid"`
		Title string `json:"title"`
		URI   string `json:"uri"`
	}
	if err := json.Unmarshal(body, &refs); err != nil {
		return err
	}
	meta.Dashboards = nil
	meta.LastSyncErr = ""
	for _, r := range refs {
		if strings.TrimSpace(r.UID) == "" {
			continue
		}
		dashURL := base + "/api/dashboards/uid/" + url.PathEscape(r.UID)
		req2, err := http.NewRequest(http.MethodGet, dashURL, nil)
		if err != nil {
			meta.LastSyncErr = err.Error()
			break
		}
		applyGrafanaHTTPAuth(req2, meta, user, plainPassword)
		resp2, err := cli.Do(req2)
		if err != nil {
			meta.LastSyncErr = err.Error()
			break
		}
		b2, err := io.ReadAll(resp2.Body)
		resp2.Body.Close()
		if err != nil {
			meta.LastSyncErr = err.Error()
			break
		}
		if resp2.StatusCode >= 400 {
			meta.LastSyncErr = fmt.Sprintf("uid=%s: %d", r.UID, resp2.StatusCode)
			continue
		}
		if len(b2) > maxGrafanaDashboardBytes {
			meta.LastSyncErr = fmt.Sprintf("看板 %s 过大，已跳过", r.UID)
			continue
		}
		fp := filepath.Join(dir, r.UID+".json")
		if err := os.WriteFile(fp, b2, 0o600); err != nil {
			meta.LastSyncErr = err.Error()
			break
		}
		meta.Dashboards = append(meta.Dashboards, grafanaDashboardRef{
			UID: r.UID, Title: r.Title, URI: r.URI,
		})
	}
	meta.LastSyncAt = time.Now().UTC().Format(time.RFC3339)
	return saveOpsGrafanaMeta(app.PlatformKV(), *meta)
}

func applyGrafanaHTTPAuth(req *http.Request, meta *OpsGrafanaMeta, user, plain string) {
	mode := strings.ToLower(strings.TrimSpace(meta.AuthMode))
	if mode == "" {
		mode = "basic"
	}
	if mode == "api_token" {
		t := strings.TrimSpace(plain)
		if t != "" {
			req.Header.Set("Authorization", "Bearer "+t)
		}
		return
	}
	u := strings.TrimSpace(user)
	if u != "" && plain != "" {
		req.SetBasicAuth(u, plain)
	}
}

func readGrafanaDashboardFile(app *ServerApp, uid string) ([]byte, error) {
	uid = strings.TrimSpace(uid)
	if uid == "" {
		return nil, fmt.Errorf("empty uid")
	}
	fp := filepath.Join(app.DataDir(), "ops_grafana", uid+".json")
	return os.ReadFile(fp)
}

func opsTruncateStr(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

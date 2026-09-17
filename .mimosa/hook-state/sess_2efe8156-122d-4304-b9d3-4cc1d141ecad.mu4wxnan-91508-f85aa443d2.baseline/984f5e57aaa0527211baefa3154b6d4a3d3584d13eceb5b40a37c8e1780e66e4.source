package internal

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	sigyaml "sigs.k8s.io/yaml"
)

// ErrK8sRevisionNotFound 列表/详情/回退时未找到指定修订。
var ErrK8sRevisionNotFound = errors.New("k8s object revision not found")

const (
	maxK8sObjectRevisionYAMLBytes = 768 << 10 // 768KiB per snapshot
	maxK8sObjectRevisionsKeep     = 50
	k8sObjectRevisionSubdir       = "k8s_object_revisions"
)

// K8sObjectRevisionMeta 列表项（不含完整 YAML，避免响应过大）。
type K8sObjectRevisionMeta struct {
	ID     string `json:"id"`
	Ts     string `json:"ts"`
	User   string `json:"user"`
	Source string `json:"source"`
}

type k8sObjectRevisionRecord struct {
	K8sObjectRevisionMeta
	YAML string `json:"yaml"`
}

var k8sObjectRevisionWriteMu sync.Mutex

func k8sObjectRevisionFilePath(dataDir, namespace, kind, name string) (string, error) {
	if dataDir == "" {
		return "", fmt.Errorf("dataDir 为空")
	}
	ns := revisionPathSeg(namespace)
	k := revisionPathSeg(kind)
	n := revisionPathSeg(name)
	if ns == "" || k == "" || n == "" {
		return "", fmt.Errorf("无效的 namespace/kind/name")
	}
	dir := filepath.Join(dataDir, k8sObjectRevisionSubdir, ns, k)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return "", err
	}
	return filepath.Join(dir, n+".jsonl"), nil
}

func revisionPathSeg(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		switch r {
		case '/', '\\', ':', '\x00':
			b.WriteByte('_')
		default:
			if r < 32 {
				b.WriteByte('_')
			} else {
				b.WriteRune(r)
			}
		}
	}
	out := b.String()
	if out == "." || out == ".." {
		return "_"
	}
	return out
}

// k8sYAMLResourceMeta 从单段 YAML 解析 kind / namespace / name（用于修订文件路径）。
func k8sYAMLResourceMeta(doc string) (kind, namespace, name string, ok bool) {
	doc = strings.TrimSpace(doc)
	if doc == "" {
		return "", "", "", false
	}
	var root map[string]interface{}
	if err := sigyaml.Unmarshal([]byte(doc), &root); err != nil {
		return "", "", "", false
	}
	k, _ := root["kind"].(string)
	if k == "" {
		return "", "", "", false
	}
	md, _ := root["metadata"].(map[string]interface{})
	if md == nil {
		return "", "", "", false
	}
	nm, _ := md["name"].(string)
	if nm == "" {
		return "", "", "", false
	}
	ns, _ := md["namespace"].(string)
	if k == "Namespace" {
		return k, "_", nm, true
	}
	if ns == "" {
		ns = "default"
	}
	return k, ns, nm, true
}

// K8sAppendObjectRevisionsFromYAML 在成功 apply 后按文档记录修订（含 kind: List 展开）。
func K8sAppendObjectRevisionsFromYAML(app *ServerApp, user, source, doc string) {
	if app == nil || strings.TrimSpace(doc) == "" {
		return
	}
	doc = normalizeYAMLDocument(doc)
	if doc == "" {
		return
	}
	doc = ensureKubernetesYAMLGVK(doc)
	k := kubernetesYAMLKind(doc)
	if k == "" {
		return
	}
	if k == "List" {
		var root map[string]interface{}
		if err := sigyaml.Unmarshal([]byte(doc), &root); err != nil {
			return
		}
		raw, ok := root["items"].([]interface{})
		if !ok {
			return
		}
		for _, it := range raw {
			b, err := sigyaml.Marshal(it)
			if err != nil {
				continue
			}
			K8sAppendObjectRevisionsFromYAML(app, user, source, string(b))
		}
		return
	}
	kind, ns, name, ok := k8sYAMLResourceMeta(doc)
	if !ok {
		return
	}
	_ = k8sObjectRevisionAppend(app, kind, ns, name, user, source, doc)
}

func k8sObjectRevisionAppend(app *ServerApp, kind, namespace, name, user, source, yamlContent string) error {
	if app == nil {
		return fmt.Errorf("app 为空")
	}
	if app.MySQLDB() != nil {
		return k8sObjectRevisionAppendMySQL(context.Background(), app, kind, namespace, name, user, source, yamlContent)
	}
	return k8sObjectRevisionAppendFile(app.DataDir(), kind, namespace, name, user, source, yamlContent)
}

func k8sObjectRevisionAppendFile(dataDir, kind, namespace, name, user, source, yamlContent string) error {
	yamlContent = strings.TrimSpace(yamlContent)
	if yamlContent == "" {
		return nil
	}
	if len(yamlContent) > maxK8sObjectRevisionYAMLBytes {
		yamlContent = yamlContent[:maxK8sObjectRevisionYAMLBytes]
	}
	path, err := k8sObjectRevisionFilePath(dataDir, namespace, kind, name)
	if err != nil {
		return err
	}

	k8sObjectRevisionWriteMu.Lock()
	defer k8sObjectRevisionWriteMu.Unlock()

	existing, rerr := k8sObjectRevisionReadAllRecords(path)
	if rerr != nil && !os.IsNotExist(rerr) {
		return rerr
	}
	if len(existing) > 0 {
		last := existing[len(existing)-1]
		if strings.TrimSpace(last.YAML) == yamlContent {
			return nil
		}
	}

	id := fmt.Sprintf("%d", time.Now().UnixNano())
	ts := time.Now().UTC().Format(time.RFC3339Nano)
	rec := k8sObjectRevisionRecord{
		K8sObjectRevisionMeta: K8sObjectRevisionMeta{ID: id, Ts: ts, User: strings.TrimSpace(user), Source: strings.TrimSpace(source)},
		YAML:                  yamlContent,
	}
	lines := make([]string, 0, len(existing)+1)
	start := 0
	if len(existing) >= maxK8sObjectRevisionsKeep {
		start = len(existing) - (maxK8sObjectRevisionsKeep - 1)
	}
	for i := start; i < len(existing); i++ {
		b, err := json.Marshal(existing[i])
		if err != nil {
			continue
		}
		lines = append(lines, string(b))
	}
	b, err := json.Marshal(rec)
	if err != nil {
		return err
	}
	lines = append(lines, string(b))
	return os.WriteFile(path, []byte(strings.Join(lines, "\n")+"\n"), 0600)
}

func k8sObjectRevisionReadAllRecords(path string) ([]k8sObjectRevisionRecord, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	var out []k8sObjectRevisionRecord
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}
		var rec k8sObjectRevisionRecord
		if json.Unmarshal([]byte(line), &rec) != nil || rec.ID == "" {
			continue
		}
		out = append(out, rec)
	}
	return out, sc.Err()
}

// K8sListObjectRevisionMeta 返回该资源全部修订元数据（时间正序）。已配置 MySQL 时走库 + Redis 元数据缓存；否则读本地 jsonl。
func K8sListObjectRevisionMeta(app *ServerApp, namespace, kind, name string) ([]K8sObjectRevisionMeta, error) {
	if app == nil {
		return nil, fmt.Errorf("app 为空")
	}
	if app.MySQLDB() != nil {
		return k8sObjectRevisionListMetaMySQL(context.Background(), app, namespace, kind, name)
	}
	return k8sListObjectRevisionMetaFile(app.DataDir(), namespace, kind, name)
}

func k8sListObjectRevisionMetaFile(dataDir, namespace, kind, name string) ([]K8sObjectRevisionMeta, error) {
	path, err := k8sObjectRevisionFilePath(dataDir, namespace, kind, name)
	if err != nil {
		return nil, err
	}
	recs, err := k8sObjectRevisionReadAllRecords(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	out := make([]K8sObjectRevisionMeta, len(recs))
	for i := range recs {
		out[i] = recs[i].K8sObjectRevisionMeta
	}
	return out, nil
}

// K8sGetObjectRevisionYAML 按 id 取 YAML。
func K8sGetObjectRevisionYAML(app *ServerApp, namespace, kind, name, id string) (string, K8sObjectRevisionMeta, error) {
	var zero K8sObjectRevisionMeta
	if app == nil {
		return "", zero, fmt.Errorf("app 为空")
	}
	if app.MySQLDB() != nil {
		return k8sObjectRevisionGetYAMLMySQL(context.Background(), app, namespace, kind, name, id)
	}
	yamlStr, meta, err := k8sGetObjectRevisionYAMLFile(app.DataDir(), namespace, kind, name, id)
	if err != nil {
		if os.IsNotExist(err) {
			return "", zero, ErrK8sRevisionNotFound
		}
		return "", zero, err
	}
	return yamlStr, meta, nil
}

func k8sGetObjectRevisionYAMLFile(dataDir, namespace, kind, name, id string) (string, K8sObjectRevisionMeta, error) {
	var zero K8sObjectRevisionMeta
	path, err := k8sObjectRevisionFilePath(dataDir, namespace, kind, name)
	if err != nil {
		return "", zero, err
	}
	recs, err := k8sObjectRevisionReadAllRecords(path)
	if err != nil {
		if os.IsNotExist(err) {
			return "", zero, os.ErrNotExist
		}
		return "", zero, err
	}
	id = strings.TrimSpace(id)
	for i := len(recs) - 1; i >= 0; i-- {
		if recs[i].ID == id {
			return recs[i].YAML, recs[i].K8sObjectRevisionMeta, nil
		}
	}
	return "", zero, os.ErrNotExist
}

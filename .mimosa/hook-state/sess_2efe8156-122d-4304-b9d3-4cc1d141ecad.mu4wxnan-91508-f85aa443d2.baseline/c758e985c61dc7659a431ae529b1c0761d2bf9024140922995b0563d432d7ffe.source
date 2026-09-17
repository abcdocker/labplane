package internal

import (
	"regexp"
	"strings"

	sigyaml "sigs.k8s.io/yaml"
)

var k8sYAMLKindLineRE = regexp.MustCompile(`(?m)^[\t ]*kind\s*:\s*([^#\n]+)`)

func trimUTF8BOM(s string) string {
	return strings.TrimPrefix(s, "\uFEFF")
}

// normalizeYAMLDocument 去掉 BOM、统一换行、顶部的 --- 与整行注释（常见于 Helm `---` + `# Source:` 分隔的多段清单）。
func normalizeYAMLDocument(doc string) string {
	doc = trimUTF8BOM(strings.TrimSpace(doc))
	doc = strings.ReplaceAll(doc, "\r\n", "\n")
	doc = strings.ReplaceAll(doc, "\r", "\n")
	for {
		doc = strings.TrimSpace(doc)
		if doc == "" {
			return ""
		}
		if strings.HasPrefix(doc, "---") {
			doc = strings.TrimSpace(strings.TrimPrefix(doc, "---"))
			continue
		}
		idx := strings.IndexByte(doc, '\n')
		var first, rest string
		if idx < 0 {
			first = doc
			rest = ""
		} else {
			first = doc[:idx]
			rest = doc[idx+1:]
		}
		first = strings.TrimSpace(first)
		if first == "" {
			doc = rest
			continue
		}
		if strings.HasPrefix(first, "#") {
			doc = rest
			continue
		}
		break
	}
	return doc
}

// kubernetesYAMLKind 解析顶格/常规缩进的 kind；Helm 注释头、BOM、前导 --- 已由 normalizeYAMLDocument 处理。
func kubernetesYAMLKind(doc string) string {
	doc = normalizeYAMLDocument(doc)
	if doc == "" {
		return ""
	}
	var meta struct {
		Kind string `json:"kind" yaml:"kind"`
	}
	if err := sigyaml.Unmarshal([]byte(doc), &meta); err == nil {
		if k := strings.TrimSpace(meta.Kind); k != "" {
			return k
		}
	}
	var m map[string]interface{}
	if err := sigyaml.Unmarshal([]byte(doc), &m); err == nil {
		if k, ok := m["kind"].(string); ok && strings.TrimSpace(k) != "" {
			return strings.TrimSpace(k)
		}
		if k, ok := m["Kind"].(string); ok && strings.TrimSpace(k) != "" {
			return strings.TrimSpace(k)
		}
	}
	if sub := k8sYAMLKindLineRE.FindStringSubmatch(doc); len(sub) > 1 {
		v := strings.TrimSpace(sub[1])
		v = strings.Trim(v, "\"'")
		if v != "" {
			return v
		}
	}
	return ""
}

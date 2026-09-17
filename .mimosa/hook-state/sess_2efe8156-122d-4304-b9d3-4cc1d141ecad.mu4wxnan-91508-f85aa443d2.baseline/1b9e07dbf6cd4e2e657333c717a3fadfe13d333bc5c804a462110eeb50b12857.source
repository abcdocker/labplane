package internal

import (
	"regexp"
	"strings"
)

// FriendlyIngressApplyError 将 admission webhook 等错误转成可读中文。
func FriendlyIngressApplyError(err error) string {
	if err == nil {
		return ""
	}
	s := err.Error()
	low := strings.ToLower(s)

	// nginx ingress admission: host "x" and path "/" is already defined in ingress ns/name
	if strings.Contains(low, "admission webhook") && strings.Contains(low, "already defined") {
		host := extractQuoted(s, `host "`, `"`)
		path := extractQuoted(s, `path "`, `"`)
		ns, name := extractIngressRef(s)
		var b strings.Builder
		b.WriteString("Ingress 路由冲突：")
		if host != "" {
			b.WriteString("域名 ")
			b.WriteString(host)
		}
		if path != "" {
			if host != "" {
				b.WriteString(" ")
			}
			b.WriteString("与路径 ")
			b.WriteString(path)
		}
		b.WriteString(" 已在其它 Ingress 中占用。")
		if ns != "" && name != "" {
			b.WriteString(" 冲突对象：")
			b.WriteString(ns)
			b.WriteString("/")
			b.WriteString(name)
			b.WriteString("。")
		}
		b.WriteString(" 请删除或修改该 Ingress，或改用其它域名/路径后再下发。")
		return b.String()
	}

	return s
}

func extractQuoted(s, prefix, suffix string) string {
	i := strings.Index(s, prefix)
	if i < 0 {
		return ""
	}
	s = s[i+len(prefix):]
	j := strings.Index(s, suffix)
	if j < 0 {
		return ""
	}
	return s[:j]
}

var reIngressRef = regexp.MustCompile(`(?i)ingress\s+([a-z0-9._-]+)/([a-z0-9._-]+)`)

func extractIngressRef(s string) (ns, name string) {
	m := reIngressRef.FindStringSubmatch(s)
	if len(m) >= 3 {
		return m[1], m[2]
	}
	return "", ""
}

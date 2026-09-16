package internal

import "strings"

// BuildVersion 由 go build -ldflags "-X kube-bt-sync/internal.BuildVersion=..." 注入；会话令牌含此段，发版后旧 Cookie 失效，用户需重新登录。
var BuildVersion = "dev"

func sessionBuildVersionSegment() string {
	v := strings.TrimSpace(BuildVersion)
	if v == "" {
		return "dev"
	}
	v = strings.ReplaceAll(v, "|", "_")
	v = strings.ReplaceAll(v, "\n", "_")
	v = strings.ReplaceAll(v, "\r", "_")
	return v
}

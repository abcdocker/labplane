package internal

import (
	"log"
	"os"
	"runtime"
	"strconv"
	"strings"
)

// ApplyGOMAXProcsFromEnv 在进程早期调用：若设置 KUBEBT_GOMAXPROCS（正整数），则 runtime.GOMAXPROCS(n)。
// Kubernetes 中建议与 resources.limits.cpu 的整核数对齐（如 limit 为 "2" 则设 KUBEBT_GOMAXPROCS=2），避免默认 GOMAXPROCS 与 cgroup 限制不一致导致调度抖动。
func ApplyGOMAXProcsFromEnv() {
	s := strings.TrimSpace(os.Getenv("KUBEBT_GOMAXPROCS"))
	if s == "" {
		return
	}
	n, err := strconv.Atoi(s)
	if err != nil || n < 1 {
		log.Printf("config: KUBEBT_GOMAXPROCS=%q 无效，忽略", s)
		return
	}
	prev := runtime.GOMAXPROCS(n)
	log.Printf("config: runtime.GOMAXPROCS=%d（先前为 %d）", n, prev)
}

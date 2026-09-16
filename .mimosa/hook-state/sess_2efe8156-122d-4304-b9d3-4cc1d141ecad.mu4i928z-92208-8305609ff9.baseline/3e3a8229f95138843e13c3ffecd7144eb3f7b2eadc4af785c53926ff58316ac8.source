package internal

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sort"
	"strings"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// StartK8sRestartCorrelationWorker 每小时一次：异常 Pod 关联（启发式，不调用 OpenClaw）、报告 7 天清理。
func StartK8sRestartCorrelationWorker(app *ServerApp) {
	ticker := time.NewTicker(time.Hour)
	go func() {
		// 启动后略延迟再跑，避免与进程其它初始化抢 K8s
		time.Sleep(90 * time.Second)
		runK8sRestartCorrelationAndPurge(app)
		for range ticker.C {
			runK8sRestartCorrelationAndPurge(app)
		}
	}()
	log.Println("k8s-restart-ai: 整点关联分析与报告清理任务已启动（周期 1h）")
}

func runK8sRestartCorrelationAndPurge(app *ServerApp) {
	db := app.MySQLDB()
	ctx, cancel := context.WithTimeout(context.Background(), 150*time.Second)
	defer cancel()
	if db != nil {
		if n, err := MysqlPurgeRestartAIReportsOlderThan(ctx, db, time.Now().Add(-7*24*time.Hour)); err != nil {
			log.Printf("k8s-restart-ai: 清理过期报告失败: %v", err)
		} else if n > 0 {
			log.Printf("k8s-restart-ai: 已删除早于 7 天的报告 %d 条", n)
		}
	}
	k8s := app.K8s()
	if k8s == nil {
		return
	}
	list, err := k8s.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
	if err != nil {
		log.Printf("k8s-restart-ai: 列出 Pod 失败: %v", err)
		return
	}
	const minR = int32(5)
	type hit struct {
		ns, name string
		rst       int32
	}
	var hits []hit
	nsCount := map[string]int{}
	kubeHigh := 0
	etcdAny := false
	for i := range list.Items {
		p := &list.Items[i]
		var rst int32
		for _, cs := range p.Status.ContainerStatuses {
			rst += cs.RestartCount
		}
		if rst < minR {
			continue
		}
		hits = append(hits, hit{ns: p.Namespace, name: p.Name, rst: rst})
		nsCount[p.Namespace]++
		lname := strings.ToLower(p.Name)
		if p.Namespace == "kube-system" {
			if rst >= 3 {
				kubeHigh++
			}
			if strings.Contains(lname, "etcd") {
				etcdAny = true
			}
		}
		if strings.Contains(lname, "etcd") {
			etcdAny = true
		}
	}
	sort.Slice(hits, func(i, j int) bool {
		if hits[i].rst != hits[j].rst {
			return hits[i].rst > hits[j].rst
		}
		return hits[i].ns+"/"+hits[i].name < hits[j].ns+"/"+hits[j].name
	})
	likelyInfra := (kubeHigh >= 3 && len(hits) >= 5) || (etcdAny && len(hits) >= 8)
	topNs := topNamespaceCounts(nsCount, 6)

	var md strings.Builder
	md.WriteString("### 异常 Pod 关联分析（整点启发式）\n\n")
	md.WriteString(fmt.Sprintf("- **统计窗口**：UTC %s · 高重启 Pod（≥%d 次）合计 **%d** 个\n", time.Now().UTC().Format(time.RFC3339), minR, len(hits)))
	md.WriteString(fmt.Sprintf("- **kube-system 高重启（≥3）**：**%d** 个 Pod\n", kubeHigh))
	if etcdAny {
		md.WriteString("- **名称含 etcd 的 Pod 存在重启**：控制面存储抖动时，常连带 apiserver/controller 等组件波动；请结合 apiserver/etcd 指标与节点磁盘/延迟排查。\n")
	} else {
		md.WriteString("- **未发现名称含 etcd 的高重启样本**（仍可能存在其它控制面问题）。\n")
	}
	if likelyInfra {
		md.WriteString("\n> **倾向**：多命名空间同时出现高重启，且 kube-system 内样本集中，**可能与基础组件/控制面短时故障相关**（如 etcd 选主、节点 NotReady、CNI 抖动），建议优先看集群事件与 control-plane 日志，再排查业务 Pod。\n\n")
	} else {
		md.WriteString("\n> **倾向**：更像**分散的业务侧**重启；仍请结合 Events 与资源 limits。\n\n")
	}
	md.WriteString("#### 重启较多的命名空间（Top）\n\n")
	for _, t := range topNs {
		md.WriteString(fmt.Sprintf("- `%s`：**%d** 个高重启 Pod\n", t.ns, t.n))
	}
	md.WriteString("\n#### 样本 Pod（至多 12 条）\n\n")
	show := hits
	if len(show) > 12 {
		show = show[:12]
	}
	for _, h := range show {
		md.WriteString(fmt.Sprintf("- `%s/%s` 重启 **%d**\n", h.ns, h.name, h.rst))
	}

	meta := map[string]any{
		"likelyInfraCorrelation": likelyInfra,
		"kubeSystemHighRestart":  kubeHigh,
		"totalHighRestartPods":   len(hits),
		"etcdNameHit":            etcdAny,
		"topNamespaces":        topNs,
	}
	title := "异常 Pod 关联分析（整点）"
	body := md.String()

	if db != nil {
		metaB, _ := json.Marshal(meta)
		_, err := MysqlInsertRestartAIReport(ctx, db, restartAIKindHourlyCorrelation, "cluster", title, body, "", string(metaB), "system")
		if err != nil {
			log.Printf("k8s-restart-ai: 写入关联报告失败: %v", err)
		}
	}
	if app.Redis() != nil {
		if err := RedisSetRestartCorrelationLatest(ctx, app.Redis(), title, body, meta); err != nil {
			log.Printf("k8s-restart-ai: 写 Redis 关联缓存失败: %v", err)
		}
	}
}

type nsCountPair struct {
	ns string
	n  int
}

func topNamespaceCounts(m map[string]int, k int) []nsCountPair {
	var pairs []nsCountPair
	for ns, n := range m {
		pairs = append(pairs, nsCountPair{ns: ns, n: n})
	}
	sort.Slice(pairs, func(i, j int) bool {
		if pairs[i].n != pairs[j].n {
			return pairs[i].n > pairs[j].n
		}
		return pairs[i].ns < pairs[j].ns
	})
	if len(pairs) > k {
		pairs = pairs[:k]
	}
	return pairs
}

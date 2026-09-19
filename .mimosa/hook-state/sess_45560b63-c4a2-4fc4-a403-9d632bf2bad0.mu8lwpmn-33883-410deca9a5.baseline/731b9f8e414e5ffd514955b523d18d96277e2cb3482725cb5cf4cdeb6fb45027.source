package internal

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

const baotaIngressSyncKVKey = "kubebt_baota_ingress_sync_report_v1"

// BaotaSyncStepResult 单次同步中某一步（站点 / 反代 / HTTPS）的结果。
type BaotaSyncStepResult struct {
	Name     string `json:"name"`
	OK       bool   `json:"ok"`
	Attempts int    `json:"attempts"`
	Error    string `json:"error,omitempty"`
}

// BaotaSyncDomainReport 单个域名在宝塔侧的同步摘要。
type BaotaSyncDomainReport struct {
	Domain        string                `json:"domain"`
	BaotaTargetID string                `json:"baotaTargetId,omitempty"`
	TargetURL     string                `json:"targetUrl,omitempty"`
	BaotaHTTPS    bool                  `json:"baotaHttps,omitempty"`
	OverallOK     bool                  `json:"overallOk"`
	Steps         []BaotaSyncStepResult `json:"steps"`
	// 对应集群中的 Ingress（多 host 同一 Ingress 时多条报告共享相同引用）
	IngressNamespace string `json:"ingressNamespace,omitempty"`
	IngressName      string `json:"ingressName,omitempty"`
}

// BaotaIngressSyncReport 最近一次 Ingress→宝塔 同步报告（写入 PlatformKV，供多副本读）。
type BaotaIngressSyncReport struct {
	Running                 bool                    `json:"running"`
	Skipped                 bool                    `json:"skipped,omitempty"`
	SkipReason              string                  `json:"skipReason,omitempty"`
	Trigger                 string                  `json:"trigger"`
	StartedAt               string                  `json:"startedAt,omitempty"`
	FinishedAt              string                  `json:"finishedAt,omitempty"`
	Summary                 string                  `json:"summary,omitempty"`
	Domains                 []BaotaSyncDomainReport `json:"domains"`
	IngressManagedCount     int                     `json:"ingressManagedCount,omitempty"`
	IngressBaotaSyncEnabled bool                    `json:"ingressBaotaSyncEnabled,omitempty"`
}

var baotaIngressSyncMu sync.Mutex

func baotaSyncRetryDelays() []time.Duration {
	return []time.Duration{0, 2 * time.Second, 5 * time.Second, 12 * time.Second}
}

// baotaPOSTWithRetry 对宝塔 API 做有限次重试（与删除重试节奏类似）。
func baotaPOSTWithRetry(ctx context.Context, cfg Config, apiPath string, params map[string]string, opHint string) (body string, ok bool, attempts int, errMsg string) {
	var lastErr error
	lastBody := ""
	for attemptIdx, d := range baotaSyncRetryDelays() {
		if d > 0 {
			select {
			case <-ctx.Done():
				return lastBody, false, attempts, ctx.Err().Error()
			case <-time.After(d):
			}
		}
		attempts = attemptIdx + 1
		b, err := CallBaotaAPI(cfg, apiPath, params)
		lastBody = b
		if err == nil || IsBaotaAlreadyExists(err) {
			return lastBody, true, attempts, ""
		}
		lastErr = err
		log.Printf("宝塔同步重试 op=%s path=%s: %v", opHint, apiPath, err)
	}
	if lastErr != nil {
		errMsg = lastErr.Error()
	}
	return lastBody, false, attempts, errMsg
}

func ensureBaotaSiteAndProxyWithReport(ctx context.Context, app *ServerApp, cfg Config, target ProxyTarget) BaotaSyncDomainReport {
	tid := strings.TrimSpace(target.BaotaTargetID)
	if tid == "" {
		tid = DefaultBaotaTargetID(cfg)
	}
	cfgUse := ConfigForBaotaTargetID(cfg, tid)
	rep := BaotaSyncDomainReport{
		Domain:           target.Domain,
		BaotaTargetID:    tid,
		TargetURL:        target.TargetURL,
		BaotaHTTPS:       target.BaotaHTTPS,
		IngressNamespace: target.IngressNamespace,
		IngressName:      target.IngressName,
		Steps:            nil,
		OverallOK:        true,
	}
	webnameMap := map[string]interface{}{"domain": target.Domain, "domainlist": []string{}, "count": 0}
	webnameJSON, _ := json.Marshal(webnameMap)
	_, ok, n, errMsg := baotaPOSTWithRetry(ctx, cfgUse, "/site?action=AddSite", map[string]string{
		"webname": string(webnameJSON),
		"path":    "/www/wwwroot/" + target.Domain,
		"type_id": "0", "type": "PHP", "version": "00", "port": "80",
		"ps": "[kube-bt-sync]",
	}, "AddSite:"+target.Domain)
	step := BaotaSyncStepResult{Name: "site", OK: ok, Attempts: n, Error: errMsg}
	rep.Steps = append(rep.Steps, step)
	if !ok {
		rep.OverallOK = false
	}

	// 官方/社区 SDK（bt-api）路径为 /site?action=CreateProxy；/proxy?action=CreateProxy 在新版面板上常为 HTTP 404。
	proxyName := ProxyNameForDomain(target.Domain)
	_, ok, n, errMsg = baotaPOSTWithRetry(ctx, cfgUse, "/site?action=CreateProxy", map[string]string{
		"sitename":  target.Domain,
		"proxyname": proxyName,
		"proxysite": target.TargetURL,
		"todomain":  "$host",
		"proxydir":  "/",
		"type":      "1",
		"advanced":  "0",
		"cache":     "0",
		"cachetime": "0",
		"subfilter": "[]",
	}, "CreateProxy:"+target.Domain)
	step = BaotaSyncStepResult{Name: "proxy", OK: ok, Attempts: n, Error: errMsg}
	rep.Steps = append(rep.Steps, step)
	if !ok {
		rep.OverallOK = false
	}

	if target.BaotaHTTPS {
		httpsOK := false
		var httpsErr string
		var httpsAttempts int
		for attemptIdx, d := range baotaSyncRetryDelays() {
			if d > 0 {
				select {
				case <-ctx.Done():
					httpsErr = ctx.Err().Error()
					break
				case <-time.After(d):
				}
				if ctx.Err() != nil {
					break
				}
			}
			httpsAttempts = attemptIdx + 1
			if err := EnsureBaotaHTTPS(app, cfgUse, target.Domain, target.BaotaHTTPSConfig); err == nil {
				httpsOK = true
				httpsErr = ""
				break
			} else {
				httpsErr = err.Error()
				log.Printf("宝塔 HTTPS 重试 domain=%s: %v", target.Domain, err)
			}
		}
		rep.Steps = append(rep.Steps, BaotaSyncStepResult{Name: "https", OK: httpsOK, Attempts: httpsAttempts, Error: httpsErr})
		if !httpsOK {
			rep.OverallOK = false
		}
	}
	return rep
}

func listBaotaProxyTargetsFromCluster(ctx context.Context, k8s *kubernetes.Clientset, cfg Config) ([]ProxyTarget, int, error) {
	ingresses, err := k8s.NetworkingV1().Ingresses("").List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, 0, err
	}
	var targets []ProxyTarget
	managed := 0
	for _, ing := range ingresses.Items {
		if !IsManagedIngress(ing.Annotations) {
			continue
		}
		managed++
		targetHost, targetScheme, targetPort := BaotaOriginTarget(cfg, ing.Annotations)
		httpsCfg := BaotaHTTPSFromAnnotations(ing.Annotations)
		targetURL := fmt.Sprintf("%s://%s:%s", targetScheme, targetHost, targetPort)
		for _, rule := range ing.Spec.Rules {
			if rule.Host != "" {
				targets = append(targets, ProxyTarget{
					Domain:           rule.Host,
					TargetURL:        targetURL,
					BaotaHTTPS:       httpsCfg.Enable,
					BaotaHTTPSConfig: httpsCfg,
					BaotaTargetID:    BaotaTargetIDFromIngress(ing.Annotations),
					IngressNamespace: ing.Namespace,
					IngressName:      ing.Name,
				})
			}
		}
	}
	return targets, managed, nil
}

func persistBaotaIngressSyncReport(app *ServerApp, rep *BaotaIngressSyncReport) {
	kv := app.PlatformKV()
	if kv == nil {
		return
	}
	b, err := json.Marshal(rep)
	if err != nil {
		log.Printf("宝塔同步报告序列化失败: %v", err)
		return
	}
	if err := kv.Set(baotaIngressSyncKVKey, string(b)); err != nil {
		log.Printf("宝塔同步报告写入 PlatformKV 失败: %v", err)
		return
	}
	mirrorPlatformKVIfDualWrite(app)
}

// LoadBaotaIngressSyncReport 从 PlatformKV 读取最近一次报告（无则 ok=false）。
func LoadBaotaIngressSyncReport(kv PlatformKV) (*BaotaIngressSyncReport, bool) {
	if kv == nil {
		return nil, false
	}
	raw, ok := kv.Get(baotaIngressSyncKVKey)
	if !ok || strings.TrimSpace(raw) == "" {
		return nil, false
	}
	var rep BaotaIngressSyncReport
	if err := json.Unmarshal([]byte(raw), &rep); err != nil {
		return nil, false
	}
	return &rep, true
}

// RunBaotaIngressSync 列出带注解的 Ingress，对域名逐个下发宝塔站点/反代（含重试），并持久化进度与结果。
// trigger: timer | manual | watcher
func RunBaotaIngressSync(ctx context.Context, app *ServerApp, trigger string) *BaotaIngressSyncReport {
	if app == nil {
		return &BaotaIngressSyncReport{Skipped: true, SkipReason: "app nil", Trigger: trigger}
	}
	if !baotaIngressSyncMu.TryLock() {
		return &BaotaIngressSyncReport{
			Skipped:    true,
			SkipReason: "已有同步任务在执行中，请稍后刷新状态或稍后再试",
			Trigger:    trigger,
			Running:    false,
		}
	}
	defer baotaIngressSyncMu.Unlock()

	cfg := app.Cfg()
	rep := &BaotaIngressSyncReport{
		Trigger:                 trigger,
		Running:                 true,
		StartedAt:               time.Now().UTC().Format(time.RFC3339Nano),
		Domains:                 nil,
		IngressBaotaSyncEnabled: cfg.IngressBaotaSyncEnabled,
	}
	persistBaotaIngressSyncReport(app, rep)

	if trigger == "timer" && !cfg.IngressBaotaSyncEnabled {
		rep.Running = false
		rep.Skipped = true
		rep.SkipReason = "已关闭 Ingress↔宝塔定时同步（运行时 ingressBaotaSyncEnabled / 环境变量 INGRESS_BAOTA_SYNC_ENABLED）"
		rep.FinishedAt = time.Now().UTC().Format(time.RFC3339Nano)
		rep.Summary = rep.SkipReason
		persistBaotaIngressSyncReport(app, rep)
		return rep
	}

	k8s := app.K8s()
	if k8s == nil || len(EffectiveBaotaTargets(cfg)) == 0 {
		rep.Running = false
		rep.Skipped = true
		rep.SkipReason = "K8s 客户端未就绪或未配置宝塔 URL/API Key（含多实例 baotaTargets）"
		rep.FinishedAt = time.Now().UTC().Format(time.RFC3339Nano)
		rep.Summary = rep.SkipReason
		persistBaotaIngressSyncReport(app, rep)
		return rep
	}

	if ctx == nil {
		ctx = context.Background()
	}
	targets, ingCount, err := listBaotaProxyTargetsFromCluster(ctx, k8s, cfg)
	if err != nil {
		rep.Running = false
		rep.Skipped = true
		rep.SkipReason = "列出 Ingress 失败: " + err.Error()
		rep.FinishedAt = time.Now().UTC().Format(time.RFC3339Nano)
		rep.Summary = rep.SkipReason
		rep.IngressManagedCount = ingCount
		persistBaotaIngressSyncReport(app, rep)
		return rep
	}
	rep.IngressManagedCount = ingCount

	okAll := true
	for _, target := range targets {
		if err := ctx.Err(); err != nil {
			okAll = false
			break
		}
		dr := ensureBaotaSiteAndProxyWithReport(ctx, app, cfg, target)
		rep.Domains = append(rep.Domains, dr)
		if !dr.OverallOK {
			okAll = false
		}
		persistBaotaIngressSyncReport(app, rep)
	}

	rep.Running = false
	rep.FinishedAt = time.Now().UTC().Format(time.RFC3339Nano)
	if len(targets) == 0 {
		rep.Summary = fmt.Sprintf("无待同步域名（集群中带 baota-sync 注解的 Ingress %d 条）", ingCount)
	} else if okAll {
		rep.Summary = fmt.Sprintf("已完成 %d 个域名的站点/反代同步", len(targets))
	} else {
		rep.Summary = fmt.Sprintf("已完成 %d 个域名，部分步骤失败，请展开查看", len(targets))
	}
	persistBaotaIngressSyncReport(app, rep)
	return rep
}

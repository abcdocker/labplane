package internal

import (
	"context"
	"fmt"
	"math"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	sigyaml "sigs.k8s.io/yaml"
)

const (
	k8sEtcdDefragJobLabelKey   = "kube-bt-sync.io/etcd-defrag"
	k8sEtcdDefragJobLabelValue = "true"
	etcdWalFsyncAlertSeconds   = 0.01 // 10ms，与 etcd 官方磁盘建议及控制台 WAL P99 警戒线一致
)

// etcdScalarFirstHit 对 etcd 相关指标尝试多条 PromQL（不同发行版 job 标签略有差异）。
func etcdScalarFirstHit(cfg Config, queries []string) *float64 {
	for _, q := range queries {
		q = strings.TrimSpace(q)
		if q == "" {
			continue
		}
		v := PrometheusPromQLInstantScalar(cfg, "k8s", q)
		if v != nil && !math.IsNaN(*v) && !math.IsInf(*v, 0) {
			return v
		}
	}
	return nil
}

func etcdInstantVector(cfg Config, queries []string) ([]gin.H, string) {
	for _, q := range queries {
		q = strings.TrimSpace(q)
		if q == "" {
			continue
		}
		raw, st, err := prometheusFetchInstant(cfg, "k8s", q)
		if err != nil || st >= http.StatusBadRequest {
			continue
		}
		if rows := promInstantVectorFromJSON(raw); len(rows) > 0 {
			return rows, q
		}
	}
	return nil, ""
}

// BuildK8sEtcdPrometheusSummary 聚合 etcd 健康与资源类指标；依赖已配置的 Kubernetes Prometheus/vmselect。
func BuildK8sEtcdPrometheusSummary(cfg Config) gin.H {
	queriesUsed := gin.H{}
	out := gin.H{
		"queriedAt":              time.Now().UTC().Format(time.RFC3339Nano),
		"prometheusConfigured":   GetPrometheusURLForScope(cfg, "k8s") != "",
		"etcdUp":                 nil,
		"walFsyncP99Seconds":     nil,
		"walFsyncP99Ms":          nil,
		"walFsyncAlert":          false,
		"leaderChanges15m":       nil,
		"leaderChanges1h":        nil,
		"leaderChangeAlert":      false,
		"mvccDbSizeBytes":        nil,
		"processRSSBytes":        nil,
		"proposalsPending":       nil,
		"dbSizeByInstance":       []gin.H{},
		"queriesUsed":            queriesUsed,
		"leaderChangesThreshold": 1.0,
		"walP99AlertThresholdMs": etcdWalFsyncAlertSeconds * 1000,
	}
	if GetPrometheusURLForScope(cfg, "k8s") == "" {
		out["error"] = "未配置 Kubernetes Prometheus / vmselect（prometheusUrlK8s 或 vmSelectUrlK8s）"
		return out
	}

	jobSel := `job=~"etcd|kube-etcd"`
	// up
	if v := etcdScalarFirstHit(cfg, []string{
		`max(up{` + jobSel + `})`,
		`max(up{job="etcd"})`,
	}); v != nil {
		out["etcdUp"] = *v
		queriesUsed["etcdUp"] = `max(up{job=~"etcd|kube-etcd"})`
	}

	// WAL fsync P99（秒）
	walQueries := []string{
		`histogram_quantile(0.99, sum(rate(etcd_disk_wal_fsync_duration_seconds_bucket{` + jobSel + `}[5m])) by (le))`,
		`histogram_quantile(0.99, sum(rate(etcd_disk_wal_fsync_duration_seconds_bucket[5m])) by (le))`,
	}
	if v := etcdScalarFirstHit(cfg, walQueries); v != nil {
		out["walFsyncP99Seconds"] = *v
		out["walFsyncP99Ms"] = *v * 1000
		out["walFsyncAlert"] = *v > etcdWalFsyncAlertSeconds
		queriesUsed["walFsyncP99"] = walQueries[0]
	}

	// Leader 切换次数
	lc15 := etcdScalarFirstHit(cfg, []string{
		`sum(increase(etcd_server_leader_changes_seen_total{` + jobSel + `}[15m]))`,
		`sum(increase(etcd_server_leader_changes_seen_total[15m]))`,
	})
	if lc15 != nil {
		out["leaderChanges15m"] = *lc15
		out["leaderChangeAlert"] = *lc15 > 1
		queriesUsed["leaderChanges15m"] = `sum(increase(etcd_server_leader_changes_seen_total{job=~"etcd|kube-etcd"}[15m]))`
	}
	if lc1h := etcdScalarFirstHit(cfg, []string{
		`sum(increase(etcd_server_leader_changes_seen_total{` + jobSel + `}[1h]))`,
		`sum(increase(etcd_server_leader_changes_seen_total[1h]))`,
	}); lc1h != nil {
		out["leaderChanges1h"] = *lc1h
	}

	// DB 体量（成员上取 max 作为集群「主库文件」量级参考）
	if v := etcdScalarFirstHit(cfg, []string{
		`max(etcd_mvcc_db_total_size_in_bytes{` + jobSel + `})`,
		`max(etcd_mvcc_db_total_size_in_bytes)`,
		`max(etcd_debugging_mvcc_db_total_size_in_bytes{` + jobSel + `})`,
		`max(etcd_debugging_mvcc_db_total_size_in_bytes)`,
	}); v != nil {
		out["mvccDbSizeBytes"] = *v
	}

	if v := etcdScalarFirstHit(cfg, []string{
		`sum(process_resident_memory_bytes{` + jobSel + `})`,
		`sum(process_resident_memory_bytes{job="etcd"})`,
	}); v != nil {
		out["processRSSBytes"] = *v
	}

	if v := etcdScalarFirstHit(cfg, []string{
		`sum(etcd_server_proposals_pending{` + jobSel + `})`,
		`sum(etcd_server_proposals_pending)`,
	}); v != nil {
		out["proposalsPending"] = *v
	}

	rows, usedQ := etcdInstantVector(cfg, []string{
		`etcd_mvcc_db_total_size_in_bytes{` + jobSel + `}`,
		`etcd_mvcc_db_total_size_in_bytes`,
		`etcd_debugging_mvcc_db_total_size_in_bytes{` + jobSel + `}`,
	})
	if len(rows) > 0 {
		out["dbSizeByInstance"] = rows
		if usedQ != "" {
			queriesUsed["dbSizeByInstance"] = usedQ
		}
	}

	return out
}

func handleGetK8sEtcdSummary(c *gin.Context, app *ServerApp) {
	if !GuardK8s(c, app.K8s()) {
		return
	}
	cfg := app.Cfg()
	payload := BuildK8sEtcdPrometheusSummary(cfg)
	c.JSON(http.StatusOK, payload)
}

type k8sEtcdDefragJobRequest struct {
	Namespace     string `json:"namespace"`
	EtcdEndpoints string `json:"etcdEndpoints"`
	Image         string `json:"image"`
	CertHostPath  string `json:"certHostPath"`
	NodeName      string `json:"nodeName"`
	JobName       string `json:"jobName"`
}

func handlePostK8sEtcdDefragJob(c *gin.Context, app *ServerApp) {
	if !GuardK8s(c, app.K8s()) {
		return
	}
	var body k8sEtcdDefragJobRequest
	_ = c.ShouldBindJSON(&body)
	ns := strings.TrimSpace(body.Namespace)
	if ns == "" {
		ns = metav1.NamespaceSystem
	}
	endpoints := strings.TrimSpace(body.EtcdEndpoints)
	if endpoints == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "etcdEndpoints 不能为空，示例：https://192.168.1.10:2379,https://192.168.1.11:2379,https://192.168.1.12:2379"})
		return
	}
	img := strings.TrimSpace(body.Image)
	if img == "" {
		img = "registry.k8s.io/etcd:3.5.16-0"
	}
	certPath := strings.TrimSpace(body.CertHostPath)
	if certPath == "" {
		certPath = "/etc/kubernetes/pki/etcd"
	}
	nodeName := strings.TrimSpace(body.NodeName)

	jobName := fmt.Sprintf("kbt-etcd-defrag-%d", time.Now().Unix())
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()

	job := buildEtcdDefragJob(jobName, ns, endpoints, img, certPath, nodeName)
	_, err := app.K8s().BatchV1().Jobs(ns).Create(ctx, job, metav1.CreateOptions{})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"namespace": ns,
		"jobName":   jobName,
		"message":   "已在集群中创建 defrag Job；请 kubectl logs job/" + jobName + " -n " + ns + " 查看输出。完成后 Job 将按 TTL 自动清理。",
	})
}

func buildEtcdDefragJob(name, namespace, endpoints, image, certHostPath, nodeName string) *batchv1.Job {
	var ttl int32 = 600
	var backoff int32 = 1
	var completions int32 = 1
	var parallelism int32 = 1

	spec := corev1.PodSpec{
		RestartPolicy: corev1.RestartPolicyNever,
		HostNetwork:   true,
		DNSPolicy:     corev1.DNSClusterFirstWithHostNet,
		NodeSelector: map[string]string{
			"node-role.kubernetes.io/control-plane": "",
		},
		Tolerations: []corev1.Toleration{
			{
				Key:      "node-role.kubernetes.io/control-plane",
				Operator: corev1.TolerationOpExists,
				Effect:   corev1.TaintEffectNoSchedule,
			},
			{
				Key:      "node.kubernetes.io/not-ready",
				Operator: corev1.TolerationOpExists,
				Effect:   corev1.TaintEffectNoExecute,
			},
		},
		Containers: []corev1.Container{{
			Name:  "etcdctl",
			Image: image,
			Env: []corev1.EnvVar{
				{Name: "ETCDCTL_API", Value: "3"},
			},
			Command: []string{"/usr/local/bin/etcdctl"},
			Args: []string{
				"defrag",
				"--endpoints=" + endpoints,
				"--cacert=/etcd-certs/ca.crt",
				"--cert=/etcd-certs/healthcheck-client.crt",
				"--key=/etcd-certs/healthcheck-client.key",
			},
			VolumeMounts: []corev1.VolumeMount{{
				Name:      "etcd-certs",
				MountPath: "/etcd-certs",
				ReadOnly:  true,
			}},
			Resources: corev1.ResourceRequirements{
				Requests: corev1.ResourceList{
					corev1.ResourceCPU:    resource.MustParse("100m"),
					corev1.ResourceMemory: resource.MustParse("128Mi"),
				},
				Limits: corev1.ResourceList{
					corev1.ResourceCPU:    resource.MustParse("1"),
					corev1.ResourceMemory: resource.MustParse("512Mi"),
				},
			},
		}},
		Volumes: []corev1.Volume{{
			Name: "etcd-certs",
			VolumeSource: corev1.VolumeSource{
				HostPath: &corev1.HostPathVolumeSource{
					Path: certHostPath,
					Type: hostPathTypePtr(corev1.HostPathDirectory),
				},
			},
		}},
	}
	if nodeName != "" {
		spec.NodeName = nodeName
	}

	return &batchv1.Job{
		ObjectMeta: metav1.ObjectMeta{
			Name:      name,
			Namespace: namespace,
			Labels: map[string]string{
				k8sEtcdDefragJobLabelKey: k8sEtcdDefragJobLabelValue,
			},
		},
		Spec: batchv1.JobSpec{
			TTLSecondsAfterFinished: &ttl,
			BackoffLimit:            &backoff,
			Completions:             &completions,
			Parallelism:             &parallelism,
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels: map[string]string{
						k8sEtcdDefragJobLabelKey: k8sEtcdDefragJobLabelValue,
						"job-name":               name,
					},
				},
				Spec: spec,
			},
		},
	}
}

func hostPathTypePtr(t corev1.HostPathType) *corev1.HostPathType {
	return &t
}

func etcdDefragJobToYAML(namespace, jobName, endpoints, image, certHostPath, nodeName string) (string, error) {
	if namespace == "" {
		namespace = metav1.NamespaceSystem
	}
	if jobName == "" {
		jobName = "kbt-etcd-defrag-manual"
	}
	if image == "" {
		image = "registry.k8s.io/etcd:3.5.16-0"
	}
	if certHostPath == "" {
		certHostPath = "/etc/kubernetes/pki/etcd"
	}
	job := buildEtcdDefragJob(jobName, namespace, endpoints, image, certHostPath, nodeName)
	job.APIVersion = "batch/v1"
	job.Kind = "Job"
	b, err := sigyaml.Marshal(job)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func handlePostK8sEtcdDefragJobYAML(c *gin.Context, app *ServerApp) {
	if !GuardK8s(c, app.K8s()) {
		return
	}
	var body k8sEtcdDefragJobRequest
	_ = c.ShouldBindJSON(&body)
	ns := strings.TrimSpace(body.Namespace)
	if ns == "" {
		ns = metav1.NamespaceSystem
	}
	endpoints := strings.TrimSpace(body.EtcdEndpoints)
	if endpoints == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "etcdEndpoints 不能为空"})
		return
	}
	jobName := strings.TrimSpace(body.JobName)
	if jobName == "" {
		jobName = fmt.Sprintf("kbt-etcd-defrag-%d", time.Now().Unix())
	}
	yamlText, err := etcdDefragJobToYAML(ns, jobName, endpoints, body.Image, body.CertHostPath, body.NodeName)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"yaml": yamlText, "jobName": jobName, "namespace": ns})
}

package internal

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// ── 请求 / 报告结构体 ─────────────────────────────────────────────────────────

// KafkaPerfTestRequest 压测参数。
type KafkaPerfTestRequest struct {
	// Topic 压测使用的 Topic（须已存在）
	Topic string `json:"topic"`
	// RecordCount 发送 / 消费的消息总数，默认 500000
	RecordCount int64 `json:"recordCount"`
	// RecordSize 单条消息字节数，默认 1024
	RecordSize int `json:"recordSize"`
	// TestMode "producer" | "consumer" | "both"，默认 "both"
	TestMode string `json:"testMode"`
	// EnableThrottle 是否在压测前设置限速，压测结束后自动解除
	EnableThrottle bool `json:"enableThrottle"`
	// ProducerLimit 生产者限速 bytes/sec（EnableThrottle=true 时有效）
	ProducerLimit int64 `json:"producerLimit"`
	// ConsumerLimit 消费者限速 bytes/sec（EnableThrottle=true 时有效）
	ConsumerLimit int64 `json:"consumerLimit"`
	// ThrottleUser 限速作用的用户名（Kafka quota entity），空则使用实例默认 SASL 用户
	ThrottleUser string `json:"throttleUser,omitempty"`
	// ClientUsername 压测客户端 SASL 用户名，空则使用实例配置中的管理员用户
	ClientUsername string `json:"clientUsername,omitempty"`
	// ClientPassword 与 ClientUsername 配套的密码；仅启动 Job 时传入，不会写入 Job 注解
	ClientPassword string `json:"clientPassword,omitempty"`
}

// KafkaPerfProducerResult 生产者压测结果。
type KafkaPerfProducerResult struct {
	RecordsSent   int64   `json:"recordsSent"`
	RecordsPerSec float64 `json:"recordsPerSec"`
	MBPerSec      float64 `json:"mbPerSec"`
	AvgLatencyMs  float64 `json:"avgLatencyMs"`
	MaxLatencyMs  float64 `json:"maxLatencyMs"`
	P50Ms         int64   `json:"p50Ms"`
	P95Ms         int64   `json:"p95Ms"`
	P99Ms         int64   `json:"p99Ms"`
	P999Ms        int64   `json:"p999Ms"`
}

// KafkaPerfConsumerResult 消费者压测结果。
type KafkaPerfConsumerResult struct {
	DataConsumedMB float64 `json:"dataConsumedMB"`
	MBPerSec       float64 `json:"mbPerSec"`
	MessagesCount  int64   `json:"messagesCount"`
	MsgPerSec      float64 `json:"msgPerSec"`
	FetchMBPerSec  float64 `json:"fetchMBPerSec"`
}

// KafkaPerfTestReport 压测报告（含 Job 实时状态）。
type KafkaPerfTestReport struct {
	JobName         string                   `json:"jobName"`
	Namespace       string                   `json:"namespace"`
	// Status: pending | running | completed | failed
	Status          string                   `json:"status"`
	Topic           string                   `json:"topic"`
	RecordCount     int64                    `json:"recordCount"`
	RecordSize      int                      `json:"recordSize"`
	TestMode        string                   `json:"testMode"`
	ThrottleEnabled bool                     `json:"throttleEnabled"`
	ProducerLimit   int64                    `json:"producerLimit,omitempty"`
	ConsumerLimit   int64                    `json:"consumerLimit,omitempty"`
	ClientUsername  string                   `json:"clientUsername,omitempty"`
	ThrottleUser    string                   `json:"throttleUser,omitempty"`
	Producer        *KafkaPerfProducerResult `json:"producer,omitempty"`
	Consumer        *KafkaPerfConsumerResult `json:"consumer,omitempty"`
	RawLog          string                   `json:"rawLog,omitempty"`
	ErrorMessage    string                   `json:"errorMessage,omitempty"`
	// ParseNote 有原始日志但未能解析出生产者/消费者指标时的说明（便于区分「无日志」与「格式不匹配」）
	ParseNote string `json:"parseNote,omitempty"`
	// ProgressHint 任务进行中时提示（指标来自当前已累计的 Pod 日志）
	ProgressHint string `json:"progressHint,omitempty"`
	StartedAt    string `json:"startedAt,omitempty"`
	CompletedAt  string `json:"completedAt,omitempty"`
}

// ── 内部辅助 ──────────────────────────────────────────────────────────────────

const kafkaPerfLabel = "kube-bt-sync.io/perf"
const kafkaPerfReqAnno = "kube-bt-sync.io/perf-request"

// kafkaPerfJobMeta 写入 Job 注解，供查询报告时还原参数（不含密码）。
type kafkaPerfJobMeta struct {
	Topic          string `json:"topic"`
	RecordCount    int64  `json:"recordCount"`
	RecordSize     int    `json:"recordSize"`
	TestMode       string `json:"testMode"`
	EnableThrottle bool   `json:"enableThrottle"`
	ProducerLimit  int64  `json:"producerLimit,omitempty"`
	ConsumerLimit  int64  `json:"consumerLimit,omitempty"`
	ThrottleUser   string `json:"throttleUser,omitempty"`
	ClientUsername string `json:"clientUsername,omitempty"`
}

func kafkaPerfJobMetaFromReq(req *KafkaPerfTestRequest) kafkaPerfJobMeta {
	return kafkaPerfJobMeta{
		Topic:          req.Topic,
		RecordCount:    req.RecordCount,
		RecordSize:     req.RecordSize,
		TestMode:       req.TestMode,
		EnableThrottle: req.EnableThrottle,
		ProducerLimit:  req.ProducerLimit,
		ConsumerLimit:  req.ConsumerLimit,
		ThrottleUser:   strings.TrimSpace(req.ThrottleUser),
		ClientUsername: strings.TrimSpace(req.ClientUsername),
	}
}

func kafkaPerfRequestFromJobMetaJSON(raw string) (*KafkaPerfTestRequest, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, fmt.Errorf("empty perf meta")
	}
	var m kafkaPerfJobMeta
	if err := json.Unmarshal([]byte(raw), &m); err != nil {
		return nil, err
	}
	return &KafkaPerfTestRequest{
		Topic:          m.Topic,
		RecordCount:    m.RecordCount,
		RecordSize:     m.RecordSize,
		TestMode:       m.TestMode,
		EnableThrottle: m.EnableThrottle,
		ProducerLimit:  m.ProducerLimit,
		ConsumerLimit:  m.ConsumerLimit,
		ThrottleUser:   m.ThrottleUser,
		ClientUsername: m.ClientUsername,
	}, nil
}

func appKafkaPerfJobAnnotations(req *KafkaPerfTestRequest, st *appKafkaInstanceStored) (map[string]string, error) {
	meta := kafkaPerfJobMetaFromReq(req)
	if meta.EnableThrottle && strings.TrimSpace(meta.ThrottleUser) == "" {
		meta.ThrottleUser = st.SaslUsername
	}
	b, err := json.Marshal(meta)
	if err != nil {
		return nil, err
	}
	return map[string]string{kafkaPerfReqAnno: string(b)}, nil
}

func kafkaJaasEscape(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `"`, `\"`)
	return s
}

func appKafkaPerfJobName(instanceID int64) string {
	ms := time.Now().UnixMilli() & 0xffffff
	return fmt.Sprintf("kbt-perf-%d-%06x", instanceID, ms)
}

// appKafkaPerfGetImageAndPullSecret 从现有 Kafka StatefulSet 读取镜像和 imagePullSecret。
func appKafkaPerfGetImageAndPullSecret(ctx context.Context, k8s *kubernetes.Clientset, ns, base string) (image, pullSecret string) {
	image = "docker.io/bitnamilegacy/kafka:3.7.1"
	sts, err := k8s.AppsV1().StatefulSets(ns).Get(ctx, kafkaKafkaSTSName(base), metav1.GetOptions{})
	if err != nil {
		return
	}
	for _, c := range sts.Spec.Template.Spec.Containers {
		if c.Name == "kafka" {
			image = c.Image
			break
		}
	}
	if len(sts.Spec.Template.Spec.ImagePullSecrets) > 0 {
		pullSecret = sts.Spec.Template.Spec.ImagePullSecrets[0].Name
	}
	return
}

// appKafkaPerfDefaults 填充默认值并做基本校验。
func appKafkaPerfDefaults(req *KafkaPerfTestRequest) error {
	req.Topic = strings.TrimSpace(req.Topic)
	if req.Topic == "" {
		return fmt.Errorf("topic 不能为空")
	}
	if req.RecordCount <= 0 {
		req.RecordCount = 500000
	}
	if req.RecordCount > 50000000 {
		return fmt.Errorf("recordCount 最大 50,000,000")
	}
	if req.RecordSize <= 0 {
		req.RecordSize = 1024
	}
	if req.RecordSize > 1048576 {
		return fmt.Errorf("recordSize 最大 1 MB（1048576 bytes）")
	}
	req.TestMode = strings.ToLower(strings.TrimSpace(req.TestMode))
	if req.TestMode == "" {
		req.TestMode = "both"
	}
	if req.TestMode != "producer" && req.TestMode != "consumer" && req.TestMode != "both" {
		return fmt.Errorf("testMode 须为 producer / consumer / both")
	}
	if req.EnableThrottle && req.ProducerLimit <= 0 && req.ConsumerLimit <= 0 {
		return fmt.Errorf("开启限速时须至少设置一个有效的 producerLimit 或 consumerLimit（> 0）")
	}
	req.ClientUsername = strings.TrimSpace(req.ClientUsername)
	if req.ClientUsername != "" && strings.TrimSpace(req.ClientPassword) == "" {
		return fmt.Errorf("指定 clientUsername 时必须提供 clientPassword")
	}
	return nil
}

// appKafkaBuildPerfScript 根据请求生成 Job 容器内执行的 Shell 脚本。
func appKafkaBuildPerfScript(req *KafkaPerfTestRequest, st *appKafkaInstanceStored, suffix string) string {
	mech := st.effectiveSaslMechanism()
	bootstrap := st.BootstrapBrokers
	throttleUser := strings.TrimSpace(req.ThrottleUser)
	if throttleUser == "" {
		throttleUser = st.SaslUsername
	}

	clientUser := req.ClientUsername
	clientPass := req.ClientPassword
	if clientUser == "" {
		clientUser = st.SaslUsername
		clientPass = st.SaslPassword
	}

	var loginModule string
	if strings.ToUpper(mech) == "PLAIN" {
		loginModule = "org.apache.kafka.common.security.plain.PlainLoginModule"
	} else {
		loginModule = "org.apache.kafka.common.security.scram.ScramLoginModule"
	}

	consumerGroup := fmt.Sprintf("kbt-perf-%s", suffix)

	var b strings.Builder
	b.WriteString("#!/usr/bin/env bash\nset -e\n\n")

	// 压测客户端 SASL（可与限速配额作用用户不同）
	fmt.Fprintf(&b, "cat > /tmp/client.properties << 'PROPS_EOF'\nbootstrap.servers=%s\nsecurity.protocol=SASL_PLAINTEXT\nsasl.mechanism=%s\nsasl.jaas.config=%s required username=\"%s\" password=\"%s\";\nPROPS_EOF\n",
		bootstrap, mech, loginModule, kafkaJaasEscape(clientUser), kafkaJaasEscape(clientPass))
	fmt.Fprintf(&b, "cp /tmp/client.properties /tmp/producer.properties\ncp /tmp/client.properties /tmp/consumer.properties\n")
	fmt.Fprintf(&b, "printf '%%s\\n' 'group.id=%s' >> /tmp/consumer.properties\n", consumerGroup)
	fmt.Fprintf(&b, "printf '%%s\\n' 'auto.offset.reset=earliest' >> /tmp/consumer.properties\n")
	b.WriteString("echo \"[perf] client.properties 已生成\"\n\n")

	// 限速：kafka-configs 使用实例管理员凭据（需 AlterConfigs 等权限），与压测客户端用户可分离
	if req.EnableThrottle {
		fmt.Fprintf(&b, "cat > /tmp/admin.properties << 'ADMIN_EOF'\nbootstrap.servers=%s\nsecurity.protocol=SASL_PLAINTEXT\nsasl.mechanism=%s\nsasl.jaas.config=%s required username=\"%s\" password=\"%s\";\nADMIN_EOF\n",
			bootstrap, mech, loginModule, kafkaJaasEscape(st.SaslUsername), kafkaJaasEscape(st.SaslPassword))
		b.WriteString("echo \"[perf] admin.properties 已生成（用于 kafka-configs）\"\n\n")
		var quotaParts []string
		if req.ProducerLimit > 0 {
			quotaParts = append(quotaParts, fmt.Sprintf("producer_byte_rate=%d", req.ProducerLimit))
		}
		if req.ConsumerLimit > 0 {
			quotaParts = append(quotaParts, fmt.Sprintf("consumer_byte_rate=%d", req.ConsumerLimit))
		}
		fmt.Fprintf(&b, "echo \"=== 设置限速 user=%s ===\"\n", throttleUser)
		fmt.Fprintf(&b, "kafka-configs.sh --bootstrap-server %q --command-config /tmp/admin.properties --alter --entity-type users --entity-name %q --add-config %q\n",
			bootstrap, throttleUser, strings.Join(quotaParts, ","))
		fmt.Fprintf(&b, "kafka-configs.sh --bootstrap-server %q --command-config /tmp/admin.properties --describe --entity-type users --entity-name %q\n",
			bootstrap, throttleUser)
		b.WriteString("echo \"=== 限速已生效，等待 2s ===\"\nsleep 2\n\n")
	}

	// 生产者压测
	if req.TestMode == "producer" || req.TestMode == "both" {
		b.WriteString("echo \"===PERF_PRODUCER_START===\"\n")
		fmt.Fprintf(&b, "kafka-producer-perf-test.sh --topic %q --num-records %d --record-size %d --throughput -1 --producer.config /tmp/producer.properties\n",
			req.Topic, req.RecordCount, req.RecordSize)
		b.WriteString("echo \"===PERF_PRODUCER_END===\"\n\n")
	}

	// 消费者压测
	if req.TestMode == "consumer" || req.TestMode == "both" {
		b.WriteString("echo \"===PERF_CONSUMER_START===\"\n")
		fmt.Fprintf(&b, "kafka-consumer-perf-test.sh --bootstrap-server %q --topic %q --messages %d --consumer.config /tmp/consumer.properties\n",
			bootstrap, req.Topic, req.RecordCount)
		b.WriteString("echo \"===PERF_CONSUMER_END===\"\n\n")
	}

	// 解除限速
	if req.EnableThrottle {
		var delKeys []string
		if req.ProducerLimit > 0 {
			delKeys = append(delKeys, "producer_byte_rate")
		}
		if req.ConsumerLimit > 0 {
			delKeys = append(delKeys, "consumer_byte_rate")
		}
		b.WriteString("echo \"=== 解除限速 ===\"\n")
		fmt.Fprintf(&b, "kafka-configs.sh --bootstrap-server %q --command-config /tmp/admin.properties --alter --entity-type users --entity-name %q --delete-config %q || true\n",
			bootstrap, throttleUser, strings.Join(delKeys, ","))
		b.WriteString("\n")
	}

	b.WriteString("echo \"===PERF_DONE===\"\n")
	return b.String()
}

// appKafkaCreatePerfJob 在 K8s 中创建压测 Job。
func appKafkaCreatePerfJob(ctx context.Context, k8s *kubernetes.Clientset, ns, jobName, image, pullSecret, script string, annotations map[string]string) error {
	var ttl int32 = 3600
	var backoff int32 = 0
	var completions int32 = 1
	var parallelism int32 = 1

	job := &batchv1.Job{
		ObjectMeta: metav1.ObjectMeta{
			Name:        jobName,
			Namespace:   ns,
			Labels:      map[string]string{kafkaPerfLabel: "true"},
			Annotations: annotations,
		},
		Spec: batchv1.JobSpec{
			TTLSecondsAfterFinished: &ttl,
			BackoffLimit:            &backoff,
			Completions:             &completions,
			Parallelism:             &parallelism,
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels: map[string]string{
						kafkaPerfLabel: "true",
						"job-name":     jobName,
					},
				},
				Spec: corev1.PodSpec{
					RestartPolicy: corev1.RestartPolicyNever,
					Containers: []corev1.Container{{
						Name:    "perf",
						Image:   image,
						Command: []string{"/bin/bash", "-c"},
						Args:    []string{script},
						Resources: corev1.ResourceRequirements{
							Requests: corev1.ResourceList{
								corev1.ResourceCPU:    resource.MustParse("500m"),
								corev1.ResourceMemory: resource.MustParse("256Mi"),
							},
							Limits: corev1.ResourceList{
								corev1.ResourceCPU:    resource.MustParse("2"),
								corev1.ResourceMemory: resource.MustParse("512Mi"),
							},
						},
					}},
				},
			},
		},
	}
	if pullSecret != "" {
		job.Spec.Template.Spec.ImagePullSecrets = []corev1.LocalObjectReference{{Name: pullSecret}}
	}
	_, err := k8s.BatchV1().Jobs(ns).Create(ctx, job, metav1.CreateOptions{})
	return err
}

// KafkaPerfJobListItem 压测 Job 列表项（来自 Kubernetes，刷新页面仍可恢复）。
type KafkaPerfJobListItem struct {
	JobName         string `json:"jobName"`
	Status          string `json:"status"`
	CreatedAt       string `json:"createdAt,omitempty"`
	Topic           string `json:"topic,omitempty"`
	TestMode        string `json:"testMode,omitempty"`
	ThrottleEnabled bool   `json:"throttleEnabled,omitempty"`
	RecordCount     int64  `json:"recordCount,omitempty"`
	RecordSize      int    `json:"recordSize,omitempty"`
}

// appKafkaListPerfJobs 列出本实例在命名空间内的压测 Job（名称前缀 kbt-perf-{instanceId}-）。
func appKafkaListPerfJobs(ctx context.Context, k8s *kubernetes.Clientset, ns string, instanceID int64) ([]KafkaPerfJobListItem, error) {
	prefix := fmt.Sprintf("kbt-perf-%d-", instanceID)
	list, err := k8s.BatchV1().Jobs(ns).List(ctx, metav1.ListOptions{
		LabelSelector: kafkaPerfLabel + "=true",
	})
	if err != nil {
		return nil, err
	}
	var out []KafkaPerfJobListItem
	for i := range list.Items {
		job := &list.Items[i]
		if !strings.HasPrefix(job.Name, prefix) {
			continue
		}
		item := KafkaPerfJobListItem{JobName: job.Name}
		if !job.CreationTimestamp.IsZero() {
			item.CreatedAt = job.CreationTimestamp.UTC().Format(time.RFC3339)
		}
		switch {
		case job.Status.Succeeded > 0:
			item.Status = "completed"
		case job.Status.Failed > 0:
			item.Status = "failed"
		case job.Status.Active > 0:
			item.Status = "running"
		default:
			item.Status = "pending"
		}
		if job.Annotations != nil {
			if raw := strings.TrimSpace(job.Annotations[kafkaPerfReqAnno]); raw != "" {
				if r, err := kafkaPerfRequestFromJobMetaJSON(raw); err == nil {
					item.Topic = r.Topic
					item.TestMode = r.TestMode
					item.ThrottleEnabled = r.EnableThrottle
					item.RecordCount = r.RecordCount
					item.RecordSize = r.RecordSize
				}
			}
		}
		out = append(out, item)
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].CreatedAt > out[j].CreatedAt
	})
	return out, nil
}

// appKafkaPerfJobReport 查询 Job 状态；运行中也会拉取 Pod 当前日志并解析已输出的汇总行，便于实时查看吞吐。
func appKafkaPerfJobReport(ctx context.Context, k8s *kubernetes.Clientset, ns, jobName string) (*KafkaPerfTestReport, error) {
	job, err := k8s.BatchV1().Jobs(ns).Get(ctx, jobName, metav1.GetOptions{})
	if err != nil {
		if apierrors.IsNotFound(err) {
			return nil, fmt.Errorf("压测 Job %s 不存在（可能已超时自动清理）", jobName)
		}
		return nil, err
	}
	if job.Labels == nil || job.Labels[kafkaPerfLabel] != "true" {
		return nil, fmt.Errorf("Job %s 不是平台压测任务", jobName)
	}

	req := &KafkaPerfTestRequest{TestMode: "both"}
	if job.Annotations != nil {
		if raw := strings.TrimSpace(job.Annotations[kafkaPerfReqAnno]); raw != "" {
			if parsed, err := kafkaPerfRequestFromJobMetaJSON(raw); err == nil {
				req = parsed
			}
		}
	}

	report := &KafkaPerfTestReport{
		JobName:         jobName,
		Namespace:       ns,
		ThrottleEnabled: req.EnableThrottle,
		ProducerLimit:   req.ProducerLimit,
		ConsumerLimit:   req.ConsumerLimit,
		Topic:           req.Topic,
		RecordCount:     req.RecordCount,
		RecordSize:      req.RecordSize,
		TestMode:        req.TestMode,
		ClientUsername:  strings.TrimSpace(req.ClientUsername),
		ThrottleUser:    strings.TrimSpace(req.ThrottleUser),
	}
	if job.Status.StartTime != nil {
		report.StartedAt = job.Status.StartTime.UTC().Format(time.RFC3339)
	}
	switch {
	case job.Status.Succeeded > 0:
		report.Status = "completed"
		if job.Status.CompletionTime != nil {
			report.CompletedAt = job.Status.CompletionTime.UTC().Format(time.RFC3339)
		}
	case job.Status.Failed > 0:
		report.Status = "failed"
	case job.Status.Active > 0:
		report.Status = "running"
	default:
		report.Status = "pending"
	}

	// 任意阶段均尝试读日志：running 时可看到生产者已结束后的汇总；pending 时 Pod 可能尚未创建，失败不提示为致命错误
	var logs string
	if report.Status == "pending" || report.Status == "running" || report.Status == "completed" || report.Status == "failed" {
		got, lerr := appKafkaPerfGetJobLogs(ctx, k8s, ns, jobName)
		logs = got
		if lerr != nil {
			if report.Status != "pending" {
				msg := "读取压测 Pod 日志失败: " + lerr.Error()
				if strings.TrimSpace(report.ErrorMessage) == "" {
					report.ErrorMessage = msg
				} else {
					report.ErrorMessage = report.ErrorMessage + "\n" + msg
				}
			}
		} else if logs != "" {
			report.RawLog = logs
			report.Producer = parsePerfProducerOutput(logs)
			report.Consumer = parsePerfConsumerOutput(logs)
			if report.Status == "running" || report.Status == "pending" {
				report.ProgressHint = "压测进行中：下列指标来自 Pod 当前已累计输出。生产者阶段结束后会出现生产侧吞吐；消费者跑完后会出现消费侧汇总。本页约每 3 秒自动刷新，也可点「刷新报告」。"
				if report.Producer == nil && report.Consumer == nil {
					report.ProgressHint = "压测进行中：尚未在日志中匹配到汇总行（脚本可能在限速配置或生产者启动阶段）。请展开「原始日志」查看实时输出。"
				}
			}
			if report.Status == "completed" {
				mode := strings.ToLower(strings.TrimSpace(req.TestMode))
				if mode == "" {
					mode = "both"
				}
				wantP := mode == "producer" || mode == "both"
				wantC := mode == "consumer" || mode == "both"
				missP := wantP && report.Producer == nil
				missC := wantC && report.Consumer == nil
				if missP && missC {
					report.ParseNote = "已拉取 Pod 日志，但未匹配到 kafka-producer-perf-test / kafka-consumer-perf-test 的汇总行（镜像版本输出格式可能不同）。请展开「原始日志」核对。"
				} else if missP {
					report.ParseNote = "已拉取日志，未匹配到生产者压测汇总行，请展开「原始日志」核对（当前测试模式包含生产者）。"
				} else if missC {
					report.ParseNote = "已拉取日志，未匹配到消费者压测汇总行，请展开「原始日志」核对（当前测试模式包含消费者）。"
				}
			}
		} else if report.Status == "running" {
			report.ProgressHint = "压测进行中：当前 Pod 日志仍为空（容器可能刚启动）。请稍后刷新或展开原始日志。"
		}
		if report.Status == "failed" {
			if em := appKafkaPerfExtractError(logs); em != "" {
				if strings.TrimSpace(report.ErrorMessage) == "" {
					report.ErrorMessage = em
				} else if !strings.Contains(report.ErrorMessage, em) {
					report.ErrorMessage = report.ErrorMessage + "\n" + em
				}
			}
		}
	}
	return report, nil
}

// kafkaPerfPickLogPodName 在无序 List 结果中选取应读日志的 Pod（优先最新且已进入可读日志阶段）。
func kafkaPerfPickLogPodName(pods []corev1.Pod) string {
	if len(pods) == 0 {
		return ""
	}
	order := []corev1.PodPhase{corev1.PodSucceeded, corev1.PodFailed, corev1.PodRunning, corev1.PodPending}
	sort.SliceStable(pods, func(i, j int) bool {
		return pods[i].CreationTimestamp.After(pods[j].CreationTimestamp.Time)
	})
	for _, want := range order {
		for i := range pods {
			p := &pods[i]
			if p.DeletionTimestamp != nil {
				continue
			}
			if p.Status.Phase == want {
				return p.Name
			}
		}
	}
	for i := range pods {
		if pods[i].DeletionTimestamp == nil {
			return pods[i].Name
		}
	}
	return pods[0].Name
}

// appKafkaPerfGetJobLogs 读取 Job 对应 Pod 的完整日志。
func appKafkaPerfGetJobLogs(ctx context.Context, k8s *kubernetes.Clientset, ns, jobName string) (string, error) {
	pods, err := k8s.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{
		LabelSelector: "job-name=" + jobName,
	})
	if err != nil || len(pods.Items) == 0 {
		return "", fmt.Errorf("未找到 Job Pod")
	}
	podName := kafkaPerfPickLogPodName(pods.Items)
	if podName == "" {
		return "", fmt.Errorf("未找到可读日志的 Job Pod")
	}
	stream, err := k8s.CoreV1().Pods(ns).GetLogs(podName, &corev1.PodLogOptions{
		Container: "perf",
	}).Stream(ctx)
	if err != nil {
		return "", err
	}
	defer stream.Close()
	var buf bytes.Buffer
	_, _ = io.Copy(&buf, stream)
	return buf.String(), nil
}

func appKafkaPerfExtractError(log string) string {
	if log == "" {
		return ""
	}
	scanner := bufio.NewScanner(strings.NewReader(log))
	var lines []string
	for scanner.Scan() {
		line := scanner.Text()
		lower := strings.ToLower(line)
		if strings.Contains(lower, "error") || strings.Contains(lower, "exception") || strings.Contains(lower, "failed") {
			lines = append(lines, line)
			if len(lines) >= 5 {
				break
			}
		}
	}
	return strings.Join(lines, "\n")
}

// ── 日志解析 ──────────────────────────────────────────────────────────────────

// kafka-producer-perf-test.sh 最终汇总行（Apache Kafka；部分版本为 MiB/sec，极少数无 99.9th 行）：
// 500000 records sent, 98325.08 records/sec (96.02 MB/sec), 1.46 ms avg latency, 341.00 ms max latency, 1 ms 50th, 3 ms 95th, 7 ms 99th, 40 ms 99.9th.
var rePerfProducer = regexp.MustCompile(
	`(\d+)\s+records\s+sent,\s+([\d.]+)\s+records/sec\s+\(([\d.]+)\s+(?:MB|MiB)/sec\),\s+([\d.]+)\s+ms\s+avg\s+latency,\s+([\d.]+)\s+ms\s+max\s+latency,\s+(\d+)\s+ms\s+50th,\s+(\d+)\s+ms\s+95th,\s+(\d+)\s+ms\s+99th(?:,\s+(\d+)\s+ms\s+99\.9th)?`,
)

func parsePerfProducerOutput(log string) *KafkaPerfProducerResult {
	section := extractPerfSection(log, "===PERF_PRODUCER_START===", "===PERF_PRODUCER_END===")
	if section == "" {
		section = log
	}
	var last []string
	scanner := bufio.NewScanner(strings.NewReader(section))
	for scanner.Scan() {
		if m := rePerfProducer.FindStringSubmatch(scanner.Text()); m != nil {
			last = m
		}
	}
	if last == nil {
		return nil
	}
	r := &KafkaPerfProducerResult{}
	r.RecordsSent, _ = strconv.ParseInt(last[1], 10, 64)
	r.RecordsPerSec, _ = strconv.ParseFloat(last[2], 64)
	r.MBPerSec, _ = strconv.ParseFloat(last[3], 64)
	r.AvgLatencyMs, _ = strconv.ParseFloat(last[4], 64)
	r.MaxLatencyMs, _ = strconv.ParseFloat(last[5], 64)
	r.P50Ms, _ = strconv.ParseInt(last[6], 10, 64)
	r.P95Ms, _ = strconv.ParseInt(last[7], 10, 64)
	r.P99Ms, _ = strconv.ParseInt(last[8], 10, 64)
	if last[9] != "" {
		r.P999Ms, _ = strconv.ParseInt(last[9], 10, 64)
	}
	return r
}

// kafka-consumer-perf-test.sh 输出 CSV（header + data 行）：
// start.time, end.time, data.consumed.in.MB, MB.sec, data.consumed.in.nMsg, nMsg.sec, rebalance.time.ms, fetch.time.ms, fetch.MB.sec, fetch.nMsg.sec
func parsePerfConsumerOutput(log string) *KafkaPerfConsumerResult {
	section := extractPerfSection(log, "===PERF_CONSUMER_START===", "===PERF_CONSUMER_END===")
	if section == "" {
		section = log
	}
	scanner := bufio.NewScanner(strings.NewReader(section))
	var dataLine string
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		low := strings.ToLower(line)
		if line == "" || strings.HasPrefix(low, "start.time") || strings.HasPrefix(low, "time,") {
			continue
		}
		if strings.HasPrefix(low, "warning") {
			continue
		}
		parts := strings.Split(line, ",")
		// Apache Kafka 默认汇总行 10 列；旧版本仅 6 列（无 rebalance/fetch 统计）
		if len(parts) >= 10 {
			dataLine = line
		} else if len(parts) >= 6 {
			trim := func(s string) string { return strings.TrimSpace(s) }
			if _, err := strconv.ParseFloat(trim(parts[2]), 64); err == nil {
				if _, err2 := strconv.ParseInt(strings.TrimSpace(parts[4]), 10, 64); err2 == nil {
					dataLine = line
				}
			}
		}
	}
	if dataLine == "" {
		return nil
	}
	parts := strings.Split(dataLine, ",")
	trim := func(s string) string { return strings.TrimSpace(s) }
	r := &KafkaPerfConsumerResult{}
	if len(parts) >= 10 {
		r.DataConsumedMB, _ = strconv.ParseFloat(trim(parts[2]), 64)
		r.MBPerSec, _ = strconv.ParseFloat(trim(parts[3]), 64)
		r.MessagesCount, _ = strconv.ParseInt(trim(parts[4]), 10, 64)
		r.MsgPerSec, _ = strconv.ParseFloat(trim(parts[5]), 64)
		r.FetchMBPerSec, _ = strconv.ParseFloat(trim(parts[8]), 64)
		return r
	}
	if len(parts) >= 6 {
		r.DataConsumedMB, _ = strconv.ParseFloat(trim(parts[2]), 64)
		r.MBPerSec, _ = strconv.ParseFloat(trim(parts[3]), 64)
		r.MessagesCount, _ = strconv.ParseInt(trim(parts[4]), 10, 64)
		r.MsgPerSec, _ = strconv.ParseFloat(trim(parts[5]), 64)
		r.FetchMBPerSec = r.MBPerSec
		return r
	}
	return nil
}

func extractPerfSection(log, startMark, endMark string) string {
	start := strings.Index(log, startMark)
	if start == -1 {
		return ""
	}
	start += len(startMark)
	end := strings.Index(log[start:], endMark)
	if end == -1 {
		return log[start:]
	}
	return log[start : start+end]
}

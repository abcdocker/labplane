package internal

import (
	"context"
	"fmt"
	"regexp"
	"strings"

	appsv1 "k8s.io/api/apps/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

func kafkaStsDesired(s *appsv1.StatefulSet) int32 {
	if s == nil || s.Spec.Replicas == nil {
		return 0
	}
	return *s.Spec.Replicas
}

// AppKafkaRolloutReady 当 ZK 与 Kafka StatefulSet 的 ReadyReplicas 均达到期望副本数时为 true。
func AppKafkaRolloutReady(ctx context.Context, k8s *kubernetes.Clientset, ns, base string) (ready bool, detail map[string]interface{}, err error) {
	ns = strings.TrimSpace(ns)
	base = strings.TrimSpace(base)
	detail = map[string]interface{}{
		"namespace":        ns,
		"baseName":         base,
		"zkStatefulSet":    kafkaZkSTSName(base),
		"kafkaStatefulSet": kafkaKafkaSTSName(base),
	}
	if ns == "" || base == "" || k8s == nil {
		detail["message"] = "缺少命名空间或部署名"
		return false, detail, nil
	}
	zName := kafkaZkSTSName(base)
	kName := kafkaKafkaSTSName(base)

	zsts, err := k8s.AppsV1().StatefulSets(ns).Get(ctx, zName, metav1.GetOptions{})
	if err != nil {
		if apierrors.IsNotFound(err) {
			detail["zkFound"] = false
			detail["message"] = "未找到 ZooKeeper StatefulSet"
			return false, detail, nil
		}
		return false, detail, err
	}
	detail["zkFound"] = true
	zWant := kafkaStsDesired(zsts)
	zReady := zsts.Status.ReadyReplicas
	detail["zkDesired"] = zWant
	detail["zkReady"] = zReady
	detail["zkUpdated"] = zsts.Status.UpdatedReplicas

	ksts, err := k8s.AppsV1().StatefulSets(ns).Get(ctx, kName, metav1.GetOptions{})
	if err != nil {
		if apierrors.IsNotFound(err) {
			detail["kafkaFound"] = false
			detail["message"] = "未找到 Kafka StatefulSet"
			return false, detail, nil
		}
		return false, detail, err
	}
	detail["kafkaFound"] = true
	kWant := kafkaStsDesired(ksts)
	kReady := ksts.Status.ReadyReplicas
	detail["kafkaDesired"] = kWant
	detail["kafkaReady"] = kReady
	detail["kafkaUpdated"] = ksts.Status.UpdatedReplicas

	if zWant <= 0 || kWant <= 0 {
		detail["message"] = "副本数未就绪"
		return false, detail, nil
	}
	if zReady < zWant {
		detail["message"] = fmt.Sprintf("ZooKeeper 就绪 %d/%d", zReady, zWant)
		return false, detail, nil
	}
	if kReady < kWant {
		detail["message"] = fmt.Sprintf("Kafka 就绪 %d/%d", kReady, kWant)
		return false, detail, nil
	}
	detail["message"] = "工作负载已就绪"
	detail["ready"] = true
	return true, detail, nil
}

// AppKafkaRolloutWithUsage 在 rollout 基础上附加 Prometheus 聚合用量（可选）。
func AppKafkaRolloutWithUsage(ctx context.Context, k8s *kubernetes.Clientset, cfg Config, ns, base string) (map[string]interface{}, error) {
	ready, detail, err := AppKafkaRolloutReady(ctx, k8s, ns, base)
	if err != nil {
		return nil, err
	}
	detail["clusterReady"] = ready

	prom := strings.TrimSpace(GetPrometheusURLForScope(cfg, "k8s"))
	if prom == "" {
		detail["prometheusConfigured"] = false
		return detail, nil
	}
	detail["prometheusConfigured"] = true
	esc := regexp.QuoteMeta(strings.TrimSpace(base))
	podRe := fmt.Sprintf("%s-zk-[0-9]+|%s-kafka-[0-9]+", esc, esc)
	nsQ := strings.TrimSpace(ns)
	cpuQ := fmt.Sprintf(`sum(rate(container_cpu_usage_seconds_total{namespace=%q,pod=~%q,container!=""}[2m]))`, nsQ, podRe)
	memQ := fmt.Sprintf(`sum(container_memory_working_set_bytes{namespace=%q,pod=~%q,container!=""})`, nsQ, podRe)
	detail["cpuQuery"] = cpuQ
	detail["memQuery"] = memQ
	if cpu := PrometheusPromQLInstantScalar(cfg, "k8s", cpuQ); cpu != nil {
		detail["cpuUsageCores"] = *cpu
	}
	if mem := PrometheusPromQLInstantScalar(cfg, "k8s", memQ); mem != nil {
		detail["memUsageBytes"] = *mem
	}
	return detail, nil
}

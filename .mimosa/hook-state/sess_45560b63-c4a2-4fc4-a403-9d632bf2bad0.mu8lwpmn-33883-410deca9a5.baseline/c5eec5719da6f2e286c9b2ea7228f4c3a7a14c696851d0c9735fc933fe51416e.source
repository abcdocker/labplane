package internal

import (
	"context"
	"fmt"
	"strings"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/client-go/kubernetes"
)

// DeleteKafkaK8sResources 删除平台一键部署的 Kafka + ZooKeeper：StatefulSet、Headless Service、以及带 kube-bt-sync 标签的 PVC（含 ZK 与 Kafka 的 data-* 卷）。
func DeleteKafkaK8sResources(ctx context.Context, k8s *kubernetes.Clientset, ns, base string) []string {
	var warnings []string
	if k8s == nil {
		return []string{"Kubernetes 未连接"}
	}
	ns = strings.TrimSpace(ns)
	base = strings.TrimSpace(base)
	if ns == "" || base == "" {
		return []string{"命名空间或部署名为空"}
	}
	prop := metav1.DeletePropagationForeground
	fg := metav1.DeleteOptions{PropagationPolicy: &prop}

	kSTS := kafkaKafkaSTSName(base)
	zkSTS := kafkaZkSTSName(base)
	kSvc := kafkaKafkaHLName(base)
	zkSvc := kafkaZkHLName(base)

	// 先删 Kafka 再删 ZK，避免 broker 仍连 ZK 时长时间卡住（Foreground 会等 Pod 终止）。
	if err := k8s.AppsV1().StatefulSets(ns).Delete(ctx, kSTS, fg); err != nil && !apierrors.IsNotFound(err) {
		warnings = append(warnings, fmt.Sprintf("Kafka StatefulSet %s: %v", kSTS, err))
	}
	if err := k8s.AppsV1().StatefulSets(ns).Delete(ctx, zkSTS, fg); err != nil && !apierrors.IsNotFound(err) {
		warnings = append(warnings, fmt.Sprintf("ZooKeeper StatefulSet %s: %v", zkSTS, err))
	}
	if err := k8s.CoreV1().Services(ns).Delete(ctx, kSvc, metav1.DeleteOptions{}); err != nil && !apierrors.IsNotFound(err) {
		warnings = append(warnings, fmt.Sprintf("Kafka Service %s: %v", kSvc, err))
	}
	if err := k8s.CoreV1().Services(ns).Delete(ctx, zkSvc, metav1.DeleteOptions{}); err != nil && !apierrors.IsNotFound(err) {
		warnings = append(warnings, fmt.Sprintf("ZooKeeper Service %s: %v", zkSvc, err))
	}

	kafkaDeleteNodePortServicesRange(ctx, k8s, ns, base, 0, 16)

	sel := labels.Set{
		"app.kubernetes.io/name":       base,
		"kube-bt-sync.io/kafka":        "true",
		"app.kubernetes.io/managed-by": "kube-bt-sync",
	}.AsSelector().String()
	pl, err := k8s.CoreV1().PersistentVolumeClaims(ns).List(ctx, metav1.ListOptions{LabelSelector: sel})
	if err != nil {
		warnings = append(warnings, fmt.Sprintf("列举 PVC: %v", err))
	} else {
		for i := range pl.Items {
			pn := pl.Items[i].Name
			if err := k8s.CoreV1().PersistentVolumeClaims(ns).Delete(ctx, pn, metav1.DeleteOptions{}); err != nil && !apierrors.IsNotFound(err) {
				warnings = append(warnings, fmt.Sprintf("PVC %s: %v", pn, err))
			}
		}
	}
	return warnings
}

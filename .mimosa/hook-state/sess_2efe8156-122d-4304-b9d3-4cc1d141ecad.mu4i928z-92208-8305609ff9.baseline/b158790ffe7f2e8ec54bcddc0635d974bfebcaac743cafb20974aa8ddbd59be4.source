package internal

import (
	"context"
	"fmt"
	"strings"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

const redisClusterPVCOrdinalCount = 6

// DeleteAppRedisK8sStack 删除应用中心 Redis K8s 一键部署产生的资源（含 PVC）；topology 为 stored 中的 k8sTopology（standalone / sentinel / cluster）。
func DeleteAppRedisK8sStack(ctx context.Context, k8s *kubernetes.Clientset, ns, base, topology string) []string {
	var warnings []string
	ns = strings.TrimSpace(ns)
	base = strings.TrimSpace(base)
	if k8s == nil || ns == "" || base == "" {
		return nil
	}
	top := strings.ToLower(strings.TrimSpace(topology))
	if top == "" {
		top = "standalone"
	}
	prop := metav1.DeletePropagationForeground
	fg := metav1.DeleteOptions{PropagationPolicy: &prop}
	del := func(desc string, fn func() error) {
		if err := fn(); err != nil && !apierrors.IsNotFound(err) {
			warnings = append(warnings, fmt.Sprintf("%s: %v", desc, err))
		}
	}

	secretName := redisAuthSecretName(base)

	switch top {
	case "cluster":
		jobName := base + "-cluster-init"
		stsName := base + "-cluster"
		headlessName := base + "-cluster-headless"
		accessName := base + "-cluster-access"

		del("Job "+jobName, func() error {
			return k8s.BatchV1().Jobs(ns).Delete(ctx, jobName, fg)
		})
		del("StatefulSet "+stsName, func() error {
			return k8s.AppsV1().StatefulSets(ns).Delete(ctx, stsName, fg)
		})
		del("Service "+accessName, func() error {
			return k8s.CoreV1().Services(ns).Delete(ctx, accessName, metav1.DeleteOptions{})
		})
		del("Service "+headlessName, func() error {
			return k8s.CoreV1().Services(ns).Delete(ctx, headlessName, metav1.DeleteOptions{})
		})
		for i := 0; i < redisClusterPVCOrdinalCount; i++ {
			pvcName := fmt.Sprintf("data-%s-%d", stsName, i)
			if err := k8s.CoreV1().PersistentVolumeClaims(ns).Delete(ctx, pvcName, metav1.DeleteOptions{}); err != nil && !apierrors.IsNotFound(err) {
				warnings = append(warnings, fmt.Sprintf("PVC %s: %v", pvcName, err))
			}
		}
		del("Secret "+secretName, func() error {
			return k8s.CoreV1().Secrets(ns).Delete(ctx, secretName, metav1.DeleteOptions{})
		})

	case "sentinel":
		masterName := base + "-master"
		replicaName := base + "-replica"
		sentinelSts := base + "-sentinel"

		del("Deployment "+replicaName, func() error {
			return k8s.AppsV1().Deployments(ns).Delete(ctx, replicaName, fg)
		})
		del("Deployment "+masterName, func() error {
			return k8s.AppsV1().Deployments(ns).Delete(ctx, masterName, fg)
		})
		del("StatefulSet "+sentinelSts, func() error {
			return k8s.AppsV1().StatefulSets(ns).Delete(ctx, sentinelSts, fg)
		})
		del("Service "+masterName, func() error {
			return k8s.CoreV1().Services(ns).Delete(ctx, masterName, metav1.DeleteOptions{})
		})
		del("Service "+sentinelSts, func() error {
			return k8s.CoreV1().Services(ns).Delete(ctx, sentinelSts, metav1.DeleteOptions{})
		})
		masterPVC := redisDataPVCName(masterName)
		del("PVC "+masterPVC, func() error {
			return k8s.CoreV1().PersistentVolumeClaims(ns).Delete(ctx, masterPVC, metav1.DeleteOptions{})
		})
		for i := 0; i < 3; i++ {
			pvcName := fmt.Sprintf("sentinel-data-%s-%d", sentinelSts, i)
			if err := k8s.CoreV1().PersistentVolumeClaims(ns).Delete(ctx, pvcName, metav1.DeleteOptions{}); err != nil && !apierrors.IsNotFound(err) {
				warnings = append(warnings, fmt.Sprintf("PVC %s: %v", pvcName, err))
			}
		}
		del("Secret "+secretName, func() error {
			return k8s.CoreV1().Secrets(ns).Delete(ctx, secretName, metav1.DeleteOptions{})
		})

	default:
		del("Deployment "+base, func() error {
			return k8s.AppsV1().Deployments(ns).Delete(ctx, base, fg)
		})
		del("Service "+base, func() error {
			return k8s.CoreV1().Services(ns).Delete(ctx, base, metav1.DeleteOptions{})
		})
		dataPVC := redisDataPVCName(base)
		del("PVC "+dataPVC, func() error {
			return k8s.CoreV1().PersistentVolumeClaims(ns).Delete(ctx, dataPVC, metav1.DeleteOptions{})
		})
		del("Secret "+secretName, func() error {
			return k8s.CoreV1().Secrets(ns).Delete(ctx, secretName, metav1.DeleteOptions{})
		})
	}

	return warnings
}

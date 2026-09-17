package internal

import (
	"context"
	"fmt"
	"strings"

	batchv1 "k8s.io/api/batch/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// AppRedisK8sRolloutStatus 查询应用中心 Redis K8s 部署的就绪概况（用于实例列表与轮询）。
func AppRedisK8sRolloutStatus(ctx context.Context, k8s *kubernetes.Clientset, st *appRedisStoredConfig) (map[string]interface{}, error) {
	if k8s == nil || strings.TrimSpace(st.K8sNamespace) == "" || strings.TrimSpace(st.K8sBaseName) == "" {
		return nil, fmt.Errorf("无 K8s 元数据")
	}
	ns := strings.TrimSpace(st.K8sNamespace)
	base := strings.TrimSpace(st.K8sBaseName)
	top := strings.TrimSpace(st.K8sTopology)
	if top == "" {
		top = "standalone"
	}

	switch top {
	case "sentinel":
		return sentinelRolloutStatus(ctx, k8s, ns, base)
	case "cluster":
		return clusterRolloutStatus(ctx, k8s, ns, base)
	default:
		return standaloneRolloutStatus(ctx, k8s, ns, base)
	}
}

func standaloneRolloutStatus(ctx context.Context, k8s *kubernetes.Clientset, ns, base string) (map[string]interface{}, error) {
	dep, err := k8s.AppsV1().Deployments(ns).Get(ctx, base, metav1.GetOptions{})
	if err != nil {
		if apierrors.IsNotFound(err) {
			return rolloutJSON("unknown", "Deployment 不存在", nil), nil
		}
		return nil, err
	}
	des := int32(1)
	if dep.Spec.Replicas != nil {
		des = *dep.Spec.Replicas
	}
	rdy := dep.Status.ReadyReplicas
	phase, msg := phaseFromCounts(rdy, des, "Deployment")
	return rolloutJSON(phase, msg, []map[string]interface{}{
		{"kind": "Deployment", "name": base, "ready": rdy, "desired": des},
	}), nil
}

func sentinelRolloutStatus(ctx context.Context, k8s *kubernetes.Clientset, ns, base string) (map[string]interface{}, error) {
	master := base + "-master"
	replica := base + "-replica"
	stsName := base + "-sentinel"
	var parts []map[string]interface{}
	var minPhase string = "ready"

	addDep := func(name string) error {
		dep, err := k8s.AppsV1().Deployments(ns).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			if apierrors.IsNotFound(err) {
				parts = append(parts, map[string]interface{}{"kind": "Deployment", "name": name, "ready": 0, "desired": 0, "missing": true})
				minPhase = worsePhase(minPhase, "unknown")
				return nil
			}
			return err
		}
		des := int32(1)
		if dep.Spec.Replicas != nil {
			des = *dep.Spec.Replicas
		}
		rdy := dep.Status.ReadyReplicas
		ph, _ := phaseFromCounts(rdy, des, "")
		minPhase = worsePhase(minPhase, ph)
		parts = append(parts, map[string]interface{}{"kind": "Deployment", "name": name, "ready": rdy, "desired": des})
		return nil
	}
	if err := addDep(master); err != nil {
		return nil, err
	}
	if err := addDep(replica); err != nil {
		return nil, err
	}

	sts, err := k8s.AppsV1().StatefulSets(ns).Get(ctx, stsName, metav1.GetOptions{})
	if err != nil {
		if apierrors.IsNotFound(err) {
			parts = append(parts, map[string]interface{}{"kind": "StatefulSet", "name": stsName, "ready": 0, "desired": 0, "missing": true})
			minPhase = worsePhase(minPhase, "unknown")
		} else {
			return nil, err
		}
	} else {
		des := int32(3)
		if sts.Spec.Replicas != nil {
			des = *sts.Spec.Replicas
		}
		rdy := sts.Status.ReadyReplicas
		ph, _ := phaseFromCounts(rdy, des, "")
		minPhase = worsePhase(minPhase, ph)
		parts = append(parts, map[string]interface{}{"kind": "StatefulSet", "name": stsName, "ready": rdy, "desired": des})
	}

	msg := summarizeParts(parts)
	return rolloutJSON(minPhase, msg, parts), nil
}

func clusterRolloutStatus(ctx context.Context, k8s *kubernetes.Clientset, ns, base string) (map[string]interface{}, error) {
	stsName := base + "-cluster"
	jobName := base + "-cluster-init"
	var parts []map[string]interface{}
	minPhase := "ready"

	sts, err := k8s.AppsV1().StatefulSets(ns).Get(ctx, stsName, metav1.GetOptions{})
	if err != nil {
		if apierrors.IsNotFound(err) {
			return rolloutJSON("unknown", "StatefulSet 不存在", nil), nil
		}
		return nil, err
	}
	des := int32(clusterNodeCount)
	if sts.Spec.Replicas != nil {
		des = *sts.Spec.Replicas
	}
	rdy := sts.Status.ReadyReplicas
	ph, _ := phaseFromCounts(rdy, des, "")
	minPhase = worsePhase(minPhase, ph)
	parts = append(parts, map[string]interface{}{"kind": "StatefulSet", "name": stsName, "ready": rdy, "desired": des})

	job, err := k8s.BatchV1().Jobs(ns).Get(ctx, jobName, metav1.GetOptions{})
	if err != nil {
		if apierrors.IsNotFound(err) {
			// TTL 清理后 Job 可能已删除；若 STS 已就绪则视为集群初始化完成
			if rdy >= des && des > 0 {
				parts = append(parts, map[string]interface{}{"kind": "Job", "name": jobName, "phase": "complete", "note": "Job 已清理"})
			} else {
				parts = append(parts, map[string]interface{}{"kind": "Job", "name": jobName, "phase": "unknown", "missing": true})
				minPhase = worsePhase(minPhase, "progressing")
			}
		} else {
			return nil, err
		}
	} else {
		jph := jobPhase(job)
		minPhase = worsePhase(minPhase, jph)
		parts = append(parts, map[string]interface{}{
			"kind":      "Job",
			"name":      jobName,
			"succeeded": job.Status.Succeeded,
			"failed":    job.Status.Failed,
			"active":    job.Status.Active,
			"phase":     jph,
		})
	}

	msg := summarizeParts(parts)
	return rolloutJSON(minPhase, msg, parts), nil
}

func jobPhase(job *batchv1.Job) string {
	if job.Status.Succeeded > 0 {
		return "ready"
	}
	if job.Status.Failed > 0 {
		return "failed"
	}
	if job.Status.Active > 0 || (job.Spec.Completions != nil && job.Status.Succeeded < *job.Spec.Completions) {
		return "progressing"
	}
	return "progressing"
}

func phaseFromCounts(ready, desired int32, _ string) (phase string, detail string) {
	if desired <= 0 {
		return "progressing", "0 副本"
	}
	if ready >= desired {
		return "ready", fmt.Sprintf("%d/%d", ready, desired)
	}
	if ready == 0 {
		return "progressing", fmt.Sprintf("0/%d", desired)
	}
	return "progressing", fmt.Sprintf("%d/%d", ready, desired)
}

func worsePhase(a, b string) string {
	order := map[string]int{"failed": 4, "unknown": 3, "progressing": 2, "ready": 1}
	if order[b] > order[a] {
		return b
	}
	return a
}

func rolloutJSON(phase, summary string, components interface{}) map[string]interface{} {
	return map[string]interface{}{
		"phase":      phase,
		"summary":    summary,
		"components": components,
	}
}

func summarizeParts(parts []map[string]interface{}) string {
	var b strings.Builder
	for i, p := range parts {
		if i > 0 {
			b.WriteString(" · ")
		}
		k, _ := p["kind"].(string)
		n, _ := p["name"].(string)
		if x, ok := p["missing"].(bool); ok && x {
			b.WriteString(fmt.Sprintf("%s/%s 缺失", k, n))
			continue
		}
		if k == "Job" {
			ph, _ := p["phase"].(string)
			b.WriteString(fmt.Sprintf("Job %s %s", n, ph))
			continue
		}
		rdy, _ := p["ready"].(int32)
		des, _ := p["desired"].(int32)
		b.WriteString(fmt.Sprintf("%s %s %d/%d", k, n, rdy, des))
	}
	if b.Len() == 0 {
		return "—"
	}
	return b.String()
}

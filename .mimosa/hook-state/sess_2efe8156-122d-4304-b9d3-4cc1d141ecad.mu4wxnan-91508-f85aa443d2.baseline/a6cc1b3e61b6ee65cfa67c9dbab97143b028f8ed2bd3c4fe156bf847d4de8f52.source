package internal

import (
	"context"
	"fmt"
	"strings"
	"time"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// podSpecWorkloadRequests 累加工作容器 requests（与 PodWorkloadResourcesTotals 一致，不含 init）。
func podSpecWorkloadRequests(spec *corev1.PodSpec) (cpuMilli, memBytes int64) {
	if spec == nil {
		return 0, 0
	}
	for _, c := range spec.Containers {
		if q, ok := c.Resources.Requests[corev1.ResourceCPU]; ok {
			cpuMilli += q.MilliValue()
		}
		if q, ok := c.Resources.Requests[corev1.ResourceMemory]; ok {
			memBytes += q.Value()
		}
	}
	return cpuMilli, memBytes
}

func nodeMatchesNodeSelector(n *corev1.Node, sel map[string]string) bool {
	if len(sel) == 0 {
		return true
	}
	for k, want := range sel {
		if strings.TrimSpace(want) == "" {
			continue
		}
		if n.Labels[k] != want {
			return false
		}
	}
	return true
}

func nodeIsSchedulable(n *corev1.Node) bool {
	return !n.Spec.Unschedulable
}

// nodeLikelyBlockedByNoScheduleTaints：Pod 无 tolerations 时，带 NoSchedule 污点的节点通常不可调度（如 control-plane）。
func nodeLikelyBlockedByNoScheduleTaints(podSpec *corev1.PodSpec, n *corev1.Node) bool {
	if podSpec != nil && len(podSpec.Tolerations) > 0 {
		return false
	}
	for _, t := range n.Spec.Taints {
		if t.Effect == corev1.TaintEffectNoSchedule {
			return true
		}
	}
	return false
}

func sumAllocatedRequestsOnNode(ctx context.Context, k8s *kubernetes.Clientset, nodeName string) (cpuMilli, memBytes int64, err error) {
	ctx2, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()
	list, err := k8s.CoreV1().Pods("").List(ctx2, metav1.ListOptions{
		FieldSelector: "spec.nodeName=" + nodeName,
	})
	if err != nil {
		return 0, 0, err
	}
	for _, p := range list.Items {
		ph := p.Status.Phase
		if ph != corev1.PodRunning && ph != corev1.PodPending {
			continue
		}
		cm, mb := podSpecWorkloadRequests(&p.Spec)
		cpuMilli += cm
		memBytes += mb
	}
	return cpuMilli, memBytes, nil
}

// WorkloadSchedulingPrecheckResult 保存 Deployment/StatefulSet 前调度余量预检（简化：至少存在一个可承载单副本的节点）。
type WorkloadSchedulingPrecheckResult struct {
	OK                    bool   `json:"ok"`
	Message               string `json:"message,omitempty"`
	PodCpuRequestMilli    int64  `json:"podCpuRequestMilli"`
	PodMemRequestBytes    int64  `json:"podMemRequestBytes"`
	MaxNodeFreeCpuMilli   int64  `json:"maxNodeFreeCpuMilli"`
	MaxNodeFreeMemBytes   int64  `json:"maxNodeFreeMemBytes"`
	NodesConsidered       int    `json:"nodesConsidered"`
	NodesMatchingSelector int    `json:"nodesMatchingSelector"`
}

func humanCpuMilli(m int64) string {
	if m < 1000 {
		return fmt.Sprintf("%dm", m)
	}
	return fmt.Sprintf("%.2fc", float64(m)/1000.0)
}

func humanMemBytes(b int64) string {
	if b <= 0 {
		return "0"
	}
	if b >= 1024*1024*1024 {
		return fmt.Sprintf("%.2fGi", float64(b)/float64(1024*1024*1024))
	}
	return fmt.Sprintf("%.0fMi", float64(b)/float64(1024*1024))
}

// EvaluateWorkloadPodScheduling 基于节点 Allocatable 与已调度 Pod 的 requests 合计，判断 Pod 模板是否可能在某节点调度成功。
func EvaluateWorkloadPodScheduling(ctx context.Context, k8s *kubernetes.Clientset, podSpec *corev1.PodSpec) (*WorkloadSchedulingPrecheckResult, error) {
	res := &WorkloadSchedulingPrecheckResult{OK: true}
	if podSpec == nil {
		return res, nil
	}
	reqCPU, reqMem := podSpecWorkloadRequests(podSpec)
	res.PodCpuRequestMilli = reqCPU
	res.PodMemRequestBytes = reqMem
	if reqCPU <= 0 && reqMem <= 0 {
		return res, nil
	}

	ctx2, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	nodes, err := k8s.CoreV1().Nodes().List(ctx2, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var maxFreeCPU, maxFreeMem int64
	var anyFit bool
	sel := podSpec.NodeSelector
	for i := range nodes.Items {
		n := &nodes.Items[i]
		res.NodesConsidered++
		if !nodeIsSchedulable(n) {
			continue
		}
		if nodeLikelyBlockedByNoScheduleTaints(podSpec, n) {
			continue
		}
		if !nodeMatchesNodeSelector(n, sel) {
			continue
		}
		res.NodesMatchingSelector++

		alloc := n.Status.Allocatable
		allocCPU := alloc.Cpu().MilliValue()
		allocMem := alloc.Memory().Value()
		usedCPU, usedMem, err := sumAllocatedRequestsOnNode(ctx2, k8s, n.Name)
		if err != nil {
			return nil, err
		}
		freeCPU := allocCPU - usedCPU
		freeMem := allocMem - usedMem
		if freeCPU > maxFreeCPU {
			maxFreeCPU = freeCPU
		}
		if freeMem > maxFreeMem {
			maxFreeMem = freeMem
		}
		if reqCPU <= freeCPU && reqMem <= freeMem {
			anyFit = true
		}
	}
	res.MaxNodeFreeCpuMilli = maxFreeCPU
	res.MaxNodeFreeMemBytes = maxFreeMem

	if anyFit {
		res.OK = true
		return res, nil
	}
	res.OK = false
	res.Message = fmt.Sprintf(
		"调度预检：单 Pod 申请约 CPU %s / Memory %s，但在匹配 nodeSelector 的可调度节点上，观测到的最大空闲余量约 CPU %s / Memory %s（按各节点 Allocatable 减已调度 Running/Pending Pod 的 requests 估算，未计入临时滚动双副本、污点容忍等）。请下调 resources.requests、放宽 nodeSelector，或扩容节点。",
		humanCpuMilli(reqCPU), humanMemBytes(reqMem),
		humanCpuMilli(maxFreeCPU), humanMemBytes(maxFreeMem),
	)
	return res, nil
}

// PrecheckDeploymentScheduling 更新前预检（忽略 namespace 字段仅用于消息）。
func PrecheckDeploymentScheduling(ctx context.Context, k8s *kubernetes.Clientset, dep *appsv1.Deployment) (*WorkloadSchedulingPrecheckResult, error) {
	if dep == nil {
		return &WorkloadSchedulingPrecheckResult{OK: true}, nil
	}
	return EvaluateWorkloadPodScheduling(ctx, k8s, &dep.Spec.Template.Spec)
}

func PrecheckStatefulSetScheduling(ctx context.Context, k8s *kubernetes.Clientset, sts *appsv1.StatefulSet) (*WorkloadSchedulingPrecheckResult, error) {
	if sts == nil {
		return &WorkloadSchedulingPrecheckResult{OK: true}, nil
	}
	return EvaluateWorkloadPodScheduling(ctx, k8s, &sts.Spec.Template.Spec)
}

package internal

import (
	"fmt"
	"net/http"
	"sort"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// k8sNamespaceStatRow 命名空间维度：五类资源数量 + 时间字段（供控制台列表展示）
type k8sNamespaceStatRow struct {
	Namespace string `json:"namespace"`
	PodCount  int    `json:"podCount"`
	// Deployment 数量（apps/v1）
	DeploymentCount int `json:"deploymentCount"`
	// StatefulSet 数量（apps/v1）
	StatefulSetCount int `json:"statefulSetCount"`
	ServiceCount     int `json:"serviceCount"`
	PVCCount         int `json:"pvcCount"`
	// Namespace 资源 metadata.creationTimestamp（RFC3339）
	NamespaceCreated string `json:"namespaceCreated,omitempty"`
	// 该命名空间内上述五类资源 + Namespace 自身中，最新的 metadata.creationTimestamp（RFC3339）
	LatestObjectCreated string `json:"latestObjectCreated,omitempty"`
}

type k8sNamespaceStatsResponse struct {
	// 本响应生成时间（UTC RFC3339），即「数据更新时间」
	ComputedAt string `json:"computedAt"`
	Items      []k8sNamespaceStatRow `json:"items"`
}

func maxMergeTime(current *time.Time, ts metav1.Time) *time.Time {
	if ts.IsZero() {
		return current
	}
	t := ts.Time
	if current == nil || t.After(*current) {
		tt := t
		return &tt
	}
	return current
}

func handleK8sNamespaceStats(c *gin.Context, k8s *kubernetes.Clientset) {
	if !GuardK8s(c, k8s) {
		return
	}
	ctx := c.Request.Context()
	computedAt := time.Now().UTC().Format(time.RFC3339)

	var nsList *corev1.NamespaceList
	var podList *corev1.PodList
	var depList *appsv1.DeploymentList
	var stsList *appsv1.StatefulSetList
	var svcList *corev1.ServiceList
	var pvcList *corev1.PersistentVolumeClaimList

	var mu sync.Mutex
	var firstErr error
	var wg sync.WaitGroup

	run := func(name string, fn func() error) {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := fn(); err != nil {
				mu.Lock()
				if firstErr == nil {
					firstErr = fmt.Errorf("%s: %w", name, err)
				}
				mu.Unlock()
			}
		}()
	}

	run("Namespace", func() error {
		var err error
		nsList, err = k8s.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
		return err
	})
	run("Pod", func() error {
		var err error
		podList, err = k8s.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
		return err
	})
	run("Deployment", func() error {
		var err error
		depList, err = k8s.AppsV1().Deployments("").List(ctx, metav1.ListOptions{})
		return err
	})
	run("StatefulSet", func() error {
		var err error
		stsList, err = k8s.AppsV1().StatefulSets("").List(ctx, metav1.ListOptions{})
		return err
	})
	run("Service", func() error {
		var err error
		svcList, err = k8s.CoreV1().Services("").List(ctx, metav1.ListOptions{})
		return err
	})
	run("PVC", func() error {
		var err error
		pvcList, err = k8s.CoreV1().PersistentVolumeClaims("").List(ctx, metav1.ListOptions{})
		return err
	})

	wg.Wait()

	if firstErr != nil {
		RespondAPIError500(c, firstErr.Error())
		return
	}
	type agg struct {
		pod, dep, sts, svc, pvc int
		latest                    *time.Time
	}

	byNS := make(map[string]*agg, len(nsList.Items))
	for _, ns := range nsList.Items {
		a := &agg{}
		if !ns.CreationTimestamp.IsZero() {
			a.latest = maxMergeTime(a.latest, ns.CreationTimestamp)
		}
		byNS[ns.Name] = a
	}

	for _, p := range podList.Items {
		a := byNS[p.Namespace]
		if a == nil {
			continue
		}
		a.pod++
		a.latest = maxMergeTime(a.latest, p.CreationTimestamp)
	}
	for _, d := range depList.Items {
		a := byNS[d.Namespace]
		if a == nil {
			continue
		}
		a.dep++
		a.latest = maxMergeTime(a.latest, d.CreationTimestamp)
	}
	for _, s := range stsList.Items {
		a := byNS[s.Namespace]
		if a == nil {
			continue
		}
		a.sts++
		a.latest = maxMergeTime(a.latest, s.CreationTimestamp)
	}
	for _, s := range svcList.Items {
		a := byNS[s.Namespace]
		if a == nil {
			continue
		}
		a.svc++
		a.latest = maxMergeTime(a.latest, s.CreationTimestamp)
	}
	for _, p := range pvcList.Items {
		a := byNS[p.Namespace]
		if a == nil {
			continue
		}
		a.pvc++
		a.latest = maxMergeTime(a.latest, p.CreationTimestamp)
	}

	items := make([]k8sNamespaceStatRow, 0, len(nsList.Items))
	for _, ns := range nsList.Items {
		a := byNS[ns.Name]
		if a == nil {
			continue
		}
		row := k8sNamespaceStatRow{
			Namespace:        ns.Name,
			PodCount:         a.pod,
			DeploymentCount: a.dep,
			StatefulSetCount: a.sts,
			ServiceCount:     a.svc,
			PVCCount:         a.pvc,
		}
		if !ns.CreationTimestamp.IsZero() {
			row.NamespaceCreated = ns.CreationTimestamp.Time.UTC().Format(time.RFC3339)
		}
		if a.latest != nil {
			row.LatestObjectCreated = a.latest.UTC().Format(time.RFC3339)
		}
		items = append(items, row)
	}

	sort.Slice(items, func(i, j int) bool { return items[i].Namespace < items[j].Namespace })

	c.JSON(http.StatusOK, k8sNamespaceStatsResponse{
		ComputedAt: computedAt,
		Items:      items,
	})
}

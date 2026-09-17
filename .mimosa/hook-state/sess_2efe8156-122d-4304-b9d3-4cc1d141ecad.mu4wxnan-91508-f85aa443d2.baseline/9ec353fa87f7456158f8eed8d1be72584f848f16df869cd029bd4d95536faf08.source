package internal

import (
	"context"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// PrometheusDiscoverCandidate 集群内可能为 Prometheus HTTP 端点的 Service。
type PrometheusDiscoverCandidate struct {
	ID        string `json:"id"`
	Namespace string `json:"namespace"`
	Name      string `json:"name"`
	Port      int32  `json:"port"`
	PortName  string `json:"portName,omitempty"`
	BaseURL   string `json:"baseUrl"`
	Reason    string `json:"reason"`
}

func serviceLooksLikePrometheus(svc *corev1.Service) bool {
	ln := strings.ToLower(svc.Name)
	if strings.Contains(ln, "alertmanager") || strings.Contains(ln, "grafana") || strings.Contains(ln, "oauth") {
		return false
	}
	return strings.Contains(ln, "prometheus") || strings.Contains(ln, "thanos-query") || strings.Contains(ln, "thanos-querier")
}

func namespaceOKForPort9090(ns string) bool {
	n := strings.ToLower(ns)
	if n == "kube-system" || n == "kube-public" || n == "kube-node-lease" {
		return false
	}
	return strings.Contains(n, "monitoring") || strings.Contains(n, "observability") ||
		strings.Contains(n, "openshift") || strings.Contains(n, "prometheus") ||
		strings.Contains(n, "lens-metrics")
}

func portLooksLikePrometheusHTTP(p corev1.ServicePort) bool {
	if p.Protocol != "" && p.Protocol != corev1.ProtocolTCP {
		return false
	}
	if p.Port == 9090 || p.Port == 9091 {
		return true
	}
	pn := strings.ToLower(p.Name)
	return strings.Contains(pn, "web") || strings.Contains(pn, "http") || strings.Contains(pn, "prom")
}

func buildServiceBaseURL(svc *corev1.Service, port int32) string {
	return fmt.Sprintf("http://%s.%s.svc:%d", svc.Name, svc.Namespace, port)
}

func appendCandidate(out *[]PrometheusDiscoverCandidate, seen map[string]struct{}, svc *corev1.Service, sp corev1.ServicePort, reason string) {
	if sp.Port <= 0 {
		return
	}
	base := buildServiceBaseURL(svc, sp.Port)
	if _, ok := seen[base]; ok {
		return
	}
	seen[base] = struct{}{}
	id := fmt.Sprintf("%s/%s:%d", svc.Namespace, svc.Name, sp.Port)
	pn := sp.Name
	*out = append(*out, PrometheusDiscoverCandidate{
		ID:        id,
		Namespace: svc.Namespace,
		Name:      svc.Name,
		Port:      sp.Port,
		PortName:  pn,
		BaseURL:   base,
		Reason:    reason,
	})
}

func discoverPrometheusFromServices(list *corev1.ServiceList) []PrometheusDiscoverCandidate {
	var out []PrometheusDiscoverCandidate
	seen := make(map[string]struct{})

	for i := range list.Items {
		svc := &list.Items[i]
		if svc.Spec.Type == corev1.ServiceTypeExternalName {
			continue
		}
		nameHit := serviceLooksLikePrometheus(svc)
		ports := svc.Spec.Ports
		for _, sp := range ports {
			if sp.Protocol != "" && sp.Protocol != corev1.ProtocolTCP {
				continue
			}
			if sp.Port <= 0 {
				continue
			}
			if nameHit {
				// 名称像 Prometheus：优先常见 HTTP 端口，或仅有一个端口时采纳
				if portLooksLikePrometheusHTTP(sp) || sp.Port == 8080 {
					appendCandidate(&out, seen, svc, sp, "service name")
					continue
				}
				if len(ports) == 1 {
					appendCandidate(&out, seen, svc, sp, "service name (single port)")
				}
				continue
			}
			if portLooksLikePrometheusHTTP(sp) && (sp.Port == 9090 || sp.Port == 9091) && namespaceOKForPort9090(svc.Namespace) {
				appendCandidate(&out, seen, svc, sp, fmt.Sprintf("port %d", sp.Port))
			}
		}
	}

	sort.Slice(out, func(i, j int) bool {
		if out[i].Namespace != out[j].Namespace {
			return out[i].Namespace < out[j].Namespace
		}
		if out[i].Name != out[j].Name {
			return out[i].Name < out[j].Name
		}
		return out[i].Port < out[j].Port
	})
	if len(out) > 80 {
		out = out[:80]
	}
	return out
}

func handlePrometheusDiscover(c *gin.Context, k8s *kubernetes.Clientset) {
	if !GuardK8s(c, k8s) {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 90*time.Second)
	defer cancel()

	list, err := k8s.CoreV1().Services("").List(ctx, metav1.ListOptions{Limit: 500})
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "列出 Service 失败: " + err.Error()})
		return
	}
	cands := discoverPrometheusFromServices(list)
	c.JSON(http.StatusOK, gin.H{"candidates": cands})
}

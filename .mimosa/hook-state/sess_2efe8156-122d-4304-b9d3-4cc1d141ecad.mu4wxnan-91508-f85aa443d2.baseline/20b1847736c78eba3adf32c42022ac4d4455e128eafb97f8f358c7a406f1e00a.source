package internal

import (
	"context"
	"fmt"
	"strings"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

func redisK8sClusterDNS(name, ns string) string {
	return fmt.Sprintf("%s.%s.svc.cluster.local", strings.TrimSpace(name), strings.TrimSpace(ns))
}

type redisK8sPortDesc struct {
	Name     string `json:"name"`
	Port     int32  `json:"port"`
	NodePort int32  `json:"nodePort,omitempty"`
	Protocol string `json:"protocol,omitempty"`
}

type redisK8sNetworkService struct {
	Name           string             `json:"name"`
	Namespace      string             `json:"namespace"`
	Type           string             `json:"type"`
	ClusterIP      string             `json:"clusterIP,omitempty"`
	ClusterDNS     string             `json:"clusterDNS"`
	Ports          []redisK8sPortDesc `json:"ports"`
	LoadBalancerIP string             `json:"loadBalancerIP,omitempty"`
	ExternalIPs    []string           `json:"externalIPs,omitempty"`
	HostNetwork    bool               `json:"hostNetwork,omitempty"`
	Note           string             `json:"note,omitempty"`
}

// CollectRedisK8sDeployNetwork 部署成功后从集群读取 Service，汇总 ClusterIP / DNS / NodePort 等供控制台展示。
func CollectRedisK8sDeployNetwork(ctx context.Context, k8s *kubernetes.Clientset, opts RedisK8sDeployOpts) []redisK8sNetworkService {
	if k8s == nil {
		return nil
	}
	ns := strings.TrimSpace(opts.Namespace)
	base := strings.TrimSpace(opts.DeploymentName)
	if ns == "" || base == "" {
		return nil
	}
	names := make([]string, 0, 4)
	switch topologyMode(opts.Topology) {
	case "sentinel":
		names = append(names, base+"-master")
		names = append(names, base+"-sentinel")
	case "cluster":
		names = append(names, base+"-cluster-headless")
		if redisK8sServiceTypeFromString(opts.ServiceType) != corev1.ServiceTypeClusterIP {
			names = append(names, base+"-cluster-access")
		}
	default:
		names = append(names, base)
	}

	out := make([]redisK8sNetworkService, 0, len(names))
	for _, svcName := range names {
		svc, err := k8s.CoreV1().Services(ns).Get(ctx, svcName, metav1.GetOptions{})
		if err != nil || svc == nil {
			continue
		}
		item := redisK8sNetworkService{
			Name:       svc.Name,
			Namespace:  svc.Namespace,
			Type:       string(svc.Spec.Type),
			ClusterDNS: redisK8sClusterDNS(svc.Name, svc.Namespace),
			Ports:      make([]redisK8sPortDesc, 0, len(svc.Spec.Ports)),
		}
		if svc.Spec.ClusterIP != "" && svc.Spec.ClusterIP != "None" {
			item.ClusterIP = svc.Spec.ClusterIP
		}
		for _, p := range svc.Spec.Ports {
			pd := redisK8sPortDesc{
				Name:     p.Name,
				Port:     p.Port,
				Protocol: string(p.Protocol),
			}
			if p.NodePort > 0 {
				pd.NodePort = p.NodePort
			}
			item.Ports = append(item.Ports, pd)
		}
		if len(svc.Status.LoadBalancer.Ingress) > 0 {
			ing := svc.Status.LoadBalancer.Ingress[0]
			if ip := strings.TrimSpace(ing.IP); ip != "" {
				item.LoadBalancerIP = ip
			} else if host := strings.TrimSpace(ing.Hostname); host != "" {
				item.LoadBalancerIP = host
			}
		}
		// hostNetwork 模式下收集 Pod 所在节点的 hostIP 作为外部访问地址
		if opts.HostNetwork {
			item.HostNetwork = true
			var podList *corev1.PodList
			switch topologyMode(opts.Topology) {
			case "cluster":
				if strings.HasSuffix(svc.Name, "-cluster-headless") {
					podList, _ = k8s.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{
						LabelSelector: "redis-app=" + base + ",redis-topology=cluster",
					})
				}
			case "sentinel":
				if strings.HasSuffix(svc.Name, "-master") {
					podList, _ = k8s.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{
						LabelSelector: "redis-app=" + base + ",redis-topology=sentinel,role=master",
					})
				}
			default:
				podList, _ = k8s.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{
					LabelSelector: "redis-app=" + base,
				})
			}
			if podList != nil {
				seen := make(map[string]bool)
				for _, po := range podList.Items {
					ip := strings.TrimSpace(po.Status.HostIP)
					if ip != "" && !seen[ip] {
						seen[ip] = true
						item.ExternalIPs = append(item.ExternalIPs, ip)
					}
				}
			}
		}
		switch topologyMode(opts.Topology) {
		case "cluster":
			if strings.HasSuffix(svc.Name, "-cluster-headless") {
				item.Note = "集群内 Pod DNS：如 " + base + "-0." + svc.Name + "." + ns + ".svc.cluster.local"
				if opts.HostNetwork {
					item.Note += "；hostNetwork 模式下每个 Pod 直接绑定节点 IP（见 外部访问地址）"
				}
			} else if strings.HasSuffix(svc.Name, "-cluster-access") {
				item.Note = "集群外访问（NodePort/LB）经本 Service；Redis 端口见 ports.redis"
			}
		case "sentinel":
			if strings.HasSuffix(svc.Name, "-master") {
				item.Note = "读写主节点；内网 " + item.ClusterDNS + ":" + fmtRedisMainPort(svc)
			} else if strings.HasSuffix(svc.Name, "-sentinel") {
				item.Note = "哨兵 headless：如 " + base + "-sentinel-0." + svc.Name + "." + ns + ".svc.cluster.local:26379"
			}
		default:
			item.Note = "内网访问 " + item.ClusterDNS + ":" + fmtRedisMainPort(svc)
			if svc.Spec.Type == corev1.ServiceTypeNodePort || svc.Spec.Type == corev1.ServiceTypeLoadBalancer {
				item.Note += "；NodePort 模式请使用 任意节点IP:nodePort（见 ports 中 nodePort）"
			}
			if opts.HostNetwork {
				item.Note += "；hostNetwork 模式下 Pod 直接使用节点 IP（见 外部访问地址）"
			}
		}
		out = append(out, item)
	}
	return out
}

func fmtRedisMainPort(svc *corev1.Service) string {
	for _, p := range svc.Spec.Ports {
		if p.Name == "redis" || p.Port == 6379 {
			return fmt.Sprintf("%d", p.Port)
		}
	}
	if len(svc.Spec.Ports) > 0 {
		return fmt.Sprintf("%d", svc.Spec.Ports[0].Port)
	}
	return "6379"
}

// RedisK8sDeployOptsFromStoredForNetwork 从已持久化的 K8s 实例配置构造 CollectRedisK8sDeployNetwork 所需的最小 opts。
func RedisK8sDeployOptsFromStoredForNetwork(st *appRedisStoredConfig) (RedisK8sDeployOpts, bool) {
	if st == nil || !appRedisStoredIsPlatformK8s(st) {
		return RedisK8sDeployOpts{}, false
	}
	ns := strings.TrimSpace(st.K8sNamespace)
	base := strings.TrimSpace(st.K8sBaseName)
	if ns == "" || base == "" {
		return RedisK8sDeployOpts{}, false
	}
	return RedisK8sDeployOpts{
		Namespace:      ns,
		DeploymentName: base,
		Topology:       strings.TrimSpace(st.K8sTopology),
		ServiceType:    strings.TrimSpace(st.K8sServiceType),
	}, true
}

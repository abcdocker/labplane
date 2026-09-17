package internal

import (
	"fmt"
	"log"
	"os"
	"strings"

	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

// K8sRuntimeConfigured runtime 中已填写 incluster 或 kubeconfig（与进程是否成功创建 K8s 客户端无关）。
func K8sRuntimeConfigured(rs *RuntimeSettings) bool {
	if rs == nil || !rs.Initialized || rs.K8s == nil {
		return false
	}
	if K8sRuntimeSkipped(rs) {
		return false
	}
	mode := strings.ToLower(strings.TrimSpace(rs.K8s.Mode))
	if mode == "incluster" {
		return true
	}
	if mode == "kubeconfig" {
		return strings.TrimSpace(rs.K8s.KubeconfigYAML) != ""
	}
	return false
}

// K8sRuntimeSkipped 表示用户在 runtime 中未配置集群（跳过向导 / 选「不连接」）。
func K8sRuntimeSkipped(rs *RuntimeSettings) bool {
	if rs == nil || !rs.Initialized {
		return false
	}
	if rs.K8s == nil {
		return true
	}
	m := strings.ToLower(strings.TrimSpace(rs.K8s.Mode))
	return m == "" || m == "none" || m == "disabled"
}

// InitK8sForApp 在已初始化时按 runtime 选择 in-cluster 或 kubeconfig；未初始化返回 nil（无错误）。
func InitK8sForApp(rs *RuntimeSettings) (*kubernetes.Clientset, *rest.Config, error) {
	if rs == nil || !rs.Initialized {
		return nil, nil, nil
	}
	if rs.K8s == nil {
		return nil, nil, nil
	}
	mode := strings.ToLower(strings.TrimSpace(rs.K8s.Mode))
	if mode == "" || mode == "none" || mode == "disabled" {
		return nil, nil, nil
	}
	switch mode {
	case "incluster":
		cfg, err := rest.InClusterConfig()
		if err != nil {
			return nil, nil, fmt.Errorf("in-cluster 配置: %w", err)
		}
		cs, err := kubernetes.NewForConfig(cfg)
		if err != nil {
			return nil, nil, err
		}
		return cs, cfg, nil
	case "kubeconfig":
		yaml := strings.TrimSpace(rs.K8s.KubeconfigYAML)
		if yaml == "" {
			return nil, nil, fmt.Errorf("kubeconfig 内容为空")
		}
		cfg, err := clientcmd.RESTConfigFromKubeConfig([]byte(yaml))
		if err != nil {
			return nil, nil, fmt.Errorf("解析 kubeconfig: %w", err)
		}
		cs, err := kubernetes.NewForConfig(cfg)
		if err != nil {
			return nil, nil, err
		}
		return cs, cfg, nil
	default:
		return nil, nil, fmt.Errorf("不支持的 k8s.mode: %s（需 incluster 或 kubeconfig）", rs.K8s.Mode)
	}
}

// TryK8sFromEnv 兼容仅通过环境变量/KUBECONFIG 启动的旧方式（不经过初始化向导）。
func TryK8sFromEnv() (*kubernetes.Clientset, *rest.Config, error) {
	cfg, err := rest.InClusterConfig()
	if err != nil {
		kubeconfig := getEnv("KUBECONFIG", os.Getenv("HOME")+"/.kube/config")
		cfg, err = clientcmd.BuildConfigFromFlags("", kubeconfig)
		if err != nil {
			return nil, nil, err
		}
	}
	cs, err := kubernetes.NewForConfig(cfg)
	if err != nil {
		return nil, nil, err
	}
	return cs, cfg, nil
}

// InitK8sClient 保留：优先 in-cluster，否则 KUBECONFIG；失败则 log.Fatal（仅用于未迁移的旧入口）。
func InitK8sClient() (*kubernetes.Clientset, *rest.Config) {
	cs, cfg, err := TryK8sFromEnv()
	if err != nil {
		log.Fatalf("无法获取 K8s 配置: %v", err)
	}
	return cs, cfg
}

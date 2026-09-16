package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"kube-bt-sync/internal"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

type checkConfig struct {
	BaotaURL      string
	KubeNamespace string
	Kubeconfig    string
	Timeout       time.Duration
}

func main() {
	cfg, err := loadCheckConfig()
	if err != nil {
		fatalf("配置错误: %v", err)
	}

	fmt.Println("== kube-bt-sync connectivity check ==")
	fmt.Printf("K8s namespace: %s\n", cfg.KubeNamespace)
	fmt.Printf("Baota URL: %s（仅 TCP 探活面板端口，不调用 HTTP API）\n", cfg.BaotaURL)
	fmt.Println()

	if err := checkK8s(cfg); err != nil {
		fatalf("K8s 连通性失败: %v", err)
	}
	fmt.Println("[OK] K8s API 连通正常")

	if err := checkBaota(cfg); err != nil {
		fatalf("宝塔 TCP 探活失败: %v", err)
	}
	fmt.Println("[OK] 宝塔面板 TCP 端口可达")
	fmt.Println("全部检查通过")
}

func loadCheckConfig() (checkConfig, error) {
	timeoutSec := envOrDefault("CHECK_TIMEOUT_SEC", "10")
	timeout, err := time.ParseDuration(timeoutSec + "s")
	if err != nil || timeout <= 0 {
		return checkConfig{}, errors.New("CHECK_TIMEOUT_SEC 必须是正整数秒")
	}

	baotaURL := strings.TrimSpace(os.Getenv("BAOTA_URL"))
	cfg := checkConfig{
		BaotaURL:      baotaURL,
		KubeNamespace: envOrDefault("CHECK_NAMESPACE", "default"),
		Kubeconfig:    envOrDefault("KUBECONFIG", os.Getenv("HOME")+"/.kube/config"),
		Timeout:       timeout,
	}

	if cfg.BaotaURL == "" {
		return checkConfig{}, errors.New("缺少必要环境变量: BAOTA_URL")
	}
	return cfg, nil
}

func checkK8s(cfg checkConfig) error {
	clientset, err := newK8sClient(cfg.Kubeconfig)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), cfg.Timeout)
	defer cancel()

	_, err = clientset.Discovery().ServerVersion()
	if err != nil {
		return fmt.Errorf("读取集群版本失败: %w", err)
	}

	_, err = clientset.NetworkingV1().Ingresses(cfg.KubeNamespace).List(ctx, metav1.ListOptions{Limit: 1})
	if err != nil {
		return fmt.Errorf("列出 Ingress 失败(namespace=%s): %w", cfg.KubeNamespace, err)
	}
	return nil
}

func newK8sClient(kubeconfig string) (*kubernetes.Clientset, error) {
	config, err := rest.InClusterConfig()
	if err != nil {
		config, err = clientcmd.BuildConfigFromFlags("", kubeconfig)
		if err != nil {
			return nil, fmt.Errorf("无法创建 K8s 配置: %w", err)
		}
	}
	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("无法创建 K8s clientset: %w", err)
	}
	return clientset, nil
}

func checkBaota(cfg checkConfig) error {
	return internal.ProbeBaotaTCPFromURL(cfg.BaotaURL, cfg.Timeout)
}

func envOrDefault(key, fallback string) string {
	val := strings.TrimSpace(os.Getenv(key))
	if val == "" {
		return fallback
	}
	return val
}

func fatalf(format string, args ...interface{}) {
	fmt.Fprintf(os.Stderr, "[FAIL] "+format+"\n", args...)
	os.Exit(1)
}

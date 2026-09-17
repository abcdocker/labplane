package internal

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
)

// WriteTempKubeconfigForHelm 为 helm 子进程写入临时 kubeconfig（0600），返回路径与清理函数。
func WriteTempKubeconfigForHelm(app *ServerApp) (path string, cleanup func(), err error) {
	nop := func() {}
	if app == nil {
		return "", nop, fmt.Errorf("app 为空")
	}
	rs := app.Runtime()
	k8sREST := app.K8sREST()
	if k8sREST == nil {
		return "", nop, fmt.Errorf("Kubernetes 未连接")
	}

	var data []byte
	if rs != nil && rs.K8s != nil {
		mode := strings.ToLower(strings.TrimSpace(rs.K8s.Mode))
		if mode == "kubeconfig" && strings.TrimSpace(rs.K8s.KubeconfigYAML) != "" {
			data = []byte(rs.K8s.KubeconfigYAML)
		}
	}
	if len(data) == 0 && rs != nil && rs.K8s != nil && strings.ToLower(strings.TrimSpace(rs.K8s.Mode)) == "incluster" {
		var e error
		data, e = kubeconfigBytesFromRESTConfig(k8sREST)
		if e != nil {
			return "", nop, fmt.Errorf("生成 in-cluster kubeconfig: %w", e)
		}
	}
	if len(data) == 0 {
		if kube := strings.TrimSpace(os.Getenv("KUBECONFIG")); kube != "" {
			for _, p := range filepath.SplitList(kube) {
				p = strings.TrimSpace(p)
				if p == "" {
					continue
				}
				if b, e := os.ReadFile(p); e == nil && len(b) > 0 {
					data = b
					break
				}
			}
		}
	}
	if len(data) == 0 {
		var e error
		data, e = kubeconfigBytesFromRESTConfig(k8sREST)
		if e != nil {
			return "", nop, fmt.Errorf("无法生成 kubeconfig（请在 runtime 中粘贴 kubeconfig 或使用 in-cluster）: %w", e)
		}
	}

	f, err := os.CreateTemp("", "kubebt-helm-kubeconfig-*.yaml")
	if err != nil {
		return "", nop, err
	}
	path = f.Name()
	cleanup = func() { _ = os.Remove(path) }
	if _, err = f.Write(data); err != nil {
		_ = f.Close()
		cleanup()
		return "", nop, err
	}
	if err = f.Close(); err != nil {
		cleanup()
		return "", nop, err
	}
	if err = os.Chmod(path, 0600); err != nil {
		cleanup()
		return "", nop, err
	}
	return path, cleanup, nil
}

func kubeconfigBytesFromRESTConfig(cfg *rest.Config) ([]byte, error) {
	if cfg == nil {
		return nil, fmt.Errorf("REST 配置为空")
	}
	clusterName := "cluster"
	authName := "user"
	ctxName := "default"

	cl := clientcmdapi.Cluster{
		Server:                   cfg.Host,
		InsecureSkipTLSVerify:    cfg.Insecure,
		CertificateAuthorityData: cfg.CAData,
		CertificateAuthority:     cfg.CAFile,
	}
	if cl.Server == "" {
		return nil, fmt.Errorf("REST.Server 为空")
	}

	auth := clientcmdapi.AuthInfo{}
	if cfg.BearerToken != "" {
		auth.Token = cfg.BearerToken
	}
	if len(cfg.TLSClientConfig.CertData) > 0 {
		auth.ClientCertificateData = cfg.TLSClientConfig.CertData
		auth.ClientKeyData = cfg.TLSClientConfig.KeyData
	}
	if cfg.Username != "" || cfg.Password != "" {
		auth.Username = cfg.Username
		auth.Password = cfg.Password
	}
	if cfg.BearerToken == "" && len(cfg.TLSClientConfig.CertData) == 0 && cfg.Username == "" && cfg.Password == "" {
		return nil, fmt.Errorf("REST 配置中无 token/证书/密码，无法生成 kubeconfig")
	}

	c := clientcmdapi.Config{
		APIVersion: "v1",
		Kind:       "Config",
		Clusters:   map[string]*clientcmdapi.Cluster{clusterName: &cl},
		AuthInfos:  map[string]*clientcmdapi.AuthInfo{authName: &auth},
		Contexts: map[string]*clientcmdapi.Context{
			ctxName: {Cluster: clusterName, AuthInfo: authName},
		},
		CurrentContext: ctxName,
	}
	return clientcmd.Write(c)
}

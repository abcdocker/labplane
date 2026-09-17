package internal

import (
	"strings"
)

// 默认使用 DaoCloud 公开镜像加速（与 YAML 经 ghproxy 下载相互独立：节点 kubelet 拉镜像时走此处改写后的仓库）。
// 文档参考：https://github.com/DaoCloud/public-image-mirror
const (
	defaultIngressK8sRegistryMirrorPrefix = "m.daocloud.io/registry.k8s.io"
	defaultIngressK8sGCRMirrorPrefix      = "m.daocloud.io/k8s.gcr.io"
)

// RewriteIngressManifestK8sRegistryImages 将 ingress-nginx 等清单中的官方镜像仓库改为国内可访问的拉取路径。
// 仅替换 YAML 文本；与 httpGetManifestBytes 的 ghproxy（GitHub raw）无关。
func RewriteIngressManifestK8sRegistryImages(manifest []byte, cfg Config) []byte {
	if cfg.IngressNginxSkipK8sRegistryMirror {
		return manifest
	}
	if len(manifest) == 0 {
		return manifest
	}
	prefix := strings.TrimSpace(cfg.IngressNginxK8sImageMirrorPrefix)
	if prefix == "" {
		prefix = defaultIngressK8sRegistryMirrorPrefix
	}
	prefix = strings.TrimSuffix(prefix, "/")

	s := string(manifest)
	s = strings.ReplaceAll(s, "registry.k8s.io/", prefix+"/")
	s = strings.ReplaceAll(s, "k8s.gcr.io/", defaultIngressK8sGCRMirrorPrefix+"/")
	return []byte(s)
}

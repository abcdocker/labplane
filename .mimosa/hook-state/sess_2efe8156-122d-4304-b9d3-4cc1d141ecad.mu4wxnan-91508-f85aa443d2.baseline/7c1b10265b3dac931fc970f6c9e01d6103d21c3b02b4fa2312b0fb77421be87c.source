package internal

import (
	"fmt"
	"strings"
)

// K8sRedisInstanceName 生成应用中心实例唯一名称（与命名空间 + 部署基名对应）。
func K8sRedisInstanceName(namespace, baseName string) string {
	ns := strings.TrimSpace(namespace)
	base := strings.TrimSpace(baseName)
	s := ns + "/" + base
	if len(s) <= 128 {
		return s
	}
	// 超长时截断 base
	max := 128 - len(ns) - 1
	if max < 8 {
		return s[:128]
	}
	return ns + "/" + base[:max]
}

// BuildK8sRedisStoredConfig 根据 K8s 一键部署参数生成可持久化的实例配置（集群内 DNS）。
func BuildK8sRedisStoredConfig(cfg Config, opts RedisK8sDeployOpts) (*appRedisStoredConfig, error) {
	ns := strings.TrimSpace(opts.Namespace)
	base := strings.TrimSpace(opts.DeploymentName)
	svcPort := opts.SvcPort
	if svcPort <= 0 {
		svcPort = 6379
	}
	podPort := opts.PodPort
	if podPort <= 0 {
		podPort = 6379
	}
	top := topologyMode(opts.Topology)

	svcType := strings.TrimSpace(opts.ServiceType)
	if svcType == "" {
		svcType = "clusterip"
	}
	st := &appRedisStoredConfig{
		DB:             0,
		K8sNamespace:   ns,
		K8sBaseName:    base,
		K8sTopology:    top,
		K8sSvcPort:     svcPort,
		K8sServiceType: svcType,
	}
	pw := strings.TrimSpace(opts.Password)
	if pw != "" {
		key, err := sshEncryptionKey(cfg)
		if err != nil {
			return nil, fmt.Errorf("加密密钥: %w", err)
		}
		enc, err := encryptSecret(key, pw)
		if err != nil {
			return nil, err
		}
		st.PasswordEnc = enc
	}

	switch top {
	case "sentinel":
		st.Mode = AppRedisSentinel
		st.MasterName = sentinelMonName(opts)
		stsName := base + "-sentinel"
		for i := 0; i < 3; i++ {
			h := fmt.Sprintf("%s-%d.%s.%s.svc.cluster.local:26379", stsName, i, stsName, ns)
			st.SentinelAddrs = append(st.SentinelAddrs, h)
		}
	case "cluster":
		st.Mode = AppRedisCluster
		headless := base + "-cluster-headless"
		stsName := base + "-cluster"
		for i := 0; i < clusterNodeCount; i++ {
			h := fmt.Sprintf("%s-%d.%s.%s.svc.cluster.local:%d", stsName, i, headless, ns, podPort)
			st.ClusterAddrs = append(st.ClusterAddrs, h)
		}
	default:
		st.Mode = AppRedisStandalone
		st.Addr = fmt.Sprintf("%s.%s.svc.cluster.local:%d", base, ns, svcPort)
	}

	if _, err := parseStoredConfig(*st); err != nil {
		return nil, err
	}

	line := strings.TrimSpace(opts.Version)
	if line == "" {
		line = "7"
	}
	st.K8sEngineLine = line
	st.K8sMaxmemory = strings.TrimSpace(opts.Maxmemory)
	st.K8sMaxmemoryPolicy = strings.TrimSpace(opts.MaxmemoryPolicy)
	st.K8sAppendonly = opts.Appendonly
	st.K8sRedisImageResolved = ResolveRedisServerImage(cfg, opts.Version, opts.RedisImage)
	exp := opts.EnableExporter && top != "cluster"
	st.K8sExporterEnabled = exp
	if exp {
		st.K8sExporterImageResolved = ResolveRedisExporterImage(cfg, opts.ExporterImage)
	}
	st.K8sRedisCPURequest = strings.TrimSpace(opts.RedisCPURequest)
	st.K8sRedisCPULimit = strings.TrimSpace(opts.RedisCPULimit)
	st.K8sRedisMemoryRequest = strings.TrimSpace(opts.RedisMemoryRequest)
	st.K8sRedisMemoryLimit = strings.TrimSpace(opts.RedisMemoryLimit)
	st.K8sPersistenceEnabled = opts.PersistenceEnabled
	st.K8sStorageSize = strings.TrimSpace(opts.StorageSize)
	st.K8sStorageClass = strings.TrimSpace(opts.StorageClassName)
	if opts.TemplateID > 0 {
		st.K8sTemplateID = opts.TemplateID
	}
	if strings.TrimSpace(opts.TemplateName) != "" {
		st.K8sTemplateName = strings.TrimSpace(opts.TemplateName)
	}
	st.K8sHostNetwork = opts.HostNetwork
	return st, nil
}

package internal

import (
	"context"
	"errors"
	"fmt"
	"strings"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/intstr"
	"k8s.io/client-go/kubernetes"
)

const (
	defaultRedisExporterImage = "oliver006/redis_exporter:v1.69.0"
	redisExporterMetricsPort    = int32(9121)
)

// RedisK8sDeployOpts 应用中心 Redis 一键部署到当前集群。
type RedisK8sDeployOpts struct {
	Namespace       string
	DeploymentName  string
	Version         string
	Maxmemory       string
	MaxmemoryPolicy string
	Appendonly      bool
	PodPort         int32
	SvcPort         int32
	/** Password 非空时启用 requirepass，并写入 Secret 供 exporter 使用 */
	Password string
	/** EnableExporter 为 true 时在 Pod 内安装 redis_exporter 边车并暴露 metrics 端口 */
	EnableExporter bool
	/** ExporterImage 为空则使用默认 oliver006/redis_exporter 标签 */
	ExporterImage string
	/** Topology：standalone（默认）| sentinel | cluster */
	Topology string
	/** RedisImage 非空时覆盖镜像解析结果（完整 repository:tag） */
	RedisImage string
	/** SentinelMasterName 哨兵模式下的 master 名称，默认 mymaster */
	SentinelMasterName string
	/** PersistenceEnabled 为 true 时为数据目录挂 PVC（默认 true，由运行时/请求覆盖） */
	PersistenceEnabled bool
	/** StorageSize 如 10Gi、20Gi */
	StorageSize string
	/** StorageClassName 为空则在部署时自动选择集群默认 SC */
	StorageClassName string
	/** 以下为生产环境常用 redis-server 参数（默认：backlog 511、keepalive 60、maxclients 10000、hz 10、惰性淘汰/过期开启） */
	TcpBacklog           int32
	TcpKeepalive         int32
	ClientTimeoutSec     int
	MaxClients           int32
	Hz                   int
	LazyfreeLazyEviction bool
	LazyfreeLazyExpire   bool
	IOThreads            int
	/** K8s 容器 resources（与 maxmemory 独立），如 250m、512Mi */
	RedisCPURequest    string
	RedisCPULimit      string
	RedisMemoryRequest string
	RedisMemoryLimit   string
	/** ServiceType：clusterip（默认）| nodeport | loadbalancer */
	ServiceType string
	/** NodePortRedis 指定 Service 上 Redis 端口的 NodePort（仅 nodeport 时有效，0 表示由集群分配） */
	NodePortRedis int32
	/** NodePortClusterBus Cluster 模式下 cluster-bus 端口的 NodePort（仅 cluster + nodeport 时有效） */
	NodePortClusterBus int32
	/** HostNetwork 为 true 时 Pod 使用宿主机网络命名空间（cluster 模式常用于外部直接访问） */
	HostNetwork bool
	/** RdbSaveLines RDB 快照规则，每行「秒 变更数」；单行 off/none 表示关闭 RDB；nil 使用 redis 默认 save */
	RdbSaveLines []string
	/** ImagePullSecret 本部署使用的 imagePullSecrets 名称（通常来自模版）；空则回退进程级环境变量 */
	ImagePullSecret string
	/** TemplateID / TemplateName 写入实例快照供控制台展示 */
	TemplateID   int64
	TemplateName string
	/** ExtraRedisServerArgs 附加 redis-server 参数（来自模版） */
	ExtraRedisServerArgs []string
}

func topologyMode(s string) string {
	t := strings.TrimSpace(strings.ToLower(s))
	if t == "" {
		return "standalone"
	}
	return t
}

func validateK8sPort(name string, p int32) error {
	if p < 1 || p > 65535 {
		return fmt.Errorf("%s 须为 1–65535", name)
	}
	return nil
}

// ValidateOptionalK8sNodePort 校验 NodePort 端口（0 表示自动分配）。
func ValidateOptionalK8sNodePort(field string, p int32) error {
	if p == 0 {
		return nil
	}
	if p < 30000 || p > 32767 {
		return fmt.Errorf("%s 须为 0（自动）或 30000–32767", field)
	}
	return nil
}

func redisK8sServiceTypeFromString(s string) corev1.ServiceType {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "nodeport":
		return corev1.ServiceTypeNodePort
	case "loadbalancer", "lb":
		return corev1.ServiceTypeLoadBalancer
	default:
		return corev1.ServiceTypeClusterIP
	}
}

func applyExplicitNodePorts(svc *corev1.Service, redisNP, secondNP int32) {
	if svc.Spec.Type != corev1.ServiceTypeNodePort && svc.Spec.Type != corev1.ServiceTypeLoadBalancer {
		return
	}
	if redisNP > 0 && len(svc.Spec.Ports) > 0 {
		svc.Spec.Ports[0].NodePort = redisNP
	}
	if secondNP > 0 && len(svc.Spec.Ports) > 1 {
		svc.Spec.Ports[1].NodePort = secondNP
	}
}

// ValidateRedisDeployPassword 可选密码长度校验。
func ValidateRedisDeployPassword(pw string) error {
	pw = strings.TrimSpace(pw)
	if len(pw) > 256 {
		return errors.New("Redis 密码长度不能超过 256")
	}
	return nil
}

// ValidateK8sDeploymentName 校验 Deployment/Service metadata.name（DNS 标签）。
func ValidateK8sDeploymentName(name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return errors.New("Deployment 名称不能为空")
	}
	if len(name) > 63 {
		return errors.New("Deployment 名称长度不能超过 63")
	}
	if !k8sDNSLabelRe.MatchString(name) {
		return errors.New("Deployment 名称格式无效（须为小写字母、数字与连字符组成的 DNS 标签）")
	}
	return nil
}

// redisAuthSecretName 生成与 Deployment 关联的 Secret 名（总长 ≤63）。
func redisAuthSecretName(deploymentName string) string {
	suffix := "-auth"
	base := strings.TrimSpace(deploymentName) + suffix
	if len(base) <= 63 {
		return base
	}
	max := 63 - len(suffix)
	if max < 1 {
		return "r-auth"
	}
	return deploymentName[:max] + suffix
}

func shellQuoteForSh(s string) string {
	return `'` + strings.ReplaceAll(s, `'`, `'\''`) + `'`
}

func buildRedisAuthSecret(opts RedisK8sDeployOpts) *corev1.Secret {
	pw := strings.TrimSpace(opts.Password)
	if pw == "" {
		return nil
	}
	ns := strings.TrimSpace(opts.Namespace)
	name := strings.TrimSpace(opts.DeploymentName)
	return &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      redisAuthSecretName(name),
			Namespace: ns,
			Labels:    map[string]string{"app": name, "kube-bt-sync.io/redis": "true"},
		},
		Type: corev1.SecretTypeOpaque,
		StringData: map[string]string{
			"password": pw,
		},
	}
}

func redisPasswordEnv(deploymentName string) corev1.EnvVar {
	return corev1.EnvVar{
		Name: "REDIS_PASSWORD",
		ValueFrom: &corev1.EnvVarSource{
			SecretKeyRef: &corev1.SecretKeySelector{
				LocalObjectReference: corev1.LocalObjectReference{Name: redisAuthSecretName(deploymentName)},
				Key:                  "password",
			},
		},
	}
}

func buildRedisMainContainer(opts RedisK8sDeployOpts, redisImage string, dataDir string) corev1.Container {
	name := strings.TrimSpace(opts.DeploymentName)
	pol := strings.TrimSpace(maxmemPolicyOrDefault(opts.MaxmemoryPolicy))
	mem := strings.TrimSpace(opts.Maxmemory)
	if mem == "" {
		mem = "256mb"
	}
	aof := "no"
	if opts.Appendonly {
		aof = "yes"
	}
	podPort := opts.PodPort
	if podPort <= 0 {
		podPort = 6379
	}
	hasPw := strings.TrimSpace(opts.Password) != ""
	extraShell := redisRdbShellFragment(opts) + redisEnterpriseArgsShell(opts) + redisExtraArgsShellFragment(opts)
	dirArg := ""
	if strings.TrimSpace(dataDir) != "" {
		dirArg = fmt.Sprintf("--dir %s ", shellQuoteForSh(strings.TrimSpace(dataDir)))
	}

	c := corev1.Container{
		Name:  "redis",
		Image: redisImage,
		Ports: []corev1.ContainerPort{{
			Name:          "redis",
			ContainerPort: podPort,
		}},
	}
	if hasPw {
		c.Env = []corev1.EnvVar{redisPasswordEnv(name)}
		c.Command = []string{"/bin/sh", "-c"}
		c.Args = []string{
			fmt.Sprintf(
				`exec redis-server %s--maxmemory %s --maxmemory-policy %s --appendonly %s%s --requirepass "$REDIS_PASSWORD"`,
				dirArg,
				shellQuoteForSh(mem),
				shellQuoteForSh(pol),
				shellQuoteForSh(aof),
				extraShell,
			),
		}
	} else {
		args := []string{
			"redis-server",
		}
		if strings.TrimSpace(dataDir) != "" {
			args = append(args, "--dir", strings.TrimSpace(dataDir))
		}
		args = append(args,
			"--maxmemory", mem,
			"--maxmemory-policy", pol,
			"--appendonly", aof,
		)
		args = append(args, redisRdbArgv(opts)...)
		args = append(args, redisEnterpriseArgsArgv(opts)...)
		args = append(args, redisExtraArgsArgv(opts)...)
		c.Args = args
	}
	applyRedisWorkloadResources(&c, opts)
	return c
}

func buildRedisExporterContainer(cfg Config, opts RedisK8sDeployOpts) corev1.Container {
	name := strings.TrimSpace(opts.DeploymentName)
	podPort := opts.PodPort
	if podPort <= 0 {
		podPort = 6379
	}
	hasPw := strings.TrimSpace(opts.Password) != ""

	c := corev1.Container{
		Name:  "redis-exporter",
		Image: ResolveRedisExporterImage(cfg, opts.ExporterImage),
		Args: []string{
			fmt.Sprintf("--redis.addr=redis://127.0.0.1:%d", podPort),
		},
		Ports: []corev1.ContainerPort{{
			Name:          "metrics",
			ContainerPort: redisExporterMetricsPort,
		}},
	}
	if hasPw {
		c.Env = []corev1.EnvVar{redisPasswordEnv(name)}
	}
	c.Resources = exporterSidecarResources()
	return c
}

func buildRedisDeployment(cfg Config, opts RedisK8sDeployOpts, dataPVCClaimName string) *appsv1.Deployment {
	ns := strings.TrimSpace(opts.Namespace)
	name := strings.TrimSpace(opts.DeploymentName)
	labels := map[string]string{"app": name}

	redisImg := ResolveRedisServerImage(cfg, opts.Version, opts.RedisImage)
	dataDir := ""
	if strings.TrimSpace(dataPVCClaimName) != "" {
		dataDir = "/data"
	}
	containers := []corev1.Container{buildRedisMainContainer(opts, redisImg, dataDir)}
	if opts.EnableExporter {
		containers = append(containers, buildRedisExporterContainer(cfg, opts))
	}

	annotations := map[string]string{}
	if opts.EnableExporter {
		annotations["prometheus.io/scrape"] = "true"
		annotations["prometheus.io/port"] = fmt.Sprintf("%d", redisExporterMetricsPort)
		annotations["prometheus.io/path"] = "/metrics"
	}

	podSpec := corev1.PodSpec{
		Containers:       containers,
		ImagePullSecrets: ImagePullSecretsForRedisDeploy(cfg, opts.ImagePullSecret),
	}
	if strings.TrimSpace(dataPVCClaimName) != "" {
		podSpec.Volumes = []corev1.Volume{{
			Name: "redis-data",
			VolumeSource: corev1.VolumeSource{
				PersistentVolumeClaim: &corev1.PersistentVolumeClaimVolumeSource{ClaimName: dataPVCClaimName},
			},
		}}
		podSpec.Containers[0].VolumeMounts = []corev1.VolumeMount{{
			Name: "redis-data", MountPath: "/data",
		}}
	}

	return &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      name,
			Namespace: ns,
			Labels:    labels,
		},
		Spec: appsv1.DeploymentSpec{
			Replicas: int32Ptr(1),
			Selector: &metav1.LabelSelector{MatchLabels: labels},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels:      labels,
					Annotations: annotations,
				},
				Spec: podSpec,
			},
		},
	}
}

func buildRedisService(opts RedisK8sDeployOpts) *corev1.Service {
	ns := strings.TrimSpace(opts.Namespace)
	name := strings.TrimSpace(opts.DeploymentName)
	podPort := opts.PodPort
	if podPort <= 0 {
		podPort = 6379
	}
	svcPort := opts.SvcPort
	if svcPort <= 0 {
		svcPort = 6379
	}
	labels := map[string]string{"app": name}

	ports := []corev1.ServicePort{{
		Name:       "redis",
		Port:       svcPort,
		Protocol:   corev1.ProtocolTCP,
		TargetPort: intstr.FromInt32(podPort),
	}}
	if opts.EnableExporter {
		ports = append(ports, corev1.ServicePort{
			Name:       "metrics",
			Port:       redisExporterMetricsPort,
			Protocol:   corev1.ProtocolTCP,
			TargetPort: intstr.FromInt32(redisExporterMetricsPort),
		})
	}

	svc := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      name,
			Namespace: ns,
			Labels:    labels,
		},
		Spec: corev1.ServiceSpec{
			Type:     redisK8sServiceTypeFromString(opts.ServiceType),
			Selector: labels,
			Ports:    ports,
		},
	}
	applyExplicitNodePorts(svc, opts.NodePortRedis, 0)
	return svc
}

func int32Ptr(i int32) *int32 { return &i }

func firstNonEmpty(a, b string) string {
	if strings.TrimSpace(a) != "" {
		return strings.TrimSpace(a)
	}
	return strings.TrimSpace(b)
}

func applySecret(ctx context.Context, k8s *kubernetes.Clientset, secret *corev1.Secret) error {
	ns := secret.Namespace
	scli := k8s.CoreV1().Secrets(ns)
	ex, err := scli.Get(ctx, secret.Name, metav1.GetOptions{})
	if err == nil {
		secret.ResourceVersion = ex.ResourceVersion
		_, err = scli.Update(ctx, secret, metav1.UpdateOptions{})
		return err
	}
	if apierrors.IsNotFound(err) {
		_, err = scli.Create(ctx, secret, metav1.CreateOptions{})
		return err
	}
	return err
}

func upsertService(ctx context.Context, k8s *kubernetes.Clientset, svc *corev1.Service) error {
	ns := svc.Namespace
	scli := k8s.CoreV1().Services(ns)
	exS, err := scli.Get(ctx, svc.Name, metav1.GetOptions{})
	if err == nil {
		svc.ResourceVersion = exS.ResourceVersion
		svc.Spec.ClusterIP = exS.Spec.ClusterIP
		svc.Spec.ClusterIPs = exS.Spec.ClusterIPs
		_, err = scli.Update(ctx, svc, metav1.UpdateOptions{})
		return err
	}
	if apierrors.IsNotFound(err) {
		_, err = scli.Create(ctx, svc, metav1.CreateOptions{})
		return err
	}
	return err
}

func upsertDeployment(ctx context.Context, k8s *kubernetes.Clientset, dep *appsv1.Deployment) error {
	ns := dep.Namespace
	dcli := k8s.AppsV1().Deployments(ns)
	exD, err := dcli.Get(ctx, dep.Name, metav1.GetOptions{})
	if err == nil {
		dep.ResourceVersion = exD.ResourceVersion
		_, err = dcli.Update(ctx, dep, metav1.UpdateOptions{})
		return err
	}
	if apierrors.IsNotFound(err) {
		_, err = dcli.Create(ctx, dep, metav1.CreateOptions{})
		return err
	}
	return err
}

func upsertStatefulSet(ctx context.Context, k8s *kubernetes.Clientset, sts *appsv1.StatefulSet) error {
	ns := sts.Namespace
	cli := k8s.AppsV1().StatefulSets(ns)
	ex, err := cli.Get(ctx, sts.Name, metav1.GetOptions{})
	if err == nil {
		sts.ResourceVersion = ex.ResourceVersion
		_, err = cli.Update(ctx, sts, metav1.UpdateOptions{})
		return err
	}
	if apierrors.IsNotFound(err) {
		_, err = cli.Create(ctx, sts, metav1.CreateOptions{})
		return err
	}
	return err
}

// EnsureRedisK8sDeployNoNameConflict 若命名空间内已存在同名工作负载则禁止再次部署（避免误覆盖）。
func EnsureRedisK8sDeployNoNameConflict(ctx context.Context, k8s *kubernetes.Clientset, opts RedisK8sDeployOpts) error {
	ns := strings.TrimSpace(opts.Namespace)
	base := strings.TrimSpace(opts.DeploymentName)
	if ns == "" || base == "" {
		return nil
	}
	switch topologyMode(opts.Topology) {
	case "sentinel":
		if _, err := k8s.AppsV1().Deployments(ns).Get(ctx, base+"-master", metav1.GetOptions{}); err == nil {
			return fmt.Errorf("命名空间 %s 已存在 Deployment %s-master，请更换 Deployment 名称或先删除已有资源", ns, base)
		} else if !apierrors.IsNotFound(err) {
			return fmt.Errorf("检查 Deployment: %w", err)
		}
		if _, err := k8s.AppsV1().StatefulSets(ns).Get(ctx, base+"-sentinel", metav1.GetOptions{}); err == nil {
			return fmt.Errorf("命名空间 %s 已存在 StatefulSet %s-sentinel，请更换 Deployment 名称或先删除已有资源", ns, base)
		} else if !apierrors.IsNotFound(err) {
			return fmt.Errorf("检查 StatefulSet: %w", err)
		}
	case "cluster":
		if _, err := k8s.AppsV1().StatefulSets(ns).Get(ctx, base+"-cluster", metav1.GetOptions{}); err == nil {
			return fmt.Errorf("命名空间 %s 已存在 StatefulSet %s-cluster，请更换 Deployment 名称或先删除已有资源", ns, base)
		} else if !apierrors.IsNotFound(err) {
			return fmt.Errorf("检查 StatefulSet: %w", err)
		}
		if redisK8sServiceTypeFromString(opts.ServiceType) != corev1.ServiceTypeClusterIP {
			if _, err := k8s.CoreV1().Services(ns).Get(ctx, base+"-cluster-access", metav1.GetOptions{}); err == nil {
				return fmt.Errorf("命名空间 %s 已存在 Service %s-cluster-access，请更换 Deployment 名称或先删除已有资源", ns, base)
			} else if !apierrors.IsNotFound(err) {
				return fmt.Errorf("检查 Service: %w", err)
			}
		}
	default:
		if _, err := k8s.AppsV1().Deployments(ns).Get(ctx, base, metav1.GetOptions{}); err == nil {
			return fmt.Errorf("命名空间 %s 已存在同名 Deployment %s，请更换名称或先删除已有资源", ns, base)
		} else if !apierrors.IsNotFound(err) {
			return fmt.Errorf("检查 Deployment: %w", err)
		}
	}
	return nil
}

// ApplyRedisK8sDeploy 按拓扑创建或更新 Redis 相关资源（standalone / sentinel / cluster）。
func ApplyRedisK8sDeploy(ctx context.Context, k8s *kubernetes.Clientset, cfg Config, opts RedisK8sDeployOpts) error {
	switch topologyMode(opts.Topology) {
	case "sentinel":
		return applyRedisSentinelStack(ctx, k8s, cfg, opts)
	case "cluster":
		return applyRedisClusterStack(ctx, k8s, cfg, opts)
	default:
		return applyRedisStandaloneStack(ctx, k8s, cfg, opts)
	}
}

func applyRedisStandaloneStack(ctx context.Context, k8s *kubernetes.Clientset, cfg Config, opts RedisK8sDeployOpts) error {
	if err := ValidateK8sNamespaceName(opts.Namespace); err != nil {
		return err
	}
	if err := ValidateK8sDeploymentName(opts.DeploymentName); err != nil {
		return err
	}
	if err := ValidateRedisDeployPassword(opts.Password); err != nil {
		return err
	}
	if err := validateK8sPort("Pod 端口", opts.PodPort); err != nil {
		return err
	}
	if err := validateK8sPort("Service 端口", opts.SvcPort); err != nil {
		return err
	}

	if sec := buildRedisAuthSecret(opts); sec != nil {
		if err := applySecret(ctx, k8s, sec); err != nil {
			return fmt.Errorf("应用 Secret: %w", err)
		}
	}

	name := strings.TrimSpace(opts.DeploymentName)
	ns := strings.TrimSpace(opts.Namespace)
	size := firstNonEmpty(opts.StorageSize, cfg.RedisK8sStorageSize)
	if size == "" {
		size = "10Gi"
	}
	var dataPVC string
	if opts.PersistenceEnabled {
		sc, err := ResolveRedisK8sStorageClass(ctx, k8s, firstNonEmpty(opts.StorageClassName, cfg.RedisK8sStorageClass))
		if err != nil {
			return fmt.Errorf("StorageClass: %w", err)
		}
		pvcName := redisDataPVCName(name)
		pvc, err := buildRedisPVC(ns, pvcName, sc, size, map[string]string{"app": name, "kube-bt-sync.io/redis-data": "true"})
		if err != nil {
			return fmt.Errorf("PVC: %w", err)
		}
		if err := applyPVC(ctx, k8s, pvc); err != nil {
			return fmt.Errorf("应用 PVC: %w", err)
		}
		dataPVC = pvcName
	}

	dep := buildRedisDeployment(cfg, opts, dataPVC)
	svc := buildRedisService(opts)

	if err := upsertDeployment(ctx, k8s, dep); err != nil {
		return fmt.Errorf("Deployment: %w", err)
	}
	if err := upsertService(ctx, k8s, svc); err != nil {
		return fmt.Errorf("Service: %w", err)
	}

	return nil
}

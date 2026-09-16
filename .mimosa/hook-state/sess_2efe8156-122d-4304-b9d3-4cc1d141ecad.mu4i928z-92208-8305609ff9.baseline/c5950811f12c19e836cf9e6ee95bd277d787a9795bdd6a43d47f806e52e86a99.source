package internal

import (
	"context"
	"fmt"
	"strings"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/intstr"
	"k8s.io/client-go/kubernetes"
)

func sentinelMonName(opts RedisK8sDeployOpts) string {
	s := strings.TrimSpace(opts.SentinelMasterName)
	if s == "" {
		return "mymaster"
	}
	return s
}

func applyRedisSentinelStack(ctx context.Context, k8s *kubernetes.Clientset, cfg Config, opts RedisK8sDeployOpts) error {
	if err := ValidateK8sNamespaceName(opts.Namespace); err != nil {
		return err
	}
	if err := ValidateK8sDeploymentName(opts.DeploymentName); err != nil {
		return err
	}
	if err := validateSentinelNamePrefix(opts.DeploymentName); err != nil {
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

	ns := strings.TrimSpace(opts.Namespace)
	base := strings.TrimSpace(opts.DeploymentName)
	masterName := base + "-master"
	replicaName := base + "-replica"
	sentinelStsName := base + "-sentinel"
	mon := sentinelMonName(opts)
	redisImg := ResolveRedisServerImage(cfg, opts.Version, opts.RedisImage)
	podPort := opts.PodPort
	if podPort <= 0 {
		podPort = 6379
	}

	if sec := buildRedisAuthSecret(opts); sec != nil {
		if err := applySecret(ctx, k8s, sec); err != nil {
			return fmt.Errorf("应用 Secret: %w", err)
		}
	}

	masterSvc := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{Name: masterName, Namespace: ns, Labels: sentinelLabels(base, "master")},
		Spec: corev1.ServiceSpec{
			Type:     redisK8sServiceTypeFromString(opts.ServiceType),
			Selector: sentinelSelector(base, "master"),
			Ports: []corev1.ServicePort{{
				Name:       "redis",
				Port:       opts.SvcPort,
				Protocol:   corev1.ProtocolTCP,
				TargetPort: intstr.FromInt32(podPort),
			}},
		},
	}
	applyExplicitNodePorts(masterSvc, opts.NodePortRedis, 0)
	if err := upsertService(ctx, k8s, masterSvc); err != nil {
		return fmt.Errorf("Service master: %w", err)
	}

	size := firstNonEmpty(opts.StorageSize, cfg.RedisK8sStorageSize)
	if size == "" {
		size = "10Gi"
	}
	var masterPVC string
	if opts.PersistenceEnabled {
		sc, err := ResolveRedisK8sStorageClass(ctx, k8s, firstNonEmpty(opts.StorageClassName, cfg.RedisK8sStorageClass))
		if err != nil {
			return fmt.Errorf("StorageClass: %w", err)
		}
		pvcName := redisDataPVCName(masterName)
		pvc, err := buildRedisPVC(ns, pvcName, sc, size, map[string]string{"app": base, "redis-role": "master"})
		if err != nil {
			return fmt.Errorf("PVC master: %w", err)
		}
		if err := applyPVC(ctx, k8s, pvc); err != nil {
			return fmt.Errorf("应用 PVC master: %w", err)
		}
		masterPVC = pvcName
	}

	masterDep := buildSentinelMasterDeployment(cfg, opts, redisImg, masterName, base, masterPVC)
	if err := upsertDeployment(ctx, k8s, masterDep); err != nil {
		return fmt.Errorf("Deployment master: %w", err)
	}

	replicaDep := buildSentinelReplicaDeployment(cfg, opts, redisImg, replicaName, base, masterName, ns, podPort)
	if err := upsertDeployment(ctx, k8s, replicaDep); err != nil {
		return fmt.Errorf("Deployment replica: %w", err)
	}

	// Headless Service：为 StatefulSet Pod 提供稳定 DNS（pod-0.sts-svc.ns.svc.cluster.local）
	headless := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{Name: sentinelStsName, Namespace: ns, Labels: sentinelLabels(base, "sentinel")},
		Spec: corev1.ServiceSpec{
			Type:                     corev1.ServiceTypeClusterIP,
			ClusterIP:                corev1.ClusterIPNone,
			PublishNotReadyAddresses: true,
			Selector:                 sentinelSelector(base, "sentinel"),
			Ports: []corev1.ServicePort{{
				Name:       "sentinel",
				Port:       26379,
				Protocol:   corev1.ProtocolTCP,
				TargetPort: intstr.FromInt32(26379),
			}},
		},
	}
	if err := upsertService(ctx, k8s, headless); err != nil {
		return fmt.Errorf("Service sentinel headless: %w", err)
	}

	var scForSTS string
	if opts.PersistenceEnabled {
		var err error
		scForSTS, err = ResolveRedisK8sStorageClass(ctx, k8s, firstNonEmpty(opts.StorageClassName, cfg.RedisK8sStorageClass))
		if err != nil {
			return fmt.Errorf("StorageClass: %w", err)
		}
	}
	sentinelSts := buildSentinelStatefulSet(cfg, opts, redisImg, sentinelStsName, base, masterName, ns, mon, podPort, scForSTS, size)
	if err := upsertStatefulSet(ctx, k8s, sentinelSts); err != nil {
		return fmt.Errorf("StatefulSet sentinel: %w", err)
	}

	return nil
}

func validateSentinelNamePrefix(base string) error {
	if len(base)+len("-sentinel") > 63 {
		return fmt.Errorf("Deployment 名称过长：哨兵模式会追加 -master/-replica/-sentinel 等后缀（总长须 ≤63）")
	}
	return nil
}

func sentinelLabels(base, role string) map[string]string {
	return map[string]string{
		"app.kubernetes.io/name":     "redis",
		"app.kubernetes.io/instance": base,
		"app.kubernetes.io/component": role,
		"redis-app":  base,
		"redis-role": role,
	}
}

func sentinelSelector(base, role string) map[string]string {
	return map[string]string{
		"redis-app":  base,
		"redis-role": role,
	}
}

func buildSentinelMasterDeployment(cfg Config, opts RedisK8sDeployOpts, redisImg, deployName, base, dataPVCClaim string) *appsv1.Deployment {
	ns := strings.TrimSpace(opts.Namespace)
	labels := sentinelLabels(base, "master")
	dataDir := ""
	if strings.TrimSpace(dataPVCClaim) != "" {
		dataDir = "/data"
	}
	containers := []corev1.Container{buildRedisMainContainer(opts, redisImg, dataDir)}
	if opts.EnableExporter {
		containers = append(containers, buildRedisExporterContainer(cfg, opts))
	}
	ann := map[string]string{}
	if opts.EnableExporter {
		ann["prometheus.io/scrape"] = "true"
		ann["prometheus.io/port"] = fmt.Sprintf("%d", redisExporterMetricsPort)
		ann["prometheus.io/path"] = "/metrics"
	}
	podSpec := corev1.PodSpec{
		Containers:       containers,
		ImagePullSecrets: ImagePullSecretsForRedisDeploy(cfg, opts.ImagePullSecret),
	}
	if strings.TrimSpace(dataPVCClaim) != "" {
		podSpec.Volumes = []corev1.Volume{{
			Name: "redis-data",
			VolumeSource: corev1.VolumeSource{
				PersistentVolumeClaim: &corev1.PersistentVolumeClaimVolumeSource{ClaimName: dataPVCClaim},
			},
		}}
		podSpec.Containers[0].VolumeMounts = []corev1.VolumeMount{{Name: "redis-data", MountPath: "/data"}}
	}
	return &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{Name: deployName, Namespace: ns, Labels: labels},
		Spec: appsv1.DeploymentSpec{
			Replicas: int32Ptr(1),
			Selector: &metav1.LabelSelector{MatchLabels: sentinelSelector(base, "master")},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: labels, Annotations: ann},
				Spec:       podSpec,
			},
		},
	}
}

func buildSentinelReplicaDeployment(cfg Config, opts RedisK8sDeployOpts, redisImg, deployName, base, masterSvcName, ns string, podPort int32) *appsv1.Deployment {
	labels := sentinelLabels(base, "replica")
	hasPw := strings.TrimSpace(opts.Password) != ""
	pol := strings.TrimSpace(maxmemPolicyOrDefault(opts.MaxmemoryPolicy))
	mem := strings.TrimSpace(opts.Maxmemory)
	if mem == "" {
		mem = "256mb"
	}
	aof := "no"
	if opts.Appendonly {
		aof = "yes"
	}
	masterHost := fmt.Sprintf("%s.%s.svc.cluster.local", masterSvcName, ns)

	var c corev1.Container
	exShell := redisRdbShellFragment(opts) + redisEnterpriseArgsShell(opts) + redisExtraArgsShellFragment(opts)
	if hasPw {
		c = corev1.Container{
			Name:  "redis",
			Image: redisImg,
			Ports: []corev1.ContainerPort{{Name: "redis", ContainerPort: podPort}},
			Env:   []corev1.EnvVar{redisPasswordEnv(base)},
			Command: []string{"/bin/sh", "-c"},
			Args: []string{
				fmt.Sprintf(
					`exec redis-server --replicaof %s %d --masterauth "$REDIS_PASSWORD" --maxmemory %s --maxmemory-policy %s --appendonly %s%s`,
					masterHost, podPort, shellQuoteForSh(mem), shellQuoteForSh(pol), shellQuoteForSh(aof), exShell,
				),
			},
		}
	} else {
		args := []string{
			"redis-server",
			"--replicaof", masterHost, fmt.Sprintf("%d", podPort),
			"--maxmemory", mem,
			"--maxmemory-policy", pol,
			"--appendonly", aof,
		}
		args = append(args, redisRdbArgv(opts)...)
		args = append(args, redisEnterpriseArgsArgv(opts)...)
		args = append(args, redisExtraArgsArgv(opts)...)
		c = corev1.Container{
			Name:  "redis",
			Image: redisImg,
			Ports: []corev1.ContainerPort{{Name: "redis", ContainerPort: podPort}},
			Args:  args,
		}
	}
	applyRedisWorkloadResources(&c, opts)

	return &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{Name: deployName, Namespace: ns, Labels: labels},
		Spec: appsv1.DeploymentSpec{
			Replicas: int32Ptr(2),
			Selector: &metav1.LabelSelector{MatchLabels: sentinelSelector(base, "replica")},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: labels},
				Spec: corev1.PodSpec{
					Containers:       []corev1.Container{c},
					ImagePullSecrets: ImagePullSecretsForRedisDeploy(cfg, opts.ImagePullSecret),
				},
			},
		},
	}
}

func sentinelInitScript(mon, masterFQDN string, podPort int32, hasPw bool) string {
	var b strings.Builder
	b.WriteString("set -e\n")
	fmt.Fprintf(&b, "mon=%s\n", shellQuoteForSh(mon))
	b.WriteString("cat > /shared/sentinel.conf <<'EOF'\nport 26379\ndir /data\nsentinel resolve-hostnames yes\n")
	fmt.Fprintf(&b, "sentinel monitor %s %s %d 2\n", mon, masterFQDN, podPort)
	b.WriteString("EOF\n")
	if hasPw {
		b.WriteString(`if [ -n "$REDIS_PASSWORD" ]; then
  printf 'sentinel auth-pass %s %s\n' "$mon" "$REDIS_PASSWORD" >> /shared/sentinel.conf
fi
`)
	}
	return b.String()
}

func buildSentinelStatefulSet(cfg Config, opts RedisK8sDeployOpts, redisImg, stsName, base, masterSvcName, ns, mon string, podPort int32, volumeSC string, size string) *appsv1.StatefulSet {
	labels := sentinelLabels(base, "sentinel")
	masterFQDN := fmt.Sprintf("%s.%s.svc.cluster.local", masterSvcName, ns)
	hasPw := strings.TrimSpace(opts.Password) != ""
	initScript := sentinelInitScript(mon, masterFQDN, podPort, hasPw)

	initEnv := []corev1.EnvVar{}
	if hasPw {
		initEnv = append(initEnv, redisPasswordEnv(base))
	}

	sentinelVol := []corev1.Volume{
		{Name: "sentinel-shared", VolumeSource: corev1.VolumeSource{EmptyDir: &corev1.EmptyDirVolumeSource{}}},
	}
	stsSpec := appsv1.StatefulSetSpec{
		ServiceName: stsName,
		Replicas:    int32Ptr(3),
		Selector:    &metav1.LabelSelector{MatchLabels: sentinelSelector(base, "sentinel")},
		Template: corev1.PodTemplateSpec{
			ObjectMeta: metav1.ObjectMeta{Labels: labels},
			Spec: corev1.PodSpec{
				ImagePullSecrets: ImagePullSecretsForRedisDeploy(cfg, opts.ImagePullSecret),
				InitContainers: []corev1.Container{{
					Name:    "write-sentinel-conf",
					Image:   redisImg,
					Command: []string{"/bin/sh", "-c"},
					Args:    []string{initScript},
					Env:     initEnv,
					VolumeMounts: []corev1.VolumeMount{
						{Name: "sentinel-shared", MountPath: "/shared"},
					},
				}},
				Containers: []corev1.Container{{
					Name:    "sentinel",
					Image:   redisImg,
					Command: []string{"redis-sentinel"},
					Args:    []string{"/shared/sentinel.conf"},
					Ports:   []corev1.ContainerPort{{Name: "sentinel", ContainerPort: 26379}},
					VolumeMounts: []corev1.VolumeMount{
						{Name: "sentinel-shared", MountPath: "/shared"},
						{Name: "sentinel-data", MountPath: "/data"},
					},
					Env: initEnv,
				}},
				Volumes: sentinelVol,
			},
		},
	}
	if strings.TrimSpace(volumeSC) != "" {
		sz := strings.TrimSpace(size)
		if sz == "" {
			sz = "5Gi"
		}
		tpl, err := BuildVolumeClaimTemplate("sentinel-data", volumeSC, sz)
		if err == nil {
			stsSpec.VolumeClaimTemplates = []corev1.PersistentVolumeClaim{tpl}
			stsSpec.Template.Spec.Volumes = sentinelVol
		} else {
			sentinelVol = append(sentinelVol, corev1.Volume{
				Name:         "sentinel-data",
				VolumeSource: corev1.VolumeSource{EmptyDir: &corev1.EmptyDirVolumeSource{}},
			})
			stsSpec.Template.Spec.Volumes = sentinelVol
		}
	} else {
		sentinelVol = append(sentinelVol, corev1.Volume{
			Name:         "sentinel-data",
			VolumeSource: corev1.VolumeSource{EmptyDir: &corev1.EmptyDirVolumeSource{}},
		})
		stsSpec.Template.Spec.Volumes = sentinelVol
	}

	return &appsv1.StatefulSet{
		ObjectMeta: metav1.ObjectMeta{Name: stsName, Namespace: ns, Labels: labels},
		Spec:       stsSpec,
	}
}

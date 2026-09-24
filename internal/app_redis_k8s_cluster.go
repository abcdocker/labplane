package internal

import (
	"context"
	"fmt"
	"strings"
	"time"

	appsv1 "k8s.io/api/apps/v1"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/intstr"
	"k8s.io/client-go/kubernetes"
)

const clusterNodeCount = 6

func applyRedisClusterStack(ctx context.Context, k8s *kubernetes.Clientset, cfg Config, opts RedisK8sDeployOpts) error {
	if err := ValidateK8sNamespaceName(opts.Namespace); err != nil {
		return err
	}
	if err := ValidateK8sDeploymentName(opts.DeploymentName); err != nil {
		return err
	}
	if err := validateClusterNamePrefix(opts.DeploymentName); err != nil {
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
	stsName := base + "-cluster"
	headlessName := base + "-cluster-headless"
	jobName := base + "-cluster-init"
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

	size := firstNonEmpty(opts.StorageSize, cfg.RedisK8sStorageSize)
	if size == "" {
		size = "10Gi"
	}
	var volSC string
	if opts.PersistenceEnabled {
		sc, err := ResolveRedisK8sStorageClass(ctx, k8s, firstNonEmpty(opts.StorageClassName, cfg.RedisK8sStorageClass))
		if err != nil {
			return fmt.Errorf("StorageClass: %w", err)
		}
		volSC = sc
	}

	headless := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{Name: headlessName, Namespace: ns, Labels: clusterLabels(base)},
		Spec: corev1.ServiceSpec{
			Type:                     corev1.ServiceTypeClusterIP,
			ClusterIP:                corev1.ClusterIPNone,
			PublishNotReadyAddresses: true,
			Selector:                 clusterSelector(base),
			Ports: []corev1.ServicePort{
				{Name: "redis", Port: podPort, Protocol: corev1.ProtocolTCP, TargetPort: intstr.FromInt32(podPort)},
				{Name: "cluster-bus", Port: 16379, Protocol: corev1.ProtocolTCP, TargetPort: intstr.FromInt32(16379)},
			},
		},
	}
	if err := upsertService(ctx, k8s, headless); err != nil {
		return fmt.Errorf("Service headless: %w", err)
	}

	if acc := buildClusterAccessService(opts); acc != nil {
		if err := upsertService(ctx, k8s, acc); err != nil {
			return fmt.Errorf("Service cluster-access: %w", err)
		}
	}

	sts := buildRedisClusterStatefulSet(cfg, opts, redisImg, stsName, headlessName, ns, podPort, volSC, size)
	if err := upsertStatefulSet(ctx, k8s, sts); err != nil {
		return fmt.Errorf("StatefulSet cluster: %w", err)
	}

	job := buildClusterInitJob(cfg, opts, redisImg, jobName, stsName, headlessName, ns, podPort)
	if err := replaceJob(ctx, k8s, job); err != nil {
		return fmt.Errorf("Job cluster-init: %w", err)
	}

	return nil
}

func validateClusterNamePrefix(base string) error {
	if len(base)+len("-cluster-headless") > 63 || len(base)+len("-cluster-init") > 63 {
		return fmt.Errorf("Deployment 名称过长：Cluster 模式会追加 -cluster/-cluster-headless/-cluster-init 等后缀（总长须 ≤63）")
	}
	return nil
}

func clusterLabels(base string) map[string]string {
	return map[string]string{
		"app.kubernetes.io/name":     "redis-cluster",
		"app.kubernetes.io/instance": base,
		"redis-app":                  base,
		"redis-topology":             "cluster",
	}
}

func clusterSelector(base string) map[string]string {
	return map[string]string{
		"redis-app":      base,
		"redis-topology": "cluster",
	}
}

func buildClusterRedisContainer(opts RedisK8sDeployOpts, redisImg string, base string, podPort int32) corev1.Container {
	pol := strings.TrimSpace(maxmemPolicyOrDefault(opts.MaxmemoryPolicy))
	mem := strings.TrimSpace(opts.Maxmemory)
	if mem == "" {
		mem = "256mb"
	}
	aof := "no"
	if opts.Appendonly {
		aof = "yes"
	}
	hasPw := strings.TrimSpace(opts.Password) != ""
	ex := redisRdbShellFragment(opts) + redisEnterpriseArgsShell(opts) + redisExtraArgsShellFragment(opts)

	var script string
	if hasPw {
		script = fmt.Sprintf(
			`exec redis-server --cluster-enabled yes --cluster-config-file /data/nodes.conf --cluster-node-timeout 5000 `+
				`--appendonly %s --maxmemory %s --maxmemory-policy %s%s `+
				`--cluster-announce-ip "$POD_IP" --cluster-announce-port %d --cluster-announce-bus-port 16379 `+
				`--requirepass "$REDIS_PASSWORD" --masterauth "$REDIS_PASSWORD"`,
			shellQuoteForSh(aof), shellQuoteForSh(mem), shellQuoteForSh(pol), ex, podPort,
		)
	} else {
		script = fmt.Sprintf(
			`exec redis-server --cluster-enabled yes --cluster-config-file /data/nodes.conf --cluster-node-timeout 5000 `+
				`--appendonly %s --maxmemory %s --maxmemory-policy %s%s `+
				`--cluster-announce-ip "$POD_IP" --cluster-announce-port %d --cluster-announce-bus-port 16379`,
			shellQuoteForSh(aof), shellQuoteForSh(mem), shellQuoteForSh(pol), ex, podPort,
		)
	}

	fieldPath := "status.podIP"
	if opts.HostNetwork {
		fieldPath = "status.hostIP"
	}
	env := []corev1.EnvVar{{
		Name: "POD_IP",
		ValueFrom: &corev1.EnvVarSource{
			FieldRef: &corev1.ObjectFieldSelector{FieldPath: fieldPath},
		},
	}}
	if hasPw {
		env = append(env, redisPasswordEnv(base))
	}

	c := corev1.Container{
		Name:    "redis",
		Image:   redisImg,
		Command: []string{"/bin/sh", "-c"},
		Args:    []string{script},
		Ports: []corev1.ContainerPort{
			{Name: "redis", ContainerPort: podPort},
			{Name: "cluster-bus", ContainerPort: 16379},
		},
		Env: env,
		VolumeMounts: []corev1.VolumeMount{
			{Name: "data", MountPath: "/data"},
		},
		ReadinessProbe: &corev1.Probe{
			ProbeHandler: corev1.ProbeHandler{
				TCPSocket: &corev1.TCPSocketAction{Port: intstr.FromInt32(podPort)},
			},
			InitialDelaySeconds: 5,
			PeriodSeconds:       3,
			FailureThreshold:    40,
		},
	}
	applyRedisWorkloadResources(&c, opts)
	return c
}

func buildRedisClusterStatefulSet(cfg Config, opts RedisK8sDeployOpts, redisImg, stsName, headlessName, ns string, podPort int32, volumeSC, size string) *appsv1.StatefulSet {
	base := strings.TrimSpace(opts.DeploymentName)
	labels := clusterLabels(base)
	sel := clusterSelector(base)

	podSpec := corev1.PodSpec{
		ImagePullSecrets: PodImagePullSecrets(cfg),
		Containers:       []corev1.Container{buildClusterRedisContainer(opts, redisImg, base, podPort)},
	}
	if opts.HostNetwork {
		podSpec.HostNetwork = true
		podSpec.DNSPolicy = corev1.DNSClusterFirstWithHostNet
		// hostNetwork 下多个 Pod 不能共用同一节点的相同端口，尽量分散到不同节点
		podSpec.Affinity = &corev1.Affinity{
			PodAntiAffinity: &corev1.PodAntiAffinity{
				PreferredDuringSchedulingIgnoredDuringExecution: []corev1.WeightedPodAffinityTerm{
					{
						Weight: 100,
						PodAffinityTerm: corev1.PodAffinityTerm{
							LabelSelector: &metav1.LabelSelector{
								MatchLabels: clusterSelector(base),
							},
							TopologyKey: "kubernetes.io/hostname",
						},
					},
				},
			},
		}
	}

	stsSpec := appsv1.StatefulSetSpec{
		ServiceName: headlessName,
		Replicas:    int32Ptr(clusterNodeCount),
		Selector:    &metav1.LabelSelector{MatchLabels: sel},
		Template: corev1.PodTemplateSpec{
			ObjectMeta: metav1.ObjectMeta{Labels: labels},
			Spec:       podSpec,
		},
	}

	if strings.TrimSpace(volumeSC) != "" {
		sz := strings.TrimSpace(size)
		if sz == "" {
			sz = "10Gi"
		}
		tpl, err := BuildVolumeClaimTemplate("data", volumeSC, sz)
		if err == nil {
			stsSpec.VolumeClaimTemplates = []corev1.PersistentVolumeClaim{tpl}
		} else {
			stsSpec.Template.Spec.Volumes = []corev1.Volume{
				{Name: "data", VolumeSource: corev1.VolumeSource{EmptyDir: &corev1.EmptyDirVolumeSource{}}},
			}
		}
	} else {
		stsSpec.Template.Spec.Volumes = []corev1.Volume{
			{Name: "data", VolumeSource: corev1.VolumeSource{EmptyDir: &corev1.EmptyDirVolumeSource{}}},
		}
	}

	return &appsv1.StatefulSet{
		ObjectMeta: metav1.ObjectMeta{Name: stsName, Namespace: ns, Labels: labels},
		Spec:       stsSpec,
	}
}

func buildClusterInitJob(cfg Config, opts RedisK8sDeployOpts, redisImg, jobName, stsName, headlessName, ns string, podPort int32) *batchv1.Job {
	base := strings.TrimSpace(opts.DeploymentName)
	hasPw := strings.TrimSpace(opts.Password) != ""

	auth := ""
	if hasPw {
		auth = `-a "$REDIS_PASSWORD"`
	}

	script := fmt.Sprintf(`set -e
NS=%s
HEADLESS=%s
PORT=%d
PREFIX=%s

first_host="${PREFIX}-0.${HEADLESS}.${NS}.svc.cluster.local"
if redis-cli -h "$first_host" -p "$PORT" %s cluster info 2>/dev/null | grep -q 'cluster_state:ok'; then
  echo "cluster already formed"
  exit 0
fi

for attempt in $(seq 1 90); do
  ok=1
  for i in 0 1 2 3 4 5; do
    H="${PREFIX}-${i}.${HEADLESS}.${NS}.svc.cluster.local"
    if ! redis-cli -h "$H" -p "$PORT" %s ping >/dev/null 2>&1; then
      ok=0
      break
    fi
  done
  if [ "$ok" = "1" ]; then
    break
  fi
  sleep 2
done

NODES=""
for i in 0 1 2 3 4 5; do
  NODES="$NODES ${PREFIX}-${i}.${HEADLESS}.${NS}.svc.cluster.local:${PORT}"
done

exec redis-cli %s --cluster create $NODES --cluster-replicas 1 --cluster-yes
`,
		shellQuoteForSh(ns),
		shellQuoteForSh(headlessName),
		podPort,
		shellQuoteForSh(stsName),
		auth,
		auth,
		auth,
	)

	env := []corev1.EnvVar{}
	if hasPw {
		env = append(env, redisPasswordEnv(base))
	}

	return &batchv1.Job{
		ObjectMeta: metav1.ObjectMeta{Name: jobName, Namespace: ns, Labels: clusterLabels(base)},
		Spec: batchv1.JobSpec{
			BackoffLimit:            int32Ptr(2),
			TTLSecondsAfterFinished: int32Ptr(86400),
			Template: corev1.PodTemplateSpec{
				Spec: corev1.PodSpec{
					RestartPolicy:    corev1.RestartPolicyNever,
					ImagePullSecrets: ImagePullSecretsForRedisDeploy(cfg, opts.ImagePullSecret),
					Containers: []corev1.Container{{
						Name:    "cluster-init",
						Image:   redisImg,
						Command: []string{"/bin/sh", "-c"},
						Args:    []string{script},
						Env:     env,
					}},
				},
			},
		},
	}
}

func replaceJob(ctx context.Context, k8s *kubernetes.Clientset, job *batchv1.Job) error {
	ns := job.Namespace
	name := job.Name
	jcli := k8s.BatchV1().Jobs(ns)
	_, err := jcli.Get(ctx, name, metav1.GetOptions{})
	if err == nil {
		fg := metav1.DeletePropagationForeground
		if err := jcli.Delete(ctx, name, metav1.DeleteOptions{PropagationPolicy: &fg}); err != nil && !apierrors.IsNotFound(err) {
			return err
		}
		for i := 0; i < 120; i++ {
			_, err := jcli.Get(ctx, name, metav1.GetOptions{})
			if apierrors.IsNotFound(err) {
				break
			}
			if err != nil {
				return err
			}
			time.Sleep(time.Second)
		}
	} else if !apierrors.IsNotFound(err) {
		return err
	}
	_, err = jcli.Create(ctx, job, metav1.CreateOptions{})
	return err
}

// buildClusterAccessService 对外访问用 Cluster（NodePort / LoadBalancer）；headless 仍用于集群内 Pod DNS。
func buildClusterAccessService(opts RedisK8sDeployOpts) *corev1.Service {
	t := redisK8sServiceTypeFromString(opts.ServiceType)
	if t == corev1.ServiceTypeClusterIP {
		return nil
	}
	ns := strings.TrimSpace(opts.Namespace)
	base := strings.TrimSpace(opts.DeploymentName)
	podPort := opts.PodPort
	if podPort <= 0 {
		podPort = 6379
	}
	svcPort := opts.SvcPort
	if svcPort <= 0 {
		svcPort = 6379
	}
	name := base + "-cluster-access"
	svc := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: ns, Labels: clusterLabels(base)},
		Spec: corev1.ServiceSpec{
			Type:     t,
			Selector: clusterSelector(base),
			Ports: []corev1.ServicePort{
				{Name: "redis", Port: svcPort, Protocol: corev1.ProtocolTCP, TargetPort: intstr.FromInt32(podPort)},
				{Name: "cluster-bus", Port: 16379, Protocol: corev1.ProtocolTCP, TargetPort: intstr.FromInt32(16379)},
			},
		},
	}
	applyExplicitNodePorts(svc, opts.NodePortRedis, opts.NodePortClusterBus)
	return svc
}

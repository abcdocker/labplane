package internal

import (
	"context"
	"fmt"
	"strings"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/intstr"
	"k8s.io/client-go/kubernetes"
)

// KafkaK8sDeployOpts 一组独立 ZooKeeper + Kafka（推荐 3 ZK + 3 Broker），SASL_SCRAM-SHA-512 客户端端口 9092。
type KafkaK8sDeployOpts struct {
	Namespace        string
	BaseName         string
	ZookeeperImage   string
	KafkaImage       string
	BusyboxImage     string
	ImagePullSecret  string
	ZkReplicas       int32
	KafkaReplicas    int32
	ZkStorageSize    string
	KafkaStorageSize string
	StorageClassName string
	SaslUsername     string
	SaslPassword     string
	SaslMechanism    string
	ExtraKafkaEnv    []corev1.EnvVar
	TemplateID       int64
	TemplateName     string
}

func kafkaZkSTSName(base string) string { return strings.TrimSpace(base) + "-zk" }
func kafkaZkHLName(base string) string { return strings.TrimSpace(base) + "-zk-hl" }
func kafkaKafkaSTSName(base string) string { return strings.TrimSpace(base) + "-kafka" }
func kafkaKafkaHLName(base string) string { return strings.TrimSpace(base) + "-kafka-hl" }

func kafkaZkConnectCSV(ns, base string, zkRep int32) string {
	sts := kafkaZkSTSName(base)
	hl := kafkaZkHLName(base)
	ns = strings.TrimSpace(ns)
	var parts []string
	for i := int32(0); i < zkRep; i++ {
		parts = append(parts, fmt.Sprintf("%s-%d.%s.%s.svc.cluster.local:2181", sts, i, hl, ns))
	}
	return strings.Join(parts, ",")
}

func kafkaZooServersEnv(ns, base string, zkRep int32) string {
	sts := kafkaZkSTSName(base)
	hl := kafkaZkHLName(base)
	ns = strings.TrimSpace(ns)
	var segs []string
	for i := int32(1); i <= zkRep; i++ {
		host := fmt.Sprintf("%s-%d.%s.%s.svc.cluster.local", sts, i-1, hl, ns)
		// ZK 3.6+ 格式：server.N=host:peerPort:electionPort;clientPort
		// `;2181` 是每个 server 条目自身的客户端监听端口（非条目分隔符）。
		// 不写 `;2181` 时若 zoo.cfg 无独立 clientPort 属性（官方 3.9.x 镜像在某些条件下不写入），
		// ZK 则完全不监听 2181（日志出现 clientPortListenBacklog -1），readiness probe 永远失败。
		// 条目间仍用空格分隔，官方镜像 entrypoint 通过 `for server in $ZOO_SERVERS` 按空白拆分写入 zoo.cfg。
		segs = append(segs, fmt.Sprintf("server.%d=%s:2888:3888;2181", i, host))
	}
	return strings.Join(segs, " ")
}

// kafkaWaitZookeeperInitShell 在 Kafka 主容器前轮询各 ZK 的 2181，避免 Bitnami 在「Creating users in Zookeeper」
// 内用 wait-for-port 仅等待约 30s 即失败（ZK 选主慢、NFS 慢、并行起 Pod 时 headless DNS 未就绪时常见）。
func kafkaWaitZookeeperInitShell(ns, base string, zkRep int32) string {
	if zkRep <= 0 {
		zkRep = 3
	}
	sts := kafkaZkSTSName(base)
	hl := kafkaZkHLName(base)
	ns = strings.TrimSpace(ns)
	var b strings.Builder
	for i := int32(0); i < zkRep; i++ {
		host := fmt.Sprintf("%s-%d.%s.%s.svc.cluster.local", sts, i, hl, ns)
		b.WriteString(fmt.Sprintf("    nc -z -w 3 %s 2181 || ok=false\n", host))
	}
	// 450 * 2s ≈ 15min
	return fmt.Sprintf(`set -eu
echo "waiting for ZooKeeper :2181 on %d endpoints..."
max=450
n=0
while [ "$n" -lt "$max" ]; do
  ok=true
%s  if [ "$ok" = true ]; then
    echo "ZooKeeper client ports reachable"
    exit 0
  fi
  n=$((n+1))
  rem=$((n %% 15))
  if [ "$rem" -eq 0 ]; then
    echo "still waiting for ZK (${max} attempts max, n=$n)..."
  fi
  sleep 2
done
echo "timeout waiting for ZooKeeper 2181"
exit 1
`, zkRep, b.String())
}

func kafkaBootstrapBrokersCSV(ns, base string, kRep int32) string {
	sts := kafkaKafkaSTSName(base)
	hl := kafkaKafkaHLName(base)
	ns = strings.TrimSpace(ns)
	var parts []string
	for i := int32(0); i < kRep; i++ {
		parts = append(parts, fmt.Sprintf("%s-%d.%s.%s.svc.cluster.local:9092", sts, i, hl, ns))
	}
	return strings.Join(parts, ",")
}

func kafkaExtraEnvFromTemplateLines(lines []string) []corev1.EnvVar {
	var out []corev1.EnvVar
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		i := strings.IndexByte(line, '=')
		if i <= 0 {
			continue
		}
		k, v := strings.TrimSpace(line[:i]), strings.TrimSpace(line[i+1:])
		if k == "" {
			continue
		}
		out = append(out, corev1.EnvVar{Name: k, Value: v})
	}
	return out
}

func kafkaImagePullSecrets(name string) []corev1.LocalObjectReference {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil
	}
	return []corev1.LocalObjectReference{{Name: name}}
}

func kafkaLabels(base, component string) map[string]string {
	return map[string]string{
		"app.kubernetes.io/name":      strings.TrimSpace(base),
		"app.kubernetes.io/component": component,
		"app.kubernetes.io/managed-by": "kube-bt-sync",
		"kube-bt-sync.io/kafka":       "true",
	}
}

// EnsureKafkaK8sNoNameConflict 避免覆盖已有 ZK/Kafka 工作负载。
func EnsureKafkaK8sNoNameConflict(ctx context.Context, k8s *kubernetes.Clientset, opts KafkaK8sDeployOpts) error {
	ns := strings.TrimSpace(opts.Namespace)
	base := strings.TrimSpace(opts.BaseName)
	if ns == "" || base == "" {
		return nil
	}
	checks := []struct {
		kind string
		name string
	}{
		{"StatefulSet", kafkaZkSTSName(base)},
		{"StatefulSet", kafkaKafkaSTSName(base)},
		{"Service", kafkaZkHLName(base)},
		{"Service", kafkaKafkaHLName(base)},
	}
	for _, ck := range checks {
		switch ck.kind {
		case "StatefulSet":
			if _, err := k8s.AppsV1().StatefulSets(ns).Get(ctx, ck.name, metav1.GetOptions{}); err == nil {
				return fmt.Errorf("命名空间 %s 已存在 StatefulSet %s，请更换名称或先删除", ns, ck.name)
			} else if !apierrors.IsNotFound(err) {
				return fmt.Errorf("检查 StatefulSet: %w", err)
			}
		case "Service":
			if _, err := k8s.CoreV1().Services(ns).Get(ctx, ck.name, metav1.GetOptions{}); err == nil {
				return fmt.Errorf("命名空间 %s 已存在 Service %s，请更换名称或先删除", ns, ck.name)
			} else if !apierrors.IsNotFound(err) {
				return fmt.Errorf("检查 Service: %w", err)
			}
		}
	}
	return nil
}

// ApplyKafkaK8sDeploy 创建 ZK ensemble + Kafka 集群（Bitnami Kafka + 官方 ZooKeeper 镜像）。
func ApplyKafkaK8sDeploy(ctx context.Context, k8s *kubernetes.Clientset, opts KafkaK8sDeployOpts) error {
	if err := ValidateK8sNamespaceName(opts.Namespace); err != nil {
		return err
	}
	if err := ValidateK8sDeploymentName(opts.BaseName); err != nil {
		return err
	}
	zr := opts.ZkReplicas
	kr := opts.KafkaReplicas
	if zr <= 0 {
		zr = 3
	}
	if kr <= 0 {
		kr = 3
	}
	ns := strings.TrimSpace(opts.Namespace)
	base := strings.TrimSpace(opts.BaseName)
	zkSize := firstNonEmpty(opts.ZkStorageSize, "20Gi")
	kSize := firstNonEmpty(opts.KafkaStorageSize, "100Gi")
	sc := strings.TrimSpace(opts.StorageClassName)
	busybox := strings.TrimSpace(opts.BusyboxImage)
	if busybox == "" {
		busybox = "docker.io/library/busybox:1.36.1"
	}

	zkLabels := kafkaLabels(base, "zookeeper")
	zkHL := kafkaZkHLName(base)
	zkSTS := kafkaZkSTSName(base)
	zooServers := kafkaZooServersEnv(ns, base, zr)

	zkSvc := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{Name: zkHL, Namespace: ns, Labels: zkLabels},
		Spec: corev1.ServiceSpec{
			ClusterIP: corev1.ClusterIPNone,
			Selector:  zkLabels,
			// PublishNotReadyAddresses：ZK 节点在 Ready 前需要相互解析 DNS 完成选主；
			// 默认行为只把 Ready 的 Pod 加入 headless service DNS，导致选主前 DNS 解析失败 → 无法选主 → 永远不 Ready（循环）。
			// 此字段让 Kubernetes 无论 Pod 是否 Ready 都发布 DNS 记录，打破循环。
			PublishNotReadyAddresses: true,
			Ports: []corev1.ServicePort{
				{Name: "client", Port: 2181, TargetPort: intstr.FromInt(2181)},
				{Name: "peer", Port: 2888, TargetPort: intstr.FromInt(2888)},
				{Name: "election", Port: 3888, TargetPort: intstr.FromInt(3888)},
			},
		},
	}
	if err := upsertService(ctx, k8s, zkSvc); err != nil {
		return fmt.Errorf("ZooKeeper headless Service: %w", err)
	}

	zkQ, _ := resource.ParseQuantity(zkSize)
	zkStateful := &appsv1.StatefulSet{
		ObjectMeta: metav1.ObjectMeta{Name: zkSTS, Namespace: ns, Labels: zkLabels},
		Spec: appsv1.StatefulSetSpec{
			ServiceName:         zkHL,
			Replicas:            int32Ptr(zr),
			// Parallel：ZK ensemble 需要多数节点（quorum）同时在线才能选出 Leader 并开放客户端端口 2181。
			// 若用 OrderedReady，ZK-0 因找不到 ZK-1/ZK-2 无法完成选主 → readiness probe (TCP 2181) 永远失败
			// → ZK-1/ZK-2 永不启动 → 死锁。Parallel 让所有 ZK Pod 同时启动，互相发现后完成选主再变 Ready。
			// Kafka StatefulSet 仍保持 OrderedReady（依赖 ZK quorum 后按序注册 broker）。
			PodManagementPolicy: appsv1.ParallelPodManagement,
			Selector:            &metav1.LabelSelector{MatchLabels: zkLabels},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: zkLabels},
				Spec: corev1.PodSpec{
					ImagePullSecrets: kafkaImagePullSecrets(opts.ImagePullSecret),
					InitContainers: []corev1.Container{{
						Name:    "init-myid",
						Image:   busybox,
						Command: []string{"sh", "-c", "ORD=$(echo \"$HOSTNAME\" | awk -F- '{print $NF}'); mkdir -p /data/datalog; echo $((ORD + 1)) > /data/myid"},
						VolumeMounts: []corev1.VolumeMount{{Name: "data", MountPath: "/data"}},
					}},
					Containers: []corev1.Container{{
						Name:            "zookeeper",
						Image:           strings.TrimSpace(opts.ZookeeperImage),
						ImagePullPolicy: corev1.PullIfNotPresent,
						Ports: []corev1.ContainerPort{
							{Name: "client", ContainerPort: 2181},
							{Name: "peer", ContainerPort: 2888},
							{Name: "election", ContainerPort: 3888},
						},
						Env: []corev1.EnvVar{
							{Name: "ZOO_SERVERS", Value: zooServers},
							// ZOO_CLIENT_PORT: official zookeeper:3.9.x uses this var (ZOO_PORT ignored since 3.7+).
							{Name: "ZOO_CLIENT_PORT", Value: "2181"},
							{Name: "ZOO_TICK_TIME", Value: "2000"},
							// 默认 initLimit/syncLimit 在 NFS/跨节点 DNS 慢时易导致选主超时；适当放大（tick=2s 时 20tick≈40s）。
							{Name: "ZOO_INIT_LIMIT", Value: "20"},
							{Name: "ZOO_SYNC_LIMIT", Value: "10"},
							// 与 Kafka 一致：每 Pod 一块 data PVC；官方镜像默认 dataLog 在 /datalog（未挂载则落容器层），改为卷内目录以持久化事务日志。
							{Name: "ZOO_DATA_DIR", Value: "/data"},
							{Name: "ZOO_DATA_LOG_DIR", Value: "/data/datalog"},
						},
						VolumeMounts: []corev1.VolumeMount{{Name: "data", MountPath: "/data"}},
						// 就绪探针：TCP 探测 2181，仅当 quorum 选主完成、ZK 真正对外服务时才变 Ready。
						// Kafka StatefulSet 的 wait-zookeeper init container 通过轮询此端口等待 ZK 就绪。
						ReadinessProbe: &corev1.Probe{
							ProbeHandler: corev1.ProbeHandler{
								TCPSocket: &corev1.TCPSocketAction{Port: intstr.FromInt(2181)},
							},
							InitialDelaySeconds: 10,
							PeriodSeconds:       5,
							FailureThreshold:    12,
							SuccessThreshold:    1,
							TimeoutSeconds:      3,
						},
						Resources: corev1.ResourceRequirements{
							Requests: corev1.ResourceList{
								corev1.ResourceMemory: resource.MustParse("512Mi"),
								corev1.ResourceCPU:    resource.MustParse("250m"),
							},
							Limits: corev1.ResourceList{corev1.ResourceMemory: resource.MustParse("1Gi")},
						},
					}},
				},
			},
			// 与 Kafka StatefulSet 相同：volumeClaimTemplates 由控制器按序为每个 Pod 创建 data-{sts}-{ordinal} PVC。
			VolumeClaimTemplates: []corev1.PersistentVolumeClaim{{
				ObjectMeta: metav1.ObjectMeta{Name: "data", Labels: zkLabels},
				Spec: corev1.PersistentVolumeClaimSpec{
					AccessModes: []corev1.PersistentVolumeAccessMode{corev1.ReadWriteOnce},
					Resources:   corev1.ResourceRequirements{Requests: corev1.ResourceList{corev1.ResourceStorage: zkQ}},
					VolumeMode:    volumeModePtrFilesystem(),
					StorageClassName: func() *string {
						if sc == "" {
							return nil
						}
						return &sc
					}(),
				},
			}},
		},
	}
	if err := upsertStatefulSet(ctx, k8s, zkStateful); err != nil {
		return fmt.Errorf("ZooKeeper StatefulSet: %w", err)
	}

	kafkaLabels := kafkaLabels(base, "kafka")
	kafkaHL := kafkaKafkaHLName(base)
	kafkaSTS := kafkaKafkaSTSName(base)
	zkConn := kafkaZkConnectCSV(ns, base, zr)
	saslUser := strings.TrimSpace(opts.SaslUsername)
	saslPass := opts.SaslPassword
	if saslUser == "" {
		saslUser = "admin"
	}
	saslMech := strings.ToUpper(strings.TrimSpace(opts.SaslMechanism))
	if saslMech == "" {
		saslMech = "SCRAM-SHA-512"
	}
	// enabledMechs：broker 间固定用 PLAIN（见下方注释），需将 PLAIN 加入启用列表。
	// PLAIN 仅用于 INTERNAL listener（9093，broker 间），9092 客户端监听同时支持 PLAIN 和 SCRAM；
	// 客户端仍应使用 SCRAM，PLAIN 只是在集群内部提供 broker 间认证能力，不额外开放外部风险。
	enabledMechs := saslMech
	if saslMech != "PLAIN" {
		enabledMechs = "PLAIN," + saslMech
	}

	kafkaSvc := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{Name: kafkaHL, Namespace: ns, Labels: kafkaLabels},
		Spec: corev1.ServiceSpec{
			ClusterIP: corev1.ClusterIPNone,
			Selector:  kafkaLabels,
			// PublishNotReadyAddresses：Kafka advertised.listeners 使用 pod FQDN，
			// broker 间互相解析时对方 Pod 可能尚未 Ready（readiness probe 未通过），
			// 不发布则 DNS 解析失败导致 broker 连接失败。
			PublishNotReadyAddresses: true,
			Ports: []corev1.ServicePort{
				{Name: "sasl", Port: 9092, TargetPort: intstr.FromInt(9092)},
				{Name: "internal", Port: 9093, TargetPort: intstr.FromInt(9093)},
			},
		},
	}
	if err := upsertService(ctx, k8s, kafkaSvc); err != nil {
		return fmt.Errorf("Kafka headless Service: %w", err)
	}

	kQ, _ := resource.ParseQuantity(kSize)
	suffix := fmt.Sprintf("%s.%s.svc.cluster.local", kafkaHL, ns)
	// Bitnami 启动脚本：未显式声明 ZK 协议时会 WARN；集群内官方 ZK 无 TLS/SASL 时只能 PLAINTEXT。
	// Broker 间原为 INTERNAL:PLAINTEXT 会触发「PLAINTEXT listener」WARN；改为 INTERNAL:SASL_PLAINTEXT + INTER_BROKER 凭据（与 Bitnami Chart 默认一致）。
	kafkaEnv := []corev1.EnvVar{
		{Name: "MY_POD_NAME", ValueFrom: &corev1.EnvVarSource{FieldRef: &corev1.ObjectFieldSelector{FieldPath: "metadata.name"}}},
		{Name: "POD_NAMESPACE", ValueFrom: &corev1.EnvVarSource{FieldRef: &corev1.ObjectFieldSelector{FieldPath: "metadata.namespace"}}},
		{Name: "KAFKA_DNS_SUFFIX", Value: suffix},
		{Name: "KAFKA_CFG_ZOOKEEPER_CONNECT", Value: zkConn},
		{Name: "KAFKA_ZOOKEEPER_PROTOCOL", Value: "PLAINTEXT"},
		{Name: "ALLOW_PLAINTEXT_LISTENER", Value: "yes"},
		{Name: "KAFKA_EXTERNAL_ADVERTISE_HOST", Value: ""},
		{Name: "KAFKA_EXTERNAL_NODE_PORTS", Value: ""},
		{Name: "KAFKA_CFG_INTER_BROKER_LISTENER_NAME", Value: "INTERNAL"},
		{Name: "KAFKA_CFG_SASL_ENABLED_MECHANISMS", Value: enabledMechs},
		// broker 间固定使用 PLAIN，而非 SCRAM：
		// bitnamilegacy/kafka 3.7 在启动脚本里通过 kafka-configs.sh 将 SCRAM 凭据写入 ZK，
		// Kafka 3.x 已移除 --zookeeper 选项，改用 --bootstrap-server，但 broker 此时尚未启动，
		// 导致鸡蛋问题（broker 未起 → 无法写凭据 → broker 间握手失败 → CrashLoopBackOff）。
		// PLAIN 不需要预先在 ZK 写凭据，broker 启动即可完成握手；
		// INTERNAL listener（9093）仅 broker 间使用，不对集群外暴露，安全风险可接受。
		{Name: "KAFKA_CFG_SASL_MECHANISM_INTER_BROKER_PROTOCOL", Value: "PLAIN"},
		{Name: "KAFKA_INTER_BROKER_USER", Value: saslUser},
		{Name: "KAFKA_INTER_BROKER_PASSWORD", Value: saslPass},
		{Name: "KAFKA_CLIENT_USERS", Value: saslUser},
		{Name: "KAFKA_CLIENT_PASSWORDS", Value: saslPass},
		{Name: "KAFKA_CFG_AUTO_CREATE_TOPICS_ENABLE", Value: "false"},
		{Name: "KAFKA_CFG_LOG_RETENTION_HOURS", Value: "168"},
		{Name: "KAFKA_CFG_NUM_NETWORK_THREADS", Value: "8"},
		{Name: "KAFKA_CFG_NUM_IO_THREADS", Value: "16"},
		{Name: "KAFKA_CFG_SOCKET_SEND_BUFFER_BYTES", Value: "102400"},
		{Name: "KAFKA_CFG_SOCKET_RECEIVE_BUFFER_BYTES", Value: "102400"},
		{Name: "KAFKA_CFG_SOCKET_REQUEST_MAX_BYTES", Value: "104857600"},
		{Name: "KAFKA_CFG_NUM_PARTITIONS", Value: "3"},
		{Name: "KAFKA_CFG_DEFAULT_REPLICATION_FACTOR", Value: fmt.Sprintf("%d", minInt32(kr, 3))},
		{Name: "KAFKA_CFG_OFFSETS_TOPIC_REPLICATION_FACTOR", Value: fmt.Sprintf("%d", minInt32(kr, 3))},
		{Name: "KAFKA_CFG_TRANSACTION_STATE_LOG_REPLICATION_FACTOR", Value: fmt.Sprintf("%d", minInt32(kr, 3))},
		{Name: "KAFKA_CFG_TRANSACTION_STATE_LOG_MIN_ISR", Value: fmt.Sprintf("%d", minInt32(kr, 2))},
		{Name: "KAFKA_CFG_MIN_INSYNC_REPLICAS", Value: fmt.Sprintf("%d", minInt32(kr, 2))},
		{Name: "KAFKA_CFG_AUTHORIZER_CLASS_NAME", Value: "kafka.security.authorizer.AclAuthorizer"},
		{Name: "KAFKA_CFG_ALLOW_EVERYONE_IF_NO_ACL_FOUND", Value: "true"},
		{Name: "KAFKA_CFG_SUPER_USERS", Value: "User:" + saslUser},
	}
	kafkaEnv = append(kafkaEnv, opts.ExtraKafkaEnv...)

	kafkaContainer := corev1.Container{
		Name:            "kafka",
		Image:           strings.TrimSpace(opts.KafkaImage),
		ImagePullPolicy: corev1.PullIfNotPresent,
		Ports: []corev1.ContainerPort{
			{Name: "sasl", ContainerPort: 9092},
			{Name: "internal", ContainerPort: 9093},
			{Name: "external-sasl", ContainerPort: kafkaExternalListenerPort},
		},
		Env: kafkaEnv,
		Command: []string{"/bin/bash", "-ec"},
		Args:    []string{KafkaContainerAdvertisedBootstrapScript()},
		VolumeMounts: []corev1.VolumeMount{{Name: "data", MountPath: "/bitnami/kafka"}},
		// 就绪探针：TCP 探测 9092，OrderedReady 确保 broker-0 真正监听后才启动 broker-1。
		// Bitnami 镜像启动慢（写 SCRAM 到 ZK + Kafka 自身初始化），initialDelaySeconds 需留足裕量。
		ReadinessProbe: &corev1.Probe{
			ProbeHandler: corev1.ProbeHandler{
				TCPSocket: &corev1.TCPSocketAction{Port: intstr.FromInt(9092)},
			},
			InitialDelaySeconds: 30,
			PeriodSeconds:       10,
			FailureThreshold:    12,
			SuccessThreshold:    1,
			TimeoutSeconds:      5,
		},
		Resources: corev1.ResourceRequirements{
			Requests: corev1.ResourceList{
				corev1.ResourceMemory: resource.MustParse("2Gi"),
				corev1.ResourceCPU:    resource.MustParse("500m"),
			},
			Limits: corev1.ResourceList{corev1.ResourceMemory: resource.MustParse("6Gi")},
		},
	}

	kafkaStateful := &appsv1.StatefulSet{
		ObjectMeta: metav1.ObjectMeta{Name: kafkaSTS, Namespace: ns, Labels: kafkaLabels},
		Spec: appsv1.StatefulSetSpec{
			ServiceName:         kafkaHL,
			Replicas:            int32Ptr(kr),
			// OrderedReady：与 Bitnami Chart 一致，先起 broker-0 再逐个加入，避免并行连 ZK/写 SCRAM 时互相干扰。
			PodManagementPolicy: appsv1.OrderedReadyPodManagement,
			Selector:            &metav1.LabelSelector{MatchLabels: kafkaLabels},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: kafkaLabels},
				Spec: corev1.PodSpec{
					ImagePullSecrets: kafkaImagePullSecrets(opts.ImagePullSecret),
					InitContainers: []corev1.Container{{
						Name:            "wait-zookeeper",
						Image:           busybox,
						ImagePullPolicy: corev1.PullIfNotPresent,
						Command:         []string{"sh", "-c", kafkaWaitZookeeperInitShell(ns, base, zr)},
					}},
					Containers: []corev1.Container{kafkaContainer},
				},
			},
			VolumeClaimTemplates: []corev1.PersistentVolumeClaim{{
				ObjectMeta: metav1.ObjectMeta{Name: "data", Labels: kafkaLabels},
				Spec: corev1.PersistentVolumeClaimSpec{
					AccessModes: []corev1.PersistentVolumeAccessMode{corev1.ReadWriteOnce},
					Resources:   corev1.ResourceRequirements{Requests: corev1.ResourceList{corev1.ResourceStorage: kQ}},
					VolumeMode:    volumeModePtrFilesystem(),
					StorageClassName: func() *string {
						if sc == "" {
							return nil
						}
						return &sc
					}(),
				},
			}},
		},
	}
	if err := upsertStatefulSet(ctx, k8s, kafkaStateful); err != nil {
		return fmt.Errorf("Kafka StatefulSet: %w", err)
	}
	return nil
}

func minInt32(a, b int32) int32 {
	if a < b {
		return a
	}
	return b
}

func volumeModePtrFilesystem() *corev1.PersistentVolumeMode {
	m := corev1.PersistentVolumeFilesystem
	return &m
}

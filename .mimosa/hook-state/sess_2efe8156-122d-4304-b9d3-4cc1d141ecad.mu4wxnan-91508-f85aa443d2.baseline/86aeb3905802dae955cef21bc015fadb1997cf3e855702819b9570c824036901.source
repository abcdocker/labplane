package internal

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/intstr"
	"k8s.io/client-go/kubernetes"
)

// kafkaExternalListenerPort 集群外 NodePort 映射到容器内 SASL 监听（与 9092 集群内客户端分离）。
const kafkaExternalListenerPort = 9094

// KafkaContainerAdvertisedBootstrapScript 在 exec Bitnami entrypoint 前根据 env 拼 listeners / advertised（支持 NodePort EXTERNAL）。
func KafkaContainerAdvertisedBootstrapScript() string {
	return `
set -e
# StatefulSet Pod 名为 {stsName}-{ordinal}，取最后一段为副本序号（与 ZK init-myid 一致）。
ORD="${MY_POD_NAME##*-}"
EXT_PORTS="${KAFKA_EXTERNAL_NODE_PORTS:-}"
EXT_HOST="${KAFKA_EXTERNAL_ADVERTISE_HOST:-}"
LISTENERS="INTERNAL://:9093,SASL_PLAINTEXT://:9092"
MAP="INTERNAL:SASL_PLAINTEXT,SASL_PLAINTEXT:SASL_PLAINTEXT"
ADV="INTERNAL://${MY_POD_NAME}.${KAFKA_DNS_SUFFIX}:9093,SASL_PLAINTEXT://${MY_POD_NAME}.${KAFKA_DNS_SUFFIX}:9092"
if [ -n "$EXT_PORTS" ] && [ -n "$EXT_HOST" ]; then
  IFS=',' read -r -a P_ARR <<< "$EXT_PORTS"
  MY_EXT="${P_ARR[$ORD]}"
  if [ -n "$MY_EXT" ]; then
    LISTENERS="${LISTENERS},EXTERNAL://:` + strconv.Itoa(kafkaExternalListenerPort) + `"
    MAP="${MAP},EXTERNAL:SASL_PLAINTEXT"
    ADV="${ADV},EXTERNAL://${EXT_HOST}:${MY_EXT}"
  fi
fi
export KAFKA_CFG_LISTENERS="$LISTENERS"
export KAFKA_CFG_LISTENER_SECURITY_PROTOCOL_MAP="$MAP"
export KAFKA_CFG_ADVERTISED_LISTENERS="$ADV"
exec /opt/bitnami/scripts/kafka/entrypoint.sh /opt/bitnami/scripts/kafka/run.sh
`
}

func kafkaNodePortServiceName(base string, index int) string {
	return fmt.Sprintf("%s-kafka-np-%d", strings.TrimSpace(base), index)
}

func kafkaNodePortServiceMetaLabels(base string) map[string]string {
	l := kafkaLabels(base, "kafka")
	l["kube-bt-sync.io/kafka-nodeport"] = "true"
	return l
}

func kafkaBrokerPodSelector(base string, ordinal int) map[string]string {
	sts := kafkaKafkaSTSName(base)
	podName := fmt.Sprintf("%s-%d", sts, ordinal)
	sel := kafkaLabels(base, "kafka")
	sel["statefulset.kubernetes.io/pod-name"] = podName
	return sel
}

// kafkaUpsertNodePortService 创建或更新每副本 NodePort Service。
// requestedNodePort=0：新建时不指定 NodePort 由集群分配；已存在则保留原 NodePort。
// requestedNodePort 在 30000–32767：显式指定（新建或与现有一致时更新）。
func kafkaUpsertNodePortService(ctx context.Context, k8s *kubernetes.Clientset, ns, base string, ordinal int, requestedNodePort int32) (assigned int32, err error) {
	if requestedNodePort != 0 && (requestedNodePort < 30000 || requestedNodePort > 32767) {
		return 0, fmt.Errorf("NodePort %d 须在 30000–32767 或为 0（自动）", requestedNodePort)
	}
	name := kafkaNodePortServiceName(base, ordinal)
	metaLabels := kafkaNodePortServiceMetaLabels(base)
	sp := corev1.ServicePort{
		Name:       "external-sasl",
		Port:       kafkaExternalListenerPort,
		TargetPort: intstr.FromInt(kafkaExternalListenerPort),
		Protocol:   corev1.ProtocolTCP,
	}
	if requestedNodePort >= 30000 && requestedNodePort <= 32767 {
		sp.NodePort = requestedNodePort
	}
	svc := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      name,
			Namespace: ns,
			Labels:    metaLabels,
		},
		Spec: corev1.ServiceSpec{
			Type:     corev1.ServiceTypeNodePort,
			Selector: kafkaBrokerPodSelector(base, ordinal),
			Ports:    []corev1.ServicePort{sp},
		},
	}
	cli := k8s.CoreV1().Services(ns)
	ex, err := cli.Get(ctx, name, metav1.GetOptions{})
	if err == nil {
		if requestedNodePort == 0 {
			if len(ex.Spec.Ports) > 0 {
				np := ex.Spec.Ports[0].NodePort
				if np >= 30000 {
					return np, nil
				}
			}
		}
		if requestedNodePort == 0 && len(ex.Spec.Ports) > 0 && ex.Spec.Ports[0].NodePort >= 30000 {
			sp.NodePort = ex.Spec.Ports[0].NodePort
		}
		svc.Spec.Ports[0] = sp
		svc.ResourceVersion = ex.ResourceVersion
		ret, uerr := cli.Update(ctx, svc, metav1.UpdateOptions{})
		if uerr != nil {
			return 0, uerr
		}
		if len(ret.Spec.Ports) == 0 {
			return 0, fmt.Errorf("Service %s 无端口", name)
		}
		return ret.Spec.Ports[0].NodePort, nil
	}
	if !apierrors.IsNotFound(err) {
		return 0, err
	}
	ret, cerr := cli.Create(ctx, svc, metav1.CreateOptions{})
	if cerr != nil {
		return 0, cerr
	}
	if len(ret.Spec.Ports) == 0 || ret.Spec.Ports[0].NodePort < 30000 {
		return 0, fmt.Errorf("创建 %s 后未得到有效的 NodePort", name)
	}
	return ret.Spec.Ports[0].NodePort, nil
}

func kafkaDeleteNodePortServicesRange(ctx context.Context, k8s *kubernetes.Clientset, ns, base string, from, to int) {
	if from < 0 {
		from = 0
	}
	cli := k8s.CoreV1().Services(ns)
	for i := from; i <= to; i++ {
		_ = cli.Delete(ctx, kafkaNodePortServiceName(base, i), metav1.DeleteOptions{})
	}
}

// kafkaInferNodePortAdvertiseHost 从集群推断客户端应连接的广播地址：优先 broker-0 所在节点的 ExternalIP/InternalIP，否则首个 Ready 节点。
func kafkaInferNodePortAdvertiseHost(ctx context.Context, k8s *kubernetes.Clientset, ns, base string) (string, error) {
	if k8s == nil {
		return "", fmt.Errorf("Kubernetes 客户端不可用")
	}
	podName := fmt.Sprintf("%s-0", kafkaKafkaSTSName(base))
	pod, err := k8s.CoreV1().Pods(ns).Get(ctx, podName, metav1.GetOptions{})
	if err == nil && pod.Spec.NodeName != "" {
		if ip := nodeAccessIPForNodeName(ctx, k8s, pod.Spec.NodeName); ip != "" {
			return ip, nil
		}
	}
	nodes, err := k8s.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return "", fmt.Errorf("列举节点以推断访问 IP: %w", err)
	}
	for i := range nodes.Items {
		n := &nodes.Items[i]
		ready := false
		for _, c := range n.Status.Conditions {
			if c.Type == corev1.NodeReady && c.Status == corev1.ConditionTrue {
				ready = true
				break
			}
		}
		if !ready {
			continue
		}
		if ip := nodePrimaryIP(n); ip != "" {
			return ip, nil
		}
	}
	if len(nodes.Items) > 0 {
		if ip := nodePrimaryIP(&nodes.Items[0]); ip != "" {
			return ip, nil
		}
	}
	return "", fmt.Errorf("无法从节点推断对外 IP（请为节点配置 ExternalIP，或在「高级」中手动填写广播地址）")
}

func kafkaMergeEnvVar(env []corev1.EnvVar, name, value string) []corev1.EnvVar {
	var out []corev1.EnvVar
	for _, e := range env {
		if e.Name == name {
			continue
		}
		out = append(out, e)
	}
	out = append(out, corev1.EnvVar{Name: name, Value: value})
	return out
}

// ApplyKafkaInstanceExposure 按实例配置创建/更新 NodePort Service 并 patch Kafka StatefulSet 环境变量；mode=internal 时删除对外 Service 并清空 env。
func ApplyKafkaInstanceExposure(ctx context.Context, k8s *kubernetes.Clientset, st *appKafkaInstanceStored) error {
	if k8s == nil || st == nil {
		return fmt.Errorf("参数无效")
	}
	ns := strings.TrimSpace(st.Namespace)
	base := strings.TrimSpace(st.BaseName)
	stsName := kafkaKafkaSTSName(base)
	mode := strings.ToLower(strings.TrimSpace(st.ExternalExposure))
	if mode == "" {
		mode = "internal"
	}
	rep := st.KafkaReplicas
	if rep <= 0 {
		rep = 3
	}

	cli := k8s.AppsV1().StatefulSets(ns)
	sts, err := cli.Get(ctx, stsName, metav1.GetOptions{})
	if err != nil {
		return fmt.Errorf("读取 StatefulSet %s: %w", stsName, err)
	}
	var kc *corev1.Container
	for i := range sts.Spec.Template.Spec.Containers {
		if sts.Spec.Template.Spec.Containers[i].Name == "kafka" {
			kc = &sts.Spec.Template.Spec.Containers[i]
			break
		}
	}
	if kc == nil {
		return fmt.Errorf("StatefulSet 中未找到 kafka 容器")
	}
	kc.Command = []string{"/bin/bash", "-ec"}
	kc.Args = []string{KafkaContainerAdvertisedBootstrapScript()}

	var host, portsCSV string
	if mode == "nodeport" {
		host = strings.TrimSpace(st.ExternalAdvertiseHost)
		if host == "" {
			inferred, err := kafkaInferNodePortAdvertiseHost(ctx, k8s, ns, base)
			if err != nil {
				return err
			}
			host = inferred
			st.ExternalAdvertiseHost = host
		}
		ports := st.ExternalNodePorts
		if len(ports) == rep {
			parts := make([]string, 0, rep)
			for _, p := range ports {
				if p < 30000 || p > 32767 {
					return fmt.Errorf("非法 NodePort %d（须 30000–32767）", p)
				}
				parts = append(parts, strconv.Itoa(p))
			}
			portsCSV = strings.Join(parts, ",")
			for i, p := range ports {
				if _, err := kafkaUpsertNodePortService(ctx, k8s, ns, base, i, int32(p)); err != nil {
					return fmt.Errorf("NodePort Service %s: %w", kafkaNodePortServiceName(base, i), err)
				}
			}
		} else if len(ports) == 0 {
			alloc := make([]int, 0, rep)
			for i := 0; i < rep; i++ {
				np, err := kafkaUpsertNodePortService(ctx, k8s, ns, base, i, 0)
				if err != nil {
					return fmt.Errorf("NodePort Service %s: %w", kafkaNodePortServiceName(base, i), err)
				}
				alloc = append(alloc, int(np))
			}
			st.ExternalNodePorts = alloc
			parts := make([]string, 0, rep)
			for _, p := range alloc {
				parts = append(parts, strconv.Itoa(p))
			}
			portsCSV = strings.Join(parts, ",")
		} else {
			return fmt.Errorf("NodePort 须提供 %d 个显式端口，或留空由集群自动分配（当前 %d 个）", rep, len(ports))
		}
		kafkaDeleteNodePortServicesRange(ctx, k8s, ns, base, rep, rep+8)
	} else {
		kafkaDeleteNodePortServicesRange(ctx, k8s, ns, base, 0, rep+8)
		portsCSV = ""
		host = ""
	}

	kc.Env = kafkaMergeEnvVar(kc.Env, "KAFKA_EXTERNAL_ADVERTISE_HOST", host)
	kc.Env = kafkaMergeEnvVar(kc.Env, "KAFKA_EXTERNAL_NODE_PORTS", portsCSV)

	hasExt := false
	for _, p := range kc.Ports {
		if p.ContainerPort == kafkaExternalListenerPort {
			hasExt = true
			break
		}
	}
	if !hasExt {
		kc.Ports = append(kc.Ports, corev1.ContainerPort{Name: "external-sasl", ContainerPort: kafkaExternalListenerPort})
	}

	_, err = cli.Update(ctx, sts, metav1.UpdateOptions{})
	if err != nil {
		return fmt.Errorf("更新 Kafka StatefulSet: %w", err)
	}
	return nil
}

// KafkaExternalBootstrapCSV 供集群外客户端 bootstrap.servers（SASL 与集群内相同，连 NodePort）。
func KafkaExternalBootstrapCSV(host string, ports []int) string {
	host = strings.TrimSpace(host)
	if host == "" || len(ports) == 0 {
		return ""
	}
	var b strings.Builder
	for i, p := range ports {
		if i > 0 {
			b.WriteByte(',')
		}
		_, _ = fmt.Fprintf(&b, "%s:%d", host, p)
	}
	return b.String()
}

// DescribeKafkaNodePortServices 返回已存在的 NodePort Service 信息（与副本序号对齐）。
func DescribeKafkaNodePortServices(ctx context.Context, k8s *kubernetes.Clientset, ns, base string, replicas int) []map[string]interface{} {
	if replicas <= 0 {
		replicas = 3
	}
	var out []map[string]interface{}
	cli := k8s.CoreV1().Services(ns)
	for i := 0; i < replicas; i++ {
		name := kafkaNodePortServiceName(base, i)
		svc, err := cli.Get(ctx, name, metav1.GetOptions{})
		row := map[string]interface{}{
			"ordinal": i,
			"name":    name,
			"found":   err == nil,
		}
		if err == nil && len(svc.Spec.Ports) > 0 {
			row["nodePort"] = svc.Spec.Ports[0].NodePort
			row["targetPort"] = kafkaExternalListenerPort
		}
		out = append(out, row)
	}
	return out
}

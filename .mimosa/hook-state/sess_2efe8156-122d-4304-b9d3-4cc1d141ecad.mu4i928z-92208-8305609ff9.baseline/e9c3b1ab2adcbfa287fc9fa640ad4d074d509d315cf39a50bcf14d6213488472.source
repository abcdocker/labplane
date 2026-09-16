package internal

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	appsv1 "k8s.io/api/apps/v1"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/intstr"
	"k8s.io/client-go/kubernetes"
)

// OpenSearchK8sDeployOpts 应用中心 OpenSearch：3 master + 3 data + 1 dashboards（副本数可覆盖）。
type OpenSearchK8sDeployOpts struct {
	Namespace       string
	BaseName        string
	ClusterName     string
	OpenSearchImage string
	DashboardsImage string
	ImagePullSecret string
	ServiceType     string
	NodePortHTTP    int32
	NodePortDash    int32
	JavaOptsMaster  string
	JavaOptsData    string
	ExtraYml        string
	IndexTemplateJSON string
	MasterStorageSize string
	DataStorageSize   string
	StorageClassName  string
	MasterReplicas    int32
	DataReplicas      int32
	TemplateID        int64
	TemplateName      string
}

func openSearchHeadlessSvcName(base string) string {
	return strings.TrimSpace(base) + "-master-hl"
}

func openSearchDataSvcName(base string) string {
	return strings.TrimSpace(base) + "-data"
}

func openSearchDashSvcName(base string) string {
	return strings.TrimSpace(base) + "-dash"
}

func openSearchMasterSTSName(base string) string {
	return strings.TrimSpace(base) + "-master"
}

func openSearchDataSTSName(base string) string {
	return strings.TrimSpace(base) + "-data"
}

func openSearchDashDeployName(base string) string {
	return strings.TrimSpace(base) + "-dash"
}

func openSearchK8sServiceType(s string) corev1.ServiceType {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "nodeport":
		return corev1.ServiceTypeNodePort
	default:
		return corev1.ServiceTypeClusterIP
	}
}

func upsertConfigMap(ctx context.Context, k8s *kubernetes.Clientset, cm *corev1.ConfigMap) error {
	ns := cm.Namespace
	cli := k8s.CoreV1().ConfigMaps(ns)
	ex, err := cli.Get(ctx, cm.Name, metav1.GetOptions{})
	if err == nil {
		cm.ResourceVersion = ex.ResourceVersion
		_, err = cli.Update(ctx, cm, metav1.UpdateOptions{})
		return err
	}
	if apierrors.IsNotFound(err) {
		_, err = cli.Create(ctx, cm, metav1.CreateOptions{})
		return err
	}
	return err
}

func buildOpenSearchMasterYml(opts OpenSearchK8sDeployOpts, seedHost string, initialNodesCSV string) string {
	cn := strings.TrimSpace(opts.ClusterName)
	if cn == "" {
		cn = strings.TrimSpace(opts.BaseName)
	}
	seedHost = strings.TrimSpace(seedHost)
	b := strings.Builder{}
	fmt.Fprintf(&b, `cluster.name: %q
network.host: 0.0.0.0
http.port: 9200
transport.port: 9300
discovery.seed_hosts: [%q]
cluster.initial_cluster_manager_nodes: [%s]
node.roles: [cluster_manager]
plugins.security.disabled: true
`, cn, seedHost, initialNodesCSV)
	if ex := strings.TrimSpace(opts.ExtraYml); ex != "" {
		b.WriteString("\n")
		b.WriteString(ex)
		b.WriteString("\n")
	}
	return b.String()
}

func buildOpenSearchDataYml(opts OpenSearchK8sDeployOpts, seedHost string) string {
	cn := strings.TrimSpace(opts.ClusterName)
	if cn == "" {
		cn = strings.TrimSpace(opts.BaseName)
	}
	seedHost = strings.TrimSpace(seedHost)
	b := strings.Builder{}
	fmt.Fprintf(&b, `cluster.name: %q
network.host: 0.0.0.0
http.port: 9200
transport.port: 9300
discovery.seed_hosts: [%q]
node.roles: [data]
plugins.security.disabled: true
`, cn, seedHost)
	if ex := strings.TrimSpace(opts.ExtraYml); ex != "" {
		b.WriteString("\n")
		b.WriteString(ex)
		b.WriteString("\n")
	}
	return b.String()
}

func openSearchLabels(base, component string) map[string]string {
	return map[string]string{
		"app.kubernetes.io/name":       strings.TrimSpace(base),
		"app.kubernetes.io/component":  component,
		"app.kubernetes.io/managed-by": "kube-bt-sync",
		"kube-bt-sync.io/opensearch":   "true",
	}
}

func openSearchImagePullSecrets(name string) []corev1.LocalObjectReference {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil
	}
	return []corev1.LocalObjectReference{{Name: name}}
}

func openSearchMasterInitialNodesCSV(base string, replicas int32) string {
	sts := openSearchMasterSTSName(base)
	var parts []string
	for i := int32(0); i < replicas; i++ {
		parts = append(parts, fmt.Sprintf("%q", fmt.Sprintf("%s-%d", sts, i)))
	}
	return strings.Join(parts, ", ")
}

func EnsureOpenSearchK8sNoNameConflict(ctx context.Context, k8s *kubernetes.Clientset, opts OpenSearchK8sDeployOpts) error {
	ns := strings.TrimSpace(opts.Namespace)
	base := strings.TrimSpace(opts.BaseName)
	if ns == "" || base == "" {
		return nil
	}
	checks := []struct {
		kind string
		name string
	}{
		{"StatefulSet", openSearchMasterSTSName(base)},
		{"StatefulSet", openSearchDataSTSName(base)},
		{"Deployment", openSearchDashDeployName(base)},
		{"Service", openSearchHeadlessSvcName(base)},
		{"Service", openSearchDataSvcName(base)},
		{"Service", openSearchDashSvcName(base)},
	}
	for _, ck := range checks {
		switch ck.kind {
		case "StatefulSet":
			if _, err := k8s.AppsV1().StatefulSets(ns).Get(ctx, ck.name, metav1.GetOptions{}); err == nil {
				return fmt.Errorf("命名空间 %s 已存在 %s %s，请更换名称或先删除已有资源", ns, ck.kind, ck.name)
			} else if !apierrors.IsNotFound(err) {
				return fmt.Errorf("检查 %s: %w", ck.kind, err)
			}
		case "Deployment":
			if _, err := k8s.AppsV1().Deployments(ns).Get(ctx, ck.name, metav1.GetOptions{}); err == nil {
				return fmt.Errorf("命名空间 %s 已存在 %s %s，请更换名称或先删除已有资源", ns, ck.kind, ck.name)
			} else if !apierrors.IsNotFound(err) {
				return fmt.Errorf("检查 %s: %w", ck.kind, err)
			}
		case "Service":
			if _, err := k8s.CoreV1().Services(ns).Get(ctx, ck.name, metav1.GetOptions{}); err == nil {
				return fmt.Errorf("命名空间 %s 已存在 %s %s，请更换名称或先删除已有资源", ns, ck.kind, ck.name)
			} else if !apierrors.IsNotFound(err) {
				return fmt.Errorf("检查 Service: %w", err)
			}
		}
	}
	return nil
}

// ApplyOpenSearchK8sDeploy 创建 3+3+1 OpenSearch 栈（首次部署；更新请用 kubectl 或后续扩展）。
func ApplyOpenSearchK8sDeploy(ctx context.Context, k8s *kubernetes.Clientset, opts OpenSearchK8sDeployOpts) error {
	if err := ValidateK8sNamespaceName(opts.Namespace); err != nil {
		return err
	}
	if err := ValidateK8sDeploymentName(opts.BaseName); err != nil {
		return err
	}
	mr := opts.MasterReplicas
	dr := opts.DataReplicas
	if mr <= 0 {
		mr = 3
	}
	if dr <= 0 {
		dr = 3
	}
	ns := strings.TrimSpace(opts.Namespace)
	base := strings.TrimSpace(opts.BaseName)
	hlName := openSearchHeadlessSvcName(base)
	seedDNS := hlName // short name, same namespace
	initialCSV := openSearchMasterInitialNodesCSV(base, mr)

	masterYml := buildOpenSearchMasterYml(opts, seedDNS, initialCSV)
	dataYml := buildOpenSearchDataYml(opts, seedDNS)

	cmMaster := &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{
			Name:      base + "-os-master-yml",
			Namespace: ns,
			Labels:    openSearchLabels(base, "master-config"),
		},
		Data: map[string]string{"opensearch.yml": masterYml},
	}
	cmData := &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{
			Name:      base + "-os-data-yml",
			Namespace: ns,
			Labels:    openSearchLabels(base, "data-config"),
		},
		Data: map[string]string{"opensearch.yml": dataYml},
	}
	if err := upsertConfigMap(ctx, k8s, cmMaster); err != nil {
		return fmt.Errorf("ConfigMap master: %w", err)
	}
	if err := upsertConfigMap(ctx, k8s, cmData); err != nil {
		return fmt.Errorf("ConfigMap data: %w", err)
	}

	masterLabels := openSearchLabels(base, "opensearch-master")
	svcHL := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      hlName,
			Namespace: ns,
			Labels:    masterLabels,
		},
		Spec: corev1.ServiceSpec{
			ClusterIP: corev1.ClusterIPNone,
			Selector:  masterLabels,
			Ports: []corev1.ServicePort{
				{Name: "transport", Port: 9300, TargetPort: intstr.FromInt(9300)},
			},
		},
	}
	if err := upsertService(ctx, k8s, svcHL); err != nil {
		return fmt.Errorf("Service headless: %w", err)
	}

	mSize := firstNonEmpty(opts.MasterStorageSize, "20Gi")
	dSize := firstNonEmpty(opts.DataStorageSize, "100Gi")
	sc := strings.TrimSpace(opts.StorageClassName)

	javaM := strings.TrimSpace(opts.JavaOptsMaster)
	if javaM == "" {
		javaM = "-Xms512m -Xmx512m"
	}
	javaD := strings.TrimSpace(opts.JavaOptsData)
	if javaD == "" {
		javaD = "-Xms1g -Xmx1g"
	}

	masterSTS := buildOpenSearchMasterStatefulSet(ns, base, opts.OpenSearchImage, mr, mSize, sc, javaM, cmMaster.Name, masterLabels, openSearchImagePullSecrets(opts.ImagePullSecret))
	if err := upsertStatefulSet(ctx, k8s, masterSTS); err != nil {
		return fmt.Errorf("StatefulSet master: %w", err)
	}

	dataLabels := openSearchLabels(base, "opensearch-data")
	st := openSearchK8sServiceType(opts.ServiceType)
	var npHTTP int32
	if st == corev1.ServiceTypeNodePort || st == corev1.ServiceTypeLoadBalancer {
		npHTTP = opts.NodePortHTTP
	}
	dataSvc := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      openSearchDataSvcName(base),
			Namespace: ns,
			Labels:    dataLabels,
		},
		Spec: corev1.ServiceSpec{
			Type:     st,
			Selector: dataLabels,
			Ports: []corev1.ServicePort{
				{Name: "http", Port: 9200, TargetPort: intstr.FromInt(9200), Protocol: corev1.ProtocolTCP, NodePort: npHTTP},
			},
		},
	}
	if err := upsertService(ctx, k8s, dataSvc); err != nil {
		return fmt.Errorf("Service data: %w", err)
	}

	dataSTS := buildOpenSearchDataStatefulSet(ns, base, opts.OpenSearchImage, dr, dSize, sc, javaD, cmData.Name, dataLabels, openSearchImagePullSecrets(opts.ImagePullSecret))
	if err := upsertStatefulSet(ctx, k8s, dataSTS); err != nil {
		return fmt.Errorf("StatefulSet data: %w", err)
	}

	dashLabels := openSearchLabels(base, "opensearch-dashboards")
	var npDash int32
	if st == corev1.ServiceTypeNodePort || st == corev1.ServiceTypeLoadBalancer {
		npDash = opts.NodePortDash
	}
	dashSvc := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      openSearchDashSvcName(base),
			Namespace: ns,
			Labels:    dashLabels,
		},
		Spec: corev1.ServiceSpec{
			Type:     st,
			Selector: dashLabels,
			Ports: []corev1.ServicePort{
				{Name: "http", Port: 5601, TargetPort: intstr.FromInt(5601), Protocol: corev1.ProtocolTCP, NodePort: npDash},
			},
		},
	}
	if err := upsertService(ctx, k8s, dashSvc); err != nil {
		return fmt.Errorf("Service dashboards: %w", err)
	}

	dataInternalURL := fmt.Sprintf("http://%s.%s.svc.cluster.local:9200", openSearchDataSvcName(base), ns)
	dashDep := buildOpenSearchDashboardsDeployment(ns, base, opts.DashboardsImage, dataInternalURL, dashLabels, openSearchImagePullSecrets(opts.ImagePullSecret))
	if err := upsertDeployment(ctx, k8s, dashDep); err != nil {
		return fmt.Errorf("Deployment dashboards: %w", err)
	}

	if tpl := strings.TrimSpace(opts.IndexTemplateJSON); tpl != "" {
		if err := json.Unmarshal([]byte(tpl), new(map[string]interface{})); err != nil {
			return fmt.Errorf("indexTemplateJSON: %w", err)
		}
		cmIdx := &corev1.ConfigMap{
			ObjectMeta: metav1.ObjectMeta{
				Name:      base + "-os-index-tpl",
				Namespace: ns,
				Labels:    openSearchLabels(base, "index-template"),
			},
			BinaryData: nil,
			Data:       map[string]string{"body.json": tpl},
		}
		if err := upsertConfigMap(ctx, k8s, cmIdx); err != nil {
			return fmt.Errorf("ConfigMap index template: %w", err)
		}
		jobName := base + "-os-index-job"
		_ = k8s.BatchV1().Jobs(ns).Delete(ctx, jobName, metav1.DeleteOptions{})
		job := buildOpenSearchIndexTemplateJob(ns, base, jobName, openSearchDataSvcName(base), cmIdx.Name)
		if _, err := k8s.BatchV1().Jobs(ns).Create(ctx, job, metav1.CreateOptions{}); err != nil {
			if !apierrors.IsAlreadyExists(err) {
				return fmt.Errorf("Job index template: %w", err)
			}
		}
	}

	return nil
}

func buildOpenSearchIndexTemplateJob(ns, base, jobName, dataSvc, cmName string) *batchv1.Job {
	ttl := int32(86400)
	backoff := int32(12)
	adl := int64(7200)
	return &batchv1.Job{
		ObjectMeta: metav1.ObjectMeta{
			Name:      jobName,
			Namespace: ns,
			Labels:    openSearchLabels(base, "index-template-job"),
		},
		Spec: batchv1.JobSpec{
			TTLSecondsAfterFinished: &ttl,
			BackoffLimit:            &backoff,
			ActiveDeadlineSeconds:   &adl,
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels: openSearchLabels(base, "index-template-job"),
				},
				Spec: corev1.PodSpec{
					RestartPolicy: corev1.RestartPolicyOnFailure,
					Containers: []corev1.Container{{
						Name:    "curl",
						Image:   "curlimages/curl:8.5.0",
						Command: []string{"/bin/sh", "-ec"},
						Args: []string{fmt.Sprintf(`
URL="http://%s.%s.svc.cluster.local:9200"
for i in $(seq 1 120); do
  if curl -sf "$URL/_cluster/health?wait_for_status=yellow&timeout=5s" >/dev/null 2>&1; then
    break
  fi
  sleep 5
done
curl -sS -X PUT "$URL/_index_template/kubebt-%s" -H 'Content-Type: application/json' --data-binary @/tpl/body.json
echo OK
`, dataSvc, ns, strings.TrimSpace(base))},
						VolumeMounts: []corev1.VolumeMount{{Name: "tpl", MountPath: "/tpl", ReadOnly: true}},
					}},
					Volumes: []corev1.Volume{{
						Name: "tpl",
						VolumeSource: corev1.VolumeSource{
							ConfigMap: &corev1.ConfigMapVolumeSource{LocalObjectReference: corev1.LocalObjectReference{Name: cmName}},
						},
					}},
				},
			},
		},
	}
}

func buildOpenSearchMasterStatefulSet(ns, base, image string, replicas int32, storageSize, storageClass, javaOpts, cmName string, labels map[string]string, pullSecrets []corev1.LocalObjectReference) *appsv1.StatefulSet {
	stsName := openSearchMasterSTSName(base)
	q, _ := resource.ParseQuantity(storageSize)
	return &appsv1.StatefulSet{
		ObjectMeta: metav1.ObjectMeta{Name: stsName, Namespace: ns, Labels: labels},
		Spec: appsv1.StatefulSetSpec{
			ServiceName:         openSearchHeadlessSvcName(base),
			Replicas:            int32Ptr(replicas),
			PodManagementPolicy: appsv1.ParallelPodManagement,
			Selector:            &metav1.LabelSelector{MatchLabels: labels},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: labels},
				Spec: corev1.PodSpec{
					ImagePullSecrets: pullSecrets,
					Containers: []corev1.Container{{
						Name:  "opensearch",
						Image: strings.TrimSpace(image),
						Ports: []corev1.ContainerPort{
							{Name: "http", ContainerPort: 9200},
							{Name: "transport", ContainerPort: 9300},
						},
						Env: []corev1.EnvVar{
							{Name: "OPENSEARCH_JAVA_OPTS", Value: javaOpts},
						},
						VolumeMounts: []corev1.VolumeMount{
							{Name: "data", MountPath: "/usr/share/opensearch/data"},
							{Name: "cfg", MountPath: "/usr/share/opensearch/config/opensearch.yml", SubPath: "opensearch.yml"},
						},
						ReadinessProbe: &corev1.Probe{
							ProbeHandler:        corev1.ProbeHandler{HTTPGet: &corev1.HTTPGetAction{Path: "/", Port: intstr.FromInt(9200), Scheme: corev1.URISchemeHTTP}},
							InitialDelaySeconds: 90,
							PeriodSeconds:       15,
							TimeoutSeconds:      5,
							FailureThreshold:    20,
						},
						Resources: corev1.ResourceRequirements{
							Requests: corev1.ResourceList{
								corev1.ResourceMemory: resource.MustParse("1Gi"),
								corev1.ResourceCPU:    resource.MustParse("250m"),
							},
							Limits: corev1.ResourceList{corev1.ResourceMemory: resource.MustParse("2Gi")},
						},
					}},
					Volumes: []corev1.Volume{{
						Name: "cfg",
						VolumeSource: corev1.VolumeSource{
							ConfigMap: &corev1.ConfigMapVolumeSource{LocalObjectReference: corev1.LocalObjectReference{Name: cmName}},
						},
					}},
				},
			},
			VolumeClaimTemplates: []corev1.PersistentVolumeClaim{{
				ObjectMeta: metav1.ObjectMeta{Name: "data", Labels: labels},
				Spec: corev1.PersistentVolumeClaimSpec{
					AccessModes: []corev1.PersistentVolumeAccessMode{corev1.ReadWriteOnce},
					Resources: corev1.ResourceRequirements{Requests: corev1.ResourceList{corev1.ResourceStorage: q}},
					StorageClassName: func() *string {
						s := strings.TrimSpace(storageClass)
						if s == "" {
							return nil
						}
						return &s
					}(),
				},
			}},
		},
	}
}

func buildOpenSearchDataStatefulSet(ns, base, image string, replicas int32, storageSize, storageClass, javaOpts, cmName string, labels map[string]string, pullSecrets []corev1.LocalObjectReference) *appsv1.StatefulSet {
	stsName := openSearchDataSTSName(base)
	q, _ := resource.ParseQuantity(storageSize)
	return &appsv1.StatefulSet{
		ObjectMeta: metav1.ObjectMeta{Name: stsName, Namespace: ns, Labels: labels},
		Spec: appsv1.StatefulSetSpec{
			Replicas:            int32Ptr(replicas),
			PodManagementPolicy: appsv1.ParallelPodManagement,
			Selector:            &metav1.LabelSelector{MatchLabels: labels},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: labels},
				Spec: corev1.PodSpec{
					ImagePullSecrets: pullSecrets,
					Containers: []corev1.Container{{
						Name:  "opensearch",
						Image: strings.TrimSpace(image),
						Ports: []corev1.ContainerPort{
							{Name: "http", ContainerPort: 9200},
							{Name: "transport", ContainerPort: 9300},
						},
						Env: []corev1.EnvVar{
							{Name: "OPENSEARCH_JAVA_OPTS", Value: javaOpts},
						},
						VolumeMounts: []corev1.VolumeMount{
							{Name: "data", MountPath: "/usr/share/opensearch/data"},
							{Name: "cfg", MountPath: "/usr/share/opensearch/config/opensearch.yml", SubPath: "opensearch.yml"},
						},
						ReadinessProbe: &corev1.Probe{
							ProbeHandler:        corev1.ProbeHandler{HTTPGet: &corev1.HTTPGetAction{Path: "/", Port: intstr.FromInt(9200), Scheme: corev1.URISchemeHTTP}},
							InitialDelaySeconds: 90,
							PeriodSeconds:       15,
							TimeoutSeconds:      5,
							FailureThreshold:    24,
						},
						Resources: corev1.ResourceRequirements{
							Requests: corev1.ResourceList{
								corev1.ResourceMemory: resource.MustParse("2Gi"),
								corev1.ResourceCPU:    resource.MustParse("500m"),
							},
							Limits: corev1.ResourceList{corev1.ResourceMemory: resource.MustParse("4Gi")},
						},
					}},
					Volumes: []corev1.Volume{{
						Name: "cfg",
						VolumeSource: corev1.VolumeSource{
							ConfigMap: &corev1.ConfigMapVolumeSource{LocalObjectReference: corev1.LocalObjectReference{Name: cmName}},
						},
					}},
				},
			},
			VolumeClaimTemplates: []corev1.PersistentVolumeClaim{{
				ObjectMeta: metav1.ObjectMeta{Name: "data", Labels: labels},
				Spec: corev1.PersistentVolumeClaimSpec{
					AccessModes: []corev1.PersistentVolumeAccessMode{corev1.ReadWriteOnce},
					Resources: corev1.ResourceRequirements{Requests: corev1.ResourceList{corev1.ResourceStorage: q}},
					StorageClassName: func() *string {
						s := strings.TrimSpace(storageClass)
						if s == "" {
							return nil
						}
						return &s
					}(),
				},
			}},
		},
	}
}

func buildOpenSearchDashboardsDeployment(ns, base, image, osHosts string, labels map[string]string, pullSecrets []corev1.LocalObjectReference) *appsv1.Deployment {
	rep := int32(1)
	hostsJSON := fmt.Sprintf(`["%s"]`, strings.TrimSpace(osHosts))
	return &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{Name: openSearchDashDeployName(base), Namespace: ns, Labels: labels},
		Spec: appsv1.DeploymentSpec{
			Replicas: &rep,
			Selector: &metav1.LabelSelector{MatchLabels: labels},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: labels},
				Spec: corev1.PodSpec{
					ImagePullSecrets: pullSecrets,
					Containers: []corev1.Container{{
						Name:  "dashboards",
						Image: strings.TrimSpace(image),
						Ports: []corev1.ContainerPort{{Name: "http", ContainerPort: 5601}},
						Env: []corev1.EnvVar{
							{Name: "OPENSEARCH_HOSTS", Value: hostsJSON},
							{Name: "DISABLE_SECURITY_DASHBOARDS_PLUGIN", Value: "true"},
						},
						ReadinessProbe: &corev1.Probe{
							ProbeHandler:        corev1.ProbeHandler{HTTPGet: &corev1.HTTPGetAction{Path: "/api/status", Port: intstr.FromInt(5601), Scheme: corev1.URISchemeHTTP}},
							InitialDelaySeconds: 60,
							PeriodSeconds:       10,
						},
						Resources: corev1.ResourceRequirements{
							Requests: corev1.ResourceList{
								corev1.ResourceMemory: resource.MustParse("512Mi"),
								corev1.ResourceCPU:    resource.MustParse("100m"),
							},
							Limits: corev1.ResourceList{corev1.ResourceMemory: resource.MustParse("1Gi")},
						},
					}},
				},
			},
		},
	}
}

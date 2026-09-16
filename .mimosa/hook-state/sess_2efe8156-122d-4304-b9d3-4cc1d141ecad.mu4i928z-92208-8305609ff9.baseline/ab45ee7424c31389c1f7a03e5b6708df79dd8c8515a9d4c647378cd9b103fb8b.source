package internal

import (
	"context"
	crand "crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/apimachinery/pkg/util/intstr"
	"k8s.io/client-go/kubernetes"
)

const (
	kvKeyCloudVMBootstrap = "appcenter_cloud_vm_bootstrap_v1"
	cloudVMSSHPort        = int32(22)
)

// CloudVMImageOption 引导配置中的 Ubuntu/自定义镜像条目。
type CloudVMImageOption struct {
	ID     string `json:"id"`
	Label  string `json:"label"`
	Image  string `json:"image"`
	/** 可选：镜像 Dockerfile 中已安装 openssh-server 等，启动脚本检测到 sshd 后会跳过 apt，首次就绪更快（仅说明，不改变脚本逻辑） */
	BakedInSSH bool `json:"bakedInSSH,omitempty"`
	/** 可选：覆盖默认启动逻辑（多数镜像用内置脚本安装 sshd） */
	Command []string `json:"command,omitempty"`
	Args    []string `json:"args,omitempty"`
}

// CloudVMBootstrap 应用中心云主机全局引导（首次在页面配置，之后可仅在后台改 platform_kv）。
type CloudVMBootstrap struct {
	BootstrapComplete bool               `json:"bootstrapComplete"`
	Images            []CloudVMImageOption `json:"images"`
	DefaultNamespace  string             `json:"defaultNamespace"`
	// DefaultAccessNodeName 可选：指定 Kubernetes Node 名称；列表/访问地址展示与该节点主 IP 一致（NodePort SSH）。空则沿用集群内第一个可用节点 IP。
	DefaultAccessNodeName string `json:"defaultAccessNodeName,omitempty"`
	// Hysteria2LinuxAmd64URL / Hysteria2LinuxArm64URL：勾选 Hysteria2 时 Pod init 按架构从此 URL 拉取裸二进制（留空则用官方 app/v2.6.5 默认地址，并自动追加 ghproxy 等镜像）。
	Hysteria2LinuxAmd64URL string `json:"hysteria2LinuxAmd64Url,omitempty"`
	Hysteria2LinuxArm64URL string `json:"hysteria2LinuxArm64Url,omitempty"`
}

func defaultCloudVMBootstrap() *CloudVMBootstrap {
	return &CloudVMBootstrap{
		BootstrapComplete: false,
		DefaultNamespace:  "kube-bt-cloud-vm",
		Images: []CloudVMImageOption{
			{ID: "ubuntu-2204", Label: "Ubuntu 22.04", Image: "docker.io/library/ubuntu:22.04"},
			{ID: "ubuntu-2404", Label: "Ubuntu 24.04", Image: "docker.io/library/ubuntu:24.04"},
		},
	}
}

func loadCloudVMBootstrap(kv PlatformKV) *CloudVMBootstrap {
	if kv == nil {
		return defaultCloudVMBootstrap()
	}
	raw, ok := kv.Get(kvKeyCloudVMBootstrap)
	if !ok || strings.TrimSpace(raw) == "" {
		return defaultCloudVMBootstrap()
	}
	var b CloudVMBootstrap
	if err := json.Unmarshal([]byte(raw), &b); err != nil {
		return defaultCloudVMBootstrap()
	}
	if b.DefaultNamespace == "" {
		b.DefaultNamespace = "kube-bt-cloud-vm"
	}
	if len(b.Images) == 0 {
		b.Images = defaultCloudVMBootstrap().Images
	}
	return &b
}

func saveCloudVMBootstrap(kv PlatformKV, b *CloudVMBootstrap) error {
	if kv == nil || b == nil {
		return errors.New("bootstrap 保存失败：KV 不可用")
	}
	raw, err := json.Marshal(b)
	if err != nil {
		return err
	}
	return kv.Set(kvKeyCloudVMBootstrap, string(raw))
}

// CloudVMStored 实例持久化字段（config_json）。
type CloudVMStored struct {
	DisplayName   string            `json:"displayName"`
	ImageID       string            `json:"imageId"`
	Image         string            `json:"image"`
	CPURequest    string            `json:"cpuRequest"`
	CPULimit      string            `json:"cpuLimit"`
	MemRequest    string            `json:"memRequest"`
	MemLimit      string            `json:"memLimit"`
	PVCSize       string            `json:"pvcSize"`
	StorageClass  string            `json:"storageClassName"`
	NodePort      int32             `json:"nodePort"`
	Env           []cloudVMEnvVar   `json:"env,omitempty"`
	Command       []string          `json:"command,omitempty"`
	Args          []string          `json:"args,omitempty"`
	RootPasswordEnc string          `json:"rootPasswordEnc"`
	DeploymentName string           `json:"deploymentName"`
	ServiceName    string           `json:"serviceName"`
	PVCName        string           `json:"pvcName"`
	SecretName     string           `json:"secretName"`
	NodeAccessIP   string           `json:"nodeAccessIP"`
	SSHPort        int32            `json:"sshPort"`
	Phase          string           `json:"phase"`
	/** InitScript 用户自定义 bash（不含预选软件块）；与 Software 合并后写入 Secret */
	InitScript string `json:"initScript,omitempty"`
	/** Software 创建向导勾选的自动化安装（国内源、数据在 /data） */
	Software CloudVMSoftwareOpts `json:"software,omitempty"`
}

type cloudVMRow struct {
	ID         int64
	Name       string
	Namespace  string
	ConfigJSON string
	CreatedBy  string
	CreatedAt  time.Time
}

func cloudVMParseCPUToCores(s string) float64 {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0
	}
	q, err := resource.ParseQuantity(s)
	if err != nil {
		return 0
	}
	return float64(q.MilliValue()) / 1000.0
}

func cloudVMParseMemToBytes(s string) float64 {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0
	}
	q, err := resource.ParseQuantity(s)
	if err != nil {
		return 0
	}
	return float64(q.Value())
}

func appCloudVMWriteDenied(c *gin.Context) bool {
	if getDashboardRoleFromGin(c) == DashboardRoleAdmin {
		return false
	}
	eff := getEffectiveDashboardPermissionsFromGin(c)
	if eff.LegacyViewer {
		return true
	}
	if eff.AppCenter == ModuleAccessNone || eff.AppCenter == ModuleAccessRO {
		return true
	}
	cs := eff.AppCenterCloudVm
	if cs == "" {
		cs = eff.AppCenterRedis
	}
	if cs == AppCenterRedisScopeReadonly {
		return true
	}
	if cs == AppCenterRedisScopeManagedOnly {
		return true
	}
	return false
}

func appCloudVMRequireWrite(c *gin.Context) bool {
	if appCloudVMWriteDenied(c) {
		RespondAPIPermissionDenied(c)
		return false
	}
	return true
}

func sanitizeCloudVMK8sName(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = regexp.MustCompile(`[^a-z0-9-]+`).ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	if len(s) > 40 {
		s = s[:40]
	}
	if s == "" {
		s = "vm"
	}
	return s
}

func initScriptHash(s string) string {
	sum := sha256.Sum256([]byte(s))
	return fmt.Sprintf("%x", sum[:8])
}

func cloudVMStartupScript(sw CloudVMSoftwareOpts) string {
	// 仅 /data 持久化；最小 Ubuntu 镜像补常用 CLI；用户初始化脚本在 chpasswd 之后、sshd 之前执行。
	// 若自定义镜像已在 Dockerfile 中 apt install openssh-server（使 /usr/sbin/sshd 存在），则下方 if 不执行，可大幅缩短首次就绪时间。
	head := `set -e
export DEBIAN_FRONTEND=noninteractive
mkdir -p /data
mkdir -p /data/.kubebt/apt-archive /data/.kubebt/apt-lists/partial
cat > /etc/apt/apt.conf.d/99-kubebt-persist <<'APTEOF'
Dir::Cache::archives "/data/.kubebt/apt-archive";
Dir::State::lists "/data/.kubebt/apt-lists";
APTEOF
if ! command -v sshd >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq openssh-server ca-certificates curl wget vim-tiny iproute2 iputils-ping dnsutils netcat-openbsd procps sudo jq
fi
mkdir -p /var/run/sshd
mkdir -p /etc/profile.d
echo "export POD_NAME=\"${POD_NAME:-$(hostname)}\"" > /etc/profile.d/50-kube-bt-pod.sh
echo "export PS1=\"\${POD_NAME}# \"" >> /etc/profile.d/50-kube-bt-pod.sh
chmod 644 /etc/profile.d/50-kube-bt-pod.sh
`
	if sw.InstallHysteria2 {
		hp := NormalizeHysteria2ListenPort(sw.Hysteria2ListenPort)
		head += fmt.Sprintf(`cat > /etc/profile.d/51-kube-bt-hysteria-proxy.sh <<'HYPROXYEOF'
export http_proxy=http://127.0.0.1:%d
export https_proxy=http://127.0.0.1:%d
export HTTP_PROXY=http://127.0.0.1:%d
export HTTPS_PROXY=http://127.0.0.1:%d
HYPROXYEOF
`, hp, hp, hp, hp)
		if sp := hysteriaSocksListenPortFromClientYAML(sw.Hysteria2ConfigYAML); sp > 0 {
			head += fmt.Sprintf(`printf 'export all_proxy=socks5://127.0.0.1:%d\nexport ALL_PROXY=socks5://127.0.0.1:%d\n' >> /etc/profile.d/51-kube-bt-hysteria-proxy.sh
`, sp, sp)
		}
		head += "chmod 644 /etc/profile.d/51-kube-bt-hysteria-proxy.sh\n"
	}
	return head + `echo "root:${ROOT_PASSWORD}" | chpasswd
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config || true
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config || true
USER_INIT="/run/cloud-vm-init/user-init.sh"
if [ -f "$USER_INIT" ] && [ -s "$USER_INIT" ]; then
  chmod +x "$USER_INIT" 2>/dev/null || true
  /bin/bash "$USER_INIT"
fi
exec /usr/sbin/sshd -D -e
`
}

func buildCloudVMDeployment(ns, depName, secretName, pvcName, image string, cpuR, cpuL, memR, memL string, env []cloudVMEnvVar, cmd, args []string, initScript string, id int64, sw CloudVMSoftwareOpts) *appsv1.Deployment {
	privileged := sw.InstallDocker
	labels := map[string]string{
		"app.kubernetes.io/name":       "kube-bt-cloud-vm",
		"app.kubernetes.io/instance":   depName,
		"kube-bt-sync.io/cloud-vm-id":  fmt.Sprintf("%d", id),
	}
	script := cloudVMStartupScript(sw)
	containerEnv := []corev1.EnvVar{
		{Name: "ROOT_PASSWORD", ValueFrom: &corev1.EnvVarSource{
			SecretKeyRef: &corev1.SecretKeySelector{LocalObjectReference: corev1.LocalObjectReference{Name: secretName}, Key: "root-password"},
		}},
		{Name: "POD_NAME", ValueFrom: &corev1.EnvVarSource{
			FieldRef: &corev1.ObjectFieldSelector{APIVersion: "v1", FieldPath: "metadata.name"},
		}},
	}
	for _, e := range env {
		if strings.TrimSpace(e.Name) == "" {
			continue
		}
		containerEnv = append(containerEnv, corev1.EnvVar{Name: e.Name, Value: e.Value})
	}
	runCmd := []string{"/bin/bash", "-c"}
	runArgs := []string{script}
	useDefaultEntry := len(cmd) == 0
	if !useDefaultEntry {
		runCmd = cmd
		if len(args) > 0 {
			runArgs = args
		} else {
			runArgs = nil
		}
	}

	vmounts := []corev1.VolumeMount{{Name: "data", MountPath: "/data"}}
	vols := []corev1.Volume{{
		Name: "data",
		VolumeSource: corev1.VolumeSource{
			PersistentVolumeClaim: &corev1.PersistentVolumeClaimVolumeSource{ClaimName: pvcName},
		},
	}}
	podAnn := map[string]string(nil)
	if useDefaultEntry {
		mode := int32(0555)
		vmounts = append(vmounts, corev1.VolumeMount{
			Name: "cloud-vm-init", MountPath: "/run/cloud-vm-init/user-init.sh", SubPath: "user-init.sh", ReadOnly: true,
		})
		vols = append(vols, corev1.Volume{
			Name: "cloud-vm-init",
			VolumeSource: corev1.VolumeSource{
				Secret: &corev1.SecretVolumeSource{SecretName: secretName, DefaultMode: &mode},
			},
		})
		podAnn = map[string]string{"kube-bt-sync.io/cloud-vm-init-hash": initScriptHash(initScript)}
	}

	ports := []corev1.ContainerPort{{Name: "ssh", ContainerPort: cloudVMSSHPort, Protocol: corev1.ProtocolTCP}}
	if sw.InstallHysteria2 && strings.TrimSpace(sw.Hysteria2ConfigYAML) != "" {
		hyPort := int32(NormalizeHysteria2ListenPort(sw.Hysteria2ListenPort))
		modeHy := int32(0440)
		vmounts = append(vmounts, corev1.VolumeMount{
			Name:      "cloud-vm-hy2-cfg",
			MountPath: "/run/cloud-vm-secrets/hysteria2.yaml",
			SubPath:   "hysteria2.yaml",
			ReadOnly:  true,
		})
		vols = append(vols, corev1.Volume{
			Name: "cloud-vm-hy2-cfg",
			VolumeSource: corev1.VolumeSource{
				Secret: &corev1.SecretVolumeSource{
					SecretName: secretName,
					Items:      []corev1.KeyToPath{{Key: "hysteria2.yaml", Path: "hysteria2.yaml", Mode: &modeHy}},
				},
			},
		})
		ports = append(ports,
			corev1.ContainerPort{Name: "hy2-tcp", ContainerPort: hyPort, Protocol: corev1.ProtocolTCP},
		)
	}

	return &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      depName,
			Namespace: ns,
			Labels:    labels,
		},
		Spec: appsv1.DeploymentSpec{
			Replicas: int32Ptr(1),
			Selector: &metav1.LabelSelector{MatchLabels: map[string]string{"app.kubernetes.io/instance": depName}},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: labels, Annotations: podAnn},
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{{
						Name:  "cloud-vm",
						Image: image,
						Ports: ports,
						Env:   containerEnv,
						SecurityContext: func() *corev1.SecurityContext {
							if !privileged {
								return nil
							}
							t := true
							return &corev1.SecurityContext{Privileged: &t}
						}(),
						Resources: corev1.ResourceRequirements{
							Requests: corev1.ResourceList{
								corev1.ResourceCPU:    resource.MustParse(cpuR),
								corev1.ResourceMemory: resource.MustParse(memR),
							},
							Limits: corev1.ResourceList{
								corev1.ResourceCPU:    resource.MustParse(cpuL),
								corev1.ResourceMemory: resource.MustParse(memL),
							},
						},
						VolumeMounts: vmounts,
						Command:      runCmd,
						Args:         runArgs,
						ReadinessProbe: func() *corev1.Probe {
							if !useDefaultEntry {
								return nil
							}
							// 与 SSH 可连对齐：端口 22 可接受连接后 Pod 才 Ready（预装 sshd 的镜像会更快通过）
							// SSH 仅在 user-init（含预选软件 apt）全部成功后启动；探针在此之前一直失败属正常。
							return &corev1.Probe{
								ProbeHandler: corev1.ProbeHandler{
									TCPSocket: &corev1.TCPSocketAction{Port: intstr.FromInt(int(cloudVMSSHPort))},
								},
								InitialDelaySeconds: 5,
								PeriodSeconds:       5,
								TimeoutSeconds:      2,
								SuccessThreshold:    1,
								FailureThreshold:    3,
							}
						}(),
					}},
					Volumes: vols,
				},
			},
		},
	}
}

func buildCloudVMService(ns, svcName, depName string, nodePort int32) *corev1.Service {
	return &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{Name: svcName, Namespace: ns},
		Spec: corev1.ServiceSpec{
			Type: corev1.ServiceTypeNodePort,
			Selector: map[string]string{"app.kubernetes.io/instance": depName},
			Ports: []corev1.ServicePort{{
				Name:       "ssh",
				Port:       cloudVMSSHPort,
				TargetPort: intstr.FromInt(int(cloudVMSSHPort)),
				Protocol:   corev1.ProtocolTCP,
				NodePort:   nodePort,
			}},
		},
	}
}

func nodePrimaryIP(n *corev1.Node) string {
	if n == nil {
		return ""
	}
	for _, a := range n.Status.Addresses {
		if a.Type == corev1.NodeExternalIP && a.Address != "" {
			return a.Address
		}
	}
	for _, a := range n.Status.Addresses {
		if a.Type == corev1.NodeInternalIP && a.Address != "" {
			return a.Address
		}
	}
	return ""
}

func firstNodeAccessIP(ctx context.Context, k8s *kubernetes.Clientset) string {
	nodes, err := k8s.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil || len(nodes.Items) == 0 {
		return ""
	}
	return nodePrimaryIP(&nodes.Items[0])
}

func nodeAccessIPForNodeName(ctx context.Context, k8s *kubernetes.Clientset, name string) string {
	name = strings.TrimSpace(name)
	if name == "" || k8s == nil {
		return ""
	}
	n, err := k8s.CoreV1().Nodes().Get(ctx, name, metav1.GetOptions{})
	if err != nil || n == nil {
		return ""
	}
	return nodePrimaryIP(n)
}

func resolveNodeAccessIP(ctx context.Context, k8s *kubernetes.Clientset, boot *CloudVMBootstrap) string {
	if k8s == nil {
		return ""
	}
	if boot != nil && strings.TrimSpace(boot.DefaultAccessNodeName) != "" {
		if ip := nodeAccessIPForNodeName(ctx, k8s, boot.DefaultAccessNodeName); ip != "" {
			return ip
		}
	}
	return firstNodeAccessIP(ctx, k8s)
}

func ensureNamespace(ctx context.Context, k8s *kubernetes.Clientset, name string) error {
	_, err := k8s.CoreV1().Namespaces().Get(ctx, name, metav1.GetOptions{})
	if err == nil {
		return nil
	}
	if !apierrors.IsNotFound(err) {
		return err
	}
	_, err = k8s.CoreV1().Namespaces().Create(ctx, &corev1.Namespace{
		ObjectMeta: metav1.ObjectMeta{Name: name},
	}, metav1.CreateOptions{})
	return err
}

func registerAppCloudVMRoutes(api *gin.RouterGroup, app *ServerApp) {
	g := api.Group("/app-center/cloud-vm")
	g.GET("/ssh-security-events", func(c *gin.Context) { handleCloudVMSSHSecurityEvents(c, app) })
	g.GET("/bootstrap", func(c *gin.Context) { handleCloudVMBootstrapGet(c, app) })
	g.PUT("/bootstrap", func(c *gin.Context) { handleCloudVMBootstrapPut(c, app) })
	g.GET("/access-nodes", func(c *gin.Context) { handleCloudVMAccessNodes(c, app) })
	g.GET("/instances", func(c *gin.Context) { handleCloudVMList(c, app) })
	g.GET("/instances/usage", func(c *gin.Context) { handleCloudVMInstancesUsage(c, app) })
	g.POST("/instances", func(c *gin.Context) { handleCloudVMCreate(c, app) })
	g.GET("/instances/:id", func(c *gin.Context) { handleCloudVMGet(c, app) })
	g.POST("/instances/:id/reveal-hysteria-client", func(c *gin.Context) { handleCloudVMRevealHysteriaClient(c, app) })
	g.PUT("/instances/:id", func(c *gin.Context) { handleCloudVMUpdatePut(c, app) })
	g.POST("/instances/:id/scale", func(c *gin.Context) { handleCloudVMScale(c, app) })
	g.DELETE("/instances/:id", func(c *gin.Context) { handleCloudVMDelete(c, app) })
	g.GET("/instances/:id/metrics", func(c *gin.Context) { handleCloudVMMetrics(c, app) })
	g.GET("/instances/:id/ssh/captcha", func(c *gin.Context) { handleCloudVMSSHCaptcha(c, app) })
	g.GET("/instances/:id/ssh/preflight", func(c *gin.Context) { handleCloudVMSSHPreflight(c, app) })
	g.GET("/instances/:id/ssh/ws", func(c *gin.Context) { handleCloudVMSSHWS(c, app) })
	g.POST("/instances/:id/reset-root-password", func(c *gin.Context) { handleCloudVMResetRootPassword(c, app) })
}

// handleCloudVMSSHPreflight 供前端在建立 WebSocket 前探测；若库中 root 密码可解密则无需在终端弹窗重复输入。
func handleCloudVMSSHPreflight(c *gin.Context, app *ServerApp) {
	if app.K8s() == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "K8s 未连接"})
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效 id"})
		return
	}
	db := cloudVMDB(app)
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "需要 MySQL"})
		return
	}
	var cfgj, ns string
	err = db.QueryRow(`SELECT namespace, config_json FROM kubebt_app_cloud_vm_instances WHERE id=?`, id).Scan(&ns, &cfgj)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "不存在"})
		return
	}
	var st CloudVMStored
	if err := json.Unmarshal([]byte(cfgj), &st); err != nil {
		RespondAPIError500(c, "配置解析失败")
		return
	}
	key, kerr := sshEncryptionKey(app.Cfg())
	canDecryptStored := false
	if kerr == nil {
		if p, e := decryptSecret(key, st.RootPasswordEnc); e == nil && strings.TrimSpace(p) != "" {
			canDecryptStored = true
		}
	}
	rctx, rcancel := context.WithTimeout(c.Request.Context(), 12*time.Second)
	readiness := computeCloudVMReadiness(rctx, app.K8s(), ns, st.DeploymentName)
	rcancel()
	podName, _ := readiness["podName"].(string)
	visitorIP := c.ClientIP()
	pu := dashboardUsernameFromGin(c)
	if pu == "" {
		pu = "unknown"
	}
	fc := getCloudVMSSHFailCount(id, pu, visitorIP)
	c.JSON(http.StatusOK, gin.H{
		"ok":                   true,
		"requireManualPassword": !canDecryptStored,
		"canDecryptStored":     canDecryptStored,
		"encryptionKeyReady":   kerr == nil,
		"podName":              podName,
		"readiness":            readiness,
		"sshFailCount":         fc,
		"needCaptcha":          fc >= cloudVMSSHMaxFailsBeforeCaptcha,
	})
}

func handleCloudVMBootstrapGet(c *gin.Context, app *ServerApp) {
	b := loadCloudVMBootstrap(app.PlatformKV())
	c.JSON(http.StatusOK, gin.H{
		"bootstrapComplete":       b.BootstrapComplete,
		"images":                  b.Images,
		"defaultNamespace":        b.DefaultNamespace,
		"defaultAccessNodeName":   b.DefaultAccessNodeName,
		"hysteria2LinuxAmd64Url":  b.Hysteria2LinuxAmd64URL,
		"hysteria2LinuxArm64Url": b.Hysteria2LinuxArm64URL,
	})
}

func handleCloudVMBootstrapPut(c *gin.Context, app *ServerApp) {
	if getDashboardRoleFromGin(c) != DashboardRoleAdmin {
		RespondAPIPermissionDenied(c)
		return
	}
	var body CloudVMBootstrap
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if strings.TrimSpace(body.DefaultNamespace) == "" {
		body.DefaultNamespace = "kube-bt-cloud-vm"
	}
	if len(body.Images) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "至少配置一条镜像"})
		return
	}
	for i := range body.Images {
		body.Images[i].ID = strings.TrimSpace(body.Images[i].ID)
		body.Images[i].Image = strings.TrimSpace(body.Images[i].Image)
		if body.Images[i].ID == "" || body.Images[i].Image == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "镜像 id 与 image 不能为空"})
			return
		}
	}
	body.Hysteria2LinuxAmd64URL = strings.TrimSpace(body.Hysteria2LinuxAmd64URL)
	body.Hysteria2LinuxArm64URL = strings.TrimSpace(body.Hysteria2LinuxArm64URL)
	for _, pair := range []struct {
		u, label string
	}{{body.Hysteria2LinuxAmd64URL, "hysteria2LinuxAmd64Url"}, {body.Hysteria2LinuxArm64URL, "hysteria2LinuxArm64Url"}} {
		if pair.u == "" {
			continue
		}
		if !strings.HasPrefix(pair.u, "http://") && !strings.HasPrefix(pair.u, "https://") {
			c.JSON(http.StatusBadRequest, gin.H{"error": pair.label + " 须为 http(s) URL"})
			return
		}
	}
	body.BootstrapComplete = true
	if err := saveCloudVMBootstrap(app.PlatformKV(), &body); err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	mirrorPlatformKVIfDualWrite(app)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func handleCloudVMAccessNodes(c *gin.Context, app *ServerApp) {
	k8s := app.K8s()
	if k8s == nil {
		c.JSON(http.StatusOK, gin.H{"nodes": []gin.H{}})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
	defer cancel()
	nodes, err := k8s.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	out := make([]gin.H, 0, len(nodes.Items))
	for i := range nodes.Items {
		n := &nodes.Items[i]
		out = append(out, gin.H{"name": n.Name, "ip": nodePrimaryIP(n)})
	}
	c.JSON(http.StatusOK, gin.H{"nodes": out})
}

func cloudVMDB(app *ServerApp) *sql.DB {
	return app.MySQLDB()
}

// cloudVMConfigForAPIResponse 列表/详情 JSON 不回传 Hysteria2 客户端 YAML/分享链；需具备权限并验证平台密码后另行获取。
func cloudVMConfigForAPIResponse(st CloudVMStored) CloudVMStored {
	out := st
	out.Software.Hysteria2ConfigYAML = ""
	return out
}

func handleCloudVMRevealHysteriaClient(c *gin.Context, app *ServerApp) {
	eff := getEffectiveDashboardPermissionsFromGin(c)
	if !eff.AppCenterCloudVmHysteriaReveal {
		RespondAPIPermissionDenied(c)
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效 id"})
		return
	}
	var body struct {
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if strings.TrimSpace(body.Password) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请填写当前平台登录密码"})
		return
	}
	db := cloudVMDB(app)
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "需要 MySQL"})
		return
	}
	user := strings.TrimSpace(dashboardUsernameFromGin(c))
	if user == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未登录"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 12*time.Second)
	defer cancel()
	if err := verifyDashboardUserCurrentPassword(db, ctx, user, body.Password); err != nil {
		msg := err.Error()
		if strings.Contains(msg, "过长") {
			c.JSON(http.StatusBadRequest, gin.H{"error": msg})
			return
		}
		c.JSON(http.StatusUnauthorized, gin.H{"error": "密码验证失败"})
		return
	}
	var cfgj string
	err = db.QueryRowContext(ctx, `SELECT config_json FROM kubebt_app_cloud_vm_instances WHERE id=?`, id).Scan(&cfgj)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "不存在"})
		return
	}
	var st CloudVMStored
	if err := json.Unmarshal([]byte(cfgj), &st); err != nil {
		RespondAPIError500(c, "配置解析失败")
		return
	}
	if !st.Software.InstallHysteria2 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "该实例未启用 Hysteria2 客户端"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"hysteria2ConfigYaml": strings.TrimSpace(st.Software.Hysteria2ConfigYAML),
		"hysteria2ListenPort": NormalizeHysteria2ListenPort(st.Software.Hysteria2ListenPort),
	})
}

func handleCloudVMList(c *gin.Context, app *ServerApp) {
	db := cloudVMDB(app)
	if db == nil {
		c.JSON(http.StatusOK, gin.H{"instances": []any{}, "mysqlRequired": true})
		return
	}
	boot := loadCloudVMBootstrap(app.PlatformKV())
	k8s := app.K8s()
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	eff := getEffectiveDashboardPermissionsFromGin(c)
	rows, err := db.QueryContext(ctx, `SELECT id, name, namespace, config_json, created_by, created_at FROM kubebt_app_cloud_vm_instances ORDER BY id DESC`)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	defer rows.Close()
	var out []gin.H
	for rows.Next() {
		var r cloudVMRow
		if err := rows.Scan(&r.ID, &r.Name, &r.Namespace, &r.ConfigJSON, &r.CreatedBy, &r.CreatedAt); err != nil {
			continue
		}
		var st CloudVMStored
		_ = json.Unmarshal([]byte(r.ConfigJSON), &st)
		phase := st.Phase
		if k8s != nil && strings.TrimSpace(st.DeploymentName) != "" {
			read := computeCloudVMReadiness(ctx, k8s, r.Namespace, st.DeploymentName)
			if ok, _ := read["ready"].(bool); ok {
				phase = "running"
			} else {
				phase = "deploying"
			}
		}
		nodeIP := st.NodeAccessIP
		if k8s != nil {
			if ip := resolveNodeAccessIP(ctx, k8s, boot); ip != "" {
				nodeIP = ip
			}
		}
		hyHost := ""
		hyPort := 0
		if eff.AppCenterCloudVmHysteriaReveal && st.Software.InstallHysteria2 && strings.TrimSpace(st.Software.Hysteria2ConfigYAML) != "" && strings.TrimSpace(st.DeploymentName) != "" {
			hyHost = CloudVMHysteria2ClusterEndpoint(r.Namespace, st.DeploymentName, st.Software.Hysteria2ListenPort)
			hyPort = NormalizeHysteria2ListenPort(st.Software.Hysteria2ListenPort)
		}
		out = append(out, gin.H{
			"id": r.ID, "name": r.Name, "namespace": r.Namespace, "createdBy": r.CreatedBy,
			"createdAt": r.CreatedAt.UTC().Format(time.RFC3339),
			"summary": gin.H{
				"nodeIP": nodeIP, "sshPort": st.SSHPort, "phase": phase,
				"image": st.Image,
				"installHysteria2":           st.Software.InstallHysteria2,
				"hysteria2ClusterEndpoint": hyHost,
				"hysteria2Port":            hyPort,
			},
		})
	}
	c.JSON(http.StatusOK, gin.H{"instances": out})
}

// handleCloudVMInstancesUsage 列表页资源占用：Prometheus 瞬时 CPU/内存用量及对 limit 的占比（与详情页 PromQL 一致）。
func handleCloudVMInstancesUsage(c *gin.Context, app *ServerApp) {
	cfg := app.Cfg()
	if strings.TrimSpace(GetPrometheusURLForScope(cfg, "k8s")) == "" {
		c.JSON(http.StatusOK, gin.H{"prometheusConfigured": false, "items": []gin.H{}})
		return
	}
	db := cloudVMDB(app)
	if db == nil {
		c.JSON(http.StatusOK, gin.H{"prometheusConfigured": false, "items": []gin.H{}})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 45*time.Second)
	defer cancel()
	rows, err := db.QueryContext(ctx, `SELECT id, namespace, config_json FROM kubebt_app_cloud_vm_instances ORDER BY id DESC`)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	defer rows.Close()
	k8s := app.K8s()
	var items []gin.H
	for rows.Next() {
		var id int64
		var ns, cfgj string
		if err := rows.Scan(&id, &ns, &cfgj); err != nil {
			continue
		}
		var st CloudVMStored
		_ = json.Unmarshal([]byte(cfgj), &st)
		phase := st.Phase
		if k8s != nil && strings.TrimSpace(st.DeploymentName) != "" {
			read := computeCloudVMReadiness(ctx, k8s, ns, st.DeploymentName)
			if ok, _ := read["ready"].(bool); ok {
				phase = "running"
			} else {
				phase = "deploying"
			}
		}
		item := gin.H{"id": id, "phase": phase}
		cpuLimitStr := strings.TrimSpace(st.CPULimit)
		if cpuLimitStr == "" {
			cpuLimitStr = strings.TrimSpace(st.CPURequest)
		}
		memLimitStr := strings.TrimSpace(st.MemLimit)
		if memLimitStr == "" {
			memLimitStr = strings.TrimSpace(st.MemRequest)
		}
		limitCores := cloudVMParseCPUToCores(cpuLimitStr)
		limitBytes := cloudVMParseMemToBytes(memLimitStr)
		item["cpuLimitCores"] = limitCores
		item["memLimitBytes"] = limitBytes
		if phase != "running" || strings.TrimSpace(st.DeploymentName) == "" {
			item["cpuUsageCores"] = nil
			item["memUsageBytes"] = nil
			item["cpuPercent"] = nil
			item["memPercent"] = nil
			item["cpuQuery"] = nil
			item["memQuery"] = nil
			items = append(items, item)
			continue
		}
		podRe := st.DeploymentName + "-[a-z0-9]+-[a-z0-9]{5}"
		cpuQ := fmt.Sprintf(`sum(rate(container_cpu_usage_seconds_total{namespace=%q,pod=~%q,container!=""}[2m]))`, ns, podRe)
		memQ := fmt.Sprintf(`sum(container_memory_working_set_bytes{namespace=%q,pod=~%q,container!=""})`, ns, podRe)
		item["cpuQuery"] = cpuQ
		item["memQuery"] = memQ
		cpuPtr := PrometheusPromQLInstantScalar(cfg, "k8s", cpuQ)
		memPtr := PrometheusPromQLInstantScalar(cfg, "k8s", memQ)
		if cpuPtr != nil {
			item["cpuUsageCores"] = *cpuPtr
		} else {
			item["cpuUsageCores"] = nil
		}
		if memPtr != nil {
			item["memUsageBytes"] = *memPtr
		} else {
			item["memUsageBytes"] = nil
		}
		if limitCores > 0 && cpuPtr != nil {
			v := *cpuPtr / limitCores * 100
			if v < 0 {
				v = 0
			}
			item["cpuPercent"] = v
		} else {
			item["cpuPercent"] = nil
		}
		if limitBytes > 0 && memPtr != nil {
			v := *memPtr / limitBytes * 100
			if v < 0 {
				v = 0
			}
			item["memPercent"] = v
		} else {
			item["memPercent"] = nil
		}
		items = append(items, item)
	}
	c.JSON(http.StatusOK, gin.H{"prometheusConfigured": true, "items": items})
}

type cloudVMEnvVar struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

type cloudVMCreateBody struct {
	Name         string         `json:"name"`
	ImageID      string         `json:"imageId"`
	CPURequest   string         `json:"cpuRequest"`
	CPULimit     string         `json:"cpuLimit"`
	MemRequest   string         `json:"memRequest"`
	MemLimit     string         `json:"memLimit"`
	PVCSize      string         `json:"pvcSize"`
	StorageClass string         `json:"storageClassName"`
	NodePort     int32          `json:"nodePort"`
	RootPassword string         `json:"rootPassword"`
	Env          []cloudVMEnvVar `json:"env"`
	Command      []string       `json:"command"`
	Args         []string       `json:"args"`
	/** InitScript 用户自定义 bash；与 software 合并后写入 Secret */
	InitScript string `json:"initScript"`
	Software   CloudVMSoftwareOpts `json:"software"`
}

func handleCloudVMCreate(c *gin.Context, app *ServerApp) {
	if !appCloudVMRequireWrite(c) {
		return
	}
	db := cloudVMDB(app)
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "需要 MySQL"})
		return
	}
	boot := loadCloudVMBootstrap(app.PlatformKV())
	if !boot.BootstrapComplete {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请先在「云主机镜像引导」中完成镜像配置"})
		return
	}
	var req cloudVMCreateBody
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	name := sanitizeCloudVMK8sName(req.Name)
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "名称无效"})
		return
	}
	if len(req.RootPassword) < 8 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "root 密码至少 8 位"})
		return
	}
	if err := ValidateOptionalK8sNodePort("nodePort", req.NodePort); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var img *CloudVMImageOption
	for i := range boot.Images {
		if boot.Images[i].ID == strings.TrimSpace(req.ImageID) {
			img = &boot.Images[i]
			break
		}
	}
	if img == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "未知镜像 imageId"})
		return
	}
	cpuR := strings.TrimSpace(req.CPURequest)
	cpuL := strings.TrimSpace(req.CPULimit)
	memR := strings.TrimSpace(req.MemRequest)
	memL := strings.TrimSpace(req.MemLimit)
	pvcSize := strings.TrimSpace(req.PVCSize)
	if pvcSize == "" {
		pvcSize = "20Gi"
	}
	if cpuR == "" {
		cpuR = "500m"
	}
	if cpuL == "" {
		cpuL = "2"
	}
	if memR == "" {
		memR = "512Mi"
	}
	if memL == "" {
		memL = "2Gi"
	}
	k8s := app.K8s()
	if k8s == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "K8s 未连接"})
		return
	}
	key, kerr := sshEncryptionKey(app.Cfg())
	if kerr != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "加密密钥未配置: " + kerr.Error()})
		return
	}
	pwEnc, err := encryptSecret(key, req.RootPassword)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	ns := strings.TrimSpace(boot.DefaultNamespace)
	ctx, cancel := context.WithTimeout(c.Request.Context(), 120*time.Second)
	defer cancel()
	if err := ensureNamespace(ctx, k8s, ns); err != nil {
		RespondAPIError500(c, "创建命名空间: " + err.Error())
		return
	}
	slug := name + "-" + strconv.FormatInt(time.Now().Unix()%100000, 10)
	depName := "cloud-vm-" + slug
	svcName := depName + "-ssh"
	pvcName := depName + "-data"
	secName := depName + "-secret"
	nodePort := req.NodePort
	if nodePort == 0 {
		nodePort = 30000 + int32(time.Now().Unix()%2768)
	}

	initPlain := strings.TrimSpace(req.InitScript)
	sw := req.Software
	sw.CliPackages = normalizeCloudVMCliPackages(sw.CliPackages)
	if sw.InstallHysteria2 && strings.TrimSpace(sw.Hysteria2ConfigYAML) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "已勾选 Hysteria2 客户端时请粘贴 hysteria2:// 或 hy2:// 分享链接，或导入客户端 YAML"})
		return
	}
	if len(sw.Hysteria2ConfigYAML) > 65536 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Hysteria2 配置过长（上限 64KiB）"})
		return
	}
	// Secret（root 密码 + 合并后的初始化脚本，挂载为只读文件）
	stCompose := CloudVMStored{InitScript: initPlain, Software: sw}
	fullInit := composeCloudVMUserInitScript(stCompose, boot)
	sec := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{Name: secName, Namespace: ns},
		StringData: map[string]string{
			"root-password": req.RootPassword,
			"user-init.sh":  fullInit,
		},
		Type: corev1.SecretTypeOpaque,
	}
	if sw.InstallHysteria2 {
		sec.StringData["hysteria2.yaml"] = NormalizeHysteriaClientSecretYAML(sw.Hysteria2ConfigYAML, sw.Hysteria2ListenPort)
	}
	if _, err := k8s.CoreV1().Secrets(ns).Create(ctx, sec, metav1.CreateOptions{}); err != nil && !apierrors.IsAlreadyExists(err) {
		RespondAPIError500(c, "创建 Secret: " + err.Error())
		return
	}

	scResolved, err := ResolveRedisK8sStorageClass(ctx, k8s, req.StorageClass)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "StorageClass: " + err.Error()})
		return
	}
	pvc, err := buildRedisPVC(ns, pvcName, scResolved, pvcSize, map[string]string{"app": depName, "kube-bt-sync.io/cloud-vm": "true"})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "PVC: " + err.Error()})
		return
	}
	if err := applyPVC(ctx, k8s, pvc); err != nil {
		RespondAPIError500(c, "PVC: " + err.Error())
		return
	}

	cmd := img.Command
	args := img.Args
	if len(req.Command) > 0 {
		cmd = req.Command
	}
	if len(req.Args) > 0 {
		args = req.Args
	}

	user := dashboardUsernameFromGin(c)
	cfg := CloudVMStored{
		DisplayName:     name,
		ImageID:         img.ID,
		Image:           img.Image,
		CPURequest:      cpuR,
		CPULimit:        cpuL,
		MemRequest:      memR,
		MemLimit:        memL,
		PVCSize:         pvcSize,
		StorageClass:    scResolved,
		NodePort:        nodePort,
		Env:             req.Env,
		Command:         cmd,
		Args:            args,
		InitScript:      initPlain,
		Software:        sw,
		RootPasswordEnc: pwEnc,
		DeploymentName:  depName,
		ServiceName:     svcName,
		PVCName:         pvcName,
		SecretName:      secName,
		SSHPort:         nodePort,
		Phase:           "deploying",
	}
	res, err := db.ExecContext(ctx, `INSERT INTO kubebt_app_cloud_vm_instances (name, namespace, config_json, created_by) VALUES (?,?,?,?)`,
		name, ns, "{}", user)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "duplicate") {
			c.JSON(http.StatusConflict, gin.H{"error": "同名实例已存在"})
			return
		}
		RespondAPIError500(c, err.Error())
		return
	}
	id, _ := res.LastInsertId()
	cfg.NodeAccessIP = resolveNodeAccessIP(ctx, k8s, boot)
	blob, _ := json.Marshal(cfg)
	_, _ = db.ExecContext(ctx, `UPDATE kubebt_app_cloud_vm_instances SET config_json=? WHERE id=?`, string(blob), id)

	dep := buildCloudVMDeployment(ns, depName, secName, pvcName, img.Image, cpuR, cpuL, memR, memL, req.Env, cmd, args, fullInit, id, sw)
	if err := upsertDeployment(ctx, k8s, dep); err != nil {
		RespondAPIError500(c, "Deployment: " + err.Error())
		return
	}
	svc := buildCloudVMService(ns, svcName, depName, nodePort)
	if err := upsertService(ctx, k8s, svc); err != nil {
		RespondAPIError500(c, "Service: " + err.Error())
		return
	}
	if err := upsertCloudVMHysteria2Service(ctx, k8s, ns, depName, sw); err != nil {
		RespondAPIError500(c, "Hysteria2 集群内 Service: " + err.Error())
		return
	}
	// 保持 deploying，直至 GET 检测到 Pod Ready 后再写回 running（避免创建完即提示可 SSH）
	cfg.NodeAccessIP = resolveNodeAccessIP(ctx, k8s, boot)
	blob, _ = json.Marshal(cfg)
	_, _ = db.ExecContext(ctx, `UPDATE kubebt_app_cloud_vm_instances SET config_json=? WHERE id=?`, string(blob), id)

	c.JSON(http.StatusOK, gin.H{"id": id, "summary": gin.H{"nodeIP": cfg.NodeAccessIP, "sshPort": nodePort, "phase": cfg.Phase}})
}

func ginHContainerStatus(cs corev1.ContainerStatus) gin.H {
	out := gin.H{"name": cs.Name, "ready": cs.Ready, "state": "unknown"}
	switch {
	case cs.State.Waiting != nil:
		out["state"] = "waiting"
		if cs.State.Waiting.Reason != "" {
			out["reason"] = cs.State.Waiting.Reason
		}
		if cs.State.Waiting.Message != "" {
			out["message"] = cs.State.Waiting.Message
		}
	case cs.State.Running != nil:
		out["state"] = "running"
	case cs.State.Terminated != nil:
		out["state"] = "terminated"
		if cs.State.Terminated.Reason != "" {
			out["reason"] = cs.State.Terminated.Reason
		}
	}
	return out
}

func initContainersReady(p *corev1.Pod) bool {
	if len(p.Status.InitContainerStatuses) == 0 {
		return true
	}
	for _, ic := range p.Status.InitContainerStatuses {
		if !ic.Ready {
			return false
		}
	}
	return true
}

// cloudVMReadiness 根据 Deployment / Pod 状态判断是否可安全使用 SSH（避免 sshd 尚未监听时握手 EOF）。
func computeCloudVMReadiness(ctx context.Context, k8s *kubernetes.Clientset, ns, depName string) gin.H {
	out := gin.H{"ready": false, "message": "K8s 未连接", "progressStep": 1, "progressTotal": 3, "progressPercent": 10}
	if k8s == nil || strings.TrimSpace(depName) == "" {
		return out
	}
	dep, err := k8s.AppsV1().Deployments(ns).Get(ctx, depName, metav1.GetOptions{})
	if err != nil {
		return gin.H{"ready": false, "message": "Deployment: " + err.Error(), "progressStep": 1, "progressTotal": 3, "progressPercent": 10}
	}
	ls := "app.kubernetes.io/instance=" + depName
	pods, err := k8s.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{LabelSelector: ls})
	if err != nil {
		return gin.H{
			"ready": false, "message": "Pod 列表: " + err.Error(),
			"readyReplicas": dep.Status.ReadyReplicas, "deploymentReplicas": dep.Status.Replicas,
			"progressStep": 1, "progressTotal": 3, "progressPercent": 15,
		}
	}
	base := gin.H{
		"readyReplicas": dep.Status.ReadyReplicas, "deploymentReplicas": dep.Status.Replicas,
		"deploymentUpdatedReplicas": dep.Status.UpdatedReplicas,
		"progressTotal":             3,
		"progressLabels":            []string{"调度与镜像", "容器运行（就绪检查）", "可 SSH"},
	}
	if len(pods.Items) == 0 {
		base["ready"] = false
		base["message"] = "等待 Pod 创建/调度（首次可能需拉取镜像）"
		base["podPhase"] = ""
		base["progressStep"] = 1
		base["progressPercent"] = 20
		base["progressDetail"] = "尚无 Pod：Deployment 正在创建或等待调度"
		return base
	}
	p := &pods.Items[0]
	podReady := false
	for _, c := range p.Status.Conditions {
		if c.Type == corev1.PodReady && c.Status == corev1.ConditionTrue {
			podReady = true
			break
		}
	}
	podPhase := string(p.Status.Phase)
	ready := dep.Status.ReadyReplicas >= 1 && p.Status.Phase == corev1.PodRunning && podReady

	var initCs []gin.H
	for _, ic := range p.Status.InitContainerStatuses {
		initCs = append(initCs, ginHContainerStatus(ic))
	}
	var mainCs []gin.H
	for _, cs := range p.Status.ContainerStatuses {
		mainCs = append(mainCs, ginHContainerStatus(cs))
	}
	base["podName"] = p.Name
	base["podPhase"] = podPhase
	base["k8sPodReady"] = podReady
	base["initContainerStatuses"] = initCs
	base["containerStatuses"] = mainCs

	// 进度：1=调度/镜像/Init，2=Running 但未就绪（与集群 UI 中「Running」可能并存），3=完成
	step := 1
	pct := 25
	detail := ""
	if ready {
		step, pct = 3, 100
		detail = "Deployment 与 Pod 均已就绪"
		base["ready"] = true
		base["message"] = "Pod 已就绪，可进行 SSH 与复制访问地址等操作"
		base["progressStep"] = step
		base["progressPercent"] = pct
		base["progressDetail"] = detail
		return base
	}
	base["ready"] = false
	initOK := initContainersReady(p)
	switch {
	case p.Status.Phase == corev1.PodFailed:
		step, pct = 1, 25
		detail = "Pod 处于 Failed，请在集群中查看事件与容器退出原因"
	case p.Status.Phase == corev1.PodPending || p.Status.Phase == corev1.PodUnknown:
		step, pct = 1, 30
		detail = "Pod 处于 " + podPhase + "：等待调度、拉取镜像或挂载卷"
	case !initOK:
		step, pct = 1, 40
		detail = "Init 容器执行中（完成后才会进入主容器）"
	case p.Status.Phase == corev1.PodRunning && !podReady:
		step, pct = 2, 65
		detail = "Kubernetes 中 Pod 阶段可能已是 Running，但「就绪」尚未通过（启动命令、首次 apt/openssh、就绪探针等）。与集群控制台显示不一致属正常现象。"
	default:
		if dep.Status.ReadyReplicas < 1 {
			step, pct = 2, 55
			detail = "Deployment 就绪副本不足（滚动更新或资源紧张）"
		} else {
			step, pct = 1, 35
			detail = "Pod 状态：" + podPhase
		}
	}
	msg := ""
	switch {
	case dep.Status.ReadyReplicas < 1 && p.Status.Phase == corev1.PodRunning && podReady:
		msg = "Deployment 尚未就绪（滚动更新、镜像拉取或资源不足时较慢）"
	case p.Status.Phase != corev1.PodRunning:
		msg = "Pod 状态：" + podPhase
	case !podReady:
		msg = "容器启动中（首次会 apt 安装 openssh 等）；集群侧可能已显示 Running，请以本页进度为准"
	default:
		msg = "正在就绪，请稍候"
	}
	base["message"] = msg
	base["progressStep"] = step
	base["progressPercent"] = pct
	base["progressDetail"] = detail
	return base
}

func handleCloudVMGet(c *gin.Context, app *ServerApp) {
	db := cloudVMDB(app)
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "需要 MySQL"})
		return
	}
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()
	var r cloudVMRow
	err := db.QueryRowContext(ctx, `SELECT id, name, namespace, config_json, created_by, created_at FROM kubebt_app_cloud_vm_instances WHERE id=?`, id).Scan(&r.ID, &r.Name, &r.Namespace, &r.ConfigJSON, &r.CreatedBy, &r.CreatedAt)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "不存在"})
		return
	}
	var st CloudVMStored
	_ = json.Unmarshal([]byte(r.ConfigJSON), &st)
	// 不回传密码
	st.RootPasswordEnc = ""

	k8s := app.K8s()
	boot := loadCloudVMBootstrap(app.PlatformKV())
	readiness := computeCloudVMReadiness(ctx, k8s, r.Namespace, st.DeploymentName)
	if ready, ok := readiness["ready"].(bool); ok && ready && st.Phase != "running" {
		st.Phase = "running"
		blob, _ := json.Marshal(st)
		_, _ = db.ExecContext(ctx, `UPDATE kubebt_app_cloud_vm_instances SET config_json=? WHERE id=?`, string(blob), id)
	}

	accessIP := st.NodeAccessIP
	if k8s != nil {
		if ip := resolveNodeAccessIP(ctx, k8s, boot); ip != "" {
			accessIP = ip
		}
	}

	svcOut := gin.H{}
	if k8s != nil && strings.TrimSpace(st.ServiceName) != "" {
		if svc, err := k8s.CoreV1().Services(r.Namespace).Get(ctx, st.ServiceName, metav1.GetOptions{}); err == nil && svc != nil {
			svcOut["name"] = svc.Name
			svcOut["namespace"] = svc.Namespace
			svcOut["clusterIP"] = svc.Spec.ClusterIP
			svcOut["type"] = string(svc.Spec.Type)
			for _, p := range svc.Spec.Ports {
				if p.Name == "ssh" || p.Port == cloudVMSSHPort {
					svcOut["port"] = p.Port
					svcOut["nodePort"] = p.NodePort
					break
				}
			}
		}
	}

	respCfg := cloudVMConfigForAPIResponse(st)
	hyStored := st.Software.InstallHysteria2 && strings.TrimSpace(st.Software.Hysteria2ConfigYAML) != ""

	c.JSON(http.StatusOK, gin.H{
		"id": r.ID, "name": r.Name, "namespace": r.Namespace, "createdBy": r.CreatedBy,
		"createdAt": r.CreatedAt.UTC().Format(time.RFC3339),
		"config":    respCfg,
		// 前端在 GET 脱敏后用于判断「库内已有 YAML」从而允许不重复粘贴即保存
		"hysteria2ConfigStored": hyStored,
		"readiness":             readiness,
		"accessNodeIP":          accessIP,
		"service":               svcOut,
	})
}

// cloudVMTriggerRolloutRestart 通过 annotation 触发展开，使 Pod 重新挂载 Secret（如 root-password 更新后）。
func cloudVMTriggerRolloutRestart(ctx context.Context, k8s *kubernetes.Clientset, r cloudVMRow, st *CloudVMStored) error {
	patch := fmt.Sprintf(`{"spec":{"template":{"metadata":{"annotations":{"kubectl.kubernetes.io/restartedAt":"%s"}}}}}`, time.Now().Format(time.RFC3339Nano))
	_, err := k8s.AppsV1().Deployments(r.Namespace).Patch(ctx, st.DeploymentName, types.StrategicMergePatchType, []byte(patch), metav1.PatchOptions{})
	return err
}

func handleCloudVMUpdatePut(c *gin.Context, app *ServerApp) {
	if !appCloudVMRequireWrite(c) {
		return
	}
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	if id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效 id"})
		return
	}
	var body struct {
		InitScript   *string              `json:"initScript"`
		Software     *CloudVMSoftwareOpts `json:"software"`
		RootPassword *string              `json:"rootPassword"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	hasPwd := body.RootPassword != nil && strings.TrimSpace(*body.RootPassword) != ""
	if body.InitScript == nil && body.Software == nil && !hasPwd {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供 initScript、software 和/或非空的 rootPassword"})
		return
	}
	if hasPwd && len(strings.TrimSpace(*body.RootPassword)) < 8 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "root 密码至少 8 位"})
		return
	}
	var encKey []byte
	var encKeyErr error
	if hasPwd {
		encKey, encKeyErr = sshEncryptionKey(app.Cfg())
		if encKeyErr != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "加密密钥未配置: " + encKeyErr.Error()})
			return
		}
	}
	db := cloudVMDB(app)
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "需要 MySQL"})
		return
	}
	k8s := app.K8s()
	if k8s == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "K8s 未连接"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 90*time.Second)
	defer cancel()
	var r cloudVMRow
	err := db.QueryRowContext(ctx, `SELECT id, name, namespace, config_json FROM kubebt_app_cloud_vm_instances WHERE id=?`, id).Scan(&r.ID, &r.Name, &r.Namespace, &r.ConfigJSON)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "不存在"})
		return
	}
	var st CloudVMStored
	if err := json.Unmarshal([]byte(r.ConfigJSON), &st); err != nil {
		RespondAPIError500(c, "配置解析失败")
		return
	}
	rootPwdChanged := false
	var rootPlain string
	if hasPwd {
		rootPlain = strings.TrimSpace(*body.RootPassword)
		pwEnc, err := encryptSecret(encKey, rootPlain)
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		st.RootPasswordEnc = pwEnc
		rootPwdChanged = true
	}
	if body.InitScript != nil {
		st.InitScript = strings.TrimSpace(*body.InitScript)
	}
	if body.Software != nil {
		s := *body.Software
		s.CliPackages = normalizeCloudVMCliPackages(s.CliPackages)
		prevYAML := strings.TrimSpace(st.Software.Hysteria2ConfigYAML)
		if s.InstallHysteria2 && strings.TrimSpace(s.Hysteria2ConfigYAML) == "" && prevYAML != "" {
			s.Hysteria2ConfigYAML = st.Software.Hysteria2ConfigYAML
		}
		st.Software = s
	}
	if st.Software.InstallHysteria2 && strings.TrimSpace(st.Software.Hysteria2ConfigYAML) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "已勾选 Hysteria2 时请粘贴分享链接或填写客户端 YAML"})
		return
	}
	if len(st.Software.Hysteria2ConfigYAML) > 65536 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Hysteria2 配置过长（上限 64KiB）"})
		return
	}
	blob, err := json.Marshal(st)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	if _, err := db.ExecContext(ctx, `UPDATE kubebt_app_cloud_vm_instances SET config_json=? WHERE id=?`, string(blob), id); err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	sec, err := k8s.CoreV1().Secrets(r.Namespace).Get(ctx, st.SecretName, metav1.GetOptions{})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "读取 Secret: " + err.Error()})
		return
	}
	if sec.Data == nil {
		sec.Data = map[string][]byte{}
	}
	boot := loadCloudVMBootstrap(app.PlatformKV())
	full := composeCloudVMUserInitScript(st, boot)
	sec.Data["user-init.sh"] = []byte(full)
	if st.Software.InstallHysteria2 && strings.TrimSpace(st.Software.Hysteria2ConfigYAML) != "" {
		sec.Data["hysteria2.yaml"] = []byte(NormalizeHysteriaClientSecretYAML(st.Software.Hysteria2ConfigYAML, st.Software.Hysteria2ListenPort))
	} else {
		delete(sec.Data, "hysteria2.yaml")
	}
	if rootPwdChanged {
		sec.Data["root-password"] = []byte(rootPlain)
	}
	if _, err := k8s.CoreV1().Secrets(r.Namespace).Update(ctx, sec, metav1.UpdateOptions{}); err != nil {
		RespondAPIError500(c, "更新 Secret: " + err.Error())
		return
	}
	if len(st.Command) == 0 {
		dep := buildCloudVMDeployment(r.Namespace, st.DeploymentName, st.SecretName, st.PVCName, st.Image, st.CPURequest, st.CPULimit, st.MemRequest, st.MemLimit, st.Env, st.Command, st.Args, full, id, st.Software)
		if err := upsertDeployment(ctx, k8s, dep); err != nil {
			RespondAPIError500(c, "更新 Deployment: " + err.Error())
			return
		}
	}
	if err := upsertCloudVMHysteria2Service(ctx, k8s, r.Namespace, st.DeploymentName, st.Software); err != nil {
		RespondAPIError500(c, "Hysteria2 Service: " + err.Error())
		return
	}
	if rootPwdChanged {
		if err := cloudVMTriggerRolloutRestart(ctx, k8s, r, &st); err != nil {
			RespondAPIError500(c, "滚动重启 Deployment: " + err.Error())
			return
		}
		SetAuditDetail(c, "同步云主机 root 密码 "+r.Name)
	}
	out := gin.H{"ok": true}
	if rootPwdChanged {
		out["rootPasswordSynced"] = true
		out["message"] = "root 密码已写入 Secret 与库中密文，并已触发展开；Pod 就绪后请使用新密码 SSH。"
	}
	c.JSON(http.StatusOK, out)
}

func handleCloudVMScale(c *gin.Context, app *ServerApp) {
	if !appCloudVMRequireWrite(c) {
		return
	}
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	if id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效 id"})
		return
	}
	var body struct {
		CPURequest *string `json:"cpuRequest"`
		CPULimit   *string `json:"cpuLimit"`
		MemRequest *string `json:"memRequest"`
		MemLimit   *string `json:"memLimit"`
		PVCSize    *string `json:"pvcSize"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if body.CPURequest == nil && body.CPULimit == nil && body.MemRequest == nil && body.MemLimit == nil && body.PVCSize == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "至少提供一个字段: cpuRequest, cpuLimit, memRequest, memLimit, pvcSize"})
		return
	}
	db := cloudVMDB(app)
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "需要 MySQL"})
		return
	}
	k8s := app.K8s()
	if k8s == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "K8s 未连接"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 120*time.Second)
	defer cancel()
	var r cloudVMRow
	err := db.QueryRowContext(ctx, `SELECT id, name, namespace, config_json FROM kubebt_app_cloud_vm_instances WHERE id=?`, id).Scan(&r.ID, &r.Name, &r.Namespace, &r.ConfigJSON)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "不存在"})
		return
	}
	var st CloudVMStored
	if err := json.Unmarshal([]byte(r.ConfigJSON), &st); err != nil {
		RespondAPIError500(c, "配置解析失败")
		return
	}
	origCPU := strings.TrimSpace(st.CPURequest)
	origCL := strings.TrimSpace(st.CPULimit)
	origMR := strings.TrimSpace(st.MemRequest)
	origML := strings.TrimSpace(st.MemLimit)
	origPVC := strings.TrimSpace(st.PVCSize)
	cpuR, cpuL, memR, memL := st.CPURequest, st.CPULimit, st.MemRequest, st.MemLimit
	if body.CPURequest != nil {
		cpuR = strings.TrimSpace(*body.CPURequest)
	}
	if body.CPULimit != nil {
		cpuL = strings.TrimSpace(*body.CPULimit)
	}
	if body.MemRequest != nil {
		memR = strings.TrimSpace(*body.MemRequest)
	}
	if body.MemLimit != nil {
		memL = strings.TrimSpace(*body.MemLimit)
	}
	if cpuR == "" || cpuL == "" || memR == "" || memL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "CPU/内存 request 与 limit 不能为空"})
		return
	}
	for _, pair := range []struct {
		s, label string
	}{{cpuR, "cpuRequest"}, {cpuL, "cpuLimit"}, {memR, "memRequest"}, {memL, "memLimit"}} {
		if _, err := resource.ParseQuantity(pair.s); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": pair.label + " 无效: " + err.Error()})
			return
		}
	}
	cpuUnchanged := cpuR == origCPU && cpuL == origCL && memR == origMR && memL == origML
	pvcTouched := false
	if body.PVCSize != nil {
		newPvc := strings.TrimSpace(*body.PVCSize)
		if newPvc != "" && newPvc != origPVC {
			pvcTouched = true
			pn := strings.TrimSpace(st.PVCName)
			if pn == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "实例未记录 PVC 名称"})
				return
			}
			if err := k8sExpandPVCStorage(ctx, k8s, r.Namespace, pn, newPvc); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "PVC 扩容: " + err.Error()})
				return
			}
			st.PVCSize = newPvc
		}
	}
	if cpuUnchanged && !pvcTouched {
		st.RootPasswordEnc = ""
		c.JSON(http.StatusOK, gin.H{"ok": true, "config": st, "unchanged": true})
		return
	}
	st.CPURequest, st.CPULimit, st.MemRequest, st.MemLimit = cpuR, cpuL, memR, memL
	blob, err := json.Marshal(st)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	if _, err := db.ExecContext(ctx, `UPDATE kubebt_app_cloud_vm_instances SET config_json=? WHERE id=?`, string(blob), id); err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	if !cpuUnchanged {
		boot := loadCloudVMBootstrap(app.PlatformKV())
		full := composeCloudVMUserInitScript(st, boot)
		dep := buildCloudVMDeployment(r.Namespace, st.DeploymentName, st.SecretName, st.PVCName, st.Image, cpuR, cpuL, memR, memL, st.Env, st.Command, st.Args, full, id, st.Software)
		if err := upsertDeployment(ctx, k8s, dep); err != nil {
			RespondAPIError500(c, "更新 Deployment: " + err.Error())
			return
		}
	}
	SetAuditDetail(c, "云主机资源扩容 "+r.Name)
	st.RootPasswordEnc = ""
	c.JSON(http.StatusOK, gin.H{"ok": true, "config": st})
}

func handleCloudVMDelete(c *gin.Context, app *ServerApp) {
	if !appCloudVMRequireWrite(c) {
		return
	}
	db := cloudVMDB(app)
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "需要 MySQL"})
		return
	}
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	ctx, cancel := context.WithTimeout(c.Request.Context(), 60*time.Second)
	defer cancel()
	var r cloudVMRow
	err := db.QueryRowContext(ctx, `SELECT namespace, config_json FROM kubebt_app_cloud_vm_instances WHERE id=?`, id).Scan(&r.Namespace, &r.ConfigJSON)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "不存在"})
		return
	}
	var st CloudVMStored
	_ = json.Unmarshal([]byte(r.ConfigJSON), &st)
	k8s := app.K8s()
	if k8s != nil {
		prop := metav1.DeletePropagationForeground
		fg := metav1.DeleteOptions{PropagationPolicy: &prop}
		if dn := strings.TrimSpace(st.DeploymentName); dn != "" {
			_ = k8s.AppsV1().Deployments(r.Namespace).Delete(ctx, dn, fg)
		}
		if sn := strings.TrimSpace(st.ServiceName); sn != "" {
			_ = k8s.CoreV1().Services(r.Namespace).Delete(ctx, sn, metav1.DeleteOptions{})
		}
		if dn := strings.TrimSpace(st.DeploymentName); dn != "" {
			_ = k8s.CoreV1().Services(r.Namespace).Delete(ctx, cloudVMHysteria2ServiceName(dn), metav1.DeleteOptions{})
		}
		if pn := strings.TrimSpace(st.PVCName); pn != "" {
			_ = k8s.CoreV1().PersistentVolumeClaims(r.Namespace).Delete(ctx, pn, metav1.DeleteOptions{})
		}
		if sec := strings.TrimSpace(st.SecretName); sec != "" {
			_ = k8s.CoreV1().Secrets(r.Namespace).Delete(ctx, sec, metav1.DeleteOptions{})
		}
	}
	_, _ = db.ExecContext(ctx, `DELETE FROM kubebt_app_cloud_vm_instances WHERE id=?`, id)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func randomCloudVMRootPassword() string {
	const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, 16)
	_, err := crand.Read(b)
	if err != nil {
		return fmt.Sprintf("pw%d%d", time.Now().UnixNano(), time.Now().Unix()%100000)
	}
	out := make([]byte, 16)
	for i := range out {
		out[i] = letters[int(b[i])%len(letters)]
	}
	return string(out)
}

// handleCloudVMResetRootPassword POST /instances/:id/reset-root-password — 生成新 root 密码、更新 Secret 与库中密文并滚动重启 Deployment。
func handleCloudVMResetRootPassword(c *gin.Context, app *ServerApp) {
	if !appCloudVMRequireWrite(c) {
		return
	}
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	if id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效 id"})
		return
	}
	k8s := app.K8s()
	if k8s == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "K8s 未连接"})
		return
	}
	db := cloudVMDB(app)
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "需要 MySQL"})
		return
	}
	key, kerr := sshEncryptionKey(app.Cfg())
	if kerr != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "加密密钥: " + kerr.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 90*time.Second)
	defer cancel()
	var r cloudVMRow
	err := db.QueryRowContext(ctx, `SELECT id, name, namespace, config_json FROM kubebt_app_cloud_vm_instances WHERE id=?`, id).Scan(&r.ID, &r.Name, &r.Namespace, &r.ConfigJSON)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "不存在"})
		return
	}
	var st CloudVMStored
	if err := json.Unmarshal([]byte(r.ConfigJSON), &st); err != nil {
		RespondAPIError500(c, "配置解析失败")
		return
	}
	newPlain := randomCloudVMRootPassword()
	pwEnc, err := encryptSecret(key, newPlain)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	sec, err := k8s.CoreV1().Secrets(r.Namespace).Get(ctx, st.SecretName, metav1.GetOptions{})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "读取 Secret: " + err.Error()})
		return
	}
	if sec.Data == nil {
		sec.Data = map[string][]byte{}
	}
	sec.Data["root-password"] = []byte(newPlain)
	if _, err := k8s.CoreV1().Secrets(r.Namespace).Update(ctx, sec, metav1.UpdateOptions{}); err != nil {
		RespondAPIError500(c, "更新 Secret: " + err.Error())
		return
	}
	st.RootPasswordEnc = pwEnc
	blob, err := json.Marshal(st)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	if _, err := db.ExecContext(ctx, `UPDATE kubebt_app_cloud_vm_instances SET config_json=? WHERE id=?`, string(blob), id); err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	boot := loadCloudVMBootstrap(app.PlatformKV())
	fullInit := composeCloudVMUserInitScript(st, boot)
	if len(st.Command) == 0 {
		dep := buildCloudVMDeployment(r.Namespace, st.DeploymentName, st.SecretName, st.PVCName, st.Image, st.CPURequest, st.CPULimit, st.MemRequest, st.MemLimit, st.Env, st.Command, st.Args, fullInit, id, st.Software)
		if err := upsertDeployment(ctx, k8s, dep); err != nil {
			RespondAPIError500(c, "更新 Deployment: " + err.Error())
			return
		}
	} else {
		if err := cloudVMTriggerRolloutRestart(ctx, k8s, r, &st); err != nil {
			RespondAPIError500(c, "滚动重启 Deployment: " + err.Error())
			return
		}
	}
	SetAuditDetail(c, "重置云主机 root 密码 "+r.Name)
	c.JSON(http.StatusOK, gin.H{
		"ok":          true,
		"newPassword": newPlain,
		"message":     "新密码已写入 Secret 并已触发滚动重启；Pod 就绪后请用新密码连接。环境变量 POD_NAME 与 PS1 在登录 shell 中可用。",
	})
}

// handleCloudVMMetrics 返回 Prometheus 查询模板与 Pod 标签（需集群监控与 cAdvisor 指标）。
func handleCloudVMMetrics(c *gin.Context, app *ServerApp) {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	db := cloudVMDB(app)
	if db == nil {
		c.JSON(http.StatusOK, gin.H{"available": false})
		return
	}
	var ns, cfgj string
	err := db.QueryRow(`SELECT namespace, config_json FROM kubebt_app_cloud_vm_instances WHERE id=?`, id).Scan(&ns, &cfgj)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "不存在"})
		return
	}
	var st CloudVMStored
	_ = json.Unmarshal([]byte(cfgj), &st)
	cfg := app.Cfg()
	prom := strings.TrimSpace(GetPrometheusURLForScope(cfg, "k8s"))
	if prom == "" {
		c.JSON(http.StatusOK, gin.H{"available": false, "hint": "未配置 Prometheus URL（运行时 prometheusUrlK8s）"})
		return
	}
	podRe := st.DeploymentName + "-[a-z0-9]+-[a-z0-9]{5}"
	c.JSON(http.StatusOK, gin.H{
		"available":      true,
		"namespace":      ns,
		"deploymentName": st.DeploymentName,
		"prometheusUrl":  prom,
		"podRegex":       podRe,
		"queries": gin.H{
			"cpu":    fmt.Sprintf(`sum(rate(container_cpu_usage_seconds_total{namespace=%q,pod=~%q,container!=""}[2m]))`, ns, podRe),
			"memory": fmt.Sprintf(`sum(container_memory_working_set_bytes{namespace=%q,pod=~%q,container!=""})`, ns, podRe),
			"netRx":  fmt.Sprintf(`sum(rate(container_network_receive_bytes_total{namespace=%q,pod=~%q}[2m]))`, ns, podRe),
			"netTx":  fmt.Sprintf(`sum(rate(container_network_transmit_bytes_total{namespace=%q,pod=~%q}[2m]))`, ns, podRe),
		},
	})
}

package internal

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	corev1 "k8s.io/api/core/v1"
	rbacv1 "k8s.io/api/rbac/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

const k8sDNSMaxNameLen = 253

// globalReadUserOpts 创建「全局只读」SA + CRB + token Secret 并生成 kubeconfig 的入参（名称须已通过校验）。
type globalReadUserOpts struct {
	Namespace              string
	ServiceAccountName     string
	ClusterRoleName        string
	ClusterRoleBindingName string
	TokenSecretName        string
	EnsureClusterRole      bool
}

func randomHexSuffix(byteLen int) string {
	b := make([]byte, byteLen)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano()%1_000_000_000)
	}
	return hex.EncodeToString(b)
}

// provisionGlobalReadUser 创建资源并返回 JSON 体与 HTTP 状态码（200 或 202）；业务错误返回 err 由调用方映射为 4xx/5xx。
func provisionGlobalReadUser(ctx context.Context, k8s *kubernetes.Clientset, rc *rest.Config, o globalReadUserOpts) (gin.H, int, error) {
	ns := strings.TrimSpace(o.Namespace)
	saName := strings.TrimSpace(o.ServiceAccountName)
	crName := strings.TrimSpace(o.ClusterRoleName)
	crbName := strings.TrimSpace(o.ClusterRoleBindingName)
	secretName := strings.TrimSpace(o.TokenSecretName)

	if _, err := k8s.CoreV1().Namespaces().Get(ctx, ns, metav1.GetOptions{}); err != nil {
		if apierrors.IsNotFound(err) {
			return nil, 0, fmt.Errorf("命名空间不存在: %s", ns)
		}
		return nil, 0, fmt.Errorf("读取命名空间失败: %w", err)
	}

	if o.EnsureClusterRole {
		if err := ensureSuperReaderClusterRole(ctx, k8s, crName); err != nil {
			return nil, 0, fmt.Errorf("创建 ClusterRole %s 失败: %w", crName, err)
		}
	} else {
		if _, err := k8s.RbacV1().ClusterRoles().Get(ctx, crName, metav1.GetOptions{}); err != nil {
			if apierrors.IsNotFound(err) {
				return nil, 0, fmt.Errorf("ClusterRole %s 不存在，请开启自动创建角色或预先创建", crName)
			}
			return nil, 0, fmt.Errorf("读取 ClusterRole 失败: %w", err)
		}
	}

	sa := &corev1.ServiceAccount{
		ObjectMeta: metav1.ObjectMeta{Name: saName, Namespace: ns},
	}
	if _, err := k8s.CoreV1().ServiceAccounts(ns).Create(ctx, sa, metav1.CreateOptions{}); err != nil && !apierrors.IsAlreadyExists(err) {
		return nil, 0, fmt.Errorf("创建 ServiceAccount 失败: %w", err)
	}

	crb := &rbacv1.ClusterRoleBinding{
		ObjectMeta: metav1.ObjectMeta{Name: crbName},
		RoleRef: rbacv1.RoleRef{
			APIGroup: "rbac.authorization.k8s.io",
			Kind:     "ClusterRole",
			Name:     crName,
		},
		Subjects: []rbacv1.Subject{
			{Kind: "ServiceAccount", Name: saName, Namespace: ns},
		},
	}
	if _, err := k8s.RbacV1().ClusterRoleBindings().Create(ctx, crb, metav1.CreateOptions{}); err != nil {
		if !apierrors.IsAlreadyExists(err) {
			return nil, 0, fmt.Errorf("创建 ClusterRoleBinding 失败: %w", err)
		}
		existing, gerr := k8s.RbacV1().ClusterRoleBindings().Get(ctx, crbName, metav1.GetOptions{})
		if gerr != nil {
			return nil, 0, fmt.Errorf("ClusterRoleBinding 已存在但无法读取: %w", gerr)
		}
		ok := existing.RoleRef.APIGroup == crb.RoleRef.APIGroup &&
			existing.RoleRef.Kind == crb.RoleRef.Kind &&
			existing.RoleRef.Name == crb.RoleRef.Name &&
			len(existing.Subjects) == 1 &&
			existing.Subjects[0].Kind == "ServiceAccount" &&
			existing.Subjects[0].Name == saName &&
			existing.Subjects[0].Namespace == ns
		if !ok {
			return nil, 0, fmt.Errorf("ClusterRoleBinding %s 已存在且与本次请求不一致，请更换名称", crbName)
		}
	}

	secret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      secretName,
			Namespace: ns,
			Annotations: map[string]string{
				corev1.ServiceAccountNameKey: saName,
			},
		},
		Type: corev1.SecretTypeServiceAccountToken,
	}
	if _, err := k8s.CoreV1().Secrets(ns).Create(ctx, secret, metav1.CreateOptions{}); err != nil {
		if !apierrors.IsAlreadyExists(err) {
			return nil, 0, fmt.Errorf("创建 token Secret 失败: %w", err)
		}
	}

	token, err := waitServiceAccountToken(ctx, k8s, ns, secretName, 45*time.Second)
	if err != nil {
		return gin.H{
			"ok":                 false,
			"warning":            "资源已创建，但尚未从 Secret 读取到 token: " + err.Error(),
			"namespace":          ns,
			"serviceAccount":     saName,
			"clusterRole":        crName,
			"clusterRoleBinding": crbName,
			"tokenSecret":        secretName,
			"kubeconfig":         "",
		}, http.StatusAccepted, nil
	}

	caB64, insecure, err := restConfigToClusterTLS(rc)
	if err != nil {
		return nil, 0, fmt.Errorf("构建 kubeconfig 集群 TLS 失败: %w", err)
	}
	kubeYAML := buildKubeconfigYAML("cluster", rc.Host, saName, token, caB64, insecure)

	return gin.H{
		"ok":                    true,
		"namespace":             ns,
		"serviceAccount":        saName,
		"clusterRole":           crName,
		"clusterRoleBinding":    crbName,
		"tokenSecret":           secretName,
		"kubeconfig":            kubeYAML,
		"server":                rc.Host,
		"insecureSkipTLSVerify": insecure,
	}, http.StatusOK, nil
}

type globalReadUserRequest struct {
	Namespace              string `json:"namespace"`
	ServiceAccountName     string `json:"serviceAccountName"`
	ClusterRoleName        string `json:"clusterRoleName"`
	ClusterRoleBindingName string `json:"clusterRoleBindingName"`
	TokenSecretName        string `json:"tokenSecretName"`
	EnsureClusterRole      *bool  `json:"ensureClusterRole"`
}

func defaultGlobalReadUserReq(body *globalReadUserRequest) {
	if strings.TrimSpace(body.Namespace) == "" {
		body.Namespace = "kube-system"
	}
	if strings.TrimSpace(body.ClusterRoleName) == "" {
		body.ClusterRoleName = "super-reader"
	}
	if body.EnsureClusterRole == nil {
		t := true
		body.EnsureClusterRole = &t
	}
}

func validateK8sMetaName(kind, name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return fmt.Errorf("%s 名称不能为空", kind)
	}
	if len(name) > k8sDNSMaxNameLen {
		return fmt.Errorf("%s 名称过长", kind)
	}
	for _, r := range name {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' {
			continue
		}
		return fmt.Errorf("%s 名称仅允许小写字母、数字与连字符", kind)
	}
	return nil
}

func superReaderPolicyRules() []rbacv1.PolicyRule {
	return []rbacv1.PolicyRule{
		{
			APIGroups: []string{"*"},
			Resources: []string{"*"},
			Verbs:     []string{"get", "list", "watch"},
		},
	}
}

func ensureSuperReaderClusterRole(ctx context.Context, k8s *kubernetes.Clientset, name string) error {
	cr := &rbacv1.ClusterRole{
		ObjectMeta: metav1.ObjectMeta{Name: name},
		Rules:      superReaderPolicyRules(),
	}
	_, err := k8s.RbacV1().ClusterRoles().Create(ctx, cr, metav1.CreateOptions{})
	if err == nil || apierrors.IsAlreadyExists(err) {
		return nil
	}
	return err
}

func restConfigToClusterTLS(rc *rest.Config) (caDataB64 string, insecure bool, err error) {
	if rc.TLSClientConfig.Insecure {
		return "", true, nil
	}
	if len(rc.TLSClientConfig.CAData) > 0 {
		return base64.StdEncoding.EncodeToString(rc.TLSClientConfig.CAData), false, nil
	}
	if rc.TLSClientConfig.CAFile != "" {
		b, e := os.ReadFile(rc.TLSClientConfig.CAFile)
		if e != nil {
			return "", false, fmt.Errorf("读取 CA 文件: %w", e)
		}
		return base64.StdEncoding.EncodeToString(b), false, nil
	}
	// in-cluster 常见仅有 CAData；若皆空则仅能 insecure（不推荐）
	return "", true, nil
}

func buildKubeconfigYAML(clusterName, server, userName, token, caB64 string, insecure bool) string {
	var clusterBlock strings.Builder
	clusterBlock.WriteString("    server: ")
	clusterBlock.WriteString(server)
	clusterBlock.WriteString("\n")
	if insecure {
		clusterBlock.WriteString("    insecure-skip-tls-verify: true\n")
	} else if caB64 != "" {
		clusterBlock.WriteString("    certificate-authority-data: ")
		clusterBlock.WriteString(caB64)
		clusterBlock.WriteString("\n")
	}
	return fmt.Sprintf(`apiVersion: v1
kind: Config
clusters:
- cluster:
%s  name: %s
contexts:
- context:
    cluster: %s
    user: %s
  name: %s
current-context: %s
users:
- name: %s
  user:
    token: %s
`, clusterBlock.String(), clusterName, clusterName, userName, clusterName, clusterName, userName, token)
}

func waitServiceAccountToken(ctx context.Context, k8s *kubernetes.Clientset, ns, secretName string, maxWait time.Duration) (string, error) {
	deadline := time.Now().Add(maxWait)
	var lastErr error
	for time.Now().Before(deadline) {
		sec, err := k8s.CoreV1().Secrets(ns).Get(ctx, secretName, metav1.GetOptions{})
		if err != nil {
			lastErr = err
			time.Sleep(200 * time.Millisecond)
			continue
		}
		if tok := sec.Data[corev1.ServiceAccountTokenKey]; len(tok) > 0 {
			return string(tok), nil
		}
		lastErr = fmt.Errorf("Secret 已存在但 token 尚未下发，请稍后重试")
		time.Sleep(200 * time.Millisecond)
	}
	if lastErr != nil {
		return "", lastErr
	}
	return "", fmt.Errorf("等待 ServiceAccount token 超时")
}

// handleK8sRBACGlobalReadUserCreate 创建全局只读 ClusterRole（可选）+ ServiceAccount + ClusterRoleBinding + token Secret，并返回 kubeconfig 正文（仅管理员）。
func handleK8sRBACGlobalReadUserCreate(c *gin.Context, k8s *kubernetes.Clientset, rc *rest.Config) {
	if !GuardK8sREST(c, k8s, rc) {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 90*time.Second)
	defer cancel()

	var body globalReadUserRequest
	if err := json.NewDecoder(c.Request.Body).Decode(&body); err != nil && err.Error() != "EOF" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求体须为 JSON"})
		return
	}
	defaultGlobalReadUserReq(&body)
	ns := strings.TrimSpace(body.Namespace)
	saName := strings.TrimSpace(body.ServiceAccountName)
	crName := strings.TrimSpace(body.ClusterRoleName)
	crbName := strings.TrimSpace(body.ClusterRoleBindingName)
	secretName := strings.TrimSpace(body.TokenSecretName)

	if saName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "serviceAccountName 必填"})
		return
	}
	for _, v := range []struct{ kind, name string }{
		{"命名空间", ns},
		{"ServiceAccount", saName},
		{"ClusterRole", crName},
	} {
		if err := validateK8sMetaName(v.kind, v.name); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}
	if crbName == "" {
		crbName = fmt.Sprintf("%s-%s-binding", saName, crName)
		if len(crbName) > k8sDNSMaxNameLen {
			crbName = crbName[:k8sDNSMaxNameLen]
		}
	} else if err := validateK8sMetaName("ClusterRoleBinding", crbName); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if secretName == "" {
		secretName = fmt.Sprintf("%s-token", saName)
		if len(secretName) > k8sDNSMaxNameLen {
			secretName = secretName[:k8sDNSMaxNameLen]
		}
	} else if err := validateK8sMetaName("Secret", secretName); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ensureCR := body.EnsureClusterRole == nil || *body.EnsureClusterRole
	resp, st, err := provisionGlobalReadUser(ctx, k8s, rc, globalReadUserOpts{
		Namespace:              ns,
		ServiceAccountName:     saName,
		ClusterRoleName:        crName,
		ClusterRoleBindingName: crbName,
		TokenSecretName:        secretName,
		EnsureClusterRole:      ensureCR,
	})
	if err != nil {
		if strings.Contains(err.Error(), "已存在且与本次请求不一致") {
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
			return
		}
		if strings.HasPrefix(err.Error(), "命名空间不存在") {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if strings.Contains(err.Error(), "ClusterRole") && strings.Contains(err.Error(), "不存在") {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		RespondAPIError500(c, err.Error())
		return
	}
	c.JSON(st, resp)
}

type quickReadonlyUserRequest struct {
	// EnsureSuperReaderClusterRole 为 true（默认）时自动创建 super-reader；为 false 时要求集群已有 ClusterRole super-reader
	EnsureSuperReaderClusterRole *bool `json:"ensureSuperReaderClusterRole"`
	// UseKubeSystem 为 true（默认）在 kube-system 创建；为 false 时在 default 命名空间创建
	UseKubeSystem *bool `json:"useKubeSystem"`
}

// handleK8sRBACQuickReadonlyUserCreate 傻瓜式：自动生成唯一 ServiceAccount 名等，仅需勾选选项（仅管理员）。
func handleK8sRBACQuickReadonlyUserCreate(c *gin.Context, k8s *kubernetes.Clientset, rc *rest.Config) {
	if !GuardK8sREST(c, k8s, rc) {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 90*time.Second)
	defer cancel()

	var body quickReadonlyUserRequest
	_ = json.NewDecoder(c.Request.Body).Decode(&body)
	ensureSuper := body.EnsureSuperReaderClusterRole == nil || *body.EnsureSuperReaderClusterRole
	useKubeSys := body.UseKubeSystem == nil || *body.UseKubeSystem
	ns := "default"
	if useKubeSys {
		ns = "kube-system"
	}

	crName := "super-reader"
	suffix := randomHexSuffix(4)
	base := fmt.Sprintf("kbts-ro-%s", suffix)
	if err := validateK8sMetaName("ServiceAccount", base); err != nil {
		RespondAPIError500(c, "内部生成名称无效: "+err.Error())
		return
	}
	saName := base
	crbName := base + "-super-binding"
	if len(crbName) > k8sDNSMaxNameLen {
		crbName = crbName[:k8sDNSMaxNameLen]
	}
	secretName := base + "-token"
	if len(secretName) > k8sDNSMaxNameLen {
		secretName = secretName[:k8sDNSMaxNameLen]
	}

	resp, st, err := provisionGlobalReadUser(ctx, k8s, rc, globalReadUserOpts{
		Namespace:              ns,
		ServiceAccountName:     saName,
		ClusterRoleName:        crName,
		ClusterRoleBindingName: crbName,
		TokenSecretName:        secretName,
		EnsureClusterRole:      ensureSuper,
	})
	if err != nil {
		if strings.Contains(err.Error(), "已存在且与本次请求不一致") {
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
			return
		}
		if strings.HasPrefix(err.Error(), "命名空间不存在") {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if strings.Contains(err.Error(), "ClusterRole") && strings.Contains(err.Error(), "不存在") {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		RespondAPIError500(c, err.Error())
		return
	}
	h := resp
	h["mode"] = "quick"
	c.JSON(st, h)
}

type saDetailBinding struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace,omitempty"`
	RoleRef   string `json:"roleRef"`
	Subjects  string `json:"subjects"`
}

type saDetailTokenSecret struct {
	Name     string `json:"name"`
	HasToken bool   `json:"hasToken"`
	Age      string `json:"age,omitempty"`
}

// handleK8sRBACServiceAccountDetail 返回指定 ServiceAccount 及关联 ClusterRoleBinding / RoleBinding / token 类 Secret 元数据（不含 token 明文）。
func handleK8sRBACServiceAccountDetail(c *gin.Context, k8s *kubernetes.Clientset) {
	if !GuardK8s(c, k8s) {
		return
	}
	ns := strings.TrimSpace(c.Param("namespace"))
	name := strings.TrimSpace(c.Param("name"))
	if ns == "" || name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "namespace 与 name 必填"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 120*time.Second)
	defer cancel()

	sa, err := k8s.CoreV1().ServiceAccounts(ns).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		if apierrors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "ServiceAccount 不存在"})
			return
		}
		RespondAPIError500(c, fmt.Sprintf("读取 ServiceAccount 失败: %v", err))
		return
	}

	var crbs []saDetailBinding
	if list, err := k8s.RbacV1().ClusterRoleBindings().List(ctx, metav1.ListOptions{}); err == nil {
		for _, b := range list.Items {
			for _, sub := range b.Subjects {
				if sub.Kind == rbacv1.ServiceAccountKind && sub.Name == name && sub.Namespace == ns {
					crbs = append(crbs, saDetailBinding{
						Name:     b.Name,
						RoleRef:  formatRoleRef(&b.RoleRef),
						Subjects: formatSubjects(b.Subjects),
					})
					break
				}
			}
		}
	}

	var rbs []saDetailBinding
	if list, err := k8s.RbacV1().RoleBindings(ns).List(ctx, metav1.ListOptions{}); err == nil {
		for _, b := range list.Items {
			for _, sub := range b.Subjects {
				if sub.Kind == rbacv1.ServiceAccountKind && sub.Name == name && sub.Namespace == ns {
					rbs = append(rbs, saDetailBinding{
						Name:      b.Name,
						Namespace: b.Namespace,
						RoleRef:   formatRoleRef(&b.RoleRef),
						Subjects:  formatSubjects(b.Subjects),
					})
					break
				}
			}
		}
	}

	var tokenSecrets []saDetailTokenSecret
	if sl, err := k8s.CoreV1().Secrets(ns).List(ctx, metav1.ListOptions{}); err == nil {
		for _, sec := range sl.Items {
			if sec.Type != corev1.SecretTypeServiceAccountToken {
				continue
			}
			if sec.Annotations[corev1.ServiceAccountNameKey] != name {
				continue
			}
			tokenSecrets = append(tokenSecrets, saDetailTokenSecret{
				Name:     sec.Name,
				HasToken: len(sec.Data[corev1.ServiceAccountTokenKey]) > 0,
				Age:      sec.CreationTimestamp.Time.Format(time.RFC3339),
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"serviceAccount": gin.H{
			"namespace":        sa.Namespace,
			"name":             sa.Name,
			"uid":              string(sa.UID),
			"createdAt":        sa.CreationTimestamp.Time.Format(time.RFC3339),
			"labels":           sa.Labels,
			"annotations":      sa.Annotations,
			"secrets":          sa.Secrets,
			"imagePullSecrets": sa.ImagePullSecrets,
		},
		"clusterRoleBindings": crbs,
		"roleBindings":        rbs,
		"tokenSecrets":        tokenSecrets,
	})
}

package internal

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	rbacv1 "k8s.io/api/rbac/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

func handleK8sRBACOverview(c *gin.Context, k8s *kubernetes.Clientset) {
	if !GuardK8s(c, k8s) {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 120*time.Second)
	defer cancel()

	type crRow struct {
		Name       string `json:"name"`
		RulesCount int    `json:"rulesCount"`
		Age        string `json:"age"`
	}
	type rbRow struct {
		Name      string `json:"name"`
		Namespace string `json:"namespace,omitempty"`
		RoleRef   string `json:"roleRef"`
		Subjects  string `json:"subjects"`
		Age       string `json:"age"`
	}
	type roleRow struct {
		Namespace  string `json:"namespace"`
		Name       string `json:"name"`
		RulesCount int    `json:"rulesCount"`
		Age        string `json:"age"`
	}
	type saRow struct {
		Namespace string `json:"namespace"`
		Name      string `json:"name"`
		Age       string `json:"age"`
	}

	var warnings []string
	clusterRoles := make([]crRow, 0)
	crBindings := make([]rbRow, 0)
	roles := make([]roleRow, 0)
	roleBindings := make([]rbRow, 0)
	serviceAccounts := make([]saRow, 0)

	crList, err := k8s.RbacV1().ClusterRoles().List(ctx, metav1.ListOptions{})
	if err != nil {
		if apierrors.IsForbidden(err) {
			warnings = append(warnings, "无权列出 ClusterRole（缺少对 clusterroles 的 list 权限）")
		} else {
			RespondAPIError500(c, friendlyK8sRBACErr("ClusterRole", err))
			return
		}
	} else {
		for _, r := range crList.Items {
			clusterRoles = append(clusterRoles, crRow{
				Name:       r.Name,
				RulesCount: len(r.Rules),
				Age:        r.CreationTimestamp.Time.Format(time.RFC3339),
			})
		}
	}

	crbList, err := k8s.RbacV1().ClusterRoleBindings().List(ctx, metav1.ListOptions{})
	if err != nil {
		if apierrors.IsForbidden(err) {
			warnings = append(warnings, "无权列出 ClusterRoleBinding")
		} else {
			RespondAPIError500(c, friendlyK8sRBACErr("ClusterRoleBinding", err))
			return
		}
	} else {
		for _, b := range crbList.Items {
			crBindings = append(crBindings, rbRow{
				Name:     b.Name,
				RoleRef:  formatRoleRef(&b.RoleRef),
				Subjects: formatSubjects(b.Subjects),
				Age:      b.CreationTimestamp.Time.Format(time.RFC3339),
			})
		}
	}

	nsList, err := k8s.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
	if err != nil {
		if apierrors.IsForbidden(err) {
			warnings = append(warnings, "无权列出 Namespace，无法展示命名空间内的 Role、RoleBinding、ServiceAccount（可与 kubectl get sa -A 所需权限对比并调整 RBAC）")
			c.JSON(http.StatusOK, gin.H{
				"clusterRoles":         clusterRoles,
				"clusterRoleBindings":  crBindings,
				"roles":                roles,
				"roleBindings":         roleBindings,
				"serviceAccounts":      serviceAccounts,
				"warnings":             warnings,
			})
			return
		}
		RespondAPIError500(c, friendlyK8sRBACErr("Namespace", err))
		return
	}

	for _, ns := range nsList.Items {
		nsName := ns.Name

		sal, err := k8s.CoreV1().ServiceAccounts(nsName).List(ctx, metav1.ListOptions{})
		if err != nil {
			if apierrors.IsForbidden(err) {
				warnings = append(warnings, fmt.Sprintf("命名空间 %s：无权列出 ServiceAccount", nsName))
			}
			continue
		}
		for _, sa := range sal.Items {
			serviceAccounts = append(serviceAccounts, saRow{
				Namespace: sa.Namespace,
				Name:      sa.Name,
				Age:       sa.CreationTimestamp.Time.Format(time.RFC3339),
			})
		}

		rl, err := k8s.RbacV1().Roles(nsName).List(ctx, metav1.ListOptions{})
		if err != nil {
			if apierrors.IsForbidden(err) {
				warnings = append(warnings, fmt.Sprintf("命名空间 %s：无权列出 Role", nsName))
			}
			continue
		}
		for _, r := range rl.Items {
			roles = append(roles, roleRow{
				Namespace:  r.Namespace,
				Name:       r.Name,
				RulesCount: len(r.Rules),
				Age:        r.CreationTimestamp.Time.Format(time.RFC3339),
			})
		}

		rbl, err := k8s.RbacV1().RoleBindings(nsName).List(ctx, metav1.ListOptions{})
		if err != nil {
			if apierrors.IsForbidden(err) {
				warnings = append(warnings, fmt.Sprintf("命名空间 %s：无权列出 RoleBinding", nsName))
			}
			continue
		}
		for _, b := range rbl.Items {
			roleBindings = append(roleBindings, rbRow{
				Name:      b.Name,
				Namespace: b.Namespace,
				RoleRef:   formatRoleRef(&b.RoleRef),
				Subjects:  formatSubjects(b.Subjects),
				Age:       b.CreationTimestamp.Time.Format(time.RFC3339),
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"clusterRoles":        clusterRoles,
		"clusterRoleBindings": crBindings,
		"roles":               roles,
		"roleBindings":        roleBindings,
		"serviceAccounts":     serviceAccounts,
		"warnings":            warnings,
	})
}

func friendlyK8sRBACErr(kind string, err error) string {
	if err == nil {
		return ""
	}
	if apierrors.IsForbidden(err) {
		return fmt.Sprintf("无权访问 %s：请为 Dashboard 使用的 ServiceAccount 配置 list 等权限", kind)
	}
	return fmt.Sprintf("列出 %s 失败: %v", kind, err)
}

func formatRoleRef(r *rbacv1.RoleRef) string {
	if r == nil {
		return "—"
	}
	return fmt.Sprintf("%s/%s", r.Kind, r.Name)
}

func formatSubjects(subs []rbacv1.Subject) string {
	if len(subs) == 0 {
		return "—"
	}
	parts := make([]string, 0, len(subs))
	for _, s := range subs {
		ns := s.Namespace
		if ns != "" {
			parts = append(parts, fmt.Sprintf("%s:%s/%s", s.Kind, ns, s.Name))
		} else {
			parts = append(parts, fmt.Sprintf("%s:%s", s.Kind, s.Name))
		}
	}
	out := ""
	for i, p := range parts {
		if i > 0 {
			out += ", "
		}
		out += p
	}
	return out
}

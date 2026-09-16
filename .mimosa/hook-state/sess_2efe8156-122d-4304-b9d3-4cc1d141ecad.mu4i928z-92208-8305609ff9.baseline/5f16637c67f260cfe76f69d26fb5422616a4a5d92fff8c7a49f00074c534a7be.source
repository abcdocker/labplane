package internal

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// GET /api/k8s/object-revisions?namespace=&kind=&name=
func handleK8sObjectRevisionsList(c *gin.Context, app *ServerApp) {
	k8s := app.K8s()
	if !GuardK8s(c, k8s) {
		return
	}
	ns := strings.TrimSpace(c.Query("namespace"))
	kind := strings.TrimSpace(c.Query("kind"))
	name := strings.TrimSpace(c.Query("name"))
	if ns == "" || kind == "" || name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "需要 query: namespace, kind, name"})
		return
	}
	list, err := K8sListObjectRevisionMeta(app, ns, kind, name)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	if list == nil {
		list = []K8sObjectRevisionMeta{}
	}
	c.JSON(http.StatusOK, gin.H{"revisions": list})
}

// GET /api/k8s/object-revisions/yaml?namespace=&kind=&name&id=
func handleK8sObjectRevisionYAML(c *gin.Context, app *ServerApp) {
	k8s := app.K8s()
	if !GuardK8s(c, k8s) {
		return
	}
	ns := strings.TrimSpace(c.Query("namespace"))
	kind := strings.TrimSpace(c.Query("kind"))
	name := strings.TrimSpace(c.Query("name"))
	id := strings.TrimSpace(c.Query("id"))
	if ns == "" || kind == "" || name == "" || id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "需要 query: namespace, kind, name, id"})
		return
	}
	yamlStr, meta, err := K8sGetObjectRevisionYAML(app, ns, kind, name, id)
	if err != nil {
		if errors.Is(err, ErrK8sRevisionNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "未找到该修订"})
			return
		}
		RespondAPIError500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"revision": meta, "yaml": yamlStr})
}

// GET /api/k8s/object-revisions/diff?namespace=&kind=&name&leftId=&rightId=
func handleK8sObjectRevisionDiff(c *gin.Context, app *ServerApp) {
	k8s := app.K8s()
	if !GuardK8s(c, k8s) {
		return
	}
	ns := strings.TrimSpace(c.Query("namespace"))
	kind := strings.TrimSpace(c.Query("kind"))
	name := strings.TrimSpace(c.Query("name"))
	leftID := strings.TrimSpace(c.Query("leftId"))
	rightID := strings.TrimSpace(c.Query("rightId"))
	if ns == "" || kind == "" || name == "" || leftID == "" || rightID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "需要 query: namespace, kind, name, leftId, rightId"})
		return
	}
	leftYAML, leftMeta, err := K8sGetObjectRevisionYAML(app, ns, kind, name, leftID)
	if err != nil {
		if errors.Is(err, ErrK8sRevisionNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "未找到左侧修订"})
			return
		}
		RespondAPIError500(c, err.Error())
		return
	}
	rightYAML, rightMeta, err := K8sGetObjectRevisionYAML(app, ns, kind, name, rightID)
	if err != nil {
		if errors.Is(err, ErrK8sRevisionNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "未找到右侧修订"})
			return
		}
		RespondAPIError500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"left":        leftMeta,
		"right":       rightMeta,
		"leftYaml":    leftYAML,
		"rightYaml":   rightYAML,
	})
}

type k8sObjectRevisionRollbackBody struct {
	Namespace  string `json:"namespace"`
	Kind       string `json:"kind"`
	Name       string `json:"name"`
	RevisionID string `json:"revisionId"`
}

// POST /api/k8s/object-revisions/rollback  body: namespace, kind, name, revisionId
func handleK8sObjectRevisionRollback(c *gin.Context, app *ServerApp) {
	k8s := app.K8s()
	if !GuardK8s(c, k8s) {
		return
	}
	var body k8sObjectRevisionRollbackBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数解析失败: " + err.Error()})
		return
	}
	ns := strings.TrimSpace(body.Namespace)
	kind := strings.TrimSpace(body.Kind)
	name := strings.TrimSpace(body.Name)
	id := strings.TrimSpace(body.RevisionID)
	if ns == "" || kind == "" || name == "" || id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "需要 namespace, kind, name, revisionId"})
		return
	}
	yamlStr, _, err := K8sGetObjectRevisionYAML(app, ns, kind, name, id)
	if err != nil {
		if errors.Is(err, ErrK8sRevisionNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "未找到该修订"})
			return
		}
		RespondAPIError500(c, err.Error())
		return
	}
	ctx := context.TODO()
	if err := applyOneKubernetesYAML(ctx, k8s, yamlStr, false); err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	user := dashboardUsernameFromGin(c)
	K8sAppendObjectRevisionsFromYAML(app, user, "rollback", yamlStr)
	SetAuditDetail(c, "K8s 配置回退 "+kind+" "+ns+"/"+name+" revision="+id)
	c.JSON(http.StatusOK, gin.H{"message": "已按选定版本回退并应用"})
}

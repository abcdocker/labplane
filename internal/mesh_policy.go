package internal

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

const meshPolicyHistoryLimit = 5
const kvKeyMeshPolicyHistoryPrefix = "labplane_mesh_policy_history_v1_"
const meshPolicyMaxBytes = 256 << 10

var meshPolicyWriteMu sync.Mutex

type meshPolicyRevision struct {
	Hash    string `json:"hash"`
	Policy  string `json:"policy"`
	SavedAt string `json:"savedAt"`
}

func meshPolicyHash(policy string) string {
	sum := sha256.Sum256([]byte(policy))
	return hex.EncodeToString(sum[:])
}

func loadMeshPolicyHistory(kv PlatformKV, instanceID string) []meshPolicyRevision {
	out, _ := readMeshPolicyHistory(kv, instanceID)
	return out
}

func readMeshPolicyHistory(kv PlatformKV, instanceID string) ([]meshPolicyRevision, error) {
	out := []meshPolicyRevision{}
	if kv == nil {
		return out, nil
	}
	raw, ok := kv.Get(kvKeyMeshPolicyHistoryPrefix + instanceID)
	if !ok {
		return out, nil
	}
	if err := json.Unmarshal([]byte(raw), &out); err != nil || out == nil {
		return nil, fmt.Errorf("策略历史数据已损坏")
	}
	return out, nil
}

func saveMeshPolicyRevision(kv PlatformKV, instanceID string, rev meshPolicyRevision) error {
	if kv == nil {
		return nil
	}
	if rev.Hash == "" {
		rev.Hash = meshPolicyHash(rev.Policy)
	}
	if rev.SavedAt == "" {
		rev.SavedAt = time.Now().UTC().Format(time.RFC3339)
	}
	old, err := readMeshPolicyHistory(kv, instanceID)
	if err != nil {
		return err
	}
	out := []meshPolicyRevision{rev}
	for _, item := range old {
		if strings.EqualFold(item.Hash, rev.Hash) {
			continue
		}
		out = append(out, item)
		if len(out) >= meshPolicyHistoryLimit {
			break
		}
	}
	raw, err := json.Marshal(out)
	if err != nil {
		return err
	}
	return kv.Set(kvKeyMeshPolicyHistoryPrefix+instanceID, string(raw))
}

func meshPolicyCurrent(ctx context.Context, cli *headscaleClient) (HSControlPolicy, error) {
	current, err := cli.GetPolicy(ctx)
	if err != nil && strings.Contains(strings.ToLower(err.Error()), "policy not found") {
		return HSControlPolicy{}, nil
	}
	return current, err
}

func handleMeshPolicyGet(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		cli, _, ok, err := meshClientFor(app, c.Param("id"))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "实例不存在"})
			return
		}
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
		defer cancel()
		current, err := meshPolicyCurrent(ctx, cli)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}
		history, err := readMeshPolicyHistory(app.PlatformKV(), c.Param("id"))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"policy": current.Policy, "updatedAt": current.UpdatedAt, "hash": meshPolicyHash(current.Policy), "history": history})
	}
}

func handleMeshPolicyPut(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body struct {
			Policy   string `json:"policy"`
			BaseHash string `json:"baseHash"`
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, meshPolicyMaxBytes+1024)
		if err := c.ShouldBindJSON(&body); err != nil || strings.TrimSpace(body.Policy) == "" || len(body.Policy) > meshPolicyMaxBytes {
			c.JSON(http.StatusBadRequest, gin.H{"error": "策略正文无效或超过 256 KiB"})
			return
		}
		if raw, err := hex.DecodeString(body.BaseHash); err != nil || len(raw) != sha256.Size {
			c.JSON(http.StatusBadRequest, gin.H{"error": "缺少有效的当前版本标识，请刷新策略"})
			return
		}
		cli, _, ok, err := meshClientFor(app, c.Param("id"))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "实例不存在"})
			return
		}
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		meshPolicyWriteMu.Lock()
		defer meshPolicyWriteMu.Unlock()
		ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
		defer cancel()
		current, err := meshPolicyCurrent(ctx, cli)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}
		if meshPolicyHash(current.Policy) != strings.ToLower(body.BaseHash) {
			c.JSON(http.StatusConflict, gin.H{"error": "策略已被其他操作修改，请刷新后重新核对", "hash": meshPolicyHash(current.Policy)})
			return
		}
		if current.Policy == body.Policy {
			c.JSON(http.StatusOK, gin.H{"policy": current.Policy, "hash": body.BaseHash, "unchanged": true})
			return
		}
		if len(current.Policy) > meshPolicyMaxBytes {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "当前策略超过 256 KiB，无法保存回滚版本；本次更新已停止"})
			return
		}
		if current.Policy != "" {
			if err := saveMeshPolicyRevision(app.PlatformKV(), c.Param("id"), meshPolicyRevision{Policy: current.Policy}); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("保存回滚版本失败: %v", err)})
				return
			}
		}
		_, err = cli.SetPolicy(ctx, body.Policy)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "Headscale 拒绝策略更新；请检查 HuJSON 内容及 policy.mode=database：" + err.Error()})
			return
		}
		applied, err := meshPolicyCurrent(ctx, cli)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "策略已提交，但无法读回校验，请刷新后确认: " + err.Error()})
			return
		}
		if applied.Policy == "" {
			c.JSON(http.StatusBadGateway, gin.H{"error": "策略已提交，但读回内容为空，请刷新后确认"})
			return
		}
		SetAuditDetail(c, fmt.Sprintf("Headscale 策略更新 instance=%s %s→%s", c.Param("id"), meshPolicyHash(current.Policy)[:12], meshPolicyHash(applied.Policy)[:12]))
		c.JSON(http.StatusOK, gin.H{"policy": applied.Policy, "updatedAt": applied.UpdatedAt, "hash": meshPolicyHash(applied.Policy)})
	}
}

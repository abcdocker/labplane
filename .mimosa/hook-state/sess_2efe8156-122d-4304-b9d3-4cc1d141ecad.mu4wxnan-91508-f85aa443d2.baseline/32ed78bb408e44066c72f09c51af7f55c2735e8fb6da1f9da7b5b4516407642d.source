package internal

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"
	mathrand "math/rand"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

const (
	cloudVMSSHMaxFailsBeforeCaptcha = 3
	cloudVMSSHMaxEvents           = 200
	captchaTTL                    = 5 * time.Minute
)

// cloudVMSSHSecurityEvent 云主机 SSH 密码错误过多等安全事件（进程内环形，重启清空）。
type cloudVMSSHSecurityEvent struct {
	Ts           string `json:"ts"`
	Namespace    string `json:"namespace"`
	PodName      string `json:"podName"`
	InstanceID   int64  `json:"instanceId"`
	PlatformUser string `json:"platformUser"`
	SSHUser      string `json:"sshUser"`
	VisitorIP    string `json:"visitorIp"`
	PlatformIP   string `json:"platformIp"`
	Message      string `json:"message"`
}

type cloudVMSSHCaptchaEntry struct {
	Answer  string
	Expires time.Time
}

var (
	cloudVMSSHSecMu   sync.Mutex
	cloudVMSSHEvents  []cloudVMSSHSecurityEvent
	cloudVMSSHFailMu  sync.Mutex
	cloudVMSSHFailMap map[string]int
	cloudVMSSHCapMu   sync.Mutex
	cloudVMSSHCapMap  map[string]cloudVMSSHCaptchaEntry
)

func cloudVMSSHFailKey(instanceID int64, platformUser, visitorIP string) string {
	return fmt.Sprintf("%d|%s|%s", instanceID, platformUser, visitorIP)
}

func getCloudVMSSHFailCount(instanceID int64, platformUser, visitorIP string) int {
	cloudVMSSHFailMu.Lock()
	defer cloudVMSSHFailMu.Unlock()
	if cloudVMSSHFailMap == nil {
		return 0
	}
	return cloudVMSSHFailMap[cloudVMSSHFailKey(instanceID, platformUser, visitorIP)]
}

func clearCloudVMSSHFailCount(instanceID int64, platformUser, visitorIP string) {
	cloudVMSSHFailMu.Lock()
	defer cloudVMSSHFailMu.Unlock()
	if cloudVMSSHFailMap == nil {
		return
	}
	delete(cloudVMSSHFailMap, cloudVMSSHFailKey(instanceID, platformUser, visitorIP))
}

func incrCloudVMSSHFailCount(instanceID int64, platformUser, visitorIP string) int {
	cloudVMSSHFailMu.Lock()
	defer cloudVMSSHFailMu.Unlock()
	if cloudVMSSHFailMap == nil {
		cloudVMSSHFailMap = make(map[string]int)
	}
	k := cloudVMSSHFailKey(instanceID, platformUser, visitorIP)
	cloudVMSSHFailMap[k]++
	return cloudVMSSHFailMap[k]
}

func recordCloudVMSSHSecurityEvent(ev cloudVMSSHSecurityEvent) {
	cloudVMSSHSecMu.Lock()
	defer cloudVMSSHSecMu.Unlock()
	if ev.Ts == "" {
		ev.Ts = time.Now().Format(time.RFC3339)
	}
	cloudVMSSHEvents = append([]cloudVMSSHSecurityEvent{ev}, cloudVMSSHEvents...)
	if len(cloudVMSSHEvents) > cloudVMSSHMaxEvents {
		cloudVMSSHEvents = cloudVMSSHEvents[:cloudVMSSHMaxEvents]
	}
}

func inferPlatformIP(c *gin.Context) string {
	if h := strings.TrimSpace(os.Getenv("POD_IP")); h != "" {
		return h
	}
	if h := strings.TrimSpace(os.Getenv("KUBERNETES_SERVICE_HOST")); h != "" {
		return h
	}
	return strings.TrimSpace(c.Request.Host)
}

func isSSHAuthFailure(err error) bool {
	if err == nil {
		return false
	}
	s := strings.ToLower(err.Error())
	if strings.Contains(s, "unable to authenticate") {
		return true
	}
	if strings.Contains(s, "authentication failed") {
		return true
	}
	if strings.Contains(s, "permission denied") {
		return true
	}
	if strings.Contains(s, "password") && strings.Contains(s, "incorrect") {
		return true
	}
	return false
}

func writeCloudVMSSHAuthJSON(conn *websocket.Conn, payload map[string]interface{}) {
	b, _ := json.Marshal(payload)
	_ = conn.WriteMessage(websocket.TextMessage, b)
}

func writeCloudVMSSHAuthError(conn *websocket.Conn, code, message string, needCaptcha bool, failCount int) {
	writeCloudVMSSHAuthJSON(conn, map[string]interface{}{
		"type":        "ssh_error",
		"code":        code,
		"message":     message,
		"needCaptcha": needCaptcha,
		"failCount":   failCount,
	})
}

func captchaStoreKey(instanceID int64, captchaID string) string {
	return fmt.Sprintf("%d:%s", instanceID, captchaID)
}

func randIntRangeFallback(min, max int) int {
	if min > max {
		min, max = max, min
	}
	n, err := rand.Int(rand.Reader, big.NewInt(int64(max-min+1)))
	if err == nil && n != nil {
		return int(n.Int64()) + min
	}
	return mathrand.Intn(max-min+1) + min
}

func issueCloudVMSSHCaptcha(instanceID int64) (captchaID, question string) {
	b := make([]byte, 12)
	_, _ = rand.Read(b)
	captchaID = hex.EncodeToString(b)
	ai := randIntRangeFallback(1, 12)
	bi := randIntRangeFallback(1, 12)
	sum := ai + bi
	answer := fmt.Sprintf("%d", sum)
	question = fmt.Sprintf("%d + %d = ?", ai, bi)
	cloudVMSSHCapMu.Lock()
	defer cloudVMSSHCapMu.Unlock()
	if cloudVMSSHCapMap == nil {
		cloudVMSSHCapMap = make(map[string]cloudVMSSHCaptchaEntry)
	}
	cloudVMSSHCapMap[captchaStoreKey(instanceID, captchaID)] = cloudVMSSHCaptchaEntry{Answer: answer, Expires: time.Now().Add(captchaTTL)}
	return captchaID, question
}

func validateCloudVMSSHCaptcha(instanceID int64, captchaID, answer string) bool {
	captchaID = strings.TrimSpace(captchaID)
	answer = strings.TrimSpace(answer)
	if captchaID == "" || answer == "" {
		return false
	}
	cloudVMSSHCapMu.Lock()
	defer cloudVMSSHCapMu.Unlock()
	if cloudVMSSHCapMap == nil {
		return false
	}
	k := captchaStoreKey(instanceID, captchaID)
	ent, ok := cloudVMSSHCapMap[k]
	if !ok || time.Now().After(ent.Expires) {
		delete(cloudVMSSHCapMap, k)
		return false
	}
	delete(cloudVMSSHCapMap, k)
	return strings.EqualFold(strings.TrimSpace(ent.Answer), answer)
}

func handleCloudVMSSHCaptcha(c *gin.Context, app *ServerApp) {
	id, err := strconv.ParseInt(strings.TrimSpace(c.Param("id")), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效 id"})
		return
	}
	db := cloudVMDB(app)
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "需要 MySQL"})
		return
	}
	var dummy int
	err = db.QueryRow(`SELECT 1 FROM kubebt_app_cloud_vm_instances WHERE id=? LIMIT 1`, id).Scan(&dummy)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "不存在"})
		return
	}
	cid, q := issueCloudVMSSHCaptcha(id)
	c.JSON(http.StatusOK, gin.H{"captchaId": cid, "question": q})
}

func handleCloudVMSSHSecurityEvents(c *gin.Context, app *ServerApp) {
	if !app.Cfg().DashboardAuthEnabled() {
		c.JSON(http.StatusOK, gin.H{"events": []cloudVMSSHSecurityEvent{}})
		return
	}
	user := dashboardUsernameFromGin(c)
	role, _ := c.Get("dashboardRole")
	roleStr, _ := role.(string)

	cloudVMSSHSecMu.Lock()
	src := append([]cloudVMSSHSecurityEvent(nil), cloudVMSSHEvents...)
	cloudVMSSHSecMu.Unlock()

	out := make([]cloudVMSSHSecurityEvent, 0, len(src))
	for _, ev := range src {
		if roleStr == DashboardRoleAdmin {
			out = append(out, ev)
			continue
		}
		if user != "" && ev.PlatformUser == user {
			out = append(out, ev)
		}
	}
	if len(out) > 50 {
		out = out[:50]
	}
	c.JSON(http.StatusOK, gin.H{"events": out})
}

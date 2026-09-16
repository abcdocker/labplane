package internal

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net"
	"net/http"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/pkg/sftp"
	"github.com/vmware/govmomi"
	"golang.org/x/crypto/ssh"
)

const bastionSftpMaxFileBytes = 32 << 20

func bastionSftpCleanPath(p string) (string, error) {
	p = strings.TrimSpace(p)
	if p == "" {
		return "/", nil
	}
	if !path.IsAbs(p) {
		p = "/" + p
	}
	c := path.Clean(p)
	for _, seg := range strings.Split(c, "/") {
		if seg == ".." {
			return "", errors.New("路径不合法")
		}
	}
	return c, nil
}

type sftpClientMsg struct {
	Op     string `json:"op"`
	Path   string `json:"path"`
	To     string `json:"to"`
	DataB64 string `json:"dataB64"`
	Mode   uint32 `json:"mode"`
}

func bastionVMDialSSHClient(ctx context.Context, app *ServerApp, moref string) (*ssh.Client, error) {
	vc := app.VCenter()
	cfg := app.Cfg()
	if !vc.cfg.vCenterConfigured() {
		return nil, errors.New("vCenter 未配置")
	}
	key, kerr := sshEncryptionKey(cfg)
	var st *SSHVMStored
	if app.SSHStore() != nil && kerr == nil {
		st, _ = app.SSHStore().GetVM(ctx, moref, key)
	}
	if !sshEffectiveReady(ctx, cfg, app.SSHStore(), moref, key) {
		return nil, errors.New("未配置 SSH")
	}
	var guestIP string
	err := vc.WithClientRetry(ctx, func(govClient *govmomi.Client) error {
		var e error
		guestIP, e = vcenterVMPrimaryGuestIP(ctx, govClient, moref)
		return e
	})
	if err != nil {
		return nil, err
	}
	sshCfg, err := buildSSHClientConfigMerged(cfg, st)
	if err != nil {
		return nil, err
	}
	port := cfg.VCenterVMSshPort
	if st != nil && st.Port > 0 {
		port = st.Port
	}
	addr := net.JoinHostPort(guestIP, strconv.Itoa(port))
	return ssh.Dial("tcp", addr, sshCfg)
}

func runBastionSFTPSession(conn *websocket.Conn, sshClient *ssh.Client) {
	defer sshClient.Close()
	sc, err := sftp.NewClient(sshClient)
	if err != nil {
		_ = conn.WriteJSON(gin.H{"type": "error", "message": "SFTP: " + err.Error()})
		return
	}
	defer sc.Close()

	_ = conn.SetReadDeadline(time.Time{})
	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			return
		}
		var msg sftpClientMsg
		if err := json.Unmarshal(data, &msg); err != nil {
			_ = conn.WriteJSON(gin.H{"type": "error", "message": "JSON: " + err.Error()})
			continue
		}
		op := strings.ToLower(strings.TrimSpace(msg.Op))
		switch op {
		case "list", "ls":
			p, e := bastionSftpCleanPath(msg.Path)
			if e != nil {
				_ = conn.WriteJSON(gin.H{"type": "error", "message": e.Error()})
				continue
			}
			entries, e := sc.ReadDir(p)
			if e != nil {
				_ = conn.WriteJSON(gin.H{"type": "error", "message": e.Error()})
				continue
			}
			out := make([]gin.H, 0, len(entries))
			for _, fi := range entries {
				out = append(out, gin.H{
					"name":    fi.Name(),
					"size":    fi.Size(),
					"isDir":   fi.IsDir(),
					"modTime": fi.ModTime().Unix(),
					"mode":    fi.Mode().String(),
				})
			}
			_ = conn.WriteJSON(gin.H{"type": "listed", "path": p, "entries": out})
		case "read", "readfile":
			p, e := bastionSftpCleanPath(msg.Path)
			if e != nil {
				_ = conn.WriteJSON(gin.H{"type": "error", "message": e.Error()})
				continue
			}
			f, e := sc.Open(p)
			if e != nil {
				_ = conn.WriteJSON(gin.H{"type": "error", "message": e.Error()})
				continue
			}
			buf, e := io.ReadAll(io.LimitReader(f, bastionSftpMaxFileBytes+1))
			_ = f.Close()
			if e != nil {
				_ = conn.WriteJSON(gin.H{"type": "error", "message": e.Error()})
				continue
			}
			if len(buf) > bastionSftpMaxFileBytes {
				_ = conn.WriteJSON(gin.H{"type": "error", "message": "文件过大（上限 32MiB）"})
				continue
			}
			_ = conn.WriteJSON(gin.H{"type": "file", "path": p, "dataB64": base64.StdEncoding.EncodeToString(buf)})
		case "write", "writefile":
			p, e := bastionSftpCleanPath(msg.Path)
			if e != nil {
				_ = conn.WriteJSON(gin.H{"type": "error", "message": e.Error()})
				continue
			}
			raw, e := base64.StdEncoding.DecodeString(msg.DataB64)
			if e != nil {
				_ = conn.WriteJSON(gin.H{"type": "error", "message": "dataB64: " + e.Error()})
				continue
			}
			if len(raw) > bastionSftpMaxFileBytes {
				_ = conn.WriteJSON(gin.H{"type": "error", "message": "内容过大"})
				continue
			}
			f, e := sc.Create(p)
			if e != nil {
				_ = conn.WriteJSON(gin.H{"type": "error", "message": e.Error()})
				continue
			}
			_, e = f.Write(raw)
			_ = f.Close()
			if e != nil {
				_ = conn.WriteJSON(gin.H{"type": "error", "message": e.Error()})
				continue
			}
			_ = conn.WriteJSON(gin.H{"type": "written", "path": p})
		case "mkdir":
			p, e := bastionSftpCleanPath(msg.Path)
			if e != nil {
				_ = conn.WriteJSON(gin.H{"type": "error", "message": e.Error()})
				continue
			}
			if e := sc.Mkdir(p); e != nil {
				_ = conn.WriteJSON(gin.H{"type": "error", "message": e.Error()})
				continue
			}
			_ = conn.WriteJSON(gin.H{"type": "ok", "op": "mkdir"})
		case "rm", "remove":
			p, e := bastionSftpCleanPath(msg.Path)
			if e != nil {
				_ = conn.WriteJSON(gin.H{"type": "error", "message": e.Error()})
				continue
			}
			st, e := sc.Stat(p)
			if e != nil {
				_ = conn.WriteJSON(gin.H{"type": "error", "message": e.Error()})
				continue
			}
			if st.IsDir() {
				if e := sc.RemoveDirectory(p); e != nil {
					_ = conn.WriteJSON(gin.H{"type": "error", "message": e.Error()})
					continue
				}
			} else {
				if e := sc.Remove(p); e != nil {
					_ = conn.WriteJSON(gin.H{"type": "error", "message": e.Error()})
					continue
				}
			}
			_ = conn.WriteJSON(gin.H{"type": "ok", "op": "remove"})
		case "rename", "mv":
			from, e := bastionSftpCleanPath(msg.Path)
			if e != nil {
				_ = conn.WriteJSON(gin.H{"type": "error", "message": e.Error()})
				continue
			}
			to, e := bastionSftpCleanPath(msg.To)
			if e != nil {
				_ = conn.WriteJSON(gin.H{"type": "error", "message": e.Error()})
				continue
			}
			if e := sc.Rename(from, to); e != nil {
				_ = conn.WriteJSON(gin.H{"type": "error", "message": e.Error()})
				continue
			}
			_ = conn.WriteJSON(gin.H{"type": "ok", "op": "rename"})
		default:
			_ = conn.WriteJSON(gin.H{"type": "error", "message": "未知 op: " + msg.Op})
		}
	}
}

func handleVCenterVMSFTPWS(c *gin.Context, app *ServerApp) {
	moref := strings.TrimSpace(c.Param("moref"))
	if vcenterBastionAbortIfForbidden(c, app, moref) {
		return
	}
	ctx := c.Request.Context()
	sshClient, err := bastionVMDialSSHClient(ctx, app, moref)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}

	conn, err := execUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("vCenter SFTP WebSocket 升级失败: %v", err)
		sshClient.Close()
		return
	}
	doneKA := make(chan struct{})
	defer close(doneKA)
	startWebSocketBastionKeepalive(conn, doneKA)

	runBastionSFTPSession(conn, sshClient)
}

func handleBastionExtraSFTPWS(c *gin.Context, app *ServerApp) {
	id := strings.TrimSpace(c.Param("id"))
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 id"})
		return
	}
	if vcenterBastionAbortIfForbiddenTarget(c, app, bastionExtraTarget(id)) {
		return
	}
	pol := loadVCenterBastionPolicy(app.PlatformKV())
	h := bastionFindExtraHost(pol, id)
	if h == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "未找到该 extra 主机"})
		return
	}
	cfg := app.Cfg()
	ctx := c.Request.Context()
	key, _ := sshEncryptionKey(cfg)
	store := app.SSHStore()
	sshReady := cfg.vCenterVMSshConfigured()
	if !sshReady && store != nil && len(key) > 0 {
		rec, _ := store.GetVM(ctx, BastionExtraSSHStoreKey(id), key)
		sshReady = rec != nil && rec.hasAuth()
	}
	if !sshReady {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "未配置 SSH"})
		return
	}
	sshClient, err := bastionDialSSHToExtra(ctx, app, id, h)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	conn, err := execUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("堡垒机 extra SFTP WebSocket 升级失败: %v", err)
		sshClient.Close()
		return
	}
	doneKA := make(chan struct{})
	defer close(doneKA)
	startWebSocketBastionKeepalive(conn, doneKA)

	runBastionSFTPSession(conn, sshClient)
}

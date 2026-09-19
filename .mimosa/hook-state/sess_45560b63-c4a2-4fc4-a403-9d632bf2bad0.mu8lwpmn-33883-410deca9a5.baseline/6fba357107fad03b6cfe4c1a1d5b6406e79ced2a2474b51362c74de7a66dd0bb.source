package internal

import (
	"context"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
	"os"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

func sanitizeSFTPPath(p string) string {
	p = strings.TrimSpace(p)
	if p == "" || p == "." {
		return "/"
	}
	if !strings.HasPrefix(p, "/") {
		p = "/" + p
	}
	clean := path.Clean(p)
	if clean == "." {
		return "/"
	}
	if strings.Contains(clean, "..") {
		return "/"
	}
	return clean
}

// openCloudHostSFTP 使用与 SSH 终端相同的拨号与凭据，在 SSH 上启动 sftp 子系统。
func openCloudHostSFTP(ctx context.Context, app *ServerApp, host *CloudHost) (*ssh.Client, *sftp.Client, error) {
	store := app.SSHStore()
	key, kerr := sshEncryptionKey(app.Cfg())
	cloudKey := cloudHostSSHStorageKey(host.ID)
	if !cloudSSHReady(ctx, app.Cfg(), store, cloudKey, key, host) {
		return nil, nil, fmt.Errorf("SSH 未就绪：请配置全局 VCENTER_VM_SSH_* 或在 SSH 页保存该主机凭据")
	}
	var st *SSHVMStored
	if store != nil && kerr == nil {
		st, _ = store.GetVM(ctx, cloudKey, key)
	}
	sshCfg, err := buildSSHClientConfigForCloudHost(app.Cfg(), st, host)
	if err != nil {
		return nil, nil, err
	}
	port := sshDialPortForCloud(st, host)
	addr := net.JoinHostPort(strings.TrimSpace(host.SSHHost), strconv.Itoa(port))
	sshClient, err := ssh.Dial("tcp", addr, sshCfg)
	if err != nil {
		return nil, nil, err
	}
	sftpClient, err := sftp.NewClient(sshClient)
	if err != nil {
		_ = sshClient.Close()
		return nil, nil, err
	}
	return sshClient, sftpClient, nil
}

type sftpEntryJSON struct {
	Name    string `json:"name"`
	Type    string `json:"type"`
	Size    int64  `json:"size"`
	ModTime string `json:"modTime,omitempty"`
}

func entryTypeFromFileInfo(fi os.FileInfo) string {
	m := fi.Mode()
	if m&os.ModeSymlink != 0 {
		return "link"
	}
	if fi.IsDir() {
		return "folder"
	}
	return "file"
}

func handleCloudHostSFTPList(c *gin.Context, app *ServerApp) {
	id := strings.TrimSpace(c.Param("id"))
	ctx := c.Request.Context()

	host, err := getCloudHostByID(app, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	remotePath := sanitizeSFTPPath(c.Query("path"))

	sshClient, sc, err := openCloudHostSFTP(ctx, app, host)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}
	defer func() { _ = sc.Close() }()
	defer func() { _ = sshClient.Close() }()

	infos, err := sc.ReadDir(remotePath)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	out := make([]sftpEntryJSON, 0, len(infos))
	for _, fi := range infos {
		if fi == nil || fi.Name() == "" || fi.Name() == "." || fi.Name() == ".." {
			continue
		}
		item := sftpEntryJSON{
			Name: fi.Name(),
			Type: entryTypeFromFileInfo(fi),
			Size: fi.Size(),
		}
		if t := fi.ModTime(); !t.IsZero() {
			item.ModTime = t.UTC().Format(time.RFC3339)
		}
		out = append(out, item)
	}
	c.JSON(http.StatusOK, gin.H{"path": remotePath, "entries": out})
}

func handleCloudHostSFTPDownload(c *gin.Context, app *ServerApp) {
	id := strings.TrimSpace(c.Param("id"))
	ctx := c.Request.Context()

	host, err := getCloudHostByID(app, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	remotePath := sanitizeSFTPPath(c.Query("path"))
	if remotePath == "/" || strings.HasSuffix(remotePath, "/") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请指定文件路径"})
		return
	}

	sshClient, sc, err := openCloudHostSFTP(ctx, app, host)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}
	defer func() { _ = sc.Close() }()
	defer func() { _ = sshClient.Close() }()

	f, err := sc.Open(remotePath)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	defer f.Close()

	st, err := f.Stat()
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	if st.IsDir() {
		c.JSON(http.StatusBadRequest, gin.H{"error": "路径为目录，请指定文件"})
		return
	}

	base := path.Base(remotePath)
	cd := mime.FormatMediaType("attachment", map[string]string{"filename": base})
	c.Header("Content-Disposition", cd)
	c.Header("Content-Type", "application/octet-stream")
	c.Status(http.StatusOK)
	_, _ = io.Copy(c.Writer, f)
}

const maxSFTPUploadSize = 512 << 20 // 512 MiB

func handleCloudHostSFTPUpload(c *gin.Context, app *ServerApp) {
	id := strings.TrimSpace(c.Param("id"))
	ctx := c.Request.Context()

	host, err := getCloudHostByID(app, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	fh, err := c.FormFile("file")
	if err != nil || fh == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请上传 multipart 字段 file"})
		return
	}
	if fh.Size > maxSFTPUploadSize {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("文件超过上限 %d MiB", maxSFTPUploadSize>>20)})
		return
	}
	dir := sanitizeSFTPPath(c.PostForm("path"))
	baseName := path.Base(fh.Filename)
	if baseName == "" || baseName == "." || baseName == "/" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的文件名"})
		return
	}
	remotePath := sanitizeSFTPPath(path.Join(dir, baseName))

	sshClient, sc, err := openCloudHostSFTP(ctx, app, host)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}
	defer func() { _ = sc.Close() }()
	defer func() { _ = sshClient.Close() }()

	if err := sc.MkdirAll(dir); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "无法创建远程目录: " + err.Error()})
		return
	}

	src, err := fh.Open()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	defer src.Close()

	dst, err := sc.Create(remotePath)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	defer dst.Close()

	lr := io.LimitReader(src, maxSFTPUploadSize+1)
	if _, err := io.Copy(dst, lr); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	SetAuditDetail(c, fmt.Sprintf("云主机「%s」SFTP 上传 %s → %s（约 %d 字节）", host.Name, fh.Filename, remotePath, fh.Size))
	c.JSON(http.StatusOK, gin.H{"ok": true, "path": remotePath})
}

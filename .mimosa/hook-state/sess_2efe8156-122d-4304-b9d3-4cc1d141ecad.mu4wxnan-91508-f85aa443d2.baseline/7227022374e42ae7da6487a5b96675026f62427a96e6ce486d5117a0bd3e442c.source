package internal

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"
)

// scheduleCloudHostBootstrapAfterAdd 添加主机成功后后台尝试安装 node_exporter（受 CLOUD_HOST_AUTO_INSTALL_NODE_EXPORTER 控制）。
func scheduleCloudHostBootstrapAfterAdd(app *ServerApp, h CloudHost) {
	if app == nil || !app.Cfg().CloudHostAutoInstallNodeExporter {
		return
	}
	go func() {
		time.Sleep(2 * time.Second)
		ctx, cancel := context.WithTimeout(context.Background(), 6*time.Minute)
		defer cancel()
		if err := cloudHostMaybeInstallNodeExporter(ctx, app, &h); err != nil {
			log.Printf("公有云主机 %s 自动安装 node_exporter: %v", h.ID, err)
		}
	}()
}

func cloudHostMaybeInstallNodeExporter(ctx context.Context, app *ServerApp, host *CloudHost) error {
	if host == nil {
		return fmt.Errorf("主机为空")
	}
	cfg := app.Cfg()
	key, err := sshEncryptionKey(cfg)
	if err != nil {
		return err
	}
	store := app.SSHStore()
	if store == nil {
		return fmt.Errorf("未配置 SSH 存储")
	}
	cloudKey := cloudHostSSHStorageKey(host.ID)
	client, err := sshDialCloudHostClient(ctx, cfg, store, cloudKey, key, host, "", "")
	if err != nil {
		return err
	}
	defer client.Close()

	ver := strings.TrimSpace(cfg.NodeExporterVersion)
	if ver == "" {
		ver = "1.8.2"
	}
	script := fmt.Sprintf(`set -e
if command -v curl >/dev/null 2>&1; then
  if curl -fsS --connect-timeout 4 --max-time 8 http://127.0.0.1:9100/metrics 2>/dev/null | head -1 >/dev/null; then exit 0; fi
elif command -v wget >/dev/null 2>&1; then
  if wget -qO- -T 8 http://127.0.0.1:9100/metrics 2>/dev/null | head -1 >/dev/null; then exit 0; fi
fi
ARCH=$(uname -m)
case "$ARCH" in
  x86_64|amd64) ARCH=amd64 ;;
  aarch64|arm64) ARCH=arm64 ;;
  *) echo "unsupported arch $ARCH"; exit 1 ;;
esac
VER=%q
TMP=/tmp/node_exporter_${VER}_linux_${ARCH}.tar.gz
if command -v curl >/dev/null 2>&1; then
  curl -fSL "https://github.com/prometheus/node_exporter/releases/download/v${VER}/node_exporter-${VER}.linux-${ARCH}.tar.gz" -o "$TMP"
else
  wget -O "$TMP" "https://github.com/prometheus/node_exporter/releases/download/v${VER}/node_exporter-${VER}.linux-${ARCH}.tar.gz"
fi
cd /tmp
tar xzf "$TMP"
BIN=$(find /tmp/node_exporter-${VER}.linux-${ARCH} -maxdepth 2 -name node_exporter -type f 2>/dev/null | head -1)
if [ -z "$BIN" ]; then BIN=$(find /tmp -maxdepth 4 -name node_exporter -type f 2>/dev/null | head -1); fi
if [ -z "$BIN" ]; then echo "node_exporter binary not found in tarball"; exit 1; fi
chmod +x "$BIN"
if [ "$(id -u)" -eq 0 ]; then
  cp -f "$BIN" /usr/local/bin/node_exporter
  cat >/etc/systemd/system/node_exporter.service <<'UNIT'
[Unit]
Description=Prometheus Node Exporter
After=network-online.target
[Service]
Type=simple
ExecStart=/usr/local/bin/node_exporter
Restart=always
[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
  systemctl enable --now node_exporter
else
  nohup "$BIN" >/tmp/node_exporter.log 2>&1 &
fi
`, ver)

	sess, err := client.NewSession()
	if err != nil {
		return err
	}
	defer sess.Close()
	sess.Stdin = strings.NewReader(script)
	var stderr strings.Builder
	sess.Stderr = &stderr
	if err := sess.Run("/bin/bash -s"); err != nil {
		if stderr.Len() > 0 {
			return fmt.Errorf("%w: %s", err, stderr.String())
		}
		return err
	}
	if stderr.Len() > 0 {
		log.Printf("node_exporter install [%s]: %s", host.ID, strings.TrimSpace(stderr.String()))
	}
	return nil
}

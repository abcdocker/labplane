// macOS 一键加入工具：生成内含 .command 的 ZIP，解压双击「加入节点.command」即可，
// 全程无需终端命令。脚本流程：检测/安装 Tailscale（Homebrew cask 或平台镜像 PKG）
// → 用平台密钥免浏览器加入 → status 验证 → 回传设备名到平台 join-report。
package mesh_joingoing

import (
	"archive/zip"
	"bytes"
	"fmt"
	"strings"
)

// MacTailscalePkgURL 平台镜像的 macOS Tailscale 安装包（与加入页「下载 PKG」链接一致）。
const MacTailscalePkgURL = "https://d.frps.cn/file/tools/headscale/Tailscale-1.98.5-macos.pkg"

// BuildMacZip 生成 macOS 一键加入 ZIP 包。
// .command 条目带 0755 权限位，Finder「打开方式：归档实用工具」解压后保留可执行权限。
func BuildMacZip(cfg ToolConfig) ([]byte, error) {
	if err := macCfgCheck(cfg); err != nil {
		return nil, err
	}

	buf := new(bytes.Buffer)
	zw := zip.NewWriter(buf)

	hdr := &zip.FileHeader{Name: "加入节点.command", Method: zip.Deflate}
	hdr.SetMode(0o755)
	fw, err := zw.CreateHeader(hdr)
	if err != nil {
		return nil, err
	}
	if _, err := fw.Write([]byte(macCommand(cfg))); err != nil {
		return nil, err
	}

	ro, err := zw.Create("使用说明.txt")
	if err != nil {
		return nil, err
	}
	if _, err := ro.Write([]byte(macReadme(cfg))); err != nil {
		return nil, err
	}

	if err := zw.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// macCfgCheck 生成脚本前拒绝含单引号的配置值（脚本以单引号包裹字面量，避免注入）。
func macCfgCheck(cfg ToolConfig) error {
	for k, v := range map[string]string{
		"server": cfg.Server, "authkey": cfg.AuthKey,
		"hostname": cfg.Hostname, "reportUrl": cfg.ReportURL,
	} {
		if strings.Contains(v, "'") {
			return fmt.Errorf("%s 含非法字符（单引号）", k)
		}
	}
	return nil
}

func macCommand(cfg ToolConfig) string {
	r := strings.NewReplacer(
		"__SERVER__", cfg.Server,
		"__AUTHKEY__", cfg.AuthKey,
		"__HOSTNAME__", cfg.Hostname,
		"__REPORTURL__", cfg.ReportURL,
		"__PKGURL__", MacTailscalePkgURL,
	)
	return r.Replace(macCommandTpl)
}

const macCommandTpl = `#!/bin/bash
# ============================================================
#  Tailscale 一键加入工具（macOS · labplane 平台生成）
#  服务器: __SERVER__
#  首次运行若被 macOS 拦截：右键本文件 →「打开」→ 再点「打开」
# ============================================================
set -u

SERVER='__SERVER__'
AUTHKEY='__AUTHKEY__'
HOSTNAME='__HOSTNAME__'
REPORT_URL='__REPORTURL__'
PKG_URL='__PKGURL__'

TS_APP="/Applications/Tailscale.app/Contents/MacOS/Tailscale"

echo "=============================================="
echo "  Tailscale 一键加入（macOS）"
echo "  服务器: $SERVER"
echo "=============================================="

TS=""
if [ -x "$TS_APP" ]; then
  TS="$TS_APP"
elif command -v tailscale >/dev/null 2>&1; then
  TS="$(command -v tailscale)"
fi

if [ -z "$TS" ]; then
  echo "[*] 未检测到 Tailscale，开始自动安装…"
  if command -v brew >/dev/null 2>&1; then
    echo "    检测到 Homebrew：brew install --cask tailscale（可能需要几分钟）"
    brew install --cask tailscale && TS="$TS_APP"
  fi
  if [ -z "$TS" ] || [ ! -x "$TS" ]; then
    echo "    下载安装包到「下载」目录并打开（在弹出的安装器中点「继续 → 安装」）"
    curl -fL --progress-bar -o "$HOME/Downloads/Tailscale.pkg" "$PKG_URL" \
      || { echo "[X] 下载失败，请手动安装 Tailscale 后重跑本工具"; exit 1; }
    open "$HOME/Downloads/Tailscale.pkg"
    echo ""
    echo "[!] 安装完成后，重新双击本文件即可自动加入网络"
    exit 0
  fi
fi
echo "[OK] Tailscale: $TS"

if [ -z "$HOSTNAME" ]; then
  HOSTNAME="$(scutil --get LocalHostName 2>/dev/null || hostname -s)"
fi
echo "[*] 设备名: $HOSTNAME"

UP_ARGS=(up --reset --login-server="$SERVER" --authkey="$AUTHKEY" --hostname="$HOSTNAME" --accept-routes --accept-dns=true)

if [ "$TS" = "$TS_APP" ]; then
  echo "[*] 启动 Tailscale App（首次使用需在系统弹窗中允许 VPN 配置）…"
  open -a Tailscale 2>/dev/null
  sleep 3
  echo "[*] 正在使用平台密钥加入网络（免浏览器）…"
  "$TS" "${UP_ARGS[@]}"
else
  echo "[*] 命令行版 tailscale，弹窗输入一次管理员密码即可…"
  osascript -e "do shell script \"'$TS' ${UP_ARGS[*]}\" with administrator privileges"
fi

echo ""
echo "── 当前状态 ──"
JOINED=0
if "$TS" status >/dev/null 2>&1; then
  JOINED=1
  "$TS" status 2>/dev/null | head -5
fi

if [ "$JOINED" = "1" ]; then
  echo "[OK] 已加入网络！"
  curl -sk -m 10 -X POST "$REPORT_URL" -H 'Content-Type: application/json' \
    -d "{\"authkey\":\"$AUTHKEY\",\"hostname\":\"$HOSTNAME\"}" >/dev/null 2>&1 \
    && echo "[OK] 已回传平台" || echo "[!] 回传平台失败（不影响使用）"
else
  echo "[X] 加入未完成，请把上方输出截图联系管理员"
  exit 1
fi
echo ""
echo "完成！本窗口可以关闭。"
`

func macReadme(cfg ToolConfig) string {
	return fmt.Sprintf(`Tailscale 一键加入工具（macOS · 由 labplane 平台生成）

服务器地址: %s
本机主机名: %s

使用步骤:
  1. 解压本目录到任意位置
  2. 双击「加入节点.command」
     （首次运行若提示无法验证开发者：右键该文件 →「打开」→ 再点「打开」；
       或到 系统设置 → 隐私与安全性 → 点「仍要打开」）
  3. 未安装 Tailscale 时工具会自动安装（Homebrew 或官方安装包）
  4. 使用平台密钥直接加入，无需浏览器登录 Authentik

注意:
  - 本工具内含加入密钥，请勿外传
  - 「重新连接已有设备」请在加入页面选择重连模式获取对应命令，
    本工具面向新设备（--reset 会生成新节点）
`, cfg.Server, cfg.Hostname)
}

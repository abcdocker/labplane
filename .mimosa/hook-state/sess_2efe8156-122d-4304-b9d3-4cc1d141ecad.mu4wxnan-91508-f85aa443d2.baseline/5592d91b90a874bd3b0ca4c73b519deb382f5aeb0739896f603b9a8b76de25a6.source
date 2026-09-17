package internal

import (
	"sort"
	"strings"
)

// CloudVMSoftwareOpts 创建向导「自定义软件」勾选项（存 config_json；与 InitScript 分离，便于合并写入 Secret）。
type CloudVMSoftwareOpts struct {
	InstallDocker       bool     `json:"installDocker,omitempty"`
	InstallNginx        bool     `json:"installNginx,omitempty"`
	InstallBaota        bool     `json:"installBaota,omitempty"`
	InstallHysteria2    bool     `json:"installHysteria2,omitempty"`
	Hysteria2ListenPort int      `json:"hysteria2ListenPort,omitempty"`
	Hysteria2ConfigYAML string   `json:"hysteria2ConfigYaml,omitempty"`
	CliPackages         []string `json:"cliPackages,omitempty"`
}

// 官方 Release 标签为 app/v2.6.5（路径中勿写 v2.6.5，否则会 404）。
const (
	defaultHysteriaLinuxAMD64URL = "https://github.com/apernet/hysteria/releases/download/app/v2.6.5/hysteria-linux-amd64"
	defaultHysteriaLinuxARM64URL = "https://github.com/apernet/hysteria/releases/download/app/v2.6.5/hysteria-linux-arm64"
)

var cloudVMAllowedCLIPkgs = map[string]string{
	"vim":        "vim",
	"wget":       "wget",
	"curl":       "curl",
	"iftop":      "iftop",
	"iotop":      "iotop",
	"htop":       "htop",
	"git":        "git",
	"unzip":      "unzip",
	"net-tools": "net-tools",
}

func normalizeCloudVMCliPackages(in []string) []string {
	seen := map[string]bool{}
	var out []string
	for _, p := range in {
		p = strings.TrimSpace(strings.ToLower(p))
		if apt, ok := cloudVMAllowedCLIPkgs[p]; ok && !seen[apt] {
			seen[apt] = true
			out = append(out, apt)
		}
	}
	sort.Strings(out)
	return out
}

func cloudVMSoftwareOptsEmpty(sw CloudVMSoftwareOpts) bool {
	return !sw.InstallDocker && !sw.InstallNginx && !sw.InstallBaota && !sw.InstallHysteria2 && len(normalizeCloudVMCliPackages(sw.CliPackages)) == 0
}

func resolveCloudVMHysteriaDownloadPrimaries(boot *CloudVMBootstrap) (amd64URL, arm64URL string) {
	amd64URL = defaultHysteriaLinuxAMD64URL
	arm64URL = defaultHysteriaLinuxARM64URL
	if boot == nil {
		return
	}
	if s := strings.TrimSpace(boot.Hysteria2LinuxAmd64URL); s != "" {
		amd64URL = s
	}
	if s := strings.TrimSpace(boot.Hysteria2LinuxArm64URL); s != "" {
		arm64URL = s
	}
	return
}

func expandHysteriaMirrorURLs(primary string) []string {
	primary = strings.TrimSpace(primary)
	if primary == "" {
		return nil
	}
	seen := map[string]bool{}
	var out []string
	add := func(s string) {
		s = strings.TrimSpace(s)
		if s == "" || seen[s] {
			return
		}
		seen[s] = true
		out = append(out, s)
	}
	add(primary)
	if strings.HasPrefix(primary, "https://") {
		skip := strings.TrimPrefix(primary, "https://")
		add("https://ghfast.top/https://" + skip)
		add("https://ghproxy.net/https://" + skip)
		add("https://mirror.ghproxy.com/https://" + skip)
	}
	if strings.HasPrefix(primary, "https://github.com/") {
		rel := strings.TrimPrefix(primary, "https://github.com/")
		add("https://gitclone.com/github.com/" + rel)
		add("https://kkgithub.com/" + rel)
	}
	return out
}

func bashSingleQuoted(s string) string {
	return `'` + strings.ReplaceAll(s, `'`, `'\''`) + `'`
}

func writeBashURLArray(b *strings.Builder, varName string, urls []string) {
	b.WriteString("declare -a " + varName + "=(\n")
	for _, u := range urls {
		b.WriteString("  " + bashSingleQuoted(u) + "\n")
	}
	b.WriteString(")\n")
}

// composeCloudVMUserInitScript 将自动化安装块与用户 InitScript 合并后写入 Secret（Deployment 注解 hash 与此一致）。
func composeCloudVMUserInitScript(st CloudVMStored, boot *CloudVMBootstrap) string {
	amdP, armP := resolveCloudVMHysteriaDownloadPrimaries(boot)
	head := buildCloudVMSoftwareBash(st.Software, amdP, armP)
	user := strings.TrimSpace(st.InitScript)
	if head == "" {
		return user
	}
	if user == "" {
		return head
	}
	return head + "\n\n# --- 用户初始化脚本 ---\n" + user
}

func buildCloudVMSoftwareBash(sw CloudVMSoftwareOpts, hysteriaAmd64Primary, hysteriaArm64Primary string) string {
	if cloudVMSoftwareOptsEmpty(sw) {
		return ""
	}
	pkgs := normalizeCloudVMCliPackages(sw.CliPackages)
	var b strings.Builder
	b.WriteString("#!/bin/bash\n")
	b.WriteString("# kube-bt-sync: 预选软件（apt 包与列表缓存在 PVC /data，Docker/Nginx 已装则跳过重复下载）\n")
	b.WriteString("export DEBIAN_FRONTEND=noninteractive\n")
	b.WriteString("set -e\n")
	b.WriteString("mkdir -p /data/.kubebt/stamps /data/.kubebt/apt-archive /data/.kubebt/apt-lists/partial\n")
	b.WriteString(`test -f /etc/apt/apt.conf.d/99-kubebt-persist || cat > /etc/apt/apt.conf.d/99-kubebt-persist <<'APTEOF'
Dir::Cache::archives "/data/.kubebt/apt-archive";
Dir::State::lists "/data/.kubebt/apt-lists";
APTEOF
`)
	b.WriteString(`if [ -f /etc/os-release ]; then . /etc/os-release; fi
if grep -qi ubuntu /etc/os-release 2>/dev/null && [ -f /etc/apt/sources.list ]; then
  if [ ! -f /etc/apt/sources.list.bak.kubebt ]; then
    cp -a /etc/apt/sources.list /etc/apt/sources.list.bak.kubebt 2>/dev/null || true
  fi
  sed -i \
    -e 's@http://archive.ubuntu.com/ubuntu@http://mirrors.aliyun.com/ubuntu@g' \
    -e 's@http://security.ubuntu.com/ubuntu@http://mirrors.aliyun.com/ubuntu@g' \
    -e 's@https://archive.ubuntu.com/ubuntu@https://mirrors.aliyun.com/ubuntu@g' \
    -e 's@https://security.ubuntu.com/ubuntu@https://mirrors.aliyun.com/ubuntu@g' \
    /etc/apt/sources.list 2>/dev/null || true
fi
`)
	needApt := len(pkgs) > 0 || sw.InstallDocker || sw.InstallNginx || sw.InstallBaota || sw.InstallHysteria2
	if needApt {
		b.WriteString("apt-get update -qq\n")
	}
	if len(pkgs) > 0 {
		b.WriteString("apt-get install -y -qq " + strings.Join(pkgs, " ") + "\n")
	}
	if sw.InstallDocker {
		b.WriteString(`
mkdir -p /data/docker /etc/docker
if [ ! -s /etc/docker/daemon.json ]; then
  printf '%s\n' '{"data-root":"/data/docker","registry-mirrors":["https://docker.m.daocloud.io"]}' > /etc/docker/daemon.json
fi
if command -v docker >/dev/null 2>&1 && [ -f /data/.kubebt/stamps/docker-io-ok ]; then
  :
else
  apt-get install -y -qq docker.io
  touch /data/.kubebt/stamps/docker-io-ok
fi
# 云主机 Pod 内无 systemd，docker.io 包不会自动拉起 dockerd；每次启动均确保 daemon 可用
mkdir -p /var/run
if docker info >/dev/null 2>&1; then
  :
else
  mkdir -p /data/.kubebt
  nohup dockerd --iptables=false >> /data/.kubebt/dockerd.log 2>&1 &
  for i in $(seq 1 90); do
    docker info >/dev/null 2>&1 && break
    sleep 1
  done
  docker info >/dev/null 2>&1 || { echo "dockerd 启动失败，见 /data/.kubebt/dockerd.log（需为云主机开启容器特权以运行 Docker）" >&2; tail -n 60 /data/.kubebt/dockerd.log >&2 || true; exit 1; }
fi
`)
	}
	if sw.InstallNginx {
		b.WriteString(`
mkdir -p /data/nginx/html /data/nginx/logs /data/nginx/ssl /var/log/nginx /var/cache/nginx
if [ ! -s /data/nginx/html/index.html ]; then
  printf '%s\n' '<!DOCTYPE html><html><head><meta charset="utf-8"><title>welcome</title></head><body>ok</body></html>' > /data/nginx/html/index.html
fi
if command -v nginx >/dev/null 2>&1 && [ -f /data/.kubebt/stamps/nginx-ok ]; then
  :
else
  apt-get install -y -qq nginx
  touch /data/.kubebt/stamps/nginx-ok
fi
for f in /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default; do
  if [ -f "$f" ]; then
    sed -i 's|root /var/www/html|root /data/nginx/html|g' "$f"
    sed -i 's|root /usr/share/nginx/html|root /data/nginx/html|g' "$f"
  fi
done
# 供平台采集连接数（仅本机访问）
if [ ! -f /etc/nginx/conf.d/00-kubebt-stub.conf ]; then
  printf '%s\n' 'server { listen 127.0.0.1:8899; location /kubebt_stub_status { stub_status on; access_log off; allow 127.0.0.1; deny all; } }' > /etc/nginx/conf.d/00-kubebt-stub.conf
fi
# 无 systemd 时不会自动起 nginx；每次启动校验配置并拉起 / 重载
nginx -t
if pidof nginx >/dev/null 2>&1; then
  nginx -s reload
else
  nginx
fi
for i in $(seq 1 30); do
  curl -sf --max-time 1 http://127.0.0.1/ >/dev/null 2>&1 && break
  sleep 1
done
curl -sf --max-time 2 http://127.0.0.1/ >/dev/null 2>&1 || { echo "nginx 未在 80 端口正常响应，请检查配置与 /var/log/nginx/error.log" >&2; exit 1; }
`)
	}
	if sw.InstallHysteria2 {
		amdURLs := expandHysteriaMirrorURLs(hysteriaAmd64Primary)
		armURLs := expandHysteriaMirrorURLs(hysteriaArm64Primary)
		if len(amdURLs) == 0 {
			amdURLs = expandHysteriaMirrorURLs(defaultHysteriaLinuxAMD64URL)
		}
		if len(armURLs) == 0 {
			armURLs = expandHysteriaMirrorURLs(defaultHysteriaLinuxARM64URL)
		}
		var hb strings.Builder
		hb.WriteString(`
mkdir -p /data/hysteria2 /data/.kubebt/deps
HY_BIN=/data/hysteria2/hysteria
HY_CFG=/run/cloud-vm-secrets/hysteria2.yaml
ARCH_RAW=$(uname -m)
case "$ARCH_RAW" in
  x86_64|amd64) HY_HAS_ARCH=1 ;;
  aarch64|arm64) HY_HAS_ARCH=1 ;;
  *) echo "Hysteria2: 不支持架构 $ARCH_RAW（跳过客户端；SSH 仍可用，可换镜像架构）" >&2; HY_HAS_ARCH=0 ;;
esac
`)
		writeBashURLArray(&hb, "HY_AMD64_URLS", amdURLs)
		writeBashURLArray(&hb, "HY_ARM64_URLS", armURLs)
		hb.WriteString(`if [ ! -f "$HY_CFG" ]; then
  echo "Hysteria2: 缺少挂载的配置文件 $HY_CFG（Secret key hysteria2.yaml）" >&2
  exit 1
fi
if [ -x /data/.kubebt/deps/hysteria ]; then
  cp -a /data/.kubebt/deps/hysteria "$HY_BIN" && chmod +x "$HY_BIN" || true
fi
if [ "${HY_HAS_ARCH:-0}" = 1 ] && [ ! -x "$HY_BIN" ]; then
  case "$ARCH_RAW" in
    x86_64|amd64) HY_MIRRORS=("${HY_AMD64_URLS[@]}");;
    aarch64|arm64) HY_MIRRORS=("${HY_ARM64_URLS[@]}");;
    *) HY_MIRRORS=();;
  esac
  for base in "${HY_MIRRORS[@]}"; do
    if curl -fsSL --connect-timeout 10 --max-time 180 -o "$HY_BIN.tmp" "$base"; then
      mv "$HY_BIN.tmp" "$HY_BIN"
      chmod +x "$HY_BIN"
      break
    fi
    rm -f "$HY_BIN.tmp" 2>/dev/null || true
  done
fi
if [ -x "$HY_BIN" ]; then
  nohup "$HY_BIN" client -c "$HY_CFG" >> /data/hysteria2/hysteria.log 2>&1 &
  sleep 2
else
  echo "Hysteria2: 当前无可用二进制（镜像引导中配置的下载地址与镜像站均失败）。SSH 与系统初始化仍继续。请在「云主机镜像引导」中填写可访问的 hysteria 裸二进制 URL，或为 Deployment 配置 HTTPS_PROXY/HTTP_PROXY 后滚动重启。" >&2
fi
`)
		b.WriteString(hb.String())
	}
	if sw.InstallBaota {
		b.WriteString(`
mkdir -p /data/www /data/bt-panel
if [ ! -e /www ] || [ -L /www ]; then ln -sfn /data/www /www; fi
if [ ! -f /data/bt-panel/.kubebt-baota-ok ]; then
  wget -qO /data/bt-panel/install_6.0.sh http://download.bt.cn/install/install_6.0.sh || \
    wget -qO /data/bt-panel/install_6.0.sh https://download.bt.cn/install/install_6.0.sh
  test -s /data/bt-panel/install_6.0.sh
  chmod +x /data/bt-panel/install_6.0.sh
  echo y | bash /data/bt-panel/install_6.0.sh ed8484bec >>/data/bt-panel/install.log 2>&1
  command -v bt >/dev/null 2>&1 || { echo "宝塔安装未完成：未找到 bt 命令，见 /data/bt-panel/install.log" >&2; exit 1; }
  touch /data/bt-panel/.kubebt-baota-ok
fi
# 无 systemd 时需每次启动尝试拉起面板；是否成功以端口为准（start 在已运行时可能非 0）
command -v bt >/dev/null 2>&1 || { echo "宝塔：未找到 bt 命令" >&2; exit 1; }
if [ -x /etc/init.d/bt ]; then
  /etc/init.d/bt start >>/data/bt-panel/runtime.log 2>&1 || true
fi
bt start >>/data/bt-panel/runtime.log 2>&1 || true
ok_bt=0
for i in $(seq 1 120); do
  if curl -sf --max-time 1 http://127.0.0.1:8888/ >/dev/null 2>&1; then ok_bt=1; break; fi
  if curl -skf --max-time 1 https://127.0.0.1:8888/ >/dev/null 2>&1; then ok_bt=1; break; fi
  sleep 1
done
[ "$ok_bt" = 1 ] || { echo "宝塔面板未在 8888 端口就绪，见 /data/bt-panel/runtime.log 与 install.log" >&2; exit 1; }
`)
	}
	return strings.TrimSpace(b.String()) + "\n"
}

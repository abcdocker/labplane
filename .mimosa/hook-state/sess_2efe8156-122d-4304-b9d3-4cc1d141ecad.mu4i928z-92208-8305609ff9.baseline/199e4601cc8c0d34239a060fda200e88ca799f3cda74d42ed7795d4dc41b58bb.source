package internal

import (
	"bufio"
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"golang.org/x/crypto/ssh"
)

const (
	vectorShipperVersion       = "0.36.1"
	vmShipperSystemdUnitName   = "kubebt-vector-vmlog.service"
	vmShipperVectorConfigPath  = "/etc/vector/kube-bt-vmlog.toml"
	vmShipperVectorInstallPath = "/usr/local/bin/vector"
)

var vmShipperPathSafe = regexp.MustCompile(`^[a-zA-Z0-9_./\*\-]+$`)

const (
	vmShipperTaskPhasePending = "pending"
	vmShipperTaskPhaseRunning = "running"
	vmShipperTaskPhaseSuccess = "success"
	vmShipperTaskPhaseError   = "error"
	vmShipperOutputLineLimit  = 240
)

var vmShipperTaskStore sync.Map

type vmShipperInstallTask struct {
	mu sync.RWMutex

	ID          string   `json:"taskId"`
	Phase       string   `json:"phase"`
	Progress    int      `json:"progress"`
	Stage       string   `json:"stage,omitempty"`
	Message     string   `json:"message,omitempty"`
	Error       string   `json:"error,omitempty"`
	OutputLines []string `json:"-"`

	TargetType string   `json:"targetType,omitempty"`
	TargetID   string   `json:"targetId,omitempty"`
	TargetName string   `json:"targetName,omitempty"`
	Paths      []string `json:"paths,omitempty"`
	VMHost     string   `json:"vmHost,omitempty"`
	LogSource  string   `json:"logSource,omitempty"`

	StartedAt  string                 `json:"startedAt,omitempty"`
	FinishedAt string                 `json:"finishedAt,omitempty"`
	Inspect    *vmShipperInspectState `json:"inspect,omitempty"`
	Verify     *vmShipperVerifyState  `json:"verify,omitempty"`
}

type vmShipperInspectPathCheck struct {
	Path         string `json:"path"`
	MatchedCount int    `json:"matchedCount"`
	Sample       string `json:"sample,omitempty"`
}

type vmShipperInspectState struct {
	SSHConnected    bool                        `json:"sshConnected"`
	CurrentUser     string                      `json:"currentUser,omitempty"`
	CurrentUID      int                         `json:"currentUid,omitempty"`
	SudoReady       bool                        `json:"sudoReady"`
	Installed       bool                        `json:"installed"`
	VectorVersion   string                      `json:"vectorVersion,omitempty"`
	ConfigExists    bool                        `json:"configExists"`
	ServiceActive   bool                        `json:"serviceActive"`
	ServiceEnabled  bool                        `json:"serviceEnabled"`
	ServiceStateRaw string                      `json:"serviceStateRaw,omitempty"`
	EnableStateRaw  string                      `json:"enableStateRaw,omitempty"`
	InstallPath     string                      `json:"installPath,omitempty"`
	ConfigPath      string                      `json:"configPath,omitempty"`
	Summary         string                      `json:"summary,omitempty"`
	PathChecks      []vmShipperInspectPathCheck `json:"pathChecks,omitempty"`
}

type vmShipperVerifyState struct {
	Attempted   bool   `json:"attempted"`
	OK          bool   `json:"ok"`
	Query       string `json:"query,omitempty"`
	WindowStart string `json:"windowStart,omitempty"`
	WindowEnd   string `json:"windowEnd,omitempty"`
	CheckedRows int    `json:"checkedRows,omitempty"`
	Message     string `json:"message,omitempty"`
	SampleTime  string `json:"sampleTime,omitempty"`
	SampleMsg   string `json:"sampleMsg,omitempty"`
	Error       string `json:"error,omitempty"`
}

type vmShipperCacheProbeState struct {
	URL      string `json:"url"`
	Cached   bool   `json:"cached"`
	Status   string `json:"status"`
	HTTPCode int    `json:"httpCode,omitempty"`
	Error    string `json:"error,omitempty"`
}

type vmShipperResolvedTarget struct {
	Client      *ssh.Client
	TargetType  string
	TargetID    string
	TargetName  string
	VMLabel     string
	AuditTarget string
}

func newVmShipperInstallTask(targetType, targetID, targetName, vmHost, logSource string, paths []string) *vmShipperInstallTask {
	return &vmShipperInstallTask{
		ID:         uuid.NewString(),
		Phase:      vmShipperTaskPhasePending,
		Progress:   0,
		Stage:      "queued",
		Message:    "任务已排队，等待建立 SSH 连接",
		TargetType: targetType,
		TargetID:   targetID,
		TargetName: targetName,
		Paths:      append([]string(nil), paths...),
		VMHost:     vmHost,
		LogSource:  logSource,
		StartedAt:  time.Now().UTC().Format(time.RFC3339Nano),
	}
}

func (t *vmShipperInstallTask) setProgress(progress int, stage, message string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if progress < 0 {
		progress = 0
	}
	if progress > 100 {
		progress = 100
	}
	if progress > t.Progress {
		t.Progress = progress
	}
	if strings.TrimSpace(stage) != "" {
		t.Stage = strings.TrimSpace(stage)
	}
	if strings.TrimSpace(message) != "" {
		t.Message = strings.TrimSpace(message)
	}
	if t.Phase == vmShipperTaskPhasePending {
		t.Phase = vmShipperTaskPhaseRunning
	}
}

func (t *vmShipperInstallTask) appendLine(line string) {
	line = strings.TrimSpace(strings.TrimRight(line, "\r"))
	if line == "" {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	t.OutputLines = append(t.OutputLines, line)
	if len(t.OutputLines) > vmShipperOutputLineLimit {
		t.OutputLines = append([]string(nil), t.OutputLines[len(t.OutputLines)-vmShipperOutputLineLimit:]...)
	}
}

func (t *vmShipperInstallTask) setInspect(st *vmShipperInspectState) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.Inspect = st
}

func (t *vmShipperInstallTask) finishSuccess(message string, inspect *vmShipperInspectState) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.Phase = vmShipperTaskPhaseSuccess
	t.Progress = 100
	t.Stage = "done"
	if strings.TrimSpace(message) != "" {
		t.Message = strings.TrimSpace(message)
	}
	t.Error = ""
	t.FinishedAt = time.Now().UTC().Format(time.RFC3339Nano)
	t.Inspect = inspect
}

func (t *vmShipperInstallTask) finishError(message string, inspect *vmShipperInspectState) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.Phase = vmShipperTaskPhaseError
	if t.Progress < 5 {
		t.Progress = 5
	}
	t.Stage = "failed"
	t.Error = strings.TrimSpace(message)
	if t.Error == "" {
		t.Error = "远程安装失败"
	}
	t.Message = t.Error
	t.FinishedAt = time.Now().UTC().Format(time.RFC3339Nano)
	t.Inspect = inspect
}

func (t *vmShipperInstallTask) snapshot() gin.H {
	t.mu.RLock()
	defer t.mu.RUnlock()
	out := gin.H{
		"taskId":     t.ID,
		"phase":      t.Phase,
		"progress":   t.Progress,
		"stage":      t.Stage,
		"message":    t.Message,
		"targetType": t.TargetType,
		"targetId":   t.TargetID,
		"targetName": t.TargetName,
		"paths":      append([]string(nil), t.Paths...),
		"vmHost":     t.VMHost,
		"logSource":  t.LogSource,
		"startedAt":  t.StartedAt,
		"finishedAt": t.FinishedAt,
		"output":     strings.Join(t.OutputLines, "\n"),
	}
	if t.Error != "" {
		out["error"] = t.Error
	}
	if t.Inspect != nil {
		out["inspect"] = t.Inspect
	}
	if t.Verify != nil {
		out["verify"] = t.Verify
	}
	return out
}

func (t *vmShipperInstallTask) setVerify(v *vmShipperVerifyState) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.Verify = v
}

func vmShipperTaskGet(id string) (*vmShipperInstallTask, bool) {
	v, ok := vmShipperTaskStore.Load(strings.TrimSpace(id))
	if !ok {
		return nil, false
	}
	t, ok := v.(*vmShipperInstallTask)
	return t, ok
}

func vmShipperTaskList(limit int) []gin.H {
	if limit <= 0 {
		limit = 20
	}
	type row struct {
		started time.Time
		data    gin.H
	}
	items := make([]row, 0, limit)
	vmShipperTaskStore.Range(func(_, value any) bool {
		t, ok := value.(*vmShipperInstallTask)
		if !ok || t == nil {
			return true
		}
		snap := t.snapshot()
		startedAt, _ := snap["startedAt"].(string)
		ts, _ := time.Parse(time.RFC3339Nano, startedAt)
		items = append(items, row{started: ts, data: snap})
		return true
	})
	sort.Slice(items, func(i, j int) bool { return items[i].started.After(items[j].started) })
	if len(items) > limit {
		items = items[:limit]
	}
	out := make([]gin.H, 0, len(items))
	for _, item := range items {
		out = append(out, item.data)
	}
	return out
}

func vmShipperSanitizePaths(paths []string) ([]string, error) {
	seen := map[string]bool{}
	var out []string
	for _, p := range paths {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		if strings.Contains(p, "..") {
			return nil, fmt.Errorf("非法路径（禁止 ..）: %q", p)
		}
		if !vmShipperPathSafe.MatchString(p) {
			return nil, fmt.Errorf("路径仅允许字母数字及部分符号: %q", p)
		}
		if seen[p] {
			continue
		}
		seen[p] = true
		out = append(out, p)
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("请至少填写一个日志路径或选择预设")
	}
	return out, nil
}

// vmShipperNormalizeVectorDownloadBaseURL 若用户粘贴了完整包地址 …/vector-版本-架构.tar.gz，则去掉文件名，
// 保留目录；安装脚本与预览 URL 会在其后拼接 /vector-${VER}-${ARCH}.tar.gz。
func vmShipperNormalizeVectorDownloadBaseURL(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return ""
	}
	s = strings.TrimRight(s, "/")
	u, err := url.Parse(s)
	if err != nil || u.Path == "" || u.Path == "/" {
		return s
	}
	b := path.Base(u.Path)
	if b == "." || b == "/" {
		return s
	}
	bl := strings.ToLower(b)
	if strings.HasSuffix(bl, ".tar.gz") && strings.HasPrefix(b, "vector-") {
		dir := path.Dir(u.Path)
		if dir == "." || dir == "" {
			u.Path = "/"
		} else {
			u.Path = dir
		}
		return strings.TrimRight(u.String(), "/")
	}
	return s
}

func effectiveVMLogVectorDownloadBaseURL(rs *RuntimeSettings, cfg Config) string {
	var s string
	if rs != nil && strings.TrimSpace(rs.VMLogVectorDownloadBaseURL) != "" {
		s = strings.TrimSpace(rs.VMLogVectorDownloadBaseURL)
	} else {
		s = strings.TrimSpace(cfg.VMLogVectorDownloadBaseURL)
	}
	return vmShipperNormalizeVectorDownloadBaseURL(s)
}

func vmShipperVectorPrimaryURL(base string, arch string) string {
	base = strings.TrimRight(strings.TrimSpace(base), "/")
	arch = strings.TrimSpace(arch)
	if base != "" && arch != "" {
		return base + "/vector-" + vectorShipperVersion + "-" + arch + ".tar.gz"
	}
	switch arch {
	case "x86_64-unknown-linux-gnu", "aarch64-unknown-linux-gnu":
		return "https://github.com/vectordotdev/vector/releases/download/v" + vectorShipperVersion + "/vector-" + vectorShipperVersion + "-" + arch + ".tar.gz"
	default:
		return ""
	}
}

func vmShipperProbeCacheURL(ctx context.Context, rawURL string) vmShipperCacheProbeState {
	out := vmShipperCacheProbeState{URL: strings.TrimSpace(rawURL), Status: "unknown"}
	if out.URL == "" {
		out.Status = "not_configured"
		return out
	}
	client := &http.Client{Timeout: 6 * time.Second}
	try := func(method string) (int, error) {
		req, err := http.NewRequestWithContext(ctx, method, out.URL, nil)
		if err != nil {
			return 0, err
		}
		resp, err := client.Do(req)
		if err != nil {
			return 0, err
		}
		defer resp.Body.Close()
		return resp.StatusCode, nil
	}
	code, err := try(http.MethodHead)
	if err != nil {
		out.Status = "probe_error"
		out.Error = err.Error()
		return out
	}
	if code == http.StatusMethodNotAllowed || code == http.StatusNotImplemented {
		code, err = try(http.MethodGet)
		if err != nil {
			out.Status = "probe_error"
			out.Error = err.Error()
			return out
		}
	}
	out.HTTPCode = code
	switch {
	case code >= 200 && code < 300:
		out.Cached = true
		out.Status = "cached"
	case code == http.StatusNotFound:
		out.Status = "missing"
	default:
		out.Status = "probe_error"
		out.Error = fmt.Sprintf("HTTP %d", code)
	}
	return out
}

func vmShipperInsertURL(base string) string {
	b := strings.TrimRight(strings.TrimSpace(base), "/")
	if b == "" {
		return ""
	}
	return b + "/insert/jsonline?_stream_fields=vm_host,log_source"
}

func vmShipperBuildVectorToml(vlInsertURL, vmHost, logSource string, includes []string, os *vmShipperOpenSearchOpts) string {
	var incLines strings.Builder
	for _, p := range includes {
		incLines.WriteString(fmt.Sprintf("    %q,\n", p))
	}
	// 先按纯文本稳定采集，避免不同 Vector/VRL 版本在 JSON 自动解析语法上的兼容差异导致服务启动失败。
	base := fmt.Sprintf(`data_dir = "/var/lib/vector"

[sources.vm_files]
type = "file"
include = [
%s]
read_from = "beginning"
max_line_bytes = 1048576

[transforms.vl_prep]
type = "remap"
inputs = ["vm_files"]
source = '''
.vm_host = %q
.log_source = %q
._msg = to_string!(.message)
'''

[sinks.vl_http]
type = "http"
inputs = ["vl_prep"]
uri = %q
method = "post"
encoding.codec = "json"
batch.max_events = 100
batch.timeout_secs = 1
# 若 VictoriaLogs 为自签 HTTPS，请在 sinks 中增加 [sinks.vl_http.request.tls] verify_certificate = false
`,
		incLines.String(),
		vmHost,
		logSource,
		vlInsertURL,
	)
	if os == nil || strings.TrimSpace(os.Endpoint) == "" {
		return base
	}
	prefix := strings.TrimSpace(os.IndexPrefix)
	if prefix == "" {
		prefix = "kubebt-vmlog"
	}
	ep := strings.TrimRight(strings.TrimSpace(os.Endpoint), "/")
	var b strings.Builder
	b.WriteString(base)
	b.WriteString(fmt.Sprintf(`
[sinks.kubebt_opensearch]
type = "elasticsearch"
distribution = "opensearch"
inputs = ["vl_prep"]
endpoints = [%q]
bulk.index = "%s-%%Y-%%m-%%d"
`, ep, prefix))
	u := strings.TrimSpace(os.User)
	pw := strings.TrimSpace(os.Password)
	if u != "" {
		b.WriteString(fmt.Sprintf(`
[sinks.kubebt_opensearch.auth]
strategy = "basic"
user = %q
password = %q
`, u, pw))
	}
	return b.String()
}

func vmShipperBuildBashScript(vlBase, vectorBaseURL, vmLabel, logSource string, includes []string, os *vmShipperOpenSearchOpts) string {
	insert := vmShipperInsertURL(vlBase)
	toml := vmShipperBuildVectorToml(insert, vmLabel, logSource, includes, os)
	tomlB64 := base64.StdEncoding.EncodeToString([]byte(toml))

	unit := `[Unit]
Description=kube-bt-sync Vector -> VictoriaLogs (VM / 宝塔日志)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=` + vmShipperVectorInstallPath + ` --config ` + vmShipperVectorConfigPath + `
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
`
	unitB64 := base64.StdEncoding.EncodeToString([]byte(unit))

	return fmt.Sprintf(`#!/bin/bash
# 由 kube-bt-sync 生成：在 Linux 虚拟机安装 Vector，将文本日志推送到 VictoriaLogs。
# 要求：当前 SSH 登录用户为 root，或已配置 NOPASSWD sudo（非交互）。
set -euo pipefail

progress() {
  echo "__KBS_PROGRESS__|$1|$2|$3"
}

warn() {
  echo "__KBS_WARN__|$1"
}

trap 'code=$?; echo "__KBS_ERROR__|安装失败（退出码 ${code}，行号 ${LINENO}）"; exit ${code}' ERR

SUDO=""
progress 4 prepare "检查 sudo / root 权限"
if [ "$(id -u)" -ne 0 ]; then
  if sudo -n true 2>/dev/null; then
    SUDO="sudo -n"
  else
    echo "错误：需要 root，或当前用户可无密码执行 sudo（sudo -n）。宝塔可先用 root 保存 SSH 凭据。"
    exit 1
  fi
fi

# 非 root SSH 时：下载/解压/写盘/校验一律经 sudo 以 root 执行，避免 www 目录与 /tmp 属主差异
rk() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  else
    $SUDO "$@"
  fi
}

VL_INSERT=%s
VECTOR_BASE_URL=%s
VM_LABEL=%s
LOG_SRC=%s
VECTOR_VER=%s

progress 10 prepare "识别 CPU 架构"
ARCH=$(uname -m)
case "$ARCH" in
  x86_64|amd64) VARCH=x86_64-unknown-linux-gnu ;;
  aarch64|arm64) VARCH=aarch64-unknown-linux-gnu ;;
  *) echo "不支持的架构: $ARCH"; exit 1 ;;
esac

TMP=/tmp/vector-${VECTOR_VER}-${VARCH}.tar.gz
PRIMARY="https://github.com/vectordotdev/vector/releases/download/v${VECTOR_VER}/vector-${VECTOR_VER}-${VARCH}.tar.gz"
# 国内直连 github.com/releases 易超时：优先 ghproxy 等多线（与平台 K8s 清单镜像策略一致），失败再回源
REL="${PRIMARY#https://}"
SUB="${REL#github.com/}"
declare -a VECTOR_URLS=(
%s
  "https://ghproxy.net/https://${REL}"
  "https://mirror.ghproxy.com/https://${REL}"
  "https://ghfast.top/https://${REL}"
  "https://gitclone.com/github.com/${SUB}"
  "https://kkgithub.com/${SUB}"
  "${PRIMARY}"
)
DOWNLOAD_OK=0
progress 16 prepare "检查目标日志路径是否有匹配文件"
declare -a CHECK_PATHS=(
%s)
for P in "${CHECK_PATHS[@]}"; do
  MATCHES=()
  while IFS= read -r line; do
    [ -n "$line" ] && MATCHES+=("$line")
  done < <(
    rk env KBS_GLOB="$P" bash -c 'shopt -s nullglob; for f in $KBS_GLOB; do printf "%%s\n" "$f"; done'
  )
  if [ ${#MATCHES[@]} -eq 0 ]; then
    warn "当前未匹配到日志文件: ${P}（宝塔 /www/wwwlogs 常为 www 属主；非 root SSH 时已用 sudo 预检。仅为提示；Vector 以 root 运行后仍可读取）"
  else
    echo "日志路径 ${P} 匹配 ${#MATCHES[@]} 个文件；示例: ${MATCHES[0]}"
  fi
done

progress 22 download "下载 Vector（root/sudo 写入 /tmp，自动切换镜像）"
CURL_BIN=$(type -P curl 2>/dev/null || true)
WGET_BIN=$(type -P wget 2>/dev/null || true)
if [ -z "$CURL_BIN" ] && [ -z "$WGET_BIN" ]; then
  echo "错误：需要 curl 或 wget（当前 PATH 未找到，可安装后重试）"
  exit 1
fi
for U in "${VECTOR_URLS[@]}"; do
  progress 28 download "尝试下载 Vector: $U"
  if [ -n "$CURL_BIN" ]; then
    if rk "$CURL_BIN" -fSL --connect-timeout 25 --max-time 300 "$U" -o "$TMP" 2>/dev/null; then
      DOWNLOAD_OK=1
      break
    fi
  elif [ -n "$WGET_BIN" ]; then
    if rk "$WGET_BIN" -q --timeout=300 -O "$TMP" "$U" 2>/dev/null; then
      DOWNLOAD_OK=1
      break
    fi
  fi
done
if [ "$DOWNLOAD_OK" != 1 ]; then
  echo "错误：Vector 安装包下载失败（已依次尝试国内镜像与 GitHub 官方）。请检查出站网络，或手动下载后放到: $TMP"
  echo "官方地址: $PRIMARY"
  exit 1
fi

progress 40 verify "确认本机 Vector 包已落盘"
if ! rk test -f "$TMP"; then
  echo "错误：下载流程结束但未在本机找到 $TMP（请检查磁盘空间与 root/sudo 写 /tmp 权限）"
  exit 1
fi
if ! rk test -s "$TMP"; then
  echo "错误：$TMP 存在但大小为 0，可能镜像返回了空内容或错误页"
  exit 1
fi
SZ=$(rk stat -c %%s "$TMP" 2>/dev/null || true)
if [ -z "$SZ" ]; then
  SZ="?"
fi
echo "[kube-bt-sync] 已确认 Vector 安装包存在于本机: $TMP 大小=${SZ} 字节，继续解压与安装"
progress 45 verify "安装包校验通过（${SZ} 字节）"

progress 58 install "解压安装包"
EXTRACT_DIR=/tmp/kubebt-vector-${VECTOR_VER}-${VARCH}
TAR_ERR=/tmp/kubebt-vector-${VECTOR_VER}-${VARCH}.tar.err
rk rm -rf "$EXTRACT_DIR" "$TAR_ERR"
rk mkdir -p "$EXTRACT_DIR"
if ! rk tar -xzf "$TMP" -C "$EXTRACT_DIR" 2>"$TAR_ERR"; then
  echo "错误：解压 Vector 安装包失败（$TMP）"
  if rk test -s "$TAR_ERR"; then
    echo "tar 输出："
    while IFS= read -r line; do
      [ -n "$line" ] && echo "  $line"
    done < <(rk awk 'NR<=20 { print }' "$TAR_ERR" 2>/dev/null || true)
  fi
  exit 1
fi
# 官方包常见顶层目录为 vector-${VARCH}；兼容少数镜像站保留版本号的目录布局
BIN="$EXTRACT_DIR/vector-${VARCH}/bin/vector"
if ! rk test -x "$BIN"; then
  ALT_BIN="$EXTRACT_DIR/vector-${VECTOR_VER}-${VARCH}/bin/vector"
  if rk test -x "$ALT_BIN"; then
    BIN="$ALT_BIN"
  fi
fi
if ! rk test -x "$BIN"; then
  echo "未找到 vector 二进制（已检查 $EXTRACT_DIR 下常见目录）"
  while IFS= read -r line; do
    [ -n "$line" ] && echo "候选: $line"
  done < <(rk find "$EXTRACT_DIR" -maxdepth 4 -type f -name vector 2>/dev/null | head -10)
  exit 1
fi
progress 70 install "写入 Vector 二进制与配置"
rk mkdir -p /etc/vector /var/lib/vector
rk cp -f "$BIN" %s
rk chmod +x %s

echo %q | base64 -d | rk tee %s >/dev/null
echo %q | base64 -d | rk tee /etc/systemd/system/%s >/dev/null

progress 84 systemd "重载 systemd 并启动采集服务"
rk systemctl daemon-reload
rk systemctl enable --now %s

progress 93 verify "检查服务运行状态"
echo "当前 SSH 用户: $(id -un 2>/dev/null || true) (uid=$(id -u 2>/dev/null || true))"
sleep 2
if ! rk systemctl is-active --quiet %s; then
  echo "错误：Vector 服务未进入 active 状态"
  echo "systemctl status:"
  rk systemctl status %s --no-pager -l 2>&1 || true
  echo "journalctl（最近 60 行）:"
  rk journalctl -u %s --no-pager -n 60 -l 2>&1 || true
  exit 1
fi
VEC_VER_ACTUAL=$(rk %s --version 2>/dev/null || true)
if [ -n "$VEC_VER_ACTUAL" ]; then
  echo "Vector 版本: $VEC_VER_ACTUAL"
fi

progress 100 done "采集服务安装完成"
echo "已启动 %s；推送到 $VL_INSERT（流字段 vm_host=$VM_LABEL log_source=$LOG_SRC）"
echo "查看状态: sudo systemctl status %s"
echo "查看日志: sudo journalctl -u %s -f"
`,
		strconvQuoteBash(insert),
		strconvQuoteBash(vectorBaseURL),
		strconvQuoteBash(vmLabel),
		strconvQuoteBash(logSource),
		vectorShipperVersion,
		writeBashVectorBaseURLArray(vectorBaseURL),
		writeBashArrayItems(includes),
		vmShipperVectorInstallPath,
		vmShipperVectorInstallPath,
		tomlB64,
		vmShipperVectorConfigPath,
		unitB64,
		vmShipperSystemdUnitName,
		vmShipperSystemdUnitName,
		vmShipperSystemdUnitName,
		vmShipperSystemdUnitName,
		vmShipperSystemdUnitName,
		vmShipperVectorInstallPath,
		vmShipperSystemdUnitName,
		vmShipperSystemdUnitName,
		vmShipperSystemdUnitName,
	)
}

func strconvQuoteBash(s string) string {
	return `'` + strings.ReplaceAll(s, `'`, `'\''`) + `'`
}

func writeBashArrayItems(items []string) string {
	var b strings.Builder
	for _, item := range items {
		b.WriteString("  ")
		b.WriteString(strconvQuoteBash(item))
		b.WriteString("\n")
	}
	return b.String()
}

func writeBashVectorBaseURLArray(base string) string {
	base = strings.TrimRight(strings.TrimSpace(base), "/")
	if base == "" {
		return ""
	}
	return fmt.Sprintf("  %q\n", base+"/vector-${VECTOR_VER}-${VARCH}.tar.gz")
}

type opsVmLogVmShipperBody struct {
	CloudHostID       string   `json:"cloudHostId"`
	VCenterVMMoref    string   `json:"vcenterVmMoref"`  // 与 cloudHostId 二选一：vCenter 虚拟机 moRef（如 vm-123）
	VictoriaLogsURL   string   `json:"victoriaLogsUrl"` // 虚拟机侧可访问的 VL 根地址；空则用运行时配置
	Preset            string   `json:"preset"`          // 由 /ops/vmlog/sources 返回的 collectorProfiles.id
	LogPaths          []string `json:"logPaths"`
	VMNameLabel       string   `json:"vmNameLabel"` // 写入 vm_host 流字段，便于 LogsQL 筛选
	LogSourceOverride string   `json:"logSourceOverride"`
	// OpenSearchURL 非空时增加 Vector elasticsearch(opensearch) 双写；须为虚拟机可达地址（NodePort / LB 等，非 .svc 集群内域名）
	OpenSearchURL         string `json:"openSearchUrl,omitempty"`
	OpenSearchIndexPrefix string `json:"openSearchIndexPrefix,omitempty"`
	OpenSearchUser        string `json:"openSearchUser,omitempty"`
	OpenSearchPassword    string `json:"openSearchPassword,omitempty"`
}

type vmShipperOpenSearchOpts struct {
	Endpoint    string
	IndexPrefix string
	User        string
	Password    string
}

func vmShipperOpenSearchFromBody(body opsVmLogVmShipperBody) *vmShipperOpenSearchOpts {
	ep := strings.TrimSpace(body.OpenSearchURL)
	if ep == "" {
		return nil
	}
	return &vmShipperOpenSearchOpts{
		Endpoint:    ep,
		IndexPrefix: strings.TrimSpace(body.OpenSearchIndexPrefix),
		User:        strings.TrimSpace(body.OpenSearchUser),
		Password:    strings.TrimSpace(body.OpenSearchPassword),
	}
}

func vmShipperResolveRequest(app *ServerApp, body opsVmLogVmShipperBody) (vlBase string, paths []string, logSrc string, warn string, err error) {
	cfg := app.Cfg()
	vlBase = strings.TrimSpace(body.VictoriaLogsURL)
	if vlBase == "" {
		vlBase = normalizeVictoriaLogsBase(effectiveVictoriaLogsURL(app.Runtime(), cfg))
	}
	if vlBase == "" {
		err = fmt.Errorf("VictoriaLogs 根地址为空：请在请求体填写 victoriaLogsUrl，或在运行时配置 victoriaLogsUrl")
		return
	}
	if strings.Contains(strings.ToLower(vlBase), ".svc.cluster.local") {
		warn = "当前地址含集群内部 DNS（.svc.cluster.local），虚拟机通常无法解析。请改为虚拟机可达的地址（例如 NodePort、Ingress、内网 LB 或专线 IP + 端口 9428）。"
	}
	if os := strings.TrimSpace(body.OpenSearchURL); os != "" && strings.Contains(strings.ToLower(os), ".svc.cluster.local") {
		if warn != "" {
			warn += " "
		}
		warn += "openSearchUrl 含 .svc.cluster.local 时，安装在虚拟机上的 Vector 通常无法解析；请改为 NodePort、LB 或宿主机可路由地址。"
	}

	paths = vmShipperPresetPaths(body.Preset)
	if len(body.LogPaths) > 0 {
		custom, serr := vmShipperSanitizePaths(body.LogPaths)
		if serr != nil {
			err = serr
			return
		}
		if body.Preset == vmShipperPresetCustom || body.Preset == "" {
			paths = custom
		} else {
			paths = append(paths, custom...)
		}
	} else if len(paths) == 0 {
		err = fmt.Errorf("请选择预设或填写 logPaths")
		return
	}
	paths, err = vmShipperSanitizePaths(paths)
	if err != nil {
		return
	}

	logSrc = strings.TrimSpace(body.LogSourceOverride)
	if logSrc == "" {
		if profile, ok := vmLogCollectorProfileByID(body.Preset); ok {
			logSrc = profile.LogSource
		} else {
			logSrc = strings.TrimSpace(body.Preset)
		}
		if logSrc == "" {
			logSrc = vmShipperPresetCustom
		}
	}
	return
}

func vmShipperResolveTarget(ctx context.Context, app *ServerApp, body opsVmLogVmShipperBody) (*vmShipperResolvedTarget, error) {
	cfg := app.Cfg()
	reqCtx := ctx
	moref := strings.TrimSpace(body.VCenterVMMoref)
	cloudID := strings.TrimSpace(body.CloudHostID)
	if moref != "" && cloudID != "" {
		return nil, fmt.Errorf("请只填写 cloudHostId 或 vcenterVmMoref 之一")
	}
	if moref == "" && cloudID == "" {
		return nil, fmt.Errorf("缺少目标：填写 cloudHostId（云主机）或 vcenterVmMoref（vCenter 虚拟机，如 vm-123）")
	}

	vmLabel := strings.TrimSpace(body.VMNameLabel)
	if moref != "" {
		vc := app.VCenter()
		if vc == nil {
			return nil, fmt.Errorf("vCenter 未初始化或未启用")
		}
		key, kerr := sshEncryptionKey(cfg)
		store := app.SSHStore()
		if !cfg.vCenterVMSshConfigured() {
			if kerr != nil {
				return nil, kerr
			}
			if store == nil {
				return nil, fmt.Errorf("未配置 SSH 存储：请在虚拟机详情保存 SSH 凭据（需 KUBEBT_ENCRYPTION_KEY），或配置全局 VCENTER_VM_SSH_USER 与密码/私钥路径")
			}
		}
		if !sshEffectiveReady(reqCtx, cfg, store, moref, key) {
			return nil, fmt.Errorf("该虚拟机未配置可用的 SSH：请在 vCenter 虚拟机详情保存凭据，或设置全局 VCENTER_VM_SSH_*（与内嵌 SSH 终端相同）")
		}
		client, err := sshDialVCenterVMClient(ctx, vc, cfg, store, moref, key)
		if err != nil {
			return nil, fmt.Errorf("SSH 连接失败: %w", err)
		}
		name := strings.TrimSpace(moref)
		if vmLabel == "" {
			vmLabel = name
		}
		return &vmShipperResolvedTarget{
			Client:      client,
			TargetType:  "vcenter",
			TargetID:    moref,
			TargetName:  name,
			VMLabel:     vmLabel,
			AuditTarget: "vcenterVm=" + moref,
		}, nil
	}

	hosts, lerr := loadCloudHosts(app)
	if lerr != nil {
		return nil, lerr
	}
	idx := findCloudHostIndex(hosts, cloudID)
	if idx < 0 {
		return nil, fmt.Errorf("云主机不存在")
	}
	host := &hosts[idx]
	key, kerr := sshEncryptionKey(cfg)
	if kerr != nil {
		return nil, kerr
	}
	store := app.SSHStore()
	if store == nil {
		return nil, fmt.Errorf("未配置 SSH 存储（KUBEBT_ENCRYPTION_KEY + SSH 设置）")
	}
	cloudKey := cloudHostSSHStorageKey(cloudID)
	if !cloudSSHReady(reqCtx, cfg, store, cloudKey, key, host) {
		return nil, fmt.Errorf("该云主机未保存 SSH 凭据：请先在云主机详情中配置并验证 SSH")
	}
	client, err := sshDialCloudHostClient(ctx, cfg, store, cloudKey, key, host, "", "")
	if err != nil {
		return nil, fmt.Errorf("SSH 连接失败: %w", err)
	}
	name := strings.TrimSpace(host.Name)
	if name == "" {
		name = host.ID
	}
	if vmLabel == "" {
		vmLabel = name
	}
	return &vmShipperResolvedTarget{
		Client:      client,
		TargetType:  "cloud",
		TargetID:    cloudID,
		TargetName:  name,
		VMLabel:     vmLabel,
		AuditTarget: "cloudHost=" + cloudID,
	}, nil
}

func vmLogShipperRemoteExecBash(client *ssh.Client, script string, onLine func(string)) (output string, runErr error) {
	sess, err := client.NewSession()
	if err != nil {
		return "", err
	}
	defer sess.Close()

	stdout, err := sess.StdoutPipe()
	if err != nil {
		return "", err
	}
	stderr, err := sess.StderrPipe()
	if err != nil {
		return "", err
	}
	sess.Stdin = strings.NewReader(script)

	var mu sync.Mutex
	lines := make([]string, 0, 64)
	consume := func(r io.Reader) {
		sc := bufio.NewScanner(r)
		sc.Buffer(make([]byte, 0, 64*1024), 1024*1024)
		for sc.Scan() {
			line := strings.TrimRight(sc.Text(), "\r")
			if strings.TrimSpace(line) == "" {
				continue
			}
			mu.Lock()
			lines = append(lines, line)
			mu.Unlock()
			if onLine != nil {
				onLine(line)
			}
		}
		if err := sc.Err(); err != nil {
			msg := "读取 SSH 输出失败: " + err.Error()
			mu.Lock()
			lines = append(lines, msg)
			mu.Unlock()
			if onLine != nil {
				onLine(msg)
			}
		}
	}

	remoteCmd := "/bin/bash -s"
	trimmed := strings.TrimSpace(script)
	if strings.HasPrefix(trimmed, "#!/bin/bash") {
		prefix := "#!/bin/bash\n"
		if strings.HasPrefix(trimmed, prefix) {
			body := strings.TrimPrefix(trimmed, prefix)
			// 若当前 SSH 用户可无密码 sudo，则整个安装脚本直接在 root shell 中执行，避免文件由普通用户创建。
			script = prefix + `
if [ "$(id -u)" -ne 0 ] && sudo -n true 2>/dev/null; then
  exec sudo -n /bin/bash -s <<'__KBS_ROOT_SCRIPT__'
` + body + `
__KBS_ROOT_SCRIPT__
fi
` + body + "\n"
		}
	}
	if err := sess.Start(remoteCmd); err != nil {
		return "", err
	}
	var wg sync.WaitGroup
	wg.Add(2)
	go func() { defer wg.Done(); consume(stdout) }()
	go func() { defer wg.Done(); consume(stderr) }()
	runErr = sess.Wait()
	wg.Wait()

	mu.Lock()
	defer mu.Unlock()
	return strings.TrimSpace(strings.Join(lines, "\n")), runErr
}

func vmShipperBuildInspectScript(paths []string) string {
	return fmt.Sprintf(`#!/bin/bash
set -u

printf 'CURRENT_USER=%%s\n' "$(id -un 2>/dev/null || true)"
printf 'CURRENT_UID=%%s\n' "$(id -u 2>/dev/null || true)"

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  if sudo -n true 2>/dev/null; then
    SUDO="sudo -n"
    echo "SUDO_READY=1"
  else
    echo "SUDO_READY=0"
  fi
else
  echo "SUDO_READY=1"
fi

if [ -x %q ]; then
  echo "INSTALLED=1"
  VEC_VER=$(%s --version 2>/dev/null || true)
  printf 'VECTOR_VERSION=%%s\n' "$VEC_VER"
else
  echo "INSTALLED=0"
fi

if [ -f %q ]; then
  echo "CONFIG_EXISTS=1"
else
  echo "CONFIG_EXISTS=0"
fi

ACTIVE=$($SUDO systemctl is-active %s 2>/dev/null || true)
ENABLED=$($SUDO systemctl is-enabled %s 2>/dev/null || true)
printf 'SERVICE_ACTIVE=%%s\n' "$ACTIVE"
printf 'SERVICE_ENABLED=%%s\n' "$ENABLED"

shopt -s nullglob
declare -a CHECK_PATHS=(
%s)
for P in "${CHECK_PATHS[@]}"; do
  MATCHES=($P)
  COUNT=${#MATCHES[@]}
  SAMPLE=""
  if [ "$COUNT" -gt 0 ]; then
    SAMPLE=${MATCHES[0]}
  fi
  printf 'PATHCHECK\t%%s\t%%s\t%%s\n' "$P" "$COUNT" "$SAMPLE"
done
`,
		vmShipperVectorInstallPath,
		vmShipperVectorInstallPath,
		vmShipperVectorConfigPath,
		vmShipperSystemdUnitName,
		vmShipperSystemdUnitName,
		writeBashArrayItems(paths),
	)
}

func vmShipperParseInspectOutput(out string) *vmShipperInspectState {
	st := &vmShipperInspectState{
		SSHConnected:    true,
		InstallPath:     vmShipperVectorInstallPath,
		ConfigPath:      vmShipperVectorConfigPath,
		ServiceStateRaw: "unknown",
		EnableStateRaw:  "unknown",
	}
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		switch {
		case strings.HasPrefix(line, "CURRENT_USER="):
			st.CurrentUser = strings.TrimSpace(strings.TrimPrefix(line, "CURRENT_USER="))
		case strings.HasPrefix(line, "CURRENT_UID="):
			fmt.Sscanf(strings.TrimSpace(strings.TrimPrefix(line, "CURRENT_UID=")), "%d", &st.CurrentUID)
		case strings.HasPrefix(line, "SUDO_READY="):
			st.SudoReady = strings.TrimSpace(strings.TrimPrefix(line, "SUDO_READY=")) == "1"
		case strings.HasPrefix(line, "INSTALLED="):
			st.Installed = strings.TrimSpace(strings.TrimPrefix(line, "INSTALLED=")) == "1"
		case strings.HasPrefix(line, "VECTOR_VERSION="):
			st.VectorVersion = strings.TrimSpace(strings.TrimPrefix(line, "VECTOR_VERSION="))
		case strings.HasPrefix(line, "CONFIG_EXISTS="):
			st.ConfigExists = strings.TrimSpace(strings.TrimPrefix(line, "CONFIG_EXISTS=")) == "1"
		case strings.HasPrefix(line, "SERVICE_ACTIVE="):
			st.ServiceStateRaw = strings.TrimSpace(strings.TrimPrefix(line, "SERVICE_ACTIVE="))
			st.ServiceActive = st.ServiceStateRaw == "active"
		case strings.HasPrefix(line, "SERVICE_ENABLED="):
			st.EnableStateRaw = strings.TrimSpace(strings.TrimPrefix(line, "SERVICE_ENABLED="))
			st.ServiceEnabled = st.EnableStateRaw == "enabled"
		case strings.HasPrefix(line, "PATHCHECK\t"):
			parts := strings.SplitN(line, "\t", 4)
			if len(parts) >= 3 {
				n := 0
				fmt.Sscanf(parts[2], "%d", &n)
				item := vmShipperInspectPathCheck{Path: parts[1], MatchedCount: n}
				if len(parts) >= 4 {
					item.Sample = strings.TrimSpace(parts[3])
				}
				st.PathChecks = append(st.PathChecks, item)
			}
		}
	}
	switch {
	case st.ServiceActive:
		st.Summary = "Vector 已安装且采集服务正在运行"
	case st.CurrentUID != 0 && !st.SudoReady:
		user := st.CurrentUser
		if user == "" {
			user = "当前 SSH 用户"
		}
		st.Summary = fmt.Sprintf("%s 已登录，但不能无密码执行 sudo -n；远程安装会失败", user)
	case st.Installed && st.ConfigExists:
		st.Summary = "Vector 已安装，但采集服务未运行或未启用"
	case st.Installed:
		st.Summary = "Vector 二进制已存在，但配置/服务未完整安装"
	default:
		st.Summary = "目标主机尚未安装采集服务"
	}
	return st
}

func vmShipperQuoteLogsQLValue(s string) string {
	s = strings.TrimSpace(s)
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `"`, `\"`)
	return `"` + s + `"`
}

func vmShipperVerifyIngest(ctx context.Context, app *ServerApp, vlBase, vmHost, logSource string) *vmShipperVerifyState {
	cfg := app.Cfg()
	end := time.Now().UTC()
	start := end.Add(-12 * time.Minute)
	query := fmt.Sprintf("vm_host:%s AND log_source:%s", vmShipperQuoteLogsQLValue(vmHost), vmShipperQuoteLogsQLValue(logSource))
	out := &vmShipperVerifyState{
		Attempted:   true,
		Query:       query,
		WindowStart: start.Format(time.RFC3339Nano),
		WindowEnd:   end.Format(time.RFC3339Nano),
		Message:     "正在验证日志是否已进入 VictoriaLogs",
	}
	for attempt := 1; attempt <= 3; attempt++ {
		rows, truncated, scanWarn, _, err := fetchVictoriaLogsNDJSON(ctx, cfg, vlBase, query, 5, out.WindowStart, out.WindowEnd)
		if err != nil {
			out.Error = err.Error()
			out.Message = "查询 VictoriaLogs 失败"
			return out
		}
		out.CheckedRows = len(rows)
		if len(rows) > 0 {
			out.OK = true
			out.Message = "已在 VictoriaLogs 中看到该主机/来源的最新日志"
			if truncated {
				out.Message += "（响应可能被截断）"
			}
			if scanWarn != "" {
				out.Message += "；扫描警告: " + scanWarn
			}
			if tm, ok := parseRowTime(rows[0]); ok {
				out.SampleTime = tm.Format(time.RFC3339Nano)
			}
			if msg := strings.TrimSpace(vmlogRowMsg(rows[0])); msg != "" {
				rs := []rune(msg)
				if len(rs) > 180 {
					msg = string(rs[:180]) + "…"
				}
				out.SampleMsg = msg
			}
			return out
		}
		if attempt < 3 {
			out.Message = fmt.Sprintf("尚未查到入库日志，等待采集端首批上报（第 %d/3 次）", attempt)
			select {
			case <-ctx.Done():
				out.Error = ctx.Err().Error()
				out.Message = "验证已超时"
				return out
			case <-time.After(4 * time.Second):
			}
		}
	}
	out.Message = "安装完成，但在最近时间窗内尚未查到对应日志；请确认日志路径确有新内容，并检查服务日志"
	return out
}

func vmShipperInspectRemote(ctx context.Context, app *ServerApp, body opsVmLogVmShipperBody, paths []string) (*vmShipperResolvedTarget, *vmShipperInspectState, error) {
	target, err := vmShipperResolveTarget(ctx, app, body)
	if err != nil {
		return nil, nil, err
	}
	defer target.Client.Close()

	out, runErr := vmLogShipperRemoteExecBash(target.Client, vmShipperBuildInspectScript(paths), nil)
	if runErr != nil && strings.TrimSpace(out) == "" {
		return target, nil, fmt.Errorf("检查安装状态失败: %w", runErr)
	}
	st := vmShipperParseInspectOutput(out)
	if runErr != nil {
		return target, st, fmt.Errorf("检查安装状态失败: %w", runErr)
	}
	return target, st, nil
}

func vmShipperParseProgressLine(task *vmShipperInstallTask, line string) {
	switch {
	case strings.HasPrefix(line, "__KBS_PROGRESS__|"):
		parts := strings.SplitN(line, "|", 4)
		if len(parts) == 4 {
			pct := 0
			fmt.Sscanf(parts[1], "%d", &pct)
			task.setProgress(pct, parts[2], parts[3])
		}
	case strings.HasPrefix(line, "__KBS_WARN__|"):
		msg := strings.TrimSpace(strings.TrimPrefix(line, "__KBS_WARN__|"))
		task.appendLine("警告: " + msg)
	case strings.HasPrefix(line, "__KBS_ERROR__|"):
		task.appendLine(strings.TrimSpace(strings.TrimPrefix(line, "__KBS_ERROR__|")))
	default:
		task.appendLine(line)
	}
}

func vmShipperExplainExecFailure(runErr error, output string) string {
	out := strings.TrimSpace(output)
	switch {
	case strings.Contains(out, "错误：Vector 安装包下载失败"):
		return "Vector 安装包下载失败：已依次尝试国内镜像与 GitHub 官方。请检查目标主机出站网络，或先复制脚本到主机手动执行；下方“安装输出”里可看到具体下载尝试。"
	case strings.Contains(out, "错误：需要 root，或当前用户可无密码执行 sudo"):
		return "当前 SSH 用户不能无密码执行 sudo -n，无法安装采集器。请先为该用户开放 NOPASSWD sudo。"
	case strings.Contains(out, "错误：下载流程结束但未在本机找到"):
		return "下载命令已执行，但在本机未找到预期的 Vector 包文件（常见为 root/sudo 写 /tmp 或路径不一致）。请查看安装输出中的路径与权限。"
	case strings.Contains(out, "存在但大小为 0"):
		return "Vector 安装包文件已创建但为空，可能镜像返回了错误页或拦截。请查看安装输出并更换下载源。"
	case strings.Contains(out, "错误：解压 Vector 安装包失败"):
		return "Vector 安装包已下载，但在目标主机解压失败。安装输出中现在会附带 tar 的前几行错误信息，请按该信息检查安装包、磁盘空间、tar/gzip 实现或 /tmp 权限。"
	case strings.Contains(out, "错误：Vector 服务未进入 active 状态"):
		return "Vector 已安装，但 systemd 启动后未进入 active。安装输出中已附带 systemctl status 与最近 journalctl，请按其中的配置错误、权限错误或网络错误继续排查。"
	case strings.Contains(out, "未找到 vector 二进制"):
		return "Vector 安装包已下载，但解压后未找到可执行文件，可能是镜像站返回了异常内容或安装包损坏。请查看下方安装输出。"
	case strings.Contains(out, "不支持的架构"):
		return "目标主机 CPU 架构不在当前采集器脚本支持范围内。"
	default:
		if runErr != nil {
			return fmt.Sprintf("远程执行失败（%s）。请查看下方“安装输出”获取详细原因。", runErr.Error())
		}
		return "远程执行失败，请查看下方“安装输出”获取详细原因。"
	}
}

func handleOpsVmLogVmShipperScript(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body opsVmLogVmShipperBody
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		vlBase, paths, logSrc, warn, err := vmShipperResolveRequest(app, body)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		vmLabel := strings.TrimSpace(body.VMNameLabel)
		if vmLabel == "" {
			vmLabel = "vm-unknown"
		}
		insert := vmShipperInsertURL(vlBase)
		osOpts := vmShipperOpenSearchFromBody(body)
		toml := vmShipperBuildVectorToml(insert, vmLabel, logSrc, paths, osOpts)
		vectorBaseURL := effectiveVMLogVectorDownloadBaseURL(app.Runtime(), app.Cfg())
		vectorURLAMD64 := vmShipperVectorPrimaryURL(vectorBaseURL, "x86_64-unknown-linux-gnu")
		vectorURLARM64 := vmShipperVectorPrimaryURL(vectorBaseURL, "aarch64-unknown-linux-gnu")
		var vectorCacheProbe gin.H
		if vectorBaseURL != "" {
			pctx, cancel := context.WithTimeout(c.Request.Context(), 8*time.Second)
			defer cancel()
			vectorCacheProbe = gin.H{
				"amd64": vmShipperProbeCacheURL(pctx, vectorURLAMD64),
				"arm64": vmShipperProbeCacheURL(pctx, vectorURLARM64),
			}
		}
		script := vmShipperBuildBashScript(vlBase, vectorBaseURL, vmLabel, logSrc, paths, osOpts)

		c.JSON(http.StatusOK, gin.H{
			"victoriaLogsBase":      vlBase,
			"victoriaInsertHint":    insert,
			"vectorToml":            toml,
			"bashScript":            script,
			"pathsUsed":             paths,
			"vmHostField":           vmLabel,
			"logSourceField":        logSrc,
			"vectorVersion":         vectorShipperVersion,
			"vectorDownloadBaseUrl": vectorBaseURL,
			"vectorPrimaryUrlAmd64": vectorURLAMD64,
			"vectorPrimaryUrlArm64": vectorURLARM64,
			"vectorCacheProbe":      vectorCacheProbe,
			"warning":               warn,
			"notes": []string{
				"远程安装（管理员）可选目标：① 应用中心「云主机」登记的主机（cloudHostId）；② vCenter 纳管的虚拟机（vcenterVmMoref，与 SSH 终端相同凭据：Guest IP + 全局 VCENTER_VM_SSH_* 或虚拟机详情中已保存密码/密钥）。",
				func() string {
					if vectorBaseURL != "" {
						return "Vector 下载会优先使用后台配置的本地基址：" + vectorBaseURL + "（文件名需保持 vector-版本-架构.tar.gz）"
					}
					return "Vector 下载默认走 GitHub 官方 release，并自动尝试多条国内镜像线。"
				}(),
				func() string {
					if vectorBaseURL != "" {
						return "远程脚本 VECTOR_URLS 的第一项为上述本地基址对应的 vector-版本-架构.tar.gz；该项失败后再依次尝试 ghproxy / mirror.ghproxy / ghfast.top / gitclone / kkgithub，最后回源 GitHub（单线约 5 分钟超时后换线）。"
					}
					return "安装脚本拉取 Vector 时会优先尝试 ghproxy / mirror.ghproxy / ghfast.top / gitclone / kkgithub，最后回源 GitHub；单线约 5 分钟超时后自动换线（与国内 K8s 清单下载策略类似）。"
				}(),
				"采集格式当前默认按纯文本写入 _msg，优先保证 Vector 服务稳定启动；如需 JSON 结构化解析，可在虚拟机侧自行调整 " + vmShipperVectorConfigPath + " 中的 remap。",
				"采集进程以 root（或 sudo -n）安装 Vector 与 systemd 服务，以便读取宝塔/Nginx/MySQL 等常见只读 root 的日志文件。",
				"默认建议一并采集 Linux 系统日志（CentOS / Ubuntu 常见路径），如 /var/log/messages、/var/log/secure、/var/log/syslog、/var/log/auth.log。",
				"若日志为二进制或需解析多行 JSON，可在虚拟机侧自行调整 " + vmShipperVectorConfigPath + " 中的 remap，或增加 Vector transforms。",
				"LogsQL 示例：vm_host:" + vmLabel + " AND log_source:" + logSrc,
			},
		})
	}
}

func handleOpsVmLogVmShipperInspect(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body opsVmLogVmShipperBody
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		_, paths, logSrc, warn, err := vmShipperResolveRequest(app, body)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 90*time.Second)
		defer cancel()
		target, inspect, err := vmShipperInspectRemote(ctx, app, body, paths)
		if err != nil {
			targetType := ""
			targetID := ""
			targetName := ""
			if target != nil {
				targetType = target.TargetType
				targetID = target.TargetID
				targetName = target.TargetName
			}
			c.JSON(http.StatusBadGateway, gin.H{
				"error":      err.Error(),
				"warning":    warn,
				"logSource":  logSrc,
				"targetType": targetType,
				"targetId":   targetID,
				"targetName": targetName,
				"inspect":    inspect,
			})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"ok":         true,
			"warning":    warn,
			"logSource":  logSrc,
			"targetType": target.TargetType,
			"targetId":   target.TargetID,
			"targetName": target.TargetName,
			"inspect":    inspect,
		})
	}
}

func handleOpsVmLogVmShipperTaskGet(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		taskID := strings.TrimSpace(c.Param("taskId"))
		task, ok := vmShipperTaskGet(taskID)
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "任务不存在或已过期"})
			return
		}
		c.JSON(http.StatusOK, task.snapshot())
	}
}

func handleOpsVmLogVmShipperTaskList(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		limit := 12
		if s := strings.TrimSpace(c.Query("limit")); s != "" {
			if n, err := strconv.Atoi(s); err == nil && n > 0 && n <= 50 {
				limit = n
			}
		}
		c.JSON(http.StatusOK, gin.H{"tasks": vmShipperTaskList(limit)})
	}
}

func handleOpsVmLogVmShipperApply(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body opsVmLogVmShipperBody
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		vlBase, paths, logSrc, warn, err := vmShipperResolveRequest(app, body)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		targetID := strings.TrimSpace(body.CloudHostID)
		targetType := "cloud"
		if strings.TrimSpace(body.VCenterVMMoref) != "" {
			targetType = "vcenter"
			targetID = strings.TrimSpace(body.VCenterVMMoref)
		}
		vmLabel := strings.TrimSpace(body.VMNameLabel)
		if vmLabel == "" {
			vmLabel = targetID
		}
		task := newVmShipperInstallTask(targetType, targetID, targetID, vmLabel, logSrc, paths)
		vmShipperTaskStore.Store(task.ID, task)

		user := dashboardUsernameFromGin(c)
		clientIP := c.ClientIP()
		method := c.Request.Method
		path := c.Request.URL.Path
		go func(body opsVmLogVmShipperBody, task *vmShipperInstallTask, user, clientIP, method, path, vlBase, logSrc string, paths []string) {
			ctx, cancel := context.WithTimeout(context.Background(), 12*time.Minute)
			defer cancel()

			task.setProgress(6, "connect", "正在建立 SSH 连接")
			target, err := vmShipperResolveTarget(ctx, app, body)
			if err != nil {
				task.finishError(err.Error(), nil)
				AppendAuditRecord(app, AuditRecord{
					Action: "vmlog_vm_shipper_apply_fail",
					IP:     clientIP,
					User:   user,
					Method: method,
					Path:   path,
					Status: http.StatusBadGateway,
					Detail: truncateErrMessage(err.Error(), 800),
				})
				return
			}
			task.mu.Lock()
			task.TargetType = target.TargetType
			task.TargetID = target.TargetID
			task.TargetName = target.TargetName
			task.VMHost = target.VMLabel
			task.mu.Unlock()

			defer target.Client.Close()
			task.setProgress(12, "inspect", "已连接主机，检查当前安装状态")
			beforeInspect, _ := func() (*vmShipperInspectState, error) {
				out, runErr := vmLogShipperRemoteExecBash(target.Client, vmShipperBuildInspectScript(paths), nil)
				if runErr != nil && strings.TrimSpace(out) == "" {
					return nil, runErr
				}
				return vmShipperParseInspectOutput(out), nil
			}()
			if beforeInspect != nil {
				task.setInspect(beforeInspect)
			}
			if beforeInspect != nil && beforeInspect.CurrentUID != 0 && !beforeInspect.SudoReady {
				user := beforeInspect.CurrentUser
				if user == "" {
					user = "当前 SSH 用户"
				}
				msg := fmt.Sprintf("%s 已通过 SSH 登录，但不能无密码执行 sudo -n；vmlog 采集器安装需要写入 /usr/local/bin、/etc/vector 和 systemd，请先给该用户开放 NOPASSWD sudo。", user)
				task.finishError(msg, beforeInspect)
				AppendAuditRecord(app, AuditRecord{
					Action: "vmlog_vm_shipper_apply_fail",
					IP:     clientIP,
					User:   user,
					Method: method,
					Path:   path,
					Status: http.StatusBadGateway,
					Detail: fmt.Sprintf("%s preflight=%s", target.AuditTarget, truncateErrMessage(msg, 800)),
				})
				return
			}

			vectorBaseURL := effectiveVMLogVectorDownloadBaseURL(app.Runtime(), app.Cfg())
			osOpts := vmShipperOpenSearchFromBody(body)
			script := vmShipperBuildBashScript(vlBase, vectorBaseURL, target.VMLabel, logSrc, paths, osOpts)
			task.setProgress(20, "install", "开始后台安装采集服务")
			// 仅通过 onLine 回调解析输出；不要再遍历 output，否则会与流式回调重复追加同一行
			output, runErr := vmLogShipperRemoteExecBash(target.Client, script, func(line string) {
				vmShipperParseProgressLine(task, line)
			})

			finalInspect, _ := func() (*vmShipperInspectState, error) {
				out, runErr := vmLogShipperRemoteExecBash(target.Client, vmShipperBuildInspectScript(paths), nil)
				if runErr != nil && strings.TrimSpace(out) == "" {
					return nil, runErr
				}
				return vmShipperParseInspectOutput(out), nil
			}()

			if runErr != nil {
				msg := vmShipperExplainExecFailure(runErr, output)
				task.finishError(msg, finalInspect)
				AppendAuditRecord(app, AuditRecord{
					Action: "vmlog_vm_shipper_apply_fail",
					IP:     clientIP,
					User:   user,
					Method: method,
					Path:   path,
					Status: http.StatusBadGateway,
					Detail: fmt.Sprintf("%s err=%v out=%s", target.AuditTarget, runErr, truncateErrMessage(output, 800)),
				})
				return
			}

			okMsg := "后台安装完成，可在下方查看服务状态与输出"
			task.setProgress(96, "verify", "验证日志是否已进入 VictoriaLogs")
			verify := vmShipperVerifyIngest(ctx, app, vlBase, target.VMLabel, logSrc)
			task.setVerify(verify)
			if verify != nil && verify.OK {
				okMsg = "后台安装完成，且已在 VictoriaLogs 中看到首批日志"
			} else if verify != nil && strings.TrimSpace(verify.Message) != "" {
				okMsg = "后台安装完成；" + verify.Message
			}
			task.finishSuccess(okMsg, finalInspect)
			AppendAuditRecord(app, AuditRecord{
				Action: "vmlog_vm_shipper_apply_ok",
				IP:     clientIP,
				User:   user,
				Method: method,
				Path:   path,
				Status: http.StatusOK,
				Detail: fmt.Sprintf("%s vm_host=%s log_source=%s", target.AuditTarget, target.VMLabel, logSrc),
			})
		}(body, task, user, clientIP, method, path, vlBase, logSrc, paths)

		c.JSON(http.StatusOK, gin.H{
			"accepted": true,
			"taskId":   task.ID,
			"phase":    task.Phase,
			"progress": task.Progress,
			"warning":  warn,
			"message":  "后台安装任务已创建",
		})
	}
}

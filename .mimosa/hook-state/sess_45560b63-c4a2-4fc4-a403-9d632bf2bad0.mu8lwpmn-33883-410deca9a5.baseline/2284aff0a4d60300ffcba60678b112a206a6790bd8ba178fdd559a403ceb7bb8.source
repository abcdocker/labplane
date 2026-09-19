// Package mesh_joingoing 打包 Windows 一键加入工具 ZIP 下载包。
// 内含 .bat 启动器 + tsjoin.ps1（GUI 脚本）+ tsjoin.json（配置），解压双击 .bat 即可。
package mesh_joingoing

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
)

// ToolConfig 一键加入工具的配置参数（由上层填充实际值）。
type ToolConfig struct {
	Server    string `json:"server"`
	AuthKey   string `json:"authkey"`
	Hostname  string `json:"hostname"`
	ReportURL string `json:"reportUrl"`
}

// BuildZip 生成一键加入工具 ZIP 包。
func BuildZip(cfg ToolConfig) ([]byte, error) {
	cfgRaw, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return nil, err
	}

	buf := new(bytes.Buffer)
	zw := zip.NewWriter(buf)

	for _, f := range []struct{ name, data string }{
		{"tsjoin.ps1", joinPS},
		{"tsjoin.json", string(cfgRaw)},
		{"加入节点.bat", joinBat},
		{"使用说明.txt", readme(cfg.Server, cfg.Hostname)},
	} {
		fw, err := zw.Create(f.name)
		if err != nil {
			return nil, err
		}
		if _, err := fw.Write([]byte(f.data)); err != nil {
			return nil, err
		}
	}

	if err := zw.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

const joinBat = `@echo off
chcp 65001 >nul 2>&1
title Tailscale 加入工具
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tsjoin.ps1"
if %ERRORLEVEL% neq 0 (
    echo.
    echo 运行出错，请截图联系管理员。
    pause
)
`

const joinPS = `# ============================================================
#  Tailscale 一键加入工具（kube-bt-sync 平台生成）
#  从同目录 tsjoin.json 读取配置
# ============================================================
$ErrorActionPreference = "SilentlyContinue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$cfgPath = Join-Path $PSScriptRoot "tsjoin.json"
$cfg = Get-Content $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json
$Server   = $cfg.server
$AuthKey  = $cfg.authkey
$Hostname = $cfg.hostname
$ReportURL = $cfg.reportUrl

# 自动申请管理员权限
$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$pr = New-Object Security.Principal.WindowsPrincipal($id)
if (-not $pr.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Start-Process powershell.exe -Verb RunAs -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File "' + $PSCommandPath + '"')
    exit
}

Add-Type -AssemblyName System.Windows.Forms | Out-Null
Add-Type -AssemblyName System.Drawing | Out-Null

$form = New-Object System.Windows.Forms.Form
$form.Text = "Tailscale 加入工具"
$form.ClientSize = New-Object System.Drawing.Size(580, 470)
$form.StartPosition = "CenterScreen"
$form.TopMost = $true

$lblSrv = New-Object System.Windows.Forms.Label
$lblSrv.Text = "服务器: $Server"
$lblSrv.SetBounds(14, 12, 540, 20)
$form.Controls.Add($lblSrv)

$lblHost = New-Object System.Windows.Forms.Label
$lblHost.Text = "本机主机名:"
$lblHost.SetBounds(14, 38, 90, 20)
$form.Controls.Add($lblHost)

$txtHost = New-Object System.Windows.Forms.TextBox
$txtHost.Text = $Hostname
$txtHost.SetBounds(110, 35, 300, 22)
$form.Controls.Add($txtHost)

$log = New-Object System.Windows.Forms.TextBox
$log.Multiline = $true
$log.ReadOnly = $true
$log.ScrollBars = "Vertical"
$log.SetBounds(14, 110, 552, 220)
$form.Controls.Add($log)

function Log($t) { $log.AppendText($t + [Environment]::NewLine) }

$btnDeps = New-Object System.Windows.Forms.Button
$btnDeps.Text = "检查依赖"
$btnDeps.SetBounds(14, 66, 120, 30)
$form.Controls.Add($btnDeps)
$btnDeps.Add_Click({
    Log "── 依赖检查 ──"
    foreach ($svc in @("nsi","Winmgmt","Dhcp","Dnscache","iphlpsvc")) {
        $s = Get-Service -Name $svc -ErrorAction SilentlyContinue
        if ($s) {
            if ($s.StartType -ne "Automatic") { Set-Service -Name $svc -StartupType Automatic }
            if ($s.Status -ne "Running") { Start-Service -Name $svc }
            Log "[OK] 服务 $svc"
        } else { Log "[!] 服务缺失 $svc" }
    }
    if (Test-Path "C:\Program Files\Tailscale\tailscale.exe") {
        Log "[OK] Tailscale 已安装"
    } else { Log "[X] 未安装 Tailscale" }
})

$btnJoin = New-Object System.Windows.Forms.Button
$btnJoin.Text = "加入网络"
$btnJoin.SetBounds(142, 66, 120, 30)
$form.Controls.Add($btnJoin)
$btnJoin.Add_Click({
    $tsExe = "C:\Program Files\Tailscale\tailscale.exe"
    if (-not (Test-Path $tsExe)) {
        Log "[X] 未安装 Tailscale，请先安装"
        return
    }
    Log "正在使用密钥加入网络..."
    $out = & $tsExe up --reset --login-server=$Server --authkey=$AuthKey --hostname=$txtHost.Text --accept-routes --accept-dns=true 2>&1 | Out-String
    Log $out.Trim()
    Log "=== 已加入网络 ==="
})

$lblStatus = New-Object System.Windows.Forms.Label
$lblStatus.Text = "就绪"
$lblStatus.SetBounds(14, 96, 200, 16)
$form.Controls.Add($lblStatus)

Log "工具加载完成，点击「加入网络」开始"
[void]$form.ShowDialog()
`

func readme(server, hostname string) string {
	return fmt.Sprintf(`Tailscale 一键加入工具（由 kube-bt-sync 平台生成）

服务器地址: %s
本机主机名: %s

使用步骤:
  1. 解压本目录到任意位置
  2. 双击「加入节点.bat」（如提示管理员权限请允许）
  3. 程序自动检查依赖并加入网络
  4. 浏览器跳转 Authentik SSO 登录（如需要）

注意:
  - tsjoin.json 内含加入密钥，请勿外传
`, server, hostname)
}

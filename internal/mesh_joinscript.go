package internal

import "strings"

// BuildWindowsJoinScript 生成 Windows 一键加入 PowerShell 工具（WinForms GUI）。
// rejoin=false（首次加入）：依赖检查/修复 → 缺依赖提示并默认下载到下载目录安装 →
// 使用平台下发的可复用 authkey 免浏览器加入（--reset 生成新节点）→ 成功后回传设备名。
// rejoin=true（重新连接）：不带 --reset/--authkey——OIDC SSO 授权刷新，
// headscale 按 machine key 匹配回原节点身份，不产生新节点、授权不过期。
func BuildWindowsJoinScript(server, authkey, hostname, platform, instanceID, user string, rejoin bool) string {
	mode := "首次加入（新设备）"
	if rejoin {
		mode = "重新连接（保留原节点）"
	}

	// Join-Network 参数段：按模式精确生成
	var args []string
	args = append(args, `$tail = @("up")`)
	args = append(args, `$tail += "--login-server=$Server"`)
	if authkey != "" {
		args = append(args, `$tail += "--authkey=$AuthKey"`)
	}
	args = append(args, `$tail += "--hostname=$Hostname"`)
	args = append(args, `$tail += "--accept-routes"`)
	args = append(args, `$tail += "--accept-dns=true"`)

	t := `# ============================================================
#  Tailscale 一键加入工具（kube-bt-sync 平台生成）
#  服务器: __SERVER__    主机名: __HOSTNAME__    模式: __MODE__
#  归属用户: __USER__
#  注意: 首次加入模式脚本内含加入密钥，请勿外传
# ============================================================
$ErrorActionPreference = "SilentlyContinue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Server       = "__SERVER__"
$AuthKey      = "__AUTHKEY__"
$Hostname     = "__HOSTNAME__"
$Platform     = "__PLATFORM__"
$Instance     = "__INSTANCE__"
$TailscaleExe = "C:\Program Files\Tailscale\tailscale.exe"
$InstallerUrl = "https://d.frps.cn/file/tools/headscale/tailscale-setup-1.98.4.exe"

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
$form.ClientSize = New-Object System.Drawing.Size(560, 480)
$form.StartPosition = "CenterScreen"
$form.TopMost = $true

$log = New-Object System.Windows.Forms.TextBox
$log.Multiline = $true
$log.ReadOnly = $true
$log.ScrollBars = "Vertical"
$log.SetBounds(12, 10, 524, 238)
$form.Controls.Add($log)

function Log($t) { $log.AppendText($t + [Environment]::NewLine) }

function Report-Join {
    try {
        Invoke-RestMethod -Uri ($Platform + "/api/ops/mesh/instances/" + $Instance + "/join-report") -Method Post -ContentType "application/json" -Body (ConvertTo-Json @{hostname = $Hostname; authkey = $AuthKey}) -TimeoutSec 8 | Out-Null
        Log ("已回传设备信息到平台（归属用户 " + "__USER__" + "）")
    } catch { Log "回传设备信息失败（不影响加入）" }
}

function Join-Network {
__JOINARGS__
    return (& $TailscaleExe @tail 2>&1) | Out-String
}

function Deps-Check {
    Log "── 依赖检查 ──"
    $allOk = $true
    $id2 = [Security.Principal.WindowsIdentity]::GetCurrent()
    $pr2 = New-Object Security.Principal.WindowsPrincipal($id2)
    if ($pr2.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { Log "[OK] 管理员权限" } else { Log "[X] 非管理员，请右键以管理员身份运行"; $allOk = $false }
    foreach ($svc in @("nsi", "Winmgmt", "Dhcp", "Dnscache", "iphlpsvc")) {
        $s = Get-Service -Name $svc -ErrorAction SilentlyContinue
        if ($s) {
            if ($s.StartType -ne "Automatic") { Set-Service -Name $svc -StartupType Automatic }
            if ($s.Status -ne "Running") { Start-Service -Name $svc }
            Log ("[OK] 服务 " + $svc)
        } else { Log ("[!] 服务缺失 " + $svc) }
    }
    if (Test-Path $TailscaleExe) { Log "[OK] Tailscale 客户端已安装" } else { Log "[X] 未安装 Tailscale 客户端，请点击 2 下载安装"; $allOk = $false }
    if ($allOk) { Log "依赖检查全部通过，可直接点击 3 加入网络" }
    return $allOk
}

$bDeps = New-Object System.Windows.Forms.Button
$bDeps.Text = "1. 检查并修复依赖"
$bDeps.SetBounds(12, 258, 170, 36)
$form.Controls.Add($bDeps)

$bInst = New-Object System.Windows.Forms.Button
$bInst.Text = "2. 下载安装 Tailscale"
$bInst.SetBounds(190, 258, 170, 36)
$form.Controls.Add($bInst)

$bJoin = New-Object System.Windows.Forms.Button
$bJoin.Text = "3. 加入网络"
$bJoin.SetBounds(368, 258, 170, 36)
$form.Controls.Add($bJoin)

$bLogin = New-Object System.Windows.Forms.Button
$bLogin.Text = "打开登录页面 (Authentik SSO)"
$bLogin.SetBounds(12, 302, 250, 36)
$bLogin.Visible = $false
$form.Controls.Add($bLogin)

$st = New-Object System.Windows.Forms.Label
$st.SetBounds(12, 350, 524, 110)
$st.Text = "依赖状态：未检查。步骤：1 检查依赖 -> 2 下载安装（如缺失）-> 3 加入网络。"
$form.Controls.Add($st)

$bDeps.Add_Click({
    $r = Deps-Check
    if (-not $r) { Log "请先解决上面标 [X] 的依赖（缺客户端点 2）" }
})

$bInst.Add_Click({
    $dst = Join-Path ($env:USERPROFILE + "\Downloads") ("tailscale-setup-" + (Get-Date -Format "HHmmss") + ".exe")
    Log ("下载到默认下载目录: " + $dst)
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $InstallerUrl -OutFile $dst -UseBasicParsing
        Log "下载完成，启动安装（默认参数，自动等待完成）..."
        Start-Process -FilePath $dst -ArgumentList "/quiet" -Wait
        if (Test-Path $TailscaleExe) { Log "[OK] Tailscale 安装完成" } else { Log "[!] 安装已执行，请确认客户端是否就绪" }
    } catch { Log ("下载/安装失败: " + $_.Exception.Message) }
})

$bJoin.Add_Click({
    Log "正在加入网络..."
    $out = Join-Network
    Log ($out.Trim())
    if ($LASTEXITCODE -eq 0 -or $out -match "Success") {
        Log "=== 加入成功，设备已上线 ==="
        Report-Join
        return
    }
    if ($out -match "authkey|key expired|invalid") { Log "密钥无效或已过期：请在平台重新生成默认密钥并重新下载本工具。" }
    Log "尝试 Authentik SSO 登录兜底..."
    $out2 = (& $TailscaleExe up --login-server=$Server --hostname=$Hostname --accept-routes --accept-dns=true 2>&1) | Out-String
    Log ($out2.Trim())
    $m = [regex]::Match($out2, "https://\S+")
    if ($m.Success) {
        $script:registerUrl = $m.Value
        $bLogin.Visible = $true
        Log "已生成登录链接，请点击「打开登录页面」完成 Authentik SSO"
    } else { Log "未获取到登录链接，请手动执行 tailscale login --login-server=$Server" }
})

$bLogin.Add_Click({
    if ($script:registerUrl) { Start-Process $script:registerUrl }
})

Log ("服务器: " + $Server)
Log ("主机名: " + $Hostname)
Log "点击 1 开始依赖检查"

$form.ShowDialog() | Out-Null
`
	// Join-Network 参数段按模式生成
	joinArgs := strings.Join(args, "\n")
	joinArgs = strings.ReplaceAll(joinArgs, "__JOINARGS__", "")
	r := strings.NewReplacer(
		"__SERVER__", server,
		"__AUTHKEY__", authkey,
		"__HOSTNAME__", hostname,
		"__PLATFORM__", platform,
		"__INSTANCE__", instanceID,
		"__USER__", user,
		"__MODE__", mode,
		"__JOINARGS__", joinArgs,
	)
	return r.Replace(t)
}

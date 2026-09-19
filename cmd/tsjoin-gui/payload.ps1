# ============================================================
#  Tailscale 一键加入工具（kube-bt-sync 平台生成）
#  从同目录 tsjoin.json 读取配置
# ============================================================
$ErrorActionPreference = "SilentlyContinue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$cfgPath = Join-Path "__CFGDIR__" "tsjoin.json"
$cfg = Get-Content $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json
$Server   = $cfg.server
$AuthKey  = $cfg.authkey
$Hostname = $cfg.hostname

# 自动申请管理员权限
$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$pr = New-Object Security.Principal.WindowsPrincipal($id)
if (-not $pr.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Start-Process powershell.exe -Verb RunAs -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File "' + $PSCommandPath + '"')
    exit
}

Add-Type -AssemblyName System.Windows.Forms | Out-Null
Add-Type -AssemblyName System.Drawing | Out-Null

# ── 主窗口 ──
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

# ── 检查依赖 ──
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

# ── 加入网络 ──
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

# ── 状态 ──
$lblStatus = New-Object System.Windows.Forms.Label
$lblStatus.Text = "就绪"
$lblStatus.SetBounds(14, 96, 200, 16)
$form.Controls.Add($lblStatus)

Log "工具加载完成，点击「加入网络」开始"
[void]$form.ShowDialog()

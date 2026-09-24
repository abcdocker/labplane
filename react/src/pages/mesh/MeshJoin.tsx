import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, Check, Copy, Download, ExternalLink, HelpCircle,
  Loader2, LogIn, RefreshCw, ShieldCheck,
} from "lucide-react";
import { apiGetJson, apiPostJson } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// 加入节点页：分步引导（选设备 → 装客户端 → 加入 → SSO）。
// Windows 提供平台动态生成的一键加入工具（依赖检查/下载/authkey 免浏览器/回传设备名）。

type MeshInstanceLite = { id: string; name: string; apiUrl: string; enabled: boolean };
type Device = { id: string; emoji: string; name: string; desc: string };

const DEVICES: Device[] = [
  { id: "windows", emoji: "🪟", name: "Windows", desc: "一键加入工具 / PowerShell" },
  { id: "macos", emoji: "🍎", name: "macOS", desc: "一键加入工具 / 终端命令" },
  { id: "linux", emoji: "🐧", name: "Linux", desc: "终端命令" },
  { id: "ios", emoji: "📱", name: "iPhone / iPad", desc: "Tailscale App" },
  { id: "android", emoji: "🤖", name: "Android", desc: "Tailscale App" },
];

const MeshJoin: React.FC = () => {
  const instancesQ = useQuery({
    queryKey: ["mesh-instances-join"],
    queryFn: () => apiGetJson<{ instances: MeshInstanceLite[] }>("/api/ops/mesh/instances"),
  });
  const instances = instancesQ.data?.instances ?? [];
  const inst = instances.find((i) => i.enabled) ?? instances[0];
  const server = (inst?.apiUrl ?? "https://headscale.frps.cn").replace(/\/+$/, "");

  const [device, setDevice] = React.useState("windows");
  const [hostname, setHostname] = React.useState("");
  const [copied, setCopied] = React.useState("");
  const [scriptBusy, setScriptBusy] = React.useState(false);
  const [joinMode, setJoinMode] = React.useState<"first" | "rejoin">("first");
  const [rejoinNodeId, setRejoinNodeId] = React.useState("");
  const hnOk = /^[A-Za-z0-9._-]*$/.test(hostname.trim());
  const hn = hostname.trim();

  // 重连模式：拉取该实例节点明细，用于选择"上次加入过的设备"
  const rejoinQ = useQuery({
    queryKey: ["mesh-join-nodes", inst?.id],
    queryFn: () => apiGetJson<{ nodes: { id: string; givenName?: string; name?: string; user?: { name?: string }; online?: boolean; lastSeen?: string }[] }>(`/api/ops/mesh/instances/${inst?.id}/discover`),
    enabled: joinMode === "rejoin" && Boolean(inst?.id),
    staleTime: 30_000,
  });
  const rejoinNodes = rejoinQ.data?.nodes ?? [];

  const isAdmin = true; // join-script 含密钥仅管理员可下载；按钮由后端鉴权兜底

  // 默认加入密钥（可复用）
  const dkQ = useQuery({
    queryKey: ["mesh-default-key", inst?.id],
    queryFn: () => apiGetJson<Record<string, any>>(`/api/ops/mesh/instances/${inst?.id}/keys/default`),
    enabled: Boolean(inst?.id) && isAdmin,
  });
  const dk = dkQ.data ?? {};
  const [dkFull, setDkFull] = React.useState("");
  const [dkUser, setDkUser] = React.useState("");
  const [dkBusy, setDkBusy] = React.useState(false);
  const dkUsers = (dk.users as { id: string; name: string }[] | undefined) ?? [];
  const selUser = dkUser || dkUsers[0]?.name || "";

  const copy = async (text: string, tag: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      window.setTimeout(() => setCopied(""), 1500);
    } catch {
      /* ignore */
    }
  };

  const hnArg = hn || "<设备主机名>";
  // 重连模式：不带 --reset（headscale 按 machine key 匹配回原节点，不产生新节点、授权刷新）
  const resetPart = joinMode === "rejoin" ? "" : "--reset \\\n  ";
  const macCmd = `sudo tailscale up ${resetPart}\\\n  --login-server=${server} \\\n  --hostname=${hnArg} \\\n  --accept-routes \\\n  --accept-dns=true`;
  const linuxCmd = `curl -fsSL https://tailscale.com/install.sh | sh\nsudo tailscale up ${resetPart}\\\n  --login-server=${server} \\\n  --hostname=${hnArg} \\\n  --accept-routes \\\n  --accept-dns=true`;
  const winCmd = `& "C:\\Program Files\\Tailscale\\tailscale.exe" up ${joinMode === "rejoin" ? "" : "\\`\\n  --reset `\\n"}  --login-server=${server} \\\n  --hostname=${hnArg} \\\n  --accept-routes \\\n  --accept-dns=true`;

  const CodeCard: React.FC<{ tag: string; text: string; label?: string }> = ({ tag, text, label }) => (
    <div className="rounded-lg border border-slate-700/60 bg-slate-900 p-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        {label ? <span className="font-mono text-[10px] text-slate-400">{label}</span> : <span />}
        <button type="button" onClick={() => copy(text, tag)}
          className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] transition-colors",
            copied === tag ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-400" : "border-slate-600 text-slate-300 hover:bg-slate-800")}>
          {copied === tag ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {copied === tag ? "已复制" : "复制"}
        </button>
      </div>
      <pre className="overflow-x-auto whitespace-pre font-mono text-[11px] leading-relaxed text-slate-100">{text}</pre>
    </div>
  );

  const downloadZip = async (os: "windows" | "macos" = "windows") => {
    if (!inst?.id) return;
    setScriptBusy(true);
    try {
      const res = await fetch(`/api/ops/mesh/instances/${inst.id}/join-tool?os=${os}&hostname=${encodeURIComponent(hn || "device")}`, { credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = os === "macos" ? "tailscale-join-macos.zip" : "tailscale-join-tool.zip";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setScriptBusy(false);
    }
  };

  const downloadScript = async () => {
    if (!inst?.id) return;
    setScriptBusy(true);
    try {
      const res = await fetch(`/api/ops/mesh/instances/${inst.id}/keys/join-script?hostname=${encodeURIComponent(hn || "device")}`, { credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const text = await res.text();
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `tailscale-join-${hn || "device"}.ps1`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setScriptBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <LogIn className="h-6 w-6 text-indigo-600" /> 加入节点
          </h1>
          <p className="mt-1 text-sm text-slate-600">三步接入：选设备类型 → 装客户端并执行命令 → Authentik SSO 登录（Windows / macOS 支持免浏览器一键工具）。</p>
        </div>
        <a href={(() => { try { return new URL(server).origin + "/admin"; } catch { return server; } })()} target="_blank" rel="noreferrer"
          className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-600 hover:border-indigo-300 hover:text-indigo-600">
          <ExternalLink className="mr-1 h-3.5 w-3.5" /> 管理后台
        </a>
      </div>

      {/* 登录服务器 */}
      <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-indigo-900">
            <LogIn className="h-3.5 w-3.5" /> 登录服务器（{inst?.name ?? "默认"}）
          </p>
          <button type="button" onClick={() => copy(server, "server")}
            className={cn("inline-flex items-center gap-1 rounded-full border px-3 py-1 font-mono text-[11px] transition-colors",
              copied === "server" ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-100")}>
            {server}
            {copied === "server" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {/* Step 1：设备类型（动画选择） */}
      <div>
        <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-800">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">1</span>
          选择设备类型
        </p>
        <style>{`@keyframes meshCardIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {DEVICES.map((d, i) => (
            <button key={d.id} type="button" onClick={() => setDevice(d.id)}
              style={{ animation: `meshCardIn .35s ease-out ${i * 0.05}s both` }}
              className={cn(
                "group relative rounded-2xl border p-4 text-left transition-all duration-200",
                device === d.id
                  ? "-translate-y-0.5 border-indigo-400 bg-gradient-to-b from-indigo-50 to-white shadow-md"
                  : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md",
              )}>
              <span className="text-2xl transition-transform duration-200 group-hover:scale-110">{d.emoji}</span>
              <p className={cn("mt-1.5 text-xs font-semibold", device === d.id ? "text-indigo-700" : "text-slate-800")}>{d.name}</p>
              <p className="text-[10px] text-slate-400">{d.desc}</p>
              {device === d.id ? (
                <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[9px] text-white">✓</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {/* Step 2：按设备展示 */}
      <div>
        <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-800">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">2</span>
          安装客户端并执行加入命令
          <span className="ml-2 inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
            <button type="button"
              className={cn("h-6 rounded-md px-2.5 text-[10px] transition-colors", joinMode === "first" ? "bg-indigo-600 font-medium text-white" : "text-slate-500 hover:text-slate-700")}
              onClick={() => setJoinMode("first")}>
              首次加入（新设备）
            </button>
            <button type="button"
              className={cn("h-6 rounded-md px-2.5 text-[10px] transition-colors", joinMode === "rejoin" ? "bg-indigo-600 font-medium text-white" : "text-slate-500 hover:text-slate-700")}
              onClick={() => setJoinMode("rejoin")}>
              重新连接（已有设备 · 保留原节点）
            </button>
          </span>
        </p>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-slate-600">设备主机名：</span>
          <input value={hostname} onChange={(e) => setHostname(e.target.value)} placeholder="例如：ops-nas、macbook-pro"
            className={cn("h-8 w-60 rounded-md border bg-white px-3 text-xs", hnOk ? "border-slate-200" : "border-red-300")} />
          {hostname && !hnOk ? <span className="text-[10px] text-red-500">只能包含字母、数字、点、下划线、横线</span> : null}
        </div>

        {joinMode === "rejoin" ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50/50 p-2.5">
            <span className="text-[11px] text-slate-600">选择上次加入过的设备（主机名将自动填入，重新连接不产生新节点、授权刷新不过期）：</span>
            <select className="h-8 rounded border border-slate-200 bg-white px-2 text-xs" value={rejoinNodeId}
              onChange={(e) => {
                setRejoinNodeId(e.target.value);
                const n = rejoinNodes.find((x) => x.id === e.target.value);
                if (n) setHostname(n.givenName || n.name || "");
              }}>
              <option value="">— 选择节点 —</option>
              {rejoinNodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.givenName || n.name} · {n.online ? "在线" : "离线"} {n.lastSeen ? `· ${new Date(n.lastSeen).toLocaleDateString()}` : ""}
                </option>
              ))}
            </select>
            {(() => {
              const n = rejoinNodes.find((x) => x.id === rejoinNodeId);
              return n?.user?.name ? <span className="text-[10px] text-slate-400">归属用户：{n.user.name}</span> : null;
            })()}
          </div>
        ) : null}

        {device === "windows" ? (
          <div className="space-y-3">
            {/* Windows 一键工具 */}
            <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50/70 to-white p-4">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-indigo-900">
                <ShieldCheck className="h-3.5 w-3.5" /> 推荐方式：一键加入工具（自动检查依赖 / 下载客户端 / 免浏览器加入）
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" disabled={scriptBusy} onClick={() => downloadZip("windows")}
                  className="inline-flex h-8 items-center rounded-md bg-indigo-600 px-3 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                  {scriptBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 h-3.5 w-3.5" />}
                  下载 Windows 工具 (.zip)
                </button>
                <button type="button" disabled={!isAdmin || scriptBusy} onClick={downloadScript}
                  className="inline-flex h-8 items-center rounded-md border border-slate-200 px-3 text-xs text-slate-600 hover:border-slate-300 disabled:opacity-50">
                  {scriptBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 h-3.5 w-3.5" />}
                  下载 PowerShell (.ps1)
                </button>
              </div>
              <p className="mt-1.5 text-[10px] text-indigo-700/80">
                解压 zip → 双击「加入节点.bat」（自动申请管理员）。工具会：检查依赖并修复 →
                缺客户端时下载到下载目录并安装（默认参数）→ 使用平台密钥直接加入（无需浏览器）。
              </p>
              {!isAdmin ? <p className="mt-1 text-[10px] text-amber-600">工具内含密钥，仅管理员可下载。</p> : null}
            </div>

            {/* 默认加入密钥（可复用） */}
            {isAdmin && inst?.id && joinMode === "first" ? (
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-800">默认加入密钥（可复用 · 避免每次申请新密钥）</p>
                  <button type="button" onClick={() => {
                    setDkBusy(true);
                    apiPostJson<{ key: string }>(`/api/ops/mesh/instances/${inst.id}/keys/default/reset`, { user: selUser, days: 90 })
                      .then((res) => { setDkFull(res.key ?? ""); dkQ.refetch(); toast.success(`默认密钥已生成并绑定用户 ${selUser}，旧密钥已自动过期`); })
                      .catch((e) => alert(e instanceof Error ? e.message : String(e)))
                      .finally(() => setDkBusy(false));
                  }} disabled={dkBusy || !selUser}
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-[11px] text-slate-600 hover:border-indigo-300 hover:text-indigo-600">
                    {dkBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} {dk.exists ? "重置（旧的自动过期）" : "生成默认密钥（90 天可复用）"}
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                  <span>归属用户（Authentik 登录账号）</span>
                  <select value={selUser} onChange={(e) => setDkUser(e.target.value)}
                    className="h-7 rounded border border-slate-200 bg-white px-2 text-[11px]">
                    {(dk.users as { id: string; name: string }[] | undefined)?.map((u) => (
                      <option key={u.id} value={u.name}>{u.name}</option>
                    ))}
                  </select>
                  <span className="text-slate-400">该密钥注册的节点将挂到此用户下</span>
                </div>
                {dk.exists ? (
                  <div className="mt-2 space-y-1 text-[11px] text-slate-600">
                    <p>当前密钥：<code className="rounded bg-slate-100 px-1 font-mono">{String(dk.key ?? "")}</code>
                      <span className="ml-1 text-slate-400">绑定 {String(dk.user ?? "—")} · {String(dk.days ?? 90)} 天</span>
                      {dk.createdBy ? <span className="ml-1 text-slate-400">创建人 {String(dk.createdBy)}</span> : null}</p>
                    {(dk.devices as { hostname: string }[] | undefined)?.length ? (
                      <p>已加入设备：<span className="text-emerald-600">{(dk.devices as { hostname: string }[]).map((d) => d.hostname).join("、")}</span></p>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-2 text-[11px] text-slate-400">尚未生成。生成后会自动嵌入上面的一键工具，设备加入即复用同一密钥。</p>
                )}
                {dkFull ? (
                  <div className="mt-2 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 p-2">
                    <code className="min-w-0 flex-1 break-all font-mono text-[11px] text-emerald-900">{dkFull}</code>
                    <button type="button" onClick={() => copy(dkFull, "dkfull")}
                      className={cn("inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px]", copied === "dkfull" ? "border-emerald-300 text-emerald-700" : "border-slate-200 text-slate-600")}>
                      {copied === "dkfull" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {copied === "dkfull" ? "已复制" : "复制"}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* 手动命令（备用） */}
            <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
              <p className="text-[11px] font-medium text-slate-500">备用：管理员 PowerShell 手动加入（SSO 方式）</p>
              <div className="mt-1.5"><CodeCard tag="win" text={winCmd} label="PS C:\Windows\system32>" /></div>
              <p className="mt-1 text-[10px] text-slate-400">
                若未自动弹浏览器，复制输出的 register 链接在浏览器打开完成 Authentik SSO。
              </p>
            </div>
          </div>
        ) : null}

        {device === "macos" ? (
          <div className="space-y-3">
            {/* macOS 一键工具 */}
            <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50/70 to-white p-4 dark:border-indigo-500/30 dark:from-indigo-500/10 dark:to-slate-900/40">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-indigo-900 dark:text-indigo-300">
                <ShieldCheck className="h-3.5 w-3.5" /> 推荐方式：一键加入工具（自动装客户端 / 免浏览器加入 / 回传设备名）
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" disabled={scriptBusy} onClick={() => downloadZip("macos")}
                  className="inline-flex h-8 items-center rounded-md bg-indigo-600 px-3 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                  {scriptBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 h-3.5 w-3.5" />}
                  下载 macOS 工具 (.zip)
                </button>
              </div>
              <p className="mt-1.5 text-[10px] text-indigo-700/80 dark:text-indigo-200/70">
                解压 zip → 双击「加入节点.command」（首次运行被 macOS 拦截时：右键 →「打开」）。
                工具会自动：检测/安装 Tailscale（Homebrew 或官方安装包）→ 用平台密钥直接加入（无需浏览器）→ 回传设备名。
              </p>
              {!isAdmin ? <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-500">工具内含密钥，仅管理员可下载。</p> : null}
            </div>

            {/* 手动命令（备用） */}
            <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">备用：终端手动加入（SSO 方式）</p>
              <div className="mt-1.5"><CodeCard tag="mac" text={macCmd} label="zsh · 首次加入命令" /></div>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                也可先安装 Tailscale（<a className="text-indigo-600 hover:underline dark:text-indigo-400" href="https://d.frps.cn/file/tools/headscale/Tailscale-1.98.5-macos.pkg" target="_blank" rel="noreferrer">下载 PKG <Download className="inline h-3 w-3" /></a>）
                → 复制命令执行 → 浏览器跳转 Authentik SSO。
              </p>
            </div>
          </div>
        ) : null}

        {device === "linux" ? (
          <div className="space-y-2">
            <CodeCard tag="linux" text={linuxCmd} label="user@linux:~$" />
          </div>
        ) : null}

        {device === "ios" || device === "android" ? (
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-[11px] text-slate-600">
            <p className="mb-1 text-xs font-semibold text-slate-800">{device === "ios" ? "📱 iPhone / iPad" : "🤖 Android"}</p>
            <p>① 安装 Tailscale App&nbsp;② 打开「自定义服务器 / Coordinated server」填 <code className="rounded bg-slate-100 px-1 font-mono">{server}</code>&nbsp;③ Authentik SSO 登录&nbsp;④ 开启 VPN</p>
          </div>
        ) : null}
      </div>

      {/* Step 3：SSO 与后续 */}
      <div>
        <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-800">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">3</span>
          完成 SSO 登录并验证
        </p>
        <div className="space-y-2">
          <details className="rounded-xl border border-slate-100 bg-white p-3" open>
            <summary className="cursor-pointer text-[11px] font-medium text-slate-600">🔄 恢复连接 / 临时断开后（不要 logout）</summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <CodeCard tag="r1" text={"sudo tailscale up"} label="macOS / Linux" />
              <CodeCard tag="r2" text={'& "C:\\Program Files\\Tailscale\\tailscale.exe" up'} label="Windows" />
            </div>
          </details>
          <details className="rounded-xl border border-slate-100 bg-white p-3">
            <summary className="cursor-pointer text-[11px] font-medium text-slate-600">✅ 加入后测试 / 🧭 链路类型检测</summary>
            <div className="mt-2 grid gap-2 lg:grid-cols-3">
              <CodeCard tag="t1" text={"tailscale status"} label="查看状态" />
              <CodeCard tag="t2" text={"tailscale ping 100.64.0.1"} label="测试虚拟 IP" />
              <CodeCard tag="t3" text={"ping 192.168.21.99"} label="测试威海内网" />
            </div>
            <div className="mt-2 grid gap-2 lg:grid-cols-2">
              <CodeCard tag="p1" text={"tailscale ping 100.64.0.1\ntailscale status | grep ops"} label="macOS / Linux 链路检测" />
              <CodeCard tag="p2" text={'& "C:\\Program Files\\Tailscale\\tailscale.exe" ping 100.64.0.1\n& "C:\\Program Files\\Tailscale\\tailscale.exe" status | findstr ops'} label="Windows 链路检测" />
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg bg-emerald-50/70 p-2.5">
                <p className="text-[11px] font-semibold text-emerald-700">✅ 打洞直连</p>
                <p className="mt-0.5 text-[10px] text-slate-600">direct / via 公网IP:41641</p>
              </div>
              <div className="rounded-lg bg-amber-50/70 p-2.5">
                <p className="text-[11px] font-semibold text-amber-700">⚠️ DERP 中继</p>
                <p className="mt-0.5 text-[10px] text-slate-600">via DERP(hkg) 等，延迟较差</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2.5">
                <p className="text-[11px] font-semibold text-slate-700">📌 建议</p>
                <p className="mt-0.5 text-[10px] text-slate-600">常走中继检查 UDP / 防火墙 / NAT / 41641</p>
              </div>
            </div>
          </details>
          <details className="rounded-xl border border-slate-100 bg-white p-3">
            <summary className="cursor-pointer flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
              <HelpCircle className="h-3 w-3" /> ❓ 常见问题
            </summary>
            <div className="mt-2 space-y-2 text-[11px] text-slate-600">
              <p><strong className="text-slate-800">Windows 不弹 SSO？</strong>&nbsp;复制 register 链接浏览器打开，或使用一键工具的「打开登录页面」按钮。</p>
              <p><strong className="text-slate-800">退出登录会怎样？</strong>&nbsp;logout 可能生成新节点。临时断开用 tailscale down。</p>
              <p><strong className="text-slate-800">如何给新用户开通？</strong>&nbsp;在 Authentik 中把用户加入 Headscale 组即可。</p>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
};

export default MeshJoin;

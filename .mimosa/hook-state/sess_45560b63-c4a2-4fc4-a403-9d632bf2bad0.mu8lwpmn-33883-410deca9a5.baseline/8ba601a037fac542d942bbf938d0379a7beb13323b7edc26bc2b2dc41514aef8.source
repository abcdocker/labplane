import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Activity, AlertTriangle, ArrowRight, CheckCircle2, Globe, KeyRound, Loader2,
  LogIn, Network, Plus, RefreshCw, Router, Server, Wifi, WifiOff,
} from "lucide-react";
import { apiGetJson, ApiHttpError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/auth-context";

// 异地组网 Dashboard：跨 headscale 实例的总体态势。
// 汇总数字来自 /api/ops/mesh/summary；节点/站点/链路明细并行拉取各实例 discover。

type MeshSummaryInstance = {
  id: string;
  name: string;
  region?: string;
  apiUrl?: string;
  enabled: boolean;
  healthy: boolean;
  nodesTotal: number;
  nodesOnline: number;
  routesApproved: number;
  error?: string;
};

type DiscoverNode = {
  id: string; name: string; givenName: string; ipAddresses: string[];
  online: boolean; lastSeen?: string; os?: string; realIps?: string[];
  approvedRoutes?: string[]; availableRoutes?: string[]; tags?: string[];
  user?: { name?: string };
  duplicate?: boolean;
};
type DiscoverSite = {
  subnet: string; router: string; routerId: string; approved: boolean;
  online: boolean; lastSeen?: string; tailscaleIp?: string; realIps?: string[];
};
type DiscoverLink = {
  from: string; to: string; via: string; curAddr?: string; relay?: string;
  rxBytes: number; txBytes: number; seenAt?: string;
};
type DiscoverSuggestion = { routerId: string; name: string; host: string; port: number };
type DiscoverData = {
  health: boolean; error?: string; version?: string;
  nodes?: DiscoverNode[]; sites?: DiscoverSite[]; links?: DiscoverLink[];
  collectorSuggestions?: DiscoverSuggestion[];
};

const meshOsEmoji = (os?: string) => {
  const s = (os || "").toLowerCase();
  if (s.includes("mac")) return "";
  if (s.includes("ios") || s.includes("iphone") || s.includes("ipad")) return "📱";
  if (s.includes("win")) return "🪟";
  if (s.includes("linux")) return "🐧";
  if (s.includes("android")) return "🤖";
  return "🖥";
};

const meshTime = (iso?: string) => {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const diff = Date.now() - t;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
};

const StatCard: React.FC<{
  icon: React.ReactNode; label: string; value: string; tone?: "emerald" | "sky" | "violet" | "indigo";
}> = ({ icon, label, value, tone }) => (
  <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
    <p className={cn("flex items-center gap-1.5 text-[11px] text-slate-500",
      tone === "emerald" && "text-emerald-700", tone === "sky" && "text-sky-700",
      tone === "violet" && "text-violet-700", tone === "indigo" && "text-indigo-700")}>
      {icon} {label}
    </p>
    <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{value}</p>
  </div>
);

type DetailEntry = { inst: MeshSummaryInstance; data: DiscoverData };

const MeshDashboard: React.FC = () => {
  const { status } = useAuth();
  const isAdmin = status?.role === "admin";

  const q = useQuery({
    queryKey: ["mesh-summary-dashboard"],
    queryFn: () => apiGetJson<{ instances: MeshSummaryInstance[] }>("/api/ops/mesh/summary"),
    refetchInterval: 60_000,
  });
  const list = q.data?.instances ?? [];
  const enabled = list.filter((i) => i.enabled);
  const enabledKey = enabled.map((i) => i.id).join(",");
  const nodesTotal = enabled.reduce((a, i) => a + i.nodesTotal, 0);
  const nodesOnline = enabled.reduce((a, i) => a + i.nodesOnline, 0);
  const routesApproved = enabled.reduce((a, i) => a + i.routesApproved, 0);
  const unhealthy = enabled.filter((i) => !i.healthy);

  // 各实例明细（并行 discover，60s 随汇总一起刷新）
  const [details, setDetails] = React.useState<DetailEntry[]>([]);
  const [detailsLoading, setDetailsLoading] = React.useState(false);
  React.useEffect(() => {
    if (enabledKey === "") {
      setDetails([]);
      return;
    }
    let cancelled = false;
    const load = () => {
      setDetailsLoading(true);
      const ids = enabledKey.split(",").filter(Boolean);
      Promise.all(
        ids.map((id) =>
          apiGetJson<DiscoverData>(`/api/ops/mesh/instances/${id}/discover`)
            .then((data) => ({ id, data }))
            .catch(() => null),
        ),
      ).then((rs) => {
        if (cancelled) return;
        setDetails(
          rs.filter((r): r is { id: string; data: DiscoverData } => r !== null && r.data.health === true)
            .map((r) => ({ inst: enabled.find((i) => i.id === r.id)!, data: r.data }))
            .filter((e) => e.inst),
        );
        setDetailsLoading(false);
      });
    };
    load();
    const id = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabledKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // 合并明细
  const allNodes = details.flatMap((d) =>
    (d.data.nodes ?? []).map((n) => ({ ...n, instName: d.inst.name, instId: d.inst.id })));
  const allSites = details.flatMap((d) =>
    (d.data.sites ?? []).map((s) => ({ ...s, instName: d.inst.name })));
  const allLinks = details.flatMap((d) => d.data.links ?? []);
  const suggestionCount = details.reduce((a, d) => a + (d.data.collectorSuggestions?.length ?? 0), 0);
  // 重复注册节点：同设备多次 login 产生（headscale 自动加随机后缀）
  const dupCount = allNodes.filter((n) => n.duplicate).length;
  const staleNodes = allNodes.filter((n) => {
    if (n.online) return false;
    const t = Date.parse(n.lastSeen ?? "");
    return Number.isFinite(t) && Date.now() - t > 30 * 86_400_000;
  });
  // availableRoutes 在 headscale 里包含已审批路由：待审批 = 宣告了但不在已审批集合中
  const pendingRoutes = allNodes.filter((n) =>
    (n.availableRoutes ?? []).some((r) => !(n.approvedRoutes ?? []).includes(r)));

  const sortedNodes = [...allNodes].sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1;
    return (a.givenName || a.name).localeCompare(b.givenName || b.name);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Network className="h-6 w-6 text-indigo-600" /> 异地组网 Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            跨 headscale 实例的总体态势：实例健康、节点明细、站点子网、站点间链路与待处理事项（60s 自动刷新）。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => { q.refetch(); }}
            disabled={q.isFetching || detailsLoading}
            className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-600 hover:border-slate-300 disabled:opacity-50">
            <RefreshCw className={cn("mr-1 h-3.5 w-3.5", (q.isFetching || detailsLoading) && "animate-spin")} /> 刷新
          </button>
          {isAdmin ? (
            <Link to={{ pathname: "/cluster/mesh/topology", search: "new=1" }}>
              <button type="button" className="inline-flex h-8 items-center rounded-md bg-indigo-600 px-3 text-xs font-medium text-white hover:bg-indigo-700">
                <Plus className="mr-1 h-4 w-4" /> 添加实例
              </button>
            </Link>
          ) : null}
        </div>
      </div>

      {q.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> 加载汇总…</p>
      ) : null}
      {q.isError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          汇总加载失败：{q.error instanceof ApiHttpError ? q.error.serverMessage : String(q.error)}
        </p>
      ) : null}

      {list.length > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard icon={<Server className="h-4 w-4" />} label="实例（启用/全部）" value={`${enabled.length}/${list.length}`} tone="indigo" />
            <StatCard icon={<Server className="h-4 w-4" />} label="节点总数" value={String(nodesTotal)} />
            <StatCard icon={<Wifi className="h-4 w-4" />} label="在线节点" value={`${nodesOnline}/${nodesTotal}`} tone="emerald" />
            <StatCard icon={<Router className="h-4 w-4" />} label="已批子网路由" value={String(routesApproved)} tone="sky" />
          </div>

          {/* 加入节点（新设备接入指引） */}
      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/70 to-sky-50/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-indigo-900">
            <LogIn className="h-3.5 w-3.5" /> 新设备加入组网
            <span className="font-mono font-normal text-indigo-700/80">
              {(() => { try { return new URL(enabled[0]?.apiUrl ?? list[0]?.apiUrl ?? "").hostname; } catch { return list[0]?.apiUrl ?? ""; } })()}
            </span>
          </p>
          <Link to="/cluster/mesh/join"
            className="inline-flex h-7 items-center rounded-md bg-indigo-600 px-3 text-[11px] font-medium text-white hover:bg-indigo-700">
            打开加入节点页 <ArrowRight className="ml-1 h-3 w-3" />
          </Link>
        </div>
        <ol className="mt-2.5 grid gap-1.5 text-[11px] text-indigo-900/90 sm:grid-cols-4">
          <li className="rounded-lg bg-white/70 px-2.5 py-1.5">① 安装 Tailscale 客户端</li>
          <li className="rounded-lg bg-white/70 px-2.5 py-1.5">② 服务器地址填控制面地址</li>
          <li className="rounded-lg bg-white/70 px-2.5 py-1.5">③ 填主机名，复制加入命令执行</li>
          <li className="rounded-lg bg-white/70 px-2.5 py-1.5">④ 浏览器跳转 Authentik SSO 登录</li>
        </ol>
        <p className="mt-1.5 text-[10px] text-indigo-700/70">
          支持 macOS / Windows / Linux / iOS / Android；临时断开请用 tailscale down，不要 logout（会生成新节点）。
        </p>
      </div>

      {/* 待处理事项 */}
          {(unhealthy.length > 0 || staleNodes.length > 0 || pendingRoutes.length > 0 || suggestionCount > 0 || dupCount > 0) ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5" /> 待处理
              </p>
              <ul className="mt-1.5 space-y-1 text-[11px] text-amber-800">
                {unhealthy.map((i) => (
                  <li key={"u" + i.id}>⚠ 实例 {i.name} 不可达{i.error ? `（${i.error}）` : ""}</li>
                ))}
                {staleNodes.length > 0 ? (
                  <li>
                    🕸 {staleNodes.length} 台节点离线超过 30 天（{staleNodes.slice(0, 4).map((n) => n.givenName || n.name).join("、")}{staleNodes.length > 4 ? " 等" : ""}），
                    建议到 <Link className="underline" to={{ pathname: "/cluster/mesh/nodes", search: enabled[0] ? `inst=${enabled[0].id}` : "" }}>节点与路由 → 清理陈旧节点</Link> 处理
                  </li>
                ) : null}
                {pendingRoutes.length > 0 ? (
                  <li>
                    🔀 {pendingRoutes.length} 台节点有子网路由待审批（{pendingRoutes.map((n) => n.givenName || n.name).join("、")}），
                    见 <Link className="underline" to={{ pathname: "/cluster/mesh/nodes", search: enabled[0] ? `inst=${enabled[0].id}` : "" }}>节点与路由</Link>
                  </li>
                ) : null}
                {dupCount > 0 ? (
                  <li>
                    👥 {dupCount} 台疑似重复节点（同设备多次 login，带随机后缀），
                    可在 <Link className="underline" to={{ pathname: "/cluster/mesh/nodes", search: enabled[0] ? `inst=${enabled[0].id}` : "" }}>节点与路由 → 清理陈旧节点</Link> 选「重复节点」清理（保留最新）
                  </li>
                ) : null}
                {suggestionCount > 0 ? (
                  <li>
                    📡 {suggestionCount} 个子网路由器尚未配置流量采集器，
                    见 <Link className="underline" to={{ pathname: "/cluster/mesh/traffic", search: enabled[0] ? `inst=${enabled[0].id}` : "" }}>流量监控</Link>
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}

          {/* 实例卡片 */}
          <div className="grid gap-3 lg:grid-cols-2">
            {list.map((inst) => (
              <div key={inst.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Server className="h-4 w-4 text-indigo-600" />
                    <span className="text-sm font-semibold text-slate-900">{inst.name}</span>
                    {inst.region ? <span className="rounded bg-slate-100 px-1.5 text-[10px] text-slate-500">{inst.region}</span> : null}
                  </div>
                  {!inst.enabled ? (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">停用</span>
                  ) : inst.healthy ? (
                    <span className="flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700"><CheckCircle2 className="h-3 w-3" /> 健康</span>
                  ) : (
                    <span className="flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-[10px] text-red-700"><AlertTriangle className="h-3 w-3" /> 不可达</span>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-2">
                    <p className="text-[10px] text-slate-500">节点 在线/总数</p>
                    <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-slate-900">
                      {inst.enabled ? `${inst.nodesOnline}/${inst.nodesTotal}` : "—"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-2">
                    <p className="text-[10px] text-slate-500">已批路由</p>
                    <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-slate-900">
                      {inst.enabled ? inst.routesApproved : "—"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-2">
                    <p className="text-[10px] text-slate-500">状态</p>
                    <p className={cn("mt-0.5 text-xs font-medium",
                      !inst.enabled ? "text-slate-400" : inst.healthy ? "text-emerald-600" : "text-red-500")}>
                      {!inst.enabled ? "停用" : inst.healthy ? "正常" : "异常"}
                    </p>
                  </div>
                </div>
                {inst.enabled && inst.error ? (
                  <p className="mt-2 flex items-center gap-1 text-[10px] text-red-500"><AlertTriangle className="h-3 w-3" /> {inst.error}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-[11px]">
                  <Link to={{ pathname: "/cluster/mesh/topology", search: `inst=${inst.id}` }}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-slate-600 hover:border-indigo-300 hover:text-indigo-600">
                    <Network className="h-3 w-3" /> 拓扑
                  </Link>
                  <Link to={{ pathname: "/cluster/mesh/traffic", search: `inst=${inst.id}` }}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-slate-600 hover:border-indigo-300 hover:text-indigo-600">
                    <Activity className="h-3 w-3" /> 流量
                  </Link>
                  <Link to={{ pathname: "/cluster/mesh/keys", search: `inst=${inst.id}` }}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-slate-600 hover:border-indigo-300 hover:text-indigo-600">
                    <KeyRound className="h-3 w-3" /> 密钥
                  </Link>
                  <Link to={{ pathname: "/cluster/mesh/service", search: `inst=${inst.id}` }}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-slate-600 hover:border-indigo-300 hover:text-indigo-600">
                    <Globe className="h-3 w-3" /> 服务
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {/* 节点明细（跨实例） */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                <Server className="h-3.5 w-3.5" /> 节点明细（跨实例 · 在线优先）
              </p>
              {detailsLoading ? <span className="flex items-center gap-1 text-[10px] text-slate-400"><Loader2 className="h-3 w-3 animate-spin" /> 刷新中</span> : null}
            </div>
            <div className="max-h-[420px] overflow-auto rounded-xl border border-slate-100">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">节点</th>
                    <th className="px-3 py-2 font-medium">实例</th>
                    <th className="px-3 py-2 font-medium">Tailscale IP</th>
                    <th className="px-3 py-2 font-medium">真实地址</th>
                    <th className="px-3 py-2 font-medium">子网路由</th>
                    <th className="px-3 py-2 font-medium">最近在线</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedNodes.map((n) => {
                    const tsIp = (n.ipAddresses ?? []).find((x) => x.startsWith("100.")) ?? "—";
                    const routes = [...(n.approvedRoutes ?? []), ...(n.availableRoutes ?? [])];
                    return (
                      <tr key={n.instId + n.id} className={cn("border-t border-slate-50", !n.online && "opacity-60")}>
                        <td className="px-3 py-2">
                          <span className="flex items-center gap-1.5 font-medium text-slate-800">
                            {n.online ? <Wifi className="h-3 w-3 text-emerald-600" /> : <WifiOff className="h-3 w-3 text-slate-300" />}
                            {meshOsEmoji(n.os)} {n.givenName || n.name}
                            {n.duplicate ? <span className="rounded bg-amber-100 px-1 text-[9px] font-semibold text-amber-700" title="同设备多次 login 产生的重复节点，可清理">重复</span> : null}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-500">{n.instName}</td>
                        <td className="px-3 py-2 font-mono text-[11px] text-slate-600">{tsIp}</td>
                        <td className="px-3 py-2 font-mono text-[11px] text-emerald-600">{(n.realIps ?? [])[0] ?? "—"}</td>
                        <td className="px-3 py-2 font-mono text-[10px] text-sky-700">{routes.length > 0 ? routes.join(", ") : "—"}</td>
                        <td className="px-3 py-2 text-slate-500">{meshTime(n.lastSeen)}</td>
                      </tr>
                    );
                  })}
                  {sortedNodes.length === 0 ? (
                    <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">暂无节点数据</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          {/* 站点与子网 */}
          {allSites.length > 0 ? (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                <Router className="h-3.5 w-3.5" /> 站点与子网
              </p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {allSites.map((s) => (
                  <div key={s.subnet + s.routerId} className={cn("rounded-xl border p-3", s.approved ? "border-sky-200 bg-sky-50/50" : "border-amber-200 bg-amber-50/50")}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold text-slate-900">{s.subnet}</span>
                      {s.online ? <span className="flex items-center gap-1 text-[10px] text-emerald-700"><Wifi className="h-3 w-3" /> 在线</span> : <span className="text-[10px] text-slate-400">离线</span>}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-600">
                      路由器 <span className="font-medium">{s.router}</span>
                      {s.tailscaleIp ? <span className="ml-1 font-mono text-[10px] text-slate-400">{s.tailscaleIp}</span> : null}
                    </p>
                    {(s.realIps ?? []).length > 0 ? (
                      <p className="mt-0.5 font-mono text-[10px] text-emerald-600">真实 {(s.realIps ?? []).join(", ")}</p>
                    ) : null}
                    <p className="mt-0.5 text-[10px]">
                      {s.approved ? <span className="text-sky-700">已审批 · {meshTime(s.lastSeen)}</span> : <span className="text-amber-700">待审批</span>}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* 站点间链路 */}
          {allLinks.length > 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                <Activity className="h-3.5 w-3.5" /> 站点间链路（路由节点侧视角）
              </p>
              <div className="overflow-x-auto rounded-xl border border-slate-100">
                <table className="w-full min-w-[560px] text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-1.5 font-medium">起点</th>
                      <th className="px-3 py-1.5 font-medium">对端</th>
                      <th className="px-3 py-1.5 font-medium">路径</th>
                      <th className="px-3 py-1.5 font-medium">收 ↓ / 发 ↑</th>
                      <th className="px-3 py-1.5 font-medium">采样时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allLinks.map((l, i) => (
                      <tr key={`${l.from}-${l.to}-${i}`} className="border-t border-slate-50">
                        <td className="px-3 py-1.5 font-medium text-slate-800">{l.from}</td>
                        <td className="px-3 py-1.5 font-medium text-slate-800">{l.to}</td>
                        <td className="px-3 py-1.5">
                          {l.via === "direct" ? (
                            <span className="font-mono text-[10px] text-emerald-700" title={l.curAddr}>直连 {l.curAddr}</span>
                          ) : (
                            <span className="text-[10px] text-amber-700">DERP {l.relay}</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 font-mono tabular-nums text-slate-600">{fmtMeshBytes(l.rxBytes)} / {fmtMeshBytes(l.txBytes)}</td>
                        <td className="px-3 py-1.5 text-slate-400">{meshTime(l.seenAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </>
      ) : !q.isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <Network className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm text-slate-600">还没有异地组网控制面实例。</p>
          <p className="mt-1 text-xs text-slate-400">添加 Headscale 实例后，这里会展示跨实例的节点、路由与链路态势。</p>
          {isAdmin ? (
            <Link to={{ pathname: "/cluster/mesh/topology", search: "new=1" }}>
              <button type="button" className="mt-4 inline-flex h-8 items-center rounded-md bg-indigo-600 px-3 text-xs font-medium text-white hover:bg-indigo-700">
                <Plus className="mr-1 h-4 w-4" /> 添加 Headscale 实例
              </button>
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

const fmtMeshBytes = (n: number) => {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
};

export default MeshDashboard;

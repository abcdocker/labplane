import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Hexagon,
  Monitor,
  Server,
  AppWindow,
  Sparkles,
  SquareTerminal,
  Database,
  HardDrive,
  Bot,
  Search,
  Globe,
  Layers,
  Cpu,
  Bell,
  LineChart,
  FileText,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Network,
  Fingerprint,
  Waypoints,
} from "lucide-react";
import { useAuth } from "@/auth/auth-context";
import { useRuntimeStatusQuery } from "@/hooks/use-runtime-status";
import { apiGetJson } from "@/lib/api";
import { menuItemVisible, moduleVisible } from "@/lib/platform-permissions";
import { cn } from "@/lib/utils";
import { type K8sSummary } from "@/pages/cluster/types";
import {
  type VCenterVMsResponse,
  type VCenterHostsResponse,
} from "@/pages/vcenter/types";

type RedisStatus = {
  mysqlReachable: boolean;
  encryptionReady: boolean;
  mirrorRedisOk: boolean;
};

type AiAlertsGet = {
  rules: { enabled: boolean }[];
  channels: unknown[];
};

function StatusBadge({ ok, loading }: { ok: boolean; loading?: boolean }) {
  if (loading) {
    return (
      <span className="max-w-full rounded-full bg-slate-100 px-2 py-0.5 text-right text-[11px] font-semibold leading-4 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
        检查中…
      </span>
    );
  }
  return ok ? (
    <span className="flex max-w-full items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-right text-[11px] font-semibold leading-4 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
      <CheckCircle2 size={11} />
      已接入
    </span>
  ) : (
    <span className="flex max-w-full items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-right text-[11px] font-semibold leading-4 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
      <AlertCircle size={11} />
      待配置
    </span>
  );
}

function MetricItem({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="break-words text-[11px] leading-tight text-slate-400 dark:text-slate-500">
        {label}
      </span>
      <span className="mt-1 text-lg font-semibold tabular-nums leading-none text-slate-900 dark:text-slate-100">
        {value}
      </span>
    </div>
  );
}

const workspaceCardClass =
  "group flex h-full min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-950 sm:p-5";

function fmtMB(mb: number): string {
  if (mb >= 1024 * 1024) return `${(mb / 1024 / 1024).toFixed(1)} TB`;
  if (mb >= 1024) return `${(mb / 1024).toFixed(0)} GB`;
  return `${mb} MB`;
}

const HomeHub: React.FC = () => {
  const { status: authStatus } = useAuth();
  const runtimeQ = useRuntimeStatusQuery();
  const cfg = runtimeQ.data?.config;
  const perm = cfg?.permissions;
  const hubRole = authStatus?.role;

  const cfgLoading = runtimeQ.isLoading;

  // K8s summary
  const k8sQ = useQuery({
    queryKey: ["k8s-summary-hub"],
    queryFn: ({ signal }) =>
      apiGetJson<K8sSummary>("/api/k8s/summary", { signal }),
    enabled: cfg?.k8sConfigured === true,
  });

  // vCenter
  const vcVmsQ = useQuery({
    queryKey: ["vcenter-vms-hub"],
    queryFn: ({ signal }) =>
      apiGetJson<VCenterVMsResponse>("/api/vcenter/vms", { signal }),
    enabled: cfg?.vcenterConfigured === true,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const vcHostsQ = useQuery({
    queryKey: ["vcenter-hosts-hub"],
    queryFn: ({ signal }) =>
      apiGetJson<VCenterHostsResponse>("/api/vcenter/hosts", { signal }),
    enabled: cfg?.vcenterConfigured === true,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  // App center
  const appStatusQ = useQuery({
    queryKey: ["app-center-redis-status-hub"],
    queryFn: ({ signal }) =>
      apiGetJson<RedisStatus>("/api/app-center/redis/status", { signal }),
  });
  const redisQ = useQuery({
    queryKey: ["app-center-redis-instances-hub"],
    queryFn: ({ signal }) =>
      apiGetJson<{ instances: unknown[] }>("/api/app-center/redis/instances", {
        signal,
      }),
  });
  const kafkaQ = useQuery({
    queryKey: ["app-center-kafka-instances-hub"],
    queryFn: ({ signal }) =>
      apiGetJson<{ instances: unknown[] }>("/api/app-center/kafka/instances", {
        signal,
      }),
    enabled: appStatusQ.data?.mysqlReachable === true,
  });
  const cloudVmQ = useQuery({
    queryKey: ["app-center-cloud-vm-instances-hub"],
    queryFn: ({ signal }) =>
      apiGetJson<{ instances: unknown[] }>(
        "/api/app-center/cloud-vm/instances",
        { signal },
      ),
  });
  const openSearchQ = useQuery({
    queryKey: ["app-center-opensearch-instances-hub"],
    queryFn: ({ signal }) =>
      apiGetJson<{ instances: unknown[] }>(
        "/api/app-center/opensearch/instances",
        { signal },
      ),
  });
  const dnsDomainsQ = useQuery({
    queryKey: ["app-center-dns-domains-hub"],
    queryFn: ({ signal }) =>
      apiGetJson<{ domains: unknown[] }>("/api/dns/domains", { signal }),
    enabled: appStatusQ.data?.mysqlReachable === true,
  });

  // 堡垒机
  const bastionVmsQ = useQuery({
    queryKey: ["bastion-vms-hub"],
    queryFn: ({ signal }) =>
      apiGetJson<{
        vms: { moref: string; name: string; powerState?: string }[];
        extraHosts?: { id: string }[];
      }>("/api/vcenter/bastion/vms", { signal }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  // AI 巡检
  const isAdmin = authStatus?.role === "admin";
  const loggedIn = Boolean(authStatus?.loggedIn);
  const aiAlertsQ = useQuery({
    queryKey: ["ops-alerts-hub"],
    queryFn: ({ signal }) =>
      apiGetJson<AiAlertsGet>("/api/ops/alerts", { signal }),
    enabled: loggedIn && isAdmin,
  });
  const aiReportsQ = useQuery({
    queryKey: ["ops-inspect-reports-hub"],
    queryFn: ({ signal }) =>
      apiGetJson<{ reports: unknown[] }>("/api/ops/inspect/reports", {
        signal,
      }),
    enabled: loggedIn && isAdmin,
  });
  const aiPanelsQ = useQuery({
    queryKey: ["ops-monitoring-panels-hub"],
    queryFn: ({ signal }) =>
      apiGetJson<{ panels: { id: string }[] }>("/api/ops/monitoring/panels", {
        signal,
      }),
    enabled: loggedIn,
  });
  const aiPromQ = useQuery({
    queryKey: ["prometheus-status-hub"],
    queryFn: ({ signal }) =>
      apiGetJson<{
        scopes?: {
          k8s?: { configured?: boolean };
          vcenter?: { configured?: boolean };
        };
      }>("/api/prometheus/status", { signal }),
    enabled: loggedIn,
  });

  const showK8s = menuItemVisible(
    perm,
    "kubernetes",
    hubRole,
    moduleVisible(perm, "k8s"),
  );
  const showVc = menuItemVisible(
    perm,
    "vcenter",
    hubRole,
    moduleVisible(perm, "vcenter"),
  );
  const showAppCenter = menuItemVisible(
    perm,
    "appcenter",
    hubRole,
    moduleVisible(perm, "appcenter"),
  );
  const showBastion = menuItemVisible(
    perm,
    "vcenter_bastion",
    hubRole,
    moduleVisible(perm, "vcenter") || moduleVisible(perm, "appcenter"),
  );
  const showAiInspect = menuItemVisible(perm, "aiInspect", hubRole, true);
  const showMesh = menuItemVisible(perm, "mesh", hubRole, true);
  const showHub = menuItemVisible(perm, "hub", hubRole, true);

  const gatewayStatusQ = useQuery({
    queryKey: ["gateway-api-status-hub"],
    queryFn: ({ signal }) =>
      apiGetJson<{ available: boolean; version?: string; error?: string }>(
        "/api/k8s/gwapi/status",
        { signal },
      ),
    enabled: loggedIn && showK8s,
    staleTime: 60_000,
    retry: 0,
  });

  // 异地组网跨实例汇总（Dashboard 卡片统计）
  const meshSummaryQ = useQuery({
    queryKey: ["mesh-summary"],
    queryFn: () =>
      apiGetJson<{
        instances: {
          id: string;
          nodesTotal: number;
          nodesOnline: number;
          routesApproved: number;
        }[];
      }>("/api/ops/mesh/summary"),
    enabled: loggedIn && isAdmin,
    staleTime: 60_000,
    retry: 0,
  });
  const meshInstances = meshSummaryQ.data?.instances ?? [];
  const meshNodesTotal = meshInstances.reduce(
    (s, i) => s + (i.nodesTotal ?? 0),
    0,
  );
  const meshNodesOnline = meshInstances.reduce(
    (s, i) => s + (i.nodesOnline ?? 0),
    0,
  );
  const meshRoutes = meshInstances.reduce(
    (s, i) => s + (i.routesApproved ?? 0),
    0,
  );

  // Authentik 跨实例汇总（Dashboard 卡片统计）
  const showAuthentik = menuItemVisible(perm, "authentik", hubRole, true);
  const akSummaryQ = useQuery({
    queryKey: ["authentik-summary"],
    queryFn: () =>
      apiGetJson<{
        instances: {
          id: string;
          healthy: boolean;
          version?: string;
          users: number;
          apps: number;
          providers: number;
        }[];
      }>("/api/ops/authentik/summary"),
    enabled: loggedIn && isAdmin,
    staleTime: 60_000,
    retry: 0,
  });
  const akInstances = akSummaryQ.data?.instances ?? [];
  const akHealthy = akInstances.filter((i) => i.healthy).length;
  const akUsers = akInstances.reduce((s, i) => s + (i.users ?? 0), 0);
  const akApps = akInstances.reduce((s, i) => s + (i.apps ?? 0), 0);
  const akProviders = akInstances.reduce((s, i) => s + (i.providers ?? 0), 0);

  // vCenter aggregated stats（useMemo：避免无关 query 更新时重复 reduce）
  const {
    vcHosts,
    vcMemTotalMB,
    vcMemUsedMB,
    vcMemFreeMB,
    vcMemUsedPct,
    nVcVm,
    nVcHost,
    vcLoading,
  } = useMemo(() => {
    const hosts = vcHostsQ.data?.hosts ?? [];
    const memTotal = hosts.reduce((s, h) => s + (h.memoryTotalMB ?? 0), 0);
    const memUsed = hosts.reduce((s, h) => s + (h.memoryUsageMB ?? 0), 0);
    const memFree = memTotal - memUsed;
    return {
      vcHosts: hosts,
      vcMemTotalMB: memTotal,
      vcMemUsedMB: memUsed,
      vcMemFreeMB: memFree,
      vcMemUsedPct: memTotal > 0 ? Math.round((memUsed / memTotal) * 100) : 0,
      nVcVm: vcVmsQ.data?.vms?.length ?? 0,
      nVcHost: hosts.length,
      vcLoading: vcVmsQ.isLoading || vcHostsQ.isLoading,
    };
  }, [
    vcHostsQ.data?.hosts,
    vcVmsQ.data?.vms,
    vcVmsQ.isLoading,
    vcHostsQ.isLoading,
  ]);

  const k8sOk = cfg?.k8sConfigured === true;
  const vcOk = cfg?.vcenterConfigured === true;
  const { nRedis, nKafka, nCloudVm, nOpenSearch, nDomains, appCenterTotal } =
    useMemo(() => {
      const nr = redisQ.data?.instances?.length ?? 0;
      const nk = kafkaQ.data?.instances?.length ?? 0;
      const nc = cloudVmQ.data?.instances?.length ?? 0;
      const nos = openSearchQ.data?.instances?.length ?? 0;
      const nd = dnsDomainsQ.data?.domains?.length ?? 0;
      return {
        nRedis: nr,
        nKafka: nk,
        nCloudVm: nc,
        nOpenSearch: nos,
        nDomains: nd,
        appCenterTotal: nr + nk + nc + nos,
      };
    }, [
      redisQ.data?.instances,
      kafkaQ.data?.instances,
      cloudVmQ.data?.instances,
      openSearchQ.data?.instances,
      dnsDomainsQ.data?.domains,
    ]);

  // 堡垒机 / AI 巡检聚合（useMemo：与无关 hub 卡片解耦）
  const {
    nBastionVm,
    nBastionOn,
    nBastionExtra,
    nBastionDirect,
    bastionLoading,
    aiRulesTotal,
    aiRulesOn,
    aiChannels,
    aiReports,
    aiPanels,
    aiPromK8s,
    aiPromVc,
    aiLoading,
  } = useMemo(() => {
    const bVms = bastionVmsQ.data?.vms ?? [];
    const nBm = bVms.length;
    const nOn = bVms.filter((v) =>
      String(v.powerState).toLowerCase().includes("on"),
    ).length;
    const nExtra = bastionVmsQ.data?.extraHosts?.length ?? 0;
    /** 堡垒机策略内：同步 VM + 手工额外主机（不含 ESXi/云主机/Redis，避免与下方明细重复计数） */
    const nBastionDirect = nBm + nExtra;
    const rules = aiAlertsQ.data?.rules ?? [];
    return {
      nBastionVm: nBm,
      nBastionOn: nOn,
      nBastionExtra: nExtra,
      nBastionDirect,
      bastionLoading: bastionVmsQ.isLoading,
      aiRulesTotal: rules.length,
      aiRulesOn: rules.filter((r) => r.enabled).length,
      aiChannels: aiAlertsQ.data?.channels?.length ?? 0,
      aiReports: aiReportsQ.data?.reports?.length ?? 0,
      aiPanels: aiPanelsQ.data?.panels?.length ?? 0,
      aiPromK8s: aiPromQ.data?.scopes?.k8s?.configured ?? false,
      aiPromVc: aiPromQ.data?.scopes?.vcenter?.configured ?? false,
      aiLoading: aiAlertsQ.isLoading || aiPanelsQ.isLoading,
    };
  }, [
    bastionVmsQ.data?.vms,
    bastionVmsQ.data?.extraHosts,
    bastionVmsQ.isLoading,
    aiAlertsQ.data?.rules,
    aiAlertsQ.data?.channels,
    aiReportsQ.data?.reports,
    aiPanelsQ.data?.panels,
    aiPromQ.data?.scopes,
    aiAlertsQ.isLoading,
    aiPanelsQ.isLoading,
  ]);

  if (!showHub) {
    return (
      <div className="mx-auto max-w-5xl">
        <p className="text-sm text-amber-900/90">
          暂无可用工作区入口（模块或菜单已关闭）。
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          工作台
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          各模块接入状态与资源概览，点击卡片进入对应工作区。
        </p>
      </div>

      <div
        role="list"
        aria-label="工作区模块"
        className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] items-stretch gap-4 xl:gap-5"
      >
        {/* Kubernetes */}
        {showK8s && (
          <div role="listitem" className="min-w-0">
            <Link
              to="/cluster"
              className={cn(
                workspaceCardClass,
                "hover:border-blue-200 dark:hover:border-blue-800",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 text-white">
                  <Hexagon size={20} strokeWidth={2.2} />
                </div>
                <StatusBadge ok={k8sOk} loading={cfgLoading} />
              </div>
              <h2 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
                Kubernetes
              </h2>
              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                集群资源、命名空间与工作负载
              </p>
              {k8sOk && (
                <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(4.5rem,1fr))] gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                  <MetricItem
                    label="节点"
                    value={k8sQ.isLoading ? "…" : (k8sQ.data?.nodeCount ?? "—")}
                  />
                  <MetricItem
                    label="命名空间"
                    value={
                      k8sQ.isLoading ? "…" : (k8sQ.data?.namespaceCount ?? "—")
                    }
                  />
                  <MetricItem
                    label="Pod"
                    value={k8sQ.isLoading ? "…" : (k8sQ.data?.podCount ?? "—")}
                  />
                  <MetricItem
                    label="服务"
                    value={
                      k8sQ.isLoading ? "…" : (k8sQ.data?.serviceCount ?? "—")
                    }
                  />
                </div>
              )}
              <span className="mt-auto inline-flex items-center gap-1 pt-4 text-xs font-medium text-blue-600 group-hover:underline dark:text-blue-400">
                进入 <ArrowRight size={13} />
              </span>
            </Link>
          </div>
        )}

        {/* vCenter */}
        {showVc && (
          <div role="listitem" className="min-w-0">
            <Link
              to="/cluster/vcenter/dashboard"
              className={cn(
                workspaceCardClass,
                "hover:border-violet-200 dark:hover:border-violet-800",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-violet-700 text-white">
                  <Monitor size={20} strokeWidth={2.2} />
                </div>
                <StatusBadge ok={vcOk} loading={cfgLoading} />
              </div>
              <h2 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
                vCenter
              </h2>
              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                虚拟机、宿主机与控制台
              </p>
              {vcOk && (
                <>
                  <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(5.5rem,1fr))] gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                    <MetricItem
                      label="虚拟机"
                      value={vcLoading ? "…" : nVcVm}
                    />
                    <MetricItem
                      label="宿主机"
                      value={vcLoading ? "…" : nVcHost}
                    />
                    {!vcLoading && vcMemTotalMB > 0 && (
                      <MetricItem
                        label="内存使用率"
                        value={`${vcMemUsedPct}%`}
                      />
                    )}
                  </div>
                  {!vcLoading && vcMemTotalMB > 0 && (
                    <div className="mt-3 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span className="flex items-center gap-1">
                          <Cpu size={10} />
                          宿主机内存
                        </span>
                        <span>
                          {fmtMB(vcMemUsedMB)} / {fmtMB(vcMemTotalMB)}
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            vcMemUsedPct >= 85
                              ? "bg-red-500"
                              : vcMemUsedPct >= 70
                                ? "bg-amber-400"
                                : "bg-violet-500",
                          )}
                          style={{ width: `${vcMemUsedPct}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-slate-400">
                        剩余{" "}
                        <span className="font-medium text-slate-600">
                          {fmtMB(vcMemFreeMB)}
                        </span>
                      </p>
                    </div>
                  )}
                </>
              )}
              <span className="mt-auto inline-flex items-center gap-1 pt-4 text-xs font-medium text-violet-600 group-hover:underline dark:text-violet-400">
                进入 <ArrowRight size={13} />
              </span>
            </Link>
          </div>
        )}

        {/* Gateway API */}
        {showK8s && (
          <div role="listitem" className="min-w-0">
            <Link
              to="/cluster/routes"
              className={cn(
                workspaceCardClass,
                "hover:border-sky-200 dark:hover:border-sky-800",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-600 to-blue-700 text-white">
                  <Waypoints size={20} strokeWidth={2.2} />
                </div>
                <StatusBadge
                  ok={gatewayStatusQ.data?.available === true}
                  loading={gatewayStatusQ.isLoading}
                />
              </div>
              <h2 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
                Gateway API
              </h2>
              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                统一管理 Ingress、Gateway、HTTPRoute 与 GRPCRoute
              </p>
              <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-2.5 py-2.5 dark:border-slate-800 dark:bg-slate-900/80">
                  <p className="text-[10px] text-slate-400">CRD 状态</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {gatewayStatusQ.isLoading
                      ? "检查中…"
                      : gatewayStatusQ.data?.available
                        ? "已安装"
                        : "未安装"}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-2.5 py-2.5 dark:border-slate-800 dark:bg-slate-900/80">
                  <p className="text-[10px] text-slate-400">API 版本</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {gatewayStatusQ.isLoading ? "…" : gatewayStatusQ.data?.version || "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-2.5 py-2.5 dark:border-slate-800 dark:bg-slate-900/80">
                  <p className="text-[10px] text-slate-400">资源类型</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">4</p>
                </div>
              </div>
              <span className="mt-auto inline-flex items-center gap-1 pt-4 text-xs font-medium text-sky-700 group-hover:underline dark:text-sky-400">
                进入 <ArrowRight size={13} />
              </span>
            </Link>
          </div>
        )}

        {/* 应用中心 */}
        {showAppCenter && (
          <div role="listitem" className="min-w-0">
            <Link
              to="/cluster/apps/dashboard"
              className={cn(
                workspaceCardClass,
                "hover:border-emerald-200 dark:hover:border-emerald-800",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-700 text-white">
                  <AppWindow size={20} strokeWidth={2.2} />
                </div>
                <span className="max-w-full rounded-full bg-emerald-50 px-2 py-0.5 text-right text-[11px] font-semibold leading-4 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                  {appCenterTotal} 实例
                </span>
              </div>
              <h2 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
                应用中心
              </h2>
              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                Redis、Kafka、云主机、OpenSearch、DNS
              </p>
              <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(5.75rem,1fr))] gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                <div className="flex items-center gap-1.5">
                  <Database size={13} className="shrink-0 text-slate-400" />
                  <div>
                    <p className="text-[10px] text-slate-400">Redis</p>
                    <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {nRedis}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Layers size={13} className="shrink-0 text-violet-400" />
                  <div>
                    <p className="text-[10px] text-slate-400">Kafka</p>
                    <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {nKafka}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <HardDrive size={13} className="shrink-0 text-slate-400" />
                  <div>
                    <p className="text-[10px] text-slate-400">云主机</p>
                    <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {nCloudVm}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Search size={13} className="shrink-0 text-slate-400" />
                  <div>
                    <p className="text-[10px] text-slate-400">OpenSearch</p>
                    <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {nOpenSearch}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Globe size={13} className="shrink-0 text-emerald-400" />
                  <div>
                    <p className="text-[10px] text-slate-400">域名</p>
                    <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {nDomains}
                    </p>
                  </div>
                </div>
              </div>
              <span className="mt-auto inline-flex items-center gap-1 pt-4 text-xs font-medium text-emerald-700 group-hover:underline dark:text-emerald-400">
                进入 <ArrowRight size={13} />
              </span>
            </Link>
          </div>
        )}

        {/* 堡垒机 */}
        {showBastion && (
          <div role="listitem" className="min-w-0">
            <Link
              to="/cluster/bastion"
              className={cn(
                workspaceCardClass,
                "hover:border-teal-200 dark:hover:border-teal-800",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-600 to-emerald-800 text-white">
                  <SquareTerminal size={20} strokeWidth={2.2} />
                </div>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    bastionLoading
                      ? "bg-slate-100 text-slate-400"
                      : nBastionDirect > 0
                        ? "bg-teal-50 text-teal-700"
                        : "bg-slate-100 text-slate-500",
                  )}
                >
                  {bastionLoading ? "加载中…" : `${nBastionDirect} 台堡垒目标`}
                </span>
              </div>
              <h2 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
                堡垒机
              </h2>
              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                统一终端：vCenter SSH/桌面、云主机与 Redis CLI
              </p>

              <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] gap-x-4 gap-y-2.5 border-t border-slate-100 pt-4 dark:border-slate-800">
                {/* vCenter 虚拟机 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Monitor size={12} className="shrink-0 text-violet-400" />
                    <span className="text-[11px] text-slate-400">虚拟机</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {bastionLoading ? "…" : nBastionVm}
                    </span>
                    {!bastionLoading && nBastionVm > 0 && (
                      <span className="ml-1 text-[10px] text-emerald-600">
                        {nBastionOn} 开机
                      </span>
                    )}
                  </div>
                </div>

                {/* 额外主机 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <HardDrive size={12} className="shrink-0 text-slate-400" />
                    <span className="text-[11px] text-slate-400">额外主机</span>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {bastionLoading ? "…" : nBastionExtra}
                  </span>
                </div>

                {/* ESXi 宿主机 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Server size={12} className="shrink-0 text-slate-400" />
                    <span className="text-[11px] text-slate-400">
                      ESXi 主机
                    </span>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {vcLoading ? "…" : nVcHost}
                  </span>
                </div>

                {/* 云主机 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Globe size={12} className="shrink-0 text-emerald-400" />
                    <span className="text-[11px] text-slate-400">云主机</span>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {cloudVmQ.isLoading ? "…" : nCloudVm}
                  </span>
                </div>

                {/* Redis CLI */}
                <div className="col-span-full flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Database size={12} className="shrink-0 text-red-400" />
                    <span className="text-[11px] text-slate-400">
                      Redis CLI 入口
                    </span>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {redisQ.isLoading ? "…" : nRedis}
                  </span>
                </div>
              </div>

              <span className="mt-auto inline-flex items-center gap-1 pt-4 text-xs font-medium text-teal-600 group-hover:underline dark:text-teal-400">
                进入 <ArrowRight size={13} />
              </span>
            </Link>
          </div>
        )}

        {/* AI 巡检 */}
        {showAiInspect && (
          <div role="listitem" className="min-w-0">
            <Link
              to="/cluster/ai-inspect/dashboard"
              className={cn(
                workspaceCardClass,
                "hover:border-cyan-200 dark:hover:border-cyan-800",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-600 to-teal-700 text-white">
                  <Sparkles size={20} strokeWidth={2.2} />
                </div>
                {/* 大模型状态徽章 */}
                {aiLoading ? (
                  <span className="max-w-full rounded-full bg-slate-100 px-2 py-0.5 text-right text-[11px] font-semibold leading-4 text-slate-400 dark:bg-slate-800 dark:text-slate-300">
                    检查中…
                  </span>
                ) : isAdmin ? (
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300",
                    )}
                  >
                    判读模型走 AI 巡检配置
                  </span>
                ) : (
                  <span className="max-w-full rounded-full bg-cyan-50 px-2 py-0.5 text-right text-[11px] font-semibold leading-4 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300">
                    已就绪
                  </span>
                )}
              </div>
              <h2 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
                AI 巡检
              </h2>
              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                内置巡检引擎、监控告警、日志查询与采集
              </p>

              {/* 数据源状态 */}
              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      aiLoading
                        ? "bg-slate-300"
                        : aiPromK8s
                          ? "bg-emerald-500"
                          : "bg-slate-300",
                    )}
                  />
                  <span className="text-[11px] text-slate-400">K8s</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      aiLoading
                        ? "bg-slate-300"
                        : aiPromVc
                          ? "bg-emerald-500"
                          : "bg-slate-300",
                    )}
                  />
                  <span className="text-[11px] text-slate-400">vCenter</span>
                </div>
                <span className="basis-full text-[11px] text-slate-400 sm:ml-auto sm:basis-auto dark:text-slate-500">
                  Prometheus 数据源
                </span>
              </div>

              {/* 统计网格 */}
              <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-2">
                {isAdmin && (
                  <>
                    {/* 告警规则 */}
                    <div className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900/80">
                      <Bell size={14} className="shrink-0 text-amber-500" />
                      <div>
                        <p className="text-[10px] text-slate-400">告警规则</p>
                        <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                          {aiLoading ? "…" : `${aiRulesOn} / ${aiRulesTotal}`}
                        </p>
                        <p className="text-[10px] text-slate-400">启用 / 共</p>
                      </div>
                    </div>

                    {/* 通知通道 + 巡检报告 */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-1.5 dark:border-slate-800 dark:bg-slate-900/80">
                        <div className="flex items-center gap-1.5">
                          <LineChart
                            size={12}
                            className="shrink-0 text-cyan-500"
                          />
                          <span className="text-[10px] text-slate-400">
                            自定义面板
                          </span>
                        </div>
                        <span className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                          {aiLoading ? "…" : aiPanels}
                        </span>
                      </div>
                      <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-1.5 dark:border-slate-800 dark:bg-slate-900/80">
                        <div className="flex items-center gap-1.5">
                          <FileText
                            size={12}
                            className="shrink-0 text-teal-500"
                          />
                          <span className="text-[10px] text-slate-400">
                            巡检报告
                          </span>
                        </div>
                        <span className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                          {aiLoading ? "…" : aiReports}
                        </span>
                      </div>
                    </div>

                    {/* 告警规则启用率进度条 */}
                    {aiRulesTotal > 0 && (
                      <div className="col-span-full space-y-1">
                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <span>告警规则启用率</span>
                          <span>
                            {Math.round((aiRulesOn / aiRulesTotal) * 100)}%
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-amber-400 transition-all"
                            style={{
                              width: `${Math.round((aiRulesOn / aiRulesTotal) * 100)}%`,
                            }}
                          />
                        </div>
                        <p className="text-[10px] text-slate-400">
                          {aiChannels} 个通知通道
                        </p>
                      </div>
                    )}
                  </>
                )}

                {!isAdmin && (
                  <div className="col-span-full flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900/80">
                    <LineChart size={14} className="shrink-0 text-cyan-500" />
                    <div>
                      <p className="text-[10px] text-slate-400">
                        自定义监控面板
                      </p>
                      <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                        {aiLoading ? "…" : aiPanels}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <span className="mt-auto inline-flex items-center gap-1 pt-4 text-xs font-medium text-cyan-600 group-hover:underline dark:text-cyan-400">
                进入 <ArrowRight size={13} />
              </span>
            </Link>
          </div>
        )}

        {/* 异地组网 */}
        {showMesh && (
          <div role="listitem" className="min-w-0">
            <Link
              to="/cluster/mesh"
              className={cn(
                workspaceCardClass,
                "hover:border-indigo-200 dark:hover:border-indigo-800",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-700 text-white">
                  <Network size={20} strokeWidth={2.2} />
                </div>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    meshSummaryQ.isLoading
                      ? "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-300"
                      : "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300",
                  )}
                >
                  {meshSummaryQ.isLoading ? "检查中…" : "Headscale"}
                </span>
              </div>
              <h2 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
                异地组网
              </h2>
              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                Headscale 控制面、子网路由与站点间流量监控
              </p>

              <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-2.5 py-2.5 dark:border-slate-800 dark:bg-slate-900/80">
                  <p className="text-[10px] text-slate-400">实例</p>
                  <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {meshSummaryQ.isLoading ? "…" : meshInstances.length}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-2.5 py-2.5 dark:border-slate-800 dark:bg-slate-900/80">
                  <p className="text-[10px] text-slate-400">在线节点</p>
                  <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {meshSummaryQ.isLoading
                      ? "…"
                      : `${meshNodesOnline}/${meshNodesTotal}`}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-2.5 py-2.5 dark:border-slate-800 dark:bg-slate-900/80">
                  <p className="text-[10px] text-slate-400">子网路由</p>
                  <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {meshSummaryQ.isLoading ? "…" : meshRoutes}
                  </p>
                </div>
              </div>

              <span className="mt-auto inline-flex items-center gap-1 pt-4 text-xs font-medium text-indigo-600 group-hover:underline dark:text-indigo-400">
                进入 <ArrowRight size={13} />
              </span>
            </Link>
          </div>
        )}

        {/* Authentik */}
        {showAuthentik && (
          <div role="listitem" className="min-w-0">
            <Link
              to="/cluster/authentik"
              className={cn(
                workspaceCardClass,
                "hover:border-fuchsia-200 dark:hover:border-fuchsia-800",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-600 to-purple-700 text-white">
                  <Fingerprint size={20} strokeWidth={2.2} />
                </div>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    akSummaryQ.isLoading
                      ? "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-300"
                      : akInstances.length > 0 && akHealthy > 0
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                        : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300",
                  )}
                >
                  {akSummaryQ.isLoading
                    ? "检查中…"
                    : akInstances.length === 0
                      ? "未配置"
                      : akHealthy > 0
                        ? `SSO 正常 · ${akInstances[0].version ?? ""}`
                        : "不可达"}
                </span>
              </div>
              <h2 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
                Authentik
              </h2>
              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                统一认证：用户下发、应用与 OIDC 提供程序对接
              </p>

              <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-2.5 py-2.5 dark:border-slate-800 dark:bg-slate-900/80">
                  <p className="text-[10px] text-slate-400">用户</p>
                  <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {akSummaryQ.isLoading ? "…" : akUsers}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-2.5 py-2.5 dark:border-slate-800 dark:bg-slate-900/80">
                  <p className="text-[10px] text-slate-400">应用</p>
                  <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {akSummaryQ.isLoading ? "…" : akApps}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-2.5 py-2.5 dark:border-slate-800 dark:bg-slate-900/80">
                  <p className="text-[10px] text-slate-400">OIDC 提供程序</p>
                  <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {akSummaryQ.isLoading ? "…" : akProviders}
                  </p>
                </div>
              </div>

              <span className="mt-auto inline-flex items-center gap-1 pt-4 text-xs font-medium text-fuchsia-600 group-hover:underline dark:text-fuchsia-400">
                进入 <ArrowRight size={13} />
              </span>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default HomeHub;

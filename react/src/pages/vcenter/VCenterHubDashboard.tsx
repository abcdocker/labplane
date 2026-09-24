import React, { useMemo } from "react";
import { useAppConfig } from "@/hooks/use-app-config";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Cloud, Cpu, Gauge, Monitor, Router, Settings, MemoryStick } from "lucide-react";
import { apiGetJson, type AppConfig } from "@/lib/api";
import type { VCenterHostsResponse, VCenterVMsResponse } from "./types";
import StatCard from "@/components/StatCard";
import VCenterEsxiPrometheusDashboard from "./VCenterEsxiPrometheusDashboard";

/** vCenter 工作区首页：巡检摘要 + Prometheus + 公有云主机数量 */
const VCenterHubDashboard: React.FC = () => {
  const appCfgQ = useAppConfig();
  const isViewer =
    appCfgQ.data?.dashboardRole === "viewer" || appCfgQ.data?.viewer === true;

  const vcStaleMs = Math.max(
    30_000,
    (appCfgQ.data?.vcenterCacheTtlSec ?? 120) * 1000
  );
  const vmsQ = useQuery({
    queryKey: ["vcenter-vms"],
    queryFn: ({ signal }) => apiGetJson<VCenterVMsResponse>("/api/vcenter/vms", { signal }),
    staleTime: vcStaleMs,
    refetchOnWindowFocus: false,
  });
  const hostsQ = useQuery({
    queryKey: ["vcenter-hosts"],
    queryFn: ({ signal }) => apiGetJson<VCenterHostsResponse>("/api/vcenter/hosts", { signal }),
    staleTime: vcStaleMs,
    refetchOnWindowFocus: false,
  });
  const cloudQ = useQuery({
    queryKey: ["cloud-hosts"],
    queryFn: ({ signal }) => apiGetJson<{ hosts: unknown[] }>("/api/cloud-hosts", { signal }),
    enabled: !isViewer && appCfgQ.isSuccess,
    staleTime: 60_000,
  });

  const loading = vmsQ.isLoading || hostsQ.isLoading;
  const nVm = vmsQ.data?.vms?.length ?? 0;
  const nHost = hostsQ.data?.hosts?.length ?? 0;
  const nCloud = isViewer ? null : (cloudQ.data?.hosts?.length ?? 0);
  const vcErr = vmsQ.error || hostsQ.error;

  const hostResources = useMemo(() => {
    const hosts = hostsQ.data?.hosts ?? [];
    let cpuUsed = 0, cpuTotal = 0, memUsed = 0, memTotal = 0;
    for (const h of hosts) {
      cpuUsed += h.cpuUsageMHz ?? 0;
      cpuTotal += h.cpuCapacityMHz ?? 0;
      memUsed += h.memoryUsageMB ?? 0;
      memTotal += h.memoryTotalMB ?? 0;
    }
    const cpuPct = cpuTotal > 0 ? Math.round((cpuUsed / cpuTotal) * 100) : null;
    const memPct = memTotal > 0 ? Math.round((memUsed / memTotal) * 100) : null;
    const memUsedGiB = (memUsed / 1024).toFixed(1);
    const memTotalGiB = (memTotal / 1024).toFixed(1);
    return { cpuPct, memPct, cpuUsed, cpuTotal, memUsedGiB, memTotalGiB };
  }, [hostsQ.data]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">vCenter 巡检</h1>
        <p className="text-sm text-slate-500">
          汇总虚拟机、ESXi、公有云主机（管理员）；下方为与 Grafana 同源的 ESXi / 虚拟机 Prometheus 看板（需配置
          prometheusUrlVcenter 与 vmware 指标）。
        </p>
      </div>

      {vcErr && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">连接或列表异常</p>
            <p className="mt-1 text-xs">
              {vcErr instanceof Error ? vcErr.message : "加载失败"} — 请检查 vCenter 凭据与网络。
            </p>
            <Link
              to="/cluster/vcenter/settings"
              className="mt-2 inline-block text-xs font-semibold underline"
            >
              vCenter 设置
            </Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <StatCard
          title="虚拟机"
          value={loading ? "—" : String(nVm)}
          icon={Monitor}
          color="purple"
        />
        <StatCard
          title="ESXi 宿主机"
          value={loading ? "—" : String(nHost)}
          icon={Cpu}
          color="orange"
        />
        <StatCard
          title="ESXi CPU 使用率"
          value={
            hostsQ.isLoading
              ? "—"
              : hostResources.cpuPct !== null
              ? `${hostResources.cpuPct}%`
              : "—"
          }
          description={
            hostsQ.data && hostResources.cpuTotal > 0
              ? `${hostResources.cpuUsed} / ${hostResources.cpuTotal} MHz`
              : undefined
          }
          icon={Cpu}
          color={
            (hostResources.cpuPct ?? 0) >= 80
              ? "red"
              : (hostResources.cpuPct ?? 0) >= 60
              ? "amber"
              : "blue"
          }
        />
        <StatCard
          title="ESXi 内存使用率"
          value={
            hostsQ.isLoading
              ? "—"
              : hostResources.memPct !== null
              ? `${hostResources.memPct}%`
              : "—"
          }
          description={
            hostsQ.data && Number(hostResources.memTotalGiB) > 0
              ? `${hostResources.memUsedGiB} / ${hostResources.memTotalGiB} GiB`
              : undefined
          }
          icon={MemoryStick}
          color={
            (hostResources.memPct ?? 0) >= 85
              ? "red"
              : (hostResources.memPct ?? 0) >= 65
              ? "amber"
              : "green"
          }
        />
        {!isViewer && (
          <StatCard
            title="公有云主机（已登记）"
            value={cloudQ.isLoading ? "—" : String(nCloud ?? 0)}
            icon={Cloud}
            color="green"
          />
        )}
        <StatCard
          title="vCenter 已配置"
          value={appCfgQ.data?.vcenterConfigured ? "是" : "否"}
          icon={Settings}
          color={appCfgQ.data?.vcenterConfigured ? "green" : "amber"}
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-6">
        <VCenterEsxiPrometheusDashboard />
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          to="/cluster/vcenter"
          className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-medium text-violet-900 hover:bg-violet-100"
        >
          <Monitor size={18} />
          虚拟机列表
        </Link>
        <Link
          to="/cluster/vcenter/hosts"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          <Cpu size={18} />
          宿主机
        </Link>
        {(appCfgQ.data?.prometheusVcenterConfigured === true ||
          appCfgQ.data?.prometheusConfigured === true) && (
          <>
            <Link
              to="/cluster/vcenter/router"
              className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-medium text-sky-900 hover:bg-sky-100"
            >
              <Router size={18} />
              爱快路由监控
            </Link>
            <Link
              to="/cluster/vcenter/gpu"
              className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-medium text-violet-900 hover:bg-violet-100"
            >
              <Gauge size={18} />
              GPU 监控
            </Link>
          </>
        )}
        {!isViewer && (
          <Link
            to="/cluster/vcenter/cloud"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            <Cloud size={18} />
            公有云
          </Link>
        )}
        <Link
          to="/cluster/vcenter/settings"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          <Settings size={18} />
          vCenter 设置
        </Link>
      </div>
    </div>
  );
};

export default VCenterHubDashboard;

import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Bot,
  CloudCog,
  Database,
  Globe,
  HardDrive,
  KeyRound,
  Layers,
  LayoutDashboard,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiGetJson } from "@/lib/api";
import { cn } from "@/lib/utils";

type RedisStatus = {
  mysqlReachable: boolean;
  encryptionReady: boolean;
  mirrorRedisOk: boolean;
  dualWriteRedis?: boolean;
};

/**
 * 应用中心 · 全局 Dashboard（MySQL/加密/实例总数/平台镜像），与「Redis 缓存」实例页分离。
 */
export default function AppCenterDashboard() {
  const statusQ = useQuery({
    queryKey: ["app-center-redis-status"],
    queryFn: ({ signal }) => apiGetJson<RedisStatus>("/api/app-center/redis/status", { signal }),
  });

  const listQ = useQuery({
    queryKey: ["app-center-redis-instances"],
    queryFn: ({ signal }) =>
      apiGetJson<{ instances: unknown[]; mysqlRequired?: boolean }>(
        "/api/app-center/redis/instances"
      , { signal }),
  });

  const cloudVmQ = useQuery({
    queryKey: ["app-center-cloud-vm-instances"],
    queryFn: ({ signal }) =>
      apiGetJson<{ instances: unknown[] }>("/api/app-center/cloud-vm/instances", { signal }),
  });

  const kafkaQ = useQuery({
    queryKey: ["app-center-kafka-instances-dash"],
    queryFn: ({ signal }) => apiGetJson<{ instances: unknown[] }>("/api/app-center/kafka/instances", { signal }),
    enabled: statusQ.data?.mysqlReachable === true,
  });

  const openSearchQ = useQuery({
    queryKey: ["app-center-opensearch-instances-dash"],
    queryFn: ({ signal }) => apiGetJson<{ instances: unknown[] }>("/api/app-center/opensearch/instances", { signal }),
  });

  const dnsAccountsQ = useQuery({
    queryKey: ["app-center-dns-accounts-dash"],
    queryFn: ({ signal }) => apiGetJson<{ accounts: unknown[] }>("/api/dns/accounts", { signal }),
    enabled: statusQ.data?.mysqlReachable === true,
  });

  const dnsDomainsQ = useQuery({
    queryKey: ["app-center-dns-domains-dash"],
    queryFn: ({ signal }) => apiGetJson<{ domains: unknown[] }>("/api/dns/domains", { signal }),
    enabled: statusQ.data?.mysqlReachable === true,
  });

  const nInst = listQ.data?.instances?.length ?? 0;
  const nCloudVm = cloudVmQ.data?.instances?.length ?? 0;
  const nKafka = kafkaQ.data?.instances?.length ?? 0;
  const nOpenSearch = openSearchQ.data?.instances?.length ?? 0;
  const nDnsAccounts = dnsAccountsQ.data?.accounts?.length ?? 0;
  const nDnsDomains = dnsDomainsQ.data?.domains?.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50 via-white to-slate-100/80 px-6 py-8 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-slate-200/30 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">
              应用中心 · 全局
            </p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-[26px]">
              <LayoutDashboard className="h-7 w-7 text-slate-600" />
              Dashboard
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
              纳管 Redis、Kafka、云主机等实例数量与全局依赖（MySQL、加密、Redis 双写）；点下方卡片进入各子模块。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              asChild
              variant="secondary"
              className="h-10 shrink-0 gap-1.5 border-slate-200 bg-white shadow-sm hover:bg-slate-50"
            >
              <Link to="/cluster/apps/redis">
                Redis 缓存
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="secondary"
              className="h-10 shrink-0 gap-1.5 border-violet-200/80 bg-violet-50/70 shadow-sm hover:bg-violet-100/80"
            >
              <Link to="/cluster/apps/kafka">
                Kafka
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="secondary"
              className="h-10 shrink-0 gap-1.5 border-slate-200 bg-white shadow-sm hover:bg-slate-50"
            >
              <Link to="/cluster/apps/cloud-vm">
                云主机
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="secondary"
              className="h-10 shrink-0 gap-1.5 border-slate-200 bg-white shadow-sm hover:bg-slate-50"
            >
              <Link to="/cluster/apps/opensearch">
                OpenSearch
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="secondary"
              className="h-10 shrink-0 gap-1.5 border-emerald-200/80 bg-emerald-50/70 shadow-sm hover:bg-emerald-100/80"
            >
              <Link to="/cluster/apps/dns">
                DNS 管理
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">已纳管资源</h2>
      </div>

      {statusQ.data && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Redis 实例</p>
              <p className="text-2xl font-semibold tabular-nums text-slate-900">{nInst}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-violet-100 bg-white p-4 shadow-sm">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-violet-200 bg-violet-50 text-violet-700">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Kafka 实例</p>
              <p className="text-2xl font-semibold tabular-nums text-slate-900">{nKafka}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700">
              <HardDrive className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">云主机实例</p>
              <p className="text-2xl font-semibold tabular-nums text-slate-900">{nCloudVm}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700">
              <Search className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">OpenSearch 实例</p>
              <p className="text-2xl font-semibold tabular-nums text-slate-900">{nOpenSearch}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">DNS 服务商账号</p>
              <p className="text-2xl font-semibold tabular-nums text-slate-900">{nDnsAccounts}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700">
              <Globe className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">托管域名</p>
              <p className="text-2xl font-semibold tabular-nums text-slate-900">{nDnsDomains}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
            <div
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-xl border",
                statusQ.data.mysqlReachable
                  ? "border-emerald-100 bg-emerald-50 text-emerald-600"
                  : "border-amber-100 bg-amber-50 text-amber-700"
              )}
            >
              <HardDrive className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">元数据存储 · MySQL</p>
              <p className="text-sm font-semibold text-slate-900">
                {statusQ.data.mysqlReachable ? "已连接" : "未连接"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
            <div
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-xl border",
                statusQ.data.encryptionReady
                  ? "border-emerald-100 bg-emerald-50 text-emerald-600"
                  : "border-red-100 bg-red-50 text-red-600"
              )}
            >
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">凭据加密</p>
              <p className="text-sm font-semibold text-slate-900">
                {statusQ.data.encryptionReady ? "已就绪" : "未配置密钥"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
            <div
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-xl border",
                statusQ.data.dualWriteRedis && statusQ.data.mirrorRedisOk
                  ? "border-violet-100 bg-violet-50 text-violet-600"
                  : "border-slate-100 bg-slate-50 text-slate-500"
              )}
            >
              <CloudCog className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">平台 Redis 镜像</p>
              <p className="text-sm font-semibold text-slate-900">
                {!statusQ.data.dualWriteRedis
                  ? "未开启双写"
                  : statusQ.data.mirrorRedisOk
                    ? "已同步"
                    : "未就绪"}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Activity, ArrowRight, Calendar, Globe, KeyRound, LayoutDashboard,
  Server, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiGetJson } from "@/lib/api";

type DnsStatus = {
  mysqlReachable: boolean;
  stats?: {
    accountCount: number;
    domainCount: number;
    recordCount: number;
    failoverCount: number;
    scheduledCount: number;
    certCount: number;
  };
  byProvider?: { provider: string; count: number }[];
};

const PROVIDER_LABELS: Record<string, string> = {
  cloudflare: "Cloudflare",
  aliyun: "阿里云",
  tencent: "腾讯云",
  dnspod: "DNSPod",
  namesilo: "Namesilo",
  manual: "手动",
};

export default function DnsDashboard() {
  const statusQ = useQuery({
    queryKey: ["dns-status"],
    queryFn: ({ signal }) => apiGetJson<DnsStatus>("/api/dns/status", { signal }),
  });

  const s = statusQ.data?.stats;
  const byProvider = statusQ.data?.byProvider ?? [];

  const statCards = [
    { label: "服务商账号", value: s?.accountCount ?? 0, icon: KeyRound, to: "/cluster/apps/dns/accounts", color: "text-blue-600 bg-blue-50" },
    { label: "托管域名", value: s?.domainCount ?? 0, icon: Globe, to: "/cluster/apps/dns/domains", color: "text-violet-600 bg-violet-50" },
    { label: "解析记录", value: s?.recordCount ?? 0, icon: Server, to: "/cluster/apps/dns/records", color: "text-emerald-600 bg-emerald-50" },
    { label: "监测任务", value: s?.failoverCount ?? 0, icon: Activity, to: "/cluster/apps/dns/failover", color: "text-amber-600 bg-amber-50" },
    { label: "待执行任务", value: s?.scheduledCount ?? 0, icon: Calendar, to: "/cluster/apps/dns/scheduled", color: "text-orange-600 bg-orange-50" },
    { label: "SSL 证书", value: s?.certCount ?? 0, icon: ShieldCheck, to: "/cluster/apps/dns/certs", color: "text-teal-600 bg-teal-50" },
  ];

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50 via-white to-slate-100/80 px-6 py-8 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-blue-200/20 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">DNS 管理 · 概览</p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-[26px]">
              <LayoutDashboard className="h-7 w-7 text-slate-600" />
              Dashboard
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
              统一管理 Cloudflare、阿里云、腾讯云等多服务商的域名解析记录、SSL 证书申请、健康监测与定时任务。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary" className="h-9 gap-1.5 border-slate-200 bg-white shadow-sm hover:bg-slate-50">
              <Link to="/cluster/apps/dns/accounts">服务商账号 <ArrowRight className="h-3.5 w-3.5" /></Link>
            </Button>
            <Button asChild variant="secondary" className="h-9 gap-1.5 border-blue-200/80 bg-blue-50/70 shadow-sm hover:bg-blue-100/80">
              <Link to="/cluster/apps/dns/domains">域名管理 <ArrowRight className="h-3.5 w-3.5" /></Link>
            </Button>
          </div>
        </div>
      </div>

      {/* MySQL warning */}
      {statusQ.data && !statusQ.data.mysqlReachable && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>MySQL 未连接</strong> — DNS 管理需要 MySQL 存储数据。请在平台设置中配置 <code>MYSQL_DSN</code>。
        </div>
      )}

      {/* Stats grid */}
      {statusQ.data?.mysqlReachable && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {statCards.map(({ label, value, icon: Icon, to, color }) => (
            <Link
              key={label}
              to={to}
              className="group flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">{label}</p>
                <p className="text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Provider breakdown */}
      {byProvider.length > 0 && (
        <div className="rounded-xl border border-slate-200/80 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">服务商域名分布</h2>
          <div className="flex flex-wrap gap-2">
            {byProvider.map(({ provider, count }) => (
              <div key={provider} className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                <span className="text-sm font-medium text-slate-700">{PROVIDER_LABELS[provider] ?? provider}</span>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600 shadow-sm">
                  {count} 个域名
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick access */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { title: "添加服务商账号", desc: "接入 Cloudflare、阿里云、腾讯云等 DNS 服务商", to: "/cluster/apps/dns/accounts", icon: KeyRound, color: "from-blue-500 to-blue-600" },
          { title: "管理域名", desc: "添加并管理托管域名，同步解析记录", to: "/cluster/apps/dns/domains", icon: Globe, color: "from-violet-500 to-violet-600" },
          { title: "SSL 证书", desc: "通过 DNS-01 验证申请 Let's Encrypt 免费证书", to: "/cluster/apps/dns/certs", icon: ShieldCheck, color: "from-teal-500 to-teal-600" },
          { title: "健康监测", desc: "配置 HTTP/TCP 探针，故障时自动切换 DNS 记录", to: "/cluster/apps/dns/failover", icon: Activity, color: "from-amber-500 to-amber-600" },
          { title: "定时任务", desc: "在指定时间暂停、启用或修改解析记录", to: "/cluster/apps/dns/scheduled", icon: Calendar, color: "from-orange-500 to-orange-600" },
          { title: "解析记录", desc: "查看并管理所有域名的 A/CNAME/MX/TXT 等记录", to: "/cluster/apps/dns/records", icon: Server, color: "from-emerald-500 to-emerald-600" },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.title}
              to={item.to}
              className="group flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-slate-300 hover:shadow-md"
            >
              <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white ${item.color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-slate-800">{item.title}</h3>
              <p className="mt-1 text-sm text-slate-500">{item.desc}</p>
              <span className="mt-3 flex items-center gap-1 text-xs font-medium text-blue-600 group-hover:underline">
                进入 <ArrowRight className="h-3 w-3" />
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

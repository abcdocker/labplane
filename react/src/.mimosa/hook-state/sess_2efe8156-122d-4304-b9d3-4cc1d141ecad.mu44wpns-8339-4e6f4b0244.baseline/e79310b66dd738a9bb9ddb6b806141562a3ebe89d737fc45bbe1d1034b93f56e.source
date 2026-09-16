import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, AlertCircle, Search, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { apiGetJson } from "@/lib/api";
import { CloudAuthGuide } from "./CloudAuthGuide";

function fmtErr(e: unknown) {
  return (e as Error).message ?? String(e);
}

function formatBytes(b: number) {
  if (b === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatBps(b: number) {
  if (b === 0) return "0 bps";
  const k = 1000;
  const sizes = ["bps", "Kbps", "Mbps", "Gbps"];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function nowStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:00`;
}

function defaultStartStr() {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:00`;
}

type Account = { id: number; name: string; provider: string };

type MetricPoint = { Time: string; Value: number };
type MetricData = { Metric: string; Detail: MetricPoint[] };

type CDNDomainItem = {
  Domain: string;
  Status: string;
  Cname: string;
  Area: string;
  ServiceType: string;
};

export default function TencentCloudCDN() {
  const [accountId, setAccountId] = useState<string>("all");
  const [domain, setDomain] = useState("");
  const [start, setStart] = useState(defaultStartStr);
  const [end, setEnd] = useState(nowStr);

  const accountsQ = useQuery({
    queryKey: ["dns-accounts"],
    queryFn: ({ signal }) => apiGetJson<{ accounts: Account[] }>("/api/dns/accounts", { signal }),
  });
  const tencentAccounts = (accountsQ.data?.accounts ?? []).filter((a) =>
    ["tencent", "tencentcloud", "dnspod"].includes(a.provider)
  );

  const metricsQ = useQuery({
    queryKey: ["tencent-cloud-cdn", accountId, start, end, domain],
    queryFn: async ({ signal }) => {
      if (accountId === "all") {
        const allFlux: MetricData[] = [];
        const allBandwidth: MetricData[] = [];
        for (const acc of tencentAccounts) {
          try {
            const res = await apiGetJson<{ flux: MetricData[]; bandwidth: MetricData[] }>(
              `/api/tencent-cloud/cdn/metrics?account_id=${acc.id}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&domain=${encodeURIComponent(domain)}`,
              { signal }
            );
            allFlux.push(...(res.flux ?? []));
            allBandwidth.push(...(res.bandwidth ?? []));
          } catch { /* ignore */ }
        }
        return { flux: allFlux, bandwidth: allBandwidth };
      }
      return apiGetJson<{ flux: MetricData[]; bandwidth: MetricData[] }>(
        `/api/tencent-cloud/cdn/metrics?account_id=${accountId}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&domain=${encodeURIComponent(domain)}`,
        { signal }
      );
    },
    enabled: tencentAccounts.length > 0,
  });

  const fluxData = metricsQ.data?.flux ?? [];
  const bandwidthData = metricsQ.data?.bandwidth ?? [];

  const totalFlux = fluxData.reduce((sum, d) => sum + d.Detail.reduce((s2, p) => s2 + p.Value, 0), 0);
  const maxBandwidth = bandwidthData.flatMap((d) => d.Detail).reduce((max, p) => Math.max(max, p.Value), 0);

  const domainsQ = useQuery({
    queryKey: ["tencent-cloud-cdn-domains", accountId],
    queryFn: async ({ signal }) => {
      if (accountId === "all") {
        const all: (CDNDomainItem & { accountName: string })[] = [];
        for (const acc of tencentAccounts) {
          try {
            const res = await apiGetJson<{ domains: CDNDomainItem[] }>(
              `/api/tencent-cloud/cdn/domains?account_id=${acc.id}`,
              { signal }
            );
            for (const d of res.domains ?? []) {
              all.push({ ...d, accountName: acc.name });
            }
          } catch { /* ignore */ }
        }
        return { domains: all };
      }
      const res = await apiGetJson<{ domains: CDNDomainItem[] }>(
        `/api/tencent-cloud/cdn/domains?account_id=${accountId}`,
        { signal }
      );
      const acc = tencentAccounts.find((a) => String(a.id) === accountId);
      return { domains: (res.domains ?? []).map((d) => ({ ...d, accountName: acc?.name ?? "" })) };
    },
    enabled: tencentAccounts.length > 0,
  });

  const domainList = (domainsQ.data?.domains ?? []) as (CDNDomainItem & { accountName: string })[];

  const domainBadge = (status: string) => {
    if (status === "online") return "bg-emerald-50 text-emerald-700";
    if (status === "offline") return "bg-red-50 text-red-700";
    return "bg-slate-50 text-slate-700";
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">CDN 使用量</h2>
          <p className="text-sm text-slate-500">查询腾讯云 CDN 流量与带宽数据</p>
        </div>
        <div className="w-56">
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger>
              <SelectValue placeholder="选择账号" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部账号</SelectItem>
              {tencentAccounts.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <CloudAuthGuide provider="tencent" />

      {/* 域名列表 */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Globe className="h-4 w-4 text-orange-500" /> CDN 域名列表
        </h3>
        {domainsQ.isLoading && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> 加载域名…
          </div>
        )}
        {domainsQ.isError && (
          <div className="flex items-center gap-2 text-sm text-red-600">
            <AlertCircle className="h-4 w-4" /> {fmtErr(domainsQ.error)}
          </div>
        )}
        {domainList.length === 0 && !domainsQ.isLoading && (
          <div className="text-sm text-slate-400">该账号下暂无 CDN 域名</div>
        )}
        {domainList.length > 0 && (
          <div className="max-h-80 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead>域名</TableHead>
                  {accountId === "all" && <TableHead>所属账号</TableHead>}
                  <TableHead>CNAME</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>加速区域</TableHead>
                  <TableHead>业务类型</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {domainList.map((d) => (
                  <TableRow key={d.Domain + d.accountName}>
                    <TableCell className="font-medium text-slate-800 text-sm">{d.Domain}</TableCell>
                    {accountId === "all" && <TableCell className="text-sm text-slate-600">{d.accountName}</TableCell>}
                    <TableCell className="text-xs text-slate-500">{d.Cname}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${domainBadge(d.Status)}`}>
                        {d.Status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">{d.Area}</TableCell>
                    <TableCell className="text-sm text-slate-600">{d.ServiceType}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="w-56 space-y-1">
          <label className="text-xs font-medium text-slate-600">域名（可选）</label>
          <Input placeholder="全部域名" value={domain} onChange={(e) => setDomain(e.target.value)} />
        </div>
        <div className="w-48 space-y-1">
          <label className="text-xs font-medium text-slate-600">开始时间</label>
          <Input type="text" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="w-48 space-y-1">
          <label className="text-xs font-medium text-slate-600">结束时间</label>
          <Input type="text" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <Button onClick={() => metricsQ.refetch()} disabled={metricsQ.isFetching}>
          {metricsQ.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
          查询
        </Button>
      </div>

      {metricsQ.isError && (
        <div className="flex items-center gap-2 text-sm text-red-600">
          <AlertCircle className="h-4 w-4" /> {fmtErr(metricsQ.error)}
        </div>
      )}

      {metricsQ.isSuccess && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">总流量</p>
            <p className="mt-1 text-2xl font-semibold text-slate-800">{formatBytes(totalFlux)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">带宽峰值</p>
            <p className="mt-1 text-2xl font-semibold text-slate-800">{formatBps(maxBandwidth)}</p>
          </div>
        </div>
      )}

      {metricsQ.isSuccess && fluxData.length === 0 && bandwidthData.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm text-slate-400">
          该时间段内无 CDN 数据
        </div>
      )}

      {fluxData.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">流量明细</h3>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-slate-600">时间</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-600">流量</th>
                </tr>
              </thead>
              <tbody>
                {fluxData.flatMap((d) => d.Detail).map((p, idx) => (
                  <tr key={idx} className="border-t border-slate-100">
                    <td className="px-3 py-2 text-slate-700">{p.Time}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{formatBytes(p.Value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Cloud, FolderOpen, Globe, HardDrive, Loader2, TrendingUp, TrendingDown, Files, Database } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { apiGetJson } from "@/lib/api";

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

function fmtNumber(n: number) {
  return n.toLocaleString("zh-CN");
}

type Account = { id: number; name: string; provider: string };

type Bucket = {
  id: string;
  name: string;
  region: string;
  private: number;
  createdAt: string;
  domain: string;
};

type KodoObject = {
  key: string;
  hash: string;
  fsize: number;
  putTime: number;
  mimeType: string;
};

type CDNDomain = {
  name: string;
  type: string;
  status: string;
  cname: string;
  protocol: string;
  geoCover: string;
  createAt: string;
  modifyAt: string;
  operatingState: string;
  testURLPath: string;
  qiniuPrivate: boolean;
};

type Stats = {
  todayCount: number;
  yesterdayCount: number;
  thisMonthCount: number;
  lastMonthCount: number;
  todaySpace: number;
  yesterdaySpace: number;
  thisMonthSpace: number;
  lastMonthSpace: number;
};

function StatCard({
  icon,
  title,
  today,
  yesterday,
  thisMonth,
  lastMonth,
  formatter,
}: {
  icon: React.ReactNode;
  title: string;
  today: number;
  yesterday: number;
  thisMonth: number;
  lastMonth: number;
  formatter?: (v: number) => string;
}) {
  const fmt = formatter ?? fmtNumber;
  const dayDiff = today - yesterday;
  const monthDiff = thisMonth - lastMonth;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
        {icon}
        {title}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-slate-400">今日</div>
          <div className="text-lg font-semibold text-slate-800">{fmt(today)}</div>
          <div className={`flex items-center gap-0.5 text-xs ${dayDiff >= 0 ? "text-emerald-600" : "text-red-500"}`}>
            {dayDiff >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {dayDiff >= 0 ? "+" : ""}
            {fmt(dayDiff)} 较昨日
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-400">昨日</div>
          <div className="text-lg font-semibold text-slate-800">{fmt(yesterday)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-400">本月</div>
          <div className="text-base font-semibold text-slate-800">{fmt(thisMonth)}</div>
          <div className={`flex items-center gap-0.5 text-xs ${monthDiff >= 0 ? "text-emerald-600" : "text-red-500"}`}>
            {monthDiff >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {monthDiff >= 0 ? "+" : ""}
            {fmt(monthDiff)} 较上月
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-400">上月</div>
          <div className="text-base font-semibold text-slate-800">{fmt(lastMonth)}</div>
        </div>
      </div>
    </div>
  );
}

export default function DnsQiniu() {
  const [accountId, setAccountId] = useState<string>("");
  const [tab, setTab] = useState<"kodo" | "cdn">("kodo");
  const [bucketName, setBucketName] = useState<string>("");

  const accountsQ = useQuery({
    queryKey: ["dns-accounts"],
    queryFn: ({ signal }) => apiGetJson<{ accounts: Account[] }>("/api/dns/accounts", { signal }),
  });
  const qiniuAccounts = (accountsQ.data?.accounts ?? []).filter((a) => a.provider === "qiniu");

  const bucketsQ = useQuery({
    queryKey: ["qiniu-cloud-kodo-buckets", accountId],
    queryFn: ({ signal }) => apiGetJson<{ buckets: Bucket[] }>(`/api/qiniu-cloud/kodo/buckets?account_id=${accountId}`, { signal }),
    enabled: accountId !== "" && tab === "kodo",
  });

  const objectsQ = useQuery({
    queryKey: ["qiniu-cloud-kodo-objects", accountId, bucketName],
    queryFn: ({ signal }) =>
      apiGetJson<{ marker: string; commonPrefixes: string[]; contents: KodoObject[] }>(
        `/api/qiniu-cloud/kodo/objects?account_id=${accountId}&bucket=${encodeURIComponent(bucketName)}`,
        { signal }
      ),
    enabled: accountId !== "" && tab === "kodo" && bucketName !== "",
  });

  const cdnQ = useQuery({
    queryKey: ["qiniu-cloud-cdn-domains", accountId],
    queryFn: ({ signal }) => apiGetJson<{ domains: CDNDomain[] }>(`/api/qiniu-cloud/cdn/domains?account_id=${accountId}`, { signal }),
    enabled: accountId !== "" && tab === "cdn",
  });

  const statsQ = useQuery({
    queryKey: ["qiniu-cloud-stats", accountId],
    queryFn: ({ signal }) => apiGetJson<{ stats: Stats }>(`/api/qiniu-cloud/stats?account_id=${accountId}`, { signal }),
    enabled: accountId !== "" && tab === "kodo",
  });

  const buckets = bucketsQ.data?.buckets ?? [];
  const objects = objectsQ.data?.contents ?? [];
  const domains = cdnQ.data?.domains ?? [];
  const stats = statsQ.data?.stats;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">七牛云</h2>
          <p className="text-sm text-slate-500">查看七牛云对象存储 Kodo 与 CDN 域名</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-slate-200 bg-white p-1">
            <button
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === "kodo" ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50"}`}
              onClick={() => setTab("kodo")}
            >
              <HardDrive className="inline h-3.5 w-3.5 mr-1" /> Kodo
            </button>
            <button
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === "cdn" ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50"}`}
              onClick={() => setTab("cdn")}
            >
              <Cloud className="inline h-3.5 w-3.5 mr-1" /> CDN
            </button>
          </div>
          <div className="w-56">
            <Select value={accountId} onValueChange={(v) => { setAccountId(v); setBucketName(""); }}>
              <SelectTrigger>
                <SelectValue placeholder="选择七牛云账号" />
              </SelectTrigger>
              <SelectContent>
                {qiniuAccounts.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {!accountId && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm text-slate-400">
          请选择七牛云账号
        </div>
      )}

      {tab === "kodo" && accountId && (
        <div className="space-y-4">
          {/* 概览统计 */}
          {statsQ.isLoading && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> 加载统计数据…
            </div>
          )}
          {statsQ.isError && (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertCircle className="h-4 w-4" /> 统计加载失败：{fmtErr(statsQ.error)}
            </div>
          )}
          {stats && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                icon={<Files className="h-4 w-4 text-violet-500" />}
                title="文件数"
                today={stats.todayCount}
                yesterday={stats.yesterdayCount}
                thisMonth={stats.thisMonthCount}
                lastMonth={stats.lastMonthCount}
              />
              <StatCard
                icon={<Database className="h-4 w-4 text-blue-500" />}
                title="存储量"
                today={stats.todaySpace}
                yesterday={stats.yesterdaySpace}
                thisMonth={stats.thisMonthSpace}
                lastMonth={stats.lastMonthSpace}
                formatter={formatBytes}
              />
            </div>
          )}

          {bucketsQ.isLoading && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> 加载存储桶…
            </div>
          )}
          {bucketsQ.isError && (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertCircle className="h-4 w-4" /> {fmtErr(bucketsQ.error)}
            </div>
          )}

          {!bucketName && buckets.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {buckets.map((b) => (
                <div
                  key={b.name}
                  className="cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-violet-300"
                  onClick={() => setBucketName(b.name)}
                >
                  <div className="flex items-center gap-2">
                    <FolderOpen className="h-5 w-5 text-violet-500" />
                    <span className="font-medium text-slate-800">{b.name}</span>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">区域: {b.region || "—"} · {b.private ? "私有" : "公开"}</div>
                  {b.domain && <div className="text-xs text-slate-500">域名: {b.domain}</div>}
                </div>
              ))}
            </div>
          )}

          {!bucketName && !bucketsQ.isLoading && buckets.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm text-slate-400">
              该账号下暂无存储桶
            </div>
          )}

          {bucketName && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <button className="text-sm text-violet-600 hover:underline" onClick={() => setBucketName("")}>← 返回存储桶列表</button>
                <span className="text-sm text-slate-400">/</span>
                <span className="text-sm font-medium text-slate-800">{bucketName}</span>
              </div>
              {objectsQ.isLoading && (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> 加载对象…
                </div>
              )}
              {objectsQ.isError && (
                <div className="flex items-center gap-2 text-sm text-red-600">
                  <AlertCircle className="h-4 w-4" /> {fmtErr(objectsQ.error)}
                </div>
              )}
              {objects.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/80">
                        <TableHead>对象 Key</TableHead>
                        <TableHead>大小</TableHead>
                        <TableHead>MIME</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {objects.map((obj) => (
                        <TableRow key={obj.key}>
                          <TableCell className="font-medium text-slate-800">{obj.key}</TableCell>
                          <TableCell className="text-sm text-slate-600">{formatBytes(obj.fsize ?? 0)}</TableCell>
                          <TableCell className="text-sm text-slate-600">{obj.mimeType || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {!objectsQ.isLoading && objects.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm text-slate-400">
                  该存储桶下暂无对象
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "cdn" && accountId && (
        <div className="space-y-4">
          {cdnQ.isLoading && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> 加载 CDN 域名…
            </div>
          )}
          {cdnQ.isError && (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertCircle className="h-4 w-4" /> {fmtErr(cdnQ.error)}
            </div>
          )}
          {domains.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead>域名</TableHead>
                    <TableHead>协议</TableHead>
                    <TableHead>覆盖范围</TableHead>
                    <TableHead>CNAME</TableHead>
                    <TableHead>创建时间</TableHead>
                    <TableHead>操作状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {domains.map((d) => (
                    <TableRow key={d.name}>
                      <TableCell className="font-medium text-slate-800">
                        <div className="flex items-center gap-2">
                          <Globe className="h-4 w-4 text-violet-500 shrink-0" />
                          <div>
                            <div>{d.name}</div>
                            {d.qiniuPrivate && (
                              <Badge variant="outline" className="mt-0.5 text-[10px] bg-amber-50 text-amber-700">私有</Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">
                        <Badge variant="outline" className={`text-xs ${d.protocol === "https" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}>
                          {d.protocol?.toUpperCase() || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {d.geoCover === "china" ? "中国" : d.geoCover === "global" ? "全球" : d.geoCover || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-slate-600 font-mono">{d.cname || "—"}</TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {d.createAt ? new Date(d.createAt).toLocaleDateString("zh-CN") : "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        <Badge variant="outline" className={`text-xs ${d.operatingState === "success" ? "bg-emerald-50 text-emerald-700" : d.operatingState === "processing" ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-700"}`}>
                          {d.operatingState === "success" ? "正常" : d.operatingState === "processing" ? "处理中" : d.operatingState || "—"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {!cdnQ.isLoading && domains.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm text-slate-400">
              该账号下暂无 CDN 域名
            </div>
          )}
        </div>
      )}
    </div>
  );
}

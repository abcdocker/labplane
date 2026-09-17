import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle, ChevronLeft, Cloud, FileText, FolderOpen, Globe, HardDrive, Loader2, TrendingUp, TrendingDown, Files, Database, LayoutDashboard
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { apiGetJson } from "@/lib/api";
import { CloudAuthGuide } from "@/pages/tencent-cloud/CloudAuthGuide";

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

export default function QiniuCloudPage() {
  const [accountId, setAccountId] = useState<string>("all");
  const [tab, setTab] = useState<"overview" | "kodo" | "cdn">("overview");
  const [bucketName, setBucketName] = useState<string>("");
  const [prefix, setPrefix] = useState<string>("");

  const accountsQ = useQuery({
    queryKey: ["dns-accounts"],
    queryFn: ({ signal }) => apiGetJson<{ accounts: Account[] }>("/api/dns/accounts", { signal }),
  });
  const qiniuAccounts = (accountsQ.data?.accounts ?? []).filter((a) => a.provider === "qiniu");

  useEffect(() => {
    if (qiniuAccounts.length > 0 && accountId === "all" && qiniuAccounts.length === 1) {
      setAccountId(String(qiniuAccounts[0].id));
    }
  }, [qiniuAccounts, accountId]);

  const bucketsQ = useQuery({
    queryKey: ["qiniu-cloud-kodo-buckets", accountId],
    queryFn: async ({ signal }) => {
      if (accountId === "all") {
        const all: (Bucket & { accountName: string })[] = [];
        for (const acc of qiniuAccounts) {
          try {
            const res = await apiGetJson<{ buckets: Bucket[] }>(`/api/qiniu-cloud/kodo/buckets?account_id=${acc.id}`, { signal });
            for (const b of res.buckets ?? []) {
              all.push({ ...b, accountName: acc.name });
            }
          } catch { /* ignore */ }
        }
        return { buckets: all };
      }
      return apiGetJson<{ buckets: Bucket[] }>(`/api/qiniu-cloud/kodo/buckets?account_id=${accountId}`, { signal });
    },
    enabled: qiniuAccounts.length > 0 && (tab === "kodo" || tab === "overview"),
  });

  const objectsQ = useQuery({
    queryKey: ["qiniu-cloud-kodo-objects", accountId, bucketName, prefix],
    queryFn: ({ signal }) =>
      apiGetJson<{ marker: string; commonPrefixes: string[]; contents: KodoObject[] }>(
        `/api/qiniu-cloud/kodo/objects?account_id=${accountId}&bucket=${encodeURIComponent(bucketName)}&prefix=${encodeURIComponent(prefix)}`,
        { signal }
      ),
    enabled: accountId !== "all" && accountId !== "" && tab === "kodo" && bucketName !== "",
  });

  const cdnQ = useQuery({
    queryKey: ["qiniu-cloud-cdn-domains", accountId],
    queryFn: async ({ signal }) => {
      if (accountId === "all") {
        const all: (CDNDomain & { accountName: string })[] = [];
        for (const acc of qiniuAccounts) {
          try {
            const res = await apiGetJson<{ domains: CDNDomain[] }>(`/api/qiniu-cloud/cdn/domains?account_id=${acc.id}`, { signal });
            for (const d of res.domains ?? []) {
              all.push({ ...d, accountName: acc.name });
            }
          } catch { /* ignore */ }
        }
        return { domains: all };
      }
      return apiGetJson<{ domains: CDNDomain[] }>(`/api/qiniu-cloud/cdn/domains?account_id=${accountId}`, { signal });
    },
    enabled: qiniuAccounts.length > 0 && (tab === "cdn" || tab === "overview"),
  });

  const statsQ = useQuery({
    queryKey: ["qiniu-cloud-stats", accountId],
    queryFn: async ({ signal }) => {
      if (accountId === "all") {
        let totalTodayCount = 0, totalYesterdayCount = 0, totalThisMonthCount = 0, totalLastMonthCount = 0;
        let totalTodaySpace = 0, totalYesterdaySpace = 0, totalThisMonthSpace = 0, totalLastMonthSpace = 0;
        for (const acc of qiniuAccounts) {
          try {
            const res = await apiGetJson<{ stats: Stats }>(`/api/qiniu-cloud/stats?account_id=${acc.id}`, { signal });
            const s = res.stats;
            if (s) {
              totalTodayCount += s.todayCount;
              totalYesterdayCount += s.yesterdayCount;
              totalThisMonthCount += s.thisMonthCount;
              totalLastMonthCount += s.lastMonthCount;
              totalTodaySpace += s.todaySpace;
              totalYesterdaySpace += s.yesterdaySpace;
              totalThisMonthSpace += s.thisMonthSpace;
              totalLastMonthSpace += s.lastMonthSpace;
            }
          } catch { /* ignore */ }
        }
        return {
          stats: {
            todayCount: totalTodayCount, yesterdayCount: totalYesterdayCount,
            thisMonthCount: totalThisMonthCount, lastMonthCount: totalLastMonthCount,
            todaySpace: totalTodaySpace, yesterdaySpace: totalYesterdaySpace,
            thisMonthSpace: totalThisMonthSpace, lastMonthSpace: totalLastMonthSpace,
          }
        };
      }
      return apiGetJson<{ stats: Stats }>(`/api/qiniu-cloud/stats?account_id=${accountId}`, { signal });
    },
    enabled: qiniuAccounts.length > 0 && (tab === "kodo" || tab === "overview"),
  });

  const buckets = bucketsQ.data?.buckets ?? [];
  const objects = objectsQ.data?.contents ?? [];
  const commonPrefixes = objectsQ.data?.commonPrefixes ?? [];
  const domains = cdnQ.data?.domains ?? [];
  const stats = statsQ.data?.stats;

  const enterBucket = (name: string) => {
    setBucketName(name);
    setPrefix("");
  };

  const enterFolder = (p: string) => {
    setPrefix(p);
  };

  const goUp = () => {
    if (!prefix) return;
    const parts = prefix.replace(/\/$/, "").split("/");
    parts.pop();
    setPrefix(parts.length ? parts.join("/") + "/" : "");
  };

  const exitBucket = () => {
    setBucketName("");
    setPrefix("");
  };

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">七牛云</h2>
          <p className="text-sm text-slate-500">查看七牛云对象存储 Kodo 与 CDN 域名</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-44">
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="选择账号" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部账号</SelectItem>
                {qiniuAccounts.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex rounded-lg border border-slate-200 bg-white p-1">
            <button
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === "overview" ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50"}`}
              onClick={() => setTab("overview")}
            >
              <LayoutDashboard className="inline h-3.5 w-3.5 mr-1" /> 概览
            </button>
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
        </div>
      </div>

      <CloudAuthGuide provider="qiniu" />

      {qiniuAccounts.length === 0 && !accountsQ.isLoading && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm text-slate-400">
          未配置七牛云账号，请到 DNSPod → 账号管理 中添加
        </div>
      )}

      {tab === "overview" && (
        <div className="space-y-4">
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
          {statsQ.data?.stats && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                icon={<Files className="h-4 w-4 text-violet-500" />}
                title="文件数"
                today={statsQ.data.stats.todayCount}
                yesterday={statsQ.data.stats.yesterdayCount}
                thisMonth={statsQ.data.stats.thisMonthCount}
                lastMonth={statsQ.data.stats.lastMonthCount}
              />
              <StatCard
                icon={<Database className="h-4 w-4 text-blue-500" />}
                title="存储量"
                today={statsQ.data.stats.todaySpace}
                yesterday={statsQ.data.stats.yesterdaySpace}
                thisMonth={statsQ.data.stats.thisMonthSpace}
                lastMonth={statsQ.data.stats.lastMonthSpace}
                formatter={formatBytes}
              />
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-medium text-slate-700">存储空间数</p>
              <p className="mt-1 text-2xl font-semibold text-slate-800">{(bucketsQ.data?.buckets ?? []).length}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-medium text-slate-700">CDN 域名数</p>
              <p className="mt-1 text-2xl font-semibold text-slate-800">{(cdnQ.data?.domains ?? []).length}</p>
            </div>
          </div>
        </div>
      )}

      {tab === "kodo" && accountId !== "all" && accountId && (
        <div className="space-y-4">
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

          {!bucketName ? (
            <>
              {bucketsQ.isLoading && (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> 加载存储空间…
                </div>
              )}
              {bucketsQ.isError && (
                <div className="flex items-center gap-2 text-sm text-red-600">
                  <AlertCircle className="h-4 w-4" /> {fmtErr(bucketsQ.error)}
                </div>
              )}
              {buckets.length === 0 && !bucketsQ.isLoading && (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm text-slate-400">
                  暂无存储空间
                </div>
              )}
              {buckets.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {(bucketsQ.data?.buckets ?? []).map((b) => (
                    <div
                      key={b.id}
                      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm cursor-pointer hover:border-violet-300 transition-colors"
                      onClick={() => enterBucket(b.name)}
                    >
                      <div className="flex items-center gap-2">
                        <FolderOpen className="h-5 w-5 text-violet-500" />
                        <span className="font-medium text-slate-800">{b.name}</span>
                      </div>
                      <div className="mt-2 text-xs text-slate-500">地域: {b.region}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={exitBucket}>
                    <ChevronLeft className="h-4 w-4" /> 返回存储空间列表
                  </Button>
                  <span className="text-sm text-slate-500">/</span>
                  <span className="text-sm font-medium text-slate-800">{bucketName}</span>
                  {prefix && <span className="text-sm text-slate-500">/ {prefix}</span>}
                </div>
                <div className="flex gap-2">
                  {prefix && (
                    <Button variant="outline" size="sm" onClick={goUp}>
                      <ChevronLeft className="h-4 w-4 mr-1" /> 上级目录
                    </Button>
                  )}
                </div>
              </div>

              {objectsQ.isLoading && (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> 加载对象列表…
                </div>
              )}
              {objectsQ.isError && (
                <div className="flex items-center gap-2 text-sm text-red-600">
                  <AlertCircle className="h-4 w-4" /> {fmtErr(objectsQ.error)}
                </div>
              )}

              {objects.length === 0 && commonPrefixes.length === 0 && !objectsQ.isLoading && (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm text-slate-400">
                  当前目录下暂无对象
                </div>
              )}

              {(objects.length > 0 || commonPrefixes.length > 0) && (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/80">
                        <TableHead>名称</TableHead>
                        <TableHead>大小</TableHead>
                        <TableHead>MimeType</TableHead>
                        <TableHead>上传时间</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {commonPrefixes.map((p) => (
                        <TableRow key={p} className="cursor-pointer hover:bg-slate-50" onClick={() => enterFolder(p)}>
                          <TableCell className="font-medium text-slate-800">
                            <div className="flex items-center gap-2">
                              <FolderOpen className="h-4 w-4 text-amber-500" />
                              <span className="text-sm">{p.replace(prefix, "").replace(/\/$/, "")}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-slate-600">—</TableCell>
                          <TableCell className="text-sm text-slate-600">—</TableCell>
                          <TableCell className="text-sm text-slate-600">—</TableCell>
                        </TableRow>
                      ))}
                      {objects.map((obj) => (
                        <TableRow key={obj.key}>
                          <TableCell className="font-medium text-slate-800">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-slate-400" />
                              <span className="text-sm">{obj.key.replace(prefix, "")}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-slate-600">{formatBytes(obj.fsize)}</TableCell>
                          <TableCell className="text-sm text-slate-600">{obj.mimeType}</TableCell>
                          <TableCell className="text-sm text-slate-600">{new Date(obj.putTime / 10000).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
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

          {(cdnQ.data?.domains ?? []).length === 0 && !cdnQ.isLoading && (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm text-slate-400">
              暂无 CDN 域名
            </div>
          )}

          {(cdnQ.data?.domains ?? []).length > 0 && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead>域名</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>CNAME</TableHead>
                    <TableHead>协议</TableHead>
                    <TableHead>覆盖范围</TableHead>
                    <TableHead>运营状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {domains.map((d) => (
                    <TableRow key={d.name}>
                      <TableCell className="font-medium text-slate-800 text-sm">{d.name}</TableCell>
                      <TableCell className="text-sm text-slate-600">{d.type}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {d.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">{d.cname}</TableCell>
                      <TableCell className="text-sm text-slate-600">{d.protocol}</TableCell>
                      <TableCell className="text-sm text-slate-600">{d.geoCover}</TableCell>
                      <TableCell className="text-sm text-slate-600">{d.operatingState}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  ExternalLink,
  HardDrive,
  Loader2,
  RefreshCw,
  ScrollText,
  Sparkles,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiGetJson, apiPostJson, ApiHttpError } from "@/lib/api";
import { useAuth } from "@/auth/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OpenClawChatMarkdown } from "@/components/OpenClawChatMarkdown";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  formatAxisTime,
  formatBucketRange,
  formatLocalDateTime,
  parseAbsoluteRange,
  type LogHealthStatus,
  type LogOverviewScope,
  type LogPriority,
  type VmLogDetailRow,
  type VmLogDetailsRes,
  type VmLogNamespacesRes,
  type VmLogNginxNamedCount,
  type VmLogAIAnalyzeRes,
  type VmLogAIAnalyzeRowRes,
  type VmLogStats,
  type VmLogStatus,
  VM_LOG_BUCKET_OPTIONS,
  VM_LOG_KEYWORD_FIELD_OPTIONS,
  VM_LOG_MAIN_TABS,
  VM_LOG_REFRESH_OPTIONS,
  VM_LOG_WINDOW_OPTIONS_ALL,
} from "./aiInspectLogs.model";

function nginxGeoSourceLabel(src?: string): string {
  if (src === "maxmind-country") return "MaxMind GeoLite2 国家库";
  if (src === "maxmind-unavailable") return "已填写路径但无法加载 mmdb";
  return "内网/公网粗分（未配置国家库）";
}

function nginxBarChartData(rows: VmLogNginxNamedCount[] | undefined): { name: string; count: number }[] {
  return (rows ?? []).map((x) => ({ name: x.name ?? "—", count: Number(x.count) || 0 }));
}

function NginxHBarChart({
  title,
  rows,
  fill,
  yAxisWidth,
  labelMax,
}: {
  title: string;
  rows: VmLogNginxNamedCount[] | undefined;
  fill: string;
  yAxisWidth: number;
  labelMax: number;
}) {
  const data = nginxBarChartData(rows);
  if (data.length === 0) return null;
  const h = Math.min(440, 40 + data.length * 28);
  const fmt = (v: string | number) => {
    const s = String(v);
    return s.length > labelMax ? `${s.slice(0, labelMax)}…` : s;
  };
  return (
    <div className="min-w-0">
      <p className="mb-2 text-xs font-medium text-slate-700">{title}</p>
      <div className="w-full" style={{ height: h }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart layout="vertical" data={data} margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
            <YAxis
              type="category"
              dataKey="name"
              width={yAxisWidth}
              tick={{ fontSize: 10 }}
              interval={0}
              tickFormatter={fmt}
            />
            <Tooltip formatter={(v: number) => [v, "次"]} contentStyle={{ fontSize: 12 }} />
            <Bar dataKey="count" name="次数" fill={fill} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function statusLabel(status?: LogHealthStatus): string {
  switch (status) {
    case "fail":
      return "异常";
    case "warn":
      return "告警";
    case "ok":
      return "正常";
    default:
      return "跳过";
  }
}

function priorityLabel(priority?: LogPriority): string {
  switch (priority) {
    case "high":
      return "高优先级";
    case "medium":
      return "中优先级";
    case "low":
      return "低优先级";
    default:
      return "无需优先处理";
  }
}

function statusBadgeClass(status?: LogHealthStatus): string {
  switch (status) {
    case "fail":
      return "border-red-200 bg-red-50 text-red-800";
    case "warn":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "ok":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

function priorityBadgeClass(priority?: LogPriority): string {
  switch (priority) {
    case "high":
      return "border-red-200 bg-red-50 text-red-800";
    case "medium":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "low":
      return "border-sky-200 bg-sky-50 text-sky-800";
    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

function detailScopeToCategory(scope: LogOverviewScope): string {
  switch (scope) {
    case "pod":
      return "kubernetes";
    case "nginx":
      return "nginx";
    case "platform":
      return "platform";
    default:
      return "all";
  }
}

const DEFAULT_TAB: LogOverviewScope = "project_config";

const AiInspectLogDetails: React.FC = () => {
  const { status } = useAuth();
  const isAdmin = status?.role === "admin";
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get("tab") as LogOverviewScope) || DEFAULT_TAB;
  const [selectedRow, setSelectedRow] = useState<VmLogDetailRow | null>(null);
  const [aiAnalyze, setAiAnalyze] = useState<VmLogAIAnalyzeRes | null>(null);
  const [rowAnalyze, setRowAnalyze] = useState<VmLogAIAnalyzeRowRes | null>(null);

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([key, value]) => {
      if (value == null || value === "") next.delete(key);
      else next.set(key, value);
    });
    setSearchParams(next, { replace: true });
  };

  const k8sNs = searchParams.get("namespace") ?? "";
  const k8sPodName = searchParams.get("pod") ?? "";
  const keyword = searchParams.get("keyword") ?? "";
  const keywordField = searchParams.get("keywordField") ?? "any";
  const windowMin = Math.max(1, Number(searchParams.get("window") || 1440));
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const refreshSec = Math.max(0, Number(searchParams.get("refresh") || 30));
  const useAbsoluteRange = searchParams.get("range") === "absolute";
  const rangeStartLocal = searchParams.get("start") ?? "";
  const rangeEndLocal = searchParams.get("end") ?? "";
  const bucketMin = Math.max(1, Number(searchParams.get("bucket") || 5));

  useEffect(() => {
    if (!useAbsoluteRange || (rangeStartLocal && rangeEndLocal)) return;
    const end = new Date();
    const start = new Date(end.getTime() - 24 * 3600 * 1000);
    const fmt = (d: Date) => {
      const p = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
    };
    setParam({ start: fmt(start), end: fmt(end) });
  }, [rangeEndLocal, rangeStartLocal, searchParams, useAbsoluteRange]);

  const statusQ = useQuery({
    queryKey: ["ops-vmlog-status"],
    queryFn: ({ signal }) => apiGetJson<VmLogStatus>("/api/ops/vmlog/status", { signal }),
  });

  const clusterAdvisoryQ = useQuery({
    queryKey: ["ops-cluster-advisory"],
    queryFn: ({ signal }) =>
      apiGetJson<{ rating?: string; markdown?: string; runError?: string; updatedAt?: string }>(
        "/api/ops/cluster-advisory",
        { signal }
      ),
    refetchInterval: 120_000,
    staleTime: 60_000,
  });

  const maxWindowMin = statusQ.data?.maxWindowMinutes ?? 180 * 24 * 60;
  const windowOptions = useMemo(() => {
    const opts = VM_LOG_WINDOW_OPTIONS_ALL.filter((o) => o.m <= maxWindowMin);
    if (opts.length > 0) return opts;
    const m = Math.max(15, maxWindowMin);
    return [{ m, label: `最近 ${m} 分钟` }];
  }, [maxWindowMin]);

  const nsQ = useQuery({
    queryKey: ["ops-vmlog-namespaces"],
    queryFn: ({ signal }) => apiGetJson<VmLogNamespacesRes>("/api/ops/vmlog/namespaces", { signal }),
    retry: 1,
    enabled: tab === "pod" || tab === "nginx",
  });

  const absoluteRange = useMemo(() => {
    if (!useAbsoluteRange) return null;
    return parseAbsoluteRange(rangeStartLocal, rangeEndLocal);
  }, [rangeEndLocal, rangeStartLocal, useAbsoluteRange]);

  const effectiveWindowMin = useMemo(() => {
    if (absoluteRange) {
      const a = new Date(absoluteRange.startTime).getTime();
      const b = new Date(absoluteRange.endTime).getTime();
      return Math.max(1, Math.ceil((b - a) / 60000));
    }
    return windowMin;
  }, [absoluteRange, windowMin]);

  const detailBody = useMemo(
    () => ({
      scope: tab,
      k8sNamespace: tab === "pod" || tab === "nginx" ? k8sNs.trim() : "",
      k8sPodName: tab === "pod" || tab === "nginx" ? k8sPodName.trim() : "",
      keyword: keyword.trim(),
      keywordField,
      windowMinutes: absoluteRange ? effectiveWindowMin : Math.min(windowMin, maxWindowMin),
      fetchLimit: effectiveWindowMin >= 10080 ? 10000 : 6000,
      page,
      pageSize: 25,
      ...(absoluteRange ? { startTime: absoluteRange.startTime, endTime: absoluteRange.endTime } : {}),
    }),
    [absoluteRange, effectiveWindowMin, k8sNs, k8sPodName, keyword, keywordField, maxWindowMin, page, tab, windowMin]
  );

  const statsBody = useMemo(
    () => ({
      category: detailScopeToCategory(tab),
      k8sNamespace: tab === "pod" || tab === "nginx" ? k8sNs.trim() : "",
      k8sPodName: tab === "pod" || tab === "nginx" ? k8sPodName.trim() : "",
      keyword: keyword.trim(),
      keywordField,
      windowMinutes: absoluteRange ? effectiveWindowMin : Math.min(windowMin, maxWindowMin),
      bucketMinutes: bucketMin,
      fetchLimit: effectiveWindowMin >= 10080 ? 10000 : 6000,
      ...(absoluteRange ? { startTime: absoluteRange.startTime, endTime: absoluteRange.endTime } : {}),
    }),
    [absoluteRange, bucketMin, effectiveWindowMin, k8sNs, k8sPodName, keyword, keywordField, maxWindowMin, tab, windowMin]
  );

  const detailsQ = useQuery({
    queryKey: ["ops-vmlog-details", detailBody],
    queryFn: ({ signal }) => apiPostJson<VmLogDetailsRes>("/api/ops/vmlog/details", detailBody, { signal }),
    enabled: tab !== "project_config" && statusQ.data?.configured === true,
    refetchInterval: refreshSec > 0 && tab !== "project_config" ? refreshSec * 1000 : false,
    refetchOnWindowFocus: true,
  });

  const statsQ = useQuery({
    queryKey: ["ops-vmlog-stats", statsBody],
    queryFn: ({ signal }) => apiPostJson<VmLogStats>("/api/ops/vmlog/stats", statsBody, { signal }),
    enabled: tab !== "project_config" && statusQ.data?.configured === true,
    refetchInterval: refreshSec > 0 && tab !== "project_config" ? refreshSec * 1000 : false,
    refetchOnWindowFocus: true,
  });

  const onManualRefresh = () => {
    void statusQ.refetch();
    if (tab !== "project_config") {
      void detailsQ.refetch();
      void statsQ.refetch();
    }
  };

  const aiAnalyzeMut = useMutation({
    mutationFn: () =>
      apiPostJson<VmLogAIAnalyzeRes>("/api/ops/vmlog/ai-analyze", {
        ...statsBody,
        sampleLimit: 90,
        clearKnownIssues: false,
      }),
    onSuccess: (data) => {
      setAiAnalyze(data);
      if (data.parseError) {
        toast.message("模型返回非 JSON，已展示原始正文");
      } else {
        toast.success(
          data.newIssues?.length
            ? `分析完成：${data.newIssues.length} 条新问题已登记`
            : "分析完成（无新增问题类型或已与已登记去重）"
        );
      }
    },
    onError: (e) => toast.error(e instanceof ApiHttpError ? e.serverMessage : String(e)),
  });

  const clearVmlogDedupeMut = useMutation({
    mutationFn: () =>
      apiPostJson<VmLogAIAnalyzeRes>("/api/ops/vmlog/ai-analyze", {
        ...statsBody,
        clearKnownIssues: true,
      }),
    onSuccess: (data) => {
      toast.success(data.message ?? "已清除");
      setAiAnalyze(null);
    },
    onError: (e) => toast.error(e instanceof ApiHttpError ? e.serverMessage : String(e)),
  });

  const rowAnalyzeMut = useMutation({
    mutationFn: (row: VmLogDetailRow) =>
      apiPostJson<VmLogAIAnalyzeRowRes>("/api/ops/vmlog/ai-analyze-row", {
        scope: tab,
        k8sNamespace: tab === "pod" || tab === "nginx" ? k8sNs.trim() : "",
        k8sPodName: tab === "pod" || tab === "nginx" ? k8sPodName.trim() : "",
        keyword: keyword.trim(),
        keywordField,
        windowMinutes: absoluteRange ? effectiveWindowMin : Math.min(windowMin, maxWindowMin),
        ...(absoluteRange ? { startTime: absoluteRange.startTime, endTime: absoluteRange.endTime } : {}),
        row,
      }),
    onSuccess: (data) => {
      setRowAnalyze(data);
      toast.success("单条日志分析完成");
    },
    onError: (e) => {
      setRowAnalyze(null);
      toast.error(e instanceof ApiHttpError ? e.serverMessage : String(e));
    },
  });

  const chartData = statsQ.data?.buckets ?? [];
  const chartSeries = useMemo(
    () =>
      chartData.map((row) => ({
        ...row,
        tsMs: row.ts * 1000,
      })),
    [chartData]
  );
  const chartSummary = useMemo(() => {
    if (!statsQ.data || chartData.length === 0) return null;
    const counts = chartData.map((x) => Number(x.count) || 0);
    const total = counts.reduce((sum, n) => sum + n, 0);
    const avg = counts.length ? total / counts.length : 0;
    const peak = chartSeries.reduce((best, row) => ((row.count ?? 0) > (best?.count ?? -1) ? row : best), chartSeries[0]);
    const nonZero = counts.filter((n) => n > 0).length;
    const d = statsQ.data;
    return {
      startLabel: d.windowStart ? formatLocalDateTime(d.windowStart) : formatLocalDateTime(chartSeries[0]?.tsMs ?? null),
      endLabel: d.windowEnd ? formatLocalDateTime(d.windowEnd) : formatLocalDateTime(chartSeries[chartSeries.length - 1]?.tsMs ?? null),
      avgCount: avg,
      nonZeroBuckets: nonZero,
      peak,
    };
  }, [chartData, chartSeries, statsQ.data]);

  const namespaces = nsQ.data?.namespaces ?? [];
  const activeTab = VM_LOG_MAIN_TABS.find((item) => item.id === tab) ?? VM_LOG_MAIN_TABS[0];

  useEffect(() => {
    setRowAnalyze(null);
    rowAnalyzeMut.reset();
  }, [selectedRow]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-cyan-200/80 bg-gradient-to-br from-cyan-50/90 via-white to-slate-50/80 px-6 py-7 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-cyan-900/80">AI 巡检 · 日志详情</p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <ScrollText className="h-7 w-7 text-cyan-600" />
          {activeTab.label}
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">{activeTab.short}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" className="border-cyan-200 bg-white/90" asChild>
            <Link to="/cluster/ai-inspect/logs">返回总览</Link>
          </Button>
          <Button type="button" variant="outline" size="sm" className="border-cyan-200 bg-white/90" asChild>
            <Link to="/cluster/settings">Cluster Settings（VictoriaLogs）</Link>
          </Button>
          <Button type="button" variant="outline" size="sm" className="border-cyan-200 bg-white/90" asChild>
            <Link to="/cluster/ai-inspect/log-collection" className="inline-flex items-center gap-1.5">
              <HardDrive className="h-4 w-4" />
              日志采集（Vector 助手）
            </Link>
          </Button>
          <Button type="button" variant="outline" size="sm" className="border-cyan-200 bg-white/90" asChild>
            <a href={statusQ.data?.docsUrl || "https://docs.victoriametrics.com/victorialogs/"} target="_blank" rel="noreferrer">
              <BookOpen className="mr-1.5 h-4 w-4" />
              官方文档
            </a>
          </Button>
          <Button type="button" variant="outline" size="sm" className="border-cyan-200 bg-white/90" asChild>
            <a href={statusQ.data?.helmChartsUrl || "https://github.com/VictoriaMetrics/helm-charts"} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-1.5 h-4 w-4" />
              Helm Charts
            </a>
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setParam({ tab: v, page: "1" })}>
        <TabsList className="flex h-auto min-h-10 w-full flex-wrap justify-start gap-1 bg-slate-100/80 p-1">
          {VM_LOG_MAIN_TABS.map((item) => (
            <TabsTrigger key={item.id} value={item.id} className="text-xs sm:text-sm">
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {tab === "project_config" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">日志系统配置与健康状态</CardTitle>
            <CardDescription>这里只展示当前生效配置与健康提示，不直接修改配置。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {statusQ.isLoading ? (
              <div className="flex items-center gap-2 text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                加载配置状态…
              </div>
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
                    <p className="text-[11px] text-slate-500">VictoriaLogs</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{statusQ.data?.configured ? "已配置" : "未配置"}</p>
                    {statusQ.data?.baseUrlHint ? <p className="mt-1 break-all font-mono text-[11px] text-slate-600">{statusQ.data.baseUrlHint}</p> : null}
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
                    <p className="text-[11px] text-slate-500">目标保留期</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{statusQ.data?.retentionDays ?? "—"} 天</p>
                    {statusQ.data?.retentionHint ? <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{statusQ.data.retentionHint}</p> : null}
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
                    <p className="text-[11px] text-slate-500">Vector 下载源</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {statusQ.data?.vmLogVectorDownloadConfigured ? "已配置" : "未配置"}
                    </p>
                    {statusQ.data?.vmLogVectorDownloadBaseUrlHint ? (
                      <p className="mt-1 break-all font-mono text-[11px] text-slate-600">{statusQ.data.vmLogVectorDownloadBaseUrlHint}</p>
                    ) : null}
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
                    <p className="text-[11px] text-slate-500">GeoLite 国家库</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {statusQ.data?.nginxGeoLiteConfigured ? "已配置" : "未配置"}
                    </p>
                    {statusQ.data?.nginxGeoHint ? <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{statusQ.data.nginxGeoHint}</p> : null}
                  </div>
                </div>
                {statusQ.data?.discovered?.length ? (
                  <div className="rounded-lg border border-slate-200 bg-white/80 p-4">
                    <p className="text-sm font-medium text-slate-900">集群内探测到的 VictoriaLogs Service</p>
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {statusQ.data.discovered.map((item) => (
                        <div key={`${item.namespace}/${item.service}`} className="rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs">
                          <p className="font-mono text-slate-800">{item.namespace}/{item.service}:{item.port}</p>
                          <p className="mt-1 break-all font-mono text-slate-600">{item.suggestedUrl}</p>
                          <p className="mt-1 text-slate-500">{item.hint}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" asChild>
                    <Link to="/cluster/settings">查看 VictoriaLogs 配置</Link>
                  </Button>
                  <Button type="button" variant="outline" size="sm" asChild>
                    <Link to="/cluster/ai-inspect/log-collection">查看日志采集助手</Link>
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">筛选与刷新</CardTitle>
              <CardDescription>
                当前标签：<strong>{activeTab.label}</strong>。支持命名空间、Pod、关键词、时间窗与分页明细；查询条件保存在 URL 中，刷新页面后仍会保留。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {tab === "pod" || tab === "nginx" ? (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Kubernetes 命名空间（可选）</Label>
                    <Select value={k8sNs || "__all__"} onValueChange={(v) => setParam({ namespace: v === "__all__" ? null : v, page: "1" })}>
                      <SelectTrigger className="font-mono text-xs">
                        <SelectValue placeholder="全部（不限制）" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[260px]">
                        <SelectItem value="__all__">全部（不限制）</SelectItem>
                        {namespaces.map((n) => (
                          <SelectItem key={n} value={n}>
                            {n}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {nsQ.isError ? <p className="text-[11px] text-amber-800">{(nsQ.error as Error).message}</p> : null}
                  </div>
                ) : null}
                {tab === "pod" || tab === "nginx" ? (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Pod 名称包含（可选）</Label>
                    <Input
                      className="font-mono text-xs"
                      placeholder="例如 ingress-nginx"
                      value={k8sPodName}
                      onChange={(e) => setParam({ pod: e.target.value || null, page: "1" })}
                    />
                  </div>
                ) : null}
                <div className="space-y-1.5">
                  <Label className="text-xs">包含关键词（可选）</Label>
                  <Input
                    className="font-mono text-xs"
                    placeholder="例如 error / login / timeout"
                    value={keyword}
                    onChange={(e) => setParam({ keyword: e.target.value || null, page: "1" })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">匹配字段</Label>
                  <Select value={keywordField} onValueChange={(v) => setParam({ keywordField: v, page: "1" })}>
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VM_LOG_KEYWORD_FIELD_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 md:col-span-2 lg:col-span-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label className="text-xs">时间范围</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-600">自定义起止</span>
                      <Switch
                        checked={useAbsoluteRange}
                        onCheckedChange={(checked) =>
                          setParam({ range: checked ? "absolute" : null, page: "1" })
                        }
                        aria-label="切换自定义时间范围"
                      />
                    </div>
                  </div>
                  {useAbsoluteRange ? (
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-[11px] text-slate-600">开始（本地）</Label>
                        <Input
                          type="datetime-local"
                          className="font-mono text-xs"
                          value={rangeStartLocal}
                          onChange={(e) => setParam({ start: e.target.value || null, page: "1" })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] text-slate-600">结束（本地）</Label>
                        <Input
                          type="datetime-local"
                          className="font-mono text-xs"
                          value={rangeEndLocal}
                          onChange={(e) => setParam({ end: e.target.value || null, page: "1" })}
                        />
                      </div>
                      {!absoluteRange && rangeStartLocal && rangeEndLocal ? (
                        <p className="text-[11px] text-amber-800 sm:col-span-2">请保证结束时间晚于开始时间。</p>
                      ) : null}
                    </div>
                  ) : (
                    <Select value={String(windowMin)} onValueChange={(v) => setParam({ window: v, page: "1" })}>
                      <SelectTrigger className="mt-1.5 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {windowOptions.map((o) => (
                          <SelectItem key={o.m} value={String(o.m)}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">分桶粒度</Label>
                  <Select value={String(bucketMin)} onValueChange={(v) => setParam({ bucket: v })}>
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VM_LOG_BUCKET_OPTIONS.map((o) => (
                        <SelectItem key={o.m} value={String(o.m)}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">自动刷新</Label>
                  <Select value={String(refreshSec)} onValueChange={(v) => setParam({ refresh: v })}>
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VM_LOG_REFRESH_OPTIONS.map((o) => (
                        <SelectItem key={o.sec} value={String(o.sec)}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" size="sm" disabled={detailsQ.isFetching || statsQ.isFetching} onClick={onManualRefresh}>
                  {detailsQ.isFetching || statsQ.isFetching ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  立即刷新
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">状态摘要</CardTitle>
              <CardDescription>
                {detailsQ.data?.refreshedAt ? `刷新于 ${formatLocalDateTime(detailsQ.data.refreshedAt)}` : "根据当前筛选条件自动评估错误与优先级。"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {detailsQ.isLoading && !detailsQ.data ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  加载摘要…
                </div>
              ) : detailsQ.isError ? (
                <p className="text-sm text-red-600">{(detailsQ.error as Error).message}</p>
              ) : detailsQ.data?.summary ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                  <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 xl:col-span-2">
                    <p className="text-[11px] text-slate-500">状态与优先级</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant="outline" className={statusBadgeClass(detailsQ.data.summary.status)}>
                        {statusLabel(detailsQ.data.summary.status)}
                      </Badge>
                      <Badge variant="outline" className={priorityBadgeClass(detailsQ.data.summary.priority)}>
                        {priorityLabel(detailsQ.data.summary.priority)}
                      </Badge>
                    </div>
                    {detailsQ.data.summary.priorityReason ? (
                      <p className="mt-2 text-xs leading-relaxed text-slate-600">{detailsQ.data.summary.priorityReason}</p>
                    ) : null}
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
                    <p className="text-[11px] text-slate-500">匹配总数</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">{detailsQ.data.summary.totalCount.toLocaleString("zh-CN")}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
                    <p className="text-[11px] text-slate-500">错误数</p>
                    <p className="mt-1 text-lg font-semibold text-red-700">{detailsQ.data.summary.errorCount.toLocaleString("zh-CN")}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
                    <p className="text-[11px] text-slate-500">告警数</p>
                    <p className="mt-1 text-lg font-semibold text-amber-700">{detailsQ.data.summary.warnCount.toLocaleString("zh-CN")}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
                    <p className="text-[11px] text-slate-500">最近时间</p>
                    <p className="mt-1 text-xs font-medium text-slate-800">{formatLocalDateTime(detailsQ.data.summary.lastSeenAt || null)}</p>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-violet-200/70 bg-gradient-to-br from-violet-50/50 via-white to-slate-50/80">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Sparkles className="h-4 w-4 text-violet-600" />
                AI 日志智能分析（GLM）
              </CardTitle>
              <CardDescription className="text-[11px] leading-relaxed">
                使用当前标签与筛选条件，对样本日志做聚合分析并给出处置建议。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={aiAnalyzeMut.isPending || !statusQ.data?.configured}
                  onClick={() => aiAnalyzeMut.mutate()}
                >
                  {aiAnalyzeMut.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 h-4 w-4" />
                  )}
                  分析当前筛选日志
                </Button>
                {isAdmin ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={clearVmlogDedupeMut.isPending}
                    onClick={() => {
                      if (!window.confirm("清除当前筛选条件下已登记的 AI 问题指纹？下次分析将重新视为新问题。")) return;
                      clearVmlogDedupeMut.mutate();
                    }}
                  >
                    清除本条件已登记问题（管理员）
                  </Button>
                ) : null}
              </div>
              {aiAnalyze?.ok ? (
                <div className="space-y-3 rounded-lg border border-slate-200 bg-white/90 p-4 text-sm">
                  <p className="text-[11px] text-slate-500">
                    匹配 {aiAnalyze.matchedLines ?? "—"} 条 · 拉取 {aiAnalyze.totalFetched ?? "—"} 条 · 已登记问题 {aiAnalyze.knownIssueCount ?? 0} 类 ·
                    {aiAnalyze.latencyMs != null ? ` ${aiAnalyze.latencyMs} ms` : ""}
                    {aiAnalyze.truncated ? " · VL 截断" : ""}
                  </p>
                  {aiAnalyze.parseError && aiAnalyze.rawModel ? (
                    <pre className="max-h-64 overflow-auto rounded-md border border-amber-200 bg-amber-50/80 p-3 font-mono text-[11px] text-slate-800">
                      {aiAnalyze.rawModel}
                    </pre>
                  ) : aiAnalyze.summaryMarkdown ? (
                    <OpenClawChatMarkdown source={aiAnalyze.summaryMarkdown} />
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-cyan-200/70 bg-gradient-to-br from-cyan-50/40 via-white to-slate-50/80">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Sparkles className="h-4 w-4 text-cyan-600" />
                AI 建议 · 集群控制平面上下文
              </CardTitle>
              <CardDescription className="text-[11px] leading-relaxed">
                与上方「AI 日志智能分析」并列：此处展示平台周期生成的 kube-system
                控制平面建议（内嵌判读模型），便于对照 VictoriaLogs 明细排查 apiserver/etcd 等频繁重启问题。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" className="h-8" asChild>
                  <Link to="/cluster/ai-inspect/dashboard">Dashboard 总建议</Link>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-8"
                  onClick={() => void clusterAdvisoryQ.refetch()}
                >
                  刷新本段
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px] text-slate-600">
                {clusterAdvisoryQ.data?.updatedAt ? <span className="font-mono">更新 {clusterAdvisoryQ.data.updatedAt}</span> : null}
                {clusterAdvisoryQ.data?.rating ? (
                  <span className="rounded border border-slate-200 bg-white px-2 py-0.5 font-semibold uppercase">
                    {clusterAdvisoryQ.data.rating}
                  </span>
                ) : null}
              </div>
              {clusterAdvisoryQ.data?.runError ? (
                <p className="text-xs text-amber-800">{clusterAdvisoryQ.data.runError}</p>
              ) : null}
              {clusterAdvisoryQ.data?.markdown ? (
                <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-[12px] leading-relaxed">
                  <OpenClawChatMarkdown source={clusterAdvisoryQ.data.markdown} />
                </div>
              ) : (
                <p className="text-xs text-slate-500">暂无周期分析；请确认「AI 判读模型」已启用且后台任务开启。</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">日志量趋势</CardTitle>
              <CardDescription>
                {statsQ.data
                  ? `刷新于 ${formatLocalDateTime(statsQ.data.refreshedAt)} · 拉取 ${statsQ.data.totalFetched} 条 · 匹配 ${statsQ.data.totalMatched} 条`
                  : "加载中…"}
              </CardDescription>
            </CardHeader>
            {chartSummary ? (
              <CardContent className="grid gap-2 pb-0 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2">
                  <p className="text-[11px] text-slate-500">覆盖区间</p>
                  <p className="mt-1 text-xs font-medium text-slate-800">
                    {chartSummary.startLabel} ~ {chartSummary.endLabel}
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2">
                  <p className="text-[11px] text-slate-500">分桶与活跃度</p>
                  <p className="mt-1 text-xs font-medium text-slate-800">
                    每桶 {statsQ.data?.bucketMinutes} 分钟 · 非零 {chartSummary.nonZeroBuckets}/{chartData.length}
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2">
                  <p className="text-[11px] text-slate-500">峰值</p>
                  <p className="mt-1 text-xs font-medium text-slate-800">
                    {chartSummary.peak?.count ?? 0} 条
                    {chartSummary.peak ? ` · ${formatAxisTime(chartSummary.peak.tsMs, statsQ.data?.windowMinutes ?? 0)}` : ""}
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2">
                  <p className="text-[11px] text-slate-500">均值</p>
                  <p className="mt-1 text-xs font-medium text-slate-800">{chartSummary.avgCount.toFixed(1)} 条/桶</p>
                </div>
              </CardContent>
            ) : null}
            <CardContent className="h-[340px] w-full pt-4">
              {statsQ.isError ? (
                <p className="text-sm text-red-600">{(statsQ.error as Error).message}</p>
              ) : statsQ.isLoading && !statsQ.data ? (
                <div className="flex h-full items-center justify-center text-slate-500">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : chartData.length === 0 ? (
                <p className="text-sm text-slate-500">暂无分桶数据。</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartSeries} margin={{ top: 8, right: 12, left: 0, bottom: 28 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200" />
                    <XAxis
                      dataKey="tsMs"
                      type="number"
                      domain={["dataMin", "dataMax"]}
                      scale="time"
                      minTickGap={28}
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => formatAxisTime(Number(v), statsQ.data?.windowMinutes ?? 0)}
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={36} />
                    <Tooltip
                      contentStyle={{ fontSize: 12 }}
                      formatter={(v: number) => [v, "条"]}
                      labelFormatter={(_, payload) => {
                        const row = payload?.[0]?.payload as { ts?: number } | undefined;
                        return row?.ts ? formatBucketRange(row.ts, statsQ.data?.bucketMinutes ?? 1) : "—";
                      }}
                    />
                    {chartSummary?.peak?.tsMs ? (
                      <ReferenceLine
                        x={chartSummary.peak.tsMs}
                        stroke="#f59e0b"
                        strokeDasharray="4 4"
                        ifOverflow="extendDomain"
                        label={{ value: "峰值", position: "insideTopRight", fontSize: 10, fill: "#b45309" }}
                      />
                    ) : null}
                    <Line
                      type="monotone"
                      dataKey="count"
                      name="条数"
                      stroke="#0891b2"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 0, fill: "#0f766e" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {statsQ.data?.nginxAgg &&
          ((statsQ.data.nginxAgg.parsedLines ?? 0) > 0 || tab === "nginx" || (statsQ.data.nginxAgg.scannedLines ?? 0) > 0) ? (
            <Card className="border-amber-200/60 bg-gradient-to-br from-amber-50/40 via-white to-slate-50/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Nginx 访问大盘（类 ELK 聚合）</CardTitle>
                <CardDescription className="text-[11px] leading-relaxed">
                  地区：<strong>{nginxGeoSourceLabel(statsQ.data.nginxAgg.geoSource)}</strong>。
                  {statsQ.data.nginxAgg.scannedLines != null ? (
                    <>
                      {" "}
                      已扫描 {statsQ.data.nginxAgg.scannedLines} 行，解析为 HTTP 请求 {statsQ.data.nginxAgg.parsedLines ?? 0} 条。
                    </>
                  ) : null}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {statsQ.data.nginxAgg.totals ? (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                    {(
                      [
                        ["扫描行数", statsQ.data.nginxAgg.totals.scannedLines],
                        ["解析请求数", statsQ.data.nginxAgg.totals.parsedRequests],
                        ["独立客户端 IP", statsQ.data.nginxAgg.totals.uniqueClientIPs],
                        ["独立 URI", statsQ.data.nginxAgg.totals.uniquePaths],
                        ["独立请求域名", statsQ.data.nginxAgg.totals.uniqueHosts],
                        ["地区桶数", statsQ.data.nginxAgg.totals.uniqueRegions],
                      ] as const
                    ).map(([label, v]) => (
                      <div key={label} className="rounded-lg border border-slate-200 bg-white/90 px-3 py-2 shadow-sm">
                        <p className="text-[10px] text-slate-500">{label}</p>
                        <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">{Number(v ?? 0).toLocaleString("zh-CN")}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
                {(statsQ.data.nginxAgg.parsedLines ?? 0) > 0 ? (
                  <div className="grid gap-6 xl:grid-cols-2">
                    <NginxHBarChart title="地区 / 网络分区 Top" rows={statsQ.data.nginxAgg.topRegions} fill="#ea580c" yAxisWidth={168} labelMax={22} />
                    <NginxHBarChart title="请求域名 / Host Top" rows={statsQ.data.nginxAgg.topHosts} fill="#7c3aed" yAxisWidth={148} labelMax={28} />
                    <NginxHBarChart title="HTTP 状态码" rows={statsQ.data.nginxAgg.statusCodes} fill="#64748b" yAxisWidth={56} labelMax={8} />
                    <NginxHBarChart title="HTTP 方法" rows={statsQ.data.nginxAgg.methods} fill="#0ea5e9" yAxisWidth={72} labelMax={12} />
                    <NginxHBarChart title="Top 客户端 IP" rows={statsQ.data.nginxAgg.topClientIPs} fill="#6366f1" yAxisWidth={120} labelMax={18} />
                    <NginxHBarChart title="Top URI 路径" rows={statsQ.data.nginxAgg.topPaths} fill="#0d9488" yAxisWidth={156} labelMax={28} />
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">分页日志明细</CardTitle>
              <CardDescription className="text-[11px] leading-relaxed">
                当前页 {detailsQ.data?.page ?? page}，每页 {detailsQ.data?.pageSize ?? 25} 条。点击任一行可查看完整消息与详细字段。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {detailsQ.isError ? (
                <p className="text-sm text-red-600">{(detailsQ.error as Error).message}</p>
              ) : detailsQ.isLoading && !detailsQ.data ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  加载日志明细…
                </div>
              ) : !detailsQ.data?.rows.length ? (
                <p className="text-sm text-slate-500">无匹配条目。</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>时间</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>优先级</TableHead>
                      <TableHead>命名空间</TableHead>
                      <TableHead>Pod</TableHead>
                      <TableHead>来源</TableHead>
                      <TableHead>消息摘要</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailsQ.data.rows.map((row, idx) => (
                      <TableRow key={`${row.time ?? "no-time"}-${idx}`} className="cursor-pointer" onClick={() => setSelectedRow(row)}>
                        <TableCell className="font-mono text-[11px] text-slate-600">{formatLocalDateTime(row.time || null)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusBadgeClass(row.status)}>
                            {statusLabel(row.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={priorityBadgeClass(row.priority)}>
                            {priorityLabel(row.priority)}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-[11px]">{row.namespace || "—"}</TableCell>
                        <TableCell className="max-w-[180px] break-all font-mono text-[11px]">{row.pod || "—"}</TableCell>
                        <TableCell className="max-w-[220px] break-all font-mono text-[11px]">{row.source || "—"}</TableCell>
                        <TableCell className="max-w-[520px] whitespace-normal text-xs text-slate-700">
                          <div className="line-clamp-2 whitespace-pre-wrap break-words">{row.msg || "—"}</div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-500">
                  共 {detailsQ.data?.totalMatched?.toLocaleString("zh-CN") ?? 0} 条 · 当前页 {detailsQ.data?.page ?? page}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setParam({ page: String(Math.max(1, page - 1)) })}
                  >
                    上一页
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!detailsQ.data?.hasMore}
                    onClick={() => setParam({ page: String(page + 1) })}
                  >
                    下一页
                  </Button>
                </div>
              </div>
              {detailsQ.data?.scanWarning || detailsQ.data?.truncated ? (
                <p className="text-xs text-amber-800">
                  {detailsQ.data.scanWarning ? `解析警告：${detailsQ.data.scanWarning}` : null}
                  {detailsQ.data.scanWarning && detailsQ.data.truncated ? " · " : null}
                  {detailsQ.data.truncated ? "当前结果受查询上限约束。" : null}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </>
      )}

      <Dialog
        open={!!selectedRow}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedRow(null);
            setRowAnalyze(null);
            rowAnalyzeMut.reset();
          }
        }}
      >
        <DialogContent className="flex max-h-[min(88vh,760px)] w-full max-w-[calc(100%-2rem)] flex-col overflow-hidden p-0 sm:max-w-5xl">
          <DialogHeader className="border-b border-slate-200 px-6 py-4 text-left">
            <DialogTitle className="text-base font-semibold text-slate-900">日志详情</DialogTitle>
            <DialogDescription className="text-xs text-slate-600">
              {selectedRow?.time ? formatLocalDateTime(selectedRow.time) : "—"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 overflow-y-auto px-6 py-4 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-xs">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className={statusBadgeClass(selectedRow?.status)}>
                    {statusLabel(selectedRow?.status)}
                  </Badge>
                  <Badge variant="outline" className={priorityBadgeClass(selectedRow?.priority)}>
                    {priorityLabel(selectedRow?.priority)}
                  </Badge>
                </div>
                {selectedRow?.priorityReason ? <p className="mt-2 leading-relaxed text-slate-600">{selectedRow.priorityReason}</p> : null}
              </div>
              <div className="rounded-lg border border-slate-200 bg-white/90 p-3 text-xs text-slate-700">
                <div className="space-y-2">
                  <div>
                    <p className="text-[11px] text-slate-500">命名空间</p>
                    <p className="mt-1 break-all font-mono">{selectedRow?.namespace || "—"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500">Pod</p>
                    <p className="mt-1 break-all font-mono">{selectedRow?.pod || "—"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500">来源</p>
                    <p className="mt-1 break-all font-mono">{selectedRow?.source || "—"}</p>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white/90 p-3">
                <p className="text-xs font-medium text-slate-800">详细字段</p>
                <div className="mt-3 max-h-[360px] space-y-2 overflow-y-auto">
                  {selectedRow?.fields?.length ? (
                    selectedRow.fields.map((field, idx) => (
                      <div key={`${field.key}-${idx}`} className="rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs">
                        <div className="font-mono text-[11px] font-semibold text-slate-700">{field.key}</div>
                        <div className="mt-1 break-all font-mono text-[11px] leading-snug text-slate-600">{field.value}</div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500">无详细字段。</p>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-4 min-w-0">
              <div className="rounded-lg border border-violet-200/70 bg-gradient-to-br from-violet-50/60 via-white to-slate-50/90 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">OpenClaw AI 分析</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-600">解释这条日志大概是什么问题，并给出排查思路。</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!selectedRow || rowAnalyzeMut.isPending}
                    onClick={() => selectedRow && rowAnalyzeMut.mutate(selectedRow)}
                  >
                    {rowAnalyzeMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                    AI 分析这条日志
                  </Button>
                </div>
                {rowAnalyzeMut.isPending ? (
                  <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    正在分析当前日志…
                  </div>
                ) : rowAnalyze?.summaryMarkdown ? (
                  <div className="mt-4 space-y-3">
                    {rowAnalyze.latencyMs != null ? <p className="text-[11px] text-slate-500">模型耗时 {rowAnalyze.latencyMs} ms</p> : null}
                    <OpenClawChatMarkdown source={rowAnalyze.summaryMarkdown} />
                  </div>
                ) : (
                  <p className="mt-4 text-xs leading-relaxed text-slate-500">点击右上角按钮后，这里会显示针对当前单条日志的错误解释和排查建议。</p>
                )}
              </div>
              <div className="min-w-0 rounded-lg border border-slate-200 bg-[#0b1020] p-4">
                <p className="mb-3 text-xs font-medium text-slate-300">完整消息</p>
                <pre className="max-h-[620px] overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-slate-100">
                  {selectedRow?.msg || "—"}
                </pre>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AiInspectLogDetails;

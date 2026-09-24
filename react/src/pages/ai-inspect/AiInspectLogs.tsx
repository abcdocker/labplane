import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  AppWindow,
  Boxes,
  ChevronLeft,
  ChevronRight,
  Database,
  Globe2,
  Layers3,
  Loader2,
  RefreshCw,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { apiGetJson, apiPostJson, ApiHttpError } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OpenClawChatMarkdown } from "@/components/OpenClawChatMarkdown";
import { cn } from "@/lib/utils";
import {
  formatLocalDateTime,
  type LogHealthStatus,
  type VmLogDetailRow,
  type VmLogFieldPair,
  type VmLogAIAnalyzeRes,
  type VmLogAIAnalyzeRowRes,
  type VmLogStatus,
  VM_LOG_WINDOW_OPTIONS_ALL,
} from "./aiInspectLogs.model";
import { logText as t } from "./logCenter.i18n";

type SourceOption = { id: string; label: string; description?: string };
type SearchFieldOption = { id: string; label: string; group: string; datasets?: string[] };
type FieldStat = {
  id: string;
  label: string;
  group: string;
  count: number;
  topValues?: { value: string; count: number }[];
};
type SourcesResponse = { querySources: SourceOption[]; searchFields: SearchFieldOption[] };
type SearchLevel = "all" | "error" | "warn" | "ok";
type SearchFilters = {
  source: string;
  keyword: string;
  keywordField: string;
  customField: string;
  level: SearchLevel;
  namespace: string;
  pod: string;
  host: string;
  windowMinutes: number;
  page: number;
};
type SearchRow = VmLogDetailRow & { host?: string; logSource?: string };
type SearchResponse = {
  source: string;
  totalFetched: number;
  totalMatched: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  truncated?: boolean;
  scanWarning?: string;
  refreshedAt: string;
  levelCounts: { error: number; warn: number; ok: number };
  fieldStats?: FieldStat[];
  rows: SearchRow[];
};

const DATASET_ICONS: Record<string, React.ReactNode> = {
  all: <Layers3 className="h-4 w-4" />,
  container: <Boxes className="h-4 w-4" />,
  virtual_machine: <Server className="h-4 w-4" />,
  nginx: <Globe2 className="h-4 w-4" />,
  application: <AppWindow className="h-4 w-4" />,
  aiinspect: <ShieldCheck className="h-4 w-4" />,
  platform: <Database className="h-4 w-4" />,
};

function datasetToCategory(dataset: string): string {
  switch (dataset) {
    case "container":
      return "kubernetes";
    case "virtual_machine":
      return "vcenter";
    case "application":
      return "appcenter";
    default:
      return dataset || "all";
  }
}

const DEFAULT_FILTERS: SearchFilters = {
  source: "all",
  keyword: "",
  keywordField: "any",
  customField: "",
  level: "all",
  namespace: "",
  pod: "",
  host: "",
  windowMinutes: 60,
  page: 1,
};

function levelMeta(status: LogHealthStatus) {
  switch (status) {
    case "fail":
      return { label: "ERROR", className: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300" };
    case "warn":
      return { label: "WARN", className: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300" };
    default:
      return { label: "INFO", className: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300" };
  }
}

function ResultMetric({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100", tone)}>
        {value.toLocaleString("zh-CN")}
      </p>
    </div>
  );
}

function LogRow({ row, onOpen }: { row: SearchRow; onOpen: (row: SearchRow) => void }) {
  const meta = levelMeta(row.status);
  const source = row.logSource || row.source || row.pod || row.host || "unknown";
  return (
    <button
      type="button"
      className="grid w-full min-w-0 gap-2 border-b border-slate-100 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-cyan-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-500 dark:border-slate-800 dark:hover:bg-cyan-950/20 md:grid-cols-[150px_110px_minmax(0,1fr)_20px] md:items-start"
      onClick={() => onOpen(row)}
    >
      <time className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
        {formatLocalDateTime(row.time)}
      </time>
      <div className="flex min-w-0 items-center gap-2">
        <Badge variant="outline" className={cn("h-5 px-1.5 font-mono text-[10px]", meta.className)}>
          {meta.label}
        </Badge>
        <span className="truncate text-xs font-medium text-slate-700 dark:text-slate-300" title={source}>
          {source}
        </span>
      </div>
      <pre className="line-clamp-3 min-w-0 whitespace-pre-wrap break-words font-mono text-xs leading-5 text-slate-800 dark:text-slate-200">
        {row.msg || "—"}
      </pre>
      <ChevronRight className="hidden h-4 w-4 text-slate-400 md:block" />
    </button>
  );
}

const AiInspectLogs: React.FC = () => {
  const [draft, setDraft] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [query, setQuery] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<SearchRow | null>(null);

  const statusQ = useQuery({
    queryKey: ["ops-vmlog-status"],
    queryFn: ({ signal }) => apiGetJson<VmLogStatus>("/api/ops/vmlog/status", { signal }),
  });
  const sourcesQ = useQuery({
    queryKey: ["ops-vmlog-sources"],
    queryFn: ({ signal }) => apiGetJson<SourcesResponse>("/api/ops/vmlog/sources", { signal }),
  });
  const maxWindowMin = statusQ.data?.maxWindowMinutes ?? 180 * 24 * 60;
  const windowOptions = useMemo(
    () => VM_LOG_WINDOW_OPTIONS_ALL.filter((option) => option.m <= maxWindowMin),
    [maxWindowMin],
  );
  const requestBody = useMemo(
    () => ({
      source: query.source,
      keyword: query.keyword.trim(),
      keywordField: query.keywordField === "__custom__" ? query.customField.trim() : query.keywordField,
      level: query.level,
      host: query.host.trim(),
      k8sNamespace: query.namespace.trim(),
      k8sPodName: query.pod.trim(),
      windowMinutes: Math.min(query.windowMinutes, maxWindowMin),
      fetchLimit: query.windowMinutes >= 10080 ? 10000 : 6000,
      page: query.page,
      pageSize: 50,
    }),
    [maxWindowMin, query],
  );
  const searchQ = useQuery({
    queryKey: ["ops-vmlog-search", requestBody],
    queryFn: ({ signal }) => apiPostJson<SearchResponse>("/api/ops/vmlog/search", requestBody, { signal }),
    enabled: statusQ.data?.configured === true,
    refetchOnWindowFocus: false,
  });
  const aiAnalyzeMut = useMutation({
    mutationFn: () =>
      apiPostJson<VmLogAIAnalyzeRes>("/api/ops/vmlog/ai-analyze", {
        category: datasetToCategory(query.source),
        k8sNamespace: query.namespace.trim(),
        k8sPodName: query.pod.trim(),
        keyword: query.keyword.trim(),
        keywordField: query.keywordField === "__custom__" ? query.customField.trim() : query.keywordField,
        host: query.host.trim(),
        level: query.level,
        windowMinutes: Math.min(query.windowMinutes, maxWindowMin),
        fetchLimit: query.windowMinutes >= 10080 ? 10000 : 6000,
        sampleLimit: 90,
      }),
  });
  const rowAnalyzeMut = useMutation({
    mutationFn: (row: SearchRow) =>
      apiPostJson<VmLogAIAnalyzeRowRes>("/api/ops/vmlog/ai-analyze-row", {
        scope: datasetToCategory(query.source),
        k8sNamespace: query.namespace.trim(),
        k8sPodName: query.pod.trim(),
        keyword: query.keyword.trim(),
        keywordField: query.keywordField === "__custom__" ? query.customField.trim() : query.keywordField,
        windowMinutes: Math.min(query.windowMinutes, maxWindowMin),
        row,
      }),
  });

  const submit = (filters = draft) => {
    aiAnalyzeMut.reset();
    const next = { ...filters, page: 1 };
    setDraft(next);
    setQuery(next);
  };
  const changePage = (page: number) => {
    const next = { ...draft, page };
    setDraft(next);
    setQuery(next);
  };
  const data = searchQ.data;
  const sources = sourcesQ.data?.querySources ?? [{ id: "all", label: "全部日志" }];
  const activeSource = sources.find((source) => source.id === draft.source) ?? sources[0];
  const fieldStatsByID = useMemo(
    () => new Map((data?.fieldStats ?? []).map((field) => [field.id, field])),
    [data?.fieldStats],
  );
  const availableFields = useMemo(() => {
    const fields = sourcesQ.data?.searchFields ?? [];
    return fields.filter(
      (field) =>
        field.id === "any" ||
        !field.datasets?.length ||
        draft.source === "all" ||
        field.datasets.includes(draft.source),
    );
  }, [draft.source, sourcesQ.data?.searchFields]);
  const selectedFieldStat = fieldStatsByID.get(draft.keywordField);
  const deepScope = query.source === "nginx" ? "nginx" : query.source === "platform" ? "platform" : "pod";
  const applyFieldValue = (field: string, value: string) => {
    submit({ ...draft, keywordField: field, keyword: value });
  };
  const openLogRow = (row: SearchRow) => {
    rowAnalyzeMut.reset();
    setSelectedRow(row);
  };
  const chooseDataset = (source: string) => {
    const selectedField = (sourcesQ.data?.searchFields ?? []).find((field) => field.id === draft.keywordField);
    const fieldFits = !selectedField?.datasets?.length || selectedField.datasets.includes(source) || source === "all";
    submit({
      ...draft,
      source,
      namespace: "",
      pod: "",
      keywordField: fieldFits ? draft.keywordField : "any",
      keyword: fieldFits ? draft.keyword : "",
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-400">{t("eyebrow")}</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950 dark:text-slate-50">{t("title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link to="/cluster/ai-inspect/log-collection">
              <Database className="mr-1.5 h-4 w-4" />
              {t("collect")}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/cluster/settings">
              <Settings2 className="mr-1.5 h-4 w-4" />
              {t("settings")}
            </Link>
          </Button>
        </div>
      </div>

      {statusQ.data && !statusQ.data.configured ? (
        <Card className="border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/30">
          <CardContent className="flex gap-3 py-5">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-medium text-amber-950 dark:text-amber-200">{t("notConfigured")}</p>
              <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">{t("configureHint")}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-7">
        {sources.map((source) => (
          <button
            key={source.id}
            type="button"
            className={cn(
              "rounded-xl border px-3 py-3 text-left transition-colors",
              draft.source === source.id
                ? "border-cyan-500 bg-cyan-50 text-cyan-950 shadow-sm dark:border-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-100"
                : "border-slate-200 bg-white text-slate-700 hover:border-cyan-300 hover:bg-cyan-50/40 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300",
            )}
            onClick={() => chooseDataset(source.id)}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              {DATASET_ICONS[source.id] ?? <Database className="h-4 w-4" />}
              {source.label}
            </span>
            {source.description ? <span className="mt-1 block text-[10px] leading-4 opacity-70">{source.description}</span> : null}
          </button>
        ))}
      </div>

      <Card className="border-slate-200 dark:border-slate-800">
        <CardContent className="space-y-4 p-4">
          <form
            className={cn(
              "grid gap-3",
              draft.keywordField === "__custom__"
                ? "lg:grid-cols-[180px_190px_minmax(220px,1fr)_160px_auto]"
                : "lg:grid-cols-[190px_minmax(240px,1fr)_160px_auto]",
            )}
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <Select
              value={draft.keywordField}
              onValueChange={(keywordField) => setDraft((current) => ({ ...current, keywordField }))}
            >
              <SelectTrigger><SelectValue placeholder={t("field")} /></SelectTrigger>
              <SelectContent>
                {availableFields.map((field) => (
                  <SelectItem key={field.id} value={field.id}>{field.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {draft.keywordField === "__custom__" ? (
              <Input
                className="font-mono"
                placeholder="输入 VictoriaLogs 字段名，例如 trace_id、http.status_code"
                value={draft.customField}
                onChange={(event) => setDraft((current) => ({ ...current, customField: event.target.value }))}
              />
            ) : null}
            <div className="relative min-w-0">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                className="pl-9 font-mono"
                placeholder={t("keywordPlaceholder")}
                value={draft.keyword}
                onChange={(event) => setDraft((current) => ({ ...current, keyword: event.target.value }))}
              />
            </div>
            <Select
              value={String(draft.windowMinutes)}
              onValueChange={(value) => setDraft((current) => ({ ...current, windowMinutes: Number(value) }))}
            >
              <SelectTrigger><SelectValue placeholder={t("window")} /></SelectTrigger>
              <SelectContent>
                {windowOptions.map((option) => <SelectItem key={option.m} value={String(option.m)}>{option.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button type="submit" disabled={!statusQ.data?.configured || searchQ.isFetching}>
              {searchQ.isFetching ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Search className="mr-1.5 h-4 w-4" />}
              {t("search")}
            </Button>
          </form>

          <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setAdvancedOpen((open) => !open)}>
            <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
            {advancedOpen ? t("hideAdvanced") : t("advanced")}
          </Button>
          {advancedOpen ? (
            <div className="grid gap-3 border-t border-slate-100 pt-4 dark:border-slate-800 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("level")}</Label>
                <Select value={draft.level} onValueChange={(level) => setDraft((current) => ({ ...current, level: level as SearchLevel }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("all")}</SelectItem>
                    <SelectItem value="error">ERROR</SelectItem>
                    <SelectItem value="warn">WARN</SelectItem>
                    <SelectItem value="ok">INFO</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {draft.source === "all" || draft.source === "container" || draft.source === "nginx" ? (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("namespace")}</Label>
                    <Input value={draft.namespace} onChange={(event) => setDraft((current) => ({ ...current, namespace: event.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("pod")}</Label>
                    <Input value={draft.pod} onChange={(event) => setDraft((current) => ({ ...current, pod: event.target.value }))} />
                  </div>
                </>
              ) : null}
              <div className="space-y-1.5">
                <Label className="text-xs">{t("host")}</Label>
                <Input value={draft.host} onChange={(event) => setDraft((current) => ({ ...current, host: event.target.value }))} />
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
        <Card className="border-slate-200 dark:border-slate-800 lg:sticky lg:top-4">
          <CardContent className="p-3">
            <div className="border-b border-slate-100 px-2 pb-3 dark:border-slate-800">
              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">可用字段</p>
              <p className="mt-1 text-[10px] leading-4 text-slate-500">
                {activeSource?.label} · 点击字段后在顶部输入查询值
              </p>
            </div>
            <div className="mt-2 max-h-[390px] space-y-0.5 overflow-y-auto">
              {availableFields.map((field) => {
                const stat = fieldStatsByID.get(field.id);
                return (
                  <button
                    key={field.id}
                    type="button"
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs",
                      draft.keywordField === field.id
                        ? "bg-cyan-50 font-medium text-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-300"
                        : "text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-900",
                    )}
                    onClick={() => setDraft((current) => ({ ...current, keywordField: field.id }))}
                  >
                    <span className="truncate font-mono">{field.label}</span>
                    {field.id !== "any" ? (
                      <span className="tabular-nums text-[10px] text-slate-400">{stat?.count ?? 0}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            {selectedFieldStat?.topValues?.length ? (
              <div className="mt-3 border-t border-slate-100 px-2 pt-3 dark:border-slate-800">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">常见值</p>
                <div className="space-y-1">
                  {selectedFieldStat.topValues.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      className="flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-left text-[10px] text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-900"
                      title={item.value}
                      onClick={() => applyFieldValue(selectedFieldStat.id, item.value)}
                    >
                      <span className="truncate font-mono">{item.value}</span>
                      <span className="tabular-nums text-slate-400">{item.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-4">
          {data ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <ResultMetric label={t("total")} value={data.totalMatched} />
              <ResultMetric label={t("errors")} value={data.levelCounts.error} tone="text-red-700 dark:text-red-400" />
              <ResultMetric label={t("warnings")} value={data.levelCounts.warn} tone="text-amber-700 dark:text-amber-400" />
              <ResultMetric label={t("normal")} value={data.levelCounts.ok} tone="text-emerald-700 dark:text-emerald-400" />
            </div>
          ) : null}

          {aiAnalyzeMut.data || aiAnalyzeMut.isError ? (
            <Card className="border-violet-200 bg-violet-50/30 dark:border-violet-900 dark:bg-violet-950/20">
              <CardContent className="p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-violet-950 dark:text-violet-200">
                  <Sparkles className="h-4 w-4 text-violet-600" />
                  当前查询的 AI 分析
                </div>
                {aiAnalyzeMut.isError ? (
                  <p className="text-sm text-red-700 dark:text-red-400">
                    {aiAnalyzeMut.error instanceof ApiHttpError ? aiAnalyzeMut.error.serverMessage : String(aiAnalyzeMut.error)}
                  </p>
                ) : aiAnalyzeMut.data?.summaryMarkdown ? (
                  <div className="text-sm leading-relaxed">
                    <OpenClawChatMarkdown source={aiAnalyzeMut.data.summaryMarkdown} />
                  </div>
                ) : aiAnalyzeMut.data?.rawModel ? (
                  <pre className="whitespace-pre-wrap text-xs text-slate-700 dark:text-slate-300">{aiAnalyzeMut.data.rawModel}</pre>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <Card className="overflow-hidden border-slate-200 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{t("resultHint")}</p>
                {data?.refreshedAt ? <p className="mt-0.5 text-[11px] text-slate-500">更新于 {formatLocalDateTime(data.refreshedAt)}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="bg-violet-600 hover:bg-violet-700"
                  disabled={!data?.rows.length || aiAnalyzeMut.isPending}
                  onClick={() => aiAnalyzeMut.mutate()}
                >
                  {aiAnalyzeMut.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                  AI 分析当前结果
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => void searchQ.refetch()} disabled={searchQ.isFetching}>
                  <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", searchQ.isFetching && "animate-spin")} />
                  {t("refresh")}
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link to={`/cluster/ai-inspect/logs/detail?tab=${deepScope}&window=${query.windowMinutes}`}>
                    {t("advancedAnalysis")}
                  </Link>
                </Button>
              </div>
            </div>

            {searchQ.isLoading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("loading")}
              </div>
            ) : searchQ.isError ? (
              <div className="px-4 py-10 text-center">
                <p className="font-medium text-red-700 dark:text-red-400">{t("queryFailed")}</p>
                <p className="mt-1 text-sm text-slate-500">{(searchQ.error as Error).message}</p>
              </div>
            ) : !data?.rows.length ? (
              <div className="px-4 py-16 text-center">
                <p className="font-medium text-slate-800 dark:text-slate-200">{t("empty")}</p>
                <p className="mt-1 text-sm text-slate-500">{t("emptyHint")}</p>
              </div>
            ) : (
              <div>
                {data.rows.map((row, index) => (
                  <LogRow key={`${row.time ?? "no-time"}-${index}`} row={row} onOpen={openLogRow} />
                ))}
              </div>
            )}

            {data?.rows.length ? (
              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 dark:border-slate-800">
                <p className="text-xs text-slate-500">{t("page")} {data.page}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={data.page <= 1} onClick={() => changePage(data.page - 1)}>
                    <ChevronLeft className="mr-1 h-4 w-4" />{t("previous")}
                  </Button>
                  <Button size="sm" variant="outline" disabled={!data.hasMore} onClick={() => changePage(data.page + 1)}>
                    {t("next")}<ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : null}
          </Card>
        </div>
      </div>

      <Dialog
        open={selectedRow != null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedRow(null);
            rowAnalyzeMut.reset();
          }
        }}
      >
        <DialogContent className="flex max-h-[min(90vh,820px)] w-full max-w-[calc(100%-2rem)] flex-col overflow-hidden p-0 sm:max-w-5xl">
          <DialogHeader className="border-b border-slate-200 px-6 py-4 text-left dark:border-slate-800">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
              单条日志详情
              {selectedRow ? (
                <Badge variant="outline" className={cn("font-mono text-[10px]", levelMeta(selectedRow.status).className)}>
                  {levelMeta(selectedRow.status).label}
                </Badge>
              ) : null}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              {selectedRow?.time ? formatLocalDateTime(selectedRow.time) : "—"}
            </DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-6 py-4 lg:grid-cols-[330px_minmax(0,1fr)]">
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-xs dark:border-slate-800 dark:bg-slate-900/70">
                <div className="grid gap-3">
                  {[
                    ["日志来源", selectedRow?.logSource || selectedRow?.source],
                    ["主机", selectedRow?.host],
                    ["命名空间", selectedRow?.namespace],
                    ["Pod", selectedRow?.pod],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">{label}</p>
                      <p className="mt-1 break-all font-mono text-[11px] text-slate-800 dark:text-slate-200">{value || "—"}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                <p className="text-xs font-medium text-slate-800 dark:text-slate-200">{t("details")}</p>
                <div className="mt-3 max-h-[430px] space-y-2 overflow-y-auto pr-1">
                  {selectedRow?.fields?.length ? (
                    selectedRow.fields.map((field: VmLogFieldPair, index) => (
                      <div key={`${field.key}-${index}`} className="rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/70">
                        <p className="font-mono text-[10px] font-semibold text-cyan-700 dark:text-cyan-400">{field.key}</p>
                        <p className="mt-1 break-all whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-slate-700 dark:text-slate-300">
                          {field.value}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500">这条日志没有额外结构化字段。</p>
                  )}
                </div>
              </div>
            </div>

            <div className="min-w-0 space-y-4">
              <div className="rounded-lg border border-violet-200 bg-gradient-to-br from-violet-50/70 via-white to-slate-50 p-4 dark:border-violet-900 dark:from-violet-950/30 dark:via-slate-950 dark:to-slate-950">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                      <Sparkles className="h-4 w-4 text-violet-600" />
                      单条日志 AI 分析
                    </p>
                    <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">
                      仅分析当前消息和字段，并结合当前查询上下文给出排查建议。
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!selectedRow || rowAnalyzeMut.isPending}
                    onClick={() => selectedRow && rowAnalyzeMut.mutate(selectedRow)}
                  >
                    {rowAnalyzeMut.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
                    AI 分析这条日志
                  </Button>
                </div>

                {rowAnalyzeMut.isPending ? (
                  <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    正在分析当前日志…
                  </div>
                ) : rowAnalyzeMut.isError ? (
                  <p className="mt-4 text-sm text-red-700 dark:text-red-400">
                    {rowAnalyzeMut.error instanceof ApiHttpError ? rowAnalyzeMut.error.serverMessage : String(rowAnalyzeMut.error)}
                  </p>
                ) : rowAnalyzeMut.data?.summaryMarkdown ? (
                  <div className="mt-4 text-sm leading-relaxed">
                    {rowAnalyzeMut.data.latencyMs != null ? (
                      <p className="mb-2 text-[10px] text-slate-500">模型耗时 {rowAnalyzeMut.data.latencyMs} ms</p>
                    ) : null}
                    <OpenClawChatMarkdown source={rowAnalyzeMut.data.summaryMarkdown} />
                  </div>
                ) : (
                  <p className="mt-4 text-xs text-slate-500">点击按钮后，这里会显示错误解释、问题类型和排查建议。</p>
                )}
              </div>

              <div className="min-w-0 rounded-lg border border-slate-800 bg-[#0b1020] p-4">
                <p className="mb-3 text-xs font-medium text-slate-300">完整消息</p>
                <pre className="max-h-[470px] overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-slate-100">
                  {selectedRow?.msg || "—"}
                </pre>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {data?.truncated || data?.scanWarning ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          {data.scanWarning || t("partial")}
        </p>
      ) : null}
    </div>
  );
};

export default AiInspectLogs;

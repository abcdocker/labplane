import React, { useCallback, useEffect, useState } from "react";
import { Link, NavLink, Navigate, useLocation, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiDeleteJson, apiGetJson, ApiHttpError } from "@/lib/api";
import { useAuth } from "@/auth/auth-context";
import { Button } from "@/components/ui/button";
import { MarkdownWithCopyToolbar } from "@/components/MarkdownWithCopyToolbar";
import { JsonSnippetWithCopy } from "@/components/JsonSnippetWithCopy";
import { OpenClawChatMarkdown } from "@/components/OpenClawChatMarkdown";
import { InspectReportRich, type InspectReportFull } from "./InspectReportRich";
import { cn } from "@/lib/utils";

const PAGE_SIZE_DEFAULT = 15;

/** 与 App.tsx 中 `path="reports/*"` 一致；勿用相对嵌套 `<Routes>`（会按整段 URL 匹配导致 Outlet 空白） */
const AI_INSPECT_REPORTS_BASE = "/cluster/ai-inspect/reports";

const REPORT_TABS = ["platform", "k8s", "pod", "workload"] as const;
type ReportTab = (typeof REPORT_TABS)[number];

function parseReportTab(pathname: string): ReportTab | null {
  if (pathname === AI_INSPECT_REPORTS_BASE || pathname === `${AI_INSPECT_REPORTS_BASE}/`) return null;
  if (!pathname.startsWith(`${AI_INSPECT_REPORTS_BASE}/`)) return null;
  const rest = pathname.slice(AI_INSPECT_REPORTS_BASE.length + 1).split("/").filter(Boolean)[0] ?? "";
  return (REPORT_TABS as readonly string[]).includes(rest) ? (rest as ReportTab) : null;
}

type ReportRow = {
  id: number;
  kind: string;
  subject: string;
  title: string;
  body: string;
  chunksJson?: string;
  metaJson?: string;
  createdBy?: string;
  createdAt: string;
};

type ReportsPayload = {
  ok?: boolean;
  items?: ReportRow[];
  total?: number;
  offset?: number;
  limit?: number;
  kind?: string;
};

type CorrelationPayload = {
  ok?: boolean;
  source?: string;
  doc?: { title?: string; body?: string; meta?: Record<string, unknown>; createdAt?: string };
  report?: ReportRow;
};

type RollupPayload = {
  ok?: boolean;
  source?: string;
  markdown?: string;
  meta?: Record<string, unknown>;
  data?: { markdown?: string; meta?: Record<string, unknown>; createdAt?: string };
};

function inspectReportPlainText(r: InspectReportFull): string {
  const parts: string[] = [`# ${r.summary}`, `> ${r.createdAt}`];
  if (r.aiSummary) parts.push("\n## AI 摘要\n\n", r.aiSummary);
  if (r.sections?.length) {
    for (const s of r.sections) {
      parts.push(`\n## ${s.title}（${s.status}）\n\n`, s.markdown || "");
    }
  }
  return parts.join("");
}

function ListPager(props: {
  offset: number;
  limit: number;
  total: number;
  busy?: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const { offset, limit, total, busy } = props;
  const start = total === 0 ? 0 : offset + 1;
  const end = Math.min(offset + limit, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-sm dark:border-slate-800">
      <span className="text-slate-500 dark:text-slate-400">
        第 {start}–{end} 条，共 {total} 条
      </span>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy || offset <= 0} onClick={props.onPrev}>
          上一页
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy || offset + limit >= total}
          onClick={props.onNext}
        >
          下一页
        </Button>
      </div>
    </div>
  );
}

function ReportsNav() {
  const tabClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "rounded-lg px-3 py-1.5 text-xs font-medium transition",
      isActive
        ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
        : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
    );
  return (
    <nav
      aria-label="报告分类"
      className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-900/40"
    >
      <NavLink to={`${AI_INSPECT_REPORTS_BASE}/platform`} className={tabClass} end>
        平台级
      </NavLink>
      <NavLink to={`${AI_INSPECT_REPORTS_BASE}/k8s`} className={tabClass}>
        Kubernetes 集群级
      </NavLink>
      <NavLink to={`${AI_INSPECT_REPORTS_BASE}/pod`} className={tabClass}>
        Pod 级
      </NavLink>
      <NavLink to={`${AI_INSPECT_REPORTS_BASE}/workload`} className={tabClass}>
        Deployment / 应用级
      </NavLink>
    </nav>
  );
}

function AiInspectReportsLayout(props: { children: React.ReactNode }) {
  const { status } = useAuth();
  const isViewer = (status?.role ?? "").toLowerCase() === "viewer";

  if (isViewer) {
    return (
      <div className="mx-auto max-w-lg space-y-4 rounded-2xl border border-amber-200 bg-amber-50/90 p-6 text-sm text-amber-950">
        <Button variant="outline" size="sm" asChild>
          <Link to="/cluster/ai-inspect/dashboard">返回 AI 巡检总览</Link>
        </Button>
        <p>巡检报告聚合（平台巡检、Pod / 工作负载重启 AI、集群 rollup）仅对非只读角色开放；如需查看请联系管理员。</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">巡检报告</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
          按类型分栏浏览：平台定时/手动巡检、集群级统计与关联分析、单 Pod 重启 AI 报告、工作负载建议类落库。各子页支持分页；Markdown 与 JSON 支持语法高亮与一键复制。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" asChild>
            <Link to="/cluster/ai-inspect/configure">巡检配置与执行任务</Link>
          </Button>
          <Button type="button" variant="secondary" size="sm" asChild>
            <Link to="/cluster/ai-inspect/dashboard">Dashboard 总览</Link>
          </Button>
        </div>
      </div>
      <ReportsNav />
      {props.children}
      <p className="text-center text-xs text-slate-400">
        原路径 <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">/cluster/pod-restart-reports</code>{" "}
        已跳转至本区；Pod 类报告默认打开「Pod 级」分页列表。
      </p>
    </div>
  );
}

function AiInspectReportsPlatform() {
  const { status } = useAuth();
  const isAdmin = status?.role === "admin";
  const [searchParams] = useSearchParams();
  const highlight = (searchParams.get("highlight") || "").trim();
  const [highlightReportId, setHighlightReportId] = useState(highlight);
  const [offset, setOffset] = useState(0);
  const limit = PAGE_SIZE_DEFAULT;

  const repQ = useQuery({
    queryKey: ["ops-inspect-reports", offset, limit],
    queryFn: ({ signal }) =>
      apiGetJson<{ reports: InspectReportFull[]; total?: number; offset?: number; limit?: number }>(
        `/api/ops/inspect/reports?offset=${offset}&limit=${limit}`,
        { signal }
      ),
    enabled: isAdmin,
    retry: 1,
  });

  const total = repQ.data?.total ?? repQ.data?.reports?.length ?? 0;

  useEffect(() => {
    setHighlightReportId(highlight);
  }, [highlight]);

  useEffect(() => {
    if (!highlightReportId) return;
    const el = document.getElementById(`inspect-report-${highlightReportId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [highlightReportId, repQ.data]);

  if (!isAdmin) {
    return <p className="text-sm text-amber-900 dark:text-amber-200">平台巡检列表与接口仅管理员可用。</p>;
  }

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950/30">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">平台级巡检报告</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          全集群与多数据源汇总（K8s、vCenter、Prometheus、日志、Redis、SSH、云主机、OpenClaw 探针等）；由「巡检配置」页的定时或立即执行生成。
        </p>
      </div>
      {repQ.isLoading ? (
        <p className="text-sm text-slate-500">加载中…</p>
      ) : (
        <div className="space-y-4">
          {(repQ.data?.reports ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">暂无历史报告；请在「巡检配置」中点击「立即执行巡检」。</p>
          ) : null}
          {(repQ.data?.reports ?? []).map((r) => (
            <div
              key={r.id}
              id={`inspect-report-${r.id}`}
              className={cn(
                "scroll-mt-8 space-y-2 rounded-xl transition",
                highlightReportId === r.id && "ring-2 ring-sky-400 ring-offset-2 ring-offset-white dark:ring-offset-slate-950"
              )}
            >
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 text-xs"
                  onClick={() => {
                    const t = inspectReportPlainText(r);
                    void navigator.clipboard.writeText(t).then(
                      () => toast.success("已复制报告正文（摘要 + 各分项 Markdown）"),
                      () => toast.error("复制失败")
                    );
                  }}
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                  复制整份报告文本
                </Button>
              </div>
              <InspectReportRich report={r} />
            </div>
          ))}
          <ListPager
            offset={offset}
            limit={limit}
            total={total}
            busy={repQ.isFetching}
            onPrev={() => setOffset((o) => Math.max(0, o - limit))}
            onNext={() => setOffset((o) => (o + limit < total ? o + limit : o))}
          />
        </div>
      )}
    </section>
  );
}

function AiInspectReportsK8s() {
  const corrQ = useQuery({
    queryKey: ["k8s-pod-restart-ai-correlation"],
    queryFn: ({ signal }) => apiGetJson<CorrelationPayload>("/api/k8s/pod-restart-ai/correlation-latest", { signal }),
    staleTime: 60_000,
    retry: 1,
  });

  const rollupQ = useQuery({
    queryKey: ["k8s-pod-restart-ai-rollup"],
    queryFn: ({ signal }) => apiGetJson<RollupPayload>("/api/k8s/pod-restart-ai/rollup-summary", { signal }),
    staleTime: 120_000,
    retry: 1,
  });

  const [cOff, setCOff] = useState(0);
  const cLimit = PAGE_SIZE_DEFAULT;

  const clusterQ = useQuery({
    queryKey: ["k8s-pod-restart-ai-reports", "cluster", cOff, cLimit],
    queryFn: ({ signal }) =>
      apiGetJson<ReportsPayload>(
        `/api/k8s/pod-restart-ai/reports?kind=cluster&offset=${cOff}&limit=${cLimit}`,
        { signal }
      ),
    retry: 1,
  });

  const rollupMd =
    rollupQ.data?.markdown ??
    (typeof rollupQ.data?.data?.markdown === "string" ? rollupQ.data.data.markdown : undefined);
  const corrBody =
    corrQ.data?.doc?.body ??
    (corrQ.data?.report?.body && corrQ.data.source === "mysql" ? corrQ.data.report.body : undefined);

  const cTotal = clusterQ.data?.total ?? 0;
  const cItems = clusterQ.data?.items ?? [];

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950/30">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Kubernetes 集群级</h2>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        统计整合（MySQL 聚合摘录，无额外大模型调用）与整点异常 Pod 关联分析；下方列表为库内{" "}
        <code className="rounded bg-slate-100 px-1 font-mono text-xs dark:bg-slate-800">hourly_correlation</code> /{" "}
        <code className="rounded bg-slate-100 px-1 font-mono text-xs dark:bg-slate-800">rollup_stat</code>{" "}
        分页记录。
      </p>
      <div className="space-y-4">
        {rollupQ.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
        ) : (
          <MarkdownWithCopyToolbar
            title="统计整合（Rollup）"
            source={rollupMd ?? ""}
            emptyFallback="暂无 rollup 数据（保存过 Pod 分析报告后可见）。"
          />
        )}
        {corrQ.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
        ) : (
          <MarkdownWithCopyToolbar
            title="整点 · 异常 Pod 关联（最近一条）"
            source={corrBody ?? ""}
            emptyFallback="尚无关联分析缓存（后台约每小时写入）。"
          />
        )}
      </div>
      <div className="space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">数据库中的集群类记录</p>
        {clusterQ.isError ? (
          <p className="text-sm text-red-600">
            {clusterQ.error instanceof ApiHttpError ? clusterQ.error.serverMessage : String(clusterQ.error)}
          </p>
        ) : clusterQ.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
        ) : cItems.length === 0 ? (
          <p className="text-sm text-slate-500">暂无集群类落库记录或未配置 MySQL。</p>
        ) : (
          <ul className="space-y-3">
            {cItems.map((it) => (
              <li key={it.id} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/30">
                <p className="text-xs text-slate-500">
                  #{it.id} · <span className="font-mono">{it.kind}</span> · {it.createdAt}
                </p>
                <MarkdownWithCopyToolbar title={it.title || it.subject || "正文"} source={it.body || ""} className="mt-2" />
              </li>
            ))}
          </ul>
        )}
        {cTotal > 0 ? (
          <ListPager
            offset={cOff}
            limit={cLimit}
            total={cTotal}
            busy={clusterQ.isFetching}
            onPrev={() => setCOff((o) => Math.max(0, o - cLimit))}
            onNext={() => setCOff((o) => (o + cLimit < cTotal ? o + cLimit : o))}
          />
        ) : null}
      </div>
    </section>
  );
}

function useRestartReportsDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => apiDeleteJson<{ ok?: boolean }>(`/api/k8s/pod-restart-ai/reports/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["k8s-pod-restart-ai-reports"] }),
    onError: (e: unknown) => toast.error(e instanceof ApiHttpError ? e.serverMessage : String(e)),
  });
}

function AiInspectReportsPod() {
  const qc = useQueryClient();
  const { status: authStatus } = useAuth();
  const canDeleteReports = authStatus?.role === "admin";
  const [offset, setOffset] = useState(0);
  const limit = PAGE_SIZE_DEFAULT;
  const delM = useRestartReportsDelete();

  const listQ = useQuery({
    queryKey: ["k8s-pod-restart-ai-reports", "pod", offset, limit],
    queryFn: ({ signal }) =>
      apiGetJson<ReportsPayload>(`/api/k8s/pod-restart-ai/reports?kind=pod&offset=${offset}&limit=${limit}`, {
        signal,
      }),
    retry: 1,
  });

  const onDelete = useCallback(
    (id: number) => {
      if (!window.confirm("确定删除该条分析报告？不可恢复。")) return;
      delM.mutate(id);
    },
    [delM]
  );

  const total = listQ.data?.total ?? 0;
  const items = listQ.data?.items ?? [];

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950/30">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Pod 级</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            <code className="rounded bg-slate-100 px-1 font-mono text-xs dark:bg-slate-800">pod_analysis</code>{" "}
            及历史无 kind 字段的记录；来自 Pod 详情「AI 分析重启原因」保存。
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={listQ.isFetching} onClick={() => void qc.invalidateQueries({ queryKey: ["k8s-pod-restart-ai-reports"] })}>
          刷新列表
        </Button>
      </div>
      {listQ.isError ? (
        <p className="text-sm text-red-600">
          {listQ.error instanceof ApiHttpError ? listQ.error.serverMessage : String(listQ.error)}
        </p>
      ) : listQ.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500">暂无 Pod 级记录或未配置 MySQL。</p>
      ) : (
        <>
          <ul className="space-y-4">
            {items.map((it) => (
              <li key={it.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500">
                      #{it.id} · <span className="font-mono">{it.kind || "pod_analysis"}</span> · {it.createdAt}
                      {it.createdBy ? ` · ${it.createdBy}` : ""}
                    </p>
                    <p className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">{it.subject || it.title}</p>
                    <p className="text-xs text-slate-500">{it.title}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1 text-xs"
                      onClick={() => {
                        const t = (it.body || "").trim();
                        if (!t) {
                          toast.error("正文为空");
                          return;
                        }
                        void navigator.clipboard.writeText(t).then(
                          () => toast.success("已复制该条 Markdown"),
                          () => toast.error("复制失败")
                        );
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" aria-hidden />
                      复制正文
                    </Button>
                    {canDeleteReports ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1 text-destructive hover:text-destructive"
                        disabled={delM.isPending}
                        onClick={() => onDelete(it.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        删除
                      </Button>
                    ) : null}
                  </div>
                </div>
                {it.metaJson ? <JsonSnippetWithCopy raw={it.metaJson} title="meta.json" className="mt-2" /> : null}
                {it.chunksJson ? <JsonSnippetWithCopy raw={it.chunksJson} title="chunks.json" className="mt-2" /> : null}
                <div className="mt-2 rounded-md border border-slate-100 bg-slate-50/50 p-2 dark:border-slate-800 dark:bg-slate-900/40">
                  <OpenClawChatMarkdown source={it.body || "—"} />
                </div>
              </li>
            ))}
          </ul>
          <ListPager
            offset={offset}
            limit={limit}
            total={total}
            busy={listQ.isFetching}
            onPrev={() => setOffset((o) => Math.max(0, o - limit))}
            onNext={() => setOffset((o) => (o + limit < total ? o + limit : o))}
          />
        </>
      )}
    </section>
  );
}

function AiInspectReportsWorkload() {
  const { status: authStatus } = useAuth();
  const canDeleteReports = authStatus?.role === "admin";
  const [offset, setOffset] = useState(0);
  const limit = PAGE_SIZE_DEFAULT;
  const delM = useRestartReportsDelete();

  const listQ = useQuery({
    queryKey: ["k8s-pod-restart-ai-reports", "workload", offset, limit],
    queryFn: ({ signal }) =>
      apiGetJson<ReportsPayload>(`/api/k8s/pod-restart-ai/reports?kind=workload&offset=${offset}&limit=${limit}`, {
        signal,
      }),
    retry: 1,
  });

  const onDelete = useCallback(
    (id: number) => {
      if (!window.confirm("确定删除该条分析报告？不可恢复。")) return;
      delM.mutate(id);
    },
    [delM]
  );

  const total = listQ.data?.total ?? 0;
  const items = listQ.data?.items ?? [];

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950/30">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Deployment / 应用级</h2>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        <code className="rounded bg-slate-100 px-1 font-mono text-xs dark:bg-slate-800">workload_advisory_ai</code>{" "}
        等工作负载相关落库；与控制器资源建议等流程写入的数据一致。
      </p>
      {listQ.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500">暂无工作负载类 AI 报告记录。</p>
      ) : (
        <>
          <ul className="space-y-4">
            {items.map((it) => (
              <li key={it.id} className="rounded-lg border border-violet-200/80 bg-violet-50/20 p-3 dark:border-violet-900/50 dark:bg-violet-950/20">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-slate-500">
                      #{it.id} · {it.createdAt}
                    </p>
                    <p className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">{it.subject || it.title}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1 text-xs"
                      onClick={() => {
                        const t = (it.body || "").trim();
                        if (!t) {
                          toast.error("正文为空");
                          return;
                        }
                        void navigator.clipboard.writeText(t).then(
                          () => toast.success("已复制该条 Markdown"),
                          () => toast.error("复制失败")
                        );
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" aria-hidden />
                      复制正文
                    </Button>
                    {canDeleteReports ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1 text-destructive hover:text-destructive"
                        disabled={delM.isPending}
                        onClick={() => onDelete(it.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        删除
                      </Button>
                    ) : null}
                  </div>
                </div>
                {it.metaJson ? <JsonSnippetWithCopy raw={it.metaJson} title="meta.json" className="mt-2" /> : null}
                <div className="mt-2 rounded-md border border-slate-100 bg-white/80 p-2 dark:border-slate-800 dark:bg-slate-950/40">
                  <OpenClawChatMarkdown source={it.body || "—"} />
                </div>
              </li>
            ))}
          </ul>
          <ListPager
            offset={offset}
            limit={limit}
            total={total}
            busy={listQ.isFetching}
            onPrev={() => setOffset((o) => Math.max(0, o - limit))}
            onNext={() => setOffset((o) => (o + limit < total ? o + limit : o))}
          />
        </>
      )}
    </section>
  );
}

/** 挂在 `path="reports/*"`；根据 URL 段渲染对应面板（避免内层 `<Routes>` 与整段 pathname 不匹配） */
const AiInspectReportsShell: React.FC = () => {
  const { pathname, search } = useLocation();
  const tab = parseReportTab(pathname);

  if (!tab) {
    return <Navigate to={`${AI_INSPECT_REPORTS_BASE}/platform${search}`} replace />;
  }

  return (
    <AiInspectReportsLayout>
      {tab === "platform" ? <AiInspectReportsPlatform /> : null}
      {tab === "k8s" ? <AiInspectReportsK8s /> : null}
      {tab === "pod" ? <AiInspectReportsPod /> : null}
      {tab === "workload" ? <AiInspectReportsWorkload /> : null}
    </AiInspectReportsLayout>
  );
};

export default AiInspectReportsShell;

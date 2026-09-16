import React, { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Copy, ExternalLink, FileText, Terminal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/auth/auth-context";
import { apiDelete, apiGetJson } from "@/lib/api";
import { formatCpuCores, formatMemBytes } from "@/lib/k8s-metrics-format";
import type { PodsMetricsPayload } from "./types";
import { k8sPodDeleteAllowed, k8sPodExecAllowed } from "@/lib/platform-permissions";
import { parseAge } from "./parseAge";
import { K8sRelationsCard } from "./K8sRelationsCard";
import PodResourceNetworkTrendCharts from "./PodResourceNetworkTrendCharts";
import { podPhaseBadgeClass } from "./podPhaseStyle";
import PodTerminalSheet from "./PodTerminalSheet";
import { clusterPodTerminalHref } from "./ClusterPodTerminalPage";
import { YamlCodeBlock } from "@/components/YamlCodeBlock";
import PodLogsSheet from "./PodLogsSheet";
import { cn } from "@/lib/utils";

type PodEventRow = {
  type: string;
  reason: string;
  message: string;
  count: number;
  firstTimestamp: string;
  lastTimestamp: string;
  age: string;
};

type PodDetailContainer = {
  name: string;
  image: string;
  init?: boolean;
  cpuRequest?: string;
  memoryRequest?: string;
  cpuLimit?: string;
  memoryLimit?: string;
};

type PodDetail = {
  namespace: string;
  name: string;
  phase: string;
  node: string;
  restarts: number;
  age: string;
  containers: PodDetailContainer[];
  /** 工作容器 CPU request 合计（毫核） */
  cpuRequestMilli?: number;
  /** 工作容器 memory request 合计（字节） */
  memRequestBytes?: number;
  /** 工作容器 CPU limit 合计（毫核），无 limit 为 0 */
  cpuLimitMilli?: number;
  /** 工作容器 memory limit 合计（字节），无 limit 为 0 */
  memLimitBytes?: number;
  yaml: string;
  events?: PodEventRow[];
};

/** 解析 Pod spec 中的 cpu 数量字符串为毫核（用于与 Prometheus 核数对比） */
function parseK8sCpuToMilli(s: string | undefined): number | null {
  if (s == null) return null;
  const t = s.trim();
  if (!t) return null;
  if (t.endsWith("m")) {
    const n = parseInt(t.slice(0, -1), 10);
    return Number.isFinite(n) ? n : null;
  }
  const n = parseFloat(t);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 1000);
}

/** 解析 memory 数量字符串为字节（常见 Ki/Mi/Gi 及裸数字字节） */
function parseK8sMemoryToBytes(s: string | undefined): number | null {
  if (s == null) return null;
  const t = s.trim();
  if (!t) return null;
  const m = t.match(/^([0-9.]+)(Ki|Mi|Gi|Ti|K|M|G)?$/i);
  if (!m) {
    const n = parseInt(t, 10);
    return Number.isFinite(n) ? n : null;
  }
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const suf = (m[2] || "").toLowerCase();
  const mult: Record<string, number> = {
    "": 1,
    k: 1000,
    m: 1e6,
    g: 1e9,
    ki: 1024,
    mi: 1024 ** 2,
    gi: 1024 ** 3,
    ti: 1024 ** 4,
  };
  const f = mult[suf];
  if (f == null) return Math.round(n);
  return Math.round(n * f);
}

function fmtNetBps(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n < 1) return `${(n * 8).toFixed(0)} b/s`;
  if (n < 1024) return `${n.toFixed(0)} B/s`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KiB/s`;
  return `${(n / 1024 ** 2).toFixed(2)} MiB/s`;
}

function podMetricKey(ns: string, podName: string): string {
  return `${ns}/${podName}`;
}

function fmtCpuUsagePct(usageCores: number | undefined, limitMilli: number | undefined): string | null {
  if (usageCores == null || !Number.isFinite(usageCores)) return null;
  const lim = limitMilli ?? 0;
  if (lim <= 0) return null;
  const limitCores = lim / 1000;
  if (limitCores <= 0) return null;
  const pct = (usageCores / limitCores) * 100;
  return `${Math.min(9999, pct).toFixed(1)}%`;
}

function fmtMemUsagePct(usageBytes: number | undefined, limitBytes: number | undefined): string | null {
  if (usageBytes == null || !Number.isFinite(usageBytes)) return null;
  const lim = limitBytes ?? 0;
  if (lim <= 0) return null;
  const pct = (usageBytes / lim) * 100;
  return `${Math.min(9999, pct).toFixed(1)}%`;
}

function podApiPath(namespace: string, name: string) {
  return `/api/k8s/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;
}

function PodContainerResourcesUsage({
  c,
  metrics,
  promOk,
  metricsLoading,
}: {
  c: PodDetailContainer;
  metrics: PodsMetricsPayload | undefined;
  promOk: boolean;
  metricsLoading: boolean;
}) {
  if (c.init) return null;
  const hasRes = Boolean(
    c.cpuRequest || c.memoryRequest || c.cpuLimit || c.memoryLimit
  );
  const cu = metrics?.cpuCoresByContainer?.[c.name];
  const mu = metrics?.memBytesByContainer?.[c.name];
  const cpuLM = parseK8sCpuToMilli(c.cpuLimit);
  const memLB = parseK8sMemoryToBytes(c.memoryLimit);
  const cpuRM = parseK8sCpuToMilli(c.cpuRequest);
  const memRB = parseK8sMemoryToBytes(c.memoryRequest);
  const pctLimCpu =
    cpuLM != null &&
    cpuLM > 0 &&
    cu != null &&
    Number.isFinite(cu)
      ? `${Math.min(9999, (cu / (cpuLM / 1000)) * 100).toFixed(1)}%`
      : null;
  const pctLimMem =
    memLB != null &&
    memLB > 0 &&
    mu != null &&
    Number.isFinite(mu)
      ? `${Math.min(9999, (mu / memLB) * 100).toFixed(1)}%`
      : null;
  const pctReqCpu =
    cpuRM != null && cpuRM > 0 && cu != null && Number.isFinite(cu)
      ? `${Math.min(9999, (cu / (cpuRM / 1000)) * 100).toFixed(1)}%`
      : null;
  const pctReqMem =
    memRB != null && memRB > 0 && mu != null && Number.isFinite(mu)
      ? `${Math.min(9999, (mu / memRB) * 100).toFixed(1)}%`
      : null;
  const showUsage =
    promOk && !metricsLoading && (cu != null || mu != null);
  if (!hasRes && !showUsage && !metricsLoading) return null;
  return (
    <div className="mt-2 space-y-1 rounded-md border border-slate-100 bg-white/80 px-2.5 py-2 text-[11px] text-slate-600">
      {hasRes ? (
        <div className="flex flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:gap-x-4">
          {(c.cpuRequest || c.memoryRequest) && (
            <span>
              <span className="text-slate-400">请求</span> CPU{" "}
              <span className="font-mono text-slate-800">{c.cpuRequest || "—"}</span> · Mem{" "}
              <span className="font-mono text-slate-800">{c.memoryRequest || "—"}</span>
            </span>
          )}
          {(c.cpuLimit || c.memoryLimit) && (
            <span>
              <span className="text-slate-400">限额</span> CPU{" "}
              <span className="font-mono text-slate-800">{c.cpuLimit || "—"}</span> · Mem{" "}
              <span className="font-mono text-slate-800">{c.memoryLimit || "—"}</span>
            </span>
          )}
        </div>
      ) : null}
      {metricsLoading ? (
        <p className="text-slate-400">容器用量加载中…</p>
      ) : showUsage ? (
        <p>
          <span className="text-slate-400">当前用量（Prometheus）</span> CPU{" "}
          <span className="font-medium tabular-nums text-slate-900">
            {cu != null && Number.isFinite(cu) ? formatCpuCores(cu) : "—"}
          </span>
          {pctLimCpu != null && (
            <span className="text-emerald-700">（占限额 {pctLimCpu}）</span>
          )}
          {pctReqCpu != null && pctLimCpu == null && (
            <span className="text-sky-700">（占请求 {pctReqCpu}）</span>
          )}
          {" · Mem "}
          <span className="font-medium tabular-nums text-slate-900">
            {mu != null && Number.isFinite(mu) ? formatMemBytes(mu) : "—"}
          </span>
          {pctLimMem != null && (
            <span className="text-emerald-700">（占限额 {pctLimMem}）</span>
          )}
          {pctReqMem != null && pctLimMem == null && (
            <span className="text-sky-700">（占请求 {pctReqMem}）</span>
          )}
        </p>
      ) : promOk ? (
        <p className="text-slate-400">暂无该容器的 cAdvisor 样本（名称需与指标 label 一致）</p>
      ) : null}
    </div>
  );
}

function PodContainersActionCard({
  showTerminal,
  containers,
  namespace,
  podName,
  openLogs,
  setTermContainer,
  metrics,
  metricsLoading,
  promOk,
}: {
  showTerminal: boolean;
  containers: PodDetailContainer[];
  namespace: string;
  podName: string;
  openLogs: (name: string, prev: boolean) => void;
  setTermContainer: (name: string) => void;
  metrics: PodsMetricsPayload | undefined;
  metricsLoading: boolean;
  promOk: boolean;
}) {
  return (
    <Card className="border-slate-200/80 shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          {showTerminal ? (
            <Terminal className="h-4 w-4 text-slate-500" />
          ) : (
            <FileText className="h-4 w-4 text-slate-500" />
          )}
          <CardTitle className="text-base">
            {showTerminal ? "进入容器（终端）" : "容器与日志"}
          </CardTitle>
        </div>
        <CardDescription>
          {showTerminal
            ? "弹窗终端或新标签全屏页（样式参考 Orion Visor 终端布局）。亦可复制下方 kubectl 在本地执行。"
            : "当前账号无 Pod 终端权限，仅可查看日志。"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {containers.length === 0 && <p className="text-sm text-slate-500">暂无容器定义</p>}
        {containers.map((c) => (
          <div
            key={c.name + (c.init ? "-init" : "")}
            className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono font-medium text-slate-900">{c.name}</span>
                {c.init ? (
                  <Badge variant="secondary" className="text-[10px]">
                    init
                  </Badge>
                ) : null}
              </div>
              <div
                className={cn(
                  "flex shrink-0 flex-wrap gap-1.5",
                  showTerminal ? "" : "flex-wrap justify-end"
                )}
              >
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="gap-1"
                  onClick={() => openLogs(c.name, false)}
                >
                  <FileText className="h-3.5 w-3.5" />
                  日志
                </Button>
                {!c.init ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1 text-xs"
                    onClick={() => openLogs(c.name, true)}
                    title="等价 kubectl logs --previous"
                  >
                    上轮日志
                  </Button>
                ) : null}
                {showTerminal ? (
                  <>
                    <Button type="button" size="sm" className="gap-1" onClick={() => setTermContainer(c.name)}>
                      <Terminal className="h-3.5 w-3.5" />
                      终端
                    </Button>
                    <Button asChild size="sm" variant="outline" className="gap-1">
                      <a
                        href={clusterPodTerminalHref(namespace, podName, c.name)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        新页面
                      </a>
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
            <p className="mt-1 truncate text-xs text-slate-500" title={c.image}>
              {c.image}
            </p>
            <PodContainerResourcesUsage
              c={c}
              metrics={metrics}
              promOk={promOk}
              metricsLoading={metricsLoading}
            />
            {showTerminal ? (
              <pre className="mt-2 overflow-x-auto rounded-md bg-slate-900 px-3 py-2 text-[11px] leading-relaxed text-slate-100">
                {`kubectl exec -it -n ${namespace} ${podName} -c ${c.name} -- /bin/sh`}
              </pre>
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

const ClusterPodDetail: React.FC = () => {
  const { status: authStatus } = useAuth();
  const canExec = k8sPodExecAllowed(authStatus?.role, authStatus?.permissions ?? null);
  const canDeletePod = k8sPodDeleteAllowed(authStatus?.role, authStatus?.permissions ?? null);
  const { namespace: nsParam, podName: nameParam } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [delOpen, setDelOpen] = useState(false);
  const [copyOk, setCopyOk] = useState(false);
  const [termContainer, setTermContainer] = useState<string | null>(null);
  const [logContainer, setLogContainer] = useState<string | null>(null);
  const [logOpenPrevious, setLogOpenPrevious] = useState(false);

  const namespace = nsParam ? decodeURIComponent(nsParam) : "";
  const name = nameParam ? decodeURIComponent(nameParam) : "";

  const detailQ = useQuery({
    queryKey: ["k8s-pod", namespace, name],
    queryFn: ({ signal }) => apiGetJson<PodDetail>(podApiPath(namespace, name), { signal }),
    enabled: Boolean(namespace && name),
  });

  const metricsQ = useQuery({
    queryKey: ["k8s-pods-metrics", namespace, name],
    queryFn: ({ signal }) => {
      const q = new URLSearchParams();
      q.set("namespace", namespace);
      q.set("pod", name);
      return apiGetJson<PodsMetricsPayload>(`/api/k8s/pods/metrics?${q.toString()}`, { signal });
    },
    enabled: Boolean(namespace && name && detailQ.data),
    refetchInterval: 30_000,
  });

  const deleteMut = useMutation({
    mutationFn: () => apiDelete(podApiPath(namespace, name)),
    onSuccess: () => {
      setDelOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["k8s-pods"] });
      void queryClient.invalidateQueries({ queryKey: ["k8s-summary"] });
      void navigate("/cluster/pods");
    },
  });

  const openLogs = (containerName: string, usePrevious: boolean) => {
    setLogOpenPrevious(usePrevious);
    setLogContainer(containerName);
  };

  const primaryWorkloadContainer = useMemo(() => {
    const d = detailQ.data;
    if (!d?.containers?.length) return "";
    const w = d.containers.find((c) => !c.init);
    return (w ?? d.containers[0]).name;
  }, [detailQ.data]);

  const copyYaml = async () => {
    if (!detailQ.data?.yaml) return;
    try {
      await navigator.clipboard.writeText(detailQ.data.yaml);
      setCopyOk(true);
      setTimeout(() => setCopyOk(false), 2000);
    } catch {
      /* ignore */
    }
  };

  if (!namespace || !name) {
    return <p className="text-sm text-red-600">无效的 Pod 路径</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" className="-ml-2 gap-1 text-slate-600" asChild>
          <Link to="/cluster/pods">
            <ArrowLeft className="h-4 w-4" />
            返回列表
          </Link>
        </Button>
        <span className="text-slate-300 dark:text-slate-600">|</span>
        <span className="font-mono text-base font-medium text-slate-500 dark:text-slate-400">
          {namespace}
        </span>
        <span className="text-slate-300 dark:text-slate-600">/</span>
        <h2 className="font-mono text-lg font-semibold text-slate-900 dark:text-slate-100">{name}</h2>
      </div>

      {detailQ.isLoading && <p className="text-sm text-slate-500">加载中…</p>}
      {detailQ.error && (
        <p className="text-sm text-red-600">{(detailQ.error as Error).message}</p>
      )}

      {detailQ.data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-slate-200/80 shadow-sm">
              <CardHeader className="pb-2">
                <CardDescription>阶段</CardDescription>
                <CardTitle className="text-base">
                  <span
                    className={cn(
                      "inline-flex rounded-full border px-2.5 py-0.5 text-sm font-medium",
                      podPhaseBadgeClass(detailQ.data.phase)
                    )}
                  >
                    {detailQ.data.phase}
                  </span>
                </CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-slate-200/80 shadow-sm">
              <CardHeader className="pb-2">
                <CardDescription>Node</CardDescription>
                <CardTitle className="font-mono text-sm">{detailQ.data.node}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-slate-200/80 shadow-sm">
              <CardHeader className="pb-2">
                <CardDescription>重启次数</CardDescription>
                <CardTitle className="text-base">{detailQ.data.restarts}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-slate-200/80 shadow-sm">
              <CardHeader className="pb-2">
                <CardDescription>创建</CardDescription>
                <CardTitle className="text-base">
                  {parseAge(detailQ.data.age)}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          {(() => {
            const d = detailQ.data;
            const m = metricsQ.data;
            const key = podMetricKey(d.namespace, d.name);
            const cpuUse = m?.cpuCoresByPod?.[key];
            const memUse = m?.memBytesByPod?.[key];
            const netRx = m?.netRxBpsByPod?.[key];
            const netTx = m?.netTxBpsByPod?.[key];
            const cpuLim = d.cpuLimitMilli ?? 0;
            const memLim = d.memLimitBytes ?? 0;
            const cpuReq = d.cpuRequestMilli ?? 0;
            const memReq = d.memRequestBytes ?? 0;
            const cpuPct = fmtCpuUsagePct(cpuUse, cpuLim);
            const memPct = fmtMemUsagePct(memUse, memLim);
            const cpuReqPct = fmtCpuUsagePct(cpuUse, cpuReq);
            const memReqPct = fmtMemUsagePct(memUse, memReq);
            const limCpuStr =
              cpuLim > 0 ? `${(cpuLim / 1000).toFixed(3)} 核` : "未设置 limit";
            const limMemStr = memLim > 0 ? formatMemBytes(memLim) : "未设置 limit";
            const reqCpuStr =
              cpuReq > 0 ? `${(cpuReq / 1000).toFixed(3)} 核` : "未设置 request";
            const reqMemStr = memReq > 0 ? formatMemBytes(memReq) : "未设置 request";
            const promOk = m?.available === true && !metricsQ.isError;
            const metricsLoading = metricsQ.isLoading;
            return (
              <Card className="border-slate-200/80 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">资源使用与网络</CardTitle>
                  <CardDescription>
                    CPU / 内存来自 Prometheus（容器 5m 平均）；按容器细分在下方各容器卡片中展示。限额 / 请求为工作容器{" "}
                    <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px] text-slate-800">{`resources`}</code>{" "}
                    合计。网络为 Pod 网卡{" "}
                    <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px] text-slate-800">{`container_network_*`}</code>{" "}
                    的 5m 平均速率。需在运行时配置{" "}
                    <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px] text-slate-800">{`prometheusUrlK8s`}</code>。
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {!promOk && !metricsLoading && (
                    <p className="mb-3 text-sm text-amber-800">
                      {metricsQ.isError
                        ? `监控数据加载失败：${(metricsQ.error as Error).message}`
                        : m?.hint ||
                          "未配置 Kubernetes Prometheus 或暂无指标（侧栏集群设置中填写 prometheusUrlK8s）。"}
                    </p>
                  )}
                  {metricsLoading && (
                    <p className="mb-3 text-sm text-slate-500">正在拉取 Prometheus 指标…</p>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-3">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">CPU</p>
                      <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
                        {promOk && !metricsLoading ? formatCpuCores(cpuUse) : metricsLoading ? "…" : "—"}
                        {promOk && !metricsLoading && cpuPct != null && (
                          <span className="ml-2 text-base font-medium text-emerald-700">({cpuPct})</span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        限额 {limCpuStr}
                        {cpuReq > 0 && (
                          <>
                            {" "}
                            · 请求 {reqCpuStr}
                            {promOk && !metricsLoading && cpuReqPct != null && (
                              <span className="text-emerald-700">（占请求 {cpuReqPct}）</span>
                            )}
                          </>
                        )}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-3">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">内存</p>
                      <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
                        {promOk && !metricsLoading ? formatMemBytes(memUse) : metricsLoading ? "…" : "—"}
                        {promOk && !metricsLoading && memPct != null && (
                          <span className="ml-2 text-base font-medium text-emerald-700">({memPct})</span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        限额 {limMemStr}
                        {memReq > 0 && (
                          <>
                            {" "}
                            · 请求 {reqMemStr}
                            {promOk && !metricsLoading && memReqPct != null && (
                              <span className="text-emerald-700">（占请求 {memReqPct}）</span>
                            )}
                          </>
                        )}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-3">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">网络入站</p>
                      <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
                        {promOk && !metricsLoading ? fmtNetBps(netRx) : metricsLoading ? "…" : "—"}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">receive 5m rate</p>
                    </div>
                    <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-3">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">网络出站</p>
                      <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
                        {promOk && !metricsLoading ? fmtNetBps(netTx) : metricsLoading ? "…" : "—"}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">transmit 5m rate</p>
                    </div>
                  </div>
                  <PodResourceNetworkTrendCharts
                    namespace={d.namespace}
                    podName={d.name}
                    enabled={promOk && !metricsLoading}
                  />
                  {promOk && m?.hint ? (
                    <p className="mt-3 text-xs text-slate-500">{m.hint}</p>
                  ) : null}
                </CardContent>
              </Card>
            );
          })()}

          <K8sRelationsCard namespace={namespace} kind="Pod" name={name} />

          <PodContainersActionCard
            showTerminal={canExec}
            containers={detailQ.data.containers}
            namespace={namespace}
            podName={name}
            openLogs={openLogs}
            setTermContainer={setTermContainer}
            metrics={metricsQ.data}
            metricsLoading={metricsQ.isLoading}
            promOk={metricsQ.data?.available === true && !metricsQ.isError}
          />

          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Events</CardTitle>
              <CardDescription>与该 Pod 相关的集群事件（involvedObject）</CardDescription>
            </CardHeader>
            <CardContent>
              {!detailQ.data.events?.length ? (
                <p className="text-sm text-slate-500">暂无事件</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-100">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/80 text-[11px] uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-2 font-semibold">Type</th>
                        <th className="px-3 py-2 font-semibold">Reason</th>
                        <th className="px-3 py-2 font-semibold">Message</th>
                        <th className="px-3 py-2 font-semibold">Count</th>
                        <th className="px-3 py-2 font-semibold">Age</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailQ.data.events.map((ev, i) => (
                        <tr key={i} className="border-b border-slate-50 align-top">
                          <td className="px-3 py-2 font-mono text-xs">{ev.type || "—"}</td>
                          <td className="px-3 py-2 font-mono text-xs">{ev.reason || "—"}</td>
                          <td className="px-3 py-2 text-xs text-slate-700">{ev.message}</td>
                          <td className="px-3 py-2 tabular-nums">{ev.count}</td>
                          <td className="px-3 py-2 text-xs text-slate-500">
                            {ev.age ? parseAge(ev.age) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
              <div>
                <CardTitle className="text-base">Pod YAML</CardTitle>
                <CardDescription>只读；可复制后用于 kubectl apply -f</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" size="sm" className="gap-1" onClick={() => void copyYaml()}>
                  <Copy className="h-3.5 w-3.5" />
                  {copyOk ? "已复制" : "复制"}
                </Button>
                {canDeletePod ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="gap-1"
                  onClick={() => setDelOpen(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  删除 Pod
                </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent>
              <YamlCodeBlock value={detailQ.data.yaml} />
            </CardContent>
          </Card>
        </>
      )}

      {canExec ? (
      <PodTerminalSheet
        open={termContainer !== null}
        onOpenChange={(o) => {
          if (!o) setTermContainer(null);
        }}
        namespace={namespace}
        podName={name}
        container={termContainer ?? ""}
      />
      ) : null}

      {detailQ.data && logContainer !== null && (
        <PodLogsSheet
          key={`${name}-${logContainer}-${logOpenPrevious ? "p" : "c"}`}
          open
          onOpenChange={(o) => {
            if (!o) {
              setLogContainer(null);
              setLogOpenPrevious(false);
            }
          }}
          namespace={namespace}
          podName={name}
          container={logContainer}
          initialPrevious={logOpenPrevious}
          containerOptions={detailQ.data.containers.map((c) => ({
            name: c.name,
            init: c.init,
          }))}
        />
      )}

      <AlertDialog
        open={delOpen}
        onOpenChange={(o) => {
          setDelOpen(o);
          if (o) deleteMut.reset();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除 Pod？</AlertDialogTitle>
            <AlertDialogDescription>
              将删除 <span className="font-mono text-foreground">{namespace}/{name}</span>
              。若由工作负载管理，可能会自动重建。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            {deleteMut.isError && (
              <p className="mr-auto w-full text-left text-sm text-red-600">
                {(deleteMut.error as Error).message}
              </p>
            )}
            <AlertDialogCancel>取消</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMut.isPending}
              onClick={() => deleteMut.mutate()}
            >
              {deleteMut.isPending ? "删除中…" : "确认删除"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ClusterPodDetail;

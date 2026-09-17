import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { APP_CONFIG_QUERY_KEY } from "@/hooks/use-app-config";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/auth/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiGetJson, apiPostJson, type AppConfig } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { AddonsStatusResponse } from "@/pages/cluster/ClusterK8sAddonsSection";

type MirrorMode = "auto" | "ghproxy_preferred" | "direct" | "ghproxy_only";

type KubePromStackMetricsProbe = {
  skipped?: boolean;
  ok?: boolean;
  kubeNodeInfoCount?: number | null;
  detail?: string;
  querySourceNote?: string;
  effectiveUrlMasked?: string;
};

type KubePromStackStatus = {
  namespace?: string;
  releaseName?: string;
  installed?: boolean;
  namespaceExists?: boolean;
  operatorDeploymentReady?: boolean;
  prometheusStatefulSet?: string;
  prometheusReady?: boolean;
  alertmanagerStatefulSet?: string;
  alertmanagerReady?: boolean;
  /** 典型工作负载 Pod 的异常 Waiting / 退出摘要（如 exec format error） */
  podWarnings?: string[];
  discoveredPrometheusURL?: string;
  hint?: string;
  /** 对运行时配置的查询地址执行 count(kube_node_info)，与「安装自检通过」无关 */
  prometheusMetricsProbe?: KubePromStackMetricsProbe;
};

type KubePromAddonsStatus = AddonsStatusResponse & {
  kubePrometheusStack?: KubePromStackStatus;
};

type IngressAddonVerification = {
  ok: boolean;
  checkedAt?: string;
  checks?: { name: string; ok: boolean; detail?: string }[];
  issues?: string[];
  remedies?: string[];
  waitedSeconds?: number;
};

function isMirrorMode(v: string): v is MirrorMode {
  return v === "auto" || v === "ghproxy_preferred" || v === "direct" || v === "ghproxy_only";
}

const ClusterK8sKubePrometheusStackSection: React.FC = () => {
  const { status: auth } = useAuth();
  const isAdmin = auth?.role === "admin";
  const qc = useQueryClient();

  const { data: cfg } = useQuery({
    queryKey: APP_CONFIG_QUERY_KEY,
    queryFn: ({ signal }) => apiGetJson<AppConfig>("/api/config", { signal }),
  });

  const [manifestMirror, setManifestMirror] = useState<MirrorMode>("ghproxy_preferred");
  useEffect(() => {
    const m = cfg?.k8sAddonsManifestMirror;
    if (m && isMirrorMode(m)) setManifestMirror(m);
  }, [cfg?.k8sAddonsManifestMirror]);

  const [grafana, setGrafana] = useState(false);
  const [alertmanager, setAlertmanager] = useState(false);
  const [autoSwitchProm, setAutoSwitchProm] = useState(true);
  const [clearVm, setClearVm] = useState(true);
  /** 与 kube-prometheus-stack chart 中 kubeEtcd 段对应，等价于手写 values.yaml */
  const [kubeEtcdEnabled, setKubeEtcdEnabled] = useState(false);
  const [kubeEtcdEndpointsText, setKubeEtcdEndpointsText] = useState(
    "192.168.21.10\n192.168.21.11\n192.168.21.12",
  );
  const [kubeEtcdService, setKubeEtcdService] = useState(true);
  const [kubeEtcdPort, setKubeEtcdPort] = useState("2381");
  const [kubeEtcdTargetPort, setKubeEtcdTargetPort] = useState("2381");
  const [lastValuesYaml, setLastValuesYaml] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [progress, setProgress] = useState(0);
  const [verification, setVerification] = useState<IngressAddonVerification | null>(null);
  const [lastPatchedUrl, setLastPatchedUrl] = useState<string | null>(null);
  /** 命名空间已创建但未就绪时，需勾选确认后才允许再次 Helm 应用，避免误触重复安装 */
  const [ackHelmRetry, setAckHelmRetry] = useState(false);
  const [lastInstallHttpError, setLastInstallHttpError] = useState<string | null>(null);

  const {
    data: st,
    isLoading: stLoading,
    isFetching: stFetching,
    error: stErr,
    refetch: refetchStatus,
  } = useQuery({
    queryKey: ["k8s-addons-status"],
    queryFn: ({ signal }) => apiGetJson<KubePromAddonsStatus>("/api/k8s/addons/status", { signal }),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const kp = st?.kubePrometheusStack;
  const installIncomplete = Boolean(kp?.namespaceExists && !kp?.installed);

  useEffect(() => {
    if (kp?.installed) setAckHelmRetry(false);
  }, [kp?.installed]);

  useEffect(() => {
    const b = busy || verifyBusy;
    if (!b) {
      setProgress(0);
      return;
    }
    setProgress(10);
    const id = window.setInterval(() => {
      setProgress((p) => (p >= 90 ? p : p + 2));
    }, 900);
    return () => clearInterval(id);
  }, [busy, verifyBusy]);

  const runInstall = useCallback(async () => {
    setConfirmOpen(false);
    setBusy(true);
    setLastInstallHttpError(null);
    setLastValuesYaml(null);
    setPhase("正在下载 chart、helm template 渲染、应用 CRD 与工作负载（可能需数分钟）…");
    const etcdEndpoints = kubeEtcdEndpointsText
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const pEtcd = Number.parseInt(kubeEtcdPort, 10);
    const pTgt = Number.parseInt(kubeEtcdTargetPort, 10);
    try {
      const res = await apiPostJson<{
        message?: string;
        verification?: IngressAddonVerification;
        patchedPrometheusUrlK8s?: string;
        runtimePrometheusPatched?: boolean;
        patchError?: string;
        reachableHint?: string;
        kubePromStackValuesYaml?: string;
      }>("/api/k8s/addons/kube-prometheus-stack/install", {
        manifestMirror,
        grafanaEnabled: grafana,
        alertmanagerEnabled: alertmanager,
        autoSwitchPrometheusUrl: autoSwitchProm,
        clearVmSelect: clearVm,
        kubeEtcdEnabled,
        kubeEtcdEndpoints: etcdEndpoints,
        kubeEtcdServiceEnabled: kubeEtcdService,
        kubeEtcdPort: Number.isFinite(pEtcd) && pEtcd > 0 ? pEtcd : undefined,
        kubeEtcdTargetPort: Number.isFinite(pTgt) && pTgt > 0 ? pTgt : undefined,
      });
      setProgress(100);
      setLastInstallHttpError(null);
      if (res.kubePromStackValuesYaml) setLastValuesYaml(res.kubePromStackValuesYaml);
      if (res.verification) setVerification(res.verification);
      if (res.patchedPrometheusUrlK8s) setLastPatchedUrl(res.patchedPrometheusUrlK8s);
      const msg = String(res.message || "").trim() || "处理完成";
      if (res.patchError) {
        toast.warning(msg);
      } else if (res.verification && !res.verification.ok) {
        toast.warning(msg);
      } else {
        toast.success(msg);
      }
      void qc.invalidateQueries({ queryKey: ["k8s-addons-status"] });
      void qc.invalidateQueries({ queryKey: APP_CONFIG_QUERY_KEY });
      void qc.invalidateQueries({ queryKey: ["runtime-status"] });
    } catch (e) {
      const msg = (e as Error).message;
      setLastInstallHttpError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
      setPhase("");
    }
  }, [
    alertmanager,
    autoSwitchProm,
    clearVm,
    grafana,
    kubeEtcdEnabled,
    kubeEtcdEndpointsText,
    kubeEtcdPort,
    kubeEtcdService,
    kubeEtcdTargetPort,
    manifestMirror,
    qc,
  ]);

  const runVerify = useCallback(async () => {
    setVerifyBusy(true);
    /** 单请求 maxWaitSec=600 易被 Ingress/Nginx 默认 ~60s 断开导致 504；改为多轮短等待。 */
    const perRoundSec = 45;
    const maxRounds = 24;
    let last: IngressAddonVerification | null = null;
    try {
      for (let round = 0; round < maxRounds; round++) {
        setPhase(
          `正在检查 Operator / Prometheus（第 ${round + 1}/${maxRounds} 轮，每轮最多 ${perRoundSec}s，避免网关 504）…`,
        );
        const res = await apiGetJson<{ verification: IngressAddonVerification }>(
          `/api/k8s/addons/kube-prometheus-stack/verify?maxWaitSec=${perRoundSec}`,
        );
        last = res.verification;
        setVerification(res.verification);
        if (res.verification.ok) {
          toast.success("kube-prometheus 栈自检通过");
          void qc.invalidateQueries({ queryKey: ["k8s-addons-status"] });
          return;
        }
        if (round + 1 < maxRounds) {
          await new Promise((r) => setTimeout(r, 2500));
        }
      }
      if (last?.ok) {
        toast.success("kube-prometheus 栈自检通过");
      } else {
        toast.warning("自检未全部通过（已多轮短检测；若组件已 Running，可点「立即重新检测」看状态卡片）");
      }
      void qc.invalidateQueries({ queryKey: ["k8s-addons-status"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setVerifyBusy(false);
      setPhase("");
    }
  }, [qc]);

  return (
    <Card className="border-amber-100 bg-gradient-to-b from-amber-50/50 to-white shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg text-slate-900">kube-prometheus-stack（全栈监控 · 国内镜像）</CardTitle>
        <CardDescription className="text-sm text-slate-600">
          一键安装 <strong className="text-slate-800">Prometheus Operator + Prometheus + kube-state-metrics + node-exporter</strong>
          及默认 ServiceMonitor（抓取 kubelet/cAdvisor、核心组件等）。使用镜像内 <code className="rounded bg-white px-0.5 text-[11px]">helm template</code>{" "}
          渲染官方 chart，容器镜像前缀改写为 DaoCloud 加速（与 ingress 共用「关闭 K8s 镜像改写」则不改写）。命名空间{" "}
          <code className="rounded bg-white px-0.5 text-[11px]">kube-bt-sync-monitoring</code>，避免覆盖你已有的{" "}
          <code className="rounded bg-white px-0.5 text-[11px]">monitoring</code>。
          <span className="mt-2 block text-[13px] text-slate-700">
            默认<strong className="text-slate-800">自动将运行时 prometheusUrlK8s</strong>指向新 Prometheus Service（并可选清空{" "}
            <code className="rounded bg-slate-100 px-0.5 text-[11px]">vmSelectUrlK8s</code>
            ），集群总览、配额趋势等页面的 PromQL 即可拿到 <code className="rounded bg-slate-100 px-0.5 text-[11px]">container_*</code>、
            <code className="rounded bg-slate-100 px-0.5 text-[11px]">kube_*</code>、<code className="rounded bg-slate-100 px-0.5 text-[11px]">node_*</code> 等指标。
            若控制台进程在<strong>集群外</strong>，可能无法解析 <code className="rounded bg-slate-100 px-0.5 text-[11px]">*.svc</code>，请改为 Ingress/NodePort 地址或取消自动写入后手动填写。
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-amber-100 bg-amber-50/90 px-3 py-3 text-xs text-amber-950">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="font-medium">Prometheus 栈状态</strong>
            {(stLoading || stFetching) && (
              <span className="inline-flex items-center gap-1 text-amber-900">
                <Loader2 className="h-3 w-3 animate-spin" />
                检查中…
              </span>
            )}
            {st?.checkedAt && <span className="text-[11px] text-amber-900/90">更新于 {st.checkedAt}</span>}
          </div>
          {stErr && <p className="mt-2 text-red-700">{(stErr as Error).message}</p>}
          {kp?.hint && <p className="mt-2 text-[11px] text-amber-900/85">{kp.hint}</p>}
          {st && !stLoading && (
            <div className="mt-3 space-y-2 rounded-md border border-white/80 bg-white/70 px-2 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] text-slate-600">{kp?.namespace ?? "kube-bt-sync-monitoring"}</span>
                {kp?.installed ? (
                  <Badge className="bg-amber-600 hover:bg-amber-600">已就绪</Badge>
                ) : kp?.namespaceExists ? (
                  <Badge variant="secondary">部署中或未完整</Badge>
                ) : (
                  <Badge variant="secondary">未安装</Badge>
                )}
              </div>
              {kp?.operatorDeploymentReady != null && (
                <p className="text-[11px] text-slate-700">
                  Operator Deployment: {kp.operatorDeploymentReady ? "就绪" : "未就绪"}
                </p>
              )}
              {kp?.prometheusStatefulSet && (
                <p className="font-mono text-[11px] text-slate-700">
                  Prometheus STS: {kp.prometheusStatefulSet} · {kp.prometheusReady ? "就绪" : "未就绪"}
                </p>
              )}
              {kp?.alertmanagerStatefulSet ? (
                <p className="font-mono text-[11px] text-slate-700">
                  Alertmanager STS: {kp.alertmanagerStatefulSet} · {kp.alertmanagerReady ? "就绪" : "未就绪"}
                </p>
              ) : null}
              {kp?.podWarnings && kp.podWarnings.length > 0 ? (
                <div className="mt-2 rounded-md border border-red-200/90 bg-red-50/95 px-2 py-2 text-[11px] text-red-950">
                  <p className="font-medium">Pod 异常摘要</p>
                  <ul className="mt-1 list-inside list-disc space-y-0.5">
                    {kp.podWarnings.map((w, i) => (
                      <li key={`${i}-${w.slice(0, 24)}`} className="break-all">
                        {w}
                      </li>
                    ))}
                  </ul>
                  {kp.podWarnings.some((w) => w.toLowerCase().includes("exec format")) ? (
                    <p className="mt-2 text-[10px] leading-relaxed text-red-900/90">
                      若含 exec format error：多为镜像 CPU 架构与节点不一致。可在集群设置关闭「K8s 镜像改写」后重试，或换用支持本节点架构的仓库/多架构清单。
                    </p>
                  ) : null}
                </div>
              ) : null}
              {kp?.discoveredPrometheusURL && (
                <p className="mt-1 break-all font-mono text-[11px] text-sky-800">
                  发现地址: {kp.discoveredPrometheusURL}
                </p>
              )}
              {kp?.prometheusMetricsProbe && !kp.prometheusMetricsProbe.skipped && (
                <div
                  className={cn(
                    "mt-2 rounded-md border px-2 py-2 text-[11px] leading-relaxed",
                    kp.prometheusMetricsProbe.ok
                      ? "border-emerald-200/90 bg-emerald-50/90 text-emerald-950"
                      : "border-amber-300/80 bg-amber-50 text-amber-950",
                  )}
                >
                  <p className="font-medium">指标探测（监控页同源地址）</p>
                  <p className="mt-0.5 text-[10px] opacity-90">
                    数据源：{kp.prometheusMetricsProbe.querySourceNote ?? "—"}
                    {kp.prometheusMetricsProbe.effectiveUrlMasked ? (
                      <span className="ml-1 font-mono">{kp.prometheusMetricsProbe.effectiveUrlMasked}</span>
                    ) : null}
                  </p>
                  <p className="mt-1">
                    <code className="rounded bg-white/60 px-0.5">count(kube_node_info)</code>
                    {kp.prometheusMetricsProbe.kubeNodeInfoCount != null && kp.prometheusMetricsProbe.kubeNodeInfoCount !== undefined
                      ? ` → ${kp.prometheusMetricsProbe.kubeNodeInfoCount}`
                      : " → 无结果"}
                    {kp.prometheusMetricsProbe.ok ? "（有 kube-state-metrics 系列，配额类图表应能出数）" : "（为 0 或失败时，监控页 kube_* 会空，与上面「安装自检通过」无关）"}
                  </p>
                  {kp.prometheusMetricsProbe.detail ? (
                    <p className="mt-1 text-[10px] text-red-800/95">{kp.prometheusMetricsProbe.detail}</p>
                  ) : null}
                </div>
              )}
              {kp?.prometheusMetricsProbe?.skipped ? (
                <p className="mt-2 text-[11px] text-amber-900/90">{kp.prometheusMetricsProbe.detail}</p>
              ) : null}
              {lastPatchedUrl && (
                <p className="mt-1 break-all font-mono text-[11px] text-emerald-800">
                  上次已写入 prometheusUrlK8s: {lastPatchedUrl}
                </p>
              )}
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => void refetchStatus()}>
              立即重新检测
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={verifyBusy}
              onClick={() => void runVerify()}
            >
              {verifyBusy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
              深度自检（多轮短请求 · 最长约 10 分钟）
            </Button>
          </div>
        </div>

        {verification && (
          <div
            className={cn(
              "rounded-lg border px-3 py-3 text-xs",
              verification.ok ? "border-emerald-200 bg-emerald-50/90 text-emerald-950" : "border-amber-200 bg-amber-50/95 text-amber-950",
            )}
          >
            <div className="flex flex-wrap items-center gap-2 font-medium">
              <span>安装 / 自检报告</span>
              {verification.ok ? (
                <Badge className="bg-emerald-600 hover:bg-emerald-600">通过</Badge>
              ) : (
                <Badge className="bg-amber-600 hover:bg-amber-600">待处理</Badge>
              )}
              {verification.waitedSeconds != null && verification.waitedSeconds > 0 && (
                <span className="font-normal text-[11px]">等待约 {verification.waitedSeconds}s</span>
              )}
            </div>
            {verification.checks && verification.checks.length > 0 && (
              <ul className="mt-2 space-y-1 text-[11px]">
                {verification.checks.map((c, i) => (
                  <li key={`${i}-${c.name}`} className="flex flex-wrap gap-x-2">
                    <span className={c.ok ? "text-emerald-800" : "text-red-800"}>{c.ok ? "✓" : "✗"}</span>
                    <span className="font-mono">{c.name}</span>
                    {c.detail && <span className="text-slate-600">{c.detail}</span>}
                  </li>
                ))}
              </ul>
            )}
            {verification.remedies && verification.remedies.length > 0 && (
              <ul className="mt-2 list-inside list-disc text-[11px] text-amber-950">
                {verification.remedies.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {isAdmin ? (
          <div className="space-y-3 rounded-xl border-2 border-amber-200/90 bg-white/90 p-4 shadow-sm">
            <div className="rounded-lg border border-sky-200/80 bg-sky-50/50 p-3 dark:border-sky-900/50 dark:bg-sky-950/20">
              <p className="mb-2 text-xs font-medium text-sky-950 dark:text-sky-100">etcd 抓取（kubeEtcd）</p>
              <p className="mb-3 text-[11px] leading-relaxed text-sky-900/90 dark:text-sky-200/90">
                勾选并填写<strong>真实 control-plane IP</strong>后，平台会在本次安装/升级使用的 Helm values 中写入{" "}
                <code className="rounded bg-white/80 px-0.5 font-mono text-[10px] dark:bg-slate-900/80">kubeEtcd</code> 段（与手写{" "}
                <code className="rounded bg-white/80 px-0.5 font-mono text-[10px]">values.yaml</code> 等价），由 chart 在{" "}
                <code className="font-mono text-[10px]">kube-system</code> 创建 Service / Endpoints 与 ServiceMonitor，抓取{" "}
                <code className="font-mono text-[10px]">2381</code> 指标端口（kubeadm 常见）。无需再登录服务器改文件。
              </p>
              <label className="mb-3 flex cursor-pointer items-start gap-2 text-sm text-slate-800 dark:text-slate-200">
                <Checkbox checked={kubeEtcdEnabled} onCheckedChange={(v) => setKubeEtcdEnabled(v === true)} />
                <span>启用 kubeEtcd（填写下方 Master 地址）</span>
              </label>
              <div className="space-y-2">
                <Label className="text-xs text-slate-700 dark:text-slate-300">endpoints（每行一个 IP，或英文逗号分隔）</Label>
                <Textarea
                  className="min-h-[88px] font-mono text-xs"
                  value={kubeEtcdEndpointsText}
                  onChange={(e) => setKubeEtcdEndpointsText(e.target.value)}
                  disabled={!kubeEtcdEnabled}
                  placeholder="192.168.21.10"
                />
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800 dark:text-slate-200">
                  <Checkbox
                    checked={kubeEtcdService}
                    onCheckedChange={(v) => setKubeEtcdService(v === true)}
                    disabled={!kubeEtcdEnabled}
                  />
                  <span>
                    <code className="text-[11px]">service.enabled</code>
                  </span>
                </label>
                <div className="space-y-1">
                  <Label className="text-xs">service.port</Label>
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-2 font-mono text-xs"
                    value={kubeEtcdPort}
                    onChange={(e) => setKubeEtcdPort(e.target.value)}
                    disabled={!kubeEtcdEnabled}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">service.targetPort</Label>
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-2 font-mono text-xs"
                    value={kubeEtcdTargetPort}
                    onChange={(e) => setKubeEtcdTargetPort(e.target.value)}
                    disabled={!kubeEtcdEnabled}
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <Checkbox checked={grafana} onCheckedChange={(v) => setGrafana(v === true)} />
                <span>安装 Grafana（可选，占资源更多）</span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <Checkbox checked={alertmanager} onCheckedChange={(v) => setAlertmanager(v === true)} />
                <span>
                  安装 Alertmanager（可选；与 Prometheus 规则配套，告警可经 Webhook 进{" "}
                  <Link
                    to="/cluster/ai-inspect/alerts"
                    className="font-medium text-amber-900 underline-offset-2 hover:underline dark:text-amber-100"
                  >
                    告警中心
                  </Link>
                  ）
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <Checkbox checked={autoSwitchProm} onCheckedChange={(v) => setAutoSwitchProm(v === true)} />
                <span>
                  自动将 <code className="rounded bg-slate-100 px-0.5 text-[11px]">prometheusUrlK8s</code> 指向新 Prometheus
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <Checkbox checked={clearVm} onCheckedChange={(v) => setClearVm(v === true)} disabled={!autoSwitchProm} />
                <span>同时清空 vmSelectUrlK8s（仅用 Prometheus 查询）</span>
              </label>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Chart / 清单下载策略（chart 自 GitHub releases）</Label>
              <Select value={manifestMirror} onValueChange={(v) => isMirrorMode(v) && setManifestMirror(v)}>
                <SelectTrigger className="h-9 max-w-md font-mono text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ghproxy_preferred">国内推荐（jsDelivr → ghproxy → 直连）</SelectItem>
                  <SelectItem value="direct">海外 / 直连</SelectItem>
                  <SelectItem value="auto">自动</SelectItem>
                  <SelectItem value="ghproxy_only">仅代理线</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(busy || verifyBusy) && (
              <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2">
                <div className="flex items-center gap-2 text-xs font-medium text-amber-950">
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  <span>{phase || "处理中…"}</span>
                </div>
                <Progress value={progress} className="h-1.5 bg-amber-200/60" />
              </div>
            )}
            {installIncomplete && !busy && !verifyBusy ? (
              <div className="space-y-2 rounded-lg border border-amber-300/90 bg-amber-50/90 px-3 py-2.5 text-xs text-amber-950">
                <p className="font-medium">上次应用后仍未完全就绪</p>
                <p className="text-[11px] leading-relaxed text-amber-900/95">
                  请先查看上方「Pod 异常摘要」与「安装 / 自检报告」，处理镜像或集群问题后再执行。为避免误触重复下发 Helm，需勾选确认后才可再次点击安装。
                </p>
                <Progress value={100} className="h-1.5 bg-amber-200/50 [&>div]:bg-amber-500/80" />
              </div>
            ) : null}
            {lastInstallHttpError ? (
              <p className="rounded-md border border-red-200 bg-red-50/90 px-2 py-2 font-mono text-[11px] text-red-900">{lastInstallHttpError}</p>
            ) : null}
            {installIncomplete && !busy && !verifyBusy ? (
              <label className="flex cursor-pointer items-start gap-2 text-xs text-slate-700 dark:text-slate-300">
                <Checkbox checked={ackHelmRetry} onCheckedChange={(v) => setAckHelmRetry(v === true)} />
                <span>我已查看异常说明，仍要重新执行一键安装 / 升级（将再次 helm template 并 apply）</span>
              </label>
            ) : null}
            <Button
              type="button"
              disabled={busy || verifyBusy || (installIncomplete && !ackHelmRetry)}
              onClick={() => {
                if (
                  kubeEtcdEnabled &&
                  !kubeEtcdEndpointsText
                    .split(/[\n,]+/)
                    .map((s) => s.trim())
                    .filter(Boolean).length
                ) {
                  toast.error("已启用 etcd 抓取，请先填写 Master IP（每行一个或逗号分隔）。");
                  return;
                }
                setConfirmOpen(true);
              }}
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              一键安装 / 升级 kube-prometheus-stack
            </Button>
            {lastValuesYaml ? (
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/90 p-3 dark:border-slate-700 dark:bg-slate-900/40">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium text-slate-800 dark:text-slate-200">本次渲染使用的 values.yaml（全量）</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => void navigator.clipboard.writeText(lastValuesYaml)}
                  >
                    复制
                  </Button>
                </div>
                <Textarea readOnly className="min-h-[220px] font-mono text-[11px]" value={lastValuesYaml} />
              </div>
            ) : null}
            <p className="text-[11px] text-slate-500">
              需要集群管理员级权限（CRD、ClusterRole 等）。本地开发请安装 helm 或设置 <code className="rounded bg-slate-100 px-0.5">HELM_BIN</code>；容器镜像需包含{" "}
              <code className="rounded bg-slate-100 px-0.5">/app/helm</code>（官方 Dockerfile 已内置）。
            </p>
          </div>
        ) : (
          <p className="text-xs text-slate-600">一键安装需要管理员。</p>
        )}

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认安装 kube-prometheus-stack？</AlertDialogTitle>
              <AlertDialogDescription className="space-y-2 text-slate-600">
                将向集群应用大量 CRD 与监控组件，命名空间 <span className="font-mono">kube-bt-sync-monitoring</span>。
                {kubeEtcdEnabled ? (
                  <span className="block rounded border border-sky-200 bg-sky-50 px-2 py-1.5 text-xs text-sky-950">
                    已勾选 <strong>kubeEtcd</strong>：将把填写的 Master IP 写入 Helm values，与手动改 values 后{" "}
                    <span className="font-mono">helm upgrade</span> 效果一致（本平台用 helm template + apply 重新下发）。
                  </span>
                ) : null}
                {autoSwitchProm ? (
                  <span className="block">
                    安装后会尝试将 <strong>prometheusUrlK8s</strong> 设为集群内 Service 地址；集群外运行的控制台若无法访问 .svc，请随后手动改为可达 URL。
                  </span>
                ) : null}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel type="button">取消</AlertDialogCancel>
              <AlertDialogAction type="button" onClick={() => void runInstall()}>
                确定安装
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
};

export default ClusterK8sKubePrometheusStackSection;

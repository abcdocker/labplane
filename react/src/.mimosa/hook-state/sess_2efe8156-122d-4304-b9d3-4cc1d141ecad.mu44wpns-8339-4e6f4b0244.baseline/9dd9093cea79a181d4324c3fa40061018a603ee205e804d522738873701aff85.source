import React, { useMemo, useState } from "react";
import { useAppConfig, APP_CONFIG_QUERY_KEY } from "@/hooks/use-app-config";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  apiGetJson,
  apiPostJson,
  apiPutJson,
  prometheusQueryApi,
  type AppConfig,
  type PrometheusDiscoverCandidate,
} from "@/lib/api";
import { extractErrorMessage } from "@/lib/extract-error-message";

type PromScopeStatus = {
  configured: boolean;
  urlHint: string;
  sourceOverride: boolean;
};

type PromStatus = {
  configured: boolean;
  urlHint: string;
  sourceEnv: boolean;
  sourceOverride: boolean;
  scopes?: {
    k8s?: PromScopeStatus;
    vcenter?: PromScopeStatus;
    cloud?: PromScopeStatus;
  };
};

type SettingsPrometheusSectionProps = {
  locale?: "zh" | "en";
};

const SettingsPrometheusSection: React.FC<SettingsPrometheusSectionProps> = ({
  locale = "zh",
}) => {
  const en = locale === "en";
  const queryClient = useQueryClient();
  const [promBase, setPromBase] = useState("");
  const [selectedDiscoverId, setSelectedDiscoverId] = useState<string>("");
  const [discoverScanDone, setDiscoverScanDone] = useState(false);
  const [promql, setPromql] = useState('up{job=~"kube-apiserver|apiserver"}');
  const [promResult, setPromResult] = useState<string | null>(null);
  const [promLoading, setPromLoading] = useState(false);
  const [promErr, setPromErr] = useState<string | null>(null);
  const [dsOpen, setDsOpen] = useState(false);
  const [vmBase, setVmBase] = useState("");
  const [dsSaving, setDsSaving] = useState(false);

  const cfgQ = useAppConfig();

  const promStatusQ = useQuery({
    queryKey: ["prometheus-status"],
    queryFn: ({ signal }) => apiGetJson<PromStatus>("/api/prometheus/status", { signal }),
  });

  const discoverQ = useQuery({
    queryKey: ["prometheus-discover"],
    queryFn: ({ signal }) =>
      apiGetJson<{ candidates: PrometheusDiscoverCandidate[] }>("/api/prometheus/discover", { signal }),
    enabled: false,
  });

  const cfg = cfgQ.data;
  const k8sOk = cfg?.k8sConfigured === true;

  const runPrometheus = async (q?: string) => {
    const query = (q ?? promql).trim();
    if (!query) return;
    setPromLoading(true);
    setPromErr(null);
    setPromResult(null);
    try {
      const data = await prometheusQueryApi("k8s", query);
      setPromResult(JSON.stringify(data, null, 2));
    } catch (e) {
      setPromErr(extractErrorMessage(e));
    } finally {
      setPromLoading(false);
    }
  };

  const savePrometheus = async () => {
    try {
      await apiPostJson("/api/prometheus/source", { baseUrl: promBase.trim(), scope: "k8s" });
      setPromBase("");
      setSelectedDiscoverId("");
      void queryClient.invalidateQueries({ queryKey: ["prometheus-status"] });
      void queryClient.invalidateQueries({ queryKey: APP_CONFIG_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ["runtime-status"] });
      void queryClient.invalidateQueries({ queryKey: ["cluster-prometheus-snapshot"] });
      setPromErr(null);
      toast.success(en ? "Saved (session override)." : "已保存（当前进程）");
    } catch (e) {
      const m = extractErrorMessage(e);
      setPromErr(m);
      toast.error(en ? `Save failed: ${m}` : `保存失败：${m}`);
    }
  };

  const loadDatasourceRuntime = async () => {
    const cur = await apiGetJson<Record<string, unknown>>("/api/settings/runtime");
    setPromBase(String(cur.prometheusUrlK8s ?? ""));
    setVmBase(String(cur.vmSelectUrlK8s ?? ""));
  };

  const persistPrometheusToRuntime = async () => {
    const url = promBase.trim();
    if (!url) {
      toast.error(en ? "Enter a base URL first." : "请先填写 Prometheus 地址");
      return;
    }
    try {
      const cur = await apiGetJson<Record<string, unknown>>("/api/settings/runtime");
      await apiPutJson("/api/settings/runtime", { ...cur, prometheusUrlK8s: url });
      await apiPostJson("/api/prometheus/source", { baseUrl: url, scope: "k8s" });
      void queryClient.invalidateQueries({ queryKey: ["prometheus-status"] });
      void queryClient.invalidateQueries({ queryKey: APP_CONFIG_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ["cluster-prometheus-snapshot"] });
      setPromErr(null);
      toast.success(en ? "Saved to runtime-config." : "已保存并写入运行时配置");
    } catch (e) {
      const m = extractErrorMessage(e);
      setPromErr(m);
      toast.error(en ? `Save failed: ${m}` : `保存失败：${m}`);
    }
  };

  const saveDatasourceDialog = async () => {
    const prom = promBase.trim();
    const vm = vmBase.trim();
    if (!prom && !vm) {
      toast.error(
        en ? "Enter at least one Prometheus or VictoriaMetrics base URL." : "请至少填写 Prometheus 或 VictoriaMetrics（vmselect）地址之一"
      );
      return;
    }
    setDsSaving(true);
    setPromErr(null);
    try {
      const cur = await apiGetJson<Record<string, unknown>>("/api/settings/runtime");
      await apiPutJson("/api/settings/runtime", { ...cur, prometheusUrlK8s: prom, vmSelectUrlK8s: vm });
      if (prom) {
        await apiPostJson("/api/prometheus/source", { baseUrl: prom, scope: "k8s" });
      }
      void queryClient.invalidateQueries({ queryKey: ["prometheus-status"] });
      void queryClient.invalidateQueries({ queryKey: APP_CONFIG_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ["cluster-prometheus-snapshot"] });
      setDsOpen(false);
      toast.success(en ? "Saved to runtime-config." : "已保存并写入运行时配置");
    } catch (e) {
      const m = extractErrorMessage(e);
      setPromErr(m);
      toast.error(en ? `Save failed: ${m}` : `保存失败：${m}`);
    } finally {
      setDsSaving(false);
    }
  };

  const clearPrometheus = async () => {
    try {
      await apiPostJson("/api/prometheus/source", { baseUrl: "", scope: "k8s" });
      void queryClient.invalidateQueries({ queryKey: ["prometheus-status"] });
      void queryClient.invalidateQueries({ queryKey: APP_CONFIG_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ["runtime-status"] });
      toast.success(en ? "Override cleared." : "已清除进程内覆盖");
    } catch (e) {
      const m = extractErrorMessage(e);
      setPromErr(m);
      toast.error(en ? `Failed: ${m}` : `操作失败：${m}`);
    }
  };

  const runDiscover = () => {
    void discoverQ.refetch().then((res) => {
      setDiscoverScanDone(true);
      const first = res.data?.candidates?.[0];
      if (first) {
        setSelectedDiscoverId(first.id);
        setPromBase(first.baseUrl);
      } else {
        setSelectedDiscoverId("");
      }
    });
  };

  const presets = useMemo(
    () => [
      {
        label: en ? "up (targets)" : "up（组件存活）",
        q: "up",
      },
      {
        label: en ? "kube-apiserver request rate" : "kube-apiserver 请求速率",
        q: "sum(rate(apiserver_request_total[5m]))",
      },
      { label: "etcd leader", q: "etcd_server_has_leader" },
      {
        label: en ? "Pods by phase" : "Pod 按阶段",
        q: "sum by (phase) (kube_pod_status_phase)",
      },
      {
        label: en ? "Node Ready" : "Node Ready",
        q: 'kube_node_status_condition{condition="Ready",status="true"}',
      },
    ],
    [en]
  );

  const candidates = discoverQ.data?.candidates ?? [];

  const k8sScope = promStatusQ.data?.scopes?.k8s;
  const k8sConfigured = k8sScope?.configured ?? promStatusQ.data?.configured;
  const k8sUrlHint = k8sScope?.urlHint ?? promStatusQ.data?.urlHint;

  return (
    <div className="mb-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-bold text-slate-900">
            {en ? "Kubernetes monitoring (Prometheus · VM)" : "Kubernetes 监控（Prometheus · VM）"}
          </h2>
          <span
            className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-800"
            title="VictoriaMetrics 的查询入口 vmselect，与 Prometheus 兼容 /api/v1/query"
          >
            VM
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {en ? (
            <>
              Prometheus: <code className="text-[11px]">prometheusUrlK8s</code> / env{" "}
              <code className="text-[11px]">PROMETHEUS_URL_K8S</code> / fallback{" "}
              <code className="text-[11px]">PROMETHEUS_URL</code>. Optional VictoriaMetrics:{" "}
              <code className="text-[11px]">vmSelectUrlK8s</code> or <code className="text-[11px]">VM_SELECT_URL_K8S</code>{" "}
              (takes precedence). vCenter / cloud: vCenter settings.
            </>
          ) : (
            <>
              Prometheus 对应 <code className="text-[11px]">prometheusUrlK8s</code> 或{" "}
              <code className="text-[11px]">PROMETHEUS_URL_K8S</code>，未填时兜底 <code className="text-[11px]">prometheusUrl</code>。
              可选 VM：<code className="text-[11px]">vmSelectUrlK8s</code> / <code className="text-[11px]">VM_SELECT_URL_K8S</code>（优先）。
              vCenter / 公有云见「vCenter 设置」。
            </>
          )}
        </p>
        <p className="mt-2 rounded-lg border border-slate-200/80 bg-white/80 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
          <span className="font-medium text-slate-800">中文说明：</span>
          「VM」表示 VictoriaMetrics 的 <strong>vmselect</strong> 根地址（与 Prometheus 一样走{" "}
          <code className="rounded bg-slate-100 px-0.5">/api/v1/query</code>）。在「监控数据源」对话框或运行时字段{" "}
          <code className="rounded bg-slate-100 px-0.5">vmSelectUrlK8s</code> 中填写后，K8s 侧监控查询会<strong>优先</strong>走
          vmselect；留空则仍使用上方 Prometheus 地址。
        </p>
      </div>
      <div className="space-y-6 p-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base">
                  {en ? "Prometheus base URL" : "Prometheus 地址"}
                </CardTitle>
                <span
                  className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600"
                  title="VictoriaMetrics vmselect：在「监控数据源」中配置 vmSelectUrlK8s"
                >
                  + VM
                </span>
              </div>
              <CardDescription>
                {en ? (
                  <>
                    Scope <code className="text-xs">k8s</code>. Persist writes <code className="text-xs">prometheusUrlK8s</code>{" "}
                    to runtime-config. Use the button below for optional <code className="text-xs">vmSelectUrlK8s</code>.
                  </>
                ) : (
                  <>
                    后端 <code className="text-xs">scope=k8s</code>；「保存并写入 runtime」写入{" "}
                    <code className="text-xs">prometheusUrlK8s</code>。可选的 VictoriaMetrics 请点下方「监控数据源」一并配置{" "}
                    <code className="text-xs">vmSelectUrlK8s</code>。
                  </>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-slate-600">
                {en ? "K8s scope:" : "K8s 数据源："}
                {k8sConfigured ? (en ? " configured" : "已配置") : en ? " not set" : "未配置"}{" "}
                {k8sUrlHint ? `（${k8sUrlHint}）` : ""}
              </p>
              {cfg?.vmSelectUrlK8sHint ? (
                <p className="text-xs text-slate-600">
                  {en ? "VictoriaMetrics (vmselect) field: " : "已填写 vmselect（vmSelectUrlK8s）："}
                  <span className="font-mono">{cfg.vmSelectUrlK8sHint}</span>
                  {en ? " (takes precedence over Prometheus URL)" : "（查询时优先于 prometheusUrlK8s）"}
                </p>
              ) : null}
              {cfg?.prometheusHasBearer && (
                <p className="text-xs text-amber-700">
                  {en
                    ? "Bearer token enabled (PROMETHEUS_BEARER_TOKEN)"
                    : "已启用服务端 Bearer（PROMETHEUS_BEARER_TOKEN）"}
                </p>
              )}

              <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label className="text-sm">
                    {en ? "Discover in cluster (Kubernetes Services)" : "集群内服务发现"}
                  </Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={!k8sOk || discoverQ.isFetching}
                    onClick={() => runDiscover()}
                  >
                    {discoverQ.isFetching ? (
                      <>
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                        {en ? "Scanning…" : "扫描中…"}
                      </>
                    ) : en ? (
                      "Scan cluster"
                    ) : (
                      "扫描 Service"
                    )}
                  </Button>
                </div>
                {!k8sOk && (
                  <p className="text-xs text-amber-800">
                    {en
                      ? "Connect Kubernetes first (Cluster settings → K8s)."
                      : "请先配置 Kubernetes 连接后再扫描。"}
                  </p>
                )}
                {discoverQ.isError && (
                  <p className="text-xs text-red-600">{extractErrorMessage(discoverQ.error)}</p>
                )}
                {candidates.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs text-slate-600">
                      {en ? "Pick a candidate (HTTP base URL)" : "选择候选（HTTP 基址）"}
                    </Label>
                    <Select
                      value={selectedDiscoverId || undefined}
                      onValueChange={(id) => {
                        setSelectedDiscoverId(id);
                        const c = candidates.find((x) => x.id === id);
                        if (c) setPromBase(c.baseUrl);
                      }}
                    >
                      <SelectTrigger className="bg-white text-left font-mono text-xs">
                        <SelectValue placeholder={en ? "Select…" : "请选择…"} />
                      </SelectTrigger>
                      <SelectContent>
                        {candidates.map((c) => (
                          <SelectItem key={c.id} value={c.id} className="font-mono text-xs">
                            {c.namespace}/{c.name}:{c.port} — {c.baseUrl}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-slate-500">
                      {en ? "Heuristic match on name/port; verify TLS if needed." : "按名称与端口启发式匹配；若需 HTTPS 请手动改。"}
                    </p>
                  </div>
                )}
                {discoverScanDone && !discoverQ.isFetching && candidates.length === 0 && (
                  <p className="text-xs text-slate-500">
                    {en ? "No Prometheus-like Services found." : "未发现疑似 Prometheus 的 Service。"}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>
                  {en ? "Base URL (scheme + host + port)" : "自定义 Base URL（含协议与端口）"}
                </Label>
                <Input
                  placeholder="http://prometheus-k8s.monitoring.svc:9090"
                  className="font-mono text-xs"
                  value={promBase}
                  onChange={(e) => setPromBase(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {cfg?.setupInitialized && (
                  <Button type="button" size="sm" variant="secondary" onClick={() => setDsOpen(true)}>
                    {en ? "Data source (Prometheus / VM)…" : "监控数据源（Prometheus / VictoriaMetrics）…"}
                  </Button>
                )}
                <Button type="button" size="sm" onClick={() => void savePrometheus()}>
                  {en ? "Save URL (session)" : "保存地址（进程内）"}
                </Button>
                {cfg?.setupInitialized && (
                  <Button
                    type="button"
                    size="sm"
                    variant="default"
                    onClick={() => void persistPrometheusToRuntime()}
                  >
                    {en ? "Save & persist (runtime-config)" : "保存并写入 runtime-config"}
                  </Button>
                )}
                <Button type="button" size="sm" variant="outline" onClick={() => void clearPrometheus()}>
                  {en ? "Clear override" : "清除覆盖"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Dialog
            open={dsOpen}
            onOpenChange={(open) => {
              setDsOpen(open);
              if (open) void loadDatasourceRuntime();
            }}
          >
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  {en ? "K8s monitoring data source" : "Kubernetes 监控数据源"}
                </DialogTitle>
                <DialogDescription>
                  {en ? (
                    <>
                      <code className="text-xs">vmSelectUrlK8s</code> is optional. When set, queries use VictoriaMetrics
                      (vmselect); otherwise <code className="text-xs">prometheusUrlK8s</code> is used.
                    </>
                  ) : (
                    <>
                      可选字段 <code className="text-xs">vmSelectUrlK8s</code>（vmselect 根地址）。填写后监控查询优先走
                      VictoriaMetrics；留空则使用 <code className="text-xs">prometheusUrlK8s</code>。
                    </>
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 py-2">
                <div className="space-y-2">
                  <Label className="text-sm">
                    {en ? "Prometheus base URL" : "Prometheus 根地址（prometheusUrlK8s）"}
                  </Label>
                  <Input
                    placeholder="http://prometheus-k8s.monitoring.svc:9090"
                    className="font-mono text-xs"
                    value={promBase}
                    onChange={(e) => setPromBase(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">
                    {en ? "VictoriaMetrics vmselect (optional)" : "VictoriaMetrics vmselect（可选，vmSelectUrlK8s）"}
                  </Label>
                  <Input
                    placeholder="http://vmselect.monitoring.svc:8481"
                    className="font-mono text-xs"
                    value={vmBase}
                    onChange={(e) => setVmBase(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => setDsOpen(false)}>
                  {en ? "Cancel" : "取消"}
                </Button>
                <Button type="button" disabled={dsSaving} onClick={() => void saveDatasourceDialog()}>
                  {dsSaving ? (en ? "Saving…" : "保存中…") : en ? "Save to runtime-config" : "保存到 runtime-config"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Card>
            <CardHeader>
              <CardTitle>PromQL</CardTitle>
              <CardDescription>
                {en ? (
                  <>
                    Proxied to <code className="text-xs">/api/v1/query</code>
                  </>
                ) : (
                  <>经后端代理到 <code className="text-xs">/api/v1/query</code></>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {presets.map((p) => (
                  <Button
                    key={p.label}
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="text-xs"
                    onClick={() => {
                      setPromql(p.q);
                      void runPrometheus(p.q);
                    }}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
              <Textarea
                className="min-h-[100px] font-mono text-xs"
                value={promql}
                onChange={(e) => setPromql(e.target.value)}
              />
              <Button type="button" disabled={promLoading} onClick={() => void runPrometheus()}>
                {promLoading ? (en ? "Running…" : "查询中…") : en ? "Run" : "执行"}
              </Button>
              {promErr && <p className="text-sm text-red-600">{promErr}</p>}
              {promResult && (
                <pre className="max-h-[360px] overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
                  {promResult}
                </pre>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default SettingsPrometheusSection;

import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { apiGetJson, apiPutJson, ApiHttpError, prometheusQueryRangeApi } from "@/lib/api";
import { useAuth } from "@/auth/auth-context";
import { toast } from "sonner";
import {
  OPS_MONITORING_PRESETS,
  presetCategoriesForScope,
  type MonitoringDataScope,
  type OpsMonitoringPreset,
} from "./opsMonitoringPresets";
import {
  promFirstSeriesLineData,
  promMatrixToWideRows,
  stepForRangeMinutes,
} from "./opsMonitoringChartHelpers";

const ALL_CATEGORY = "全部";
const CUSTOM_FALLBACK_CATEGORY = "自定义";

type OpsMonitoringCustomPanel = {
  id: string;
  title: string;
  category: string;
  promql: string;
  scope: "k8s" | "vcenter" | "inherit";
  display: "single" | "matrix";
  labelKeys?: string[];
};

type UnifiedPanel =
  | (OpsMonitoringPreset & { source: "preset" })
  | (OpsMonitoringCustomPanel & { source: "custom" });

function effectiveDataScope(scopeField: string, pageScope: MonitoringDataScope): MonitoringDataScope {
  if (scopeField === "vcenter") return "vcenter";
  if (scopeField === "k8s") return "k8s";
  return pageScope;
}

function customCategoryLabel(c: OpsMonitoringCustomPanel): string {
  const t = (c.category || "").trim();
  return t || CUSTOM_FALLBACK_CATEGORY;
}

const CHART_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#ca8a04", "#9333ea", "#0891b2", "#db2777", "#4f46e5"];

const GIB = 1024 ** 3;

function formatMonitoringAxisG(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  const d = a >= 100 ? 1 : a >= 10 ? 2 : 3;
  return `${v.toFixed(d)} G`;
}

function panelUsesBytesGib(p: UnifiedPanel): boolean {
  return p.source === "preset" && p.display === "single" && p.valueFormat === "bytes_gib";
}

export default function AiInspectMonitoring() {
  const qc = useQueryClient();
  const { status } = useAuth();
  const isAdmin = status?.role === "admin";

  const [pageScope, setPageScope] = useState<MonitoringDataScope>("k8s");
  const [category, setCategory] = useState<string>(ALL_CATEGORY);
  const [rangeMinutes, setRangeMinutes] = useState<60 | 360 | 1440 | 4320 | 10080>(360);

  const [addOpen, setAddOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newPromql, setNewPromql] = useState("");
  const [newScope, setNewScope] = useState<"k8s" | "vcenter" | "inherit">("inherit");
  const [newDisplay, setNewDisplay] = useState<"single" | "matrix">("single");
  const [newLabelKeys, setNewLabelKeys] = useState("");

  const promStatusQ = useQuery({
    queryKey: ["prometheus-status"],
    queryFn: ({ signal }) =>
      apiGetJson<{
        scopes?: { k8s?: { configured?: boolean }; vcenter?: { configured?: boolean } };
      }>("/api/prometheus/status", { signal }),
  });

  const customQ = useQuery({
    queryKey: ["ops-monitoring-panels"],
    queryFn: ({ signal }) => apiGetJson<{ panels: OpsMonitoringCustomPanel[] }>("/api/ops/monitoring/panels", { signal }),
  });

  const categoryOptions = useMemo(() => {
    const presetCats = presetCategoriesForScope(pageScope);
    const customCats = new Set<string>();
    for (const p of customQ.data?.panels ?? []) {
      if (effectiveDataScope(p.scope, pageScope) === pageScope) {
        customCats.add(customCategoryLabel(p));
      }
    }
    const merged = [ALL_CATEGORY, ...presetCats, ...Array.from(customCats).sort((a, b) => a.localeCompare(b, "zh-CN"))];
    return Array.from(new Set(merged));
  }, [pageScope, customQ.data?.panels]);

  React.useEffect(() => {
    if (!categoryOptions.includes(category)) {
      setCategory(ALL_CATEGORY);
    }
  }, [categoryOptions, category]);

  const unifiedPanels: UnifiedPanel[] = useMemo(() => {
    const custom = customQ.data?.panels ?? [];
    const presets: UnifiedPanel[] = OPS_MONITORING_PRESETS.filter((p) => p.scope === pageScope).map((p) => ({
      ...p,
      source: "preset" as const,
    }));
    const customs: UnifiedPanel[] = custom
      .filter((c) => effectiveDataScope(c.scope, pageScope) === pageScope)
      .map((c) => ({ ...c, source: "custom" as const }));
    const all = [...presets, ...customs];
    if (category === ALL_CATEGORY) return all;
    return all.filter((p) => {
      if (p.source === "preset") return p.category === category;
      return customCategoryLabel(p) === category;
    });
  }, [pageScope, category, customQ.data?.panels]);

  const chartQ = useQuery({
    queryKey: [
      "ops-monitoring-charts",
      pageScope,
      category,
      rangeMinutes,
      unifiedPanels.map((p) => `${p.id}:${p.promql}`).join("|"),
    ],
    queryFn: async ({ signal }) => {
      const end = Math.floor(Date.now() / 1000);
      const start = end - rangeMinutes * 60;
      const step = stepForRangeMinutes(rangeMinutes);
      const rows: { panel: UnifiedPanel; data: unknown; usedScope: MonitoringDataScope }[] = [];
      for (const p of unifiedPanels) {
        const ds = p.source === "preset" ? p.scope : effectiveDataScope(p.scope, pageScope);
        try {
          const data = await prometheusQueryRangeApi(ds, p.promql, start, end, step);
          rows.push({ panel: p, data, usedScope: ds });
        } catch {
          rows.push({ panel: p, data: null, usedScope: ds });
        }
      }
      return rows;
    },
    enabled: unifiedPanels.length > 0,
  });

  const savePanelsMut = useMutation({
    mutationFn: (panels: OpsMonitoringCustomPanel[]) => apiPutJson("/api/ops/monitoring/panels", { panels }),
    onSuccess: () => {
      toast.success("已保存自定义图表");
      void qc.invalidateQueries({ queryKey: ["ops-monitoring-panels"] });
      setAddOpen(false);
      setNewTitle("");
      setNewCategory("");
      setNewPromql("");
      setNewScope("inherit");
      setNewDisplay("single");
      setNewLabelKeys("");
    },
    onError: (e) => toast.error(e instanceof ApiHttpError ? e.serverMessage : String(e)),
  });

  const deletePanel = (id: string) => {
    const cur = customQ.data?.panels ?? [];
    savePanelsMut.mutate(cur.filter((x) => x.id !== id));
  };

  const submitNewPanel = () => {
    const title = newTitle.trim();
    const promql = newPromql.trim();
    if (!title || !promql) {
      toast.error("请填写标题与 PromQL");
      return;
    }
    const labelKeys = newLabelKeys
      .split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const next: OpsMonitoringCustomPanel = {
      id: crypto.randomUUID(),
      title,
      category: newCategory.trim(),
      promql,
      scope: newScope,
      display: newDisplay,
      labelKeys: labelKeys.length ? labelKeys : undefined,
    };
    const cur = customQ.data?.panels ?? [];
    savePanelsMut.mutate([...cur, next]);
  };

  const k8sOk = promStatusQ.data?.scopes?.k8s?.configured === true;
  const vcOk = promStatusQ.data?.scopes?.vcenter?.configured === true;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">监控中心</h1>
        <p className="mt-1 text-sm text-slate-600">
          使用已在<strong>集群设置</strong>与<strong>vCenter 设置</strong>中配置的 Prometheus / VictoriaMetrics（vmselect）数据源，通过{" "}
          <code className="rounded bg-slate-100 px-1">query_range</code> 直接绘图；内置常用 PromQL 分类展示，也可添加自定义图。不再依赖 Grafana
          看板同步。
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end">
          <div className="space-y-2">
            <Label>数据源（scope）</Label>
            <Select value={pageScope} onValueChange={(v) => setPageScope(v as MonitoringDataScope)}>
              <SelectTrigger className="w-[260px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="k8s">Kubernetes Prometheus / VM</SelectItem>
                <SelectItem value="vcenter">vCenter Prometheus / VM</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>分类</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categoryOptions.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>时间范围</Label>
            <Select value={String(rangeMinutes)} onValueChange={(v) => setRangeMinutes(Number(v) as typeof rangeMinutes)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="60">最近 1 小时</SelectItem>
                <SelectItem value="360">最近 6 小时</SelectItem>
                <SelectItem value="1440">最近 24 小时</SelectItem>
                <SelectItem value="4320">最近 3 天</SelectItem>
                <SelectItem value="10080">最近 7 天</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          当前 scope 数据源状态：
          {pageScope === "k8s" ? (
            <span className={k8sOk ? " text-emerald-700" : " text-amber-800"}>
              {k8sOk ? " Kubernetes 已配置" : " Kubernetes 未配置或不可达（请到集群设置填写 prometheusUrlK8s / vmSelectUrlK8s）"}
            </span>
          ) : (
            <span className={vcOk ? " text-emerald-700" : " text-amber-800"}>
              {vcOk ? " vCenter 已配置" : " vCenter 未配置（请到 vCenter 设置填写 prometheusUrlVcenter）"}
            </span>
          )}
        </p>
      </section>

      {isAdmin ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">自定义 PromQL 图</h2>
              <p className="mt-1 text-xs text-slate-500">保存至平台存储，与内置预设一并按分类、数据源展示；最多 48 条。</p>
            </div>
            <Sheet open={addOpen} onOpenChange={setAddOpen}>
              <SheetTrigger asChild>
                <Button type="button" variant="secondary" size="sm">
                  <Plus className="mr-1 h-4 w-4" />
                  添加图表
                </Button>
              </SheetTrigger>
              <SheetContent className="w-full overflow-y-auto sm:max-w-md">
                <SheetHeader>
                  <SheetTitle>添加自定义图</SheetTitle>
                </SheetHeader>
                <div className="mt-6 space-y-4 px-1">
                  <div className="space-y-2">
                    <Label>标题</Label>
                    <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="例如：Ingress 5xx 速率" />
                  </div>
                  <div className="space-y-2">
                    <Label>分类（可选）</Label>
                    <Input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="留空归入「自定义」" />
                  </div>
                  <div className="space-y-2">
                    <Label>查询使用的数据源</Label>
                    <Select value={newScope} onValueChange={(v) => setNewScope(v as typeof newScope)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="inherit">跟随页面上方所选 scope</SelectItem>
                        <SelectItem value="k8s">固定 Kubernetes</SelectItem>
                        <SelectItem value="vcenter">固定 vCenter</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>展示</Label>
                    <Select value={newDisplay} onValueChange={(v) => setNewDisplay(v as typeof newDisplay)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="single">单序列（取第一条时间序列）</SelectItem>
                        <SelectItem value="matrix">多序列（按标签拆线）</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>序列标签优先级（可选，逗号分隔）</Label>
                    <Input
                      value={newLabelKeys}
                      onChange={(e) => setNewLabelKeys(e.target.value)}
                      placeholder="namespace, pod, host_name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>PromQL</Label>
                    <Textarea
                      value={newPromql}
                      onChange={(e) => setNewPromql(e.target.value)}
                      className="min-h-[120px] font-mono text-xs"
                      placeholder={'sum(rate(http_requests_total[5m]))'}
                    />
                  </div>
                  <Button type="button" onClick={submitNewPanel} disabled={savePanelsMut.isPending}>
                    保存到平台
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
          {(customQ.data?.panels?.length ?? 0) > 0 ? (
            <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-100">
              {(customQ.data?.panels ?? []).map((p) => (
                <li key={p.id} className="flex flex-col gap-2 px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <span className="font-medium text-slate-800">{p.title}</span>
                    <span className="ml-2 text-xs text-slate-500">
                      {customCategoryLabel(p)} · {p.scope === "inherit" ? "跟随页面" : p.scope} · {p.display}
                    </span>
                    <p className="mt-1 font-mono text-[11px] text-slate-500 break-all">{p.promql}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-red-600 hover:text-red-700"
                    onClick={() => deletePanel(p.id)}
                    disabled={savePanelsMut.isPending}
                    aria-label="删除"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-500">暂无自定义图。</p>
          )}
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {!unifiedPanels.length ? (
          <p className="text-sm text-slate-500">当前分类下没有图表，请切换「分类」或添加自定义图。</p>
        ) : chartQ.isLoading ? (
          <p className="text-sm text-slate-500">正在查询 Prometheus…</p>
        ) : (
          <div className="space-y-10">
            {(chartQ.data ?? []).map((row, idx) => {
              const p = row.panel;
              const title = p.title;
              const isMatrix = p.display === "matrix";
              const useGib = panelUsesBytesGib(p);
              const matrixRows = isMatrix && row.data ? promMatrixToWideRows(row.data, p.labelKeys) : [];
              const singleChartRaw = !isMatrix && row.data ? promFirstSeriesLineData(row.data) : [];
              const singleChart = useGib
                ? singleChartRaw.map((pt) => ({ ...pt, v: pt.v / GIB }))
                : singleChartRaw;
              const seriesKeys =
                matrixRows.length > 0
                  ? Object.keys(matrixRows[0] ?? {}).filter((k) => k !== "t")
                  : [];

              return (
                <div key={`${p.id}-${idx}`} className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{title}</p>
                      <p className="text-[11px] text-slate-500">
                        {p.source === "preset" ? "内置" : "自定义"} · 分类：{p.source === "preset" ? p.category : customCategoryLabel(p)} · 查询
                        scope：<span className="font-mono">{row.usedScope}</span>
                      </p>
                    </div>
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-slate-500 break-all">{p.promql}</p>
                  {useGib ? (
                    <p className="mt-1 text-[11px] text-slate-600">
                      纵轴与悬浮提示为 <strong>GiB</strong>（显示后缀 <span className="font-mono">G</span>，1G = 1024³
                      字节）；PromQL 仍为原始字节查询，便于与告警阈值（字节）对齐。
                    </p>
                  ) : null}
                  {isMatrix ? (
                    matrixRows.length === 0 || seriesKeys.length === 0 ? (
                      <p className="mt-3 text-xs text-amber-800">无数据或查询失败（请确认指标与标签是否存在）。</p>
                    ) : (
                      <div className="mt-4 h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={matrixRows}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis
                              dataKey="t"
                              tick={{ fontSize: 9 }}
                              tickFormatter={(iso) => {
                                try {
                                  return new Date(iso).toLocaleString("zh-CN", {
                                    month: "numeric",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  });
                                } catch {
                                  return String(iso);
                                }
                              }}
                            />
                            <YAxis tick={{ fontSize: 10 }} />
                            <Tooltip />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            {seriesKeys.map((k, i) => (
                              <Line
                                key={k}
                                type="monotone"
                                dataKey={k}
                                dot={false}
                                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                                strokeWidth={1.2}
                              />
                            ))}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )
                  ) : singleChart.length === 0 ? (
                    <p className="mt-3 text-xs text-amber-800">无数据或查询失败（请确认 PromQL 与数据源一致）。</p>
                  ) : (
                    <div className="mt-4 h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={singleChart}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="t" tick={{ fontSize: 10 }} />
                          <YAxis
                            tick={{ fontSize: 10 }}
                            tickFormatter={useGib ? (v) => formatMonitoringAxisG(Number(v)) : undefined}
                            label={
                              useGib
                                ? { value: "GiB (G)", angle: -90, position: "insideLeft", style: { fontSize: 10, fill: "#64748b" } }
                                : undefined
                            }
                          />
                          <Tooltip
                            formatter={
                              useGib
                                ? (value: number | string) => [`${Number(value).toFixed(3)} G`, "working set"]
                                : undefined
                            }
                          />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="v"
                            name={useGib ? "GiB (G)" : "value"}
                            dot={false}
                            stroke="#2563eb"
                            strokeWidth={1.5}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

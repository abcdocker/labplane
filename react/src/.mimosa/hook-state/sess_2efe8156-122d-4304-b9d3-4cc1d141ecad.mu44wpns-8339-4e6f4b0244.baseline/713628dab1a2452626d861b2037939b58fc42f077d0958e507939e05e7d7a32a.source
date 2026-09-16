import React, { useCallback, useEffect, useState } from "react";
import { APP_CONFIG_QUERY_KEY } from "@/hooks/use-app-config";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCopy, Loader2, Save } from "lucide-react";
import { apiGetJson, apiPutJson, type RuntimeSettingsDTO } from "@/lib/api";
import { useAuth } from "@/auth/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

type VmLogDiscoverItem = {
  namespace: string;
  service: string;
  suggestedUrl: string;
  port: number;
  hint: string;
};

type VmLogDiscoverRes = {
  namespace: string;
  items: VmLogDiscoverItem[];
};

type VmLogNamespacesRes = {
  namespaces: string[];
};

const ClusterK8sVmLogSection: React.FC = () => {
  const { status } = useAuth();
  const isAdmin = status?.role === "admin";
  const qc = useQueryClient();
  const [form, setForm] = useState<RuntimeSettingsDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pickNs, setPickNs] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGetJson<RuntimeSettingsDTO>("/api/settings/runtime");
      setForm(data);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const nsQ = useQuery({
    queryKey: ["ops-vmlog-namespaces"],
    queryFn: ({ signal }) => apiGetJson<VmLogNamespacesRes>("/api/ops/vmlog/namespaces", { signal }),
    retry: 1,
  });

  const discQ = useQuery({
    queryKey: ["ops-vmlog-discover", pickNs],
    queryFn: ({ signal }) =>
      apiGetJson<VmLogDiscoverRes>(`/api/ops/vmlog/discover?namespace=${encodeURIComponent(pickNs)}`, { signal }),
    enabled: pickNs.trim() !== "",
    retry: 1,
  });

  const victoriaUrl = String(form?.victoriaLogsUrl ?? "").trim();
  const retentionDays = Number(form?.victoriaLogsRetentionDays ?? 180) || 180;

  const onSave = async () => {
    if (!form || !isAdmin) return;
    setSaving(true);
    try {
      const payload = { ...form } as Record<string, unknown>;
      await apiPutJson("/api/settings/runtime", payload);
      toast.success("已保存 VictoriaLogs 地址");
      void qc.invalidateQueries({ queryKey: APP_CONFIG_QUERY_KEY });
      void qc.invalidateQueries({ queryKey: ["runtime-status"] });
      void qc.invalidateQueries({ queryKey: ["ops-vmlog-status"] });
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const copyUrl = async (t: string) => {
    try {
      await navigator.clipboard.writeText(t);
      toast.success("已复制 URL");
    } catch {
      toast.error("复制失败");
    }
  };

  const applyUrl = (u: string) => {
    setForm((prev) => (prev ? { ...prev, victoriaLogsUrl: u } : prev));
    toast.message("已填入地址，请点击保存");
  };

  const namespaces = nsQ.data?.namespaces ?? [];

  return (
    <Card className="border-cyan-200/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">VictoriaLogs（VMLog）</CardTitle>
        <CardDescription>
          供「AI 巡检 → 日志查询」使用：选择命名空间后自动发现疑似 VictoriaLogs 的 Service，一键填入内网根地址（端口多为 9428）。亦可手动填写 Helm release 的 Service
          URL。环境变量 <code className="font-mono text-xs">VICTORIA_LOGS_URL</code> 与此处运行时字段合并，运行时优先。默认保留{" "}
          <strong>180</strong> 天用于本页时间窗上限；请在 Helm 中为 VL 配置实际 retention。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        {loading ? (
          <div className="flex items-center gap-2 text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载运行时…
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label className="text-xs">victoriaLogsUrl（HTTP 根地址，无路径尾缀）</Label>
              <Input
                className="font-mono text-xs"
                placeholder="http://victoria-logs-single.monitoring.svc:9428"
                value={victoriaUrl}
                disabled={!isAdmin}
                onChange={(e) => setForm((prev) => (prev ? { ...prev, victoriaLogsUrl: e.target.value } : prev))}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">victoriaLogsRetentionDays（目标保留天数，7–730，默认 180）</Label>
              <Input
                type="number"
                min={7}
                max={730}
                className="max-w-[200px] font-mono text-xs"
                value={retentionDays}
                disabled={!isAdmin}
                onChange={(e) =>
                  setForm((prev) =>
                    prev ? { ...prev, victoriaLogsRetentionDays: parseInt(e.target.value, 10) || 180 } : prev
                  )
                }
              />
              <p className="text-[11px] text-slate-600">
                控制「日志查询」页可选的最长时间窗；与 VictoriaLogs 服务端 retention 请保持一致，避免查超出实际保留的数据。
              </p>
            </div>

            <div className="rounded-lg border border-slate-200/90 bg-slate-50/60 p-4 space-y-3">
              <p className="text-xs font-semibold text-slate-800">按命名空间发现 Service</p>
              {nsQ.isLoading ? (
                <p className="text-xs text-slate-500">读取命名空间…</p>
              ) : nsQ.isError ? (
                <p className="text-xs text-amber-800">{(nsQ.error as Error).message}</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Kubernetes namespace</Label>
                    <Select value={pickNs || "__none__"} onValueChange={(v) => setPickNs(v === "__none__" ? "" : v)}>
                      <SelectTrigger className="font-mono text-xs">
                        <SelectValue placeholder="选择命名空间" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[280px]">
                        <SelectItem value="__none__">未选择</SelectItem>
                        {namespaces.map((n) => (
                          <SelectItem key={n} value={n}>
                            {n}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-[11px] text-slate-600 sm:pb-2">
                    仅列出名称或标签疑似 VictoriaLogs 的 Service；若 chart 命名特殊请手动填写上方 URL。
                  </p>
                </div>
              )}
              {pickNs && discQ.isFetching ? (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  探测 {pickNs} …
                </div>
              ) : null}
              {pickNs && discQ.data?.items?.length === 0 && !discQ.isFetching ? (
                <p className="text-xs text-slate-600">该命名空间下未发现名称含 victoria-logs / vmlog 或标签匹配的 Service。</p>
              ) : null}
              {discQ.data?.items && discQ.data.items.length > 0 ? (
                <ul className="space-y-2">
                  {discQ.data.items.map((it) => (
                    <li
                      key={`${it.namespace}/${it.service}`}
                      className="flex flex-col gap-2 rounded-md border border-white bg-white/90 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-mono text-xs text-slate-900">
                          {it.namespace}/{it.service}
                          <span className="ml-2 text-slate-500">:{it.port}</span>
                        </p>
                        <p className="text-[11px] text-slate-600">{it.hint}</p>
                        <p className="mt-1 font-mono text-[11px] text-cyan-900">{it.suggestedUrl}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="secondary" size="sm" disabled={!isAdmin} onClick={() => applyUrl(it.suggestedUrl)}>
                          填入地址
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => void copyUrl(it.suggestedUrl)}>
                          <ClipboardCopy className="mr-1 h-3.5 w-3.5" />
                          复制
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            {isAdmin ? (
              <Button type="button" disabled={saving} onClick={() => void onSave()}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                保存到运行时
              </Button>
            ) : (
              <p className="text-xs text-slate-500">仅管理员可修改并保存。</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default ClusterK8sVmLogSection;

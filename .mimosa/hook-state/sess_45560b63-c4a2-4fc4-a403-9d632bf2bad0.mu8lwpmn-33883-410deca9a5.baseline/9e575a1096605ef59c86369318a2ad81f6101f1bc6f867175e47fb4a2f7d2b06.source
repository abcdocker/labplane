import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Copy, Loader2, Play, RefreshCw, Terminal } from "lucide-react";
import { apiGetJson, apiPostJson, ApiHttpError } from "@/lib/api";
import { useAuth } from "@/auth/auth-context";
import { copyToClipboardSafe } from "@/lib/clipboard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { VCenterVMsResponse } from "@/pages/vcenter/types";

type VmLogStatusMinimal = {
  configured?: boolean;
  baseUrlHint?: string;
};

type VmLogCollectorProfile = {
  id: string;
  label: string;
  description: string;
  defaultPaths: string[];
  logSource: string;
  querySource: string;
  custom?: boolean;
};

type VmLogSourcesResponse = {
  collectorProfiles: VmLogCollectorProfile[];
};

const EMPTY_COLLECTOR_PROFILES: VmLogCollectorProfile[] = [];

function formatLocalDateTime(input?: string | number | Date | null): string {
  if (input == null || input === "") return "—";
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return String(input);
  return d.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function renderCacheProbeLabel(probe?: { cached?: boolean; status?: string; httpCode?: number; error?: string }) {
  if (!probe) return "未探测";
  if (probe.status === "cached") return "已缓存";
  if (probe.status === "missing") return "未缓存";
  if (probe.status === "probe_error") return `探测失败${probe.httpCode ? ` (${probe.httpCode})` : ""}${probe.error ? `: ${probe.error}` : ""}`;
  return "未探测";
}

function cacheProbeBadgeClass(probe?: { cached?: boolean; status?: string }) {
  if (!probe) return "bg-slate-100 text-slate-700";
  if (probe.status === "cached") return "bg-emerald-100 text-emerald-900";
  if (probe.status === "missing") return "bg-red-100 text-red-900";
  if (probe.status === "probe_error") return "bg-amber-100 text-amber-900";
  return "bg-slate-100 text-slate-700";
}

type CloudHostRow = {
  id: string;
  name?: string;
  sshHost: string;
  sshPort?: number;
  sshUser?: string;
};

type VmShipperScriptRes = {
  victoriaLogsBase?: string;
  victoriaInsertHint?: string;
  vectorToml?: string;
  bashScript?: string;
  pathsUsed?: string[];
  vmHostField?: string;
  logSourceField?: string;
  vectorVersion?: string;
  vectorDownloadBaseUrl?: string;
  vectorPrimaryUrlAmd64?: string;
  vectorPrimaryUrlArm64?: string;
  vectorCacheProbe?: {
    amd64?: { url?: string; cached?: boolean; status?: string; httpCode?: number; error?: string };
    arm64?: { url?: string; cached?: boolean; status?: string; httpCode?: number; error?: string };
  };
  warning?: string;
  notes?: string[];
};

type VmShipperInspectState = {
  sshConnected?: boolean;
  currentUser?: string;
  currentUid?: number;
  sudoReady?: boolean;
  installed?: boolean;
  vectorVersion?: string;
  configExists?: boolean;
  serviceActive?: boolean;
  serviceEnabled?: boolean;
  serviceStateRaw?: string;
  enableStateRaw?: string;
  installPath?: string;
  configPath?: string;
  summary?: string;
  pathChecks?: { path: string; matchedCount: number; sample?: string }[];
};

type VmShipperInspectRes = {
  ok?: boolean;
  error?: string;
  warning?: string;
  logSource?: string;
  targetType?: string;
  targetId?: string;
  targetName?: string;
  inspect?: VmShipperInspectState;
};

type VmShipperApplyStartRes = {
  accepted?: boolean;
  taskId?: string;
  phase?: string;
  progress?: number;
  warning?: string;
  message?: string;
};

type VmShipperTaskRes = {
  taskId: string;
  phase: "pending" | "running" | "success" | "error";
  progress: number;
  stage?: string;
  message?: string;
  error?: string;
  output?: string;
  targetType?: string;
  targetId?: string;
  targetName?: string;
  paths?: string[];
  vmHost?: string;
  logSource?: string;
  startedAt?: string;
  finishedAt?: string;
  inspect?: VmShipperInspectState;
  verify?: {
    attempted?: boolean;
    ok?: boolean;
    query?: string;
    windowStart?: string;
    windowEnd?: string;
    checkedRows?: number;
    message?: string;
    sampleTime?: string;
    sampleMsg?: string;
    error?: string;
  };
};

type VmShipperEnabledItem = {
  key: string;
  targetName: string;
  vmHost: string;
  logSource: string;
  targetType?: string;
  pathCount: number;
  pathPreview: string[];
  vectorVersion?: string;
  serviceActive: boolean;
  verifyOk: boolean;
  finishedAt?: string;
};

/** 虚拟机 / 宝塔 → VictoriaLogs Vector 采集助手（原日志查询页内嵌块，现独立复用） */
export const VmLogShipperAssistant: React.FC = () => {
  const { status } = useAuth();
  const isAdmin = status?.role === "admin";

  const statusQ = useQuery({
    queryKey: ["ops-vmlog-status"],
    queryFn: ({ signal }) => apiGetJson<VmLogStatusMinimal>("/api/ops/vmlog/status", { signal }),
  });
  const st = statusQ.data;
  const sourcesQ = useQuery({
    queryKey: ["ops-vmlog-sources"],
    queryFn: ({ signal }) => apiGetJson<VmLogSourcesResponse>("/api/ops/vmlog/sources", { signal }),
  });
  const [shipperPreset, setShipperPreset] = useState("baota-nginx");
  const [shipperTarget, setShipperTarget] = useState<"cloud" | "vcenter">("cloud");
  const [shipperHostId, setShipperHostId] = useState("");
  const [shipperVcenterMoref, setShipperVcenterMoref] = useState("");
  const [shipperPaths, setShipperPaths] = useState("");
  const [shipperIncludeSystemLogs, setShipperIncludeSystemLogs] = useState(true);
  const [shipperVmLabel, setShipperVmLabel] = useState("");
  const [shipperVlOverride, setShipperVlOverride] = useState("");
  const [shipperOsUrl, setShipperOsUrl] = useState("");
  const [shipperOsIndexPrefix, setShipperOsIndexPrefix] = useState("kubebt-vmlog");
  const [shipperOsUser, setShipperOsUser] = useState("");
  const [shipperOsPassword, setShipperOsPassword] = useState("");
  const [shipperLogSrc, setShipperLogSrc] = useState("");
  const [shipperGen, setShipperGen] = useState<VmShipperScriptRes | null>(null);
  const [shipperInspect, setShipperInspect] = useState<VmShipperInspectRes | null>(null);
  const [shipperTaskId, setShipperTaskId] = useState("");
  const [shipperTaskNoticeAt, setShipperTaskNoticeAt] = useState("");
  const [shipperApplyDialogOpen, setShipperApplyDialogOpen] = useState(false);
  const collectorProfiles = sourcesQ.data?.collectorProfiles ?? EMPTY_COLLECTOR_PROFILES;
  const selectedProfile = collectorProfiles.find((profile) => profile.id === shipperPreset);
  const systemPaths = useMemo(
    () => collectorProfiles.find((profile) => profile.id === "system-common")?.defaultPaths ?? [],
    [collectorProfiles],
  );

  const cloudHostsQ = useQuery({
    queryKey: ["cloud-hosts-list"],
    queryFn: ({ signal }) => apiGetJson<{ hosts: CloudHostRow[] }>("/api/cloud-hosts", { signal }),
  });

  const vcenterVmsQ = useQuery({
    queryKey: ["vcenter-vms-vmlog-shipper"],
    queryFn: ({ signal }) => apiGetJson<VCenterVMsResponse>("/api/vcenter/vms", { signal }),
    retry: 1,
    staleTime: 60_000,
  });

  const buildShipperPayload = useCallback(() => {
    const lines = shipperPaths
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const mergedLogPaths = Array.from(
      new Set([...(shipperIncludeSystemLogs ? systemPaths : []), ...lines]),
    );
    const payload: Record<string, unknown> = {
      preset: shipperPreset,
      logPaths: mergedLogPaths,
      vmNameLabel: shipperVmLabel.trim(),
      victoriaLogsUrl: shipperVlOverride.trim(),
      logSourceOverride: shipperLogSrc.trim() || undefined,
    };
    const ou = shipperOsUrl.trim();
    if (ou) {
      payload.openSearchUrl = ou;
      const pfx = shipperOsIndexPrefix.trim();
      if (pfx) payload.openSearchIndexPrefix = pfx;
      const u = shipperOsUser.trim();
      if (u) payload.openSearchUser = u;
      const pw = shipperOsPassword.trim();
      if (pw) payload.openSearchPassword = pw;
    }
    if (shipperTarget === "cloud") {
      payload.cloudHostId = shipperHostId;
    } else {
      payload.vcenterVmMoref = shipperVcenterMoref;
    }
    return payload;
  }, [
    shipperHostId,
    shipperIncludeSystemLogs,
    shipperLogSrc,
    shipperOsIndexPrefix,
    shipperOsPassword,
    shipperOsUrl,
    shipperOsUser,
    shipperPaths,
    shipperPreset,
    shipperTarget,
    shipperVcenterMoref,
    shipperVlOverride,
    shipperVmLabel,
    systemPaths,
  ]);

  const shipperTaskQ = useQuery({
    queryKey: ["ops-vmlog-shipper-task", shipperTaskId],
    queryFn: ({ signal }) => apiGetJson<VmShipperTaskRes>(`/api/ops/vmlog/vm-shipper/tasks/${encodeURIComponent(shipperTaskId)}`, { signal }),
    enabled: !!shipperTaskId,
    refetchInterval: (q) => {
      const phase = q.state.data?.phase;
      return phase === "pending" || phase === "running" || !phase ? 1500 : false;
    },
    retry: 1,
  });
  const shipperTaskListQ = useQuery({
    queryKey: ["ops-vmlog-shipper-task-list"],
    queryFn: ({ signal }) => apiGetJson<{ tasks: VmShipperTaskRes[] }>("/api/ops/vmlog/vm-shipper/tasks?limit=8", { signal }),
    enabled: isAdmin,
    refetchInterval: 5000,
    retry: 1,
  });

  const shipperScriptMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPostJson<VmShipperScriptRes>("/api/ops/vmlog/vm-shipper/script", body),
    onSuccess: (data) => {
      setShipperGen(data);
      toast.success("已生成安装脚本与 Vector 配置");
      if (data.warning) toast.message(data.warning);
    },
    onError: (e) => toast.error(e instanceof ApiHttpError ? e.serverMessage : String(e)),
  });

  const shipperInspectMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPostJson<VmShipperInspectRes>("/api/ops/vmlog/vm-shipper/inspect", body),
    onSuccess: (data) => {
      setShipperInspect(data);
      if (data.warning) toast.message(data.warning);
      if (data.inspect?.serviceActive) {
        toast.success(data.inspect.summary || "采集服务运行中");
      } else {
        toast.message(data.inspect?.summary || "已完成状态检查");
      }
    },
    onError: (e) => {
      const msg = e instanceof ApiHttpError ? e.serverMessage : String(e);
      toast.error(msg);
    },
  });

  const shipperApplyMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPostJson<VmShipperApplyStartRes>("/api/ops/vmlog/vm-shipper/apply", body),
    onSuccess: (data) => {
      if (!data.taskId) {
        toast.error(data.message || "后台安装任务创建失败");
        return;
      }
      setShipperTaskId(data.taskId);
      setShipperTaskNoticeAt("");
      if (data.warning) toast.message(data.warning);
      toast.success(data.message || "后台安装任务已创建");
    },
    onError: (e) => toast.error(e instanceof ApiHttpError ? e.serverMessage : String(e)),
  });

  useEffect(() => {
    const doneAt = shipperTaskQ.data?.finishedAt;
    if (!doneAt || doneAt === shipperTaskNoticeAt) return;
    if (shipperTaskQ.data?.phase === "success") {
      toast.success(shipperTaskQ.data.message || "采集服务安装完成");
    } else if (shipperTaskQ.data?.phase === "error") {
      toast.error(shipperTaskQ.data.error || shipperTaskQ.data.message || "采集服务安装失败");
    }
    setShipperTaskNoticeAt(doneAt);
  }, [shipperTaskNoticeAt, shipperTaskQ.data]);

  useEffect(() => {
    if (shipperTaskId || !shipperTaskListQ.data?.tasks?.length) return;
    setShipperTaskId(shipperTaskListQ.data.tasks[0].taskId);
  }, [shipperTaskId, shipperTaskListQ.data]);

  const runShipperGenerate = () => {
    shipperScriptMut.mutate(buildShipperPayload());
  };

  const runShipperInspect = () => {
    if (shipperTarget === "cloud") {
      if (!shipperHostId) {
        toast.error("请选择云主机");
        return;
      }
    } else if (!shipperVcenterMoref) {
      toast.error("请选择 vCenter 虚拟机");
      return;
    }
    shipperInspectMut.mutate(buildShipperPayload());
  };

  const openShipperApplyDialog = () => {
    if (shipperTarget === "cloud") {
      if (!shipperHostId) {
        toast.error("请选择云主机");
        return;
      }
    } else if (!shipperVcenterMoref) {
      toast.error("请选择 vCenter 虚拟机");
      return;
    }
    setShipperApplyDialogOpen(true);
  };

  const confirmShipperApply = () => {
    setShipperApplyDialogOpen(false);
    setShipperInspect(null);
    shipperApplyMut.mutate(buildShipperPayload());
  };

  const shipperTask = shipperTaskQ.data;
  const shipperInspectState = shipperTask?.inspect ?? shipperInspect?.inspect;
  const shipperBusy = shipperApplyMut.isPending || shipperTask?.phase === "pending" || shipperTask?.phase === "running";
  const enabledCollectors = useMemo<VmShipperEnabledItem[]>(() => {
    const tasks = shipperTaskListQ.data?.tasks ?? [];
    const picked = new Map<string, VmShipperEnabledItem>();
    for (const task of tasks) {
      const serviceActive = task.inspect?.serviceActive === true;
      const verifyOk = task.verify?.ok === true;
      if (!serviceActive && !verifyOk) continue;
      const key = `${task.targetType || "unknown"}:${task.targetId || task.targetName || task.vmHost || task.logSource || task.taskId}:${task.logSource || "-"}`;
      const candidate: VmShipperEnabledItem = {
        key,
        targetName: task.targetName || task.targetId || "未命名目标",
        vmHost: task.vmHost || "—",
        logSource: task.logSource || "—",
        targetType: task.targetType,
        pathCount: task.paths?.length ?? 0,
        pathPreview: (task.paths ?? []).slice(0, 3),
        vectorVersion: task.inspect?.vectorVersion,
        serviceActive,
        verifyOk,
        finishedAt: task.finishedAt,
      };
      const prev = picked.get(key);
      if (!prev) {
        picked.set(key, candidate);
        continue;
      }
      const prevAt = prev.finishedAt ? new Date(prev.finishedAt).getTime() : 0;
      const nextAt = candidate.finishedAt ? new Date(candidate.finishedAt).getTime() : 0;
      if (nextAt >= prevAt) picked.set(key, candidate);
    }
    return Array.from(picked.values()).sort((a, b) => {
      const ta = a.finishedAt ? new Date(a.finishedAt).getTime() : 0;
      const tb = b.finishedAt ? new Date(b.finishedAt).getTime() : 0;
      return tb - ta;
    });
  }, [shipperTaskListQ.data?.tasks]);

  return (
    <>
      <Card className="border-emerald-200/70 bg-gradient-to-br from-emerald-50/40 via-white to-slate-50/80">
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Terminal className="h-5 w-5 text-emerald-700" />
            虚拟机 / 宝塔日志 → VictoriaLogs 采集助手
          </CardTitle>
          <CardDescription className="text-xs leading-relaxed">
            选择<strong>预设</strong>或<strong>自定义路径</strong>，生成在 Linux 虚拟机安装{" "}
            <strong>Vector</strong> 的脚本（推送到 VL 的 <code className="rounded bg-white/80 px-1">/insert/jsonline</code>
            ，流字段 <code className="rounded bg-white/80 px-1">vm_host</code>、<code className="rounded bg-white/80 px-1">log_source</code>
            ）。远程安装使用<strong>云主机</strong>或<strong>vCenter 虚拟机</strong>上已保存的 SSH 凭据（与对应 SSH 终端一致）；详细说明见{" "}
            <Link
              className="font-medium text-emerald-800 underline-offset-2 hover:underline"
              to="/cluster/ai-inspect/logs"
              state={{ aiInspectLogsTab: "vcenter", aiInspectLogsIngestOpen: true }}
            >
              日志查询 → vCenter / 虚拟机采集说明
            </Link>
            。管理云主机：{" "}
            <Link className="font-medium text-emerald-800 underline-offset-2 hover:underline" to="/cluster/vcenter/cloud">
              vCenter → 云主机
            </Link>
            。安装任务现在会在后台执行，并返回安装进度、失败原因、目标状态检查结果。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">日志预设</Label>
              <Select value={shipperPreset} onValueChange={setShipperPreset}>
                <SelectTrigger className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {collectorProfiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-slate-500">
                {selectedProfile
                  ? `${selectedProfile.description}${selectedProfile.defaultPaths.length ? ` · ${selectedProfile.defaultPaths.join("、")}` : ""}`
                  : "正在加载采集模板…"}
              </p>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs">额外日志路径（可选，每行一个；与预设合并）</Label>
              <Textarea
                className="min-h-[72px] font-mono text-xs"
                placeholder={shipperPreset === "custom" ? "/var/log/secure\n/www/wwwlogs/mysite.log" : "留空则仅使用预设路径；可追加如 /var/log/messages"}
                value={shipperPaths}
                onChange={(e) => setShipperPaths(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">默认附带系统日志</Label>
              <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                <div className="min-w-0 flex-1 text-[11px] leading-relaxed text-slate-600 break-words [overflow-wrap:anywhere]">
                  默认附带 CentOS / Ubuntu 常见系统日志：<code className="rounded bg-white px-1">/var/log/messages</code>、
                  <code className="rounded bg-white px-1">/var/log/secure</code>、
                  <code className="rounded bg-white px-1">/var/log/syslog</code>、
                  <code className="rounded bg-white px-1">/var/log/auth.log</code> 等。
                </div>
                <div className="flex shrink-0 justify-end sm:pt-0.5">
                  <Switch checked={shipperIncludeSystemLogs} onCheckedChange={(v) => setShipperIncludeSystemLogs(Boolean(v))} />
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">VictoriaLogs 根地址（虚拟机可达）</Label>
              <Input
                className="font-mono text-xs"
                placeholder={st?.baseUrlHint ? `默认：${st.baseUrlHint}` : "http://节点IP:NodePort 或内网 LB:9428"}
                value={shipperVlOverride}
                onChange={(e) => setShipperVlOverride(e.target.value)}
              />
              <p className="text-[11px] text-slate-500">留空则用运行时配置；含 .svc.cluster.local 时助手会提示不可达虚拟机。</p>
            </div>
            <div className="space-y-1.5 md:col-span-2 rounded-lg border border-indigo-100 bg-indigo-50/40 px-3 py-2.5">
              <p className="text-[11px] font-medium text-indigo-950">OpenSearch 双写（可选，Vector elasticsearch/opensearch sink）</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                填写后除 VictoriaLogs 外，同步写入 OpenSearch；索引名默认为{" "}
                <code className="rounded bg-white px-1">{`{前缀}-年-月-日`}</code>。虚拟机侧须填{" "}
                <strong>NodePort / LB 等可解析地址</strong>，不要使用 .svc 集群内域名。
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">OpenSearch HTTP 根地址</Label>
                  <Input
                    className="font-mono text-xs"
                    placeholder="http://节点IP:32000"
                    value={shipperOsUrl}
                    onChange={(e) => setShipperOsUrl(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">索引前缀</Label>
                  <Input
                    className="font-mono text-xs"
                    placeholder="kubebt-vmlog"
                    value={shipperOsIndexPrefix}
                    onChange={(e) => setShipperOsIndexPrefix(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Basic 用户 / 密码（可选）</Label>
                  <div className="flex gap-2">
                    <Input
                      className="font-mono text-xs"
                      placeholder="user"
                      value={shipperOsUser}
                      onChange={(e) => setShipperOsUser(e.target.value)}
                    />
                    <Input
                      className="font-mono text-xs"
                      type="password"
                      placeholder="password"
                      value={shipperOsPassword}
                      onChange={(e) => setShipperOsPassword(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">vm_host 标签（LogsQL 筛选）</Label>
              <Input
                className="text-xs"
                placeholder="如 web-prod-01"
                value={shipperVmLabel}
                onChange={(e) => setShipperVmLabel(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">log_source 覆盖（可选）</Label>
              <Input
                className="font-mono text-xs"
                placeholder="默认与预设 id 相同"
                value={shipperLogSrc}
                onChange={(e) => setShipperLogSrc(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={shipperScriptMut.isPending}
              onClick={() => runShipperGenerate()}
            >
              {shipperScriptMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              生成脚本与 Vector 配置
            </Button>
            {isAdmin ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={
                    shipperInspectMut.isPending ||
                    (shipperTarget === "cloud" ? cloudHostsQ.isLoading : vcenterVmsQ.isLoading)
                  }
                  onClick={() => runShipperInspect()}
                >
                  {shipperInspectMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  检查当前安装状态
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    shipperBusy ||
                    (shipperTarget === "cloud" ? cloudHostsQ.isLoading : vcenterVmsQ.isLoading)
                  }
                  onClick={() => openShipperApplyDialog()}
                >
                  {shipperBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                  后台 SSH 安装（管理员）
                </Button>
              </>
            ) : (
              <p className="self-center text-[11px] text-slate-500">远程安装仅管理员可用；可复制脚本在主机上手动执行。</p>
            )}
          </div>

          {isAdmin ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">安装目标</Label>
                <Select
                  value={shipperTarget}
                  onValueChange={(v) => {
                    const t = v as "cloud" | "vcenter";
                    setShipperTarget(t);
                    if (t === "cloud") setShipperVcenterMoref("");
                    else setShipperHostId("");
                  }}
                >
                  <SelectTrigger className="max-w-xl text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cloud">云主机（已登记 IP:端口）</SelectItem>
                    <SelectItem value="vcenter">vCenter 虚拟机（Tools Guest IP + SSH）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {shipperTarget === "cloud" ? (
                <div className="space-y-1.5">
                  <Label className="text-xs">云主机（已保存 SSH 密码/密钥）</Label>
                  <Select value={shipperHostId || "__none__"} onValueChange={(v) => setShipperHostId(v === "__none__" ? "" : v)}>
                    <SelectTrigger className="max-w-xl text-xs">
                      <SelectValue placeholder="选择主机" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[280px]">
                      <SelectItem value="__none__">未选择</SelectItem>
                      {(cloudHostsQ.data?.hosts ?? []).map((h) => (
                        <SelectItem key={h.id} value={h.id}>
                          {(h.name || h.id).slice(0, 40)} · {h.sshHost}:{h.sshPort || 22} ({h.sshUser || "?"})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label className="text-xs">vCenter 虚拟机（moRef）</Label>
                  <Select
                    value={shipperVcenterMoref || "__none__"}
                    onValueChange={(v) => {
                      const m = v === "__none__" ? "" : v;
                      setShipperVcenterMoref(m);
                      if (m && !shipperVmLabel.trim()) {
                        const row = (vcenterVmsQ.data?.vms ?? []).find((x) => x.moref === m);
                        if (row?.name) setShipperVmLabel(row.name);
                      }
                    }}
                  >
                    <SelectTrigger className="max-w-xl text-xs">
                      <SelectValue placeholder="选择虚拟机" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[280px]">
                      <SelectItem value="__none__">未选择</SelectItem>
                      {(vcenterVmsQ.data?.vms ?? []).map((vm) => (
                        <SelectItem key={vm.moref} value={vm.moref}>
                          {(vm.name || vm.moref).slice(0, 36)} · {vm.moref}
                          {vm.ip ? ` · ${vm.ip}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {vcenterVmsQ.isError ? (
                    <p className="text-[11px] text-amber-800">
                      无法加载虚拟机列表（vCenter 未连接或无权限）。仍可生成脚本后在机器上手动执行；或前往{" "}
                      <Link className="font-medium underline-offset-2 hover:underline" to="/cluster/vcenter">
                        vCenter 虚拟机列表
                      </Link>{" "}
                      确认连接。
                    </p>
                  ) : null}
                  <p className="text-[11px] text-slate-500">
                    SSH 凭据与虚拟机详情页「SSH」相同（全局 VCENTER_VM_SSH_* 或逐台保存）；需 VMware Tools 上报 Guest IP。
                  </p>
                </div>
              )}
            </div>
          ) : null}

          {shipperGen?.warning ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">{shipperGen.warning}</p>
          ) : null}

          {shipperGen?.notes?.length ? (
            <ul className="list-inside list-disc space-y-1 text-[11px] text-slate-600">
              {shipperGen.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          ) : null}

          {shipperGen?.vectorPrimaryUrlAmd64 || shipperGen?.vectorPrimaryUrlArm64 ? (
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-900">当前优先下载的 Vector URL</span>
                {shipperGen.vectorVersion ? (
                  <span className="rounded bg-slate-200 px-2 py-0.5 font-mono text-[10px] text-slate-700">v{shipperGen.vectorVersion}</span>
                ) : null}
              </div>
              {shipperGen.vectorDownloadBaseUrl ? (
                <p className="text-[11px] text-slate-600">
                  已配置本地下载基址：<code className="rounded bg-white px-1">{shipperGen.vectorDownloadBaseUrl}</code>
                </p>
              ) : (
                <p className="text-[11px] text-slate-600">当前未配置本地下载基址，默认优先显示官方完整下载地址。</p>
              )}
              {shipperGen.vectorPrimaryUrlAmd64 ? (
                <div className="space-y-1">
                  <p className="text-[11px] font-medium text-slate-700">AMD64 / x86_64</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="min-w-0 flex-1 break-all rounded bg-white px-2 py-1 font-mono text-[11px] text-slate-800">
                      {shipperGen.vectorPrimaryUrlAmd64}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px]"
                      onClick={() => void copyToClipboardSafe(shipperGen.vectorPrimaryUrlAmd64!).then(() => toast.success("已复制"))}
                    >
                      复制
                    </Button>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    推荐文件名：<code className="rounded bg-white px-1">vector-{shipperGen.vectorVersion}-x86_64-unknown-linux-gnu.tar.gz</code>
                  </p>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="min-w-0 flex-1 break-all rounded bg-white px-2 py-1 font-mono text-[11px] text-slate-800">
                        {`curl -fL "${shipperGen.vectorPrimaryUrlAmd64}" -o "vector-${shipperGen.vectorVersion}-x86_64-unknown-linux-gnu.tar.gz"`}
                      </code>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px]"
                        onClick={() =>
                          void copyToClipboardSafe(
                            `curl -fL "${shipperGen.vectorPrimaryUrlAmd64}" -o "vector-${shipperGen.vectorVersion}-x86_64-unknown-linux-gnu.tar.gz"`
                          ).then(() => toast.success("已复制"))
                        }
                      >
                        复制 curl
                      </Button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="min-w-0 flex-1 break-all rounded bg-white px-2 py-1 font-mono text-[11px] text-slate-800">
                        {`wget -O "vector-${shipperGen.vectorVersion}-x86_64-unknown-linux-gnu.tar.gz" "${shipperGen.vectorPrimaryUrlAmd64}"`}
                      </code>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px]"
                        onClick={() =>
                          void copyToClipboardSafe(
                            `wget -O "vector-${shipperGen.vectorVersion}-x86_64-unknown-linux-gnu.tar.gz" "${shipperGen.vectorPrimaryUrlAmd64}"`
                          ).then(() => toast.success("已复制"))
                        }
                      >
                        复制 wget
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
              {shipperGen.vectorPrimaryUrlArm64 ? (
                <div className="space-y-1">
                  <p className="text-[11px] font-medium text-slate-700">ARM64 / aarch64</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="min-w-0 flex-1 break-all rounded bg-white px-2 py-1 font-mono text-[11px] text-slate-800">
                      {shipperGen.vectorPrimaryUrlArm64}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px]"
                      onClick={() => void copyToClipboardSafe(shipperGen.vectorPrimaryUrlArm64!).then(() => toast.success("已复制"))}
                    >
                      复制
                    </Button>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    推荐文件名：<code className="rounded bg-white px-1">vector-{shipperGen.vectorVersion}-aarch64-unknown-linux-gnu.tar.gz</code>
                  </p>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="min-w-0 flex-1 break-all rounded bg-white px-2 py-1 font-mono text-[11px] text-slate-800">
                        {`curl -fL "${shipperGen.vectorPrimaryUrlArm64}" -o "vector-${shipperGen.vectorVersion}-aarch64-unknown-linux-gnu.tar.gz"`}
                      </code>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px]"
                        onClick={() =>
                          void copyToClipboardSafe(
                            `curl -fL "${shipperGen.vectorPrimaryUrlArm64}" -o "vector-${shipperGen.vectorVersion}-aarch64-unknown-linux-gnu.tar.gz"`
                          ).then(() => toast.success("已复制"))
                        }
                      >
                        复制 curl
                      </Button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="min-w-0 flex-1 break-all rounded bg-white px-2 py-1 font-mono text-[11px] text-slate-800">
                        {`wget -O "vector-${shipperGen.vectorVersion}-aarch64-unknown-linux-gnu.tar.gz" "${shipperGen.vectorPrimaryUrlArm64}"`}
                      </code>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px]"
                        onClick={() =>
                          void copyToClipboardSafe(
                            `wget -O "vector-${shipperGen.vectorVersion}-aarch64-unknown-linux-gnu.tar.gz" "${shipperGen.vectorPrimaryUrlArm64}"`
                          ).then(() => toast.success("已复制"))
                        }
                      >
                        复制 wget
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
              {shipperGen.vectorVersion ? (
                <div className="space-y-2 rounded-md border border-slate-200 bg-white/80 p-3">
                  <p className="text-[11px] font-medium text-slate-700">缓存目录应包含的文件</p>
                  <div className="space-y-2 text-[11px] text-slate-600">
                    <div className="rounded border border-slate-200 bg-slate-50/80 px-2 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        <code className="rounded bg-white px-1">vector-{shipperGen.vectorVersion}-x86_64-unknown-linux-gnu.tar.gz</code>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-medium",
                            cacheProbeBadgeClass(shipperGen.vectorCacheProbe?.amd64)
                          )}
                        >
                          {renderCacheProbeLabel(shipperGen.vectorCacheProbe?.amd64)}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px]"
                          onClick={() =>
                            void copyToClipboardSafe(
                              `curl -fL "${shipperGen.vectorPrimaryUrlAmd64}" -o "vector-${shipperGen.vectorVersion}-x86_64-unknown-linux-gnu.tar.gz"`
                            ).then(() => toast.success("已复制"))
                          }
                        >
                          复制该项 curl
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px]"
                          onClick={() =>
                            void copyToClipboardSafe(
                              `wget -O "vector-${shipperGen.vectorVersion}-x86_64-unknown-linux-gnu.tar.gz" "${shipperGen.vectorPrimaryUrlAmd64}"`
                            ).then(() => toast.success("已复制"))
                          }
                        >
                          复制该项 wget
                        </Button>
                      </div>
                    </div>
                    <div className="rounded border border-slate-200 bg-slate-50/80 px-2 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        <code className="rounded bg-white px-1">vector-{shipperGen.vectorVersion}-aarch64-unknown-linux-gnu.tar.gz</code>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-medium",
                            cacheProbeBadgeClass(shipperGen.vectorCacheProbe?.arm64)
                          )}
                        >
                          {renderCacheProbeLabel(shipperGen.vectorCacheProbe?.arm64)}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px]"
                          onClick={() =>
                            void copyToClipboardSafe(
                              `curl -fL "${shipperGen.vectorPrimaryUrlArm64}" -o "vector-${shipperGen.vectorVersion}-aarch64-unknown-linux-gnu.tar.gz"`
                            ).then(() => toast.success("已复制"))
                          }
                        >
                          复制该项 curl
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px]"
                          onClick={() =>
                            void copyToClipboardSafe(
                              `wget -O "vector-${shipperGen.vectorVersion}-aarch64-unknown-linux-gnu.tar.gz" "${shipperGen.vectorPrimaryUrlArm64}"`
                            ).then(() => toast.success("已复制"))
                          }
                        >
                          复制该项 wget
                        </Button>
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    若你的缓存服务基址为 <code className="rounded bg-slate-50 px-1">{shipperGen.vectorDownloadBaseUrl || "http://host/vector"}</code>，脚本会自动按上述文件名拼接下载。
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          {shipperTask ? (
            <div className="space-y-3 rounded-lg border border-emerald-200/80 bg-emerald-50/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-emerald-900">后台安装进度</p>
                  <p className="text-[11px] text-slate-600">
                    目标：{shipperTask.targetName || shipperTask.targetId || "—"} · vm_host {shipperTask.vmHost || "—"} · log_source{" "}
                    {shipperTask.logSource || "—"}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[11px] font-medium",
                    shipperTask.phase === "success"
                      ? "bg-emerald-100 text-emerald-900"
                      : shipperTask.phase === "error"
                        ? "bg-red-100 text-red-900"
                        : "bg-sky-100 text-sky-900"
                  )}
                >
                  {shipperTask.phase === "success" ? "已完成" : shipperTask.phase === "error" ? "失败" : "执行中"}
                </span>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-slate-600">
                  <span>{shipperTask.message || "任务处理中…"}</span>
                  <span className="font-mono">{shipperTask.progress ?? 0}%</span>
                </div>
                <Progress value={shipperTask.progress ?? 0} className="h-2 bg-emerald-200/60" />
                <p className="text-[11px] text-slate-500">
                  {shipperTask.startedAt ? `开始：${formatLocalDateTime(shipperTask.startedAt)}` : ""}
                  {shipperTask.finishedAt ? ` · 结束：${formatLocalDateTime(shipperTask.finishedAt)}` : ""}
                </p>
              </div>
              {shipperTask.error ? (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">{shipperTask.error}</p>
              ) : null}
              {shipperTask.output ? (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-medium text-slate-700">安装输出</p>
                  <pre className="max-h-72 overflow-auto rounded-md border border-slate-200 bg-white/90 p-3 font-mono text-[11px] leading-relaxed text-slate-800 [overflow-wrap:anywhere]">
                    {shipperTask.output}
                  </pre>
                </div>
              ) : null}
              {enabledCollectors.length ? (
                <div className="space-y-2 rounded-md border border-slate-200 bg-white/90 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] font-medium text-slate-700">已开启采集的目标</p>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-900">
                      {enabledCollectors.length} 个
                    </span>
                  </div>
                  <div className="space-y-2">
                    {enabledCollectors.map((item) => (
                      <div key={item.key} className="rounded border border-slate-200 bg-slate-50/70 px-3 py-2 text-[11px]">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-medium text-slate-900">
                            {item.targetName} · vm_host {item.vmHost} · log_source {item.logSource}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {item.serviceActive ? (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-900">服务运行中</span>
                            ) : null}
                            {item.verifyOk ? (
                              <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-medium text-cyan-900">已验证进库</span>
                            ) : null}
                          </div>
                        </div>
                        <p className="mt-1 text-slate-600">
                          {item.targetType === "vcenter" ? "vCenter 虚拟机" : item.targetType === "cloud" ? "云主机" : "目标"} ·
                          路径 {item.pathCount} 条
                          {item.vectorVersion ? ` · ${item.vectorVersion}` : ""}
                          {item.finishedAt ? ` · 最近完成 ${formatLocalDateTime(item.finishedAt)}` : ""}
                        </p>
                        {item.pathPreview.length ? (
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {item.pathPreview.map((path) => (
                              <span key={path} className="rounded bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-700">
                                {path}
                              </span>
                            ))}
                            {item.pathCount > item.pathPreview.length ? (
                              <span className="rounded bg-white px-1.5 py-0.5 text-[10px] text-slate-500">+{item.pathCount - item.pathPreview.length} 条</span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {shipperTask.verify?.attempted ? (
                <div className="space-y-2 rounded-md border border-slate-200 bg-white/90 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] font-medium text-slate-700">VictoriaLogs 入库验证</p>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium",
                        shipperTask.verify.ok ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"
                      )}
                    >
                      {shipperTask.verify.ok ? "已查到日志" : "暂未查到"}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600">{shipperTask.verify.message || "—"}</p>
                  {shipperTask.verify.error ? (
                    <p className="text-[11px] text-red-700">查询失败：{shipperTask.verify.error}</p>
                  ) : null}
                  <p className="text-[11px] text-slate-500">
                    时间窗：{shipperTask.verify.windowStart ? formatLocalDateTime(shipperTask.verify.windowStart) : "—"} ~{" "}
                    {shipperTask.verify.windowEnd ? formatLocalDateTime(shipperTask.verify.windowEnd) : "—"} · 样本 {shipperTask.verify.checkedRows ?? 0} 条
                  </p>
                  {shipperTask.verify.sampleTime || shipperTask.verify.sampleMsg ? (
                    <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-700">
                      {shipperTask.verify.sampleTime ? <p>样本时间：{formatLocalDateTime(shipperTask.verify.sampleTime)}</p> : null}
                      {shipperTask.verify.sampleMsg ? <p className="mt-1 break-all">样本日志：{shipperTask.verify.sampleMsg}</p> : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {isAdmin && shipperTaskListQ.data?.tasks?.length ? (
            <div className="space-y-2 rounded-lg border border-slate-200 bg-white/80 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-900">最近安装任务</p>
                <p className="text-[11px] text-slate-500">刷新页面后仍可查看当前进度</p>
              </div>
              <div className="space-y-2">
                {shipperTaskListQ.data.tasks.map((task) => (
                  <button
                    key={task.taskId}
                    type="button"
                    className={cn(
                      "w-full rounded-md border px-3 py-2 text-left text-[11px] transition",
                      shipperTaskId === task.taskId
                        ? "border-emerald-300 bg-emerald-50/80"
                        : "border-slate-200 bg-slate-50/70 hover:bg-slate-100"
                    )}
                    onClick={() => setShipperTaskId(task.taskId)}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-slate-900">
                        {task.targetName || task.targetId || "未命名目标"} · {task.logSource || "—"}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-medium",
                          task.phase === "success"
                            ? "bg-emerald-100 text-emerald-900"
                            : task.phase === "error"
                              ? "bg-red-100 text-red-900"
                              : "bg-sky-100 text-sky-900"
                        )}
                      >
                        {task.phase === "success" ? "成功" : task.phase === "error" ? "失败" : `${task.progress ?? 0}%`}
                      </span>
                    </div>
                    <p className="mt-1 text-slate-600">{task.message || "—"}</p>
                    <p className="mt-1 text-slate-400">
                      {task.startedAt ? formatLocalDateTime(task.startedAt) : "—"}
                      {task.verify?.attempted ? ` · 验证${task.verify.ok ? "已进库" : "未进库"}` : ""}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {shipperInspectState ? (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-slate-900">目标安装状态</p>
                  <p className="text-[11px] text-slate-600">
                    {shipperInspect?.targetName || shipperTask?.targetName || "当前目标"} · {shipperInspectState.summary || "—"}
                  </p>
                </div>
                {shipperInspectState.serviceActive ? (
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-medium text-emerald-900">服务运行中</span>
                ) : (
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-medium text-amber-900">服务未运行</span>
                )}
              </div>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-700">
                  <p className="text-slate-500">Vector</p>
                  <p className="mt-1 font-medium text-slate-900">
                    {shipperInspectState.installed ? shipperInspectState.vectorVersion || "已安装" : "未安装"}
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-700">
                  <p className="text-slate-500">systemd</p>
                  <p className="mt-1 font-medium text-slate-900">
                    active={shipperInspectState.serviceStateRaw || "unknown"} · enabled={shipperInspectState.enableStateRaw || "unknown"}
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-700">
                  <p className="text-slate-500">配置</p>
                  <p className="mt-1 font-medium text-slate-900">
                    {shipperInspectState.configExists ? shipperInspectState.configPath || "已写入" : "未写入"}
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-700">
                  <p className="text-slate-500">sudo / SSH</p>
                  <p className="mt-1 font-medium text-slate-900">
                    SSH {shipperInspectState.sshConnected ? "已连通" : "失败"} · 用户 {shipperInspectState.currentUser || "—"} · sudo{" "}
                    {shipperInspectState.sudoReady ? "可用" : "不可用"}
                  </p>
                </div>
              </div>
              {shipperInspectState.currentUid !== 0 && !shipperInspectState.sudoReady ? (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
                  当前 SSH 登录用户是 <strong>{shipperInspectState.currentUser || "该用户"}</strong>，但它不能无密码执行{" "}
                  <code className="rounded bg-white/80 px-1">sudo -n</code>。由于安装 vmlog 采集器需要写入{" "}
                  <code className="rounded bg-white/80 px-1">/usr/local/bin</code>、<code className="rounded bg-white/80 px-1">/etc/vector</code> 和
                  systemd，请先为该用户配置 NOPASSWD sudo。
                </p>
              ) : null}
              {shipperInspectState.pathChecks?.length ? (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-medium text-slate-700">日志路径检查</p>
                  <div className="space-y-1.5">
                    {shipperInspectState.pathChecks.map((row) => (
                      <div key={`${row.path}-${row.sample || ""}`} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-[11px]">
                        <p className="font-mono text-slate-900">{row.path}</p>
                        <p className="mt-1 text-slate-600">
                          匹配 {row.matchedCount} 个文件
                          {row.sample ? ` · 示例：${row.sample}` : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {shipperGen?.bashScript ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-800">Bash 安装脚本</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => void copyToClipboardSafe(shipperGen.bashScript!).then(() => toast.success("已复制"))}
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  复制
                </Button>
              </div>
              <pre className="max-h-48 overflow-auto rounded-lg border border-slate-200 bg-slate-950/5 p-3 font-mono text-[11px] leading-relaxed text-slate-800">
                {shipperGen.bashScript}
              </pre>
            </div>
          ) : null}

          {shipperGen?.vectorToml ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-800">Vector 配置（参考）</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => void copyToClipboardSafe(shipperGen.vectorToml!).then(() => toast.success("已复制"))}
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  复制
                </Button>
              </div>
              <pre className="max-h-56 overflow-auto rounded-lg border border-slate-200 bg-slate-950/5 p-3 font-mono text-[11px] leading-relaxed text-slate-800">
                {shipperGen.vectorToml}
              </pre>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={shipperApplyDialogOpen} onOpenChange={setShipperApplyDialogOpen}>
        <DialogContent className="sm:max-w-lg" showCloseButton aria-describedby="shipper-apply-dialog-desc">
          <DialogHeader>
            <DialogTitle>确认后台 SSH 安装</DialogTitle>
          </DialogHeader>
          <div id="shipper-apply-dialog-desc" className="space-y-3 text-left text-sm text-slate-600">
            <p>
              将在所选
              <strong className="text-slate-900">
                {shipperTarget === "cloud" ? "云主机" : "vCenter 虚拟机（Guest IP）"}
              </strong>
              上：
            </p>
            <ul className="list-inside list-disc space-y-1.5 text-[13px] leading-relaxed text-slate-600">
              <li>
                检查当前 SSH 登录用户及 <code className="rounded bg-slate-100 px-1 text-slate-800">sudo -n</code> 能力
              </li>
              <li>下载 Vector、写入配置与 systemd、启动采集服务</li>
              <li>在本页持续回传进度与安装输出</li>
            </ul>
            <p className="text-[13px] text-amber-900">
              与对应 SSH 终端使用相同凭据；不会在远程交互输入 sudo 密码。
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setShipperApplyDialogOpen(false)}>
              取消
            </Button>
            <Button type="button" onClick={() => confirmShipperApply()} disabled={shipperApplyMut.isPending}>
              {shipperApplyMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              开始安装
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

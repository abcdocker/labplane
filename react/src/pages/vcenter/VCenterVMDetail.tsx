import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, Loader2, Pencil, Radio } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiGetJson, apiPostJson, apiPutJson, type ApiHttpError } from "@/lib/api";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { mergeListeningPortsByProtoPort } from "@/lib/listening-ports";
import VCenterConsolePanel from "./VCenterConsolePanel";
import VCenterSshTerminal from "./VCenterSshTerminal";
import VmCapturePanel from "./capture/VmCapturePanel";
import { VCenterStorageChart, formatBytes } from "./VCenterResourceCharts";
import { VCenterPerfMonitor } from "./VCenterPerfMonitor";
import type {
  VCenterPowerPostResponse,
  VCenterTaskStatusResponse,
  VCenterVMDetailResponse,
} from "./types";
import { vcenterVmDetailText } from "./vcenterVmDetail.i18n";

function formatGuestIps(ips: unknown): string {
  if (ips == null) return "—";
  if (Array.isArray(ips)) return ips.filter(Boolean).join(", ");
  return String(ips);
}

function formatGiBFromKB(capacityKB: number): string {
  if (!Number.isFinite(capacityKB) || capacityKB <= 0) return "—";
  return `${(capacityKB / (1024 * 1024)).toFixed(2)} GiB`;
}

const VCenterVMDetail: React.FC = () => {
  const { moref = "" } = useParams<{ moref: string }>();
  const decoded = decodeURIComponent(moref);
  const [activeTab, setActiveTab] = useState<"overview" | "metrics" | "ssh" | "console" | "capture">("overview");
  const queryClient = useQueryClient();

  const detailQ = useQuery({
    queryKey: ["vcenter-vm", decoded],
    queryFn: ({ signal }) =>
      apiGetJson<VCenterVMDetailResponse>(
        `/api/vcenter/vms/${encodeURIComponent(decoded)}?refresh=1`
      , { signal }),
    enabled: decoded.length > 0,
    staleTime: 0,
    refetchInterval: 16_000,
    refetchOnWindowFocus: true,
  });

  const [cpuEdit, setCpuEdit] = React.useState("");
  const [memEdit, setMemEdit] = React.useState("");
  const [diskTargetGiB, setDiskTargetGiB] = React.useState<
    Record<number, string>
  >({});

  React.useEffect(() => {
    const d = detailQ.data;
    if (!d) return;
    if (d.cpu != null) setCpuEdit(String(d.cpu));
    if (d.memoryMB != null) setMemEdit(String(d.memoryMB));
  }, [detailQ.data]);

  const invalidateVm = () => {
    void queryClient.invalidateQueries({ queryKey: ["vcenter-vm", decoded] });
    void queryClient.invalidateQueries({ queryKey: ["vcenter-vms"] });
  };

  const [powerTaskId, setPowerTaskId] = React.useState("");
  const [editOpen, setEditOpen] = React.useState(false);
  /** 关机二次确认：1 第一步，2 第二步 */
  const [powerOffStep, setPowerOffStep] = React.useState<0 | 1 | 2>(0);
  const powerDoneRef = React.useRef(false);
  const [listeningPortsRequested, setListeningPortsRequested] = React.useState(false);
  const [listeningPortsOpen, setListeningPortsOpen] = React.useState(false);

  type ListeningPortsResponse = {
    guestIp?: string;
    ports?: { proto: string; local: string; port: number }[];
    scannedAt?: string;
    stderr?: string;
    scanFromPodHint?: string;
  };

  const listeningPortsQ = useQuery({
    queryKey: ["vcenter-vm-listening-ports", decoded],
    queryFn: ({ signal }) =>
      apiGetJson<ListeningPortsResponse>(
        `/api/vcenter/vms/${encodeURIComponent(decoded)}/listening-ports`
      , { signal }),
    enabled: listeningPortsRequested && decoded.length > 0,
  });

  const mergedListeningPorts = React.useMemo(
    () => mergeListeningPortsByProtoPort(listeningPortsQ.data?.ports ?? []),
    [listeningPortsQ.data?.ports]
  );

  const taskStatusQ = useQuery({
    queryKey: ["vcenter-task", powerTaskId],
    queryFn: ({ signal }) =>
      apiGetJson<VCenterTaskStatusResponse>(
        `/api/vcenter/tasks/${encodeURIComponent(powerTaskId)}`
      , { signal }),
    enabled: powerTaskId.length > 0,
    refetchInterval: (q) => {
      const s = q.state.data?.state;
      if (s === "success" || s === "error") return false;
      return 450;
    },
  });

  React.useEffect(() => {
    if (!powerTaskId) {
      powerDoneRef.current = false;
      return;
    }
    const d = taskStatusQ.data;
    if (!d || powerDoneRef.current) return;
    if (d.state === "success") {
      powerDoneRef.current = true;
      const extra = d.description ? ` · ${d.description}` : "";
      toast.success(`电源操作已完成${extra}`);
      setPowerTaskId("");
      invalidateVm();
    } else if (d.state === "error") {
      powerDoneRef.current = true;
      toast.error(d.error || "电源任务失败");
      setPowerTaskId("");
      invalidateVm();
    }
  }, [taskStatusQ.data, powerTaskId]);

  const powerStartMut = useMutation({
    mutationFn: (action: string) =>
      apiPostJson<VCenterPowerPostResponse>(
        `/api/vcenter/vms/${encodeURIComponent(decoded)}/power`,
        { action }
      ),
    onSuccess: (data) => {
      if (data.taskId) {
        powerDoneRef.current = false;
        setPowerTaskId(data.taskId);
        toast.message("电源任务已提交", {
          description: "正在从 vCenter 拉取进度…",
        });
      } else {
        invalidateVm();
      }
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const hardwareMut = useMutation({
    mutationFn: (body: { numCpu?: number; memoryMB?: number }) =>
      apiPutJson<{ ok?: boolean }>(
        `/api/vcenter/vms/${encodeURIComponent(decoded)}/hardware`,
        body
      ),
    onSuccess: () => {
      invalidateVm();
      toast.success("CPU / 内存已保存");
      setEditOpen(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const diskExpandMut = useMutation({
    mutationFn: (body: { deviceKey: number; totalGiB: number }) =>
      apiPostJson<{ ok?: boolean }>(
        `/api/vcenter/vms/${encodeURIComponent(decoded)}/disk/expand`,
        body
      ),
    onSuccess: () => {
      invalidateVm();
      toast.success("磁盘扩容已完成");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const morePowerMut = useMutation({
    mutationFn: (action: string) =>
      apiPostJson<VCenterPowerPostResponse>(
        `/api/vcenter/vms/${encodeURIComponent(decoded)}/power`,
        { action }
      ),
    onSuccess: (data) => {
      if (data.taskId) {
        powerDoneRef.current = false;
        setPowerTaskId(data.taskId);
        setEditOpen(false);
        toast.message("电源任务已提交", {
          description: "正在监测进度…",
        });
      } else {
        invalidateVm();
        toast.success("操作已发送");
        setEditOpen(false);
      }
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const guest = detailQ.data?.guest;
  const storage = detailQ.data?.storage;
  const nets = detailQ.data?.networkInterfaces;
  const disks = detailQ.data?.disks;
  const isTemplate = detailQ.data?.template === true;
  const powerBusy =
    powerStartMut.isPending ||
    morePowerMut.isPending ||
    Boolean(powerTaskId.length > 0);
  const alreadyPoweredOn =
    (detailQ.data?.powerState ?? "").toLowerCase() === "poweredon";
  const editPending = hardwareMut.isPending || diskExpandMut.isPending;
  const taskProg = taskStatusQ.data?.progress ?? 0;
  const taskState = taskStatusQ.data?.state;
  const showPowerProgress =
    Boolean(powerTaskId) &&
    taskState !== "success" &&
    taskState !== "error";
  const vmDisplayName = detailQ.data?.name?.trim() || decoded;

  useEffect(() => {
    setActiveTab("overview");
  }, [decoded]);

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-4">
      <div className="space-y-1">
        <Link
          to="/cluster/vcenter"
          className="inline-flex items-center text-sm text-blue-600 hover:underline"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          返回虚拟机列表
        </Link>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-xl font-semibold text-slate-900">
            {detailQ.data?.name || decoded}
          </h2>
          <p className="font-mono text-xs text-slate-500">{decoded}</p>
        </div>
      </div>

      {detailQ.isLoading && <p className="text-slate-500">加载详情…</p>}
      {detailQ.error && (
        <p className="text-red-600">{(detailQ.error as Error).message}</p>
      )}

      {detailQ.data && (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="w-full min-w-0">
          <TabsList className="mb-2 h-auto w-full max-w-full flex-nowrap justify-start gap-1 overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:w-fit">
            <TabsTrigger value="overview" className="min-h-11 shrink-0">{vcenterVmDetailText.tabs.overview}</TabsTrigger>
            <TabsTrigger value="metrics" className="min-h-11 shrink-0">{vcenterVmDetailText.tabs.metrics}</TabsTrigger>
            <TabsTrigger value="ssh" className="min-h-11 shrink-0">{vcenterVmDetailText.tabs.ssh}</TabsTrigger>
            <TabsTrigger value="console" className="min-h-11 shrink-0">{vcenterVmDetailText.tabs.console}</TabsTrigger>
            <TabsTrigger value="capture" className="min-h-11 shrink-0">{vcenterVmDetailText.tabs.capture}</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-medium text-slate-500">电源 / 工具</p>
                <p className="mt-1 text-sm">
                  {detailQ.data.powerState ?? "—"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-medium text-slate-500">vCPU / 内存</p>
                <p className="mt-1 text-sm">
                  {detailQ.data.cpu ?? "—"} / {detailQ.data.memoryMB ?? "—"} MB
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-medium text-slate-500">UUID</p>
                <p className="mt-1 break-all font-mono text-xs">
                  {detailQ.data.uuid ?? "—"}
                </p>
              </div>
            </div>

            {isTemplate ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-sm text-amber-950">
                当前虚拟机为<strong>模板</strong>，无法在此执行电源、硬件编辑或磁盘扩容。
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-500">
                        电源状态
                      </p>
                      <p className="mt-0.5 text-sm font-medium text-slate-900">
                        {detailQ.data.powerState ?? "—"}
                        {taskStatusQ.isFetching && taskState && (
                          <span className="ml-2 font-normal text-slate-500">
                            · 任务 {taskState}
                            {taskProg > 0 ? ` ${taskProg}%` : ""}
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        电源与摘要约每 16 秒向 vCenter 拉取刷新，重启/关机后状态会自动更新。
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={powerBusy || alreadyPoweredOn}
                        onClick={() => powerStartMut.mutate("on")}
                      >
                        开机
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={powerBusy}
                        onClick={() => setPowerOffStep(1)}
                      >
                        关机
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        disabled={powerBusy}
                        onClick={() => setEditOpen(true)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        编辑资源
                      </Button>
                    </div>
                  </div>
                  {showPowerProgress && (
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center justify-between text-[11px] text-slate-600">
                        <span>
                          {taskStatusQ.isLoading
                            ? "正在连接 vCenter 任务…"
                            : taskStatusQ.data?.description ||
                              "电源任务进行中…"}
                        </span>
                        {taskProg > 0 ? (
                          <span className="tabular-nums">{taskProg}%</span>
                        ) : null}
                      </div>
                      <Progress
                        className={
                          taskProg === 0 && showPowerProgress
                            ? "animate-pulse"
                            : ""
                        }
                        value={
                          taskProg > 0
                            ? taskProg
                            : showPowerProgress
                              ? 18
                              : 0
                        }
                      />
                    </div>
                  )}
                </div>

                <Dialog open={editOpen} onOpenChange={setEditOpen}>
                  <DialogContent className="max-h-[min(90dvh,720px)] max-w-lg overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>编辑资源</DialogTitle>
                      <DialogDescription>
                        修改 CPU、内存与磁盘容量；更多电源操作在下方。
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="vm-cpu">vCPU</Label>
                        <Input
                          id="vm-cpu"
                          inputMode="numeric"
                          value={cpuEdit}
                          onChange={(e) => setCpuEdit(e.target.value)}
                          disabled={editPending}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="vm-mem">内存 (MB)</Label>
                        <Input
                          id="vm-mem"
                          inputMode="numeric"
                          value={memEdit}
                          onChange={(e) => setMemEdit(e.target.value)}
                          disabled={editPending}
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      {[
                        detailQ.data?.cpuHotAddEnabled && "已启用 CPU 热添加。",
                        detailQ.data?.memoryHotAddEnabled && "已启用内存热添加。",
                      ]
                        .filter(Boolean)
                        .join(" ") ||
                        "未标记热添加时改配可能需关机。"}
                    </p>
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-slate-700">
                        更多电源操作
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={editPending || powerBusy}
                          onClick={() => morePowerMut.mutate("suspend")}
                        >
                          挂起
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={editPending || powerBusy}
                          onClick={() => morePowerMut.mutate("reset")}
                        >
                          重置
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={editPending || powerBusy}
                          onClick={() => morePowerMut.mutate("shutdown_guest")}
                        >
                          关闭客户机
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={editPending || powerBusy}
                          onClick={() => morePowerMut.mutate("reboot_guest")}
                        >
                          重启客户机
                        </Button>
                      </div>
                    </div>
                    {Array.isArray(disks) && disks.length > 0 ? (
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          磁盘扩容（目标总 GiB）
                        </p>
                        <div className="mt-2 overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>设备</TableHead>
                                <TableHead>当前</TableHead>
                                <TableHead className="min-w-[88px]">
                                  目标 GiB
                                </TableHead>
                                <TableHead />
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {disks.map((d) => (
                                <TableRow key={d.key}>
                                  <TableCell className="text-sm">
                                    {d.label || `Disk ${d.key}`}
                                  </TableCell>
                                  <TableCell className="text-xs tabular-nums">
                                    {formatGiBFromKB(d.capacityKB)}
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      className="h-8 w-24"
                                      placeholder="100"
                                      inputMode="decimal"
                                      value={diskTargetGiB[d.key] ?? ""}
                                      onChange={(e) =>
                                        setDiskTargetGiB((prev) => ({
                                          ...prev,
                                          [d.key]: e.target.value,
                                        }))
                                      }
                                      disabled={editPending}
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="secondary"
                                      disabled={editPending}
                                      onClick={() => {
                                        const raw =
                                          diskTargetGiB[d.key]?.trim() ?? "";
                                        const g = parseFloat(raw);
                                        if (
                                          Number.isNaN(g) ||
                                          g <= 0 ||
                                          !Number.isFinite(g)
                                        ) {
                                          return;
                                        }
                                        diskExpandMut.mutate({
                                          deviceKey: d.key,
                                          totalGiB: g,
                                        });
                                      }}
                                    >
                                      扩容
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    ) : null}
                    <DialogFooter className="gap-2 sm:justify-between">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setEditOpen(false)}
                      >
                        关闭
                      </Button>
                      <Button
                        type="button"
                        disabled={editPending}
                        onClick={() => {
                          const n = parseInt(cpuEdit, 10);
                          const m = parseInt(memEdit, 10);
                          const body: {
                            numCpu?: number;
                            memoryMB?: number;
                          } = {};
                          if (!Number.isNaN(n) && n >= 1) body.numCpu = n;
                          if (!Number.isNaN(m) && m >= 4) body.memoryMB = m;
                          if (Object.keys(body).length === 0) {
                            toast.message("未修改 CPU / 内存", {
                              description: "请调整数值后再保存。",
                            });
                            return;
                          }
                          hardwareMut.mutate(body);
                        }}
                      >
                        {hardwareMut.isPending ? "保存中…" : "保存 CPU / 内存"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </>
            )}

            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">来宾已监听端口</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    由 Dashboard Pod SSH 到 Guest 执行 ss/netstat；需已配置 SSH 与 Guest IP。
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="gap-1.5 shrink-0"
                  disabled={!decoded}
                  onClick={() => {
                    if (listeningPortsRequested) {
                      void listeningPortsQ.refetch();
                    } else {
                      setListeningPortsRequested(true);
                    }
                  }}
                >
                  {listeningPortsQ.isFetching ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Radio className="h-3.5 w-3.5" />
                  )}
                  {listeningPortsRequested ? "重新加载" : "加载端口列表"}
                </Button>
              </div>
              {listeningPortsQ.isError && (
                <p className="mt-3 text-sm text-red-600">
                  {(listeningPortsQ.error as Error).message}
                </p>
              )}
              {listeningPortsQ.data && (
                <Collapsible
                  open={listeningPortsOpen}
                  onOpenChange={setListeningPortsOpen}
                  className="mt-3"
                >
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-left text-sm font-medium text-slate-900 transition-colors hover:bg-slate-100"
                    >
                      <span>
                        {listeningPortsOpen ? "收起" : "展开"}端口列表
                        {mergedListeningPorts.length > 0
                          ? `（${mergedListeningPorts.length} 条，已按端口合并）`
                          : ""}
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${
                          listeningPortsOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="data-[state=closed]:animate-none">
                    <div className="mt-3 space-y-2">
                      <p className="text-xs text-slate-500">
                        扫描时间 {listeningPortsQ.data.scannedAt ?? "—"} · Guest{" "}
                        <span className="font-mono">{listeningPortsQ.data.guestIp ?? "—"}</span>
                      </p>
                      {listeningPortsQ.data.stderr ? (
                        <p className="text-xs text-amber-800">{listeningPortsQ.data.stderr}</p>
                      ) : null}
                      <div className="overflow-x-auto rounded-lg border border-slate-100">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">协议</TableHead>
                              <TableHead className="text-xs">端口</TableHead>
                              <TableHead className="text-xs">本地地址</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {mergedListeningPorts.map((p) => (
                              <TableRow key={`${p.proto}-${p.port}`}>
                                <TableCell className="font-mono text-xs">{p.proto}</TableCell>
                                <TableCell className="tabular-nums text-xs">{p.port}</TableCell>
                                <TableCell className="max-w-[260px] break-words font-mono text-xs">
                                  {p.locals}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      {(listeningPortsQ.data.ports ?? []).length === 0 &&
                        !listeningPortsQ.isFetching && (
                          <p className="text-xs text-slate-500">
                            未解析到监听项（或输出格式不兼容）。
                          </p>
                        )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>

            {guest && (
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-sm font-medium text-slate-900">Guest</p>
                <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-slate-500">IP</dt>
                    <dd className="mt-0.5 font-mono text-sm">
                      {guest.ip ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">主机名</dt>
                    <dd className="mt-0.5 text-sm">{guest.hostname ?? "—"}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-slate-500">系统</dt>
                    <dd className="mt-0.5 text-sm">
                      {guest.guestFullName ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Tools 运行</dt>
                    <dd className="mt-0.5 text-sm">
                      {guest.toolsRunningStatus != null
                        ? String(guest.toolsRunningStatus)
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Tools 版本</dt>
                    <dd className="mt-0.5 text-sm">
                      {guest.toolsVersionStatus != null
                        ? String(guest.toolsVersionStatus)
                        : "—"}
                    </dd>
                  </div>
                </dl>
              </div>
            )}

            {storage && (
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-sm font-medium text-slate-900">存储</p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                  以下为 vSphere 摘要中的三项：已提交表示当前已占用的虚拟磁盘空间；未提交表示精简置备等尚未兑现、仍可能增长的部分；未共享表示不计入共享（如链接克隆去重）的本机独占用量。三者并非简单相加关系。
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-slate-500">已提交</p>
                    <p className="mt-0.5 text-sm tabular-nums">
                      {formatBytes(storage.committedBytes)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">未提交</p>
                    <p className="mt-0.5 text-sm tabular-nums">
                      {formatBytes(storage.uncommittedBytes)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">未共享</p>
                    <p className="mt-0.5 text-sm tabular-nums">
                      {formatBytes(storage.unsharedBytes)}
                    </p>
                  </div>
                </div>
                <div className="mt-4">
                  <VCenterStorageChart storage={storage} />
                </div>
              </div>
            )}

            {Array.isArray(nets) && nets.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-sm font-medium text-slate-900">
                  网卡与 IP（来自 Guest）
                </p>
                <div className="mt-3 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>网络</TableHead>
                        <TableHead>MAC</TableHead>
                        <TableHead>IP</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {nets.map((row, i) => (
                        <TableRow key={`${row.mac ?? i}-${row.network ?? ""}`}>
                          <TableCell className="text-sm">
                            {row.network ?? "—"}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {row.mac ?? "—"}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {formatGuestIps(row.ips)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="metrics">
            {decoded.length > 0 ? (
              <VCenterPerfMonitor moref={decoded} />
            ) : null}
          </TabsContent>

          <TabsContent value="ssh" className="space-y-4">
            <VCenterSshTerminal
              moref={decoded}
              autoConnect
              guestIpHint={
                guest &&
                typeof guest.ip === "string" &&
                guest.ip !== "—"
                  ? guest.ip
                  : undefined
              }
            />
          </TabsContent>

          <TabsContent value="console">
            <VCenterConsolePanel moref={decoded} />
          </TabsContent>

          <TabsContent value="capture" className="space-y-4">
            <VmCapturePanel moref={decoded} vmName={vmDisplayName} />
          </TabsContent>
        </Tabs>
      )}

      <AlertDialog
        open={powerOffStep > 0}
        onOpenChange={(open) => {
          if (!open) setPowerOffStep(0);
        }}
      >
        <AlertDialogContent>
          {powerOffStep === 1 ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>确认关机</AlertDialogTitle>
                <AlertDialogDescription>
                  即将对虚拟机「{vmDisplayName}」发起关机请求，是否继续？
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <Button type="button" onClick={() => setPowerOffStep(2)}>
                  继续
                </Button>
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>再次确认关机</AlertDialogTitle>
                <AlertDialogDescription>
                  请再次确认：关机后虚拟机将停止运行，需重新开机才能恢复服务。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  className="sm:mr-auto"
                  onClick={() => setPowerOffStep(1)}
                >
                  返回上一步
                </Button>
                <div className="flex w-full gap-2 sm:w-auto sm:justify-end">
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={powerBusy}
                    onClick={() => {
                      setPowerOffStep(0);
                      powerStartMut.mutate("off");
                    }}
                  >
                    确认关机
                  </Button>
                </div>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default VCenterVMDetail;

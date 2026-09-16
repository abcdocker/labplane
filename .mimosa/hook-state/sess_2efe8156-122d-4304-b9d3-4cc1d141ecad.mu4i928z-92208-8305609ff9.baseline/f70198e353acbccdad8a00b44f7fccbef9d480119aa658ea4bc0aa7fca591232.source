import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Copy,
  Cpu,
  Gauge,
  HardDrive,
  Loader2,
  Maximize2,
  Network,
  RefreshCw,
  Terminal,
  Trash2,
  KeyRound,
} from "lucide-react";
import { LogoHysteria2 } from "@/components/CloudVmSoftwareLogos";
import { useAuth } from "@/auth/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  ApiHttpError,
  apiDelete,
  apiGetJson,
  apiPostJson,
  apiPutJson,
  prometheusQueryApi,
} from "@/lib/api";
import {
  cloudVmAppCenterCanWrite,
  cloudVmHysteriaRevealAllowed,
} from "@/lib/platform-permissions";
import CloudVmSshTerminalSheet from "@/components/CloudVmSshTerminalSheet";
import { toast } from "sonner";

type EnvVar = { name: string; value: string };

type StoredConfig = {
  displayName?: string;
  imageId?: string;
  image?: string;
  cpuRequest?: string;
  cpuLimit?: string;
  memRequest?: string;
  memLimit?: string;
  pvcSize?: string;
  storageClassName?: string;
  nodePort?: number;
  sshPort?: number;
  nodeAccessIP?: string;
  phase?: string;
  env?: EnvVar[];
  command?: string[];
  args?: string[];
  deploymentName?: string;
  /** 每次容器启动执行的 bash，存库 + Secret（不含平台合并的软件块） */
  initScript?: string;
  software?: {
    installDocker?: boolean;
    installNginx?: boolean;
    installBaota?: boolean;
    installHysteria2?: boolean;
    hysteria2ListenPort?: number;
    hysteria2ConfigYaml?: string;
    cliPackages?: string[];
  };
};

type ContainerStatusRow = {
  name?: string;
  ready?: boolean;
  state?: string;
  reason?: string;
  message?: string;
};

type Readiness = {
  ready?: boolean;
  message?: string;
  podPhase?: string;
  podName?: string;
  k8sPodReady?: boolean;
  readyReplicas?: number;
  deploymentReplicas?: number;
  deploymentUpdatedReplicas?: number;
  progressPercent?: number;
  progressStep?: number;
  progressTotal?: number;
  progressLabels?: string[];
  progressDetail?: string;
  containerStatuses?: ContainerStatusRow[];
  initContainerStatuses?: ContainerStatusRow[];
};

type InstanceDetail = {
  id: number;
  name: string;
  namespace: string;
  createdBy?: string;
  /** RFC3339 */
  createdAt?: string;
  config: StoredConfig;
  /** 库内是否已有 Hysteria2 客户端 YAML（GET 不返回明文） */
  hysteria2ConfigStored?: boolean;
  readiness?: Readiness;
  /** 引导模板中指定节点时的访问 IP，优先于 config.nodeAccessIP */
  accessNodeIP?: string;
  service?: {
    name?: string;
    namespace?: string;
    clusterIP?: string;
    type?: string;
    nodePort?: number;
    port?: number;
  };
};

type MetricsPayload = {
  available: boolean;
  hint?: string;
  queries?: {
    cpu?: string;
    memory?: string;
    netRx?: string;
    netTx?: string;
  };
};

function promInstantScalar(data: unknown): number | null {
  const d = data as {
    status?: string;
    data?: { result?: Array<{ value?: [number, string] }> };
  };
  if (d?.status !== "success") return null;
  const v = d?.data?.result?.[0]?.value?.[1];
  if (v == null) return null;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

/** 查询失败（含上游 502）时返回 null，避免 React Query 报错刷屏；根因多为平台到 Prometheus 网络/地址不可达。 */
async function promQueryK8s(q: string, signal?: AbortSignal): Promise<number | null> {
  try {
    const data = await prometheusQueryApi("k8s", q, signal ? { signal } : undefined);
    return promInstantScalar(data);
  } catch {
    return null;
  }
}

function fmtBytes(n: number | null): string {
  if (n == null) return "—";
  if (n < 1024) return `${n.toFixed(0)} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KiB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MiB`;
  return `${(n / 1024 ** 3).toFixed(2)} GiB`;
}

function fmtRatePerSec(n: number | null): string {
  if (n == null) return "—";
  return fmtBytes(n) + "/s";
}

function fmtContainerState(r: ContainerStatusRow): string {
  const st = r.state ?? "—";
  if (r.reason) return `${st} · ${r.reason}`;
  return st;
}

function CloudVmDeployProgress({
  r,
  onRefresh,
  refreshing,
}: {
  r: Readiness;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const total = r.progressTotal ?? 3;
  const step = Math.min(Math.max(r.progressStep ?? 1, 1), total);
  const labels = r.progressLabels ?? ["调度与镜像", "容器运行（就绪检查）", "可 SSH"];
  const pct = Math.min(100, Math.max(0, r.progressPercent ?? 0));

  return (
    <div className="min-w-[min(100%,480px)] flex-1 space-y-1.5 rounded-lg border border-sky-200/70 bg-white/70 px-2.5 py-2 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px]">
        <span className="flex flex-wrap items-center gap-2 font-medium text-slate-700">
          部署进度
          {onRefresh ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2 text-[10px]"
              disabled={refreshing}
              onClick={() => onRefresh()}
            >
              {refreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              刷新
            </Button>
          ) : null}
        </span>
        <span className="font-mono text-slate-500">
          K8s Pod: <span className="text-slate-800">{r.podPhase ?? "—"}</span>
          {r.podName ? (
            <span className="ml-1 text-slate-400" title={r.podName}>
              ({r.podName.length > 18 ? `${r.podName.slice(0, 16)}…` : r.podName})
            </span>
          ) : null}
          {" · "}
          Ready: {r.k8sPodReady === true ? "是" : "否"}
          {r.deploymentReplicas != null ? (
            <span className="ml-1 text-slate-400">
              · Deployment {r.readyReplicas ?? 0}/{r.deploymentReplicas ?? 0}
            </span>
          ) : null}
        </span>
      </div>
      <Progress value={pct} className="h-2 bg-slate-200/80" />
      <div className="flex flex-wrap gap-1.5">
        {labels.map((lab, i) => {
          const n = i + 1;
          const done = n < step;
          const active = n === step;
          return (
            <span
              key={lab}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] leading-tight ${
                done
                  ? "border-emerald-300/80 bg-emerald-50 text-emerald-900"
                  : active
                    ? "border-sky-400 bg-sky-50 text-sky-950"
                    : "border-slate-200 bg-slate-50/80 text-slate-500"
              }`}
            >
              <span className="tabular-nums text-slate-400">{n}</span>
              {lab}
            </span>
          );
        })}
      </div>
      {r.progressDetail ? (
        <p className="text-[11px] leading-relaxed text-slate-600">{r.progressDetail}</p>
      ) : null}
      {r.message ? (
        <p className="text-[11px] leading-relaxed text-amber-900/90">{r.message}</p>
      ) : null}
      {(r.initContainerStatuses?.length ?? 0) + (r.containerStatuses?.length ?? 0) > 0 ? (
        <details className="group text-[11px] text-slate-600">
          <summary className="cursor-pointer select-none text-slate-700 underline-offset-2 hover:underline">
            容器状态（Init / 主容器）
          </summary>
          <ul className="mt-1.5 space-y-1 border-t border-slate-100 pt-1.5 font-mono text-[10px] text-slate-700">
            {(r.initContainerStatuses ?? []).map((c) => (
              <li key={`init-${c.name}`}>
                <span className="text-violet-600">init</span> {c.name}: {fmtContainerState(c)}
                {c.ready === true ? " ✓" : ""}
              </li>
            ))}
            {(r.containerStatuses ?? []).map((c) => (
              <li key={`main-${c.name}`}>
                {c.name}: {fmtContainerState(c)}
                {c.ready === true ? " ✓" : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

export default function AppCenterCloudVmDetail() {
  const { id: idParam = "" } = useParams<{ id: string }>();
  const id = parseInt(idParam, 10);
  const navigate = useNavigate();
  const { status } = useAuth();
  const perm = status?.permissions;
  const canWrite = cloudVmAppCenterCanWrite(status?.role, perm);
  const canRevealHysteria = cloudVmHysteriaRevealAllowed(status?.role, perm);
  const legacyViewer = perm?.legacyViewer === true;
  const [sshOpen, setSshOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [resetResultOpen, setResetResultOpen] = useState(false);
  const [resetPlain, setResetPlain] = useState("");
  const [resetPending, setResetPending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [initDraft, setInitDraft] = useState("");
  /** 填写并保存时同步到集群 Secret「root-password」与库中密文，并触发展开 */
  const [rootPasswordDraft, setRootPasswordDraft] = useState("");
  const [hyDraft, setHyDraft] = useState({
    installHysteria2: false,
    hysteria2ListenPort: 8080,
    hysteria2ConfigYaml: "",
  });
  const [hyRevealOpen, setHyRevealOpen] = useState(false);
  const [hyRevealPassword, setHyRevealPassword] = useState("");
  const [hyRevealPending, setHyRevealPending] = useState(false);
  const [scaleOpen, setScaleOpen] = useState(false);
  const [scaleDraft, setScaleDraft] = useState({
    cpuRequest: "",
    cpuLimit: "",
    memRequest: "",
    memLimit: "",
    pvcSize: "",
  });
  const qc = useQueryClient();

  const detailQ = useQuery({
    queryKey: ["app-center-cloud-vm-instance", id],
    queryFn: ({ signal }) => apiGetJson<InstanceDetail>(`/api/app-center/cloud-vm/instances/${id}`, { signal }),
    enabled: Number.isFinite(id) && id > 0,
    refetchInterval: (q) => {
      const d = q.state.data as InstanceDetail | undefined;
      if (!d) return false;
      if (d.readiness?.ready === true) return 20_000;
      return 2500;
    },
  });

  const opReady = detailQ.data?.readiness?.ready === true;

  const wasReadyRef = useRef(false);
  useEffect(() => {
    const now = detailQ.data?.readiness?.ready === true;
    if (now && !wasReadyRef.current) {
      void qc.invalidateQueries({ queryKey: ["app-center-cloud-vm-instances"] });
    }
    wasReadyRef.current = now;
  }, [detailQ.data?.readiness?.ready, qc]);

  const metricsQ = useQuery({
    queryKey: ["app-center-cloud-vm-metrics", id],
    queryFn: ({ signal }) => apiGetJson<MetricsPayload>(`/api/app-center/cloud-vm/instances/${id}/metrics`, { signal }),
    enabled: Number.isFinite(id) && id > 0 && opReady,
    refetchInterval: opReady ? 5000 : false,
  });

  const cfg = detailQ.data?.config;

  useEffect(() => {
    if (cfg?.initScript !== undefined) {
      setInitDraft(cfg.initScript ?? "");
    }
  }, [cfg?.initScript]);

  useEffect(() => {
    const sw = cfg?.software;
    if (!sw) return;
    setHyDraft((prev) => {
      const fromApi = (sw.hysteria2ConfigYaml ?? "").trim();
      const nextYaml = !sw.installHysteria2
        ? ""
        : fromApi !== ""
          ? (sw.hysteria2ConfigYaml ?? "")
          : prev.hysteria2ConfigYaml;
      return {
        installHysteria2: !!sw.installHysteria2,
        hysteria2ListenPort: sw.hysteria2ListenPort || 8080,
        hysteria2ConfigYaml: nextYaml,
      };
    });
  }, [
    cfg?.software?.installHysteria2,
    cfg?.software?.hysteria2ListenPort,
    cfg?.software?.hysteria2ConfigYaml,
  ]);

  useEffect(() => {
    if (!scaleOpen || !cfg) return;
    setScaleDraft({
      cpuRequest: cfg.cpuRequest ?? "",
      cpuLimit: cfg.cpuLimit ?? "",
      memRequest: cfg.memRequest ?? "",
      memLimit: cfg.memLimit ?? "",
      pvcSize: cfg.pvcSize ?? "",
    });
  }, [scaleOpen, cfg]);

  const saveInitMut = useMutation({
    mutationFn: () => {
      const hyStored = detailQ.data?.hysteria2ConfigStored === true;
      if (
        hyDraft.installHysteria2 &&
        !hyDraft.hysteria2ConfigYaml.trim() &&
        !(hyStored && !canRevealHysteria)
      ) {
        throw new Error("已勾选 Hysteria2 客户端时请粘贴 hysteria2:// 分享链接或填写 YAML");
      }
      const rp = rootPasswordDraft.trim();
      if (rp.length > 0 && rp.length < 8) {
        throw new Error("root 密码至少 8 位（留空则不修改密码）");
      }
      const sw = cfg?.software ?? {};
      const body: Record<string, unknown> = {
        initScript: initDraft,
        software: {
          installDocker: !!sw.installDocker,
          installNginx: !!sw.installNginx,
          installBaota: !!sw.installBaota,
          installHysteria2: hyDraft.installHysteria2,
          hysteria2ListenPort: hyDraft.hysteria2ListenPort || 8080,
          hysteria2ConfigYaml: hyDraft.hysteria2ConfigYaml.trim(),
          cliPackages: sw.cliPackages ?? [],
        },
      };
      if (rp.length > 0) {
        body.rootPassword = rp;
      }
      return apiPutJson(`/api/app-center/cloud-vm/instances/${id}`, body);
    },
    onSuccess: () => {
      const hadPw = rootPasswordDraft.trim().length >= 8;
      if (hadPw) {
        setRootPasswordDraft("");
      }
      toast.success(
        hadPw
          ? "已保存配置并同步 root 密码（Secret + 库密文），Deployment 已触发展开"
          : "已保存初始化与软件配置，正在滚动更新 Pod"
      );
      void qc.invalidateQueries({ queryKey: ["app-center-cloud-vm-instance", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const hyStored = detailQ.data?.hysteria2ConfigStored === true;
  const hyYamlVisible = hyDraft.hysteria2ConfigYaml.trim() !== "";

  const revealHysteriaClient = async () => {
    const pw = hyRevealPassword.trim();
    if (!pw) {
      toast.error("请输入当前平台登录密码");
      return;
    }
    setHyRevealPending(true);
    try {
      const r = await apiPostJson<{
        hysteria2ConfigYaml?: string;
        hysteria2ListenPort?: number;
      }>(`/api/app-center/cloud-vm/instances/${id}/reveal-hysteria-client`, { password: pw });
      setHyDraft((h) => ({
        ...h,
        hysteria2ConfigYaml: (r.hysteria2ConfigYaml ?? "").trim(),
        hysteria2ListenPort: r.hysteria2ListenPort ?? h.hysteria2ListenPort,
      }));
      setHyRevealOpen(false);
      setHyRevealPassword("");
      toast.success("已展示客户端配置（请勿外传）");
    } catch (e) {
      const msg = e instanceof ApiHttpError ? e.serverMessage : String(e);
      toast.error(msg || "验证失败");
    } finally {
      setHyRevealPending(false);
    }
  };

  const saveRootPasswordOnlyMut = useMutation({
    mutationFn: () => {
      const rp = rootPasswordDraft.trim();
      if (rp.length < 8) {
        throw new Error("root 密码至少 8 位");
      }
      return apiPutJson(`/api/app-center/cloud-vm/instances/${id}`, { rootPassword: rp });
    },
    onSuccess: () => {
      setRootPasswordDraft("");
      toast.success("root 密码已同步到集群 Secret 与库中密文，并已触发展开");
      void qc.invalidateQueries({ queryKey: ["app-center-cloud-vm-instance", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const scaleMut = useMutation({
    mutationFn: () => {
      const cpuRequest = scaleDraft.cpuRequest.trim();
      const cpuLimit = scaleDraft.cpuLimit.trim();
      const memRequest = scaleDraft.memRequest.trim();
      const memLimit = scaleDraft.memLimit.trim();
      const pvcSize = scaleDraft.pvcSize.trim();
      const body: Record<string, string> = {
        cpuRequest,
        cpuLimit,
        memRequest,
        memLimit,
      };
      if (pvcSize !== (cfg?.pvcSize ?? "").trim()) {
        body.pvcSize = pvcSize;
      }
      return apiPostJson(`/api/app-center/cloud-vm/instances/${id}/scale`, body);
    },
    onSuccess: () => {
      toast.success("已提交扩容；Deployment 将滚动更新，PVC 扩容依赖 StorageClass 支持在线扩容");
      setScaleOpen(false);
      void qc.invalidateQueries({ queryKey: ["app-center-cloud-vm-instance", id] });
      void qc.invalidateQueries({ queryKey: ["app-center-cloud-vm-instances"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const accessHost = detailQ.data?.accessNodeIP ?? cfg?.nodeAccessIP;
  const access =
    accessHost && (cfg?.sshPort ?? cfg?.nodePort)
      ? `${accessHost}:${cfg.sshPort ?? cfg.nodePort}`
      : null;
  const svc = detailQ.data?.service;

  const queries = metricsQ.data?.queries;

  const cpuV = useQuery({
    queryKey: ["cloud-vm-prom-cpu", id, queries?.cpu],
    queryFn: ({ signal }) => promQueryK8s(queries!.cpu!, signal),
    enabled: opReady && !!metricsQ.data?.available && !!queries?.cpu,
    refetchInterval: opReady ? 5000 : false,
    retry: false,
  });
  const memV = useQuery({
    queryKey: ["cloud-vm-prom-mem", id, queries?.memory],
    queryFn: ({ signal }) => promQueryK8s(queries!.memory!, signal),
    enabled: opReady && !!metricsQ.data?.available && !!queries?.memory,
    refetchInterval: opReady ? 5000 : false,
    retry: false,
  });
  const showHy2ClientTraffic = cfg?.software?.installHysteria2 === true;

  const rxV = useQuery({
    queryKey: ["cloud-vm-prom-rx", id, queries?.netRx],
    queryFn: ({ signal }) => promQueryK8s(queries!.netRx!, signal),
    enabled: opReady && !!metricsQ.data?.available && !!queries?.netRx && showHy2ClientTraffic,
    refetchInterval: opReady && showHy2ClientTraffic ? 5000 : false,
    retry: false,
  });
  const txV = useQuery({
    queryKey: ["cloud-vm-prom-tx", id, queries?.netTx],
    queryFn: ({ signal }) => promQueryK8s(queries!.netTx!, signal),
    enabled: opReady && !!metricsQ.data?.available && !!queries?.netTx && showHy2ClientTraffic,
    refetchInterval: opReady && showHy2ClientTraffic ? 5000 : false,
    retry: false,
  });

  const promOk = useMemo(() => {
    const cfgQ = metricsQ.data;
    if (!cfgQ?.available) return false;
    return !!(cfgQ.queries?.cpu && cfgQ.queries?.memory);
  }, [metricsQ.data]);

  const copyAccess = () => {
    if (!access) return;
    void navigator.clipboard.writeText(access);
    toast.success("已复制节点访问地址");
  };

  const doResetRootPassword = async () => {
    if (!Number.isFinite(id)) return;
    setResetPending(true);
    try {
      const r = await apiPostJson<{ newPassword?: string }>(
        `/api/app-center/cloud-vm/instances/${id}/reset-root-password`,
        {}
      );
      setResetConfirmOpen(false);
      setResetPlain(r.newPassword ?? "");
      setResetResultOpen(true);
      void qc.invalidateQueries({ queryKey: ["app-center-cloud-vm-instance", id] });
      void qc.invalidateQueries({ queryKey: ["cloud-vm-ssh-security-events"] });
      toast.success("已重置 root 密码");
    } catch (e) {
      toast.error(e instanceof ApiHttpError ? e.serverMessage : "重置失败");
    } finally {
      setResetPending(false);
    }
  };

  const executeDelete = async () => {
    if (!canWrite || !Number.isFinite(id)) return;
    setDeleteConfirmOpen(false);
    setDeleting(true);
    try {
      await apiDelete(`/api/app-center/cloud-vm/instances/${id}`);
      toast.success("已删除");
      navigate("/cluster/apps/cloud-vm", { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  };

  if (!Number.isFinite(id) || id <= 0) {
    return <p className="text-sm text-slate-500">无效 ID</p>;
  }

  if (detailQ.isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        加载…
      </p>
    );
  }

  if (detailQ.isError || !detailQ.data) {
    return (
      <p className="text-sm text-red-600">
        无法加载实例（可能已删除）。{" "}
        <Link to="/cluster/apps/cloud-vm" className="underline">
          返回列表
        </Link>
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild className="gap-1.5">
          <Link to="/cluster/apps/cloud-vm">
            <ArrowLeft className="h-4 w-4" />
            返回列表
          </Link>
        </Button>
        {status?.role === "admin" && (
          <Button variant="outline" size="sm" asChild>
            <Link to="/cluster/apps/cloud-vm/bootstrap">镜像引导配置</Link>
          </Button>
        )}
      </div>

      <div className="rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-indigo-50/30 px-4 py-3 shadow-sm sm:px-5 sm:py-4">
        <h1 className="text-lg font-semibold leading-snug text-slate-900 sm:text-xl">{detailQ.data.name}</h1>
        <p className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-xs text-slate-500">
          <span>ns/{detailQ.data.namespace}</span>
          {detailQ.data.createdAt ? (
            <span className="text-slate-400">
              创建于 {new Date(detailQ.data.createdAt).toLocaleString()}
            </span>
          ) : null}
          {opReady && cfg?.phase === "running" ? (
            <Badge className="border-emerald-600/40 bg-emerald-50 font-sans text-emerald-900">运行中</Badge>
          ) : (
            <Badge
              variant="outline"
              className="border-amber-500/70 bg-amber-50 font-sans font-normal text-amber-950"
            >
              部署中
            </Badge>
          )}
        </p>
        {!opReady && !detailQ.data.readiness?.message?.trim() ? (
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50/90 px-2.5 py-1.5 text-[11px] leading-snug text-amber-950">
            Pod 正在初始化（首次会安装 OpenSSH 等），就绪后可使用 SSH、复制访问地址与保存初始化脚本。
          </p>
        ) : null}
        <div className="mt-2.5 flex flex-col gap-2 lg:flex-row lg:items-start">
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              className="gap-1.5 bg-sky-600 hover:bg-sky-700"
              disabled={legacyViewer || !opReady}
              onClick={() => setSshOpen(true)}
            >
              <Terminal className="h-3.5 w-3.5" />
              SSH 终端
            </Button>
            {access && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={!opReady}
                onClick={copyAccess}
              >
                <Copy className="h-3.5 w-3.5" />
                复制 {access}
              </Button>
            )}
            {canWrite && (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5 border-amber-300 text-amber-950 hover:bg-amber-50"
                  disabled={!opReady || resetPending}
                  onClick={() => setResetConfirmOpen(true)}
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  忘记 root 密码
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5 border-violet-200 text-violet-950 hover:bg-violet-50"
                  disabled={scaleMut.isPending}
                  onClick={() => setScaleOpen(true)}
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                  资源扩容
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  className="gap-1.5"
                  disabled={deleting}
                  onClick={() => setDeleteConfirmOpen(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  删除
                </Button>
              </>
            )}
          </div>
          {!opReady && detailQ.data.readiness ? (
            <CloudVmDeployProgress
              r={detailQ.data.readiness}
              onRefresh={() => void detailQ.refetch()}
              refreshing={detailQ.isFetching}
            />
          ) : null}
        </div>
        {legacyViewer && (
          <p className="mt-1.5 text-[11px] text-amber-800">旧版只读账号无法使用 Web SSH。</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-800">规格与镜像</h2>
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">镜像</dt>
              <dd className="max-w-[65%] truncate font-mono text-xs text-slate-800">{cfg?.image ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">CPU</dt>
              <dd className="font-mono text-xs">
                req {cfg?.cpuRequest ?? "—"} / lim {cfg?.cpuLimit ?? "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">内存</dt>
              <dd className="font-mono text-xs">
                req {cfg?.memRequest ?? "—"} / lim {cfg?.memLimit ?? "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">数据盘 PVC</dt>
              <dd className="font-mono text-xs">{cfg?.pvcSize ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">StorageClass</dt>
              <dd className="font-mono text-xs">{cfg?.storageClassName ?? "—"}</dd>
            </div>
            {cfg?.software &&
            (cfg.software.installDocker ||
              cfg.software.installNginx ||
              cfg.software.installBaota ||
              cfg.software.installHysteria2 ||
              (cfg.software.cliPackages?.length ?? 0) > 0) ? (
              <div className="flex flex-col gap-1 border-t border-slate-100 pt-2 sm:flex-row sm:justify-between sm:gap-2">
                <dt className="shrink-0 text-slate-500">创建时预选软件</dt>
                <dd className="min-w-0 text-xs text-slate-700 sm:text-right">
                  {[
                    cfg.software.installDocker && "Docker",
                    cfg.software.installNginx && "Nginx",
                    cfg.software.installBaota && "宝塔",
                    cfg.software.installHysteria2 && "Hysteria2 客户端",
                  ]
                    .filter(Boolean)
                    .join("、") || "—"}
                  {(cfg.software.cliPackages?.length ?? 0) > 0 ? (
                    <span className="mt-1 block font-mono text-[11px] text-slate-600 sm:text-right">
                      CLI: {cfg.software.cliPackages!.join(", ")}
                    </span>
                  ) : null}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-800">集群外访问</h2>
          <p className="mt-2 text-xs text-slate-600">
            使用节点 IP + NodePort，以 <strong>root</strong> 与创建时密码登录（仅保存在服务端加密存储）。镜像引导中可指定默认节点，便于统一出口 IP。
          </p>
          <p className="mt-2 font-mono text-sm text-slate-900">{access ?? "—"}</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:col-span-2 xl:col-span-1">
          <h2 className="text-sm font-semibold text-slate-800">Service（SVC）</h2>
          <p className="mt-1 text-xs text-slate-600">
            NodePort 类型时可在集群内用 <code className="rounded bg-slate-100 px-0.5">ns/svc</code> 查找；集群外 SSH 用上方 IP:NodePort。
          </p>
          {svc && Object.keys(svc).length > 0 ? (
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">名称</dt>
                <dd className="font-mono text-xs text-slate-900">
                  {svc.namespace}/{svc.name ?? "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">类型</dt>
                <dd className="font-mono text-xs">{svc.type ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Cluster IP</dt>
                <dd className="font-mono text-xs">{svc.clusterIP ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">端口</dt>
                <dd className="font-mono text-xs">
                  {svc.port != null ? `${svc.port}` : "—"}
                  {svc.nodePort ? ` → NodePort ${svc.nodePort}` : ""}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-2 text-xs text-slate-400">暂无（K8s 未连接或 Service 未创建）</p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-800">初始化脚本</h2>
        <p className="mt-1 text-xs text-slate-600">
          每次 Pod 启动时在安装 OpenSSH 之后、启动 sshd 之前执行（bash）。内容保存在平台并写入 Secret，Pod 重建或滚动更新后会再次执行，无需改基础镜像。
        </p>
        {cfg?.command && cfg.command.length > 0 ? (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            当前实例使用了<strong>自定义启动命令</strong>，平台不会挂载默认初始化脚本；下方内容为库中记录，需自行在启动流程中处理。
          </p>
        ) : null}
        {canWrite && !(cfg?.command && cfg.command.length) ? (
          <div className="mt-3 space-y-3">
            <div className="space-y-2">
              <Label className="text-xs text-slate-600">脚本内容</Label>
              <Textarea
                value={initDraft}
                onChange={(e) => setInitDraft(e.target.value)}
                className="min-h-[160px] font-mono text-xs"
                placeholder="#!/bin/bash&#10;apt-get update -qq && apt-get install -y -qq ..."
              />
            </div>
            <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
              <Label htmlFor="cloud-vm-root-pw-sync" className="text-xs text-slate-700">
                同步 root 密码（选填）
              </Label>
              <Input
                id="cloud-vm-root-pw-sync"
                type="password"
                autoComplete="new-password"
                value={rootPasswordDraft}
                onChange={(e) => setRootPasswordDraft(e.target.value)}
                placeholder="至少 8 位；留空则不修改"
                className="max-w-md font-mono text-sm"
              />
              <p className="text-[11px] leading-relaxed text-slate-600">
                写入集群 Secret <code className="rounded bg-white px-0.5">root-password</code> 与平台加密库字段，并触发展开使 Pod
                挂载新密码。可与上方脚本<strong>一并保存</strong>，或只填密码后点「仅同步 root 密码」。
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={
                    saveRootPasswordOnlyMut.isPending ||
                    !opReady ||
                    rootPasswordDraft.trim().length < 8
                  }
                  onClick={() => saveRootPasswordOnlyMut.mutate()}
                >
                  {saveRootPasswordOnlyMut.isPending ? "同步中…" : "仅同步 root 密码"}
                </Button>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              className="bg-sky-600 hover:bg-sky-700"
              disabled={saveInitMut.isPending || !opReady}
              onClick={() => saveInitMut.mutate()}
            >
              {saveInitMut.isPending ? "保存中…" : "保存并应用（滚动更新）"}
            </Button>
          </div>
        ) : (
          <pre className="mt-3 max-h-48 overflow-auto rounded-lg border border-slate-100 bg-slate-50 p-3 font-mono text-[11px] text-slate-700 whitespace-pre-wrap">
            {cfg?.initScript?.trim() ? cfg.initScript : "（未配置）"}
          </pre>
        )}
        {canWrite && cfg?.command && cfg.command.length > 0 ? (
          <div className="mt-4 space-y-1.5 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
            <Label htmlFor="cloud-vm-root-pw-sync-cmd" className="text-xs text-slate-700">
              同步 root 密码（自定义启动命令实例）
            </Label>
            <Input
              id="cloud-vm-root-pw-sync-cmd"
              type="password"
              autoComplete="new-password"
              value={rootPasswordDraft}
              onChange={(e) => setRootPasswordDraft(e.target.value)}
              placeholder="至少 8 位"
              className="max-w-md font-mono text-sm"
            />
            <p className="text-[11px] text-slate-600">
              仅更新 Secret 与库密文并滚动 Pod；不修改启动命令。
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={
                saveRootPasswordOnlyMut.isPending ||
                !opReady ||
                rootPasswordDraft.trim().length < 8
              }
              onClick={() => saveRootPasswordOnlyMut.mutate()}
            >
              {saveRootPasswordOnlyMut.isPending ? "同步中…" : "仅同步 root 密码"}
            </Button>
          </div>
        ) : null}
      </div>

      {!(cfg?.command && cfg.command.length) ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <LogoHysteria2 className="h-8 w-8" />
            Hysteria2 客户端（可选）
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            与初始化脚本一并保存：可粘贴整行 <code className="rounded bg-slate-100 px-0.5">hysteria2://</code> / <code className="rounded bg-slate-100 px-0.5">hy2://</code> 分享链接或手写 YAML 至 Secret，运行{" "}
            <code className="rounded bg-slate-100 px-0.5">hysteria client</code>；将配置中 <code className="rounded bg-slate-100 px-0.5">127.0.0.1</code> 的本地 listen 改为{" "}
            <code className="rounded bg-slate-100 px-0.5">0.0.0.0</code>，并暴露下方端口（TCP）与集群内 Service。二进制由<strong>云主机镜像引导</strong>中的全局下载 URL 按架构拉取（含镜像站回退）；可在 Deployment 环境变量中设置{" "}
            <code className="rounded bg-slate-100 px-0.5">HTTPS_PROXY</code> 辅助下载。
          </p>
          <p className="mt-2 rounded-lg border border-fuchsia-100 bg-fuchsia-50/50 px-2 py-1.5 text-[11px] text-fuchsia-950/90">
            列表与详情接口<strong>不返回</strong>分享链接与客户端 YAML 明文。具备「查看 Hysteria2 客户端」权限的用户需<strong>验证当前平台登录密码</strong>后方可在此查看或编辑已保存内容。
          </p>
          {canWrite ? (
            <div className="mt-3 space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={hyDraft.installHysteria2}
                  onChange={(e) => setHyDraft((h) => ({ ...h, installHysteria2: e.target.checked }))}
                />
                启用 Hysteria2 客户端
              </label>
              {hyDraft.installHysteria2 ? (
                <>
                  <div className="max-w-xs space-y-1">
                    <Label className="text-xs">本地 inbound 端口（与 YAML / 分享链接展开后一致）</Label>
                    <Input
                      type="number"
                      value={hyDraft.hysteria2ListenPort}
                      onChange={(e) =>
                        setHyDraft((h) => ({
                          ...h,
                          hysteria2ListenPort: parseInt(e.target.value, 10) || 8080,
                        }))
                      }
                      className="font-mono text-sm"
                    />
                  </div>
                  {hyYamlVisible ? (
                    <div>
                      <Label className="text-xs">分享链接或 YAML</Label>
                      <Textarea
                        value={hyDraft.hysteria2ConfigYaml}
                        onChange={(e) =>
                          setHyDraft((h) => ({ ...h, hysteria2ConfigYaml: e.target.value }))
                        }
                        placeholder="hysteria2://... 整行粘贴，或多行客户端 YAML"
                        className="mt-1 min-h-[180px] font-mono text-xs"
                        spellCheck={false}
                        readOnly={canRevealHysteria ? false : hyStored}
                      />
                      {!canRevealHysteria && hyStored ? (
                        <p className="mt-1 text-[11px] text-slate-600">
                          当前账号无权查看或修改已保存的明文配置；仅可调整上方端口，保存后集群内原 YAML 将保留。
                        </p>
                      ) : null}
                    </div>
                  ) : hyStored ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-xs text-slate-700">
                      <p className="text-[11px] leading-relaxed">
                        客户端配置已写入集群 Secret，界面默认不展示。请验证平台密码后查看或编辑。
                      </p>
                      {canRevealHysteria ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="mt-2"
                          onClick={() => setHyRevealOpen(true)}
                        >
                          验证密码查看配置
                        </Button>
                      ) : (
                        <p className="mt-2 text-[11px] text-amber-900/90">
                          你的账号未开通「查看 Hysteria2 客户端」权限，请联系管理员在平台用户权限中开启。
                        </p>
                      )}
                    </div>
                  ) : (
                    <div>
                      <Label className="text-xs">分享链接或 YAML</Label>
                      <Textarea
                        value={hyDraft.hysteria2ConfigYaml}
                        onChange={(e) =>
                          setHyDraft((h) => ({ ...h, hysteria2ConfigYaml: e.target.value }))
                        }
                        placeholder="hysteria2://... 整行粘贴，或多行客户端 YAML"
                        className="mt-1 min-h-[180px] font-mono text-xs"
                        spellCheck={false}
                      />
                    </div>
                  )}
                </>
              ) : null}
              <Button
                type="button"
                size="sm"
                className="bg-fuchsia-600 hover:bg-fuchsia-700"
                disabled={saveInitMut.isPending || !opReady}
                onClick={() => saveInitMut.mutate()}
              >
                {saveInitMut.isPending ? "保存中…" : "保存 Hysteria2 客户端与初始化脚本"}
              </Button>
            </div>
          ) : (
            <div className="mt-2 space-y-1 text-xs text-slate-500">
              <p>只读账号不可编辑。</p>
              {cfg?.software?.installHysteria2 && hyStored && !canRevealHysteria ? (
                <p className="text-[11px] text-slate-600">已启用客户端；无「查看 Hysteria2 客户端」权限时不展示配置明文。</p>
              ) : null}
              {cfg?.software?.installHysteria2 && canRevealHysteria ? (
                <>
                  <Button type="button" size="sm" variant="outline" className="mt-1" onClick={() => setHyRevealOpen(true)}>
                    验证密码仅查看（只读）
                  </Button>
                  {hyYamlVisible ? (
                    <Textarea
                      readOnly
                      value={hyDraft.hysteria2ConfigYaml}
                      className="mt-2 min-h-[160px] font-mono text-[11px]"
                      spellCheck={false}
                    />
                  ) : null}
                </>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Gauge className="h-4 w-4" />
          资源监控
        </h2>
        {!metricsQ.data?.available && (
          <p className="text-sm text-slate-600">
            {metricsQ.data?.hint ?? "未配置 Kubernetes Prometheus 或暂无数据。"}
          </p>
        )}
        {metricsQ.data?.available && !promOk && (
          <p className="text-sm text-amber-800">查询模板不完整。</p>
        )}
        {promOk && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                <Cpu className="h-8 w-8 shrink-0 text-sky-600" />
                <div>
                  <p className="text-xs text-slate-500">CPU 使用（核）</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {cpuV.data != null ? cpuV.data.toFixed(3) : "—"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                <HardDrive className="h-8 w-8 shrink-0 text-violet-600" />
                <div>
                  <p className="text-xs text-slate-500">内存工作集</p>
                  <p className="text-lg font-semibold tabular-nums">{fmtBytes(memV.data)}</p>
                </div>
              </div>
            </div>
            {showHy2ClientTraffic ? (
              <div className="rounded-lg border border-fuchsia-200/80 bg-fuchsia-50/40 p-3">
                <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-fuchsia-950">
                  <LogoHysteria2 className="h-6 w-6" />
                  Hysteria2 客户端流量（Pod 网卡）
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex items-center gap-3 rounded-lg border border-fuchsia-100 bg-white/90 p-3">
                    <Network className="h-8 w-8 shrink-0 text-emerald-600" />
                    <div>
                      <p className="text-xs text-slate-500">入网速率</p>
                      <p className="text-lg font-semibold tabular-nums">{fmtRatePerSec(rxV.data)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border border-fuchsia-100 bg-white/90 p-3">
                    <Network className="h-8 w-8 shrink-0 text-amber-600" />
                    <div>
                      <p className="text-xs text-slate-500">出网速率</p>
                      <p className="text-lg font-semibold tabular-nums">{fmtRatePerSec(txV.data)}</p>
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-fuchsia-900/80">
                  指标为该云主机 Pod 在数据面的收发速率（与 SSH、客户端隧道等共用网络命名空间）；可反映 Hysteria2 客户端的大致负载。未勾选安装客户端时不显示本区块。
                </p>
              </div>
            ) : null}
          </div>
        )}
        <p className="mt-3 text-[11px] text-slate-500">
          指标由服务端代理 Prometheus（cAdvisor / 容器网络），浏览器使用 POST 且不暴露 PromQL；若出现 502，请检查运行时{" "}
          <code className="rounded bg-slate-100 px-1">prometheusUrlK8s</code> 从本服务进程是否可达（与云主机 SSH 无直接关系）。
        </p>
      </div>

      <Dialog
        open={hyRevealOpen}
        onOpenChange={(o) => {
          setHyRevealOpen(o);
          if (!o) setHyRevealPassword("");
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>验证平台密码</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-600">
            查看已保存的 Hysteria2 客户端分享链接或 YAML 前，需确认当前账号的<strong>平台登录密码</strong>（本地密码账号；OIDC 无本地密码时无法使用此方式）。
          </p>
          <Input
            type="password"
            autoComplete="current-password"
            value={hyRevealPassword}
            onChange={(e) => setHyRevealPassword(e.target.value)}
            placeholder="平台登录密码"
            className="font-mono text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") void revealHysteriaClient();
            }}
          />
          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setHyRevealOpen(false)}>
              取消
            </Button>
            <Button type="button" disabled={hyRevealPending} onClick={() => void revealHysteriaClient()}>
              {hyRevealPending ? "验证中…" : "确认查看"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={scaleOpen} onOpenChange={setScaleOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>资源扩容</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-600">
            调整 CPU/内存会更新 Deployment 并触发滚动重启。数据盘仅支持<strong>上调</strong> PVC 声明容量，且依赖 StorageClass{" "}
            <code className="rounded bg-slate-100 px-0.5">allowVolumeExpansion</code> 与 CSI；文件系统扩展视驱动与节点而定。
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">CPU request</Label>
              <Input
                className="mt-1 font-mono text-sm"
                value={scaleDraft.cpuRequest}
                onChange={(e) => setScaleDraft((d) => ({ ...d, cpuRequest: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">CPU limit</Label>
              <Input
                className="mt-1 font-mono text-sm"
                value={scaleDraft.cpuLimit}
                onChange={(e) => setScaleDraft((d) => ({ ...d, cpuLimit: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">内存 request</Label>
              <Input
                className="mt-1 font-mono text-sm"
                value={scaleDraft.memRequest}
                onChange={(e) => setScaleDraft((d) => ({ ...d, memRequest: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">内存 limit</Label>
              <Input
                className="mt-1 font-mono text-sm"
                value={scaleDraft.memLimit}
                onChange={(e) => setScaleDraft((d) => ({ ...d, memLimit: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">数据盘 PVC 容量（仅增大时提交变更）</Label>
              <Input
                className="mt-1 font-mono text-sm"
                value={scaleDraft.pvcSize}
                onChange={(e) => setScaleDraft((d) => ({ ...d, pvcSize: e.target.value }))}
                placeholder="例如 50Gi"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setScaleOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              className="bg-violet-600 hover:bg-violet-700"
              disabled={scaleMut.isPending}
              onClick={() => scaleMut.mutate()}
            >
              {scaleMut.isPending ? "提交中…" : "应用"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除该云主机？</AlertDialogTitle>
            <AlertDialogDescription>
              将删除实例及其<strong className="text-slate-900">数据卷（PVC）</strong>、网络访问（Service/NodePort）与
              <strong className="text-slate-900">访问凭据</strong>，此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={(e) => {
                e.preventDefault();
                void executeDelete();
              }}
            >
              {deleting ? "删除中…" : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>重置 root 密码？</AlertDialogTitle>
            <AlertDialogDescription>
              将生成新的 root 密码、更新集群 Secret 并滚动重启 Pod。请在下个对话框中<strong>保存明文密码</strong>。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={resetPending}
              className="bg-amber-600 text-white hover:bg-amber-700"
              onClick={(e) => {
                e.preventDefault();
                void doResetRootPassword();
              }}
            >
              {resetPending ? "处理中…" : "确认重置"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={resetResultOpen} onOpenChange={setResetResultOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>新 root 密码（仅显示一次）</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-600">
            请复制保存至安全位置；关闭后需重新重置才能再次查看。
          </p>
          <Input readOnly className="font-mono text-sm" value={resetPlain} />
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(resetPlain);
                  toast.success("已复制");
                } catch {
                  toast.error("复制失败，请手动选择复制");
                }
              }}
            >
              复制密码
            </Button>
            <Button type="button" onClick={() => setResetResultOpen(false)}>
              已保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CloudVmSshTerminalSheet open={sshOpen} onOpenChange={setSshOpen} instanceId={id} />
    </div>
  );
}

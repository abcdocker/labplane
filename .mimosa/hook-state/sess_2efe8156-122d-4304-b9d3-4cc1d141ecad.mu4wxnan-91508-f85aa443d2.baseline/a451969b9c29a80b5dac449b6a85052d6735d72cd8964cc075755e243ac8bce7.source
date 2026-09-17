import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { YamlEditor } from "@/components/YamlEditor";
import { apiGetJson, apiPostJson, apiPutJson } from "@/lib/api";
import {
  getConfigMapValueEditorMode,
  normalizeConfigMapDataValue,
  shouldValidateConfigMapYamlKey,
} from "@/lib/configmap-data";
import { cn } from "@/lib/utils";
import type { K8sNodesListResponse, NodeRow } from "../types";
import {
  applySchedulingNodeNames,
  readSchedulingNodeNames,
  K8S_NODE_HOSTNAME_LABEL,
} from "./k8sGraphicNodeScheduling";
import {
  formatSchedulingPrecheckError,
  schedulingPrecheckObject,
} from "../workloadSchedulingPrecheck";
import {
  WORKLOAD_GRAPHIC_SAVE_PIPELINE_HINT,
  workloadApplyPipelineLabel,
  workloadApplyPipelineProgress,
  type WorkloadApplyPipelineStep,
} from "../workloadApplyPipeline";

export type K8sGraphicKind =
  | "Deployment"
  | "StatefulSet"
  | "DaemonSet"
  | "Service"
  | "ConfigMap"
  | "Secret";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: K8sGraphicKind;
  namespace: string;
  name: string;
  onSuccess: () => void;
  /** 仅 kind=Service 时有效：图形创建新 Service（无需已有 name） */
  serviceMode?: "edit" | "create";
};

function deepClone<T>(o: T): T {
  return JSON.parse(JSON.stringify(o)) as T;
}

/** 图形化「网络模式」与 spec.type 对应；Ingress 在 K8s 中仍为 ClusterIP，由 Ingress 资源对外暴露 */
export type ServiceGraphicExposure =
  | "clusterip"
  | "nodeport"
  /** NodePort + externalTrafficPolicy=Local，常与 Pod hostNetwork 或仅本机 Endpoint 搭配 */
  | "hostnetwork"
  | "ingress"
  | "loadbalancer"
  | "externalname";

function serviceExposureFromSpecType(raw: unknown): ServiceGraphicExposure {
  const t = typeof raw === "string" ? raw.trim() : "";
  const u = t.toLowerCase();
  if (u === "nodeport") return "nodeport";
  if (u === "loadbalancer") return "loadbalancer";
  if (u === "externalname") return "externalname";
  return "clusterip";
}

/** 结合 externalTrafficPolicy 区分普通 NodePort 与 Host 网络场景 */
function serviceExposureFromServiceSpec(spec: Record<string, unknown> | undefined): ServiceGraphicExposure {
  const t = typeof spec?.type === "string" ? spec.type.trim() : "";
  const u = t.toLowerCase();
  if (u === "nodeport") {
    const etp =
      typeof spec?.externalTrafficPolicy === "string" ? spec.externalTrafficPolicy.trim() : "";
    if (etp === "Local") return "hostnetwork";
    return "nodeport";
  }
  return serviceExposureFromSpecType(spec?.type);
}

function k8sServiceTypeFromExposure(e: ServiceGraphicExposure): string {
  switch (e) {
    case "ingress":
    case "clusterip":
      return "ClusterIP";
    case "hostnetwork":
    case "nodeport":
      return "NodePort";
    case "loadbalancer":
      return "LoadBalancer";
    case "externalname":
      return "ExternalName";
    default:
      return "ClusterIP";
  }
}

/** ClusterIP / Ingress / ExternalName 下端口条目不应带 nodePort，否则常见集群会拒绝更新 */
function normalizeServicePortsForK8sType(k8sType: string, ports: unknown): unknown {
  if (!Array.isArray(ports)) return ports;
  const strip = k8sType === "ClusterIP" || k8sType === "ExternalName";
  if (!strip) return ports;
  return ports.map((p) => {
    if (p === null || typeof p !== "object") return p;
    const o = { ...(p as Record<string, unknown>) };
    delete o.nodePort;
    return o;
  });
}

const SERVICE_EXPOSURE_OPTIONS: { value: ServiceGraphicExposure; label: string }[] = [
  { value: "clusterip", label: "ClusterIP（标准，仅集群内访问）" },
  { value: "nodeport", label: "NodePort（标准，节点 IP + 端口，流量策略 Cluster）" },
  {
    value: "hostnetwork",
    label: "Host 网络场景（NodePort + Local：仅转发到本机 Endpoint，常配 Pod hostNetwork）",
  },
  { value: "ingress", label: "Ingress 场景（保存为 ClusterIP，对外由 Ingress 反代）" },
  { value: "loadbalancer", label: "LoadBalancer（云负载均衡）" },
  { value: "externalname", label: "ExternalName（外部 DNS 名）" },
];

type ServicePortFormRow = {
  clientId: string;
  name: string;
  port: string;
  targetPort: string;
  protocol: string;
  nodePort: string;
};

function newServicePortRow(): ServicePortFormRow {
  return {
    clientId: globalThis.crypto?.randomUUID?.() ?? `sp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name: "",
    port: "",
    targetPort: "",
    protocol: "TCP",
    nodePort: "",
  };
}

function k8sPortsToFormRows(ports: unknown): ServicePortFormRow[] {
  if (!Array.isArray(ports) || ports.length === 0) {
    return [newServicePortRow()];
  }
  return ports.map((p, i) => {
    const o = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
    const tp = o.targetPort;
    let targetStr = "";
    if (typeof tp === "number" && Number.isFinite(tp)) targetStr = String(tp);
    else if (typeof tp === "string") targetStr = tp;
    const np = o.nodePort;
    let nodeStr = "";
    if (typeof np === "number" && Number.isFinite(np)) nodeStr = String(np);
    else if (typeof np === "string") nodeStr = np;
    const pr = o.port;
    const portStr = typeof pr === "number" && Number.isFinite(pr) ? String(pr) : typeof pr === "string" ? pr : "";
    return {
      clientId: globalThis.crypto?.randomUUID?.() ?? `sp-${i}-${Date.now()}`,
      name: typeof o.name === "string" ? o.name : "",
      port: portStr,
      targetPort: targetStr,
      protocol: typeof o.protocol === "string" && o.protocol.trim() ? o.protocol.trim() : "TCP",
      nodePort: nodeStr,
    };
  });
}

/** 由表单行生成 spec.ports；无有效 port 的行会被跳过 */
function servicePortsFromFormRows(rows: ServicePortFormRow[], k8sType: string): unknown[] {
  const allowNodePort = k8sType === "NodePort" || k8sType === "LoadBalancer";
  const out: Record<string, unknown>[] = [];
  for (const r of rows) {
    const portNum = parseInt(String(r.port).trim(), 10);
    if (!Number.isFinite(portNum) || portNum < 1 || portNum > 65535) continue;
    let proto = String(r.protocol || "TCP").trim().toUpperCase();
    if (proto !== "TCP" && proto !== "UDP" && proto !== "SCTP") proto = "TCP";
    const entry: Record<string, unknown> = { port: portNum, protocol: proto };
    const nm = r.name.trim();
    if (nm) entry.name = nm;
    const tpRaw = r.targetPort.trim();
    if (tpRaw) {
      const tpNum = parseInt(tpRaw, 10);
      if (
        Number.isFinite(tpNum) &&
        tpNum >= 1 &&
        tpNum <= 65535 &&
        String(tpNum) === tpRaw.trim()
      ) {
        entry.targetPort = tpNum;
      } else {
        entry.targetPort = tpRaw;
      }
    } else {
      entry.targetPort = portNum;
    }
    if (allowNodePort) {
      const np = parseInt(String(r.nodePort).trim(), 10);
      if (Number.isFinite(np) && np >= 1 && np <= 65535) entry.nodePort = np;
    }
    out.push(entry);
  }
  return out;
}

function WorkloadNodeScheduleFields({
  loading,
  error,
  nodes,
  selected,
  onToggle,
  onClear,
}: {
  loading: boolean;
  error: Error | null;
  nodes: NodeRow[] | undefined;
  selected: string[];
  onToggle: (nodeName: string) => void;
  onClear: () => void;
}) {
  const sorted = useMemo(() => {
    if (!nodes?.length) return [];
    return [...nodes].sort((a, b) => a.name.localeCompare(b.name));
  }, [nodes]);

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <Label className="text-sm font-medium text-slate-800">调度节点</Label>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
            按 Kubernetes Node 的 <span className="font-mono">{K8S_NODE_HOSTNAME_LABEL}</span> 匹配调度：勾选 1 个节点时写入{" "}
            <span className="font-mono">nodeSelector</span>；勾选多个时写入{" "}
            <span className="font-mono">nodeAffinity.required</span>（hostname In）。其它{" "}
            <span className="font-mono">nodeSelector</span> 键保留；复杂 affinity 请用 YAML。
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 text-xs"
          disabled={selected.length === 0}
          onClick={onClear}
        >
          清空
        </Button>
      </div>
      {loading && (
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          加载节点列表…
        </p>
      )}
      {error && <p className="text-xs text-red-600">{error.message}</p>}
      {!loading && !error && sorted.length === 0 && (
        <p className="text-xs text-slate-500">未获取到节点（需集群 list nodes 权限）。</p>
      )}
      <div className="max-h-52 space-y-0.5 overflow-y-auto rounded-md border border-slate-200/80 bg-white p-2">
        {sorted.map((n) => (
          <label
            key={n.name}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-slate-50"
          >
            <Checkbox
              checked={selected.includes(n.name)}
              onCheckedChange={() => onToggle(n.name)}
              className="shrink-0"
            />
            <span className="font-mono text-xs font-semibold text-slate-900">{n.name}</span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{n.ready}</span>
            {n.internalIP ? (
              <span className="font-mono text-[10px] text-slate-400">{n.internalIP}</span>
            ) : null}
          </label>
        ))}
      </div>
    </div>
  );
}

async function validateConfigMapYamlForSave(cmData: Record<string, string>): Promise<string | null> {
  const entries = Object.entries(cmData).filter(
    ([k, v]) => shouldValidateConfigMapYamlKey(k) && v.trim() !== ""
  );
  if (entries.length === 0) return null;
  for (const [key, yaml] of entries) {
    const res = await apiPostJson<{ ok?: boolean; error?: string }>(
      "/api/prometheus/validate-config-yaml",
      { yaml }
    );
    if (!res.ok) {
      return `键「${key}」YAML 校验未通过：${res.error ?? "语法错误"}`;
    }
  }
  return null;
}

export function K8sGraphicEditDialog({
  open,
  onOpenChange,
  kind,
  namespace,
  name,
  onSuccess,
  serviceMode = "edit",
}: Props) {
  const svcIsCreate = kind === "Service" && serviceMode === "create";
  const loadQ = useQuery({
    queryKey: ["k8s-object-json", kind, namespace, name],
    queryFn: ({ signal }) =>
      apiGetJson<{ object: Record<string, unknown> }>(
        `/api/k8s/object-json?kind=${encodeURIComponent(kind)}&namespace=${encodeURIComponent(namespace)}&name=${encodeURIComponent(name)}`
      , { signal }),
    enabled: open && Boolean(namespace && name) && !svcIsCreate,
  });

  const obj = loadQ.data?.object;

  const nodesQ = useQuery({
    queryKey: ["k8s-nodes", "graphic-workload"],
    queryFn: ({ signal }) => apiGetJson<K8sNodesListResponse>("/api/k8s/nodes", { signal }),
    enabled: open && (kind === "Deployment" || kind === "StatefulSet" || kind === "DaemonSet"),
    staleTime: 60_000,
  });

  const [savePipelineStep, setSavePipelineStep] = useState<WorkloadApplyPipelineStep | null>(null);
  const [replicas, setReplicas] = useState(1);
  const [image, setImage] = useState("");
  /** 首个工作容器 resources：Kubernetes 数量格式，留空表示清除该项 */
  const [cpuRequest, setCpuRequest] = useState("");
  const [memoryRequest, setMemoryRequest] = useState("");
  const [cpuLimit, setCpuLimit] = useState("");
  const [memoryLimit, setMemoryLimit] = useState("");
  /** Deployment / StatefulSet / DaemonSet：spec.template.spec.hostNetwork */
  const [podTemplateHostNetwork, setPodTemplateHostNetwork] = useState(false);
  /** Deployment / StatefulSet / DaemonSet：按节点名调度（hostname 标签） */
  const [schedulingNodeNames, setSchedulingNodeNames] = useState<string[]>([]);

  const [svcExposure, setSvcExposure] = useState<ServiceGraphicExposure>("clusterip");
  const [svcPortRows, setSvcPortRows] = useState<ServicePortFormRow[]>(() => [newServicePortRow()]);
  const [createSvcName, setCreateSvcName] = useState("");
  const [createSelectorKey, setCreateSelectorKey] = useState("app");
  const [createSelectorValue, setCreateSelectorValue] = useState("");
  const [svcExternalName, setSvcExternalName] = useState("");

  const [cmData, setCmData] = useState<Record<string, string>>({});

  const [secType, setSecType] = useState("Opaque");
  const [secData, setSecData] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!obj) return;
    if (kind === "Deployment" || kind === "StatefulSet" || kind === "DaemonSet") {
      const spec = obj.spec as Record<string, unknown> | undefined;
      if (kind !== "DaemonSet") {
        const r = spec?.replicas;
        setReplicas(typeof r === "number" ? r : 1);
      }
      const tpl = spec?.template as Record<string, unknown> | undefined;
      const podSpec = tpl?.spec as Record<string, unknown> | undefined;
      const containers = podSpec?.containers as Record<string, unknown>[] | undefined;
      const img = containers?.[0]?.image;
      setImage(typeof img === "string" ? img : "");
      const c0 = containers?.[0] as Record<string, unknown> | undefined;
      const res = c0?.resources as
        | { requests?: Record<string, string>; limits?: Record<string, string> }
        | undefined;
      const req = res?.requests ?? {};
      const lim = res?.limits ?? {};
      setCpuRequest(typeof req.cpu === "string" ? req.cpu : "");
      setMemoryRequest(typeof req.memory === "string" ? req.memory : "");
      setCpuLimit(typeof lim.cpu === "string" ? lim.cpu : "");
      setMemoryLimit(typeof lim.memory === "string" ? lim.memory : "");
      setPodTemplateHostNetwork(podSpec?.hostNetwork === true);
      setSchedulingNodeNames(readSchedulingNodeNames(podSpec as Record<string, unknown>));
    }
    if (kind === "Service") {
      const spec = obj.spec as Record<string, unknown> | undefined;
      setSvcExposure(serviceExposureFromServiceSpec(spec));
      setSvcPortRows(k8sPortsToFormRows(spec?.ports));
      setSvcExternalName(typeof spec?.externalName === "string" ? spec.externalName : "");
    }
    if (kind === "ConfigMap") {
      const d = (obj as { data?: Record<string, unknown> }).data ?? {};
      const next: Record<string, string> = {};
      for (const [key, val] of Object.entries(d)) {
        if (typeof val === "string") {
          next[key] = normalizeConfigMapDataValue(val);
        } else if (val != null) {
          next[key] = normalizeConfigMapDataValue(String(val));
        }
      }
      setCmData(next);
    }
    if (kind === "Secret") {
      const o = obj as {
        type?: string;
        stringData?: Record<string, string>;
        data?: Record<string, string>;
      };
      setSecType(o.type || "Opaque");
      const sd: Record<string, string> = { ...(o.stringData ?? {}) };
      if (o.data) {
        for (const [k, v] of Object.entries(o.data)) {
          if (sd[k] != null) continue;
          try {
            const bin = atob(v);
            sd[k] = bin;
          } catch {
            sd[k] = "[base64 二进制，请在 YAML 中编辑]";
          }
        }
      }
      setSecData(sd);
    }
  }, [obj, kind]);

  useEffect(() => {
    if (!open || !svcIsCreate) return;
    setSvcExposure("clusterip");
    setSvcPortRows([newServicePortRow()]);
    setCreateSvcName("");
    setCreateSelectorKey("app");
    setCreateSelectorValue("");
    setSvcExternalName("");
  }, [open, svcIsCreate]);

  const buildCurrentPutBody = () =>
    buildPutBody(kind, svcIsCreate ? null : obj!, namespace, {
      replicas,
      image,
      cpuRequest,
      memoryRequest,
      cpuLimit,
      memoryLimit,
      podTemplateHostNetwork,
      schedulingNodeNames,
      svcExposure,
      svcPortRows,
      svcExternalName,
      serviceMode: svcIsCreate ? "create" : "edit",
      createSvcName,
      createSelectorKey,
      createSelectorValue,
      cmData,
      secType,
      secData,
    });

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!svcIsCreate && !obj) throw new Error("无数据");
      if (kind === "ConfigMap") {
        const yamlErr = await validateConfigMapYamlForSave(cmData);
        if (yamlErr) throw new Error(yamlErr);
      }
      const body = buildCurrentPutBody();
      try {
        if (kind === "Deployment" || kind === "StatefulSet") {
          setSavePipelineStep("precheck");
          await schedulingPrecheckObject(kind, body.object);
        }
        setSavePipelineStep("apply");
        return apiPutJson("/api/k8s/object-json", body);
      } finally {
        setSavePipelineStep(null);
      }
    },
    onSuccess: () => {
      if (kind === "Service" && svcIsCreate) {
        toast.success(`Service ${namespace}/${createSvcName.trim()} 已创建`);
      } else {
        toast.success(
          kind === "Deployment" || kind === "StatefulSet"
            ? `${kind} ${namespace}/${name} 已通过调度预检并保存`
            : `${kind} ${namespace}/${name} 已保存并生效`
        );
      }
      onSuccess();
      onOpenChange(false);
    },
    onError: (e) => {
      toast.error(formatSchedulingPrecheckError(e) || (e as Error).message || "保存失败");
    },
  });

  const title = useMemo(() => {
    if (svcIsCreate) return `图形创建 · Service · ${namespace}`;
    return `图形编辑 · ${kind} ${namespace}/${name}`;
  }, [kind, namespace, name, svcIsCreate]);

  const allowSvcNodePortCol =
    svcExposure === "nodeport" || svcExposure === "loadbalancer" || svcExposure === "hostnetwork";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[92vh] w-full max-w-[calc(100%-2rem)] flex-col gap-3",
          kind === "ConfigMap"
            ? "overflow-hidden sm:max-w-6xl"
            : kind === "Deployment" ||
                kind === "StatefulSet" ||
                kind === "DaemonSet" ||
                kind === "Service"
              ? "overflow-y-auto sm:max-w-3xl"
              : "overflow-y-auto sm:max-w-2xl"
        )}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {!svcIsCreate && loadQ.isLoading && (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载资源…
          </p>
        )}
        {!svcIsCreate && loadQ.isError && (
          <p className="text-sm text-red-600">{(loadQ.error as Error).message}</p>
        )}
        {obj && (kind === "Deployment" || kind === "StatefulSet" || kind === "DaemonSet") && (
          <WorkloadNodeScheduleFields
            loading={nodesQ.isLoading}
            error={nodesQ.error as Error | null}
            nodes={nodesQ.data?.nodes}
            selected={schedulingNodeNames}
            onToggle={(nodeName) => {
              setSchedulingNodeNames((prev) =>
                prev.includes(nodeName)
                  ? prev.filter((x) => x !== nodeName)
                  : [...prev, nodeName].sort((a, b) => a.localeCompare(b))
              );
            }}
            onClear={() => setSchedulingNodeNames([])}
          />
        )}
        {obj && (kind === "Deployment" || kind === "DaemonSet") && (
          <div className="space-y-4">
            {kind === "Deployment" && (
              <div className="space-y-2">
                <Label>副本数 spec.replicas</Label>
                <Input
                  type="number"
                  min={0}
                  value={replicas}
                  onChange={(e) => setReplicas(parseInt(e.target.value, 10) || 0)}
                />
              </div>
            )}
            {kind === "DaemonSet" && (
              <p className="rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-600">
                DaemonSet 无 <span className="font-mono">spec.replicas</span>；副本数由集群调度与节点选择器决定，扩缩请用 YAML 或修改节点亲和等。
              </p>
            )}
            <div className="space-y-2">
              <Label>首个容器镜像 spec.template.spec.containers[0].image</Label>
              <Input value={image} onChange={(e) => setImage(e.target.value)} className="font-mono text-xs" />
            </div>
            <div className="flex flex-row items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5">
              <div className="min-w-0 space-y-0.5">
                <Label htmlFor="workload-gfx-hostnetwork" className="text-sm font-medium text-slate-800">
                  Host 网络模式
                </Label>
                <p className="text-[11px] leading-snug text-slate-500">
                  对应 <span className="font-mono">spec.template.spec.hostNetwork</span>
                  。开启后 Pod 使用节点网络栈；详情页会列出模板端口便于核对节点上映射。访问 Service 时常见搭配为 NodePort +{" "}
                  <span className="font-mono">externalTrafficPolicy: Local</span>。{" "}
                  <span className="font-mono">dnsPolicy</span> 等其它字段仍可在 YAML 中改。
                </p>
              </div>
              <Switch
                id="workload-gfx-hostnetwork"
                checked={podTemplateHostNetwork}
                onCheckedChange={setPodTemplateHostNetwork}
                className="shrink-0"
              />
            </div>
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
              <p className="text-xs font-medium text-slate-700">
                首个容器资源 requests / limits（cpu、memory）
              </p>
              <p className="text-[11px] text-slate-500">
                使用 Kubernetes 数量写法，例如 <code className="rounded bg-white px-1">100m</code>、
                <code className="rounded bg-white px-1">500m</code>、<code className="rounded bg-white px-1">256Mi</code>、
                <code className="rounded bg-white px-1">1Gi</code>。留空保存将移除对应键；其他资源项（如
                ephemeral-storage）仍保留，请用 YAML 编辑。
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">requests.cpu</Label>
                  <Input
                    value={cpuRequest}
                    onChange={(e) => setCpuRequest(e.target.value)}
                    className="font-mono text-xs"
                    placeholder="如 100m"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">requests.memory</Label>
                  <Input
                    value={memoryRequest}
                    onChange={(e) => setMemoryRequest(e.target.value)}
                    className="font-mono text-xs"
                    placeholder="如 128Mi"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">limits.cpu</Label>
                  <Input
                    value={cpuLimit}
                    onChange={(e) => setCpuLimit(e.target.value)}
                    className="font-mono text-xs"
                    placeholder="如 500m"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">limits.memory</Label>
                  <Input
                    value={memoryLimit}
                    onChange={(e) => setMemoryLimit(e.target.value)}
                    className="font-mono text-xs"
                    placeholder="如 512Mi"
                  />
                </div>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              多容器、环境变量、探针等请使用「编辑 YAML」。
            </p>
          </div>
        )}
        {obj && kind === "StatefulSet" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>副本数 spec.replicas</Label>
              <Input
                type="number"
                min={0}
                value={replicas}
                onChange={(e) => setReplicas(parseInt(e.target.value, 10) || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label>首个容器镜像</Label>
              <Input value={image} onChange={(e) => setImage(e.target.value)} className="font-mono text-xs" />
            </div>
            <div className="flex flex-row items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5">
              <div className="min-w-0 space-y-0.5">
                <Label htmlFor="sts-hostnetwork" className="text-sm font-medium text-slate-800">
                  Host 网络模式
                </Label>
                <p className="text-[11px] leading-snug text-slate-500">
                  <span className="font-mono">spec.template.spec.hostNetwork</span>
                  ，与 Deployment 图形项一致；保存后可在详情「概览」查看模板端口映射。
                </p>
              </div>
              <Switch
                id="sts-hostnetwork"
                checked={podTemplateHostNetwork}
                onCheckedChange={setPodTemplateHostNetwork}
                className="shrink-0"
              />
            </div>
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
              <p className="text-xs font-medium text-slate-700">首个容器资源 requests / limits</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">requests.cpu</Label>
                  <Input
                    value={cpuRequest}
                    onChange={(e) => setCpuRequest(e.target.value)}
                    className="font-mono text-xs"
                    placeholder="如 100m"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">requests.memory</Label>
                  <Input
                    value={memoryRequest}
                    onChange={(e) => setMemoryRequest(e.target.value)}
                    className="font-mono text-xs"
                    placeholder="如 128Mi"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">limits.cpu</Label>
                  <Input
                    value={cpuLimit}
                    onChange={(e) => setCpuLimit(e.target.value)}
                    className="font-mono text-xs"
                    placeholder="如 500m"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">limits.memory</Label>
                  <Input
                    value={memoryLimit}
                    onChange={(e) => setMemoryLimit(e.target.value)}
                    className="font-mono text-xs"
                    placeholder="如 512Mi"
                  />
                </div>
              </div>
            </div>
            <p className="text-xs text-slate-500">其他字段请使用 YAML。</p>
          </div>
        )}
        {(obj || svcIsCreate) && kind === "Service" && (
          <div className="space-y-4">
            {svcIsCreate && (
              <div className="space-y-3 rounded-lg border border-blue-200/80 bg-blue-50/40 p-3">
                <Label className="text-sm font-medium text-slate-800">新建 Service</Label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs">名称 metadata.name</Label>
                    <Input
                      value={createSvcName}
                      onChange={(e) => setCreateSvcName(e.target.value)}
                      className="font-mono text-sm"
                      placeholder="如 my-svc"
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">selector 标签键</Label>
                    <Input
                      value={createSelectorKey}
                      onChange={(e) => setCreateSelectorKey(e.target.value)}
                      className="font-mono text-xs"
                      placeholder="app"
                      disabled={svcExposure === "externalname"}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">selector 标签值</Label>
                    <Input
                      value={createSelectorValue}
                      onChange={(e) => setCreateSelectorValue(e.target.value)}
                      className="font-mono text-xs"
                      placeholder="与 Pod labels 一致"
                      disabled={svcExposure === "externalname"}
                    />
                  </div>
                </div>
                <p className="text-[11px] text-slate-600">
                  ExternalName 类型无需 selector；其他类型创建时至少填写一对标签以关联 Pod。
                </p>
              </div>
            )}
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
              <Label className="text-sm font-medium">网络模式 spec.type</Label>
              <RadioGroup
                value={svcExposure}
                onValueChange={(v) => setSvcExposure(v as ServiceGraphicExposure)}
                className="gap-2"
              >
                {SERVICE_EXPOSURE_OPTIONS.map((opt) => (
                  <div key={opt.value} className="flex items-start gap-2">
                    <RadioGroupItem value={opt.value} id={`svc-exp-${opt.value}`} className="mt-0.5" />
                    <Label htmlFor={`svc-exp-${opt.value}`} className="cursor-pointer text-sm font-normal leading-snug">
                      {opt.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
              {svcExposure === "externalname" && (
                <div className="space-y-1.5 pt-1">
                  <Label className="text-xs">外部域名 spec.externalName</Label>
                  <Input
                    value={svcExternalName}
                    onChange={(e) => setSvcExternalName(e.target.value)}
                    className="font-mono text-sm"
                    placeholder="如 database.example.com"
                  />
                </div>
              )}
              <p className="text-[11px] leading-relaxed text-slate-500">
                选「Ingress 场景」时保存仍为 <span className="font-mono">ClusterIP</span>。Host 网络场景使用{" "}
                <span className="font-mono">NodePort</span> 且{" "}
                <span className="font-mono">externalTrafficPolicy: Local</span>
                。改回 ClusterIP / Ingress / ExternalName 时会去掉各端口上的{" "}
                <span className="font-mono">nodePort</span>。
              </p>
            </div>
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="text-sm font-medium">端口 spec.ports</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 text-xs"
                  onClick={() => setSvcPortRows((prev) => [...prev, newServicePortRow()])}
                >
                  <Plus className="size-3.5" />
                  添加端口
                </Button>
              </div>
              <p className="text-[11px] text-slate-500">
                <span className="font-mono">port</span> 为 Service 端口；<span className="font-mono">targetPort</span>{" "}
                留空则与 port 相同；可填容器端口数字或端口名。NodePort / LoadBalancer 时可填{" "}
                <span className="font-mono">nodePort</span>（留空由集群分配）。
              </p>
              <div className="hidden gap-2 text-[10px] font-medium uppercase tracking-wide text-slate-500 sm:grid sm:grid-cols-[minmax(0,1fr)_88px_minmax(0,1fr)_100px_100px_auto] sm:items-end sm:pl-1">
                <span>名称 name</span>
                <span>端口 port</span>
                <span>目标 targetPort</span>
                <span>协议</span>
                <span>{allowSvcNodePortCol ? "nodePort" : ""}</span>
                <span />
              </div>
              <div className="space-y-3">
                {svcPortRows.map((row) => (
                  <div
                    key={row.clientId}
                    className="flex flex-col gap-2 rounded-md border border-slate-200 bg-white p-2 sm:grid sm:grid-cols-[minmax(0,1fr)_88px_minmax(0,1fr)_100px_100px_auto] sm:items-end sm:gap-2"
                  >
                    <div className="space-y-1">
                      <Label className="text-[10px] text-slate-500 sm:hidden">名称 name</Label>
                      <Input
                        value={row.name}
                        onChange={(e) =>
                          setSvcPortRows((prev) =>
                            prev.map((x) =>
                              x.clientId === row.clientId ? { ...x, name: e.target.value } : x
                            )
                          )
                        }
                        className="font-mono text-xs"
                        placeholder="可选"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-slate-500 sm:hidden">端口 port</Label>
                      <Input
                        type="number"
                        min={1}
                        max={65535}
                        value={row.port}
                        onChange={(e) =>
                          setSvcPortRows((prev) =>
                            prev.map((x) =>
                              x.clientId === row.clientId ? { ...x, port: e.target.value } : x
                            )
                          )
                        }
                        className="font-mono text-xs tabular-nums"
                        placeholder="80"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-slate-500 sm:hidden">targetPort</Label>
                      <Input
                        value={row.targetPort}
                        onChange={(e) =>
                          setSvcPortRows((prev) =>
                            prev.map((x) =>
                              x.clientId === row.clientId ? { ...x, targetPort: e.target.value } : x
                            )
                          )
                        }
                        className="font-mono text-xs"
                        placeholder="同 port"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-slate-500 sm:hidden">协议</Label>
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-xs shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        value={row.protocol}
                        onChange={(e) =>
                          setSvcPortRows((prev) =>
                            prev.map((x) =>
                              x.clientId === row.clientId ? { ...x, protocol: e.target.value } : x
                            )
                          )
                        }
                      >
                        <option value="TCP">TCP</option>
                        <option value="UDP">UDP</option>
                        <option value="SCTP">SCTP</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      {allowSvcNodePortCol ? (
                        <>
                          <Label className="text-[10px] text-slate-500 sm:hidden">nodePort</Label>
                          <Input
                            type="number"
                            min={1}
                            max={65535}
                            value={row.nodePort}
                            onChange={(e) =>
                              setSvcPortRows((prev) =>
                                prev.map((x) =>
                                  x.clientId === row.clientId ? { ...x, nodePort: e.target.value } : x
                                )
                              )
                            }
                            className="font-mono text-xs tabular-nums"
                            placeholder="自动"
                          />
                        </>
                      ) : (
                        <span className="hidden sm:block" aria-hidden />
                      )}
                    </div>
                    <div className="flex justify-end sm:pb-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-9 shrink-0 text-red-600 hover:text-red-700"
                        disabled={svcPortRows.length <= 1}
                        onClick={() =>
                          setSvcPortRows((prev) =>
                            prev.length <= 1 ? prev : prev.filter((x) => x.clientId !== row.clientId)
                          )
                        }
                        title="删除此端口"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-xs text-slate-500">
              无 selector 的 Headless、多端口名等复杂场景请用「编辑 YAML」。
            </p>
          </div>
        )}
        {obj && kind === "ConfigMap" && (
          <div className="max-h-[min(78vh,820px)] space-y-3 overflow-y-auto pr-1 [scrollbar-gutter:stable]">
            <p className="text-xs text-slate-500">
              编辑 <code className="rounded bg-slate-100 px-1">data</code> 键值；<code className="rounded bg-slate-100 px-1">binaryData</code> 请在
             「YAML」页处理。
              <code className="rounded bg-slate-100 px-1">*.yml</code> / <code className="rounded bg-slate-100 px-1">*.yaml</code> 用
              YAML 高亮；<code className="rounded bg-slate-100 px-1">.conf</code>、<code className="rounded bg-slate-100 px-1">.json</code> 等用多行代码框；长文本也会自动用代码框。若曾是一行
              <code className="rounded bg-slate-100 px-1">\n</code> 乱码，打开时会尽量还原换行。含 YAML 的键保存前会自检。
            </p>
            {Object.keys(cmData).length === 0 ? (
              <p className="text-sm text-amber-800">当前无 data 键，可在下方添加。</p>
            ) : null}
            {Object.entries(cmData).map(([k, v]) => {
              const valueEditorMode = getConfigMapValueEditorMode(k, v);
              return (
              <div
                key={k}
                className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
              >
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <Label className="text-xs">键</Label>
                    <Input
                      value={k}
                      onChange={(e) => {
                        const nk = e.target.value;
                        setCmData((prev) => {
                          const n = { ...prev };
                          delete n[k];
                          n[nk] = v;
                          return n;
                        });
                      }}
                      className="font-mono text-xs"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-red-600"
                    onClick={() =>
                      setCmData((prev) => {
                        const n = { ...prev };
                        delete n[k];
                        return n;
                      })
                    }
                  >
                    删除
                  </Button>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">值</Label>
                  {valueEditorMode === "yaml" ? (
                    <YamlEditor
                      value={v}
                      onChange={(next) =>
                        setCmData((prev) => ({ ...prev, [k]: next }))
                      }
                      height="min(55vh, 520px)"
                      showStats
                      placeholder="YAML 内容"
                    />
                  ) : valueEditorMode === "code" ? (
                    <YamlEditor
                      value={v}
                      onChange={(next) =>
                        setCmData((prev) => ({ ...prev, [k]: next }))
                      }
                      height="min(40vh, 480px)"
                      showStats
                      plainText
                      placeholder="内容（多行）"
                    />
                  ) : (
                    <Textarea
                      value={v}
                      onChange={(e) =>
                        setCmData((prev) => ({ ...prev, [k]: e.target.value }))
                      }
                      rows={8}
                      className="min-h-[120px] resize-y font-mono text-xs leading-relaxed"
                      spellCheck={false}
                    />
                  )}
                </div>
              </div>
            );
            })}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCmData((prev) => ({ ...prev, [`key-${Object.keys(prev).length}`]: "" }))}
            >
              添加键
            </Button>
          </div>
        )}
        {obj && kind === "Secret" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>类型 type</Label>
              <Input value={secType} onChange={(e) => setSecType(e.target.value)} className="font-mono text-xs" />
            </div>
            <p className="text-xs text-amber-800">
              保存时使用 stringData；非 Opaque 类型请谨慎修改，复杂证书类建议用 YAML。
            </p>
            {Object.entries(secData).map(([k, v]) => (
              <div key={k} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
                <div className="space-y-1">
                  <Label className="text-xs">键</Label>
                  <Input
                    value={k}
                    onChange={(e) => {
                      const nk = e.target.value;
                      setSecData((prev) => {
                        const n = { ...prev };
                        delete n[k];
                        n[nk] = v;
                        return n;
                      });
                    }}
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">值</Label>
                  <Textarea
                    value={v}
                    onChange={(e) =>
                      setSecData((prev) => ({ ...prev, [k]: e.target.value }))
                    }
                    className="min-h-[72px] font-mono text-xs"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-red-600"
                  onClick={() =>
                    setSecData((prev) => {
                      const n = { ...prev };
                      delete n[k];
                      return n;
                    })
                  }
                >
                  删除
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setSecData((prev) => ({ ...prev, [`key-${Object.keys(prev).length}`]: "" }))
              }
            >
              添加键
            </Button>
          </div>
        )}
        {saveMut.isPending ? (
          <div className="rounded-lg border border-sky-200/80 bg-sky-50/50 px-3 py-2 dark:border-sky-900/50 dark:bg-sky-950/25">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-sky-950 dark:text-sky-100/90">
              <span className="font-medium">
                {savePipelineStep
                  ? workloadApplyPipelineLabel(savePipelineStep, "put-json")
                  : "准备保存…"}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {kind === "Deployment" || kind === "StatefulSet" ? "约 6～35 s" : "约 2～12 s"}
              </span>
            </div>
            <Progress
              className="h-2"
              value={savePipelineStep ? workloadApplyPipelineProgress(savePipelineStep) : 6}
            />
            {(kind === "Deployment" || kind === "StatefulSet") && (
              <p className="mt-1.5 text-[11px] text-sky-900/80 dark:text-sky-200/80">
                {WORKLOAD_GRAPHIC_SAVE_PIPELINE_HINT}
              </p>
            )}
          </div>
        ) : null}
        <DialogFooter className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            type="button"
            disabled={(!(svcIsCreate && kind === "Service") && !obj) || saveMut.isPending}
            onClick={() => void saveMut.mutateAsync()}
          >
            {saveMut.isPending ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {kind === "Deployment" || kind === "StatefulSet" ? "预检并保存…" : "保存中…"}
              </span>
            ) : svcIsCreate ? (
              "创建 Service"
            ) : kind === "Deployment" || kind === "StatefulSet" ? (
              "预检并保存生效"
            ) : (
              "保存并生效"
            )}
          </Button>
        </DialogFooter>
        {saveMut.isError && (
          <p className="text-sm text-red-600">{(saveMut.error as Error).message}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function mergeFirstContainerResources(
  container: Record<string, unknown>,
  cpuReq: string,
  memReq: string,
  cpuLim: string,
  memLim: string
): Record<string, unknown> {
  const next = { ...container };
  const prev = (next.resources as Record<string, unknown> | undefined) ?? {};
  const requests = {
    ...((prev.requests as Record<string, string> | undefined) ?? {}),
  };
  const limits = { ...((prev.limits as Record<string, string> | undefined) ?? {}) };
  const apply = (obj: Record<string, string>, key: "cpu" | "memory", val: string) => {
    const t = val.trim();
    if (t) obj[key] = t;
    else delete obj[key];
  };
  apply(requests, "cpu", cpuReq);
  apply(requests, "memory", memReq);
  apply(limits, "cpu", cpuLim);
  apply(limits, "memory", memLim);
  const resources: Record<string, unknown> = { ...prev };
  if (Object.keys(requests).length > 0) resources.requests = requests;
  else delete resources.requests;
  if (Object.keys(limits).length > 0) resources.limits = limits;
  else delete resources.limits;
  if (Object.keys(resources).length > 0) next.resources = resources;
  else delete next.resources;
  return next;
}

function buildPutBody(
  kind: K8sGraphicKind,
  raw: Record<string, unknown> | null,
  namespace: string,
  f: {
    replicas: number;
    image: string;
    cpuRequest: string;
    memoryRequest: string;
    cpuLimit: string;
    memoryLimit: string;
    podTemplateHostNetwork: boolean;
    schedulingNodeNames: string[];
    svcExposure: ServiceGraphicExposure;
    svcPortRows: ServicePortFormRow[];
    svcExternalName: string;
    serviceMode: "edit" | "create";
    createSvcName: string;
    createSelectorKey: string;
    createSelectorValue: string;
    cmData: Record<string, string>;
    secType: string;
    secData: Record<string, string>;
  }
): { kind: K8sGraphicKind; object: Record<string, unknown> } {
  const o =
    kind === "Service" && f.serviceMode === "create"
      ? (() => {
          const nm = f.createSvcName.trim();
          if (!nm) throw new Error("请填写 Service 名称");
          return {
            apiVersion: "v1",
            kind: "Service",
            metadata: { name: nm, namespace },
            spec: {} as Record<string, unknown>,
          } as Record<string, unknown>;
        })()
      : deepClone(raw!);

  if (kind === "Deployment" || kind === "StatefulSet" || kind === "DaemonSet") {
    const spec = (o.spec as Record<string, unknown>) ?? {};
    if (kind === "DaemonSet") {
      delete spec.replicas;
    } else {
      spec.replicas = f.replicas;
    }
    const tpl = (spec.template as Record<string, unknown>) ?? {};
    const podSpec = (tpl.spec as Record<string, unknown>) ?? {};
    const containers = (podSpec.containers as Record<string, unknown>[]) ?? [];
    if (containers.length > 0) {
      const c0 = { ...containers[0], image: f.image };
      containers[0] = mergeFirstContainerResources(
        c0,
        f.cpuRequest,
        f.memoryRequest,
        f.cpuLimit,
        f.memoryLimit
      );
    }
    podSpec.containers = containers;
    if (f.podTemplateHostNetwork) {
      podSpec.hostNetwork = true;
    } else {
      delete podSpec.hostNetwork;
    }
    applySchedulingNodeNames(podSpec as Record<string, unknown>, f.schedulingNodeNames);
    tpl.spec = podSpec;
    spec.template = tpl;
    o.spec = spec;
  }
  if (kind === "Service") {
    const k8sType = k8sServiceTypeFromExposure(f.svcExposure);
    let ports: unknown = servicePortsFromFormRows(f.svcPortRows, k8sType);
    if (
      k8sType !== "ExternalName" &&
      (!Array.isArray(ports) || ports.length === 0)
    ) {
      throw new Error("请至少填写一条有效端口：port 须为 1–65535 的数字");
    }
    ports = normalizeServicePortsForK8sType(k8sType, ports);
    const spec = (o.spec as Record<string, unknown>) ?? {};

    if (k8sType === "ExternalName") {
      const ext = f.svcExternalName.trim();
      if (!ext) throw new Error("ExternalName 类型须填写外部域名 spec.externalName");
      spec.type = "ExternalName";
      spec.externalName = ext;
      delete spec.ports;
      delete spec.selector;
      delete spec.externalTrafficPolicy;
    } else {
      spec.type = k8sType;
      delete spec.externalName;
      if (k8sType === "NodePort") {
        spec.externalTrafficPolicy = f.svcExposure === "hostnetwork" ? "Local" : "Cluster";
      } else {
        delete spec.externalTrafficPolicy;
      }
      if (f.serviceMode === "create") {
        const sk = f.createSelectorKey.trim();
        const sv = f.createSelectorValue.trim();
        if (!sk || !sv) {
          throw new Error("请填写 selector 标签键与值（与 workload Pod 的 labels 一致）");
        }
        spec.selector = { [sk]: sv };
      }
      if (Array.isArray(ports) && ports.length > 0) {
        spec.ports = ports;
      } else {
        spec.ports = ports;
      }
    }
    o.spec = spec;
  }
  if (kind === "ConfigMap") {
    (o as { data?: Record<string, string> }).data = { ...f.cmData };
  }
  if (kind === "Secret") {
    const s = o as Record<string, unknown>;
    s.type = f.secType;
    delete s.data;
    s.stringData = { ...f.secData };
  }
  return { kind, object: o };
}

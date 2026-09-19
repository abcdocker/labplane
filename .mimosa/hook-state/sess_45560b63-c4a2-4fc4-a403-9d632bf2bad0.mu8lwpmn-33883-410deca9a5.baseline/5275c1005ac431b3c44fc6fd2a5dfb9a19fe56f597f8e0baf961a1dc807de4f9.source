import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppConfig, APP_CONFIG_QUERY_KEY } from "@/hooks/use-app-config";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Cloud,
  Database,
  KeyRound,
  Layers,
  Loader2,
  Minimize2,
  Network,
  Plus,
  RefreshCw,
  Search,
  Server,
  Shield,
  ShieldAlert,
  Terminal,
  Trash2,
  Zap,
} from "lucide-react";
import { useAuth } from "@/auth/auth-context";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ApiHttpError,
  apiDeleteJson,
  apiGetJson,
  apiPostJson,
  type AppConfig,
  wsUrlForApiPath,
} from "@/lib/api";
import {
  redisAppCenterCanWrite,
  redisShowK8sDeployWizard,
} from "@/lib/platform-permissions";
import RedisCliTerminalSheet from "@/components/RedisCliTerminalSheet";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import RedisExporterMonitorCharts from "@/components/RedisExporterMonitorCharts";
import AppCenterRedisTemplates from "@/pages/AppCenterRedisTemplates";

type RedisStatus = {
  mysqlReachable: boolean;
  encryptionReady: boolean;
  mirrorRedisOk: boolean;
  dualWriteRedis?: boolean;
  encryptionError?: string;
  mysqlConnectError?: string;
};

export type RedisInstance = {
  id: number;
  name: string;
  mode: string;
  summary: {
    mode: string;
    db: number;
    hasPassword: boolean;
    addr?: string;
    sentinelAddrs?: string[];
    masterName?: string;
    masterAddr?: string;
    replicaAddr?: string;
    clusterAddrs?: string[];
    k8sNamespace?: string;
    k8sBaseName?: string;
    k8sTopology?: string;
    k8sSvcPort?: number;
    /** clusterip | nodeport | loadbalancer */
    k8sServiceType?: string;
    k8sEngineLine?: string;
    k8sMaxmemory?: string;
    k8sMaxmemoryPolicy?: string;
    k8sAppendonly?: boolean;
    k8sRedisImageResolved?: string;
    k8sExporterEnabled?: boolean;
    k8sExporterImageResolved?: string;
    k8sRedisCpuRequest?: string;
    k8sRedisCpuLimit?: string;
    k8sRedisMemoryRequest?: string;
    k8sRedisMemoryLimit?: string;
    k8sPersistenceEnabled?: boolean;
    k8sStorageSize?: string;
    k8sStorageClass?: string;
    k8sTemplateId?: number;
    k8sTemplateName?: string;
  };
  createdAt?: string;
  createdBy?: string;
};

type RedisK8sNetworkService = {
  name: string;
  namespace: string;
  type: string;
  clusterIP?: string;
  clusterDNS: string;
  ports: Array<{ name?: string; port: number; nodePort?: number; protocol?: string }>;
  loadBalancerIP?: string;
  externalIPs?: string[];
  hostNetwork?: boolean;
  note?: string;
};

function redisK8sMainSvcPort(ports: RedisK8sNetworkService["ports"]): number {
  const p = ports.find((x) => x.name === "redis" || x.port === 6379);
  return p?.port ?? ports[0]?.port ?? 6379;
}

function RedisK8sNetworkSection({ instanceId }: { instanceId: number }) {
  const q = useQuery({
    queryKey: ["app-redis-k8s-network", instanceId],
    queryFn: ({ signal }) =>
      apiGetJson<{ hint?: string; services?: RedisK8sNetworkService[] }>(
        `/api/app-center/redis/instances/${instanceId}/k8s-network`
      , { signal }),
    retry: false,
    refetchInterval: 60_000,
  });

  return (
    <div className="mx-5 mb-4 rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50/80 to-white px-4 py-3 shadow-sm">
      <p className="text-xs font-semibold text-emerald-900">集群接入与网络</p>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
        集群内优先使用 <span className="font-mono">clusterDNS</span> 或 <span className="font-mono">ClusterIP</span>；
        NodePort 请在集群外使用<strong>任意节点 IP</strong>加下方端口。
      </p>
      {q.isLoading ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> 正在读取 Service…
        </div>
      ) : q.isError ? (
        <p className="mt-3 text-xs text-amber-800">{fmtApiErrorMessage(q.error)}</p>
      ) : (
        <div className="mt-3 space-y-4">
          {q.data?.hint ? (
            <p className="rounded-md border border-emerald-100/80 bg-white/80 px-2.5 py-2 text-[11px] leading-relaxed text-slate-700">
              {q.data.hint}
            </p>
          ) : null}
          {(q.data?.services ?? []).length === 0 ? (
            <p className="text-xs text-slate-500">未查到关联 Service（可能尚未创建或名称不一致）。</p>
          ) : (
            <div className="space-y-3">
              {(q.data?.services ?? []).map((s) => {
                const mainPort = redisK8sMainSvcPort(s.ports);
                const dnsLine = `${s.clusterDNS}:${mainPort}`;
                const clusterLine =
                  s.clusterIP && s.clusterIP !== "None" ? `${s.clusterIP}:${mainPort}` : null;
                return (
                  <div
                    key={`${s.namespace}/${s.name}`}
                    className="rounded-lg border border-slate-200/90 bg-white/90 px-3 py-2.5 text-[11px]"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="font-semibold text-slate-800">
                        {s.namespace}/{s.name}
                      </span>
                      <Badge variant="outline" className="font-mono text-[10px] font-normal">
                        {s.type}
                      </Badge>
                    </div>
                    <dl className="mt-2 space-y-1.5 text-slate-700">
                      <div>
                        <dt className="text-slate-500">Service DNS（集群内）</dt>
                        <dd className="mt-0.5 font-mono text-[11px] break-all text-slate-900">{dnsLine}</dd>
                      </div>
                      {clusterLine ? (
                        <div>
                          <dt className="text-slate-500">ClusterIP（集群内）</dt>
                          <dd className="mt-0.5 font-mono text-[11px]">{clusterLine}</dd>
                        </div>
                      ) : null}
                      {s.loadBalancerIP ? (
                        <div>
                          <dt className="text-slate-500">LoadBalancer</dt>
                          <dd className="mt-0.5 font-mono text-[11px] break-all">{s.loadBalancerIP}</dd>
                        </div>
                      ) : null}
                      {s.externalIPs && s.externalIPs.length > 0 ? (
                        <div>
                          <dt className="text-slate-500">外部访问地址（hostNetwork 节点 IP）</dt>
                          <dd className="mt-0.5 space-y-0.5">
                            {s.externalIPs.map((ip) => (
                              <div key={ip} className="font-mono text-[11px] text-slate-900">
                                {ip}:{mainPort}
                              </div>
                            ))}
                          </dd>
                        </div>
                      ) : null}
                      <div>
                        <dt className="text-slate-500">端口</dt>
                        <dd className="mt-1 overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow className="hover:bg-transparent">
                                <TableHead className="h-8 text-[10px]">名称</TableHead>
                                <TableHead className="h-8 text-[10px]">Service 端口</TableHead>
                                <TableHead className="h-8 text-[10px]">NodePort</TableHead>
                                <TableHead className="h-8 text-[10px]">集群外示例</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {s.ports.map((p, idx) => (
                                <TableRow key={`${p.name ?? ""}-${p.port}-${idx}`} className="text-[11px]">
                                  <TableCell className="py-1.5 font-mono">{p.name || "—"}</TableCell>
                                  <TableCell className="py-1.5 font-mono tabular-nums">{p.port}</TableCell>
                                  <TableCell className="py-1.5 font-mono tabular-nums">
                                    {p.nodePort && p.nodePort > 0 ? p.nodePort : "—"}
                                  </TableCell>
                                  <TableCell className="py-1.5 font-mono text-[10px] text-slate-600">
                                    {p.nodePort && p.nodePort > 0 ? (
                                      <span title="将 节点IP 换为任意 K8s 节点地址">
                                        {"<节点IP>:"}
                                        {p.nodePort}
                                      </span>
                                    ) : (
                                      "—"
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </dd>
                      </div>
                      {s.note ? (
                        <div className="text-[11px] leading-relaxed text-slate-600">{s.note}</div>
                      ) : null}
                    </dl>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function redisModeLabel(mode: string): string {
  switch (mode) {
    case "standalone":
      return "标准版 · 单机";
    case "sentinel":
      return "高可用 · 哨兵";
    case "replication":
      return "主从复制";
    case "cluster":
      return "Redis Cluster";
    default:
      return mode;
  }
}

function redisEndpointHint(s: RedisInstance["summary"]): string {
  if (s.addr) return s.addr;
  if (s.masterAddr) return s.masterAddr;
  if (s.clusterAddrs?.length) {
    const a = s.clusterAddrs;
    if (a.length <= 2) return a.join(" · ");
    return `${a[0]} · …（共 ${a.length} 节点）`;
  }
  if (s.sentinelAddrs?.length) return s.sentinelAddrs.join(" · ");
  return "—";
}

/** 本控制台通过 K8s 部署向导创建的实例会写入 k8sNamespace；仅填连接信息的为纳管 */
function isPlatformK8sRedis(i: RedisInstance): boolean {
  return Boolean(i.summary.k8sNamespace?.trim());
}

/** 纳管实例：用 Ping 表示是否可达（非 K8s 工作负载状态） */
function RedisManagedStatusCell({ instanceId }: { instanceId: number }) {
  const q = useQuery({
    queryKey: ["app-redis-ping", instanceId],
    queryFn: ({ signal }) =>
      apiPostJson<{ ok?: boolean; latencyMs?: number; version?: string }>(
        `/api/app-center/redis/instances/${instanceId}/ping`,
        {}
      , { signal }),
    enabled: instanceId > 0,
    refetchInterval: 25000,
    retry: false,
  });
  if (q.isLoading) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-slate-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> 检测…
      </span>
    );
  }
  if (q.error) {
    return (
      <span className="text-xs text-amber-800" title={fmtApiErrorMessage(q.error)}>
        不可达
      </span>
    );
  }
  const ver = q.data?.version?.trim();
  return (
    <div className="max-w-[200px] space-y-0.5">
      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 font-normal text-[0.65rem] text-emerald-900">
        可达
      </Badge>
      {ver ? (
        <p className="line-clamp-2 text-[10px] leading-snug text-slate-500" title={ver}>
          {ver}
        </p>
      ) : null}
    </div>
  );
}

function RedisCliExecButton({ instance, isViewer }: { instance: RedisInstance; isViewer: boolean }) {
  const [open, setOpen] = useState(false);
  if (!isPlatformK8sRedis(instance)) {
    return (
      <span className="text-xs text-slate-400" title="仅平台部署实例可在控制台打开 redis-cli">
        —
      </span>
    );
  }
  if (isViewer) {
    return <span className="text-xs text-slate-400">只读</span>;
  }
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1 px-2 text-xs"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Terminal className="h-3.5 w-3.5" />
        redis-cli
      </Button>
      <RedisCliTerminalSheet instanceId={instance.id} open={open} onOpenChange={setOpen} />
    </>
  );
}

type RuntimePayload = {
  capturedAt: string;
  latencyMs: number;
  dbsize: number;
  sections: Record<string, Record<string, string>>;
  config: Record<string, string>;
};

/** Redis 连接/认证类错误：停止轮询，避免刷屏请求 */
function isRedisFatalApiError(err: unknown): boolean {
  if (err instanceof ApiHttpError) {
    if (err.code === "decrypt") return true;
    if (typeof err.code === "string" && err.code.startsWith("redis_")) return true;
  }
  return false;
}

function fmtApiErrorMessage(err: unknown): string {
  if (err instanceof ApiHttpError) return err.serverMessage;
  if (err instanceof Error) return err.message;
  return String(err);
}

function fmtUptimeSeconds(sec: string | undefined): string {
  const n = parseInt(sec || "0", 10);
  if (!Number.isFinite(n) || n <= 0) return "—";
  const d = Math.floor(n / 86400);
  const h = Math.floor((n % 86400) / 3600);
  const m = Math.floor((n % 3600) / 60);
  if (d > 0) return `${d} 天 ${h} 小时`;
  if (h > 0) return `${h} 小时 ${m} 分`;
  return `${m} 分钟`;
}

export default function AppCenterRedis() {
  const { status: auth } = useAuth();
  const configQ = useAppConfig();
  const perm = auth?.permissions ?? configQ.data?.permissions;
  const canWriteRedis = redisAppCenterCanWrite(auth?.role, perm);
  const showK8sDeployWizard = redisShowK8sDeployWizard(auth?.role, perm);
  const managedOnlyScope = perm?.appcenterRedis === "managed_only";
  const isViewer = !canWriteRedis;
  const qc = useQueryClient();
  const [mainTab, setMainTab] = useState<"redis" | "install" | "templates">("redis");

  useEffect(() => {
    if (!showK8sDeployWizard && mainTab === "install") {
      setMainTab("redis");
    }
  }, [showK8sDeployWizard, mainTab]);

  useEffect(() => {
    if (managedOnlyScope) {
      setInstanceSourceFilter("managed");
    }
  }, [managedOnlyScope]);

  const [managePanelOpen, setManagePanelOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  /** 实例列表来源筛选（在页面内操作，不占用全局左侧菜单） */
  const [instanceSourceFilter, setInstanceSourceFilter] = useState<"all" | "platform" | "managed">("all");

  const statusQ = useQuery({
    queryKey: ["app-center-redis-status"],
    queryFn: ({ signal }) => apiGetJson<RedisStatus>("/api/app-center/redis/status", { signal }),
  });

  const listQ = useQuery({
    queryKey: ["app-center-redis-instances"],
    queryFn: ({ signal }) =>
      apiGetJson<{ instances: RedisInstance[]; mysqlRequired: boolean }>(
        "/api/app-center/redis/instances"
      , { signal }),
  });

  const filteredInstances = useMemo(() => {
    let list = listQ.data?.instances ?? [];
    if (instanceSourceFilter === "platform") {
      list = list.filter((x) => isPlatformK8sRedis(x));
    } else if (instanceSourceFilter === "managed") {
      list = list.filter((x) => !isPlatformK8sRedis(x));
    }
    const q = searchQ.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (x) =>
        x.name.toLowerCase().includes(q) ||
        String(x.id).includes(q) ||
        redisEndpointHint(x.summary).toLowerCase().includes(q)
    );
  }, [listQ.data?.instances, searchQ, instanceSourceFilter]);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = useMemo(
    () => (listQ.data?.instances ?? []).find((x) => x.id === selectedId) ?? null,
    [listQ.data, selectedId]
  );

  /** 默认不展开实例详情；仅当当前选中行被筛选掉时清空选中 */
  useEffect(() => {
    if (selectedId == null) return;
    if (!filteredInstances.some((x) => x.id === selectedId)) {
      setSelectedId(null);
    }
  }, [filteredInstances, selectedId]);

  return (
    <div className="space-y-6">
      {/* 公有云风格页头 */}
      <div className="relative overflow-hidden rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/50 via-white to-teal-50/40 px-6 py-8 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-100/35 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800/90">Redis 缓存 · 实例</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-[26px]">
              云数据库 Redis
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
              <strong className="font-medium text-slate-800">平台部署</strong>（K8s 向导）与{" "}
              <strong className="font-medium text-slate-800">纳管</strong>（仅登记连接信息）可在下方列表区分；运维能力与全局指标见侧栏「Dashboard」。
            </p>
          </div>
          {canWriteRedis && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                className="h-10 shrink-0 gap-1.5 bg-emerald-600 shadow-sm hover:bg-emerald-700"
                disabled={!statusQ.data?.mysqlReachable}
                onClick={() => setManagePanelOpen((o) => !o)}
              >
                {managePanelOpen ? (
                  <>
                    <Minimize2 className="h-4 w-4" />
                    收起纳管表单
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    纳管实例
                  </>
                )}
              </Button>
              {showK8sDeployWizard ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 shrink-0 gap-1.5 border-emerald-200 bg-white text-emerald-900 hover:bg-emerald-50"
                  onClick={() => setMainTab("install")}
                >
                  <Terminal className="h-4 w-4" />
                  创建
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <div className="min-w-0 space-y-4">
        <Tabs
          value={mainTab}
          onValueChange={(v) => setMainTab(v as "redis" | "install")}
          className="w-full"
        >
          <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-xl border border-slate-200/80 bg-slate-50/80 p-1 sm:w-auto">
            <TabsTrigger
              value="redis"
              className="gap-1.5 rounded-lg px-4 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm"
            >
              <Database className="h-4 w-4 shrink-0" />
              实例列表
            </TabsTrigger>
            {showK8sDeployWizard ? (
            <TabsTrigger
              value="install"
              className="gap-1.5 rounded-lg px-4 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm"
            >
              <Terminal className="h-4 w-4 shrink-0" />
              部署向导
            </TabsTrigger>
            ) : null}
            {showK8sDeployWizard ? (
              <TabsTrigger
                value="templates"
                className="gap-1.5 rounded-lg px-4 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm"
              >
                <Layers className="h-4 w-4 shrink-0" />
                模版中心
              </TabsTrigger>
            ) : null}
          </TabsList>

          <TabsContent value="redis" className="mt-4 space-y-4 outline-none">
        <div className="space-y-4">
          {!statusQ.data?.mysqlReachable && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="font-semibold">需要 MySQL</p>
                <p className="mt-1 text-amber-900/90">
                  云控制台需持久化实例配置，请配置{" "}
                  <code className="rounded bg-amber-100/80 px-1 font-mono text-xs">MYSQL_DSN</code>
                  并确保连通。
                  {statusQ.data?.mysqlConnectError ? (
                    <span className="ml-1 font-mono text-xs">（{statusQ.data.mysqlConnectError}）</span>
                  ) : null}
                </p>
              </div>
            </div>
          )}
          {!statusQ.data?.encryptionReady && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-900">
              保存访问密码需配置{" "}
              <code className="rounded bg-red-100/80 px-1 font-mono text-xs">KUBEBT_ENCRYPTION_KEY</code>
              {statusQ.data?.encryptionError ? (
                <span className="ml-1 font-mono text-xs">{statusQ.data.encryptionError}</span>
              ) : null}
            </div>
          )}

          {canWriteRedis && managePanelOpen ? (
            <ManageRedisInlinePanel
              open={managePanelOpen}
              onOpenChange={setManagePanelOpen}
              encryptionReady={Boolean(statusQ.data?.encryptionReady)}
              mysqlOk={Boolean(statusQ.data?.mysqlReachable)}
              existingInstanceCount={listQ.data?.instances?.length ?? 0}
              onCreated={(id) => {
                setSelectedId(id);
                setManagePanelOpen(false);
                void qc.invalidateQueries({ queryKey: ["app-center-redis-instances"] });
              }}
            />
          ) : null}

          <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
            <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/50 px-4 py-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">实例列表</h2>
                  <p className="text-xs text-slate-500">单击行查看下方「实例详情」；来源筛选仅在本页，不增加侧栏菜单项</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-slate-500">来源</span>
                  {managedOnlyScope ? (
                    <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-900">
                      仅显示本人纳管
                    </span>
                  ) : (
                  <ToggleGroup
                    type="single"
                    value={instanceSourceFilter}
                    onValueChange={(v) => {
                      if (v) setInstanceSourceFilter(v as typeof instanceSourceFilter);
                    }}
                    variant="outline"
                    size="sm"
                    className="justify-start"
                    spacing={0}
                  >
                    <ToggleGroupItem value="all" className="h-8 px-2.5 text-xs">
                      全部
                    </ToggleGroupItem>
                    <ToggleGroupItem value="platform" className="h-8 gap-1 px-2.5 text-xs">
                      <Cloud className="h-3 w-3" />
                      平台部署
                    </ToggleGroupItem>
                    <ToggleGroupItem value="managed" className="h-8 gap-1 px-2.5 text-xs">
                      <Network className="h-3 w-3" />
                      纳管
                    </ToggleGroupItem>
                  </ToggleGroup>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="搜索名称 / ID / 地址"
                    className="h-9 pl-8"
                    value={searchQ}
                    onChange={(e) => setSearchQ(e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-9"
                  onClick={() => void listQ.refetch()}
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", listQ.isFetching && "animate-spin")} />
                  刷新
                </Button>
              </div>
            </div>

            {listQ.isLoading ? (
              <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin" /> 加载实例…
              </div>
            ) : listQ.data?.mysqlRequired ? (
              <div className="flex flex-col items-center justify-center gap-2 py-20 text-center text-sm text-slate-500">
                <Cloud className="h-12 w-12 text-slate-300" />
                配置 MySQL 后即可创建云数据库实例。
              </div>
            ) : filteredInstances.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                  <Server className="h-7 w-7" />
                </div>
                <p className="text-sm text-slate-600">
                  {searchQ.trim()
                    ? "无匹配实例，请调整搜索"
                    : instanceSourceFilter !== "all"
                      ? "当前来源筛选下暂无实例，可切换「全部」或另一来源"
                      : "暂无实例，使用「部署向导」在集群部署或「创建实例」纳管外部 Redis"}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-100 hover:bg-transparent">
                      <TableHead className="w-[100px] text-xs font-semibold uppercase tracking-wide text-slate-500">
                        实例 ID
                      </TableHead>
                      <TableHead className="w-[100px] text-xs font-semibold text-slate-500">来源</TableHead>
                      <TableHead className="min-w-[140px] text-xs font-semibold text-slate-500">名称</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-500">架构</TableHead>
                      <TableHead className="min-w-[180px] text-xs font-semibold text-slate-500">接入地址</TableHead>
                      <TableHead className="min-w-[200px] text-xs font-semibold text-slate-500">状态</TableHead>
                      <TableHead className="w-[72px] text-xs font-semibold text-slate-500">DB</TableHead>
                      <TableHead className="w-[88px] text-xs font-semibold text-slate-500">访问控制</TableHead>
                      <TableHead className="w-[120px] text-xs font-semibold text-slate-500">redis-cli</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInstances.map((i) => (
                      <TableRow
                        key={i.id}
                        onClick={() => setSelectedId((prev) => (prev === i.id ? null : i.id))}
                        className={cn(
                          "cursor-pointer border-slate-100 transition-colors",
                          selectedId === i.id ? "bg-sky-50/70 hover:bg-sky-50" : "hover:bg-slate-50/80"
                        )}
                      >
                        <TableCell className="font-mono text-xs text-slate-600">{i.id}</TableCell>
                        <TableCell>
                          {isPlatformK8sRedis(i) ? (
                            <Badge
                              variant="outline"
                              className="border-sky-200 bg-sky-50 font-normal text-sky-900"
                              title="由本控制台 K8s 部署向导创建"
                            >
                              平台部署
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="border-amber-200 bg-amber-50/90 font-normal text-amber-950"
                              title="仅登记连接信息，不经过本页部署向导"
                            >
                              纳管
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-medium text-slate-900">{i.name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-normal">
                            {redisModeLabel(i.summary.mode)}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[280px] truncate font-mono text-xs text-slate-700">
                          {redisEndpointHint(i.summary)}
                        </TableCell>
                        <TableCell className="align-top">
                          {isPlatformK8sRedis(i) ? (
                            <RedisK8sDeployStatusCell instanceId={i.id} hasK8s />
                          ) : (
                            <RedisManagedStatusCell instanceId={i.id} />
                          )}
                        </TableCell>
                        <TableCell className="tabular-nums text-slate-700">{i.summary.db}</TableCell>
                        <TableCell>
                          {i.summary.hasPassword ? (
                            <span className="text-xs text-emerald-700">已设密码</span>
                          ) : (
                            <span className="text-xs text-slate-400">无密码</span>
                          )}
                        </TableCell>
                        <TableCell className="align-middle" onClick={(e) => e.stopPropagation()}>
                          <RedisCliExecButton
                            instance={i}
                            isViewer={!showK8sDeployWizard || isViewer}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {selected ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>实例详情</span>
                <span className="text-slate-300">/</span>
                <span className="font-mono text-slate-700">{selected.name}</span>
              </div>
              <RedisInstanceDetail
                instance={selected}
                isViewer={isViewer}
                onRefresh={() => void qc.invalidateQueries({ queryKey: ["app-center-redis-instances"] })}
              />
            </div>
          ) : !listQ.isLoading && (listQ.data?.instances?.length ?? 0) > 0 ? (
            <Card className="border-dashed border-slate-200">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center text-sm text-slate-500">
                请在上方表格中选择一行实例
              </CardContent>
            </Card>
          ) : null}
        </div>
          </TabsContent>

          <TabsContent value="install" className="mt-4 outline-none">
          <InstallScriptPanel
            isViewer={isViewer}
            mysqlReachable={Boolean(statusQ.data?.mysqlReachable)}
            onK8sDeployed={(id) => {
              setMainTab("redis");
              setSelectedId(id);
              void qc.invalidateQueries({ queryKey: ["app-center-redis-instances"] });
              if (typeof id === "number" && id > 0) {
                void qc.invalidateQueries({ queryKey: ["app-redis-k8s-network", id] });
              }
            }}
          />
          </TabsContent>

          {showK8sDeployWizard ? (
            <TabsContent value="templates" className="mt-4 outline-none">
              <AppCenterRedisTemplates />
            </TabsContent>
          ) : null}
        </Tabs>
      </div>

    </div>
  );
}

function RedisInstanceDetail({
  instance,
  isViewer,
  onRefresh,
}: {
  instance: RedisInstance;
  isViewer: boolean;
  onRefresh: () => void;
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"probe" | "keys" | "clients" | "big">("probe");
  const [runtimeWsEnabled, setRuntimeWsEnabled] = useState(false);
  const [runtimeWsConnected, setRuntimeWsConnected] = useState(false);
  const runtimeWsRef = useRef<WebSocket | null>(null);
  const modeZh = redisModeLabel(instance.summary.mode);

  const runtimeWsLive = tab === "probe" && runtimeWsEnabled;

  const runtimeQ = useQuery({
    queryKey: ["app-redis-runtime", instance.id],
    queryFn: ({ signal }) =>
      apiGetJson<RuntimePayload>(
        `/api/app-center/redis/runtime?instanceId=${encodeURIComponent(String(instance.id))}`
      , { signal }),
    retry: false,
    refetchInterval: (q) => {
      if (tab === "big") return false;
      if (runtimeWsLive) return false;
      if (q.state.error && isRedisFatalApiError(q.state.error)) return false;
      return 3000;
    },
    staleTime: 0,
  });

  useEffect(() => {
    setRuntimeWsEnabled(false);
    setRuntimeWsConnected(false);
  }, [instance.id]);

  useEffect(() => {
    if (!runtimeWsLive) {
      runtimeWsRef.current?.close();
      runtimeWsRef.current = null;
      setRuntimeWsConnected(false);
      return;
    }
    const q = `instanceId=${encodeURIComponent(String(instance.id))}&intervalMs=500`;
    const url = wsUrlForApiPath(`/api/app-center/redis/runtime/ws?${q}`);
    const ws = new WebSocket(url);
    runtimeWsRef.current = ws;
    ws.onopen = () => setRuntimeWsConnected(true);
    ws.onclose = () => setRuntimeWsConnected(false);
    ws.onerror = () => {
      /* onclose 会清理状态 */
    };
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(String(ev.data)) as {
          error?: string;
          kind?: string;
          code?: string;
        };
        if (typeof data.error === "string") {
          const code = data.code;
          const fatal =
            code === "decrypt" || (typeof code === "string" && code.startsWith("redis_"));
          toast.error(data.error, { id: "app-redis-runtime-ws" });
          if (fatal) {
            setRuntimeWsEnabled(false);
            ws.close();
          }
          return;
        }
        toast.dismiss("app-redis-runtime-ws");
        qc.setQueryData(["app-redis-runtime", instance.id], data as RuntimePayload);
      } catch {
        /* ignore */
      }
    };
    return () => {
      ws.close();
      if (runtimeWsRef.current === ws) runtimeWsRef.current = null;
      setRuntimeWsConnected(false);
    };
  }, [runtimeWsLive, instance.id, qc]);

  const [keyCursor, setKeyCursor] = useState("0");
  const [keyMatch, setKeyMatch] = useState("*");
  const [keysResult, setKeysResult] = useState<{
    keys: string[];
    cursor: string;
    done: boolean;
  } | null>(null);
  const [keysLoading, setKeysLoading] = useState(false);
  const [keysAutoRefresh, setKeysAutoRefresh] = useState(false);
  const keyMatchRef = useRef(keyMatch);
  keyMatchRef.current = keyMatch;
  const keysScanGenRef = useRef(0);

  const runKeysScanFull = useCallback(async () => {
    const gen = ++keysScanGenRef.current;
    const match = keyMatchRef.current.trim() || "*";
    setKeyCursor("0");
    setKeysLoading(true);
    try {
      const count = "80";
      let u = new URLSearchParams({ match, cursor: "0", count });
      let res = await apiGetJson<{ keys: string[]; cursor: string; done: boolean }>(
        `/api/app-center/redis/instances/${instance.id}/keys?${u}`
      );
      if (gen !== keysScanGenRef.current) return;
      let acc = [...res.keys];
      let cur = res.cursor;
      let done = res.done;
      setKeysResult({ keys: acc, cursor: cur, done });
      setKeyCursor(cur);
      const maxKeys = 10000;
      const maxBatches = 200;
      let batches = 0;
      while (!done && batches < maxBatches && acc.length < maxKeys) {
        batches++;
        u = new URLSearchParams({ match, cursor: cur, count });
        res = await apiGetJson<{ keys: string[]; cursor: string; done: boolean }>(
          `/api/app-center/redis/instances/${instance.id}/keys?${u}`
        );
        if (gen !== keysScanGenRef.current) return;
        acc = [...acc, ...res.keys];
        cur = res.cursor;
        done = res.done;
        setKeysResult({ keys: acc, cursor: cur, done });
        setKeyCursor(cur);
      }
      if (gen === keysScanGenRef.current && acc.length >= maxKeys && !done) {
        toast.info("已加载前 10000 条键；未遍历完可点「下一批」继续");
      }
    } catch (e) {
      if (gen === keysScanGenRef.current) toast.error((e as Error).message);
    } finally {
      if (gen === keysScanGenRef.current) setKeysLoading(false);
    }
  }, [instance.id]);

  useEffect(() => {
    setKeysResult(null);
    setKeyCursor("0");
    setKeysAutoRefresh(false);
  }, [instance.id]);

  useEffect(() => {
    if (tab !== "keys") return;
    void runKeysScanFull();
    return () => {
      keysScanGenRef.current++;
    };
  }, [tab, instance.id, runKeysScanFull]);

  useEffect(() => {
    if (!keysAutoRefresh || tab !== "keys") return;
    const tick = () => {
      void (async () => {
        try {
          const u = new URLSearchParams({
            match: keyMatch.trim() || "*",
            cursor: "0",
            count: "80",
          });
          const res = await apiGetJson<{ keys: string[]; cursor: string; done: boolean }>(
            `/api/app-center/redis/instances/${instance.id}/keys?${u}`
          );
          setKeysResult(res);
          setKeyCursor(res.cursor);
        } catch {
          /* 轮询失败时保留上次结果 */
        }
      })();
    };
    const id = window.setInterval(tick, 15000);
    return () => window.clearInterval(id);
  }, [keysAutoRefresh, tab, instance.id, keyMatch]);

  const clientsQ = useQuery({
    queryKey: ["app-redis-clients", instance.id],
    queryFn: ({ signal }) =>
      apiGetJson<{ ips: string[]; rawLines: number }>(
        `/api/app-center/redis/instances/${instance.id}/clients`
      , { signal }),
    enabled: tab === "clients",
    retry: false,
    refetchInterval: (q) => {
      if (tab !== "clients") return false;
      if (q.state.error && isRedisFatalApiError(q.state.error)) return false;
      return 5000;
    },
  });
  const bigQ = useQuery({
    queryKey: ["app-redis-bigkeys", instance.id],
    queryFn: ({ signal }) =>
      apiGetJson<{ bigKeys: { key: string; bytes: number }[]; note?: string }>(
        `/api/app-center/redis/instances/${instance.id}/bigkeys?sampleLimit=400`
      , { signal }),
    enabled: false,
    retry: false,
  });

  const delMut = async (keys: string[]) => {
    await apiPostJson(`/api/app-center/redis/instances/${instance.id}/keys/delete`, { keys });
    toast.success(`已删除 ${keys.length} 个键`);
    onRefresh();
  };

  const [releaseOpen, setReleaseOpen] = useState(false);
  const releaseMut = useMutation({
    mutationFn: () =>
      apiDeleteJson<{ ok?: boolean; k8sWarnings?: string[] }>(
        `/api/app-center/redis/instances/${instance.id}`
      ),
    onSuccess: (data) => {
      toast.success("已移除实例配置");
      const warnings = (data?.k8sWarnings ?? []).map((s) => String(s).trim()).filter(Boolean);
      if (warnings.length > 0) {
        toast.message(warnings.join("；"), { duration: 8000 });
      }
      setReleaseOpen(false);
      onRefresh();
    },
    onError: (e: unknown) => {
      toast.error(fmtApiErrorMessage(e));
    },
  });

  return (
    <>
    <Card className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_2px_12px_rgba(15,23,42,0.06)]">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-white to-slate-50/50 px-5 py-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-lg font-semibold text-slate-900">{instance.name}</CardTitle>
            <Badge variant="outline" className="font-normal text-slate-700">
              {modeZh}
            </Badge>
            {isPlatformK8sRedis(instance) ? (
              <Badge variant="outline" className="border-sky-200 bg-sky-50 font-normal text-sky-900">
                平台部署
              </Badge>
            ) : (
              <Badge variant="outline" className="border-amber-200 bg-amber-50/90 font-normal text-amber-950">
                纳管
              </Badge>
            )}
          </div>
          <CardDescription className="font-mono text-xs leading-relaxed text-slate-600">
            实例 ID {instance.id} · DB {instance.summary.db} ·{" "}
            {redisEndpointHint(instance.summary)}
            {instance.summary.masterName ? ` · Master ${instance.summary.masterName}` : ""}
            {instance.summary.k8sServiceType ? ` · Service ${instance.summary.k8sServiceType}` : ""}
          </CardDescription>
        </div>
        {!isViewer && (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="gap-1.5"
            onClick={() => setReleaseOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            释放实例
          </Button>
        )}
      </CardHeader>
      <CardContent className="px-0 pb-5 pt-0">
        {isPlatformK8sRedis(instance) ? (
          <div className="mx-5 mb-4 rounded-xl border border-sky-100 bg-gradient-to-br from-sky-50/90 to-white px-4 py-3 shadow-sm">
            <p className="text-xs font-semibold text-sky-900">缓存与部署规格（创建时快照）</p>
            {!instance.summary.k8sEngineLine &&
            !instance.summary.k8sMaxmemory &&
            !instance.summary.k8sRedisCpuRequest ? (
              <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
                当前实例为较早版本创建，未持久化规格字段；可在工作负载中查看实际资源与镜像。
              </p>
            ) : (
            <div className="mt-2 grid gap-x-8 gap-y-2 text-[11px] sm:grid-cols-2">
              {instance.summary.k8sEngineLine ? (
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="shrink-0 text-slate-500">兼容主版本</span>
                  <span className="font-mono text-slate-800">{instance.summary.k8sEngineLine}.x</span>
                </div>
              ) : null}
              {instance.summary.k8sTemplateName ? (
                <div className="flex flex-wrap items-baseline gap-x-2 sm:col-span-2">
                  <span className="shrink-0 text-slate-500">部署模版</span>
                  <span className="font-mono text-slate-800">
                    {instance.summary.k8sTemplateName}
                    {instance.summary.k8sTemplateId ? ` (id ${instance.summary.k8sTemplateId})` : ""}
                  </span>
                </div>
              ) : null}
              {instance.summary.k8sMaxmemory ? (
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="shrink-0 text-slate-500">maxmemory</span>
                  <span className="font-mono text-slate-800">{instance.summary.k8sMaxmemory}</span>
                </div>
              ) : null}
              {instance.summary.k8sMaxmemoryPolicy ? (
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="shrink-0 text-slate-500">淘汰策略</span>
                  <span className="font-mono text-slate-800">{instance.summary.k8sMaxmemoryPolicy}</span>
                </div>
              ) : null}
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="shrink-0 text-slate-500">AOF</span>
                <span className="text-slate-800">{instance.summary.k8sAppendonly ? "开启" : "关闭"}</span>
              </div>
              {instance.summary.k8sRedisCpuRequest || instance.summary.k8sRedisCpuLimit ? (
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="shrink-0 text-slate-500">CPU request / limit</span>
                  <span className="font-mono text-slate-800">
                    {[instance.summary.k8sRedisCpuRequest || "—", instance.summary.k8sRedisCpuLimit || "—"].join(" / ")}
                  </span>
                </div>
              ) : null}
              {instance.summary.k8sRedisMemoryRequest || instance.summary.k8sRedisMemoryLimit ? (
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="shrink-0 text-slate-500">内存 request / limit</span>
                  <span className="font-mono text-slate-800">
                    {[instance.summary.k8sRedisMemoryRequest || "—", instance.summary.k8sRedisMemoryLimit || "—"].join(
                      " / "
                    )}
                  </span>
                </div>
              ) : null}
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="shrink-0 text-slate-500">持久化 PVC</span>
                <span className="text-slate-800">
                  {instance.summary.k8sPersistenceEnabled === false
                    ? "未启用"
                    : [instance.summary.k8sStorageSize || "默认", instance.summary.k8sStorageClass?.trim() || ""]
                        .filter(Boolean)
                        .join(" · ") || "已启用"}
                </span>
              </div>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="shrink-0 text-slate-500">Exporter 边车</span>
                <span className="text-slate-800">{instance.summary.k8sExporterEnabled ? "启用" : "未启用"}</span>
              </div>
              {instance.summary.k8sRedisImageResolved ? (
                <div className="sm:col-span-2 flex flex-col gap-0.5">
                  <span className="text-slate-500">服务端镜像</span>
                  <span className="break-all font-mono text-[10px] leading-snug text-slate-700">
                    {instance.summary.k8sRedisImageResolved}
                  </span>
                </div>
              ) : null}
              {instance.summary.k8sExporterEnabled && instance.summary.k8sExporterImageResolved ? (
                <div className="sm:col-span-2 flex flex-col gap-0.5">
                  <span className="text-slate-500">Exporter 镜像</span>
                  <span className="break-all font-mono text-[10px] leading-snug text-slate-700">
                    {instance.summary.k8sExporterImageResolved}
                  </span>
                </div>
              ) : null}
            </div>
            )}
          </div>
        ) : null}
        {isPlatformK8sRedis(instance) ? <RedisK8sNetworkSection instanceId={instance.id} /> : null}
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="gap-0">
          <TabsList className="h-auto w-full justify-start gap-0 rounded-none border-b border-slate-200 bg-transparent px-5 pt-2">
            <TabsTrigger
              value="probe"
              className="relative rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm text-slate-600 data-[state=active]:border-sky-600 data-[state=active]:bg-transparent data-[state=active]:text-sky-800 data-[state=active]:shadow-none"
            >
              <span className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5" />
                运行状态
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="keys"
              className="relative rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm text-slate-600 data-[state=active]:border-sky-600 data-[state=active]:bg-transparent data-[state=active]:text-sky-800"
            >
              <span className="flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5" />
                数据管理
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="clients"
              className="relative rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm text-slate-600 data-[state=active]:border-sky-600 data-[state=active]:bg-transparent data-[state=active]:text-sky-800"
            >
              <span className="flex items-center gap-1.5">
                <Network className="h-3.5 w-3.5" />
                客户端连接
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="big"
              className="relative rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm text-slate-600 data-[state=active]:border-sky-600 data-[state=active]:bg-transparent data-[state=active]:text-sky-800"
            >
              诊断分析
            </TabsTrigger>
          </TabsList>

          <TabsContent value="probe" className="space-y-4 px-5 pt-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500">
                {runtimeWsLive
                  ? "已通过 WebSocket 推送运行快照（默认约 500ms，与 GET /runtime 同源）。"
                  : "每 3 秒自动拉取 INFO / DBSIZE / CONFIG（与云监控类似的实时指标）。"}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Switch
                    id="runtime-ws"
                    checked={runtimeWsEnabled}
                    onCheckedChange={setRuntimeWsEnabled}
                  />
                  <Label htmlFor="runtime-ws" className="text-xs text-slate-600">
                    实时推送（WebSocket）
                  </Label>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <span className="relative flex h-2 w-2">
                    <span
                      className={
                        runtimeWsLive && runtimeWsConnected
                          ? "absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"
                          : "hidden"
                      }
                    />
                    <span
                      className={cn(
                        "relative inline-flex h-2 w-2 rounded-full",
                        runtimeWsLive && runtimeWsConnected
                          ? "bg-emerald-500"
                          : runtimeWsLive
                            ? "bg-amber-400"
                            : "bg-slate-300"
                      )}
                    />
                  </span>
                  {runtimeWsLive ? (runtimeWsConnected ? "WS 已连接" : "WS 连接中…") : "轮询"}
                  {runtimeQ.data?.capturedAt ? (
                    <span className="font-mono text-[11px] text-slate-400">
                      {new Date(runtimeQ.data.capturedAt).toLocaleTimeString()}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
            {runtimeQ.isLoading && !runtimeQ.data && (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> 拉取运行数据…
              </div>
            )}
            {runtimeQ.error && (
              <p className="text-sm text-red-600">{fmtApiErrorMessage(runtimeQ.error)}</p>
            )}
            {runtimeQ.data && (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border border-slate-100 bg-gradient-to-br from-white to-slate-50/80 px-4 py-3 shadow-sm">
                    <p className="text-xs font-medium text-slate-500">PING 延迟</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
                      {runtimeQ.data.latencyMs} ms
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-gradient-to-br from-white to-slate-50/80 px-4 py-3 shadow-sm">
                    <p className="text-xs font-medium text-slate-500">QPS（瞬时）</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
                      {runtimeQ.data.sections?.stats?.instantaneous_ops_per_sec ?? "—"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-gradient-to-br from-white to-slate-50/80 px-4 py-3 shadow-sm">
                    <p className="text-xs font-medium text-slate-500">已连接客户端</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
                      {runtimeQ.data.sections?.clients?.connected_clients ?? "—"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-gradient-to-br from-white to-slate-50/80 px-4 py-3 shadow-sm">
                    <p className="text-xs font-medium text-slate-500">当前库键数量</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
                      {runtimeQ.data.dbsize}
                    </p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-xl border border-slate-100 bg-white px-4 py-3">
                    <p className="text-xs font-medium text-slate-500">内存（人类可读）</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {runtimeQ.data.sections?.memory?.used_memory_human ?? "—"}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      峰值 {runtimeQ.data.sections?.memory?.used_memory_peak_human ?? "—"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-white px-4 py-3">
                    <p className="text-xs font-medium text-slate-500">碎片率</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {runtimeQ.data.sections?.memory?.mem_fragmentation_ratio ?? "—"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-white px-4 py-3">
                    <p className="text-xs font-medium text-slate-500">运行时间</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {fmtUptimeSeconds(runtimeQ.data.sections?.server?.uptime_in_seconds)}
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-slate-500">
                      {runtimeQ.data.sections?.server?.redis_version ?? "—"}
                    </p>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3">
                  <p className="text-xs font-semibold text-slate-600">副本 / 角色</p>
                  <p className="mt-1 font-mono text-xs text-slate-800">
                    role: {runtimeQ.data.sections?.replication?.role ?? "—"}{" "}
                    {runtimeQ.data.sections?.replication?.master_host
                      ? `· master ${runtimeQ.data.sections.replication.master_host}:${runtimeQ.data.sections.replication.master_port ?? ""}`
                      : ""}
                  </p>
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold text-slate-600">运行配置（CONFIG 节选）</p>
                  <div className="overflow-x-auto rounded-lg border border-slate-100 bg-white">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="w-[40%] text-xs">参数</TableHead>
                          <TableHead className="text-xs">值</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(runtimeQ.data.config || {}).map(([k, v]) => (
                          <TableRow key={k} className="border-slate-100">
                            <TableCell className="font-mono text-xs text-slate-600">{k}</TableCell>
                            <TableCell className="max-w-[280px] break-all font-mono text-xs text-slate-900">
                              {v}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8"
                  onClick={() => void runtimeQ.refetch()}
                >
                  <RefreshCw className={cn("mr-1 h-3.5 w-3.5", runtimeQ.isFetching && "animate-spin")} />
                  立即刷新
                </Button>
              </>
            )}
          </TabsContent>

          <TabsContent value="keys" className="space-y-4 px-5 pt-5">
            <div className="flex flex-col gap-3 rounded-xl border border-sky-100 bg-sky-50/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1 text-sm">
                <p className="text-xs font-semibold text-sky-900">Key 空间（实时）</p>
                <p className="font-mono text-xs text-slate-700">
                  DBSIZE:{" "}
                  <span className="font-semibold text-slate-900">{runtimeQ.data?.dbsize ?? "—"}</span>
                  {runtimeQ.data?.sections?.keyspace
                    ? ` · ${Object.entries(runtimeQ.data.sections.keyspace)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(" ")}`
                    : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="keys-auto"
                  checked={keysAutoRefresh}
                  onCheckedChange={setKeysAutoRefresh}
                />
                <Label htmlFor="keys-auto" className="text-xs text-slate-600">
                  每 15 秒仅刷新首屏 80 条（会覆盖已加载的多页，与 MATCH 对齐）
                </Label>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label className="text-xs">MATCH</Label>
                <Input
                  className="h-9 w-40 font-mono text-xs"
                  value={keyMatch}
                  onChange={(e) => setKeyMatch(e.target.value)}
                />
              </div>
              <Button
                type="button"
                size="sm"
                disabled={keysLoading}
                onClick={() => void runKeysScanFull()}
              >
                按 MATCH 重新扫描
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={keysLoading || !keysResult}
                onClick={async () => {
                  setKeysLoading(true);
                  try {
                    const u = new URLSearchParams({
                      match: keyMatch.trim() || "*",
                      cursor: keyCursor,
                      count: "80",
                    });
                    const res = await apiGetJson<{ keys: string[]; cursor: string; done: boolean }>(
                      `/api/app-center/redis/instances/${instance.id}/keys?${u}`
                    );
                    setKeysResult((prev) => ({
                      keys: [...(prev?.keys ?? []), ...res.keys],
                      cursor: res.cursor,
                      done: res.done,
                    }));
                    setKeyCursor(res.cursor);
                  } catch (e) {
                    toast.error((e as Error).message);
                  } finally {
                    setKeysLoading(false);
                  }
                }}
              >
                下一批
              </Button>
            </div>
            {keysLoading && !keysResult && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                正在 SCAN 并合并键列表（大库最多自动合并 10000 条）…
              </div>
            )}
            {keysResult && (
              <div className="max-h-[min(480px,60vh)] overflow-y-auto rounded-md border border-slate-100 bg-slate-50/50 p-2 font-mono text-xs">
                {keysResult.keys.length === 0 ? (
                  <span className="text-slate-500">本批无键</span>
                ) : (
                  keysResult.keys.map((k) => (
                    <div
                      key={k}
                      className="flex items-center justify-between gap-2 border-b border-slate-100 py-1 last:border-0"
                    >
                      <span className="truncate">{k}</span>
                      {!isViewer && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 shrink-0 text-red-600"
                          onClick={() => void delMut([k])}
                        >
                          删
                        </Button>
                      )}
                    </div>
                  ))
                )}
                <p className="mt-2 text-slate-500">
                  共 {keysResult.keys.length} 条 · cursor={keyCursor}{" "}
                  {keysResult.done ? "· SCAN 已遍历完" : "· 未遍历完时可点「下一批」"}
                  {keysLoading ? " · 加载中…" : ""}
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="clients" className="space-y-4 px-5 pt-5">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 px-4 py-3 text-sm">
              <p className="text-xs font-semibold text-emerald-900">实时连接数（INFO）</p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-900">
                {runtimeQ.data?.sections?.clients?.connected_clients ?? "—"}
                <span className="ml-2 text-xs font-normal text-slate-500">
                  blocked: {runtimeQ.data?.sections?.clients?.blocked_clients ?? "—"}
                </span>
              </p>
            </div>
            <p className="text-xs text-slate-500">
              下方 CLIENT LIST 每 5 秒自动刷新；IP 已去重、排除本地回环。
            </p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void clientsQ.refetch()}
            >
              立即刷新列表
            </Button>
            {clientsQ.data && (
              <div className="text-sm">
                <p className="text-slate-600">去重后客户端 IP（{clientsQ.data.ips.length}）：</p>
                <ul className="mt-2 list-inside list-disc font-mono text-xs text-slate-800">
                  {clientsQ.data.ips.map((ip) => (
                    <li key={ip}>{ip}</li>
                  ))}
                </ul>
              </div>
            )}
            {clientsQ.error && (
              <p className="text-sm text-red-600">{fmtApiErrorMessage(clientsQ.error)}</p>
            )}
          </TabsContent>

          <TabsContent value="big" className="space-y-4 px-5 pt-5">
            <p className="text-xs text-slate-500">
              对采样键执行 MEMORY USAGE 并排序；数据量大时仅作趋势参考，与云厂商「大 Key 分析」类似。
            </p>
            <Button type="button" size="sm" variant="secondary" onClick={() => void bigQ.refetch()}>
              开始采样分析
            </Button>
            {bigQ.data && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b text-slate-500">
                      <th className="py-1 pr-2">Key</th>
                      <th className="py-1">字节</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bigQ.data.bigKeys.map((r) => (
                      <tr key={r.key} className="border-b border-slate-50 font-mono">
                        <td className="max-w-[320px] truncate py-1 pr-2">{r.key}</td>
                        <td className="py-1">{r.bytes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {bigQ.error && <p className="text-sm text-red-600">{fmtApiErrorMessage(bigQ.error)}</p>}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>

      <AlertDialog
        open={releaseOpen}
        onOpenChange={(o) => {
          setReleaseOpen(o);
          if (!o) releaseMut.reset();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>释放实例？</AlertDialogTitle>
            <AlertDialogDescription>
              将仅移除控制台中的实例配置「
              <span className="font-mono text-foreground">{instance.name}</span>
              」；不会删除 Kubernetes 工作负载或外部 Redis 上的数据。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            {releaseMut.isError && (
              <p className="mr-auto w-full text-left text-sm text-red-600">
                {fmtApiErrorMessage(releaseMut.error)}
              </p>
            )}
            <AlertDialogCancel>取消</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={releaseMut.isPending}
              onClick={() => releaseMut.mutate()}
            >
              {releaseMut.isPending ? "释放中…" : "确认释放"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function RedisK8sDeployStatusCell({ instanceId, hasK8s }: { instanceId: number; hasK8s: boolean }) {
  const q = useQuery({
    queryKey: ["app-redis-k8s-status", instanceId],
    queryFn: ({ signal }) =>
      apiGetJson<{ phase: string; summary: string }>(`/api/app-center/redis/instances/${instanceId}/k8s-status`, { signal }),
    enabled: hasK8s && instanceId > 0,
    refetchInterval: (query) => {
      const p = query.state.data?.phase;
      if (p === "ready" || p === "failed") return false;
      return 4000;
    },
  });
  if (!hasK8s) {
    return <span className="text-xs text-slate-400">—</span>;
  }
  if (q.isLoading) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-slate-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> 查询…
      </span>
    );
  }
  if (q.error) {
    return <span className="text-xs text-red-600">状态失败</span>;
  }
  const ph = q.data?.phase ?? "unknown";
  const detail = q.data?.summary ?? "";
  const label =
    ph === "ready" ? "就绪" : ph === "failed" ? "失败" : ph === "progressing" ? "部署中" : "未知";
  const cls =
    ph === "ready"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : ph === "failed"
        ? "border-red-200 bg-red-50 text-red-900"
        : "border-amber-200 bg-amber-50 text-amber-950";
  return (
    <div className="max-w-[240px] space-y-0.5">
      <Badge variant="outline" className={cn("font-normal text-[0.65rem]", cls)}>
        {label}
      </Badge>
      {detail ? (
        <p className="line-clamp-2 text-[10px] leading-snug text-slate-500" title={detail}>
          {detail}
        </p>
      ) : null}
    </div>
  );
}

/** 类公有云「规格」：联动 maxmemory 与 Pod resources（腾讯云式：先选档位，再可改自定义） */
const REDIS_RESOURCE_PRESETS = {
  entry: { maxmem: "256mb", cpuReq: "100m", cpuLim: "500m", memReq: "384Mi", memLim: "512Mi" },
  standard: { maxmem: "512mb", cpuReq: "250m", cpuLim: "1000m", memReq: "768Mi", memLim: "1Gi" },
  highmem: { maxmem: "1024mb", cpuReq: "500m", cpuLim: "2000m", memReq: "1536Mi", memLim: "2Gi" },
} as const;

type RedisResourcePresetKey = keyof typeof REDIS_RESOURCE_PRESETS;
type RedisResourcePreset = RedisResourcePresetKey | "custom";

/** 应用中心 K8s 部署仅支持 Redis 6.x / 7.x */
type EngineLine = "7" | "6";

function RedisWizardSection({
  step,
  title,
  subtitle,
  children,
}: {
  step: number;
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm">
      <div className="flex gap-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-emerald-50/30 px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white shadow-sm">
          {step}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold tracking-tight text-slate-900">{title}</h3>
          {subtitle ? <div className="mt-1.5 text-[11px] leading-relaxed text-slate-600">{subtitle}</div> : null}
        </div>
      </div>
      <div className="space-y-3 px-4 py-4">{children}</div>
    </div>
  );
}

function InstallScriptPanel({
  isViewer,
  mysqlReachable,
  onK8sDeployed,
}: {
  isViewer: boolean;
  mysqlReachable: boolean;
  onK8sDeployed?: (id: number) => void;
}) {
  const [clusterChoice, setClusterChoice] = useState("current");
  const [k8sNamespace, setK8sNamespace] = useState("default");
  const [nsFilter, setNsFilter] = useState("");
  const [deploymentName, setDeploymentName] = useState("redis-appcenter");
  const [podPort, setPodPort] = useState(6379);
  const [svcPort, setSvcPort] = useState(6379);
  const [resourcePreset, setResourcePreset] = useState<RedisResourcePreset>("standard");
  const [maxmem, setMaxmem] = useState("512mb");
  const [redisCpuRequest, setRedisCpuRequest] = useState("250m");
  const [redisCpuLimit, setRedisCpuLimit] = useState("1000m");
  const [redisMemoryRequest, setRedisMemoryRequest] = useState("768Mi");
  const [redisMemoryLimit, setRedisMemoryLimit] = useState("1Gi");
  const [pol, setPol] = useState("allkeys-lru");
  const [aof, setAof] = useState(true);
  const [tcpBacklog, setTcpBacklog] = useState(511);
  const [tcpKeepalive, setTcpKeepalive] = useState(60);
  const [clientTimeoutSec, setClientTimeoutSec] = useState(0);
  const [maxClients, setMaxClients] = useState(10000);
  const [hz, setHz] = useState(10);
  const [ioThreads, setIoThreads] = useState(0);
  const [lazyEviction, setLazyEviction] = useState(true);
  const [lazyExpire, setLazyExpire] = useState(true);
  const [redisPassword, setRedisPassword] = useState("");
  const [enableExporter, setEnableExporter] = useState(true);
  const [topology, setTopology] = useState<"standalone" | "sentinel" | "cluster">("standalone");
  const [engineLine, setEngineLine] = useState<EngineLine>("7");
  const [sentinelMasterName, setSentinelMasterName] = useState("mymaster");
  const [persistenceEnabled, setPersistenceEnabled] = useState(true);
  const [storageSize, setStorageSize] = useState("10Gi");
  const [storageClassName, setStorageClassName] = useState("");
  const [serviceType, setServiceType] = useState<"clusterip" | "nodeport" | "loadbalancer">("clusterip");
  const [nodePortRedis, setNodePortRedis] = useState("");
  const [nodePortClusterBus, setNodePortClusterBus] = useState("");
  const [hostNetwork, setHostNetwork] = useState(false);
  const [monitorContext, setMonitorContext] = useState<{
    ns: string;
    dep: string;
    exporter: boolean;
  } | null>(null);
  const [deployTemplateId, setDeployTemplateId] = useState<number | null>(null);

  const templatesQ = useQuery({
    queryKey: ["app-center-redis-templates"],
    queryFn: ({ signal }) =>
      apiGetJson<{ templates: { id: number; config: { defaultAppendonly?: boolean | null } }[]; mysqlRequired?: boolean }>(
        "/api/app-center/redis/templates"
      , { signal }),
    enabled: mysqlReachable,
  });

  useEffect(() => {
    const list = templatesQ.data?.templates ?? [];
    if (deployTemplateId == null && list.length === 1) {
      setDeployTemplateId(list[0].id);
    }
  }, [templatesQ.data?.templates, deployTemplateId]);

  useEffect(() => {
    if (deployTemplateId == null) return;
    const t = (templatesQ.data?.templates ?? []).find((x) => x.id === deployTemplateId);
    if (!t?.config) return;
    if (t.config.defaultAppendonly === true) setAof(true);
    else if (t.config.defaultAppendonly === false) setAof(false);
  }, [deployTemplateId, templatesQ.data?.templates]);

  const cfgQ = useAppConfig();

  useEffect(() => {
    const c = cfgQ.data;
    if (!c) return;
    if (typeof c.redisK8sPersistenceEnabled === "boolean") {
      setPersistenceEnabled(c.redisK8sPersistenceEnabled);
    }
    if (String(c.redisK8sStorageSize ?? "").trim()) {
      setStorageSize(String(c.redisK8sStorageSize).trim());
    }
    if (c.redisK8sStorageClass !== undefined) {
      setStorageClassName(String(c.redisK8sStorageClass ?? "").trim());
    }
  }, [cfgQ.data]);

  useEffect(() => {
    if (resourcePreset === "custom") return;
    const p = REDIS_RESOURCE_PRESETS[resourcePreset];
    setMaxmem(p.maxmem);
    setRedisCpuRequest(p.cpuReq);
    setRedisCpuLimit(p.cpuLim);
    setRedisMemoryRequest(p.memReq);
    setRedisMemoryLimit(p.memLim);
  }, [resourcePreset]);

  const markResourceCustom = () => setResourcePreset("custom");

  const scQ = useQuery({
    queryKey: ["k8s-storage-classes"],
    queryFn: ({ signal }) => apiGetJson<{ items?: { name: string; isDefault?: boolean }[] }>("/api/k8s/storage-classes", { signal }),
    retry: false,
  });

  const nsQ = useQuery({
    queryKey: ["namespaces", "k8s-redis"],
    queryFn: ({ signal }) => apiGetJson<string[]>("/api/namespaces", { signal }),
    retry: false,
  });

  /** 有匹配时仅显示匹配项；无匹配时回退为全量，避免下拉为空 */
  const namespacesForSelect = useMemo(() => {
    const list = nsQ.data ?? [];
    const q = nsFilter.trim().toLowerCase();
    if (!q) return list;
    const hit = list.filter((n) => n.toLowerCase().includes(q));
    return hit.length > 0 ? hit : list;
  }, [nsQ.data, nsFilter]);

  const deployMut = useMutation({
    mutationFn: () =>
      apiPostJson<{
        message?: string;
        instanceId?: number;
        instanceWarning?: string;
        network?: {
          hint?: string;
          services?: Array<{
            name: string;
            namespace: string;
            type: string;
            clusterIP?: string;
            clusterDNS: string;
            ports: Array<{ name?: string; port: number; nodePort?: number; protocol?: string }>;
            loadBalancerIP?: string;
            note?: string;
          }>;
        };
      }>("/api/app-center/redis/k8s-deploy", {
        namespace: k8sNamespace.trim(),
        deploymentName: deploymentName.trim(),
        version: engineLine,
        maxmemory: maxmem,
        maxmemoryPolicy: pol,
        appendonly: aof,
        podPort,
        svcPort,
        password: redisPassword.trim() || undefined,
        enableExporter: topology === "cluster" ? false : enableExporter,
        topology,
        templateId: deployTemplateId ?? 0,
        sentinelMasterName: topology === "sentinel" ? sentinelMasterName.trim() || undefined : undefined,
        persistenceEnabled,
        storageSize: storageSize.trim() || undefined,
        storageClassName: storageClassName.trim() || undefined,
        tcpBacklog,
        tcpKeepalive,
        clientTimeoutSec,
        maxClients,
        hz,
        ioThreads,
        lazyfreeLazyEviction: lazyEviction,
        lazyfreeLazyExpire: lazyExpire,
        redisCpuRequest: redisCpuRequest.trim() || undefined,
        redisCpuLimit: redisCpuLimit.trim() || undefined,
        redisMemoryRequest: redisMemoryRequest.trim() || undefined,
        redisMemoryLimit: redisMemoryLimit.trim() || undefined,
        serviceType,
        nodePortRedis: (() => {
          const n = parseInt(nodePortRedis.trim(), 10);
          return Number.isFinite(n) && n > 0 ? n : 0;
        })(),
        nodePortClusterBus: (() => {
          const n = parseInt(nodePortClusterBus.trim(), 10);
          return Number.isFinite(n) && n > 0 ? n : 0;
        })(),
        hostNetwork,
      }),
    onSuccess: (res) => {
      toast.success(res.message ?? "已部署到 Kubernetes");
      if (res.network?.services?.length || res.network?.hint) {
        toast.message("接入地址（Service / NodePort）已写入该实例详情中的「集群接入与网络」", { duration: 6000 });
      }
      if (res.instanceWarning) {
        toast.warning("实例列表未完全同步", { description: res.instanceWarning });
      }
      if (typeof res.instanceId === "number" && res.instanceId > 0) {
        onK8sDeployed?.(res.instanceId);
      }
      const base = deploymentName.trim();
      const depForMetrics = topology === "sentinel" ? `${base}-master` : base;
      setMonitorContext({
        ns: k8sNamespace.trim(),
        dep: depForMetrics,
        exporter: topology === "cluster" ? false : enableExporter,
      });
    },
    onError: (e: unknown) => {
      toast.error(fmtApiErrorMessage(e));
    },
  });

  const doK8sDeploy = () => {
    if (isViewer) {
      toast.error("只读账号无法部署");
      return;
    }
    if (!k8sNamespace.trim()) {
      toast.error("请选择命名空间");
      return;
    }
    if (!deploymentName.trim()) {
      toast.error("请填写 Deployment 名称");
      return;
    }
    const np = parseInt(nodePortRedis.trim(), 10);
    const redisNp = Number.isFinite(np) && np > 0 ? np : 0;
    if (redisNp !== 0 && (redisNp < 30000 || redisNp > 32767)) {
      toast.error("Redis NodePort 须为 30000–32767 或留空自动分配");
      return;
    }
    const nbus = parseInt(nodePortClusterBus.trim(), 10);
    const busNp = Number.isFinite(nbus) && nbus > 0 ? nbus : 0;
    if (busNp !== 0 && (busNp < 30000 || busNp > 32767)) {
      toast.error("Cluster 总线 NodePort 须为 30000–32767 或留空自动分配");
      return;
    }
    deployMut.mutate();
  };

  return (
    <>
    <Card className="overflow-hidden rounded-2xl border border-slate-200/90 shadow-sm">
      <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-sky-50/40 px-6 py-5">
        <CardTitle className="text-base font-semibold text-slate-900">快速部署向导</CardTitle>
        <CardDescription className="mt-1 text-slate-600">
          参考腾讯云「实例配置」交互：依次选择<strong>产品版本</strong>、<strong>架构版本</strong>与<strong>部署位置</strong>，再确认规格与持久化。创建后可在工作负载中调整环境变量与资源。
        </CardDescription>
      </div>
      <CardContent className="space-y-4 px-6 py-6">
        <div className="rounded-lg border border-emerald-100 bg-gradient-to-r from-emerald-50/80 to-sky-50/50 px-4 py-3">
          <p className="text-xs font-semibold text-emerald-900">实例配置</p>
          <p className="mt-1 text-[11px] leading-relaxed text-emerald-900/85">
            流程：① 产品版本与镜像 → ② 架构版本 → ③ 部署位置与网络 → ④ 规格与持久化 → ⑤ 参数与部署。
          </p>
        </div>

        <RedisWizardSection
          step={1}
          title="部署模版与版本"
          subtitle={
            <>
              镜像、私有仓库拉取 Secret、RDB save 规则等在「模版中心」维护；此处选择主版本线（仅 6.x / 7.x）。请确保目标命名空间已创建模版中填写的{" "}
              <span className="font-mono">imagePullSecret</span>。
            </>
          }
        >
          {mysqlReachable ? (
            <AppCenterRedisTemplates
              variant="picker"
              value={deployTemplateId}
              onChange={setDeployTemplateId}
              disabled={isViewer}
            />
          ) : (
            <Alert className="border-amber-200 bg-amber-50/90 text-amber-950">
              <ShieldAlert className="h-4 w-4 text-amber-700" />
              <AlertTitle>未连接 MySQL</AlertTitle>
              <AlertDescription className="text-[11px] leading-relaxed text-amber-900/90">
                按模版部署需要 MySQL 存储模版数据。请配置 <code className="rounded bg-amber-100/90 px-1 font-mono text-[11px]">MYSQL_DSN</code>{" "}
                后刷新页面。
              </AlertDescription>
            </Alert>
          )}
          <div className="space-y-1 pt-2">
            <Label>兼容主版本（6 / 7）</Label>
            <Select
              value={engineLine}
              onValueChange={(v) => setEngineLine(v as EngineLine)}
            >
              <SelectTrigger className="h-9 max-w-md">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7.x 系列（推荐）</SelectItem>
                <SelectItem value="6">6.x 系列</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </RedisWizardSection>

        <RedisWizardSection
          step={2}
          title="架构版本"
          subtitle="选择与腾讯云「架构」类似的部署形态：单机、高可用哨兵或分片集群。"
        >
          <ToggleGroup
                type="single"
                value={topology}
                onValueChange={(v) => {
                  if (!v) return;
                  const t = v as "standalone" | "sentinel" | "cluster";
                  setTopology(t);
                  if (t === "cluster") setEnableExporter(false);
                }}
                variant="outline"
                className="mt-3 grid w-full grid-cols-1 gap-2 sm:grid-cols-3"
                spacing={0}
              >
                <ToggleGroupItem
                  value="standalone"
                  aria-label="单点"
                  className="h-auto min-h-[5rem] w-full flex-col items-stretch justify-start gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-3 text-left shadow-sm data-[state=on]:border-emerald-500 data-[state=on]:bg-emerald-50/60 data-[state=on]:shadow-md"
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Server className="h-4 w-4 shrink-0 text-emerald-600" />
                    单点
                  </span>
                  <span className="text-[11px] font-normal leading-snug text-slate-500">
                    1×Deployment + Service，可选 exporter
                  </span>
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="sentinel"
                  aria-label="哨兵"
                  className="h-auto min-h-[5rem] w-full flex-col items-stretch justify-start gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-3 text-left shadow-sm data-[state=on]:border-emerald-500 data-[state=on]:bg-emerald-50/60 data-[state=on]:shadow-md"
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Shield className="h-4 w-4 shrink-0 text-emerald-600" />
                    哨兵
                  </span>
                  <span className="text-[11px] font-normal leading-snug text-slate-500">
                    主从 + 3×Sentinel，主节点可挂 exporter
                  </span>
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="cluster"
                  aria-label="Cluster"
                  className="h-auto min-h-[5rem] w-full flex-col items-stretch justify-start gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-3 text-left shadow-sm data-[state=on]:border-emerald-500 data-[state=on]:bg-emerald-50/60 data-[state=on]:shadow-md"
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Layers className="h-4 w-4 shrink-0 text-emerald-600" />
                    Cluster
                  </span>
                  <span className="text-[11px] font-normal leading-snug text-slate-500">
                    6 节点 StatefulSet + 初始化 Job（3 主 3 从）
                  </span>
                </ToggleGroupItem>
              </ToggleGroup>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                哨兵/Cluster 会在名称后追加 <span className="font-mono">-master</span>、
                <span className="font-mono">-replica</span>、<span className="font-mono">-sentinel</span>、
                <span className="font-mono">-cluster</span> 等；请使用较短前缀（DNS 标签总长 ≤63）。
              </p>
              <div className="rounded-md border border-slate-100 bg-slate-50/90 px-3 py-2.5">
                <p className="text-xs font-medium text-slate-800">架构说明</p>
                <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-slate-600">
                  <li>
                    <strong className="text-slate-700">单点</strong>：单副本，适合开发、缓存与低 SLA。
                  </li>
                  <li>
                    <strong className="text-slate-700">哨兵</strong>：主从复制 + Sentinel 选举，自动故障转移。
                  </li>
                  <li>
                    <strong className="text-slate-700">Cluster</strong>：Redis Cluster 分片，固定 6 节点（3 主 3 从）。
                  </li>
                </ul>
              </div>
        </RedisWizardSection>

        <RedisWizardSection
          step={3}
          title="部署位置"
          subtitle={
            <>
              命名空间、工作负载名称与容器/Service 端口；并可选择 Service 网络模式（ClusterIP / NodePort / LoadBalancer）。
            </>
          }
        >
            <p className="text-xs text-slate-500">
              平台为<strong className="font-medium text-slate-700">单集群</strong>：与「系统设置 / 运行时配置」或{" "}
              <code className="rounded bg-slate-100 px-1 font-mono text-[11px]">KUBECONFIG</code> / in-cluster 一致。
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Kubernetes 集群</Label>
                <Select value={clusterChoice} onValueChange={setClusterChoice}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="选择集群" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="current">
                      {cfgQ.data?.k8sConfigured ? "当前已连接集群" : "当前集群（未检测或未配置）"}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>筛选命名空间</Label>
                <Input
                  className="h-9 font-mono text-xs"
                  value={nsFilter}
                  onChange={(e) => setNsFilter(e.target.value)}
                  placeholder="输入关键字筛选下方列表…"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>命名空间（下拉选择）</Label>
                {nsQ.isLoading ? (
                  <div className="flex h-9 items-center gap-2 text-xs text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> 加载 Namespace…
                  </div>
                ) : (
                  <Select value={k8sNamespace} onValueChange={setK8sNamespace}>
                    <SelectTrigger className="h-9 font-mono text-xs">
                      <SelectValue placeholder="选择命名空间" />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      {namespacesForSelect.length === 0 ? (
                        <div className="px-2 py-3 text-center text-xs text-slate-500">暂无命名空间数据</div>
                      ) : (
                        namespacesForSelect.map((ns) => (
                          <SelectItem key={ns} value={ns} className="font-mono text-xs">
                            {ns}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                )}
                {nsQ.error && (
                  <p className="text-xs text-amber-700">
                    无法列出 Namespace（{fmtApiErrorMessage(nsQ.error)}）。请确认 K8s 已连接后重试。
                  </p>
                )}
              </div>
              {topology === "sentinel" && (
                <div className="space-y-1 sm:col-span-2">
                  <Label>哨兵监控的 master 名称</Label>
                  <Input
                    className="h-9 font-mono text-xs"
                    value={sentinelMasterName}
                    onChange={(e) => setSentinelMasterName(e.target.value)}
                    placeholder="mymaster"
                    autoComplete="off"
                  />
                </div>
              )}
              <div className="space-y-1 sm:col-span-2">
                <Label>Deployment / Service 名称</Label>
                <Input
                  className="h-9 font-mono text-xs"
                  value={deploymentName}
                  onChange={(e) => setDeploymentName(e.target.value)}
                  placeholder="redis-appcenter"
                  autoComplete="off"
                />
                <p className="text-[11px] text-slate-500">
                  单点：Deployment 与同名 Service；哨兵：主入口 Service 为 <span className="font-mono">名称-master</span>；Cluster：StatefulSet{" "}
                  <span className="font-mono">名称-cluster</span>（6 Pod），另需对外访问时会创建 <span className="font-mono">名称-cluster-access</span>。
                </p>
              </div>
              <div className="space-y-1">
                <Label>Pod 端口（容器）</Label>
                <Input
                  type="number"
                  className="h-9"
                  value={podPort}
                  onChange={(e) => setPodPort(Number(e.target.value) || 6379)}
                  min={1}
                  max={65535}
                />
              </div>
              <div className="space-y-1">
                <Label>Service 端口</Label>
                <Input
                  type="number"
                  className="h-9"
                  value={svcPort}
                  onChange={(e) => setSvcPort(Number(e.target.value) || 6379)}
                  min={1}
                  max={65535}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>网络模式（Service 类型）</Label>
                <Select value={serviceType} onValueChange={(v) => setServiceType(v as typeof serviceType)}>
                  <SelectTrigger className="h-9 max-w-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="clusterip">ClusterIP（集群内访问）</SelectItem>
                    <SelectItem value="nodeport">NodePort（节点 IP + 固定端口）</SelectItem>
                    <SelectItem value="loadbalancer">LoadBalancer（云负载均衡，视集群能力）</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-slate-500">
                  单点/哨兵作用于主 Redis Service；Cluster 模式下 headless 仍用于 Pod DNS，对外访问使用{" "}
                  <span className="font-mono">-cluster-access</span> Service（NodePort/LB 时）。
                </p>
              </div>
              {(serviceType === "nodeport" || serviceType === "loadbalancer") && (
                <>
                  <div className="space-y-1 sm:col-span-2">
                    <Label>Redis NodePort（可选）</Label>
                    <Input
                      className="h-9 max-w-xs font-mono text-xs"
                      value={nodePortRedis}
                      onChange={(e) => setNodePortRedis(e.target.value.replace(/[^\d]/g, ""))}
                      placeholder="留空由集群分配（建议 30000–32767）"
                      autoComplete="off"
                    />
                  </div>
                  {topology === "cluster" && (
                    <div className="space-y-1 sm:col-span-2">
                      <Label>Cluster 总线 NodePort（可选）</Label>
                      <Input
                        className="h-9 max-w-xs font-mono text-xs"
                        value={nodePortClusterBus}
                        onChange={(e) => setNodePortClusterBus(e.target.value.replace(/[^\d]/g, ""))}
                        placeholder="第二端口，留空自动；与 Redis 端口均须在同一 NodePort 范围"
                        autoComplete="off"
                      />
                    </div>
                  )}
                </>
              )}
              <div className="space-y-1 sm:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor="redis-hostnetwork" className="cursor-pointer">
                    使用宿主机网络（hostNetwork）
                  </Label>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="redis-hostnetwork"
                      checked={hostNetwork}
                      onCheckedChange={setHostNetwork}
                    />
                    <span className="text-xs text-slate-600">
                      {hostNetwork ? "已启用" : "已关闭"}
                    </span>
                  </div>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-500">
                  hostNetwork 模式下 Pod 直接使用节点网络，外部可通过节点 IP 直接访问 Redis 端口。
                  Cluster 模式建议配合 NodePort 或搭配反亲和性分散到不同节点，避免端口冲突。
                </p>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor="redis-exp" className="cursor-pointer">
                    redis_exporter 边车
                  </Label>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="redis-exp"
                      checked={topology === "cluster" ? false : enableExporter}
                      onCheckedChange={setEnableExporter}
                      disabled={topology === "cluster"}
                    />
                    <span className="text-xs text-slate-600">
                      {topology === "cluster"
                        ? "Cluster 模式不适用"
                        : enableExporter
                          ? "已启用"
                          : "已关闭"}
                    </span>
                  </div>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-500">
                  {topology === "sentinel" ? (
                    <>仅挂在 <span className="font-mono">master</span> Deployment；哨兵与副本 Pod 无 exporter。</>
                  ) : topology === "cluster" ? (
                    <>Cluster 模式未挂边车；请使用 Redis Cluster 专用监控方案。</>
                  ) : (
                    <>
                      与 Redis 同 Pod，监听 <span className="font-mono">:9121/metrics</span>；Service 增加 metrics 端口，Pod 模板带{" "}
                      <span className="font-mono">prometheus.io/scrape</span> 注解。需在 Prometheus 中抓取该目标后下图才有数据。
                    </>
                  )}
                </p>
              </div>
            </div>
        </RedisWizardSection>

        <RedisWizardSection
          step={4}
          title="规格与持久化"
          subtitle={
            <>
              Pod 的 CPU/内存 request 与 limit 对应云上「规格」；<span className="font-mono">maxmemory</span> 在下一步中单独配置。PVC 对应磁盘持久化，与腾讯云「数据盘」概念类似。
            </>
          }
        >
          <div className="space-y-3 rounded-xl border border-slate-200/90 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-semibold text-slate-800">规格与计算资源</p>
            <p className="text-[11px] leading-relaxed text-slate-500">
              对应 Pod 的 CPU/内存 request 与 limit；与下方 Redis <span className="font-mono">maxmemory</span> 是两层概念，建议内存 limit
              略高于 maxmemory（含进程与页缓存）。创建后可在工作负载中继续改环境变量、资源与副本，与云上「先开实例再调参」一致。
            </p>
            <div className="space-y-1">
              <Label>规格模板</Label>
              <Select
                value={resourcePreset}
                onValueChange={(v) => setResourcePreset(v as RedisResourcePreset)}
              >
                <SelectTrigger className="h-9 max-w-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="entry">入门（开发 / 测试）</SelectItem>
                  <SelectItem value="standard">标准（默认）</SelectItem>
                  <SelectItem value="highmem">高内存</SelectItem>
                  <SelectItem value="custom">自定义</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="font-mono text-[11px]">cpu request</Label>
                <Input
                  className="h-9 font-mono text-xs"
                  value={redisCpuRequest}
                  onChange={(e) => {
                    setRedisCpuRequest(e.target.value);
                    markResourceCustom();
                  }}
                  placeholder="250m"
                />
              </div>
              <div className="space-y-1">
                <Label className="font-mono text-[11px]">cpu limit</Label>
                <Input
                  className="h-9 font-mono text-xs"
                  value={redisCpuLimit}
                  onChange={(e) => {
                    setRedisCpuLimit(e.target.value);
                    markResourceCustom();
                  }}
                  placeholder="1000m"
                />
              </div>
              <div className="space-y-1">
                <Label className="font-mono text-[11px]">memory request</Label>
                <Input
                  className="h-9 font-mono text-xs"
                  value={redisMemoryRequest}
                  onChange={(e) => {
                    setRedisMemoryRequest(e.target.value);
                    markResourceCustom();
                  }}
                  placeholder="768Mi"
                />
              </div>
              <div className="space-y-1">
                <Label className="font-mono text-[11px]">memory limit</Label>
                <Input
                  className="h-9 font-mono text-xs"
                  value={redisMemoryLimit}
                  onChange={(e) => {
                    setRedisMemoryLimit(e.target.value);
                    markResourceCustom();
                  }}
                  placeholder="1Gi"
                />
              </div>
            </div>
          </div>
          <div className="space-y-2 rounded-lg border border-slate-200/90 bg-slate-50/40 px-3 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="redis-pvc" className="cursor-pointer">
                数据持久化（PVC）
              </Label>
              <div className="flex items-center gap-2">
                <Switch
                  id="redis-pvc"
                  checked={persistenceEnabled}
                  onCheckedChange={setPersistenceEnabled}
                />
                <span className="text-xs text-slate-600">
                  {persistenceEnabled ? "已开启" : "关闭（emptyDir，重启丢数据）"}
                </span>
              </div>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500">
              开启时为数据目录创建 PVC；StorageClass 选「自动」时由集群选用默认 StorageClass。
            </p>
            {persistenceEnabled && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>容量</Label>
                  <Input
                    className="h-9 font-mono text-xs"
                    value={storageSize}
                    onChange={(e) => setStorageSize(e.target.value)}
                    placeholder="10Gi"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1">
                  <Label>StorageClass</Label>
                  <Select
                    value={storageClassName ? storageClassName : "__auto__"}
                    onValueChange={(v) => setStorageClassName(v === "__auto__" ? "" : v)}
                  >
                    <SelectTrigger className="h-9 font-mono text-xs">
                      <SelectValue placeholder="自动" />
                    </SelectTrigger>
                    <SelectContent className="max-h-56">
                      <SelectItem value="__auto__" className="font-mono text-xs">
                        自动（集群默认 SC）
                      </SelectItem>
                      {(scQ.data?.items ?? []).map((sc) => (
                        <SelectItem key={sc.name} value={sc.name} className="font-mono text-xs">
                          {sc.name}
                          {sc.isDefault ? "（默认）" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {scQ.error && (
                    <p className="text-[11px] text-amber-700">
                      无法列出 StorageClass：{fmtApiErrorMessage(scQ.error)}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </RedisWizardSection>

        <RedisWizardSection
          step={5}
          title="安全与 Redis 参数"
          subtitle="密码、内存策略、AOF 与连接/线程参数；与云上「参数配置」页类似，生成清单后一键部署。"
        >
        <div className="max-w-lg space-y-1">
          <Label>Redis 密码（可选）</Label>
          <Input
            type="password"
            className="h-9"
            value={redisPassword}
            onChange={(e) => setRedisPassword(e.target.value)}
            autoComplete="off"
            placeholder="留空则无密码"
          />
          <p className="text-[11px] text-slate-500">
            非空时写入 Secret、启用 requirepass，并供 redis_exporter 使用。
          </p>
        </div>

        <div className="rounded-xl border border-slate-200/90 bg-white px-4 py-3">
          <p className="text-xs font-semibold text-slate-800">内存与持久化策略</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>maxmemory</Label>
              <Input
                value={maxmem}
                onChange={(e) => {
                  setMaxmem(e.target.value);
                  markResourceCustom();
                }}
                placeholder="512mb"
                className="h-9 font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label>maxmemory-policy</Label>
              <Select value={pol} onValueChange={setPol}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="allkeys-lru">allkeys-lru</SelectItem>
                  <SelectItem value="volatile-lru">volatile-lru</SelectItem>
                  <SelectItem value="allkeys-lfu">allkeys-lfu</SelectItem>
                  <SelectItem value="noeviction">noeviction</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Switch checked={aof} onCheckedChange={setAof} id="aof" />
            <Label htmlFor="aof">appendonly（AOF）</Label>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/90 bg-slate-50/50 px-4 py-3">
          <p className="text-xs font-semibold text-slate-800">性能与连接（生产建议）</p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            对应 redis-server 的 backlog、keepalive、客户端超时、最大连接数、hz、惰性释放与 IO 线程（Redis 6+）。
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <Label>tcp-backlog</Label>
              <Input
                type="number"
                className="h-9 font-mono text-xs"
                min={1}
                value={tcpBacklog}
                onChange={(e) => setTcpBacklog(Number(e.target.value) || 511)}
              />
            </div>
            <div className="space-y-1">
              <Label>tcp-keepalive（秒）</Label>
              <Input
                type="number"
                className="h-9 font-mono text-xs"
                min={0}
                value={tcpKeepalive}
                onChange={(e) => setTcpKeepalive(Number(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1">
              <Label>timeout（秒，0=关闭空闲断开）</Label>
              <Input
                type="number"
                className="h-9 font-mono text-xs"
                min={0}
                value={clientTimeoutSec}
                onChange={(e) => setClientTimeoutSec(Number(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1">
              <Label>maxclients</Label>
              <Input
                type="number"
                className="h-9 font-mono text-xs"
                min={1}
                value={maxClients}
                onChange={(e) => setMaxClients(Number(e.target.value) || 10000)}
              />
            </div>
            <div className="space-y-1">
              <Label>hz</Label>
              <Input
                type="number"
                className="h-9 font-mono text-xs"
                min={1}
                max={500}
                value={hz}
                onChange={(e) => setHz(Number(e.target.value) || 10)}
              />
            </div>
            <div className="space-y-1">
              <Label>io-threads（0=关闭）</Label>
              <Input
                type="number"
                className="h-9 font-mono text-xs"
                min={0}
                max={128}
                value={ioThreads}
                onChange={(e) => setIoThreads(Number(e.target.value) || 0)}
              />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch id="lazy-ev" checked={lazyEviction} onCheckedChange={setLazyEviction} />
              <Label htmlFor="lazy-ev" className="cursor-pointer text-xs">
                lazyfree-lazy-eviction
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="lazy-ex" checked={lazyExpire} onCheckedChange={setLazyExpire} />
              <Label htmlFor="lazy-ex" className="cursor-pointer text-xs">
                lazyfree-lazy-expire
              </Label>
            </div>
          </div>
        </div>
        </RedisWizardSection>

        <Button
          type="button"
          className="bg-emerald-600 hover:bg-emerald-700"
          onClick={doK8sDeploy}
          disabled={isViewer || deployMut.isPending || nsQ.isLoading}
        >
          {deployMut.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 部署中…
            </>
          ) : (
            "部署到 Kubernetes"
          )}
        </Button>
      </CardContent>
    </Card>
    {monitorContext ? (
      <RedisExporterMonitorCharts
        namespace={monitorContext.ns}
        deploymentName={monitorContext.dep}
        active={monitorContext.exporter}
      />
    ) : null}
  </>
  );
}

function ManageRedisInlinePanel({
  open,
  onOpenChange,
  encryptionReady,
  mysqlOk,
  existingInstanceCount = 0,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  encryptionReady: boolean;
  mysqlOk: boolean;
  existingInstanceCount?: number;
  onCreated: (id: number) => void;
}) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"standalone" | "sentinel" | "replication">("standalone");
  const [addr, setAddr] = useState("127.0.0.1:6379");
  const [sentinels, setSentinels] = useState("127.0.0.1:26379");
  const [masterName, setMasterName] = useState("mymaster");
  const [masterAddr, setMasterAddr] = useState("127.0.0.1:6379");
  const [replicaAddr, setReplicaAddr] = useState("");
  const [password, setPassword] = useState("");
  const [db, setDb] = useState(0);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (!mysqlOk) return;
    if (!encryptionReady && password) {
      toast.error("请先配置加密密钥");
      return;
    }
    setPending(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        mode,
        db,
        password: password || undefined,
      };
      if (mode === "standalone") body.addr = addr.trim();
      if (mode === "sentinel") {
        body.sentinelAddrs = sentinels.split(/[\s,]+/).filter(Boolean);
        body.masterName = masterName.trim();
      }
      if (mode === "replication") {
        body.masterAddr = masterAddr.trim();
        if (replicaAddr.trim()) body.replicaAddr = replicaAddr.trim();
      }
      const res = await apiPostJson<{ id: number }>("/api/app-center/redis/instances", body);
      toast.success("已保存");
      onCreated(res.id);
      onOpenChange(false);
      setName("");
      setPassword("");
    } catch (e) {
      toast.error(fmtApiErrorMessage(e));
    } finally {
      setPending(false);
    }
  };

  if (!open) return null;

  return (
    <Card className="overflow-hidden rounded-2xl border border-emerald-200/80 bg-white shadow-sm">
      <CardHeader className="border-b border-emerald-100 bg-gradient-to-r from-emerald-50/90 to-white px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base text-slate-900">纳管云数据库实例</CardTitle>
            <CardDescription className="mt-1 text-xs text-slate-600">
              仅登记连接信息，不会在集群内创建工作负载；与「部署向导」中的平台部署不同。
            </CardDescription>
          </div>
          <Button type="button" variant="ghost" size="sm" className="shrink-0 gap-1 text-slate-600" onClick={() => onOpenChange(false)}>
            <Minimize2 className="h-4 w-4" />
            收起
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 px-5 py-5">
        {existingInstanceCount > 0 ? (
          <Alert className="border-emerald-200 bg-emerald-50/90 text-emerald-950">
            <Database className="h-4 w-4 text-emerald-700" />
            <AlertTitle>已纳管</AlertTitle>
            <AlertDescription>
              当前已有 {existingInstanceCount} 个 Redis 实例（含纳管登记或平台部署），可在上方列表中查看与编辑；也可在此继续添加新实例。
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>名称</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="生产缓存" />
          </div>
          <div className="space-y-1">
            <Label>部署架构</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standalone">标准版 · 单机</SelectItem>
                <SelectItem value="sentinel">高可用 · 哨兵</SelectItem>
                <SelectItem value="replication">主从复制（管理端连主）</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {mode === "standalone" && (
            <div className="space-y-1">
              <Label>Addr</Label>
              <Input className="font-mono text-xs" value={addr} onChange={(e) => setAddr(e.target.value)} />
            </div>
          )}
          {mode === "sentinel" && (
            <>
              <div className="space-y-1">
                <Label>哨兵地址（逗号或换行分隔）</Label>
                <Textarea
                  className="font-mono text-xs"
                  value={sentinels}
                  onChange={(e) => setSentinels(e.target.value)}
                  rows={2}
                />
              </div>
              <div className="space-y-1">
                <Label>Master 名称</Label>
                <Input value={masterName} onChange={(e) => setMasterName(e.target.value)} />
              </div>
            </>
          )}
          {mode === "replication" && (
            <>
              <div className="space-y-1">
                <Label>主节点 Addr</Label>
                <Input className="font-mono text-xs" value={masterAddr} onChange={(e) => setMasterAddr(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>从节点 Addr（可选，仅备注）</Label>
                <Input className="font-mono text-xs" value={replicaAddr} onChange={(e) => setReplicaAddr(e.target.value)} />
              </div>
            </>
          )}
          <div className="space-y-1">
            <Label>密码（可选，加密存储）</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
          </div>
          <div className="space-y-1">
            <Label>DB</Label>
            <Input type="number" value={db} onChange={(e) => setDb(Number(e.target.value))} />
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" disabled={pending || !name.trim() || !mysqlOk} onClick={() => void submit()}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "保存"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

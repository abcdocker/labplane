import React, { useEffect, useMemo, useState } from "react";
import { useAppConfig } from "@/hooks/use-app-config";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart2, Loader2, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiDeleteJson, apiGetJson, apiPostJson, apiPutJson, type AppConfig } from "@/lib/api";
import { openSearchAppCenterCanWrite } from "@/lib/platform-permissions";
import { toast } from "sonner";

export type OpenSearchTemplateConfig = {
  opensearchImage: string;
  dashboardsImage: string;
  imagePullSecret?: string;
  registryPrefixForTags?: string;
  defaultJavaOptsMaster?: string;
  defaultJavaOptsData?: string;
  extraOpensearchYml?: string;
  indexTemplateJSON?: string;
};

type OpenSearchTemplateRow = {
  id: number;
  name: string;
  description?: string;
  config: OpenSearchTemplateConfig;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
};

function emptyTplCfg(): OpenSearchTemplateConfig {
  return {
    opensearchImage: "",
    dashboardsImage: "",
    imagePullSecret: "",
    registryPrefixForTags: "",
    defaultJavaOptsMaster: "-Xms512m -Xmx512m",
    defaultJavaOptsData: "-Xms1g -Xmx1g",
    extraOpensearchYml: "",
    indexTemplateJSON: "",
  };
}

function fmtErr(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message?: string }).message);
  return String(e);
}

function catField(row: Record<string, unknown>, key: string): string {
  const v = row[key];
  if (v == null || v === "") return "—";
  return String(v);
}

function healthStatusBadge(status: string | undefined) {
  const s = (status ?? "").toLowerCase();
  if (s === "green")
    return <Badge className="border-emerald-200 bg-emerald-100 font-normal text-emerald-950">green</Badge>;
  if (s === "yellow")
    return <Badge className="border-amber-200 bg-amber-100 font-normal text-amber-950">yellow</Badge>;
  if (s === "red") return <Badge className="border-red-200 bg-red-100 font-normal text-red-950">red</Badge>;
  return <Badge variant="outline">{status || "—"}</Badge>;
}

const AppCenterOpenSearch: React.FC = () => {
  const { status: auth } = useAuth();
  const configQ = useAppConfig();
  const perm = auth?.permissions ?? configQ.data?.permissions;
  const canWrite = openSearchAppCenterCanWrite(auth?.role, perm);
  const qc = useQueryClient();

  const [tab, setTab] = useState<"deploy" | "templates" | "instances" | "manage">("deploy");

  const statusQ = useQuery({
    queryKey: ["app-center-opensearch-status"],
    queryFn: ({ signal }) => apiGetJson<{ mysqlReachable?: boolean; mysqlConnectError?: string }>("/api/app-center/opensearch/status", { signal }),
  });

  const tplQ = useQuery({
    queryKey: ["app-center-opensearch-templates"],
    queryFn: ({ signal }) =>
      apiGetJson<{ templates: OpenSearchTemplateRow[]; mysqlRequired?: boolean }>("/api/app-center/opensearch/templates", { signal }),
  });

  const instQ = useQuery({
    queryKey: ["app-center-opensearch-instances"],
    queryFn: ({ signal }) =>
      apiGetJson<{ instances: Array<{ id: number; name: string; config?: Record<string, unknown> }>; mysqlRequired?: boolean }>(
        "/api/app-center/opensearch/instances"
      , { signal }),
  });

  const templates = tplQ.data?.templates ?? [];
  const instances = instQ.data?.instances ?? [];

  const [manageId, setManageId] = useState<string>("");
  const [idxDetailOpen, setIdxDetailOpen] = useState(false);
  const [idxDetailName, setIdxDetailName] = useState("");
  const [idxSettingsJson, setIdxSettingsJson] = useState('{"index":{"refresh_interval":"30s"}}');
  const [prunePat, setPrunePat] = useState("kubebt-vmlog-*");
  const [pruneDays, setPruneDays] = useState("30");
  const [pruneDry, setPruneDry] = useState(true);
  const [deleteIdx, setDeleteIdx] = useState<string | null>(null);

  const healthQ = useQuery({
    queryKey: ["opensearch-cluster-health", manageId],
    queryFn: ({ signal }) =>
      apiGetJson<Record<string, unknown>>(`/api/app-center/opensearch/instances/${manageId}/cluster/health`, { signal }),
    enabled: !!manageId,
    retry: false,
  });

  const indicesQ = useQuery({
    queryKey: ["opensearch-indices", manageId],
    queryFn: ({ signal }) =>
      apiGetJson<{ indices?: Array<Record<string, unknown>> }>(`/api/app-center/opensearch/instances/${manageId}/indices`, { signal }),
    enabled: !!manageId,
    retry: false,
  });

  const detailQ = useQuery({
    queryKey: ["opensearch-index-detail", manageId, idxDetailName],
    queryFn: ({ signal }) =>
      apiGetJson<{
        settings?: unknown;
        stats?: unknown;
        settingsStatus?: number;
        statsStatus?: number;
      }>(
        `/api/app-center/opensearch/instances/${manageId}/index/detail?index=${encodeURIComponent(idxDetailName)}`
      , { signal }),
    enabled: !!manageId && !!idxDetailName && idxDetailOpen,
    retry: false,
  });

  const putSettingsMut = useMutation({
    mutationFn: async () => {
      let body: object;
      try {
        body = JSON.parse(idxSettingsJson) as object;
      } catch {
        throw new Error("设置 JSON 无法解析");
      }
      return apiPutJson(
        `/api/app-center/opensearch/instances/${manageId}/index/settings?index=${encodeURIComponent(idxDetailName)}`,
        body
      );
    },
    onSuccess: async () => {
      toast.success("已提交索引设置");
      await qc.invalidateQueries({ queryKey: ["opensearch-index-detail", manageId, idxDetailName] });
      await qc.invalidateQueries({ queryKey: ["opensearch-indices", manageId] });
    },
    onError: (e) => toast.error(fmtErr(e)),
  });

  const delIdxMut = useMutation({
    mutationFn: (name: string) =>
      apiDeleteJson(
        `/api/app-center/opensearch/instances/${manageId}/index?index=${encodeURIComponent(name)}`
      ),
    onSuccess: async () => {
      toast.success("已删除索引");
      setDeleteIdx(null);
      setIdxDetailOpen(false);
      await qc.invalidateQueries({ queryKey: ["opensearch-indices", manageId] });
    },
    onError: (e) => toast.error(fmtErr(e)),
  });

  const pruneMut = useMutation({
    mutationFn: async () => {
      const days = parseInt(pruneDays, 10);
      return apiPostJson<Record<string, unknown>>(`/api/app-center/opensearch/instances/${manageId}/indices/prune`, {
        pattern: prunePat.trim(),
        olderThanDays: Number.isNaN(days) ? 30 : days,
        dryRun: pruneDry,
      });
    },
    onSuccess: (r) => {
      const dry = Boolean(r.dryRun);
      toast.success(dry ? "预演完成（未删除）" : "清理完成");
      if (Array.isArray(r.wouldDelete) && r.wouldDelete.length)
        toast.message(`将删除 ${(r.wouldDelete as string[]).join(", ")}`);
      if (Array.isArray(r.deleted) && r.deleted.length) toast.message(`已删除 ${(r.deleted as string[]).join(", ")}`);
      void qc.invalidateQueries({ queryKey: ["opensearch-indices", manageId] });
    },
    onError: (e) => toast.error(fmtErr(e)),
  });

  const [ns, setNs] = useState("default");
  const [baseName, setBaseName] = useState("opensearch-demo");
  const [templateId, setTemplateId] = useState<number | "">("");
  const [clusterName, setClusterName] = useState("");
  const [svcType, setSvcType] = useState<"clusterip" | "nodeport">("clusterip");
  const [nodePortHttp, setNodePortHttp] = useState("");
  const [nodePortDash, setNodePortDash] = useState("");
  const [javaM, setJavaM] = useState("");
  const [javaD, setJavaD] = useState("");
  const [extraYml, setExtraYml] = useState("");
  const [idxTpl, setIdxTpl] = useState("");
  const [mSize, setMSize] = useState("20Gi");
  const [dSize, setDSize] = useState("100Gi");
  const [sc, setSc] = useState("");

  const deployMut = useMutation({
    mutationFn: async () => {
      const tid = typeof templateId === "number" ? templateId : 0;
      const body: Record<string, unknown> = {
        namespace: ns.trim(),
        deploymentName: baseName.trim(),
        templateId: tid,
        clusterName: clusterName.trim() || undefined,
        serviceType: svcType,
        masterStorageSize: mSize.trim() || undefined,
        dataStorageSize: dSize.trim() || undefined,
        storageClassName: sc.trim() || undefined,
        javaOptsMaster: javaM.trim() || undefined,
        javaOptsData: javaD.trim() || undefined,
        extraOpensearchYml: extraYml.trim() || undefined,
        indexTemplateJSON: idxTpl.trim() || undefined,
      };
      if (svcType === "nodeport") {
        const a = parseInt(nodePortHttp.trim(), 10);
        if (nodePortHttp.trim() !== "" && !Number.isNaN(a)) body.nodePortHttp = a;
        const b = parseInt(nodePortDash.trim(), 10);
        if (nodePortDash.trim() !== "" && !Number.isNaN(b)) body.nodePortDashboards = b;
      }
      return apiPostJson<{
        message?: string;
        internalHttp?: string;
        internalDashboards?: string;
        vectorOpenSearchUrl?: string;
        instancePersistError?: string | null;
      }>("/api/app-center/opensearch/k8s-deploy", body);
    },
    onSuccess: (r) => {
      toast.success(r.message || "已提交部署");
      if (r.instancePersistError) toast.message(`实例列表：${r.instancePersistError}`);
      void qc.invalidateQueries({ queryKey: ["app-center-opensearch-instances"] });
    },
    onError: (e) => toast.error(fmtErr(e)),
  });

  // —— 模版编辑 ——
  const [dlgOpen, setDlgOpen] = useState(false);
  const [editing, setEditing] = useState<OpenSearchTemplateRow | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formCfg, setFormCfg] = useState<OpenSearchTemplateConfig>(emptyTplCfg);
  const [idxTplText, setIdxTplText] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);

  useEffect(() => {
    if (!dlgOpen) return;
    if (editing) {
      setFormName(editing.name);
      setFormDesc(editing.description ?? "");
      setFormCfg({ ...emptyTplCfg(), ...editing.config });
      setIdxTplText(editing.config.indexTemplateJSON ?? "");
    } else {
      setFormName("");
      setFormDesc("");
      setFormCfg(emptyTplCfg());
      setIdxTplText("");
    }
  }, [dlgOpen, editing]);

  const saveTplMut = useMutation({
    mutationFn: async () => {
      const cfg: OpenSearchTemplateConfig = {
        ...formCfg,
        opensearchImage: formCfg.opensearchImage.trim(),
        dashboardsImage: formCfg.dashboardsImage.trim(),
        imagePullSecret: formCfg.imagePullSecret?.trim() || undefined,
        registryPrefixForTags: formCfg.registryPrefixForTags?.trim() || undefined,
        defaultJavaOptsMaster: formCfg.defaultJavaOptsMaster?.trim() || undefined,
        defaultJavaOptsData: formCfg.defaultJavaOptsData?.trim() || undefined,
        extraOpensearchYml: formCfg.extraOpensearchYml?.trim() || undefined,
        indexTemplateJSON: idxTplText.trim() || undefined,
      };
      const body = { name: formName.trim(), description: formDesc.trim(), config: cfg };
      if (editing) {
        await apiPutJson(`/api/app-center/opensearch/templates/${editing.id}`, body);
        return editing.id;
      }
      const r = await apiPostJson<{ id: number }>("/api/app-center/opensearch/templates", body);
      return r.id;
    },
    onSuccess: async () => {
      toast.success(editing ? "已更新模版" : "已创建模版");
      setDlgOpen(false);
      setEditing(null);
      await qc.invalidateQueries({ queryKey: ["app-center-opensearch-templates"] });
    },
    onError: (e) => toast.error(fmtErr(e)),
  });

  const delTplMut = useMutation({
    mutationFn: (id: number) => apiDeleteJson(`/api/app-center/opensearch/templates/${id}`),
    onSuccess: async () => {
      toast.success("已删除");
      setDeleteId(null);
      await qc.invalidateQueries({ queryKey: ["app-center-opensearch-templates"] });
    },
    onError: (e) => toast.error(fmtErr(e)),
  });

  const tplOptions = useMemo(
    () =>
      templates.map((t) => (
        <SelectItem key={t.id} value={String(t.id)}>
          {t.name}
        </SelectItem>
      )),
    [templates]
  );

  const mysqlRequired = statusQ.data?.mysqlReachable === false || tplQ.data?.mysqlRequired;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/90 via-white to-slate-50/80 px-6 py-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-900/80">应用中心</p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <Search className="h-7 w-7 text-indigo-600" />
          OpenSearch 集群
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          一键部署 <strong>3 个 cluster_manager</strong>、<strong>3 个 data</strong> 与 <strong>1 套 OpenSearch Dashboards</strong>。
          模版中配置内网 Harbor 镜像；访问方式支持集群内 Service（ClusterIP）或 NodePort。AI 日志采集可在 Vector 中双写到本集群（见{" "}
          <span className="font-medium text-indigo-800">AI 巡检 → 日志采集</span>）。
        </p>
      </div>

      {mysqlRequired ? (
        <Alert className="border-amber-200 bg-amber-50/90">
          <AlertTitle>需要 MySQL</AlertTitle>
          <AlertDescription className="text-sm">
            OpenSearch 模版与实例列表依赖平台 MySQL。请配置 <code className="rounded bg-white/80 px-1">MYSQL_DSN</code> 或运行时{" "}
            <code className="rounded bg-white/80 px-1">mysqlDsn</code>。
            {statusQ.data?.mysqlConnectError ? (
              <span className="mt-1 block text-xs text-amber-900/90">{statusQ.data.mysqlConnectError}</span>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="gap-3">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-xl border border-slate-200/80 bg-slate-50/80 p-1">
          <TabsTrigger value="deploy" className="rounded-lg">
            部署向导
          </TabsTrigger>
          <TabsTrigger value="templates" className="rounded-lg">
            模版配置
          </TabsTrigger>
          <TabsTrigger value="instances" className="rounded-lg">
            已部署实例
          </TabsTrigger>
          <TabsTrigger value="manage" className="rounded-lg">
            集群与索引
          </TabsTrigger>
        </TabsList>

        <TabsContent value="deploy" className="outline-none">
          <Card className="border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">K8s 一键部署</CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                固定拓扑：3×master（StatefulSet + headless）、3×data（StatefulSet）、1×Dashboards（Deployment）。安全插件默认关闭，仅适用于内网；生产请自行加固。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>命名空间</Label>
                  <Input value={ns} onChange={(e) => setNs(e.target.value)} disabled={!canWrite} />
                </div>
                <div className="space-y-2">
                  <Label>部署名称（前缀）</Label>
                  <Input value={baseName} onChange={(e) => setBaseName(e.target.value)} disabled={!canWrite} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>模版</Label>
                <Select
                  value={templateId === "" ? "" : String(templateId)}
                  onValueChange={(v) => setTemplateId(v ? parseInt(v, 10) : "")}
                  disabled={!canWrite || templates.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={templates.length ? "选择模版" : "请先在「模版配置」中创建"} />
                  </SelectTrigger>
                  <SelectContent>{tplOptions}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>cluster.name（可选，默认与部署名称相同）</Label>
                  <Input value={clusterName} onChange={(e) => setClusterName(e.target.value)} disabled={!canWrite} />
                </div>
                <div className="space-y-2">
                  <Label>Service 类型</Label>
                  <Select value={svcType} onValueChange={(v) => setSvcType(v as typeof svcType)} disabled={!canWrite}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="clusterip">ClusterIP（集群内 DNS）</SelectItem>
                      <SelectItem value="nodeport">NodePort（HTTP 9200 / Dashboards 5601）</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {svcType === "nodeport" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>NodePort HTTP（9200，0 或空表示自动）</Label>
                    <Input value={nodePortHttp} onChange={(e) => setNodePortHttp(e.target.value)} disabled={!canWrite} placeholder="0" />
                  </div>
                  <div className="space-y-2">
                    <Label>NodePort Dashboards（5601）</Label>
                    <Input value={nodePortDash} onChange={(e) => setNodePortDash(e.target.value)} disabled={!canWrite} placeholder="0" />
                  </div>
                </div>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Master 存储</Label>
                  <Input value={mSize} onChange={(e) => setMSize(e.target.value)} disabled={!canWrite} />
                </div>
                <div className="space-y-2">
                  <Label>Data 存储</Label>
                  <Input value={dSize} onChange={(e) => setDSize(e.target.value)} disabled={!canWrite} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>StorageClass（空则集群默认）</Label>
                <Input value={sc} onChange={(e) => setSc(e.target.value)} disabled={!canWrite} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>OPENSEARCH_JAVA_OPTS（master，可覆盖模版）</Label>
                  <Input value={javaM} onChange={(e) => setJavaM(e.target.value)} disabled={!canWrite} placeholder="留空用模版" />
                </div>
                <div className="space-y-2">
                  <Label>OPENSEARCH_JAVA_OPTS（data）</Label>
                  <Input value={javaD} onChange={(e) => setJavaD(e.target.value)} disabled={!canWrite} placeholder="留空用模版" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>追加 opensearch.yml（索引/集群调优，合并进各角色 ConfigMap）</Label>
                <Textarea
                  value={extraYml}
                  onChange={(e) => setExtraYml(e.target.value)}
                  disabled={!canWrite}
                  rows={4}
                  className="font-mono text-xs"
                  placeholder="例如：&#10;indices.memory.index_buffer_size: 30%"
                />
              </div>
              <div className="space-y-2">
                <Label>本次部署 index template JSON（可选，覆盖模版；将注册为 composable template kubebt-&lt;部署名&gt;）</Label>
                <Textarea
                  value={idxTpl}
                  onChange={(e) => setIdxTpl(e.target.value)}
                  disabled={!canWrite}
                  rows={5}
                  className="font-mono text-xs"
                  placeholder='{"index_patterns":["kubebt-vmlog-*"],"template":{"settings":{"number_of_shards":1}}}'
                />
              </div>
              <Button
                type="button"
                disabled={!canWrite || deployMut.isPending || typeof templateId !== "number"}
                onClick={() => deployMut.mutate()}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                {deployMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                部署到当前集群
              </Button>
              {!canWrite ? <p className="text-xs text-slate-500">当前账号无写权限。</p> : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates" className="outline-none space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!canWrite}
              onClick={() => {
                setEditing(null);
                setDlgOpen(true);
              }}
            >
              <Plus className="mr-1 h-4 w-4" />
              新建模版
            </Button>
          </div>
          <Card className="border-slate-200">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>名称</TableHead>
                    <TableHead>OpenSearch 镜像</TableHead>
                    <TableHead>Dashboards 镜像</TableHead>
                    <TableHead className="w-[120px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tplQ.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-xs text-slate-500">
                        <Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin" />
                        加载中…
                      </TableCell>
                    </TableRow>
                  ) : templates.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-xs text-slate-500">
                        暂无模版
                      </TableCell>
                    </TableRow>
                  ) : (
                    templates.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">{t.name}</TableCell>
                        <TableCell className="max-w-[220px] truncate font-mono text-[11px]">{t.config.opensearchImage}</TableCell>
                        <TableCell className="max-w-[220px] truncate font-mono text-[11px]">{t.config.dashboardsImage}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={!canWrite}
                            onClick={() => {
                              setEditing(t);
                              setDlgOpen(true);
                            }}
                          >
                            编辑
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-red-600"
                            disabled={!canWrite}
                            onClick={() => setDeleteId(t.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="instances" className="outline-none">
          <Card className="border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">实例快照</CardTitle>
              <CardDescription className="text-xs">部署成功后写入；含集群内访问地址供 Vector 参考。</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>命名空间/名称</TableHead>
                    <TableHead>集群内 HTTP</TableHead>
                    <TableHead>Dashboards</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(instQ.data?.instances ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-xs text-slate-500">
                        暂无记录
                      </TableCell>
                    </TableRow>
                  ) : (
                    (instQ.data?.instances ?? []).map((row) => {
                      const c = row.config ?? {};
                      return (
                        <TableRow key={row.id}>
                          <TableCell className="font-mono text-xs">{row.name}</TableCell>
                          <TableCell className="max-w-[280px] break-all font-mono text-[11px]">
                            {String(c.internalHttp ?? c.vectorOpenSearchUrl ?? "—")}
                          </TableCell>
                          <TableCell className="max-w-[280px] break-all font-mono text-[11px]">
                            {String(c.internalDashboards ?? "—")}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="manage" className="outline-none space-y-4">
          <Alert className="border-slate-200 bg-slate-50/90">
            <AlertTitle className="flex items-center gap-2">
              <BarChart2 className="h-4 w-4 shrink-0" />
              访问说明
            </AlertTitle>
            <AlertDescription className="text-xs leading-relaxed">
              平台进程使用实例中保存的 <code className="rounded bg-white px-1">internalHttp</code>（集群内 Service）调用 OpenSearch REST API。
              请确保 <strong>kube-bt-sync 与 OpenSearch 网络互通</strong>（通常控制台部署在集群内或已打通 Service CIDR）。
            </AlertDescription>
          </Alert>

          <Card className="border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">选择实例</CardTitle>
              <CardDescription className="text-xs">从已部署列表中选择，再查看集群状态与索引。</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end gap-3">
              <div className="min-w-[220px] flex-1 space-y-2">
                <Label>实例</Label>
                <Select
                  value={manageId || ""}
                  onValueChange={(v) => {
                    setManageId(v);
                    setIdxDetailOpen(false);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={instances.length ? "选择实例" : "暂无实例，请先部署"} />
                  </SelectTrigger>
                  <SelectContent>
                    {instances.map((i) => (
                      <SelectItem key={i.id} value={String(i.id)}>
                        {i.name} (#{i.id})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!manageId}
                onClick={() => {
                  void qc.invalidateQueries({ queryKey: ["opensearch-cluster-health", manageId] });
                  void qc.invalidateQueries({ queryKey: ["opensearch-indices", manageId] });
                }}
              >
                <RefreshCw className="mr-1 h-4 w-4" />
                刷新
              </Button>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">集群状态</CardTitle>
              <CardDescription className="text-xs">GET /_cluster/health</CardDescription>
            </CardHeader>
            <CardContent>
              {!manageId ? (
                <p className="text-xs text-slate-500">请先选择实例。</p>
              ) : healthQ.isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              ) : healthQ.isError ? (
                <p className="text-xs text-amber-800">{fmtErr(healthQ.error)}</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg border border-slate-100 bg-white px-3 py-2">
                    <p className="text-[11px] text-slate-500">status</p>
                    <div className="mt-1">{healthStatusBadge(String(healthQ.data?.status ?? ""))}</div>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-white px-3 py-2">
                    <p className="text-[11px] text-slate-500">cluster_name</p>
                    <p className="mt-1 font-mono text-sm text-slate-900">{String(healthQ.data?.cluster_name ?? "—")}</p>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-white px-3 py-2">
                    <p className="text-[11px] text-slate-500">number_of_nodes</p>
                    <p className="mt-1 font-mono text-sm">{String(healthQ.data?.number_of_nodes ?? "—")}</p>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-white px-3 py-2">
                    <p className="text-[11px] text-slate-500">active_shards</p>
                    <p className="mt-1 font-mono text-sm">{String(healthQ.data?.active_shards ?? "—")}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">索引列表</CardTitle>
              <CardDescription className="text-xs">_cat/indices（文档数、存储、健康度）</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>index</TableHead>
                    <TableHead>health</TableHead>
                    <TableHead>status</TableHead>
                    <TableHead>docs</TableHead>
                    <TableHead>store</TableHead>
                    <TableHead className="w-[140px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!manageId ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-xs text-slate-500">
                        请先选择实例
                      </TableCell>
                    </TableRow>
                  ) : indicesQ.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-xs text-slate-500">
                        <Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin" />
                        加载索引…
                      </TableCell>
                    </TableRow>
                  ) : indicesQ.isError ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-xs text-amber-800">
                        {fmtErr(indicesQ.error)}
                      </TableCell>
                    </TableRow>
                  ) : (indicesQ.data?.indices ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-xs text-slate-500">
                        无索引或暂无权限列出
                      </TableCell>
                    </TableRow>
                  ) : (
                    (indicesQ.data?.indices ?? []).map((row, i) => {
                      const name = catField(row, "index");
                      return (
                        <TableRow key={`${name}-${i}`}>
                          <TableCell className="max-w-[240px] truncate font-mono text-[11px]">{name}</TableCell>
                          <TableCell>{healthStatusBadge(catField(row, "health"))}</TableCell>
                          <TableCell className="text-xs">{catField(row, "status")}</TableCell>
                          <TableCell className="font-mono text-xs">{catField(row, "docs.count")}</TableCell>
                          <TableCell className="font-mono text-xs">{catField(row, "store.size")}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8"
                              onClick={() => {
                                setIdxDetailName(name);
                                setIdxDetailOpen(true);
                              }}
                            >
                              详情
                            </Button>
                            {canWrite ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 text-red-600"
                                onClick={() => setDeleteIdx(name)}
                              >
                                删除
                              </Button>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {canWrite ? (
            <Card className="border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">按创建时间清理（过期索引）</CardTitle>
                <CardDescription className="text-xs leading-relaxed">
                  按 <code className="rounded bg-slate-100 px-1">filepath</code> 风格匹配索引名（如 <code className="rounded bg-slate-100 px-1">kubebt-vmlog-*</code>
                  ），根据 OpenSearch <code className="rounded bg-slate-100 px-1">creation_date</code> 删除早于 N 天的索引。建议先<strong>预演</strong>。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-xs">匹配 pattern</Label>
                    <Input className="font-mono text-xs" value={prunePat} onChange={(e) => setPrunePat(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">早于（天）</Label>
                    <Input className="font-mono text-xs" value={pruneDays} onChange={(e) => setPruneDays(e.target.value)} />
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <Switch checked={pruneDry} onCheckedChange={(v) => setPruneDry(Boolean(v))} id="prune-dry" />
                    <Label htmlFor="prune-dry" className="text-xs">
                      仅预演（不删除）
                    </Label>
                  </div>
                </div>
                <Button type="button" size="sm" disabled={!manageId || pruneMut.isPending} onClick={() => pruneMut.mutate()}>
                  {pruneMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  执行清理
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>
      </Tabs>

      <Dialog
        open={idxDetailOpen}
        onOpenChange={(o) => {
          setIdxDetailOpen(o);
          if (!o) setIdxDetailName("");
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>索引：{idxDetailName || "—"}</DialogTitle>
          </DialogHeader>
          {idxDetailName ? (
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs font-medium text-slate-600">统计（_stats 节选）</p>
                <pre className="mt-1 max-h-40 overflow-auto rounded-md border bg-slate-50 p-2 font-mono text-[11px]">
                  {detailQ.isLoading
                    ? "加载中…"
                    : JSON.stringify(detailQ.data?.stats ?? {}, null, 2)}
                </pre>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-600">设置与元数据（含 creation_date，用于判断「过期」）</p>
                <pre className="mt-1 max-h-48 overflow-auto rounded-md border bg-slate-50 p-2 font-mono text-[11px]">
                  {detailQ.isLoading
                    ? "加载中…"
                    : JSON.stringify(detailQ.data?.settings ?? {}, null, 2)}
                </pre>
              </div>
              {canWrite ? (
                <>
                  <div>
                    <Label className="text-xs">更新动态设置（PUT /{`{index}`}/_settings）</Label>
                    <Textarea
                      className="mt-1 min-h-[100px] font-mono text-xs"
                      value={idxSettingsJson}
                      onChange={(e) => setIdxSettingsJson(e.target.value)}
                    />
                    <p className="mt-1 text-[11px] text-slate-500">
                      示例：<code className="rounded bg-slate-100 px-1">{"{\"index\":{\"number_of_replicas\":1,\"refresh_interval\":\"30s\"}}"}</code>
                    </p>
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setIdxDetailOpen(false);
                        setIdxDetailName("");
                      }}
                    >
                      关闭
                    </Button>
                    <Button type="button" disabled={putSettingsMut.isPending} onClick={() => putSettingsMut.mutate()}>
                      {putSettingsMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      应用设置
                    </Button>
                  </DialogFooter>
                </>
              ) : (
                <p className="text-xs text-slate-500">只读账号不可修改索引设置。</p>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteIdx != null} onOpenChange={(o) => !o && setDeleteIdx(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除索引？</AlertDialogTitle>
            <AlertDialogDescription>
              将永久删除 <span className="font-mono font-semibold">{deleteIdx}</span>，不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={delIdxMut.isPending || deleteIdx == null}
              onClick={() => deleteIdx != null && delIdxMut.mutate(deleteIdx)}
            >
              {delIdxMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              删除
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑模版" : "新建模版"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <Label>名称</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>说明</Label>
              <Input value={formDesc} onChange={(e) => setFormDesc(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>OpenSearch 镜像（完整 repository:tag）</Label>
              <Input
                value={formCfg.opensearchImage}
                onChange={(e) => setFormCfg((c) => ({ ...c, opensearchImage: e.target.value }))}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label>Dashboards 镜像</Label>
              <Input
                value={formCfg.dashboardsImage}
                onChange={(e) => setFormCfg((c) => ({ ...c, dashboardsImage: e.target.value }))}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label>imagePullSecret（命名空间内 docker-registry Secret 名）</Label>
              <Input
                value={formCfg.imagePullSecret ?? ""}
                onChange={(e) => setFormCfg((c) => ({ ...c, imagePullSecret: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>registryPrefixForTags（列举标签用，可选）</Label>
              <Input
                value={formCfg.registryPrefixForTags ?? ""}
                onChange={(e) => setFormCfg((c) => ({ ...c, registryPrefixForTags: e.target.value }))}
                className="font-mono text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">默认 JAVA_OPTS master</Label>
                <Input
                  value={formCfg.defaultJavaOptsMaster ?? ""}
                  onChange={(e) => setFormCfg((c) => ({ ...c, defaultJavaOptsMaster: e.target.value }))}
                  className="font-mono text-[11px]"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">默认 JAVA_OPTS data</Label>
                <Input
                  value={formCfg.defaultJavaOptsData ?? ""}
                  onChange={(e) => setFormCfg((c) => ({ ...c, defaultJavaOptsData: e.target.value }))}
                  className="font-mono text-[11px]"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>追加 opensearch.yml（所有节点合并）</Label>
              <Textarea
                value={formCfg.extraOpensearchYml ?? ""}
                onChange={(e) => setFormCfg((c) => ({ ...c, extraOpensearchYml: e.target.value }))}
                rows={4}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label>默认 index template JSON（部署时可覆盖；PUT _index_template/kubebt-&lt;部署名&gt;）</Label>
              <Textarea value={idxTplText} onChange={(e) => setIdxTplText(e.target.value)} rows={5} className="font-mono text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDlgOpen(false)}>
              取消
            </Button>
            <Button type="button" onClick={() => saveTplMut.mutate()} disabled={saveTplMut.isPending}>
              {saveTplMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId != null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除模版？</AlertDialogTitle>
            <AlertDialogDescription>此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <Button type="button" variant="destructive" onClick={() => deleteId != null && delTplMut.mutate(deleteId)}>
              删除
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AppCenterOpenSearch;

import React, { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Globe, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { YamlEditor } from "@/components/YamlEditor";
import IngressAnnotations from "@/components/IngressAnnotations";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import IngressGraphicalForm from "@/components/IngressGraphicalForm";
import { defaultK8sIngressYamlExample } from "@/lib/buildK8sIngressYaml";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiDelete, apiGetJson, apiPostJson } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ingressText } from "@/i18n/ingress";

type IngressRow = {
  namespace: string;
  name: string;
  labels?: string;
  annotationCount?: number;
  hosts?: string[];
  backends?: string[];
  class?: string;
  age: string;
};

const ClusterIngresses: React.FC = () => {
  const { namespace: nsEncoded } = useParams<{ namespace: string }>();
  const namespace = nsEncoded ? decodeURIComponent(nsEncoded) : "";
  const queryClient = useQueryClient();

  const base = `/cluster/ns/${encodeURIComponent(namespace)}`;

  const [ingressDialogOpen, setIngressDialogOpen] = useState(false);
  const [yamlDraft, setYamlDraft] = useState("");
  const [ingressDialogMode, setIngressDialogMode] = useState<"create" | "edit">("create");
  const [createTab, setCreateTab] = useState<"form" | "yaml">("form");
  const [applyConfirmOpen, setApplyConfirmOpen] = useState(false);
  const [pendingApplyYaml, setPendingApplyYaml] = useState("");
  const [pendingApplySummary, setPendingApplySummary] = useState("");
  const [delName, setDelName] = useState<string | null>(null);

  const ingQ = useQuery({
    queryKey: ["k8s-ingresses", namespace],
    queryFn: ({ signal }) =>
      apiGetJson<IngressRow[]>(`/api/k8s/ingresses?namespace=${encodeURIComponent(namespace)}`, { signal }),
    enabled: Boolean(namespace),
  });

  const applyMut = useMutation({
    mutationFn: (yamlContent: string) =>
      apiPostJson("/api/k8s/apply-yaml", { yamlContent }),
    onSuccess: () => {
      setIngressDialogOpen(false);
      setApplyConfirmOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["k8s-ingresses"] });
      void queryClient.invalidateQueries({ queryKey: ["k8s-namespaces-stats"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (name: string) =>
      apiDelete(
        `/api/k8s/objects/ingress/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`
      ),
    onSuccess: () => {
      setDelName(null);
      void queryClient.invalidateQueries({ queryKey: ["k8s-ingresses"] });
      void queryClient.invalidateQueries({ queryKey: ["k8s-namespaces-stats"] });
    },
  });

  const openCreateIngress = () => {
    setIngressDialogMode("create");
    setCreateTab("form");
    setYamlDraft(defaultK8sIngressYamlExample(namespace));
    setIngressDialogOpen(true);
  };

  const openEditYaml = async (name: string) => {
    setIngressDialogMode("edit");
    setIngressDialogOpen(true);
    setYamlDraft("加载中…");
    try {
      const res = await apiGetJson<{ yaml: string }>(
        `/api/k8s/object-yaml?kind=${encodeURIComponent("Ingress")}&namespace=${encodeURIComponent(namespace)}&name=${encodeURIComponent(name)}`
      );
      setYamlDraft(res.yaml);
    } catch (e) {
      setYamlDraft(`# 加载失败: ${(e as Error).message}`);
    }
  };

  if (!namespace) return null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Ingress</h2>
        <p className="text-sm text-slate-500">
          networking.k8s.io/v1 Ingress · HTTP 路由与后端 Service；详情页可跳转到关联 Service、Deployment、Pod 等
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="default" size="sm" className="h-9 gap-1.5" onClick={openCreateIngress}>
          <Plus className="h-3.5 w-3.5" />
          创建 Ingress
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="rounded-lg border-slate-200"
          onClick={() => void ingQ.refetch()}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          刷新
        </Button>
      </div>

      {ingQ.isLoading && <p className="text-sm text-slate-500">加载中…</p>}
      {ingQ.error && <p className="text-sm text-red-600">{(ingQ.error as Error).message}</p>}
      {ingQ.data && (
        <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
          <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50/90 to-white px-4 py-3 sm:px-5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Ingress 列表</span>
            <span className="text-xs text-slate-500">共 {ingQ.data.length} 条</span>
          </div>
          <div className="grid gap-3 p-3 md:hidden">
            {ingQ.data.map((row) => (
              <article key={`${row.namespace}/${row.name}`} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <Link
                    to={`${base}/ingresses/${encodeURIComponent(row.name)}`}
                    className="flex min-w-0 items-start gap-2.5"
                    title="打开 Ingress 详情与关联资源"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-800">
                      <Globe className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 break-all font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">{row.name}</span>
                  </Link>
                  <IngressAnnotations
                    annotationCount={row.annotationCount}
                    namespace={row.namespace}
                    name={row.name}
                    resourceName={`${row.namespace}/${row.name}`}
                  />
                </div>

                <dl className="mt-4 grid min-w-0 gap-3 text-xs">
                  <div className="min-w-0">
                    <dt className="mb-1 text-slate-400">{ingressText.mobileHosts}</dt>
                    <dd className="flex min-w-0 flex-wrap gap-1">
                      {(row.hosts ?? []).length
                        ? row.hosts?.map((host) => <span key={host} className="max-w-full break-all rounded bg-slate-100 px-2 py-1 font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-200">{host}</span>)
                        : "—"}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="mb-1 text-slate-400">{ingressText.mobileBackends}</dt>
                    <dd className="flex min-w-0 flex-wrap gap-1">
                      {(row.backends ?? []).length
                        ? row.backends?.map((backend) => {
                            const serviceName = backend.split(":")[0];
                            return (
                              <Link key={backend} to={`${base}/services/${encodeURIComponent(serviceName)}`} className="max-w-full break-all rounded bg-blue-50 px-2 py-1 font-mono text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                                {backend}
                              </Link>
                            );
                          })
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">{ingressText.mobileClass}</dt>
                    <dd className="break-all text-slate-700 dark:text-slate-200">{row.class || "—"}</dd>
                  </div>
                </dl>

                <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <Button type="button" variant="outline" size="sm" onClick={() => void openEditYaml(row.name)}>
                    <Pencil className="size-3.5" />
                    {ingressText.edit}
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="text-red-600" onClick={() => setDelName(row.name)}>
                    <Trash2 className="size-3.5" />
                    {ingressText.remove}
                  </Button>
                </div>
              </article>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-100 hover:bg-transparent">
                  <TableHead className="min-w-[180px] pl-5 text-xs font-semibold text-slate-500">名称</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-500">Hosts</TableHead>
                  <TableHead className="min-w-[200px] text-xs font-semibold text-slate-500">后端 Service</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-500">Class</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-500">{ingressText.annotations}</TableHead>
                  <TableHead className="pr-5 text-right text-xs font-semibold text-slate-500">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ingQ.data.map((row, idx) => (
                  <TableRow
                    key={`${row.namespace}/${row.name}`}
                    className={cn(
                      "group border-slate-100 transition-colors hover:bg-blue-50/50",
                      idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"
                    )}
                  >
                    <TableCell className="py-3.5 pl-5 align-middle">
                      <Link
                        to={`${base}/ingresses/${encodeURIComponent(row.name)}`}
                        className="flex items-start gap-2.5"
                        title="打开 Ingress 详情与关联资源"
                      >
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80 transition-colors group-hover:bg-emerald-100">
                          <Globe className="h-4 w-4" strokeWidth={2} aria-hidden />
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-1 font-mono text-[13px] font-semibold text-slate-900 group-hover:text-blue-700">
                            {row.name}
                            <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-slate-400">metadata.name</span>
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[220px] text-xs text-slate-700">
                      {(row.hosts ?? []).length ? (row.hosts ?? []).join(", ") : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      <div className="flex flex-wrap gap-1">
                        {(row.backends ?? []).map((b) => {
                          const svcPart = b.split(":")[0];
                          if (!svcPart) return <span key={b}>{b}</span>;
                          return (
                            <Link
                              key={b}
                              to={`${base}/services/${encodeURIComponent(svcPart)}`}
                              className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-blue-700 hover:bg-blue-50 hover:underline"
                            >
                              {b}
                            </Link>
                          );
                        })}
                        {!(row.backends ?? []).length ? "—" : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">{row.class || "—"}</TableCell>
                    <TableCell>
                      <IngressAnnotations
                        annotationCount={row.annotationCount}
                        namespace={row.namespace}
                        name={row.name}
                        resourceName={`${row.namespace}/${row.name}`}
                      />
                    </TableCell>
                    <TableCell className="pr-5 text-right align-middle">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2"
                          onClick={() => void openEditYaml(row.name)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-red-600"
                          onClick={() => setDelName(row.name)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <Dialog
        open={ingressDialogOpen}
        onOpenChange={(open) => {
          setIngressDialogOpen(open);
          if (!open) setApplyConfirmOpen(false);
        }}
      >
        <DialogContent className="flex max-h-[90vh] w-full max-w-[calc(100%-2rem)] flex-col gap-3 overflow-y-auto sm:max-w-7xl">
          <DialogHeader>
            <DialogTitle>
              {ingressDialogMode === "create" ? "创建 Ingress" : "编辑 Ingress YAML"}
            </DialogTitle>
          </DialogHeader>
          {ingressDialogMode === "create" ? (
            <Tabs value={createTab} onValueChange={(v) => setCreateTab(v as "form" | "yaml")} className="w-full">
              <TabsList className="mb-2">
                <TabsTrigger value="form">表单向导</TabsTrigger>
                <TabsTrigger value="yaml">YAML</TabsTrigger>
              </TabsList>
              <TabsContent value="form" className="mt-0 max-h-[min(58vh,520px)] overflow-y-auto pr-1">
                <p className="mb-3 text-xs text-slate-500">
                  填写域名与 Service 生成 Ingress；可选<strong>同步到宝塔</strong>（与「宝塔 → Ingress Rules」向导一致）。提交走集群{" "}
                  <code className="rounded bg-slate-100 px-0.5 font-mono text-[11px]">/api/k8s/apply-yaml</code>。
                </p>
                <IngressGraphicalForm
                  lockedNamespace={namespace}
                  defaultBaotaSyncEnabled={false}
                  idPrefix="cluster-ingress-create"
                  submitButtonText="预览并确认"
                  disabled={applyMut.isPending}
                  onValidationError={(m) => toast.error(m)}
                  onPrepareApply={(yaml, summary) => {
                    setPendingApplyYaml(yaml);
                    setPendingApplySummary(summary);
                    setApplyConfirmOpen(true);
                  }}
                />
              </TabsContent>
              <TabsContent value="yaml" className="mt-0 flex min-h-0 flex-1 flex-col gap-2">
                <YamlEditor
                  value={yamlDraft}
                  onChange={setYamlDraft}
                  readOnly={yamlDraft === "加载中…"}
                  height="min(52vh, 440px)"
                />
                <DialogFooter className="gap-2 sm:justify-end">
                  <Button type="button" variant="secondary" onClick={() => setIngressDialogOpen(false)}>
                    取消
                  </Button>
                  <Button
                    type="button"
                    disabled={applyMut.isPending || yamlDraft === "加载中…"}
                    onClick={() => {
                      setPendingApplyYaml(yamlDraft);
                      setPendingApplySummary("YAML 模式：将按当前编辑框内容提交到集群");
                      setApplyConfirmOpen(true);
                    }}
                  >
                    预览并确认
                  </Button>
                </DialogFooter>
              </TabsContent>
            </Tabs>
          ) : (
            <>
              <YamlEditor
                value={yamlDraft}
                onChange={setYamlDraft}
                readOnly={yamlDraft === "加载中…"}
                height="min(62vh, 500px)"
              />
              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="secondary" onClick={() => setIngressDialogOpen(false)}>
                  取消
                </Button>
                <Button
                  type="button"
                  disabled={applyMut.isPending}
                  onClick={() => void applyMut.mutateAsync(yamlDraft)}
                >
                  {applyMut.isPending ? "提交中…" : "提交应用"}
                </Button>
              </DialogFooter>
            </>
          )}
          {applyMut.isError && ingressDialogOpen && (
            <p className="text-sm text-red-600">{(applyMut.error as Error).message}</p>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={applyConfirmOpen} onOpenChange={setApplyConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认应用到集群？</AlertDialogTitle>
            <AlertDialogDescription className="text-left text-slate-700">
              {pendingApplySummary}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>返回修改</AlertDialogCancel>
            <Button
              type="button"
              disabled={applyMut.isPending}
              onClick={() => void applyMut.mutateAsync(pendingApplyYaml)}
            >
              {applyMut.isPending ? "提交中…" : "确认应用"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(delName)} onOpenChange={(o) => !o && setDelName(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除 Ingress？</AlertDialogTitle>
            <AlertDialogDescription>
              将删除 {namespace}/{delName}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleteMut.isPending}
              onClick={() => delName && void deleteMut.mutateAsync(delName)}
            >
              {deleteMut.isPending ? "删除中…" : "删除"}
            </Button>
          </AlertDialogFooter>
          {deleteMut.isError && (
            <p className="text-sm text-red-600">{(deleteMut.error as Error).message}</p>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ClusterIngresses;

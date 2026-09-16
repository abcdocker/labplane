import React, { useMemo, useState } from "react";
import { useK8sObjectYamlTabBuffer } from "./useK8sObjectYamlTabBuffer";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, FileCode2, FileText, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { YamlEditor } from "@/components/YamlEditor";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiGetJson, apiPostJson } from "@/lib/api";
import { parseAge } from "./parseAge";
import { K8sObjectRevisionTriggerButton } from "@/components/K8sObjectRevisionDialog";
import { K8sRelationsCard } from "./K8sRelationsCard";

const TAB_QUERY = "tab";

type CMRow = {
  namespace: string;
  name: string;
  keys?: number;
  labels?: string;
  age: string;
};

function validTab(v: string | null): "overview" | "yaml" {
  if (v === "yaml" || v === "overview") return v;
  // 无参数或旧书签：默认「YAML」编辑页，与多行 data 展示一致
  return "yaml";
}

const ClusterConfigMapDetail: React.FC = () => {
  const { namespace: nsEncoded, configMapName: nameEncoded } = useParams<{
    namespace: string;
    configMapName: string;
  }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const namespace = nsEncoded ? decodeURIComponent(nsEncoded) : "";
  const configMapName = nameEncoded ? decodeURIComponent(nameEncoded) : "";
  const tab = validTab(searchParams.get(TAB_QUERY));

  const setTab = (next: "overview" | "yaml") => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set(TAB_QUERY, next);
        return p;
      },
      { replace: true }
    );
  };

  const basePath = `/cluster/ns/${encodeURIComponent(namespace)}`;

  const listQ = useQuery({
    queryKey: ["k8s-configmaps", namespace],
    queryFn: ({ signal }) =>
      apiGetJson<CMRow[]>(
        `/api/k8s/configmaps?namespace=${encodeURIComponent(namespace)}`
      , { signal }),
    enabled: Boolean(namespace && configMapName),
  });

  const row = useMemo(
    () => listQ.data?.find((r) => r.name === configMapName),
    [listQ.data, configMapName]
  );

  const [yamlOpen, setYamlOpen] = useState(false);
  const [yamlDraft, setYamlDraft] = useState("");

  const yamlLoadQ = useQuery({
    queryKey: ["k8s-object-yaml", "ConfigMap", namespace, configMapName],
    queryFn: ({ signal }) =>
      apiGetJson<{ yaml: string }>(
        `/api/k8s/object-yaml?kind=${encodeURIComponent("ConfigMap")}&namespace=${encodeURIComponent(namespace)}&name=${encodeURIComponent(configMapName)}`
      , { signal }),
    // 进入详情即预加载，切到「YAML」时无需等待；后台已做 data 多行 | 化展示
    enabled: Boolean(namespace && configMapName && row),
  });

  const yamlResourceKey = `ConfigMap|${namespace}|${configMapName}`;
  const yamlTab = useK8sObjectYamlTabBuffer(
    yamlResourceKey,
    yamlLoadQ.data?.yaml,
    yamlLoadQ.isSuccess
  );

  const applyMut = useMutation({
    mutationFn: (yamlContent: string) =>
      apiPostJson("/api/k8s/apply-yaml", { yamlContent }),
    onSuccess: () => {
      setYamlOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["k8s-configmaps"] });
      void queryClient.invalidateQueries({ queryKey: ["k8s-namespaces-stats"] });
      void queryClient.invalidateQueries({
        queryKey: ["k8s-object-yaml", "ConfigMap", namespace, configMapName],
      });
      void queryClient.invalidateQueries({
        queryKey: ["k8s-object-revisions", namespace, "ConfigMap", configMapName],
      });
    },
  });

  const openYamlDialog = async () => {
    setYamlOpen(true);
    setYamlDraft("加载中…");
    try {
      const res = await apiGetJson<{ yaml: string }>(
        `/api/k8s/object-yaml?kind=${encodeURIComponent("ConfigMap")}&namespace=${encodeURIComponent(namespace)}&name=${encodeURIComponent(configMapName)}`
      );
      setYamlDraft(res.yaml);
    } catch (e) {
      setYamlDraft(`# 加载失败: ${(e as Error).message}`);
    }
  };

  if (!namespace || !configMapName) {
    return <p className="text-sm text-red-600">无效的资源路径</p>;
  }

  const keysCount = row?.keys ?? "—";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-2 text-sm text-slate-500">
        <Link to="/cluster/ns" className="font-medium text-blue-600 hover:underline">
          命名空间
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
        <Link to={basePath} className="font-medium text-blue-600 hover:underline">
          {namespace}
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
        <Link to={`${basePath}/configmaps`} className="font-medium text-blue-600 hover:underline">
          ConfigMap
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
        <span className="font-mono text-base font-semibold text-slate-900">{configMapName}</span>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">
            ConfigMap
            <span className="ml-2 font-mono text-lg font-medium text-slate-700">{configMapName}</span>
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            默认在「YAML」中编辑；<code className="font-mono text-slate-600">data</code> 大段配置会以多行块展示。core/v1
            · data / binaryData。概览中可查看键数量与「关联资源」。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="default" size="sm" className="h-9 gap-1.5" onClick={openYamlDialog}>
            <FileCode2 className="h-3.5 w-3.5" />
            编辑 YAML
          </Button>
          <K8sObjectRevisionTriggerButton
            namespace={namespace}
            kind="ConfigMap"
            name={configMapName}
            onApplied={() => {
              void queryClient.invalidateQueries({ queryKey: ["k8s-configmaps"] });
              void queryClient.invalidateQueries({ queryKey: ["k8s-namespaces-stats"] });
              void queryClient.invalidateQueries({
                queryKey: ["k8s-object-yaml", "ConfigMap", namespace, configMapName],
              });
              void queryClient.invalidateQueries({
                queryKey: ["k8s-object-revisions", namespace, "ConfigMap", configMapName],
              });
            }}
          />
        </div>
      </div>

      {listQ.isLoading && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-10 text-center text-sm text-slate-500">
          加载中…
        </div>
      )}
      {listQ.error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {(listQ.error as Error).message}
        </div>
      )}
      {listQ.data && !row && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          未找到名为 <span className="font-mono">{configMapName}</span> 的 ConfigMap。
        </div>
      )}

      {row && (
        <Tabs value={tab} onValueChange={(v) => setTab(validTab(v))} className="gap-4">
          <TabsList className="h-auto w-full max-w-none flex-wrap justify-start gap-1 bg-slate-100/90 p-1.5 sm:w-fit">
            <TabsTrigger value="overview" className="gap-1.5 px-3 py-2 text-sm">
              <LayoutGrid className="h-3.5 w-3.5" />
              概览
            </TabsTrigger>
            <TabsTrigger value="yaml" className="gap-1.5 px-3 py-2 text-sm">
              YAML
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-0 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="border-slate-200/90 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-600">
                    <FileText className="h-4 w-4 text-slate-500" />
                    键数量
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-lg font-semibold tabular-nums text-slate-900">{keysCount}</p>
                  <p className="mt-1 text-xs text-slate-500">data + binaryData 键名合计</p>
                </CardContent>
              </Card>
              <Card className="border-slate-200/90 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-600">创建时间</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-lg font-medium text-slate-900">{parseAge(row.age)}</p>
                </CardContent>
              </Card>
            </div>
            <K8sRelationsCard namespace={namespace} kind="ConfigMap" name={configMapName} />
          </TabsContent>

          <TabsContent value="yaml" className="mt-0 space-y-3">
            {yamlLoadQ.isLoading && (
              <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">
                加载 YAML…
              </div>
            )}
            {yamlLoadQ.error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {(yamlLoadQ.error as Error).message}
              </div>
            )}
            {yamlLoadQ.data?.yaml && (
              <>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={applyMut.isPending}
                    onClick={() => void applyMut.mutateAsync(yamlTab.buffer)}
                  >
                    {applyMut.isPending ? "提交中…" : "提交应用"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={yamlLoadQ.isFetching}
                    onClick={() => void yamlLoadQ.refetch()}
                  >
                    从集群重新拉取
                  </Button>
                  <Button type="button" size="sm" variant="secondary" onClick={yamlTab.resetFromServer}>
                    放弃本地修改
                  </Button>
                </div>
                <YamlEditor
                  value={yamlTab.buffer}
                  onChange={yamlTab.setBuffer}
                  height="min(72vh, 640px)"
                />
                <p className="text-xs text-slate-500">
                  多行 <code className="font-mono">data</code> 在下列编辑器中已按行展示；可修改后点「提交应用」或全屏用右上角「编辑 YAML」。
                </p>
                {applyMut.isError && (
                  <p className="text-sm text-red-600">{(applyMut.error as Error).message}</p>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={yamlOpen} onOpenChange={setYamlOpen}>
        <DialogContent className="flex max-h-[90vh] w-full max-w-[calc(100%-2rem)] flex-col gap-3 overflow-y-auto sm:max-w-7xl">
          <DialogHeader>
            <DialogTitle>编辑 ConfigMap YAML</DialogTitle>
          </DialogHeader>
          <YamlEditor
            value={yamlDraft}
            onChange={setYamlDraft}
            readOnly={yamlDraft === "加载中…"}
            height="min(62vh, 500px)"
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="secondary" onClick={() => setYamlOpen(false)}>
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
          {applyMut.isError && (
            <p className="text-sm text-red-600">{(applyMut.error as Error).message}</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClusterConfigMapDetail;

import React, { useMemo, useState } from "react";
import { useK8sObjectYamlTabBuffer } from "./useK8sObjectYamlTabBuffer";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Copy, Eye, EyeOff, FileCode2, KeyRound, LayoutGrid } from "lucide-react";
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
import { copyToClipboardSafe } from "@/lib/clipboard";
import { toast } from "sonner";
import { parseAge } from "./parseAge";
import { K8sObjectRevisionTriggerButton } from "@/components/K8sObjectRevisionDialog";
import { K8sRelationsCard } from "./K8sRelationsCard";

const TAB_QUERY = "tab";

type SecretRow = {
  namespace: string;
  name: string;
  type?: string;
  keys?: number;
  labels?: string;
  age: string;
};

type SecretDataItem = {
  key: string;
  encoded: string | null;
  decoded: string;
  source: "data" | "stringData";
};

type SecretDataResponse = {
  type: string;
  items: SecretDataItem[];
};

function validTab(v: string | null): "overview" | "yaml" {
  if (v === "yaml" || v === "overview") return v;
  return "overview";
}

function SecretDataCard({
  query,
}: {
  query: ReturnType<typeof useQuery<SecretDataResponse, Error>>;
}) {
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [showAll, setShowAll] = useState(false);

  const toggleReveal = (key: string) => {
    setRevealed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCopy = (text: string, label: string) => {
    void copyToClipboardSafe(text).then(() => toast.success(`已复制 ${label}`));
  };

  if (query.isLoading) {
    return (
      <Card className="border-slate-200/90 shadow-sm">
        <CardContent className="py-8 text-center text-sm text-slate-500">
          加载 Secret 数据中…
        </CardContent>
      </Card>
    );
  }
  if (query.error) {
    return (
      <Card className="border-slate-200/90 shadow-sm">
        <CardContent className="py-4 text-sm text-red-700">
          加载 Secret 数据失败: {(query.error as Error).message}
        </CardContent>
      </Card>
    );
  }
  if (!query.data || query.data.items.length === 0) {
    return (
      <Card className="border-slate-200/90 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-600">数据</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-500">无数据项</CardContent>
      </Card>
    );
  }

  const items = query.data.items;

  return (
    <Card className="border-slate-200/90 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-slate-600">数据</CardTitle>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs text-slate-600"
            onClick={() => {
              const nextShowAll = !showAll;
              setShowAll(nextShowAll);
              setRevealed((prev) => {
                const next: Record<string, boolean> = {};
                items.forEach((it) => {
                  next[it.key] = nextShowAll;
                });
                return next;
              });
            }}
          >
            {showAll ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showAll ? "全部隐藏" : "全部显示"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => {
          const isRevealed = !!revealed[item.key];
          const displayDecoded = isRevealed ? item.decoded : "•".repeat(Math.min(item.decoded.length, 24));
          const displayEncoded = item.encoded
            ? isRevealed
              ? item.encoded
              : "•".repeat(Math.min(item.encoded.length, 24))
            : null;
          return (
            <div key={item.key} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-slate-800">{item.key}</span>
                  <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-600">
                    {item.source}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-slate-500"
                  onClick={() => toggleReveal(item.key)}
                  title={isRevealed ? "隐藏" : "显示"}
                >
                  {isRevealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <span className="mt-1 shrink-0 text-[10px] font-medium uppercase tracking-wider text-slate-400">
                    明文
                  </span>
                  <div className="min-w-0 flex-1">
                    <pre className="whitespace-pre-wrap break-all font-mono text-xs leading-relaxed text-slate-700">
                      {displayDecoded}
                    </pre>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 shrink-0 p-0 text-slate-500"
                    onClick={() => handleCopy(item.decoded, "明文")}
                    title="复制明文"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {displayEncoded !== null && (
                  <div className="flex items-start gap-2">
                    <span className="mt-1 shrink-0 text-[10px] font-medium uppercase tracking-wider text-slate-400">
                      Base64
                    </span>
                    <div className="min-w-0 flex-1">
                      <pre className="whitespace-pre-wrap break-all font-mono text-xs leading-relaxed text-slate-500">
                        {displayEncoded}
                      </pre>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 shrink-0 p-0 text-slate-500"
                      onClick={() => item.encoded && handleCopy(item.encoded, "Base64")}
                      title="复制 Base64"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

const ClusterSecretDetail: React.FC = () => {
  const { namespace: nsEncoded, secretName: nameEncoded } = useParams<{
    namespace: string;
    secretName: string;
  }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const namespace = nsEncoded ? decodeURIComponent(nsEncoded) : "";
  const secretName = nameEncoded ? decodeURIComponent(nameEncoded) : "";
  const tab = validTab(searchParams.get(TAB_QUERY));

  const setTab = (next: "overview" | "yaml") => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === "overview") p.delete(TAB_QUERY);
        else p.set(TAB_QUERY, next);
        return p;
      },
      { replace: true }
    );
  };

  const basePath = `/cluster/ns/${encodeURIComponent(namespace)}`;

  const listQ = useQuery({
    queryKey: ["k8s-secrets", namespace],
    queryFn: ({ signal }) =>
      apiGetJson<SecretRow[]>(
        `/api/k8s/secrets?namespace=${encodeURIComponent(namespace)}`
      , { signal }),
    enabled: Boolean(namespace && secretName),
  });

  const row = useMemo(
    () => listQ.data?.find((r) => r.name === secretName),
    [listQ.data, secretName]
  );

  const [yamlOpen, setYamlOpen] = useState(false);
  const [yamlDraft, setYamlDraft] = useState("");

  const yamlLoadQ = useQuery({
    queryKey: ["k8s-object-yaml", "Secret", namespace, secretName],
    queryFn: ({ signal }) =>
      apiGetJson<{ yaml: string }>(
        `/api/k8s/object-yaml?kind=${encodeURIComponent("Secret")}&namespace=${encodeURIComponent(namespace)}&name=${encodeURIComponent(secretName)}`
      , { signal }),
    enabled: Boolean(namespace && secretName && tab === "yaml"),
  });

  const secretDataQ = useQuery({
    queryKey: ["k8s-secret-data", namespace, secretName],
    queryFn: ({ signal }) =>
      apiGetJson<SecretDataResponse>(
        `/api/k8s/secret-data?namespace=${encodeURIComponent(namespace)}&name=${encodeURIComponent(secretName)}`
      , { signal }),
    enabled: Boolean(namespace && secretName && tab === "overview"),
  });

  const yamlResourceKey = `Secret|${namespace}|${secretName}`;
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
      void queryClient.invalidateQueries({ queryKey: ["k8s-secrets"] });
      void queryClient.invalidateQueries({ queryKey: ["k8s-namespaces-stats"] });
      void queryClient.invalidateQueries({
        queryKey: ["k8s-object-yaml", "Secret", namespace, secretName],
      });
      void queryClient.invalidateQueries({
        queryKey: ["k8s-object-revisions", namespace, "Secret", secretName],
      });
    },
  });

  const openYamlDialog = async () => {
    setYamlOpen(true);
    setYamlDraft("加载中…");
    try {
      const res = await apiGetJson<{ yaml: string }>(
        `/api/k8s/object-yaml?kind=${encodeURIComponent("Secret")}&namespace=${encodeURIComponent(namespace)}&name=${encodeURIComponent(secretName)}`
      );
      setYamlDraft(res.yaml);
    } catch (e) {
      setYamlDraft(`# 加载失败: ${(e as Error).message}`);
    }
  };

  if (!namespace || !secretName) {
    return <p className="text-sm text-red-600">无效的资源路径</p>;
  }

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
        <Link to={`${basePath}/secrets`} className="font-medium text-blue-600 hover:underline">
          Secret
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
        <span className="font-mono text-base font-semibold text-slate-900">{secretName}</span>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">
            Secret
            <span className="ml-2 font-mono text-lg font-medium text-slate-700">{secretName}</span>
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            core/v1 · 敏感数据；YAML 与列表中的值为 Base64。下方为引用本 Secret 的工作负载与网络资源。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="default" size="sm" className="h-9 gap-1.5" onClick={openYamlDialog}>
            <FileCode2 className="h-3.5 w-3.5" />
            编辑 YAML
          </Button>
          <K8sObjectRevisionTriggerButton
            namespace={namespace}
            kind="Secret"
            name={secretName}
            onApplied={() => {
              void queryClient.invalidateQueries({ queryKey: ["k8s-secrets"] });
              void queryClient.invalidateQueries({ queryKey: ["k8s-namespaces-stats"] });
              void queryClient.invalidateQueries({
                queryKey: ["k8s-object-yaml", "Secret", namespace, secretName],
              });
              void queryClient.invalidateQueries({
                queryKey: ["k8s-object-revisions", namespace, "Secret", secretName],
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
          未找到名为 <span className="font-mono">{secretName}</span> 的 Secret。
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
                    <KeyRound className="h-4 w-4 text-slate-500" />
                    类型
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="font-mono text-sm text-slate-900">{row.type || "Opaque"}</p>
                </CardContent>
              </Card>
              <Card className="border-slate-200/90 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-600">键数量</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-lg font-semibold tabular-nums text-slate-900">{row.keys ?? "—"}</p>
                  <p className="mt-1 text-xs text-slate-500">data + stringData 键名合计（列表接口）</p>
                </CardContent>
              </Card>
            </div>
            <Card className="border-slate-200/90 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">创建时间</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-medium text-slate-900">{parseAge(row.age)}</p>
              </CardContent>
            </Card>
            <SecretDataCard query={secretDataQ} />
            <K8sRelationsCard namespace={namespace} kind="Secret" name={secretName} />
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
                  height="min(70vh, 560px)"
                />
                <p className="text-xs text-slate-500">可直接修改后提交；也可用右上角「编辑 YAML」弹窗。</p>
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
            <DialogTitle>编辑 Secret YAML</DialogTitle>
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

export default ClusterSecretDetail;

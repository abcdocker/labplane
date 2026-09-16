import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  Cloud,
  Copy,
  HardDrive,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiDeleteJson, apiGetJson, apiPostJson, apiPutJson, API_BASE } from "@/lib/api";
import { formatDateTimeShanghai } from "@/lib/datetime-cn";
import { toast } from "sonner";
import { useAuth } from "@/auth/auth-context";
import { DocsVaultShell } from "@/pages/docs/docs-vault-shell";

type AttachmentStoragePayload = {
  mode?: string;
  cos?: {
    configured?: boolean;
    bucket?: string;
    region?: string;
    prefix?: string;
    publicBase?: string;
    source?: string;
    secretIdMasked?: string;
    secretKeySet?: boolean;
  };
  configureHint?: string;
  canManageKv?: boolean;
};

type MediaRow = {
  id: number;
  docId?: number;
  kind: string;
  origName: string;
  mime: string;
  sizeBytes: number;
  publicUrl: string;
  createdBy: string;
  createdAt: string;
};

export default function DocsMedia() {
  const qc = useQueryClient();
  const { status } = useAuth();
  const isAdmin = status?.role === "admin";

  const [secretId, setSecretId] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [bucket, setBucket] = useState("");
  const [region, setRegion] = useState("");
  const [prefix, setPrefix] = useState("");
  const [publicBase, setPublicBase] = useState("");

  const q = useQuery({
    queryKey: ["docs-media"],
    queryFn: ({ signal }) => apiGetJson<{ items: MediaRow[] }>("/api/docs/media", { signal }),
    enabled: isAdmin,
  });

  const storageQ = useQuery({
    queryKey: ["docs-attachment-storage"],
    queryFn: ({ signal }) => apiGetJson<AttachmentStoragePayload>("/api/docs/attachment-storage", { signal }),
    enabled: isAdmin,
    staleTime: 30_000,
  });

  const cosOn = storageQ.data?.mode === "cos" && storageQ.data.cos?.configured;
  const canManageKv = storageQ.data?.canManageKv !== false;
  const cosSource = storageQ.data?.cos?.source;

  useEffect(() => {
    const c = storageQ.data?.cos;
    if (!c) return;
    setBucket(c.bucket ?? "");
    setRegion(c.region ?? "");
    setPrefix(c.prefix ?? "");
    setPublicBase(c.publicBase ?? "");
    if (c.secretIdMasked && c.secretIdMasked !== "****") {
      setSecretId("");
    }
    setSecretKey("");
  }, [storageQ.data?.cos?.bucket, storageQ.data?.cos?.region, storageQ.data?.cos?.prefix, storageQ.data?.cos?.publicBase, storageQ.data?.cos?.secretIdMasked]);

  const saveMut = useMutation({
    mutationFn: () =>
      apiPutJson<{ ok?: boolean }>("/api/docs/attachment-storage", {
        secretId: secretId.trim(),
        secretKey: secretKey.trim(),
        bucket: bucket.trim(),
        region: region.trim(),
        prefix: prefix.trim(),
        publicBase: publicBase.trim(),
      }),
    onSuccess: () => {
      toast.success("COS 配置已保存，新上传将写入对象存储");
      void qc.invalidateQueries({ queryKey: ["docs-attachment-storage"] });
    },
    onError: (e: Error) => toast.error(e.message || "保存失败"),
  });

  const testMut = useMutation({
    mutationFn: () =>
      apiPostJson<{ ok?: boolean; warning?: string }>("/api/docs/attachment-storage/test", {
        secretId: secretId.trim(),
        secretKey: secretKey.trim(),
        bucket: bucket.trim(),
        region: region.trim(),
        prefix: prefix.trim(),
      }),
    onSuccess: (data) => {
      toast.success("连接测试通过（已上传并删除探测文件）");
      if (data?.warning) toast.message(data.warning);
    },
    onError: (e: Error) => toast.error(e.message || "测试失败"),
  });

  const clearKvMut = useMutation({
    mutationFn: () => apiDeleteJson<{ ok?: boolean }>("/api/docs/attachment-storage/cos"),
    onSuccess: () => {
      toast.success("已清除控制台中的 COS 配置");
      void qc.invalidateQueries({ queryKey: ["docs-attachment-storage"] });
      setSecretKey("");
    },
    onError: (e: Error) => toast.error(e.message || "清除失败"),
  });

  const delMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${API_BASE}/api/docs/media/${id}`, {
        method: "DELETE",
        credentials: API_BASE ? "include" : "same-origin",
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(j.error || "删除失败");
    },
    onSuccess: () => {
      toast.success("已删除（含对象存储或本地文件）");
      void qc.invalidateQueries({ queryKey: ["docs-media"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", file.type.startsWith("image/") ? "image" : "attachment");
      const r = await fetch(`${API_BASE}/api/docs/upload`, {
        method: "POST",
        body: fd,
        credentials: API_BASE ? "include" : "same-origin",
      });
      const j = (await r.json()) as { markdown?: string; url?: string; error?: string };
      if (!r.ok) throw new Error(j.error || "上传失败");
      return j;
    },
    onSuccess: async (j) => {
      void qc.invalidateQueries({ queryKey: ["docs-media"] });
      const md = j.markdown || "";
      if (md && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(md);
        toast.success("已上传，Markdown 已复制到剪贴板，可粘贴到正文");
      } else {
        toast.success("已上传");
      }
    },
    onError: (e: Error) => toast.error(e.message || "上传失败"),
  });

  const onDropUpload = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files || []);
      for (const f of files) uploadMut.mutate(f);
    },
    [uploadMut]
  );

  const copyText = async (text: string, msg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(msg);
    } catch {
      toast.error("复制失败");
    }
  };

  if (!isAdmin) {
    return (
      <DocsVaultShell>
        <div className="p-8 text-center text-sm text-slate-600">
          仅管理员可管理媒体与附件。{" "}
          <Link className="font-medium text-violet-700 underline-offset-2 hover:underline" to="/docs">
            返回文档库
          </Link>
        </div>
      </DocsVaultShell>
    );
  }

  const rows = q.data?.items ?? [];
  const showConfigCard = Boolean(canManageKv);

  const formBusy = saveMut.isPending || testMut.isPending;

  const managementMode = cosOn;

  return (
    <DocsVaultShell className="mx-auto max-w-[min(100%,96rem)] space-y-6 !py-6 sm:!px-8 sm:!py-8">
      <div className="flex flex-wrap items-start gap-4">
        <Button variant="outline" size="sm" asChild className="h-10 shrink-0">
          <Link to="/docs" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            文档库
          </Link>
        </Button>
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">媒体与附件</h1>
          <p className="text-sm text-slate-600 sm:text-base">
            上传后复制 Markdown 到文章引用；删除将同步移除数据库记录与对象/本地文件
          </p>
        </div>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="space-y-1 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-lg sm:text-xl">附件存储</CardTitle>
            {storageQ.isLoading ? (
              <Badge variant="outline" className="gap-1 font-normal">
                <Loader2 className="h-3 w-3 animate-spin" />
                加载中
              </Badge>
            ) : cosOn ? (
              <Badge className="gap-1 bg-emerald-600 font-normal hover:bg-emerald-600">
                <Cloud className="h-3.5 w-3.5" />
                腾讯云 COS
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1 font-normal">
                <HardDrive className="h-3.5 w-3.5" />
                本地存储
              </Badge>
            )}
            {cosOn && cosSource ? (
              <Badge variant="outline" className="font-mono text-[11px] font-normal">
                来源：{cosSource === "kv" ? "控制台配置" : "环境变量"}
              </Badge>
            ) : null}
          </div>
          <CardDescription className="text-sm sm:text-[15px]">
            {managementMode
              ? "COS 已启用：新上传写入对象存储。可在下方修改配置或清除控制台配置以回退到环境变量/本地。"
              : "未启用 COS：附件保存在服务器本地。填写腾讯云 COS 并保存后，新上传将走对象存储。"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {storageQ.data?.configureHint ? (
            <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] leading-relaxed text-slate-700">
              {storageQ.data.configureHint}
            </p>
          ) : null}

          {!canManageKv ? (
            <p className="text-sm text-amber-800">
              当前实例未启用 platform_kv，无法在此保存图形配置；请使用环境变量或联系运维开启平台键值存储。
            </p>
          ) : null}

          {cosOn && storageQ.data?.cos ? (
            <dl className="grid gap-2 sm:grid-cols-2">
              {[
                ["SecretId", storageQ.data.cos.secretIdMasked || "—"],
                ["SecretKey", storageQ.data.cos.secretKeySet ? "已配置（隐藏）" : "—"],
                ["存储桶", storageQ.data.cos.bucket || "—"],
                ["地域", storageQ.data.cos.region || "—"],
                ["对象前缀", storageQ.data.cos.prefix || "—"],
                ["公网根 URL", storageQ.data.cos.publicBase || "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex flex-col gap-0.5 rounded-md border border-slate-100 bg-slate-50/80 px-3 py-2">
                  <dt className="text-xs font-medium text-slate-500">{k}</dt>
                  <dd className="break-all font-mono text-[13px] text-slate-900">{v}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {canManageKv && showConfigCard ? (
            <div className="space-y-4 rounded-xl border border-violet-200/80 bg-violet-50/40 p-4 sm:p-5">
              <p className="text-sm font-medium text-slate-800">
                {cosOn ? "修改 COS（控制台）" : "配置腾讯云 COS"}
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="cos-sid">SecretId</Label>
                  <Input
                    id="cos-sid"
                    className="font-mono text-sm"
                    placeholder={cosOn && cosSource === "kv" ? "留空则保留已保存的 SecretId" : "AKID…"}
                    value={secretId}
                    onChange={(e) => setSecretId(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="cos-sk">SecretKey</Label>
                  <Input
                    id="cos-sk"
                    type="password"
                    className="font-mono text-sm"
                    placeholder="留空则保留原密钥（仅更新其他项时）"
                    value={secretKey}
                    onChange={(e) => setSecretKey(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cos-bucket">Bucket（含 APPID）</Label>
                  <Input
                    id="cos-bucket"
                    className="font-mono text-sm"
                    placeholder="mybucket-1250000000"
                    value={bucket}
                    onChange={(e) => setBucket(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cos-region">Region</Label>
                  <Input
                    id="cos-region"
                    className="font-mono text-sm"
                    placeholder="ap-guangzhou"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cos-prefix">对象前缀（可选）</Label>
                  <Input
                    id="cos-prefix"
                    className="font-mono text-sm"
                    placeholder="kubebt-docs"
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cos-pub">公网根 URL（可选 CDN）</Label>
                  <Input
                    id="cos-pub"
                    className="font-mono text-sm"
                    placeholder="https://cdn.example.com"
                    value={publicBase}
                    onChange={(e) => setPublicBase(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={formBusy || !bucket.trim() || !region.trim()}
                  onClick={() => testMut.mutate()}
                  variant="secondary"
                  className="gap-1.5"
                >
                  {testMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  测试连接
                </Button>
                <Button
                  type="button"
                  disabled={formBusy || !bucket.trim() || !region.trim()}
                  onClick={() => saveMut.mutate()}
                  className="gap-1.5 bg-violet-600 hover:bg-violet-700"
                >
                  {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  保存配置
                </Button>
                {cosSource === "kv" ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="text-red-700 hover:bg-red-50"
                    disabled={clearKvMut.isPending}
                    onClick={() => {
                      if (
                        confirm(
                          "确定清除控制台中的 COS 配置？清除后若环境变量未配置，将使用本地存储。"
                        )
                      ) {
                        clearKvMut.mutate();
                      }
                    }}
                  >
                    清除控制台 COS
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-slate-600">
                保存前可先「测试连接」。仅填 Bucket/Region 时测试会使用已保存的密钥（若已有控制台配置）。
                环境变量 KUBEBT_COS_* 在未保存控制台配置时仍生效；保存控制台配置后将优先使用控制台值。
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">上传到附件库</CardTitle>
          <CardDescription>拖拽文件到下方区域，或点击选择；上传成功后自动复制 Markdown 引用</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            role="button"
            tabIndex={0}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDropUpload}
            className="flex min-h-[140px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/80 px-4 py-8 text-center transition-colors hover:border-violet-400 hover:bg-violet-50/50"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                document.getElementById("docs-media-file")?.click();
              }
            }}
            onClick={() => document.getElementById("docs-media-file")?.click()}
          >
            <Upload className="h-10 w-10 text-slate-400" aria-hidden />
            <p className="text-sm font-medium text-slate-700">点击或拖拽上传</p>
            <p className="text-xs text-slate-500">图片将生成 ![alt](url)；其他文件生成 [name](url)</p>
            <input
              id="docs-media-file"
              type="file"
              className="hidden"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                for (const f of files) uploadMut.mutate(f);
                e.target.value = "";
              }}
            />
            {uploadMut.isPending ? (
              <p className="flex items-center gap-2 text-sm text-violet-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                上传中…
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {q.isLoading ? (
        <p className="flex items-center gap-2 text-base text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          加载列表…
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[56rem] text-left text-[15px]">
            <thead className="border-b border-slate-200 bg-slate-50 text-sm font-medium text-slate-600">
              <tr>
                <th className="px-4 py-3.5">ID</th>
                <th className="px-4 py-3.5">类型</th>
                <th className="px-4 py-3.5">文件名</th>
                <th className="px-4 py-3.5">大小</th>
                <th className="px-4 py-3.5">文档</th>
                <th className="px-4 py-3.5">时间</th>
                <th className="px-4 py-3.5">引用</th>
                <th className="w-36 px-4 py-3.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const safe = r.origName.replace(/]/g, "");
                const mdSnippet = r.mime.startsWith("image/")
                  ? `![${safe}](${r.publicUrl})`
                  : `[${safe}](${r.publicUrl})`;
                return (
                  <tr key={r.id} className="border-b border-slate-100 transition-colors hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-mono text-sm text-slate-700">{r.id}</td>
                    <td className="px-4 py-3">{r.kind}</td>
                    <td className="max-w-[min(28rem,40vw)] truncate px-4 py-3 font-medium" title={r.origName}>
                      {r.origName}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">{r.sizeBytes}</td>
                    <td className="px-4 py-3">{r.docId ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">
                      {formatDateTimeShanghai(r.createdAt)}
                    </td>
                    <td className="max-w-[min(20rem,28vw)] px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <Button variant="outline" size="sm" className="h-8 gap-1 px-2 text-xs" asChild>
                          <a href={r.publicUrl} target="_blank" rel="noreferrer">
                            打开
                          </a>
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-8 gap-1 px-2 text-xs"
                          onClick={() => copyText(mdSnippet, "已复制 Markdown")}
                        >
                          <Copy className="h-3.5 w-3.5" />
                          复制 MD
                        </Button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="h-9 gap-1.5 px-3"
                        disabled={delMut.isPending}
                        onClick={() => {
                          if (confirm(`确定删除「${r.origName}」？不可恢复。`)) delMut.mutate(r.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 ? <p className="p-6 text-base text-slate-500">暂无上传记录。</p> : null}
        </div>
      )}
    </DocsVaultShell>
  );
}

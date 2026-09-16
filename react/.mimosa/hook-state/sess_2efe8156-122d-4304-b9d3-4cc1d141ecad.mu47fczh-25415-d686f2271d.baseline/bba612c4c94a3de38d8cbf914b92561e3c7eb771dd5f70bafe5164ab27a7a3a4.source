import React, { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Copy, Loader2, Save } from "lucide-react";
import { useAuth } from "@/auth/auth-context";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiGetJson, apiPutJson } from "@/lib/api";
import { toast } from "sonner";

const PAGE_PATH = "/cluster/apps/cloud-vm/bootstrap";

/** 与 internal/cloud_vm_software.go 默认一致；Release 标签为 app/v2.6.5 */
const DEFAULT_HYSTERIA_AMD64_URL =
  "https://github.com/apernet/hysteria/releases/download/app/v2.6.5/hysteria-linux-amd64";
const DEFAULT_HYSTERIA_ARM64_URL =
  "https://github.com/apernet/hysteria/releases/download/app/v2.6.5/hysteria-linux-arm64";

type ImageRow = {
  id: string;
  label: string;
  image: string;
  /** 镜像内已含 sshd，启动时跳过 apt（与平台脚本检测一致） */
  bakedInSSH?: boolean;
  command?: string[];
  args?: string[];
};

type Bootstrap = {
  bootstrapComplete: boolean;
  images: ImageRow[];
  defaultNamespace: string;
  defaultAccessNodeName?: string;
  hysteria2LinuxAmd64Url?: string;
  hysteria2LinuxArm64Url?: string;
};

type AccessNode = { name: string; ip: string };

export default function AppCenterCloudVmBootstrap() {
  const { status } = useAuth();
  const isAdmin = status?.role === "admin";
  const navigate = useNavigate();
  const qc = useQueryClient();

  const bootQ = useQuery({
    queryKey: ["app-center-cloud-vm-bootstrap"],
    queryFn: ({ signal }) => apiGetJson<Bootstrap>("/api/app-center/cloud-vm/bootstrap", { signal }),
  });

  const nodesQ = useQuery({
    queryKey: ["app-center-cloud-vm-access-nodes"],
    queryFn: ({ signal }) => apiGetJson<{ nodes: AccessNode[] }>("/api/app-center/cloud-vm/access-nodes", { signal }),
    enabled: isAdmin,
  });

  const [ns, setNs] = useState("kube-bt-cloud-vm");
  const [rows, setRows] = useState<ImageRow[]>([]);
  const [accessNode, setAccessNode] = useState<string>("");
  const [hyAmd64Url, setHyAmd64Url] = useState("");
  const [hyArm64Url, setHyArm64Url] = useState("");

  useEffect(() => {
    if (!bootQ.data) return;
    setNs(bootQ.data.defaultNamespace || "kube-bt-cloud-vm");
    setAccessNode(bootQ.data.defaultAccessNodeName?.trim() ?? "");
    setHyAmd64Url(bootQ.data.hysteria2LinuxAmd64Url?.trim() ?? "");
    setHyArm64Url(bootQ.data.hysteria2LinuxArm64Url?.trim() ?? "");
    setRows(
      bootQ.data.images?.length
        ? bootQ.data.images.map((r) => ({ ...r }))
        : [{ id: "ubuntu-2204", label: "Ubuntu 22.04", image: "docker.io/library/ubuntu:22.04" }]
    );
  }, [bootQ.data]);

  const saveMut = useMutation({
    mutationFn: () =>
      apiPutJson("/api/app-center/cloud-vm/bootstrap", {
        bootstrapComplete: true,
        defaultNamespace: ns.trim() || "kube-bt-cloud-vm",
        defaultAccessNodeName: accessNode.trim(),
        hysteria2LinuxAmd64Url: hyAmd64Url.trim(),
        hysteria2LinuxArm64Url: hyArm64Url.trim(),
        images: rows.map((r) => ({
          id: r.id.trim(),
          label: r.label.trim() || r.id.trim(),
          image: r.image.trim(),
          bakedInSSH: r.bakedInSSH === true,
          command: r.command?.length ? r.command : undefined,
          args: r.args?.length ? r.args : undefined,
        })),
      }),
    onSuccess: () => {
      toast.success("已保存云主机镜像配置");
      void qc.invalidateQueries({ queryKey: ["app-center-cloud-vm-bootstrap"] });
      navigate("/cluster/apps/cloud-vm", { replace: true });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin) {
    return <Navigate to="/cluster/apps/cloud-vm" replace />;
  }

  if (bootQ.isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        加载…
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild className="gap-1.5">
          <Link to="/cluster/apps/cloud-vm">
            <ArrowLeft className="h-4 w-4" />
            返回云主机
          </Link>
        </Button>
      </div>

      <div className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-slate-50 px-6 py-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800/90">首次引导 · 管理员</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">云主机镜像与命名空间</h1>
        <p className="mt-2 text-sm text-slate-600">
          导入可拉取的 Ubuntu（或自定义）镜像；保存后前台不再强制进入本页，后续可在后台{" "}
          <code className="rounded bg-slate-100 px-1">platform_kv</code> 调整{" "}
          <code className="rounded bg-slate-100 px-1">appcenter_cloud_vm_bootstrap_v1</code>。
        </p>
        <div className="mt-4 flex flex-col gap-2 rounded-lg border border-emerald-200/80 bg-white/90 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500">本页地址（可收藏或发给运维）</p>
            <p className="mt-1 break-all font-mono text-sm text-emerald-900">
              {typeof window !== "undefined" ? window.location.origin : ""}
              {PAGE_PATH}
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={async () => {
              const full =
                typeof window !== "undefined"
                  ? `${window.location.origin}${PAGE_PATH}`
                  : PAGE_PATH;
              try {
                await navigator.clipboard.writeText(full);
                toast.success("已复制完整 URL");
              } catch {
                toast.error("复制失败");
              }
            }}
          >
            <Copy className="h-3.5 w-3.5" />
            复制完整地址
          </Button>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
        <div>
          <Label>默认命名空间</Label>
          <Input value={ns} onChange={(e) => setNs(e.target.value)} className="font-mono text-sm" />
        </div>

        <div className="space-y-2">
          <Label>访问地址所用节点（Node IP）</Label>
          <p className="text-[11px] leading-relaxed text-slate-600">
            实例列表与详情里「节点 IP:NodePort」优先使用该节点的主 IP（ExternalIP，否则
            InternalIP）。留空则与原先一致，自动取集群节点列表中的第一个。变更后无需重建实例即可在界面看到新 IP。
          </p>
          {nodesQ.isLoading ? (
            <p className="text-xs text-slate-500">加载节点列表…</p>
          ) : nodesQ.isError ? (
            <p className="text-xs text-amber-800">{(nodesQ.error as Error).message}</p>
          ) : (
            <Select value={accessNode || "__auto__"} onValueChange={(v) => setAccessNode(v === "__auto__" ? "" : v)}>
              <SelectTrigger className="font-mono text-sm">
                <SelectValue placeholder="自动（首个节点）" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__auto__">自动（首个可用节点）</SelectItem>
                {(nodesQ.data?.nodes ?? []).map((n) => (
                  <SelectItem key={n.name} value={n.name}>
                    {n.name}
                    {n.ip ? ` · ${n.ip}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>镜像列表</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setRows((r) => [
                  ...r,
                  { id: `custom-${Date.now()}`, label: "新镜像", image: "docker.io/library/ubuntu:22.04" },
                ])
              }
            >
              添加一行
            </Button>
          </div>
          {rows.map((row, i) => (
            <div
              key={`${row.id}-${i}`}
              className="grid gap-2 rounded-lg border border-slate-100 bg-slate-50/80 p-3 sm:grid-cols-2"
            >
              <div>
                <Label className="text-xs">ID（英文标识）</Label>
                <Input
                  value={row.id}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRows((rs) => rs.map((x, j) => (j === i ? { ...x, id: v } : x)));
                  }}
                  className="font-mono text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">显示名称</Label>
                <Input
                  value={row.label}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRows((rs) => rs.map((x, j) => (j === i ? { ...x, label: v } : x)));
                  }}
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">镜像引用</Label>
                <Input
                  value={row.image}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRows((rs) => rs.map((x, j) => (j === i ? { ...x, image: v } : x)));
                  }}
                  className="font-mono text-xs"
                  placeholder="docker.io/library/ubuntu:22.04"
                />
              </div>
              <div className="sm:col-span-2 flex items-start gap-2 rounded-md border border-emerald-100 bg-emerald-50/50 px-2 py-2">
                <Checkbox
                  id={`baked-${i}`}
                  checked={row.bakedInSSH === true}
                  onCheckedChange={(c) => {
                    const on = c === true;
                    setRows((rs) => rs.map((x, j) => (j === i ? { ...x, bakedInSSH: on } : x)));
                  }}
                />
                <label htmlFor={`baked-${i}`} className="cursor-pointer text-[11px] leading-snug text-slate-700">
                  <span className="font-medium text-emerald-900">镜像已预装 OpenSSH（推荐自建镜像勾选）</span>
                  <span className="mt-0.5 block text-slate-600">
                    Dockerfile 中已安装 <code className="rounded bg-white/80 px-0.5">openssh-server</code> 时，平台启动脚本会跳过{" "}
                    <code className="rounded bg-white/80 px-0.5">apt-get</code>，首次 Pod 就绪更快。官方{" "}
                    <code className="rounded bg-white/80 px-0.5">ubuntu:22.04</code> 未预装，请勿勾选。
                  </span>
                </label>
              </div>
              <div className="sm:col-span-2 flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-red-600"
                  disabled={rows.length <= 1}
                  onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                >
                  删除
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-3 rounded-xl border border-fuchsia-200/70 bg-fuchsia-50/20 p-4">
          <Label className="text-sm font-semibold text-fuchsia-950">Hysteria2 客户端 · 二进制下载地址（全局）</Label>
          <p className="text-[11px] leading-relaxed text-slate-600">
            创建向导勾选 Hysteria2 时，Pod 按节点架构从此处配置的 <strong>http(s) 裸二进制</strong>拉取（平台会自动追加 ghproxy 等镜像尝试）。留空则使用官方 GitHub，路径为{" "}
            <code className="rounded bg-white px-0.5 font-mono text-[10px]">.../download/app/v2.6.5/hysteria-linux-amd64|arm64</code>（标签为{" "}
            <code className="rounded bg-white px-0.5 font-mono text-[10px]">app/v2.6.5</code>，勿写成 v2.6.5）。也可填自建 CDN 或内网镜像 URL。
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-700">linux-amd64 下载 URL</Label>
              <Input
                className="font-mono text-[11px]"
                placeholder={DEFAULT_HYSTERIA_AMD64_URL}
                value={hyAmd64Url}
                onChange={(e) => setHyAmd64Url(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-700">linux-arm64 下载 URL</Label>
              <Input
                className="font-mono text-[11px]"
                placeholder={DEFAULT_HYSTERIA_ARM64_URL}
                value={hyArm64Url}
                onChange={(e) => setHyArm64Url(e.target.value)}
              />
            </div>
          </div>
        </div>

        <Button
          type="button"
          className="gap-2 bg-emerald-600 hover:bg-emerald-700"
          disabled={saveMut.isPending || rows.some((r) => !r.id.trim() || !r.image.trim())}
          onClick={() => saveMut.mutate()}
        >
          {saveMut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          保存并完成引导
        </Button>
      </div>
    </div>
  );
}

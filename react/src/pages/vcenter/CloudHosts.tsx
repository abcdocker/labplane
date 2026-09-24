import React, { useMemo, useState } from "react";
import { useAppConfig } from "@/hooks/use-app-config";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cloud, Loader2, Radio, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiDelete, apiGetJson, apiPostJson, apiPutJson } from "@/lib/api";
import type { AppConfig } from "@/lib/api";
import { toast } from "sonner";
import { mergeListeningPortsByProtoPort } from "@/lib/listening-ports";

export type CloudHostRow = {
  id: string;
  name: string;
  sshHost: string;
  sshPort: number;
  sshUser: string;
  sshHostKeyFingerprint?: string;
  nodeExporterInstance?: string;
  comment?: string;
};

type CloudHostsListResponse = { hosts: CloudHostRow[] };

type MetricsSnapshotResponse = {
  metrics: Record<
    string,
    {
      instance: string;
      up?: number;
      cpuPercent?: number;
      memPercent?: number;
      diskRootPercent?: number;
      /** 磁盘读吞吐 字节/秒 */
      diskReadBps?: number;
      diskWriteBps?: number;
      netRxBps?: number;
      netTxBps?: number;
      error?: string;
    }
  >;
  prometheusConfigured?: boolean;
};

type CloudHostForm = {
  name: string;
  sshHost: string;
  sshPort: string;
  sshUser: string;
  sshHostKeyFingerprint: string;
  sshPassword: string;
  sshPrivateKeyPem: string;
  comment: string;
};

const emptyForm: CloudHostForm = {
  name: "",
  sshHost: "",
  sshPort: "22",
  sshUser: "",
  sshHostKeyFingerprint: "",
  sshPassword: "",
  sshPrivateKeyPem: "",
  comment: "",
};

function fmtPct(v: number | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return `${v.toFixed(1)}%`;
}

/** node_exporter rate 后的字节/秒 */
function fmtBps(bps: number | undefined): string {
  if (bps == null || !Number.isFinite(bps)) return "—";
  if (bps === 0) return "0";
  if (bps >= 1024 * 1024) return `${(bps / 1024 / 1024).toFixed(2)} MB/s`;
  if (bps >= 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${bps.toFixed(0)} B/s`;
}

const CloudHosts: React.FC = () => {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CloudHostRow | null>(null);
  const [form, setForm] = useState<CloudHostForm>(emptyForm);
  const [portsDialogHost, setPortsDialogHost] = useState<CloudHostRow | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CloudHostRow | null>(null);

  const cfgQ = useAppConfig();

  const listQ = useQuery({
    queryKey: ["cloud-hosts"],
    queryFn: ({ signal }) => apiGetJson<CloudHostsListResponse>("/api/cloud-hosts", { signal }),
  });

  const metricsQ = useQuery({
    queryKey: ["cloud-hosts-metrics", listQ.data?.hosts?.length],
    queryFn: ({ signal }) => apiGetJson<MetricsSnapshotResponse>("/api/cloud-hosts/metrics-snapshot", { signal }),
    enabled: (listQ.data?.hosts?.length ?? 0) > 0,
    refetchInterval: 30_000,
  });

  type CloudListeningPortsResponse = {
    sshAddr?: string;
    ports?: { proto: string; local: string; port: number }[];
    scannedAt?: string;
    stderr?: string;
  };

  const portsQ = useQuery({
    queryKey: ["cloud-host-listening-ports", portsDialogHost?.id],
    queryFn: ({ signal }) =>
      apiGetJson<CloudListeningPortsResponse>(
        `/api/cloud-hosts/${encodeURIComponent(portsDialogHost!.id)}/listening-ports`
      , { signal }),
    enabled: Boolean(portsDialogHost?.id),
  });

  const mergedCloudPorts = useMemo(
    () => mergeListeningPortsByProtoPort(portsQ.data?.ports ?? []),
    [portsQ.data?.ports]
  );

  const saveMut = useMutation({
    mutationFn: async () => {
      const sshPort = parseInt(form.sshPort, 10);
      const body = {
        name: form.name.trim(),
        sshHost: form.sshHost.trim(),
        sshPort: Number.isFinite(sshPort) && sshPort > 0 ? sshPort : 22,
        sshUser: form.sshUser.trim(),
        sshHostKeyFingerprint: form.sshHostKeyFingerprint.trim(),
        sshPassword: form.sshPassword,
        sshPrivateKeyPem: form.sshPrivateKeyPem.trim(),
        comment: form.comment.trim(),
      };
      if (editing) {
        return apiPutJson<{ host: CloudHostRow }>(`/api/cloud-hosts/${encodeURIComponent(editing.id)}`, body);
      }
      return apiPostJson<{ host: CloudHostRow }>("/api/cloud-hosts", body);
    },
    onSuccess: () => {
      const wasEdit = editing != null;
      void queryClient.invalidateQueries({ queryKey: ["cloud-hosts"] });
      void queryClient.invalidateQueries({ queryKey: ["cloud-hosts-metrics"] });
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyForm);
      toast.success(wasEdit ? "已保存" : "已添加主机");
    },
    onError: (e) => {
      toast.error((e as Error).message);
    },
  });

  const delMut = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/cloud-hosts/${encodeURIComponent(id)}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["cloud-hosts"] });
      void queryClient.invalidateQueries({ queryKey: ["cloud-hosts-metrics"] });
      toast.success("已删除");
    },
    onError: (e) => {
      toast.error((e as Error).message);
    },
  });

  const openCreate = () => {
    saveMut.reset();
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (h: CloudHostRow) => {
    saveMut.reset();
    setEditing(h);
    setForm({
      name: h.name,
      sshHost: h.sshHost,
      sshPort: String(h.sshPort || 22),
      sshUser: h.sshUser || "",
      sshHostKeyFingerprint: h.sshHostKeyFingerprint || "",
      sshPassword: "",
      sshPrivateKeyPem: "",
      comment: h.comment || "",
    });
    setDialogOpen(true);
  };

  const promCloudOk =
    cfgQ.data?.prometheusCloudConfigured === true || cfgQ.data?.prometheusConfigured === true;
  const metrics = metricsQ.data?.metrics;
  /** 未配置全局 VCENTER_VM_SSH_* 时，表单须填 SSH 用户名 */
  const needPerHostSshUser = cfgQ.data?.vcenterVmSshGlobalConfigured !== true;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Cloud className="h-7 w-7 text-violet-600" />
            公有云主机
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            登记 SSH；<strong className="font-medium text-slate-700">CPU / 内存 / 磁盘使用率 / 磁盘与网络 IO</strong>{" "}
            均从 Prometheus 抓取 node_exporter（与 vCenter 无关）。请在「运行时配置」中填写{" "}
            <code className="rounded bg-slate-100 px-1 text-xs">prometheusUrlCloud</code> 或兜底{" "}
            <code className="text-xs">prometheusUrl</code>。Prometheus 中该主机的{" "}
            <code className="rounded bg-slate-100 px-1 text-xs">instance</code> 须与列表 SSH 地址一致，一般为{" "}
            <code className="text-xs">云主机IP:9100</code>（与 node_exporter 监听一致）。
          </p>
        </div>
        <Button type="button" onClick={openCreate} className="shrink-0 bg-violet-600 hover:bg-violet-700">
          添加主机
        </Button>
      </div>

      {!promCloudOk && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          未配置 Prometheus（<code className="text-xs">prometheusUrlCloud</code> 或兜底{" "}
          <code className="text-xs">prometheusUrl</code>）。云主机监控不依赖 vCenter。
        </div>
      )}

      {listQ.isLoading && <p className="text-slate-500">加载中…</p>}
      {listQ.error && <p className="text-red-600">{(listQ.error as Error).message}</p>}

      {listQ.data && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>SSH</TableHead>
                <TableHead>用户</TableHead>
                <TableHead>instance</TableHead>
                <TableHead>Up</TableHead>
                <TableHead>CPU</TableHead>
                <TableHead>内存</TableHead>
                <TableHead>磁盘使用率</TableHead>
                <TableHead className="min-w-[108px]">磁盘 IO</TableHead>
                <TableHead className="min-w-[108px]">网络 IO</TableHead>
                <TableHead className="min-w-[200px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {listQ.data.hosts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="text-center text-slate-500">
                    暂无主机，点击「添加主机」登记信息（无需完成 vCenter 初始化）。
                  </TableCell>
                </TableRow>
              )}
              {listQ.data.hosts.map((h) => {
                const m = metrics?.[h.id];
                const inst = h.sshHost ? `${h.sshHost}:9100` : "—";
                return (
                  <TableRow key={h.id}>
                    <TableCell className="max-w-[260px] align-top">
                      <div className="font-medium">{h.name}</div>
                      {m?.error ? (
                        <div className="mt-1.5 whitespace-normal break-words text-xs leading-snug text-amber-800">
                          {m.error}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {h.sshHost}:{h.sshPort || 22}
                    </TableCell>
                    <TableCell className="text-xs">{h.sshUser || "—"}</TableCell>
                    <TableCell className="max-w-[200px] truncate font-mono text-xs" title={inst}>
                      {inst}
                    </TableCell>
                    <TableCell className="align-top">
                      {m?.error ? (
                        "—"
                      ) : m?.up != null ? (
                        <span className={m.up >= 1 ? "text-emerald-600" : "text-red-600"}>
                          {m.up >= 1 ? "1" : "0"}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-xs align-top">{m?.error ? "—" : fmtPct(m?.cpuPercent)}</TableCell>
                    <TableCell className="text-xs align-top">{m?.error ? "—" : fmtPct(m?.memPercent)}</TableCell>
                    <TableCell className="text-xs align-top">{m?.error ? "—" : fmtPct(m?.diskRootPercent)}</TableCell>
                    <TableCell className="align-top text-[11px] leading-snug text-slate-700">
                      {m?.error ? (
                        "—"
                      ) : (
                        <span className="space-y-0.5">
                          <span className="block whitespace-nowrap">读 {fmtBps(m?.diskReadBps)}</span>
                          <span className="block whitespace-nowrap">写 {fmtBps(m?.diskWriteBps)}</span>
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="align-top text-[11px] leading-snug text-slate-700">
                      {m?.error ? (
                        "—"
                      ) : (
                        <span className="space-y-0.5">
                          <span className="block whitespace-nowrap">收 {fmtBps(m?.netRxBps)}</span>
                          <span className="block whitespace-nowrap">发 {fmtBps(m?.netTxBps)}</span>
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          asChild
                          size="sm"
                          className="gap-1.5 bg-gradient-to-r from-violet-600 to-violet-700 text-white shadow-md shadow-violet-500/20 transition-all duration-200 hover:from-violet-500 hover:to-violet-600 hover:shadow-lg hover:shadow-violet-500/25 active:scale-[0.97]"
                        >
                          <Link to={`/cluster/vcenter/cloud/${encodeURIComponent(h.id)}/ssh`}>
                            <Terminal className="h-3.5 w-3.5 opacity-95" strokeWidth={2} />
                            SSH
                          </Link>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1"
                          onClick={() => setPortsDialogHost(h)}
                        >
                          <Radio className="h-3.5 w-3.5" />
                          监听端口
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => openEdit(h)}>
                          编辑
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-red-600"
                          onClick={() => {
                            setDeleteTarget(h);
                            setDeleteOpen(true);
                          }}
                        >
                          删除
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {metricsQ.isError && (listQ.data?.hosts?.length ?? 0) > 0 && (
        <p className="text-sm text-amber-700">
          监控接口失败：{(metricsQ.error as Error).message}
        </p>
      )}

      <Dialog
        open={portsDialogHost != null}
        onOpenChange={(o) => {
          if (!o) setPortsDialogHost(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              已监听端口
              {portsDialogHost ? ` — ${portsDialogHost.name}` : ""}
            </DialogTitle>
          </DialogHeader>
          {portsQ.isLoading && (
            <div className="flex items-center gap-2 py-6 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在通过 SSH 拉取 ss/netstat…
            </div>
          )}
          {portsQ.isError && (
            <p className="text-sm text-red-600">{(portsQ.error as Error).message}</p>
          )}
          {portsQ.data && (
            <div className="space-y-3 text-sm">
              <p className="text-xs text-slate-500">
                {portsQ.data.sshAddr ? (
                  <>
                    SSH <span className="font-mono">{portsQ.data.sshAddr}</span>
                  </>
                ) : null}
                {portsQ.data.scannedAt ? <> · {portsQ.data.scannedAt}</> : null}
              </p>
              {portsQ.data.stderr ? (
                <p className="text-xs text-amber-800">{portsQ.data.stderr}</p>
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
                    {mergedCloudPorts.map((p) => (
                      <TableRow key={`${p.proto}-${p.port}`}>
                        <TableCell className="font-mono text-xs">{p.proto}</TableCell>
                        <TableCell className="text-xs tabular-nums">{p.port}</TableCell>
                        <TableCell className="max-w-[220px] break-words font-mono text-xs">
                          {p.locals}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {(portsQ.data.ports ?? []).length === 0 && !portsQ.isFetching && (
                <p className="text-xs text-slate-500">未解析到监听项。</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPortsDialogHost(null)}>
              关闭
            </Button>
            <Button
              type="button"
              disabled={!portsDialogHost || portsQ.isFetching}
              onClick={() => void portsQ.refetch()}
            >
              {portsQ.isFetching ? "刷新中…" : "重新拉取"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑主机" : "添加主机"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="ch-name">显示名称</Label>
              <Input
                id="ch-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="例如 prod-web-01"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ch-host">SSH 地址</Label>
              <Input
                id="ch-host"
                value={form.sshHost}
                onChange={(e) => setForm((f) => ({ ...f, sshHost: e.target.value }))}
                placeholder="公网 IP 或域名"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="ch-port">SSH 端口</Label>
                <Input
                  id="ch-port"
                  value={form.sshPort}
                  onChange={(e) => setForm((f) => ({ ...f, sshPort: e.target.value }))}
                />
              </div>
            <div className="grid gap-2">
              <Label htmlFor="ch-user">SSH 用户</Label>
              <Input
                id="ch-user"
                value={form.sshUser}
                onChange={(e) => setForm((f) => ({ ...f, sshUser: e.target.value }))}
                placeholder={
                  needPerHostSshUser
                    ? "必填（未配置全局 VCENTER_VM_SSH_USER 时）"
                    : "可留空，使用全局 VCENTER_VM_SSH_USER"
                }
              />
              {needPerHostSshUser && (
                <p className="text-xs text-amber-800">
                  未在运行时配置全局虚拟机 SSH 时，须填写用户名，并填写密码或私钥以便首次校验。
                </p>
              )}
            </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ch-host-key">SSH 主机密钥指纹</Label>
              <Input
                id="ch-host-key"
                className="font-mono text-xs"
                value={form.sshHostKeyFingerprint}
                onChange={(e) =>
                  setForm((f) => ({ ...f, sshHostKeyFingerprint: e.target.value }))
                }
                placeholder="SHA256:..."
              />
              <p className="text-xs text-slate-500">
                新增主机时必填；请先在可信网络核对 ssh-keyscan / ssh-keygen 输出。
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ch-pw">SSH 密码（可选，与私钥二选一）</Label>
              <Input
                id="ch-pw"
                type="password"
                autoComplete="off"
                value={form.sshPassword}
                onChange={(e) => setForm((f) => ({ ...f, sshPassword: e.target.value }))}
                placeholder={editing ? "留空则沿用已保存凭据" : "添加时建议填写以便 SSH 校验"}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ch-pk">SSH 私钥 PEM（可选）</Label>
              <Textarea
                id="ch-pk"
                className="min-h-[88px] font-mono text-xs"
                value={form.sshPrivateKeyPem}
                onChange={(e) => setForm((f) => ({ ...f, sshPrivateKeyPem: e.target.value }))}
                placeholder="-----BEGIN ... PRIVATE KEY-----"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ch-cm">备注</Label>
              <Input
                id="ch-cm"
                value={form.comment}
                onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            {saveMut.isError && (
              <p className="text-sm text-red-600">{(saveMut.error as Error).message}</p>
            )}
            <Button
              type="button"
              disabled={
                saveMut.isPending ||
                !form.name.trim() ||
                !form.sshHost.trim() ||
                (needPerHostSshUser && !form.sshUser.trim())
              }
              onClick={() => saveMut.mutate()}
            >
              {saveMut.isPending ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除主机</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除主机「{deleteTarget?.name}」？此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-600/90"
              onClick={() => {
                if (deleteTarget) delMut.mutate(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CloudHosts;

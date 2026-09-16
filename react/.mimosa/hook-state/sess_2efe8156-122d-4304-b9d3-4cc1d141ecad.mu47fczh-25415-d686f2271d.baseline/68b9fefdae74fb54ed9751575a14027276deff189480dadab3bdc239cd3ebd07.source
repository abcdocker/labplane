import React, { useEffect, useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { yaml } from "@codemirror/lang-yaml";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronRight,
  Download,
  FileText,
  Folder,
  FolderPlus,
  HardDrive,
  Loader2,
  Pencil,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/auth/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiHttpError, apiGetJson, apiPostJson, apiPostNoBody, apiPutRaw } from "@/lib/api";
import { k8sPodExecAllowed } from "@/lib/platform-permissions";

type Mount = { pod: string; container: string; mountPath: string };
type ListEntry = { name: string; type: string; size: number };

function pvcBrowseErrorMessage(e: unknown): string {
  if (e instanceof ApiHttpError) return e.serverMessage;
  return e instanceof Error ? e.message : String(e);
}

function pvcFileEditorExtensions(fileName: string) {
  const i = fileName.lastIndexOf(".");
  const ext = i >= 0 ? fileName.slice(i).toLowerCase() : "";
  const wrap = [EditorView.lineWrapping];
  if (ext === ".json") return [json(), ...wrap];
  if (ext === ".yaml" || ext === ".yml") return [yaml(), ...wrap];
  if (ext === ".md" || ext === ".markdown") return [markdown(), ...wrap];
  return wrap;
}

function pvcBase(
  ns: string,
  pvc: string,
  m: Mount,
  rel: string
): URLSearchParams {
  return new URLSearchParams({
    pod: m.pod,
    container: m.container,
    mountPath: m.mountPath,
    path: rel,
  });
}

const ClusterPVCFilesPage: React.FC = () => {
  const { namespace: nsParam, pvcName: pvcParam } = useParams();
  const namespace = nsParam ? decodeURIComponent(nsParam) : "";
  const pvcName = pvcParam ? decodeURIComponent(pvcParam) : "";
  const { status } = useAuth();
  const canExec = k8sPodExecAllowed(status?.role, status?.permissions ?? null);
  const canWriteK8s =
    status?.role === "admin" || status?.permissions?.k8s === "rw";

  const [mountKey, setMountKey] = useState<string>("");
  const [relPath, setRelPath] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editText, setEditText] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editLoadError, setEditLoadError] = useState<string | null>(null);
  const [mkdirOpen, setMkdirOpen] = useState(false);
  const [mkdirName, setMkdirName] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameFrom, setRenameFrom] = useState("");
  const [renameTo, setRenameTo] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteName, setDeleteName] = useState<string | null>(null);
  const qc = useQueryClient();

  const mountsQ = useQuery({
    queryKey: ["k8s-pvc-mounts", namespace, pvcName],
    queryFn: ({ signal }) =>
      apiGetJson<{ mounts: Mount[] }>(
        `/api/k8s/pvc-files/${encodeURIComponent(namespace)}/${encodeURIComponent(pvcName)}/mounts`
      , { signal }),
    enabled: Boolean(namespace && pvcName && canExec),
  });

  const mounts = mountsQ.data?.mounts ?? [];
  const selected = useMemo(() => {
    if (!mountKey || mounts.length === 0) return null;
    const i = parseInt(mountKey, 10);
    return mounts[i] ?? null;
  }, [mountKey, mounts]);

  useEffect(() => {
    if (mounts.length > 0 && !mountKey) {
      setMountKey("0");
    }
  }, [mounts, mountKey]);

  const listQ = useQuery({
    queryKey: ["k8s-pvc-list", namespace, pvcName, mountKey, relPath],
    queryFn: ({ signal }) => {
      const list = mountsQ.data?.mounts ?? [];
      const m = list[parseInt(mountKey, 10)];
      if (!m) throw new Error("no mount");
      const q = pvcBase(namespace, pvcName, m, relPath);
      return apiGetJson<{ entries: ListEntry[]; path: string }>(
        `/api/k8s/pvc-files/${encodeURIComponent(namespace)}/${encodeURIComponent(pvcName)}/list?${q}`,
        { signal }
      );
    },
    enabled: Boolean(mountKey !== "" && mounts.length > 0 && canExec),
  });

  const readPath = (rel: string) => {
    if (!selected) return "";
    const q = pvcBase(namespace, pvcName, selected, rel);
    return `/api/k8s/pvc-files/${encodeURIComponent(namespace)}/${encodeURIComponent(pvcName)}/read?${q}`;
  };

  const writePath = (rel: string) => {
    if (!selected) return "";
    const q = pvcBase(namespace, pvcName, selected, rel);
    return `/api/k8s/pvc-files/${encodeURIComponent(namespace)}/${encodeURIComponent(pvcName)}/write?${q}`;
  };

  const deletePath = (rel: string) => {
    if (!selected) return "";
    const q = pvcBase(namespace, pvcName, selected, rel);
    return `/api/k8s/pvc-files/${encodeURIComponent(namespace)}/${encodeURIComponent(pvcName)}/delete?${q}`;
  };

  const mkdirPostPath = () => {
    if (!selected) return "";
    const q = pvcBase(namespace, pvcName, selected, relPath);
    return `/api/k8s/pvc-files/${encodeURIComponent(namespace)}/${encodeURIComponent(pvcName)}/mkdir?${q}`;
  };

  const renamePostPath = () => {
    if (!selected) return "";
    const q = pvcBase(namespace, pvcName, selected, relPath);
    return `/api/k8s/pvc-files/${encodeURIComponent(namespace)}/${encodeURIComponent(pvcName)}/rename?${q}`;
  };

  const editExtensions = useMemo(() => pvcFileEditorExtensions(editName), [editName]);

  const openRead = async (name: string) => {
    if (!selected) return;
    const childRel = relPath ? `${relPath}/${name}` : name;
    setEditName(name);
    setEditText("");
    setEditLoadError(null);
    setEditOpen(true);
    setEditLoading(true);
    try {
      const data = await apiGetJson<{
        encoding: string;
        content: string;
        text: string;
        size: number;
      }>(readPath(childRel));
      setEditText(data.text || "");
    } catch (e) {
      const msg = pvcBrowseErrorMessage(e);
      setEditLoadError(msg);
      toast.error(msg);
    } finally {
      setEditLoading(false);
    }
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      const childRel = relPath ? `${relPath}/${editName}` : editName;
      await apiPutRaw(writePath(childRel), new TextEncoder().encode(editText), "text/plain; charset=utf-8");
    },
    onSuccess: () => {
      toast.success("已保存");
      setEditOpen(false);
      void qc.invalidateQueries({ queryKey: ["k8s-pvc-list"] });
    },
    onError: (e: Error) => toast.error(pvcBrowseErrorMessage(e)),
  });

  const delMut = useMutation({
    mutationFn: async (name: string) => {
      const childRel = relPath ? `${relPath}/${name}` : name;
      await apiPostNoBody(deletePath(childRel));
    },
    onSuccess: () => {
      toast.success("已删除");
      void qc.invalidateQueries({ queryKey: ["k8s-pvc-list"] });
    },
    onError: (e: Error) => toast.error(pvcBrowseErrorMessage(e)),
  });

  const mkdirMut = useMutation({
    mutationFn: async () => {
      await apiPostJson(mkdirPostPath(), { name: mkdirName.trim() });
    },
    onSuccess: () => {
      toast.success("已创建目录");
      setMkdirOpen(false);
      setMkdirName("");
      void qc.invalidateQueries({ queryKey: ["k8s-pvc-list"] });
    },
    onError: (e: Error) => toast.error(pvcBrowseErrorMessage(e)),
  });

  const renameMut = useMutation({
    mutationFn: async () => {
      await apiPostJson(renamePostPath(), {
        from: renameFrom,
        to: renameTo.trim(),
      });
    },
    onSuccess: () => {
      toast.success("已重命名");
      setRenameOpen(false);
      void qc.invalidateQueries({ queryKey: ["k8s-pvc-list"] });
    },
    onError: (e: Error) => toast.error(pvcBrowseErrorMessage(e)),
  });

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const buf = await file.arrayBuffer();
      const childRel = relPath ? `${relPath}/${file.name}` : file.name;
      await apiPutRaw(writePath(childRel), buf, file.type || "application/octet-stream");
    },
    onSuccess: () => {
      toast.success("已上传");
      void qc.invalidateQueries({ queryKey: ["k8s-pvc-list"] });
    },
    onError: (e: Error) => toast.error(pvcBrowseErrorMessage(e)),
  });

  const downloadFile = async (name: string) => {
    try {
      const childRel = relPath ? `${relPath}/${name}` : name;
      const data = await apiGetJson<{ content: string; text: string }>(readPath(childRel));
      const bin = Uint8Array.from(atob(data.content), (c) => c.charCodeAt(0));
      const blob = new Blob([bin]);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      toast.error(pvcBrowseErrorMessage(e));
    }
  };

  const crumbs = useMemo(() => {
    if (!relPath) return [];
    return relPath.split("/").filter(Boolean);
  }, [relPath]);

  if (!namespace || !pvcName) {
    return <p className="text-sm text-red-600">无效路径</p>;
  }

  if (!canExec) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-amber-900">当前账号无 Pod 终端权限，无法浏览 PVC 内文件（与集群内 exec 同源）。</p>
        <Button variant="outline" size="sm" asChild>
          <Link to={`/cluster/ns/${encodeURIComponent(namespace)}/pvcs`}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            返回 PVC 列表
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" className="-ml-2 gap-1" asChild>
          <Link to={`/cluster/ns/${encodeURIComponent(namespace)}/pvcs`}>
            <ArrowLeft className="h-4 w-4" />
            返回 PVC
          </Link>
        </Button>
        <span className="text-slate-300">|</span>
        <HardDrive className="h-5 w-5 text-violet-600" />
        <h2 className="text-lg font-semibold text-slate-900">
          <span className="font-mono">{namespace}</span>
          <span className="text-slate-400"> / </span>
          <span className="font-mono">{pvcName}</span>
        </h2>
      </div>

      <div className="rounded-xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
        <p className="font-medium">说明</p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-xs leading-relaxed">
          <li>通过<strong>已挂载该 PVC 且处于 Running</strong> 的 Pod 在容器内执行 ls/cat/rm 等命令；ReadWriteOnce 卷同时只能被一个 Pod 挂载。</li>
          <li>若无候选 Pod，请确保工作负载已启动并挂载此 PVC。</li>
          <li>删除目录为递归删除；请谨慎操作生产数据。</li>
        </ul>
      </div>

      {mountsQ.isLoading && <p className="text-sm text-slate-500">加载挂载信息…</p>}
      {mountsQ.error && (
        <p className="text-sm text-red-600">{pvcBrowseErrorMessage(mountsQ.error)}</p>
      )}
      {mountsQ.data && mounts.length === 0 && (
        <p className="text-sm text-slate-600">
          未找到挂载该 PVC 的 Running Pod。请启动已引用此卷的工作负载后再试。
        </p>
      )}

      {mounts.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Pod / 容器 / 挂载路径</Label>
            <Select value={mountKey} onValueChange={setMountKey}>
              <SelectTrigger className="w-full max-w-xl font-mono text-xs">
                <SelectValue placeholder="选择挂载点" />
              </SelectTrigger>
              <SelectContent>
                {mounts.map((m, i) => (
                  <SelectItem key={`${m.pod}-${m.container}-${m.mountPath}-${i}`} value={String(i)}>
                    {m.pod} · {m.container} → {m.mountPath}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {canWriteK8s && (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="gap-1"
                onClick={() => setMkdirOpen(true)}
              >
                <FolderPlus className="h-3.5 w-3.5" />
                新建目录
              </Button>
              <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50">
                <Upload className="h-3.5 w-3.5" />
                上传文件
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) uploadMut.mutate(f);
                  }}
                />
              </label>
            </div>
          )}
        </div>
      )}

      {selected && (
        <>
          <div className="flex flex-wrap items-center gap-1 text-sm text-slate-600">
            <button
              type="button"
              className="rounded px-1 hover:bg-slate-100 hover:text-slate-900"
              onClick={() => setRelPath("")}
            >
              根
            </button>
            {crumbs.map((seg, idx) => {
              const prefix = crumbs.slice(0, idx + 1).join("/");
              return (
                <span key={prefix} className="inline-flex items-center gap-1">
                  <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                  <button
                    type="button"
                    className="rounded px-1 font-mono hover:bg-slate-100 hover:text-slate-900"
                    onClick={() => setRelPath(prefix)}
                  >
                    {seg}
                  </button>
                </span>
              );
            })}
          </div>

          {listQ.isLoading && <p className="text-sm text-slate-500">加载列表…</p>}
          {listQ.error && (
            <div
              className={
                listQ.error instanceof ApiHttpError &&
                listQ.error.code === "pvc_exec_unsupported"
                  ? "rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm leading-relaxed text-amber-950"
                  : "rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800"
              }
              role="alert"
            >
              {pvcBrowseErrorMessage(listQ.error)}
            </div>
          )}
          {listQ.data && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>名称</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead className="text-right">大小</TableHead>
                    <TableHead className="w-[220px] text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listQ.data.entries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-slate-500">
                        空目录
                      </TableCell>
                    </TableRow>
                  ) : (
                    listQ.data.entries.map((row) => (
                      <TableRow key={row.name}>
                        <TableCell className="font-mono text-sm">
                          {row.type === "dir" ? (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1.5 text-blue-700 hover:underline"
                              onClick={() =>
                                setRelPath(relPath ? `${relPath}/${row.name}` : row.name)
                              }
                            >
                              <Folder className="h-4 w-4 shrink-0 text-amber-600" />
                              {row.name}
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1.5">
                              <FileText className="h-4 w-4 shrink-0 text-slate-500" />
                              {row.name}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{row.type}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{row.size}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {row.type !== "dir" && (
                              <>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-2"
                                  onClick={() => void downloadFile(row.name)}
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-2"
                                  onClick={() => void openRead(row.name)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                  <span className="sr-only">编辑</span>
                                </Button>
                              </>
                            )}
                            {canWriteK8s && row.type !== "dir" && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2"
                                onClick={() => {
                                  setRenameFrom(row.name);
                                  setRenameTo(row.name);
                                  setRenameOpen(true);
                                }}
                              >
                                改名
                              </Button>
                            )}
                            {canWriteK8s && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 text-red-600"
                                onClick={() => {
                                  setDeleteName(row.name);
                                  setDeleteOpen(true);
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}

      <Dialog
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o);
          if (!o) {
            setEditLoading(false);
            setEditLoadError(null);
          }
        }}
      >
        <DialogContent className="flex max-h-[min(92vh,900px)] w-[min(96vw,1280px)] max-w-[min(96vw,1280px)] flex-col gap-3">
          <DialogHeader className="shrink-0 space-y-1">
            <DialogTitle className="font-mono text-sm">编辑 {editName}</DialogTitle>
            <p className="text-xs font-normal text-slate-500">
              大文件通过 Pod exec 读取可能较慢；打开期间请稍候。JSON / YAML / Markdown 已启用语法高亮。
            </p>
          </DialogHeader>
          <div className="relative min-h-[min(70vh,640px)] flex-1 overflow-hidden rounded-lg border border-slate-200 bg-slate-50/80">
            {editLoading ? (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/85 backdrop-blur-[1px]">
                <Loader2 className="h-10 w-10 animate-spin text-violet-600" aria-hidden />
                <p className="text-sm font-medium text-slate-800">正在读取文件…</p>
                <p className="max-w-sm px-4 text-center text-xs text-slate-500">
                  若长时间无响应，可能是卷较大或 Pod 负载高，请勿重复刷新页面。
                </p>
              </div>
            ) : null}
            {editLoadError && !editLoading ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/90 p-4">
                <p className="text-center text-sm text-red-700">{editLoadError}</p>
              </div>
            ) : null}
            <CodeMirror
              value={editText}
              height="min(70vh, 640px)"
              theme="light"
              extensions={editExtensions}
              onChange={setEditText}
              readOnly={!canWriteK8s || editLoading}
              editable={canWriteK8s && !editLoading}
              basicSetup={{
                lineNumbers: true,
                foldGutter: true,
                highlightActiveLine: canWriteK8s && !editLoading,
                bracketMatching: true,
                closeBrackets: true,
                indentOnInput: true,
              }}
            />
          </div>
          <DialogFooter className="shrink-0">
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
              取消
            </Button>
            {canWriteK8s && (
              <Button
                type="button"
                disabled={saveMut.isPending || editLoading || Boolean(editLoadError)}
                onClick={() => saveMut.mutate()}
              >
                {saveMut.isPending ? "保存中…" : "保存"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mkdirOpen} onOpenChange={setMkdirOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建目录</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>目录名</Label>
            <Input value={mkdirName} onChange={(e) => setMkdirName(e.target.value)} placeholder="my-dir" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMkdirOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              disabled={mkdirMut.isPending || !mkdirName.trim()}
              onClick={() => mkdirMut.mutate()}
            >
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重命名</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>新名称</Label>
            <Input value={renameTo} onChange={(e) => setRenameTo(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRenameOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              disabled={renameMut.isPending || !renameTo.trim()}
              onClick={() => renameMut.mutate()}
            >
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除文件</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除「{deleteName}」？此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteName(null)}>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-600/90"
              onClick={() => {
                if (deleteName) delMut.mutate(deleteName);
                setDeleteName(null);
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

export default ClusterPVCFilesPage;

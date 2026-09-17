import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Folder, FolderUp, HardDriveDownload, ChevronRight, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiGetJson } from "@/lib/api";
import type { CloudHostSSHSettings } from "./CloudHostSshTerminal";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

type SftpListResponse = {
  path: string;
  entries: Array<{
    name: string;
    type: string;
    size: number;
    modTime?: string;
  }>;
};

function joinRemotePath(base: string, name: string): string {
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  if (b === "" || b === "/") return "/" + name;
  return b + "/" + name;
}

function parentRemotePath(p: string): string {
  const t = p.replace(/\/+$/, "") || "/";
  if (t === "/" || t === "") return "/";
  const i = t.lastIndexOf("/");
  if (i <= 0) return "/";
  return t.slice(0, i) || "/";
}

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MiB`;
}

async function downloadSftpFile(hostId: string, remotePath: string): Promise<void> {
  const qs = new URLSearchParams({ path: remotePath });
  const res = await fetch(
    `${API_BASE}/api/cloud-hosts/${encodeURIComponent(hostId)}/sftp/download?${qs}`,
    { credentials: "same-origin" }
  );
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = (await res.json()) as { error?: string };
      if (j?.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = remotePath.split("/").pop() || "download";
  a.click();
  URL.revokeObjectURL(url);
}

type CloudHostSftpPanelProps = {
  hostId: string;
  displayName: string;
};

const CloudHostSftpPanel: React.FC<CloudHostSftpPanelProps> = ({ hostId, displayName }) => {
  const queryClient = useQueryClient();
  const [path, setPath] = useState("/");

  const sshQ = useQuery({
    queryKey: ["cloud-host-ssh-settings", hostId],
    queryFn: ({ signal }) =>
      apiGetJson<CloudHostSSHSettings>(`/api/cloud-hosts/${encodeURIComponent(hostId)}/ssh-settings`, { signal }),
  });

  const listQ = useQuery({
    queryKey: ["cloud-host-sftp-list", hostId, path],
    queryFn: ({ signal }) => {
      const qs = new URLSearchParams({ path });
      return apiGetJson<SftpListResponse>(
        `/api/cloud-hosts/${encodeURIComponent(hostId)}/sftp/list?${qs.toString()}`,
        { signal }
      );
    },
    enabled: sshQ.data?.canConnect === true,
  });

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("path", path);
      const res = await fetch(
        `${API_BASE}/api/cloud-hosts/${encodeURIComponent(hostId)}/sftp/upload`,
        { method: "POST", body: fd, credentials: "same-origin" }
      );
      if (!res.ok) {
        let msg = res.statusText;
        try {
          const j = (await res.json()) as { error?: string };
          if (j?.error) msg = j.error;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      return res.json() as Promise<{ ok: boolean; path: string }>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["cloud-host-sftp-list", hostId] });
    },
  });

  const downloadMut = useMutation({
    mutationFn: (remotePath: string) => downloadSftpFile(hostId, remotePath),
  });

  const sftpOk = sshQ.data?.canConnect === true;

  const crumbs = useMemo(() => {
    const p = path.replace(/\/+$/, "") || "/";
    if (p === "/") return [{ label: "根", path: "/" }];
    const parts = p.split("/").filter(Boolean);
    const out: { label: string; path: string }[] = [{ label: "根", path: "/" }];
    let acc = "";
    for (const part of parts) {
      acc += "/" + part;
      out.push({ label: part, path: acc });
    }
    return out;
  }, [path]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="rounded-xl border border-violet-100 bg-white/90 px-4 py-3 shadow-sm">
        <p className="text-sm font-medium text-slate-900">{displayName}</p>
        <p className="mt-1 font-mono text-xs text-violet-800/90">
          SFTP 与 SSH 共用同一连接：平台先建立 SSH，再在其上打开 SFTP 子系统；凭据与「SSH」分栏一致。
        </p>
        {sshQ.data && (
          <p className="mt-1 font-mono text-xs text-slate-600">
            {sshQ.data.sshHost}:{sshQ.data.sshPort || 22}
          </p>
        )}
      </div>

      {!sftpOk && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          当前无法使用 SFTP：请先在「SSH」分栏连接过终端（全局或已保存 SSH 凭据）后再使用本页。
        </div>
      )}

      {sftpOk && (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1"
              onClick={() => setPath("/")}
            >
              <Home className="h-3.5 w-3.5" />
              根目录
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              disabled={path === "/"}
              onClick={() => setPath(parentRemotePath(path))}
            >
              上级
            </Button>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5 font-mono text-[11px] text-slate-500">
              {crumbs.map((c, i) => (
                <React.Fragment key={c.path}>
                  {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 opacity-50" />}
                  <button
                    type="button"
                    className="truncate hover:text-violet-700 hover:underline"
                    onClick={() => setPath(c.path)}
                  >
                    {c.label}
                  </button>
                </React.Fragment>
              ))}
            </div>
            <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-input bg-secondary px-3 text-xs font-medium text-secondary-foreground shadow-xs transition-colors hover:bg-secondary/80">
              <input
                type="file"
                className="sr-only"
                disabled={uploadMut.isPending}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) uploadMut.mutate(f);
                }}
              />
              <FolderUp className="h-3.5 w-3.5" />
              上传到当前目录
            </label>
          </div>
          <p className="text-[11px] text-slate-500">
            点击文件夹进入；文件可下载。上传写入{" "}
            <code className="rounded bg-slate-100 px-1">{path}</code>。
          </p>

          {listQ.isLoading && <p className="text-sm text-slate-500">加载列表…</p>}
          {listQ.error && (
            <p className="text-sm text-red-600">{(listQ.error as Error).message}</p>
          )}

          {listQ.data && (
            <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>名称</TableHead>
                    <TableHead className="w-28">类型</TableHead>
                    <TableHead className="w-28 text-right">大小</TableHead>
                    <TableHead className="w-32 text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listQ.data.entries.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-slate-500">
                        空目录
                      </TableCell>
                    </TableRow>
                  )}
                  {listQ.data.entries.map((e) => {
                    const full = joinRemotePath(listQ.data.path, e.name);
                    const isDir = e.type === "folder" || e.type === "link";
                    return (
                      <TableRow key={e.name}>
                        <TableCell className="font-mono text-xs">
                          {isDir ? (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-violet-700 hover:underline"
                              onClick={() => setPath(full)}
                            >
                              <Folder className="h-3.5 w-3.5" />
                              {e.name}
                            </button>
                          ) : (
                            e.name
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">{e.type}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums text-slate-600">
                          {isDir ? "—" : fmtSize(e.size)}
                        </TableCell>
                        <TableCell className="text-right">
                          {!isDir && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1"
                              disabled={downloadMut.isPending}
                              onClick={() => downloadMut.mutate(full)}
                            >
                              <HardDriveDownload className="h-3.5 w-3.5" />
                              下载
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {downloadMut.isError && (
            <p className="text-xs text-red-600">{(downloadMut.error as Error).message}</p>
          )}
          {uploadMut.isError && (
            <p className="text-xs text-red-600">{(uploadMut.error as Error).message}</p>
          )}
        </div>
      )}
    </div>
  );
};

export default CloudHostSftpPanel;

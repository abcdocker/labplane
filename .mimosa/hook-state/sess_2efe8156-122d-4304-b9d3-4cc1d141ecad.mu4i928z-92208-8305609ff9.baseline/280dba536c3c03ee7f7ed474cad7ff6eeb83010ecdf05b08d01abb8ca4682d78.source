import React, { useEffect, useRef, useState } from "react";
import { Folder, File, ArrowUp, RefreshCw, Trash2, Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { wsUrlForApiPath } from "@/lib/api";

type Entry = {
  name: string;
  size: number;
  isDir: boolean;
  modTime?: number;
};

export type BastionSftpTarget =
  | { kind: "vm"; moref: string }
  | { kind: "extra"; id: string };

function sftpWsUrl(target: BastionSftpTarget): string {
  if (target.kind === "vm") {
    return wsUrlForApiPath(`/api/vcenter/vms/${encodeURIComponent(target.moref)}/sftp/ws`);
  }
  return wsUrlForApiPath(`/api/vcenter/bastion/extra/${encodeURIComponent(target.id)}/sftp/ws`);
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

type Props = { target: BastionSftpTarget };

const VCenterBastionSftpPanel: React.FC<Props> = ({ target }) => {
  const [path, setPath] = useState("/");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const pathRef = useRef("/");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const targetKey = target.kind === "vm" ? `vm:${target.moref}` : `extra:${target.id}`;

  useEffect(() => {
    pathRef.current = path;
  }, [path]);

  useEffect(() => {
    setPath("/");
    pathRef.current = "/";
    setEntries([]);
    setErr(null);

    const ws = new WebSocket(sftpWsUrl(target));
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(String(ev.data)) as {
          type?: string;
          message?: string;
          entries?: Entry[];
          path?: string;
          dataB64?: string;
        };
        if (data.type === "error") {
          setErr(data.message ?? "错误");
          setBusy(false);
          return;
        }
        if (data.type === "listed" && data.entries) {
          const p = data.path ?? pathRef.current;
          pathRef.current = p;
          setPath(p);
          setEntries(data.entries);
          setBusy(false);
          return;
        }
        if (data.type === "file" && data.dataB64 != null && data.path) {
          const raw = Uint8Array.from(atob(data.dataB64), (c) => c.charCodeAt(0));
          const blob = new Blob([raw]);
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = data.path.split("/").pop() ?? "download";
          a.click();
          URL.revokeObjectURL(a.href);
          setBusy(false);
          return;
        }
        if (data.type === "written" || data.type === "ok") {
          setBusy(false);
          ws.send(JSON.stringify({ op: "list", path: pathRef.current }));
        }
      } catch {
        setErr("解析消息失败");
        setBusy(false);
      }
    };

    ws.onopen = () => {
      ws.send(JSON.stringify({ op: "list", path: "/" }));
    };
    ws.onerror = () => {
      setErr("WebSocket 失败（需已登录且有权访问该主机）");
      setBusy(false);
    };

    return () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      wsRef.current = null;
    };
  }, [targetKey, target]);

  const send = (obj: Record<string, unknown>) => {
    const w = wsRef.current;
    if (w?.readyState === WebSocket.OPEN) {
      w.send(JSON.stringify(obj));
    }
  };

  const refresh = () => {
    setBusy(true);
    send({ op: "list", path: pathRef.current });
  };

  const cd = (name: string) => {
    const base = pathRef.current;
    const next = base.endsWith("/") ? base + name : `${base}/${name}`;
    setBusy(true);
    send({ op: "list", path: next });
  };

  const goUp = () => {
    const base = pathRef.current;
    if (base === "/" || base === "") return;
    const parts = base.replace(/\/+$/, "").split("/").filter(Boolean);
    parts.pop();
    const next = parts.length === 0 ? "/" : "/" + parts.join("/");
    setBusy(true);
    send({ op: "list", path: next });
  };

  const downloadFile = (name: string) => {
    const base = pathRef.current;
    const full = base.endsWith("/") ? base + name : `${base}/${name}`;
    setBusy(true);
    send({ op: "readFile", path: full });
  };

  const removeEntry = (name: string) => {
    const base = pathRef.current;
    const full = base.endsWith("/") ? base + name : `${base}/${name}`;
    if (!window.confirm(`删除 ${full} ?`)) return;
    setBusy(true);
    send({ op: "remove", path: full });
  };

  const onPickUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const base = pathRef.current;
    const full = base.endsWith("/") ? base + f.name : `${base}/${f.name}`;
    const buf = new Uint8Array(await f.arrayBuffer());
    setBusy(true);
    send({
      op: "writeFile",
      path: full,
      dataB64: uint8ToBase64(buf),
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border border-slate-700 bg-[#0a0d12] text-slate-200">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-700 px-3 py-2">
        <span className="font-mono text-xs text-slate-400">{path}</span>
        <div className="ml-auto flex flex-wrap gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 border-slate-600 bg-slate-900 text-xs"
            onClick={goUp}
            disabled={path === "/"}
          >
            <ArrowUp className="mr-1 size-3.5" />
            上级
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 border-slate-600 bg-slate-900 text-xs"
            onClick={refresh}
            disabled={busy}
          >
            <RefreshCw className="mr-1 size-3.5" />
            刷新
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 border-slate-600 bg-slate-900 text-xs"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="mr-1 size-3.5" />
            上传
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={onPickUpload}
          />
        </div>
      </div>
      {err ? (
        <div className="border-b border-red-900/50 bg-red-950/40 px-3 py-2 text-xs text-red-200">{err}</div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {entries.length === 0 && !busy ? (
          <p className="p-4 text-center text-sm text-slate-500">空目录</p>
        ) : (
          <ul className="space-y-1">
            {entries.map((en) => (
              <li
                key={en.name}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-800/80"
              >
                {en.isDir ? (
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
                    onClick={() => cd(en.name)}
                  >
                    <Folder className="size-4 shrink-0 text-amber-500/90" />
                    <span className="truncate">{en.name}</span>
                  </button>
                ) : (
                  <>
                    <File className="size-4 shrink-0 text-slate-500" />
                    <span className="min-w-0 flex-1 truncate text-sm">{en.name}</span>
                    <span className="shrink-0 text-[10px] text-slate-500">{en.size} B</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-slate-300"
                      onClick={() => downloadFile(en.name)}
                    >
                      <Download className="size-3.5" />
                    </Button>
                  </>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 shrink-0 px-2 text-red-400 hover:text-red-300"
                  onClick={() => removeEntry(en.name)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default VCenterBastionSftpPanel;

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Cloud, FolderOpen, Globe, Loader2, Server } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGetJson } from "@/lib/api";

function fmtErr(e: unknown) {
  return (e as Error).message ?? String(e);
}

function formatBytes(b: number) {
  if (b === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

type Account = { id: number; name: string; provider: string };

type UpyunFile = {
  name: string;
  type: string; // file | folder
  length: number;
  last_modified: string;
};

type UpyunServiceInfo = {
  serviceName: string;
  usageBytes: number;
};

type UpyunDomain = {
  domain: string;
  platform: string;
  status: string;
  cname: string;
};

export default function DnsUpyun() {
  const [accountId, setAccountId] = useState<string>("");
  const [tab, setTab] = useState<"uss" | "cdn">("uss");
  const [path, setPath] = useState<string>("/");

  const accountsQ = useQuery({
    queryKey: ["dns-accounts"],
    queryFn: ({ signal }) => apiGetJson<{ accounts: Account[] }>("/api/dns/accounts", { signal }),
  });
  const upyunAccounts = (accountsQ.data?.accounts ?? []).filter((a) => a.provider === "upyun");

  const infoQ = useQuery({
    queryKey: ["upyun-cloud-uss-info", accountId],
    queryFn: ({ signal }) => apiGetJson<UpyunServiceInfo>(`/api/upyun-cloud/uss/info?account_id=${accountId}`, { signal }),
    enabled: accountId !== "" && tab === "uss",
  });

  const filesQ = useQuery({
    queryKey: ["upyun-cloud-uss-files", accountId, path],
    queryFn: ({ signal }) =>
      apiGetJson<{ items: UpyunFile[]; nextIter: string }>(
        `/api/upyun-cloud/uss/files?account_id=${accountId}&path=${encodeURIComponent(path)}`,
        { signal }
      ),
    enabled: accountId !== "" && tab === "uss",
  });

  const cdnQ = useQuery({
    queryKey: ["upyun-cloud-cdn-domains", accountId],
    queryFn: ({ signal }) => apiGetJson<{ domains: UpyunDomain[] }>(`/api/upyun-cloud/cdn/domains?account_id=${accountId}`, { signal }),
    enabled: accountId !== "" && tab === "cdn",
  });

  const files = filesQ.data?.items ?? [];
  const domains = cdnQ.data?.domains ?? [];

  const enterFolder = (name: string) => {
    setPath((p) => (p.endsWith("/") ? p + name : p + "/" + name) + "/");
  };

  const goUp = () => {
    if (path === "/") return;
    const parts = path.replace(/\/$/, "").split("/").filter(Boolean);
    parts.pop();
    setPath(parts.length ? "/" + parts.join("/") + "/" : "/");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">又拍云</h2>
          <p className="text-sm text-slate-500">查看又拍云对象存储 USS 与 CDN 域名</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-slate-200 bg-white p-1">
            <button
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === "uss" ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50"}`}
              onClick={() => setTab("uss")}
            >
              <Server className="inline h-3.5 w-3.5 mr-1" /> USS
            </button>
            <button
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === "cdn" ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50"}`}
              onClick={() => setTab("cdn")}
            >
              <Cloud className="inline h-3.5 w-3.5 mr-1" /> CDN
            </button>
          </div>
          <div className="w-56">
            <Select value={accountId} onValueChange={(v) => { setAccountId(v); setPath("/"); }}>
              <SelectTrigger>
                <SelectValue placeholder="选择又拍云账号" />
              </SelectTrigger>
              <SelectContent>
                {upyunAccounts.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {!accountId && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm text-slate-400">
          请选择又拍云账号
        </div>
      )}

      {tab === "uss" && accountId && (
        <div className="space-y-4">
          {infoQ.isSuccess && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-500">服务名称</p>
              <p className="text-lg font-semibold text-slate-800">{infoQ.data.serviceName}</p>
              <p className="mt-2 text-sm text-slate-500">已用空间</p>
              <p className="text-lg font-semibold text-slate-800">{formatBytes(infoQ.data.usageBytes ?? 0)}</p>
            </div>
          )}

          <div className="flex items-center gap-2">
            {path !== "/" && (
              <button className="text-sm text-pink-600 hover:underline" onClick={goUp}>← 上级目录</button>
            )}
            <span className="text-sm text-slate-400">/</span>
            <span className="text-sm font-medium text-slate-800">{path}</span>
          </div>

          {filesQ.isLoading && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> 加载文件…
            </div>
          )}
          {filesQ.isError && (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertCircle className="h-4 w-4" /> {fmtErr(filesQ.error)}
            </div>
          )}

          {files.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead>名称</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead>大小</TableHead>
                    <TableHead>最后修改</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {files.map((f) => (
                    <TableRow key={f.name}>
                      <TableCell className="font-medium text-slate-800">
                        <div className="flex items-center gap-2">
                          {f.type === "folder" ? (
                            <FolderOpen className="h-4 w-4 text-amber-500" />
                          ) : (
                            <Globe className="h-4 w-4 text-pink-500" />
                          )}
                          {f.type === "folder" ? (
                            <button className="hover:underline" onClick={() => enterFolder(f.name)}>{f.name}</button>
                          ) : (
                            <span>{f.name}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">{f.type || "—"}</TableCell>
                      <TableCell className="text-sm text-slate-600">{f.type === "folder" ? "—" : formatBytes(f.length ?? 0)}</TableCell>
                      <TableCell className="text-sm text-slate-600">{f.last_modified || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {!filesQ.isLoading && files.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm text-slate-400">
              当前目录下暂无文件
            </div>
          )}
        </div>
      )}

      {tab === "cdn" && accountId && (
        <div className="space-y-4">
          {cdnQ.isLoading && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> 加载 CDN 域名…
            </div>
          )}
          {cdnQ.isError && (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertCircle className="h-4 w-4" /> {fmtErr(cdnQ.error)}
            </div>
          )}
          {domains.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead>域名</TableHead>
                    <TableHead>平台</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>CNAME</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {domains.map((d) => (
                    <TableRow key={d.domain}>
                      <TableCell className="font-medium text-slate-800 flex items-center gap-2">
                        <Globe className="h-4 w-4 text-pink-500" /> {d.domain}
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">{d.platform || "—"}</TableCell>
                      <TableCell className="text-sm text-slate-600">{d.status || "—"}</TableCell>
                      <TableCell className="text-sm text-slate-600">{d.cname || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {!cdnQ.isLoading && domains.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm text-slate-400">
              该账号下暂无 CDN 域名
            </div>
          )}
        </div>
      )}
    </div>
  );
}

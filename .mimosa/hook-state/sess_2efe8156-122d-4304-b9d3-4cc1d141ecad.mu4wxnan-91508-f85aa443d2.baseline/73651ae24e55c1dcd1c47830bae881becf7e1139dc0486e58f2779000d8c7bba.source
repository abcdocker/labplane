import React, { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, AlertCircle, FolderOpen, Upload, Trash2, Download, ChevronLeft, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiDelete, apiGetJson, apiPostRaw } from "@/lib/api";
import { useAuth } from "@/auth/auth-context";
import { toast } from "sonner";

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

type Bucket = {
  Name: string;
  Location: string;
  CreateTime: string;
};

type COSObjectItem = {
  Key: string;
  LastModified: string;
  Size: number;
  ETag: string;
};

export default function TencentCloudCOS() {
  const { status: auth } = useAuth();
  const isViewer = auth?.role !== "admin";
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [accountId, setAccountId] = useState<string>("");
  const [bucketHost, setBucketHost] = useState<string>("");
  const [region, setRegion] = useState<string>("");
  const [prefix, setPrefix] = useState<string>("");
  const [currentPrefix, setCurrentPrefix] = useState<string>("");

  const accountsQ = useQuery({
    queryKey: ["dns-accounts"],
    queryFn: ({ signal }) => apiGetJson<{ accounts: Account[] }>("/api/dns/accounts", { signal }),
  });
  const tencentAccounts = (accountsQ.data?.accounts ?? []).filter((a) =>
    ["tencent", "tencentcloud", "dnspod"].includes(a.provider)
  );

  const bucketsQ = useQuery({
    queryKey: ["tencent-cloud-cos-buckets", accountId],
    queryFn: ({ signal }) => apiGetJson<{ buckets: Bucket[] }>(`/api/tencent-cloud/cos/buckets?account_id=${accountId}`, { signal }),
    enabled: accountId !== "",
  });

  const objectsQ = useQuery({
    queryKey: ["tencent-cloud-cos-objects", accountId, bucketHost, region, currentPrefix],
    queryFn: ({ signal }) =>
      apiGetJson<{ name: string; prefix: string; isTruncated: boolean; nextContinuationToken: string; contents: COSObjectItem[] }>(
        `/api/tencent-cloud/cos/objects?account_id=${accountId}&bucket=${encodeURIComponent(bucketHost)}&region=${encodeURIComponent(region)}&prefix=${encodeURIComponent(currentPrefix)}`,
        { signal }
      ),
    enabled: accountId !== "" && bucketHost !== "" && region !== "",
  });

  const uploadMut = useMutation({
    mutationFn: async ({ key, body, contentType }: { key: string; body: ArrayBuffer; contentType: string }) => {
      return apiPostRaw(`/api/tencent-cloud/cos/objects?account_id=${accountId}&bucket=${encodeURIComponent(bucketHost)}&region=${encodeURIComponent(region)}&key=${encodeURIComponent(key)}`, new Uint8Array(body), contentType);
    },
    onSuccess: () => {
      toast.success("上传成功");
      void qc.invalidateQueries({ queryKey: ["tencent-cloud-cos-objects"] });
    },
    onError: (e) => toast.error(fmtErr(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (key: string) =>
      apiDelete(`/api/tencent-cloud/cos/objects?account_id=${accountId}&bucket=${encodeURIComponent(bucketHost)}&region=${encodeURIComponent(region)}&key=${encodeURIComponent(key)}`),
    onSuccess: () => {
      toast.success("删除成功");
      void qc.invalidateQueries({ queryKey: ["tencent-cloud-cos-objects"] });
    },
    onError: (e) => toast.error(fmtErr(e)),
  });

  const accounts = tencentAccounts;
  const buckets = bucketsQ.data?.buckets ?? [];
  const objects = objectsQ.data?.contents ?? [];

  const enterBucket = (b: Bucket) => {
    setBucketHost(`${b.Name}.cos.${b.Location}.myqcloud.com`);
    setRegion(b.Location);
    setCurrentPrefix("");
  };

  const enterFolder = (key: string) => {
    setCurrentPrefix(key);
  };

  const goUp = () => {
    if (!currentPrefix) return;
    const parts = currentPrefix.replace(/\/$/, "").split("/");
    parts.pop();
    setCurrentPrefix(parts.length ? parts.join("/") + "/" : "");
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const key = currentPrefix + file.name;
    const body = await file.arrayBuffer();
    uploadMut.mutate({ key, body, contentType: file.type || "application/octet-stream" });
    e.target.value = "";
  };

  const handleDownload = (key: string) => {
    const url = `/api/tencent-cloud/cos/objects/download?account_id=${accountId}&bucket=${encodeURIComponent(bucketHost)}&region=${encodeURIComponent(region)}&key=${encodeURIComponent(key)}&mode=redirect`;
    window.open(url, "_blank");
  };

  if (!bucketHost) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">对象存储 COS</h2>
            <p className="text-sm text-slate-500">查看和管理腾讯云 COS 存储桶与对象</p>
          </div>
          <div className="w-64">
            <Select value={accountId} onValueChange={(v) => { setAccountId(v); setBucketHost(""); }}>
              <SelectTrigger>
                <SelectValue placeholder="选择腾讯云账号" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {bucketsQ.isLoading && <div className="text-sm text-slate-500 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> 加载中…</div>}
        {bucketsQ.isError && <div className="text-sm text-red-600 flex items-center gap-2"><AlertCircle className="h-4 w-4" /> {fmtErr(bucketsQ.error)}</div>}

        {accountId && !bucketsQ.isLoading && buckets.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm text-slate-400">
            该账号下暂无存储桶
          </div>
        )}

        {buckets.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {buckets.map((b) => (
              <div key={b.Name} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm cursor-pointer hover:border-emerald-300 transition-colors" onClick={() => enterBucket(b)}>
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-5 w-5 text-emerald-500" />
                  <span className="font-medium text-slate-800">{b.Name}</span>
                </div>
                <div className="mt-2 text-xs text-slate-500">地域: {b.Location}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setBucketHost("")}>
            <ChevronLeft className="h-4 w-4" /> 返回存储桶列表
          </Button>
          <span className="text-sm text-slate-500">/</span>
          <span className="text-sm font-medium text-slate-800">{bucketHost}</span>
          {currentPrefix && <span className="text-sm text-slate-500">/ {currentPrefix}</span>}
        </div>
        <div className="flex gap-2">
          {currentPrefix && (
            <Button variant="outline" size="sm" onClick={goUp}>
              <ChevronLeft className="h-4 w-4 mr-1" /> 上级目录
            </Button>
          )}
          {!isViewer && (
            <>
              <input ref={fileRef} type="file" className="hidden" onChange={handleFileChange} />
              <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploadMut.isPending}>
                {uploadMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                上传文件
              </Button>
            </>
          )}
        </div>
      </div>

      {objectsQ.isLoading && <div className="text-sm text-slate-500 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> 加载中…</div>}
      {objectsQ.isError && <div className="text-sm text-red-600 flex items-center gap-2"><AlertCircle className="h-4 w-4" /> {fmtErr(objectsQ.error)}</div>}

      {!objectsQ.isLoading && objects.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm text-slate-400">
          当前目录下暂无对象
        </div>
      )}

      {objects.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80">
                <TableHead>名称</TableHead>
                <TableHead>大小</TableHead>
                <TableHead>最后修改</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {objects.map((obj) => {
                const isFolder = obj.Key.endsWith("/");
                return (
                  <TableRow key={obj.Key}>
                    <TableCell className="font-medium text-slate-800">
                      <div className="flex items-center gap-2">
                        {isFolder ? <FolderOpen className="h-4 w-4 text-amber-500" /> : <FileText className="h-4 w-4 text-slate-400" />}
                        <span className="text-sm">{obj.Key.replace(currentPrefix, "")}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">{isFolder ? "—" : formatBytes(obj.Size)}</TableCell>
                    <TableCell className="text-sm text-slate-600">{obj.LastModified ? obj.LastModified.replace("T", " ").slice(0, 19) : "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isFolder ? (
                          <Button variant="ghost" size="sm" onClick={() => enterFolder(obj.Key)}>
                            <FolderOpen className="h-4 w-4" />
                          </Button>
                        ) : (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => handleDownload(obj.Key)}>
                              <Download className="h-4 w-4" />
                            </Button>
                            {!isViewer && (
                              <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700" onClick={() => deleteMut.mutate(obj.Key)} disabled={deleteMut.isPending}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

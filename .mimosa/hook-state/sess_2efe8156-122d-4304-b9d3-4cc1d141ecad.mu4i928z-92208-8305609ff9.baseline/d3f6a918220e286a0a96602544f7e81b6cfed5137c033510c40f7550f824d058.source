import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, AlertCircle, KeyRound, CheckCircle2, XCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { apiGetJson } from "@/lib/api";
import { CloudAuthGuide } from "./CloudAuthGuide";

function fmtErr(e: unknown) {
  return (e as Error).message ?? String(e);
}

type Account = { id: number; name: string; provider: string };

type CAMKey = {
  AccessKeyId: string;
  CreateTime: string;
  Status: string;
};

export default function TencentCloudCAM() {
  const [accountId, setAccountId] = useState<string>("");

  const accountsQ = useQuery({
    queryKey: ["dns-accounts"],
    queryFn: ({ signal }) => apiGetJson<{ accounts: Account[] }>("/api/dns/accounts", { signal }),
  });
  const tencentAccounts = (accountsQ.data?.accounts ?? []).filter((a) =>
    ["tencent", "tencentcloud", "dnspod"].includes(a.provider)
  );

  useEffect(() => {
    if (tencentAccounts.length > 0 && !accountId) {
      setAccountId(String(tencentAccounts[0].id));
    }
  }, [tencentAccounts, accountId]);

  const keysQ = useQuery({
    queryKey: ["tencent-cloud-cam-keys", accountId],
    queryFn: ({ signal }) =>
      apiGetJson<{ keys: CAMKey[] }>(`/api/tencent-cloud/cam/keys?account_id=${accountId}`, { signal }),
    enabled: accountId !== "",
  });

  const appIdQ = useQuery({
    queryKey: ["tencent-cloud-cam-appid", accountId],
    queryFn: ({ signal }) =>
      apiGetJson<{ appId: string }>(`/api/tencent-cloud/cam/appid?account_id=${accountId}`, { signal }),
    enabled: accountId !== "",
  });

  const keys = keysQ.data?.keys ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">访问密钥 CAM</h2>
          <p className="text-sm text-slate-500">查看腾讯云账号的 API 访问密钥（SecretId 不是 APPID）</p>
        </div>
        <div className="w-56">
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger>
              <SelectValue placeholder="选择腾讯云账号" />
            </SelectTrigger>
            <SelectContent>
              {tencentAccounts.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <CloudAuthGuide provider="tencent" />

      {appIdQ.isSuccess && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">腾讯云账号 APPID（UIN）</p>
          <p className="text-lg font-semibold text-slate-800">{appIdQ.data.appId || "—"}</p>
        </div>
      )}

      {keysQ.isLoading && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> 加载中…
        </div>
      )}
      {keysQ.isError && (
        <div className="flex items-center gap-2 text-sm text-red-600">
          <AlertCircle className="h-4 w-4" /> {fmtErr(keysQ.error)}
        </div>
      )}

      {keys.length === 0 && !keysQ.isLoading && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm text-slate-400">
          该账号下暂无访问密钥
        </div>
      )}

      {keys.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80">
                <TableHead>AccessKey ID</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead>状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((k) => (
                <TableRow key={k.AccessKeyId}>
                  <TableCell className="font-mono text-sm text-slate-800">{k.AccessKeyId}</TableCell>
                  <TableCell className="text-sm text-slate-600">{k.CreateTime ? k.CreateTime.replace("T", " ").slice(0, 19) : "—"}</TableCell>
                  <TableCell>
                    {k.Status === "Active" ? (
                      <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700">
                        <CheckCircle2 className="mr-1 h-3 w-3" /> 启用中
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs bg-slate-50 text-slate-700">
                        <XCircle className="mr-1 h-3 w-3" /> 已禁用
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

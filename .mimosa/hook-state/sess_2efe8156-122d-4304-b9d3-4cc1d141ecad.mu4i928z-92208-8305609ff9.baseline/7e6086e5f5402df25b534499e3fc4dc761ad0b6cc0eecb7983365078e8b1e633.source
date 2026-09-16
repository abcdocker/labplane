import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Server, AlertCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { apiGetJson } from "@/lib/api";

function fmtErr(e: unknown) {
  return (e as Error).message ?? String(e);
}

type Instance = {
  InstanceId: string;
  InstanceName: string;
  PublicAddresses?: string[];
  PrivateAddresses?: string[];
  Zone: string;
  OsName: string;
  CPU: number;
  Memory: number;
  InstanceState: string;
  CreatedTime: string;
  ExpiredTime: string;
};

type Account = {
  id: number;
  name: string;
  provider: string;
};

export default function TencentCloudLighthouse() {
  const [accountId, setAccountId] = useState<string>("");

  const accountsQ = useQuery({
    queryKey: ["dns-accounts"],
    queryFn: ({ signal }) => apiGetJson<{ accounts: Account[] }>("/api/dns/accounts", { signal }),
  });
  const tencentAccounts = (accountsQ.data?.accounts ?? []).filter((a) =>
    ["tencent", "tencentcloud", "dnspod"].includes(a.provider)
  );

  const instancesQ = useQuery({
    queryKey: ["tencent-cloud-lighthouse", accountId],
    queryFn: ({ signal }) =>
      apiGetJson<{ instances: Instance[] }>(`/api/tencent-cloud/lighthouse/instances?account_id=${accountId}`, { signal }),
    enabled: accountId !== "",
  });

  const accounts = tencentAccounts;
  const instances = instancesQ.data?.instances ?? [];

  const stateColor = (s: string) => {
    if (s === "RUNNING") return "bg-emerald-50 text-emerald-700";
    if (s === "STOPPED") return "bg-slate-50 text-slate-700";
    return "bg-amber-50 text-amber-700";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">轻量云服务器</h2>
          <p className="text-sm text-slate-500">查看腾讯云轻量应用服务器实例信息</p>
        </div>
        <div className="w-64">
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger>
              <SelectValue placeholder="选择腾讯云账号" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {instancesQ.isLoading && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> 加载中…
        </div>
      )}
      {instancesQ.isError && (
        <div className="flex items-center gap-2 text-sm text-red-600">
          <AlertCircle className="h-4 w-4" /> {fmtErr(instancesQ.error)}
        </div>
      )}

      {accountId && !instancesQ.isLoading && instances.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm text-slate-400">
          该账号下暂无轻量云服务器实例
        </div>
      )}

      {instances.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80">
                <TableHead>实例名称</TableHead>
                <TableHead>实例 ID</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>公网 IP</TableHead>
                <TableHead>配置</TableHead>
                <TableHead>可用区</TableHead>
                <TableHead>系统</TableHead>
                <TableHead>到期时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {instances.map((inst) => (
                <TableRow key={inst.InstanceId}>
                  <TableCell className="font-medium text-slate-800">{inst.InstanceName}</TableCell>
                  <TableCell className="text-xs text-slate-500">{inst.InstanceId}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${stateColor(inst.InstanceState)}`}>
                      {inst.InstanceState}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">
                    {inst.PublicAddresses?.join(", ") || "—"}
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">{inst.CPU}核 / {inst.Memory}GB</TableCell>
                  <TableCell className="text-sm text-slate-600">{inst.Zone}</TableCell>
                  <TableCell className="text-sm text-slate-600">{inst.OsName}</TableCell>
                  <TableCell className="text-sm text-slate-600">{inst.ExpiredTime ? inst.ExpiredTime.replace("T", " ").slice(0, 19) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

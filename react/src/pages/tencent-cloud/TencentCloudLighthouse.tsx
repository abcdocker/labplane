import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiGetJson, apiPostJson, ApiHttpError } from "@/lib/api";
import { CloudAuthGuide } from "./CloudAuthGuide";

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
  const qc = useQueryClient();
  const [accountId, setAccountId] = useState<string>("");
  const [actionBusy, setActionBusy] = useState<string | null>(null);

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

  const instancesQ = useQuery({
    queryKey: ["tencent-cloud-lighthouse", accountId],
    queryFn: ({ signal }) =>
      apiGetJson<{ instances: Instance[] }>(`/api/tencent-cloud/lighthouse/instances?account_id=${accountId}`, { signal }),
    enabled: accountId !== "",
  });

  const instances = instancesQ.data?.instances ?? [];

  const runAction = async (inst: Instance, action: "start" | "stop" | "reboot") => {
    if (accountId === "all" || !accountId) {
      toast.error("请先选择具体账号");
      return;
    }
    const label = action === "start" ? "开机" : action === "stop" ? "关机" : "重启";
    if (!window.confirm(`确认对实例 ${inst.InstanceName}（${inst.InstanceId}）执行「${label}」？`)) return;
    setActionBusy(inst.InstanceId + action);
    try {
      await apiPostJson(`/api/tencent-cloud/lighthouse/action?account_id=${accountId}`, {
        action,
        instanceIds: [inst.InstanceId],
      });
      toast.success(`${label}指令已提交，状态同步需要数十秒`);
      setTimeout(() => void qc.invalidateQueries({ queryKey: ["tencent-cloud-lighthouse"] }), 8000);
    } catch (e) {
      toast.error(e instanceof ApiHttpError ? e.serverMessage : String(e));
    } finally {
      setActionBusy(null);
    }
  };

  const stateColor = (s: string) => {
    if (s === "RUNNING") return "bg-emerald-50 text-emerald-700";
    if (s === "STOPPED") return "bg-slate-50 text-slate-700";
    return "bg-amber-50 text-amber-700";
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">轻量云服务器</h2>
          <p className="text-sm text-slate-500">查看腾讯云轻量应用服务器实例信息</p>
        </div>
        <div className="w-56">
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger>
              <SelectValue placeholder="选择账号" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部账号</SelectItem>
              {tencentAccounts.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <CloudAuthGuide provider="tencent" />

      {tencentAccounts.length === 0 && !accountsQ.isLoading && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm text-slate-400">
          未配置腾讯云账号，请到 DNSPod → 账号管理 中添加
        </div>
      )}

      {accountsQ.isLoading && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> 加载中…
        </div>
      )}

      {instancesQ.isLoading && accountId && (
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
                {accountId === "all" && <TableHead>所属账号</TableHead>}
                <TableHead>状态</TableHead>
                <TableHead>公网 IP</TableHead>
                <TableHead>配置</TableHead>
                <TableHead>可用区</TableHead>
                <TableHead>系统</TableHead>
                <TableHead>到期时间</TableHead>
                {accountId !== "all" && <TableHead className="text-right">操作</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {instances.map((inst) => (
                <TableRow key={inst.InstanceId + (inst as any).accountName}>
                  <TableCell className="font-medium text-slate-800">{inst.InstanceName}</TableCell>
                  <TableCell className="text-xs text-slate-500">{inst.InstanceId}</TableCell>
                  {accountId === "all" && <TableCell className="text-sm text-slate-600">{(inst as any).accountName}</TableCell>}
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
                  {accountId !== "all" && (
                    <TableCell className="space-x-1 text-right">
                      {actionBusy === inst.InstanceId + "start" || actionBusy === inst.InstanceId + "stop" || actionBusy === inst.InstanceId + "reboot" ? (
                        <Loader2 className="inline h-3.5 w-3.5 animate-spin text-slate-400" />
                      ) : (
                        <>
                          {inst.InstanceState !== "RUNNING" && (
                            <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => void runAction(inst, "start")}>
                              开机
                            </Button>
                          )}
                          {inst.InstanceState === "RUNNING" && (
                            <>
                              <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => void runAction(inst, "reboot")}>
                                重启
                              </Button>
                              <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs text-red-600" onClick={() => void runAction(inst, "stop")}>
                                关机
                              </Button>
                            </>
                          )}
                        </>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

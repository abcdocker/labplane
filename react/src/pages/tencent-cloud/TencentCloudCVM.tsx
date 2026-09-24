import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
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

type Account = { id: number; name: string; provider: string };

type CVMInstance = {
  InstanceId: string;
  InstanceName: string;
  InstanceType: string;
  InstanceState: string;
  CPU: number;
  Memory: number;
  PublicIpAddresses?: string[];
  PrivateIpAddresses?: string[];
  Zone: string;
  ImageName: string;
  CreatedTime: string;
  ExpiredTime: string;
};

export default function TencentCloudCVM() {
  const qc = useQueryClient();
  const [accountId, setAccountId] = useState<string>("all");
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [monitorInst, setMonitorInst] = useState<(CVMInstance & { accountId?: string }) | null>(null);
  const [monitorMetric, setMonitorMetric] = useState("cpu");
  const [monitorPoints, setMonitorPoints] = useState<[number, number][]>([]);
  const [monitorLoading, setMonitorLoading] = useState(false);
  const [monitorErr, setMonitorErr] = useState("");

  const accountsQ = useQuery({
    queryKey: ["dns-accounts"],
    queryFn: ({ signal }) => apiGetJson<{ accounts: Account[] }>("/api/dns/accounts", { signal }),
  });
  const tencentAccounts = (accountsQ.data?.accounts ?? []).filter((a) =>
    ["tencent", "tencentcloud", "dnspod"].includes(a.provider)
  );

  const cvmQ = useQuery({
    queryKey: ["tencent-cloud-cvm", accountId],
    queryFn: async ({ signal }) => {
      if (accountId === "all") {
        const all: (CVMInstance & { accountName: string; accountId: string })[] = [];
        for (const acc of tencentAccounts) {
          try {
            const res = await apiGetJson<{ instances: CVMInstance[] }>(
              `/api/tencent-cloud/cvm/instances?account_id=${acc.id}`,
              { signal }
            );
            for (const inst of res.instances ?? []) {
              all.push({ ...inst, accountName: acc.name, accountId: String(acc.id) });
            }
          } catch {
            /* ignore per-account errors in aggregate mode */
          }
        }
        return { instances: all };
      }
      const res = await apiGetJson<{ instances: CVMInstance[] }>(
        `/api/tencent-cloud/cvm/instances?account_id=${accountId}`,
        { signal }
      );
      const acc = tencentAccounts.find((a) => String(a.id) === accountId);
      return {
        instances: (res.instances ?? []).map((i) => ({ ...i, accountName: acc?.name ?? "", accountId })),
      };
    },
    enabled: tencentAccounts.length > 0,
  });

  const runAction = async (inst: CVMInstance & { accountId?: string }, action: "start" | "stop" | "reboot") => {
    const accId = inst.accountId ?? (accountId !== "all" ? accountId : "");
    if (!accId) {
      toast.error("无法确定实例所属账号");
      return;
    }
    const label = action === "start" ? "开机" : action === "stop" ? "关机" : "重启";
    if (!window.confirm(`确认对实例 ${inst.InstanceName}（${inst.InstanceId}）执行「${label}」？`)) return;
    setActionBusy(inst.InstanceId + action);
    try {
      await apiPostJson(`/api/tencent-cloud/cvm/action?account_id=${accId}`, {
        action,
        instanceIds: [inst.InstanceId],
      });
      toast.success(`${label}指令已提交，状态同步需要数十秒`);
      setTimeout(() => void qc.invalidateQueries({ queryKey: ["tencent-cloud-cvm"] }), 8000);
    } catch (e) {
      toast.error(e instanceof ApiHttpError ? e.serverMessage : String(e));
    } finally {
      setActionBusy(null);
    }
  };

  const instances = (cvmQ.data?.instances ?? []) as (CVMInstance & { accountName: string; accountId?: string })[];

  const METRICS: { key: string; label: string; unit: string }[] = [
    { key: "cpu", label: "CPU 使用率", unit: "%" },
    { key: "mem", label: "内存使用率", unit: "%" },
    { key: "wan_out", label: "公网出带宽", unit: "bps" },
    { key: "wan_in", label: "公网入带宽", unit: "bps" },
    { key: "disk_ro", label: "磁盘读", unit: "KB/s" },
    { key: "disk_wo", label: "磁盘写", unit: "KB/s" },
  ];

  const loadMonitor = async (inst: CVMInstance & { accountId?: string }, metric: string) => {
    const accId = inst.accountId ?? (accountId !== "all" ? accountId : "");
    if (!accId) return;
    setMonitorLoading(true);
    setMonitorErr("");
    try {
      const region = (inst.Zone || "").replace(/-\d+$/, "");
      const res = await apiGetJson<{ points: [number, number][] }>(
        `/api/tencent-cloud/cvm/monitor?account_id=${accId}&instance_id=${encodeURIComponent(inst.InstanceId)}&metric=${metric}&hours=6&region=${region}`
      );
      setMonitorPoints(res.points ?? []);
    } catch (e) {
      setMonitorErr(e instanceof Error ? e.message : String(e));
    } finally {
      setMonitorLoading(false);
    }
  };

  const openMonitor = (inst: CVMInstance & { accountId?: string }) => {
    setMonitorInst(inst);
    setMonitorMetric("cpu");
    void loadMonitor(inst, "cpu");
  };

  const renderSpark = (points: [number, number][]) => {
    if (points.length < 2) return <p className="text-xs text-slate-400">暂无数据点</p>;
    const w = 560, h = 120, pad = 6;
    const vals = points.map((p) => p[1]);
    const min = Math.min(...vals), max = Math.max(...vals);
    const span = max - min || 1;
    const xy = points.map((p, i) => [
      pad + (i / (points.length - 1)) * (w - pad * 2),
      h - pad - ((p[1] - min) / span) * (h - pad * 2),
    ]);
    const path = xy.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    const t0 = new Date(points[0][0] * 1000).toLocaleTimeString();
    const t1 = new Date(points[points.length - 1][0] * 1000).toLocaleTimeString();
    return (
      <div>
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
          <path d={path} fill="none" stroke="#0ea5e9" strokeWidth="2" />
        </svg>
        <div className="flex justify-between text-[10px] text-slate-400">
          <span>{t0}</span>
          <span>区间 {min.toFixed(1)} ~ {max.toFixed(1)}</span>
          <span>{t1}</span>
        </div>
      </div>
    );
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
          <h2 className="text-lg font-semibold text-slate-800">云服务器 CVM</h2>
          <p className="text-sm text-slate-500">查看腾讯云云服务器实例信息</p>
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

      {cvmQ.isLoading && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> 加载中…
        </div>
      )}
      {cvmQ.isError && (
        <div className="flex items-center gap-2 text-sm text-red-600">
          <AlertCircle className="h-4 w-4" /> {fmtErr(cvmQ.error)}
        </div>
      )}

      {instances.length === 0 && !cvmQ.isLoading && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm text-slate-400">
          该账号下暂无云服务器实例
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
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {instances.map((inst) => (
                <TableRow key={inst.InstanceId}>
                  <TableCell className="font-medium text-slate-800">{inst.InstanceName}</TableCell>
                  <TableCell className="text-xs text-slate-500">{inst.InstanceId}</TableCell>
                  {accountId === "all" && <TableCell className="text-sm text-slate-600">{inst.accountName}</TableCell>}
                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${stateColor(inst.InstanceState)}`}>
                      {inst.InstanceState}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">{inst.PublicIpAddresses?.join(", ") || "—"}</TableCell>
                  <TableCell className="text-sm text-slate-600">{inst.CPU}核 / {inst.Memory}GB</TableCell>
                  <TableCell className="text-sm text-slate-600">{inst.Zone}</TableCell>
                  <TableCell className="text-sm text-slate-600">{inst.ImageName || "—"}</TableCell>
                  <TableCell className="text-sm text-slate-600">{inst.ExpiredTime ? inst.ExpiredTime.replace("T", " ").slice(0, 19) : "—"}</TableCell>
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
                        <Button type="button" size="sm" variant="secondary" className="h-7 px-2 text-xs" onClick={() => openMonitor(inst)}>
                          监控
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {monitorInst ? (
        <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-800">
              监控 · {monitorInst.InstanceName}
              <span className="ml-2 font-mono text-xs text-slate-500">{monitorInst.InstanceId}</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {METRICS.map((m) => (
                <Button
                  key={m.key}
                  type="button"
                  size="sm"
                  variant={monitorMetric === m.key ? "default" : "secondary"}
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    setMonitorMetric(m.key);
                    void loadMonitor(monitorInst, m.key);
                  }}
                >
                  {m.label}
                </Button>
              ))}
              <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setMonitorInst(null)}>
                关闭
              </Button>
            </div>
          </div>
          {monitorLoading ? (
            <p className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> 加载监控数据…
            </p>
          ) : monitorErr ? (
            <p className="text-xs text-red-600">{monitorErr}</p>
          ) : (
            renderSpark(monitorPoints)
          )}
          <p className="text-[11px] text-slate-400">
            内网/内存等指标需节点安装 monitoring agent；数据来自腾讯云 GetMonitorData（近 6 小时）。
          </p>
        </div>
      ) : null}
    </div>
  );
}

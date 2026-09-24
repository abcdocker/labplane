import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Play, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiGetJson, apiPostJson, apiPutJson } from "@/lib/api";
import { formatDateTimeShanghai } from "@/lib/datetime-cn";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

type IpScanConfig = { segments: string[] };

type IpScanResultRow = { ip: string; status: string };

type IpScanRun = {
  id: string;
  startedAt: string;
  endedAt: string;
  segment: string;
  podSourceIp?: string;
  results: IpScanResultRow[];
  summary: { total: number; used: number; likelyFree: number };
  note?: string;
};

const ToolNetworkIpScan: React.FC = () => {
  const qc = useQueryClient();
  const [segmentInput, setSegmentInput] = useState("");
  const [oneoffSeg, setOneoffSeg] = useState("");

  const configQ = useQuery({
    queryKey: ["toolbox-ip-scan-config"],
    queryFn: ({ signal }) => apiGetJson<IpScanConfig>("/api/toolbox/ip-scan/config", { signal }),
  });

  const historyQ = useQuery({
    queryKey: ["toolbox-ip-scan-history"],
    queryFn: ({ signal }) => apiGetJson<{ runs: IpScanRun[] }>("/api/toolbox/ip-scan/history", { signal }),
  });

  const segmentsHydrated = React.useRef(false);
  React.useEffect(() => {
    const segs = configQ.data?.segments;
    if (segmentsHydrated.current || !segs?.length) return;
    setSegmentInput(segs.join("\n"));
    segmentsHydrated.current = true;
  }, [configQ.data?.segments]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const segments = segmentInput
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      return apiPutJson<IpScanConfig>("/api/toolbox/ip-scan/config", { segments });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["toolbox-ip-scan-config"] });
      toast.success("网段已保存");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const runMut = useMutation({
    mutationFn: async (segment?: string) =>
      apiPostJson<{ run: IpScanRun }>("/api/toolbox/ip-scan/run", {
        segment: segment?.trim() || "",
      }),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["toolbox-ip-scan-history"] });
      const s = data.run.summary;
      toast.success(
        `扫描完成：共 ${s.total} 个地址，疑似占用 ${s.used}，疑似空闲 ${s.likelyFree}`
      );
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const lastRun = historyQ.data?.runs?.[0];
  const busy = saveMut.isPending || runMut.isPending;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">内网工具箱 · 空闲 IP 探测</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          在 <strong>Dashboard Pod</strong> 内发起 TCP 连接探测（常见端口）。Pod 内通常无 ICMP
          权限，故不使用 ping。若防火墙丢弃探测，可能被标为「疑似空闲」。单次最多{" "}
          <span className="font-mono">512</span> 个地址。
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">网段</h2>
        <p className="mt-1 text-sm text-slate-500">
          每行一个 IPv4 CIDR（如 <code className="text-xs">10.20.0.0/24</code>
          ），保存后可在下方选择「按已保存网段扫描」。
        </p>
        <div className="mt-4 space-y-2">
          <Label htmlFor="segments">网段列表</Label>
          <textarea
            id="segments"
            className="min-h-[120px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-sm"
            value={segmentInput}
            onChange={(e) => setSegmentInput(e.target.value)}
            placeholder={"10.0.0.0/24\n10.0.1.0/24"}
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" disabled={busy} onClick={() => saveMut.mutate()} className="gap-2">
            {saveMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            保存网段
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => runMut.mutate(undefined)}
            className="gap-2"
          >
            {runMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            按已保存的首个网段扫描
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">单次指定网段扫描</h2>
        <p className="mt-1 text-sm text-slate-500">不覆盖已保存列表，仅本次使用。</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="oneoff">CIDR</Label>
            <Input
              id="oneoff"
              className="font-mono text-sm"
              placeholder="192.168.1.0/24"
              value={oneoffSeg}
              onChange={(e) => setOneoffSeg(e.target.value)}
            />
          </div>
          <Button
            type="button"
            disabled={busy}
            onClick={() => {
              const v = oneoffSeg.trim();
              if (!v) {
                toast.error("请填写 CIDR");
                return;
              }
              runMut.mutate(v);
            }}
            className="gap-2 sm:shrink-0"
          >
            {runMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            扫描此网段
          </Button>
        </div>
      </div>

      {runMut.data?.run && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-6">
          <h2 className="text-lg font-semibold text-emerald-950">本次结果</h2>
          <p className="mt-1 text-sm text-emerald-900/90">
            网段 {runMut.data.run.segment} · Pod 源 IP{" "}
            <span className="font-mono">{runMut.data.run.podSourceIp || "—"}</span> ·{" "}
            {runMut.data.run.startedAt} → {runMut.data.run.endedAt}
          </p>
          {runMut.data.run.note ? (
            <p className="mt-2 text-xs text-emerald-900/80">{runMut.data.run.note}</p>
          ) : null}
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-white/80 px-3 py-2 text-sm">
              <span className="text-slate-500">总计</span>{" "}
              <span className="font-semibold">{runMut.data.run.summary.total}</span>
            </div>
            <div className="rounded-lg bg-white/80 px-3 py-2 text-sm">
              <span className="text-slate-500">疑似占用</span>{" "}
              <span className="font-semibold text-amber-800">{runMut.data.run.summary.used}</span>
            </div>
            <div className="rounded-lg bg-white/80 px-3 py-2 text-sm">
              <span className="text-slate-500">疑似空闲</span>{" "}
              <span className="font-semibold text-blue-800">
                {runMut.data.run.summary.likelyFree}
              </span>
            </div>
          </div>
          <div className="mt-4 max-h-[360px] overflow-auto rounded-lg border border-emerald-100 bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>IP</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runMut.data.run.results.map((r) => (
                  <TableRow key={r.ip}>
                    <TableCell className="font-mono text-xs">{r.ip}</TableCell>
                    <TableCell className="text-xs">
                      {r.status === "used" ? (
                        <Badge className="border-amber-300 bg-amber-100 font-normal text-amber-950 hover:bg-amber-100">
                          疑似占用
                        </Badge>
                      ) : (
                        <Badge className="border-blue-300 bg-blue-100 font-normal text-blue-950 hover:bg-blue-100">
                          疑似空闲
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">历史记录</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void historyQ.refetch()}
          >
            刷新列表
          </Button>
        </div>
        {historyQ.isLoading && <p className="mt-4 text-sm text-slate-500">加载中…</p>}
        {historyQ.data?.runs && historyQ.data.runs.length === 0 && (
          <p className="mt-4 text-sm text-slate-500">暂无记录，保存网段并执行扫描后会保留在此。</p>
        )}
        <div className="mt-4 space-y-4">
          {historyQ.data?.runs?.map((run) => (
            <details
              key={run.id}
              className="rounded-lg border border-slate-100 bg-slate-50/80 px-4 py-3"
            >
              <summary className="cursor-pointer text-sm font-medium text-slate-900">
                {run.segment} · {formatDateTimeShanghai(run.startedAt)}{" "}
                <span className="ml-2 inline-flex flex-wrap items-center gap-1.5 font-normal">
                  <Badge className="border-amber-300 bg-amber-50 font-normal text-amber-950">占用 {run.summary.used}</Badge>
                  <Badge className="border-blue-300 bg-blue-50 font-normal text-blue-950">空闲 {run.summary.likelyFree}</Badge>
                </span>
              </summary>
              <div className="mt-3 max-h-[240px] overflow-auto rounded border border-slate-100 bg-white">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">IP</TableHead>
                      <TableHead className="text-xs">状态</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {run.results.slice(0, 256).map((r) => (
                      <TableRow key={`${run.id}-${r.ip}`}>
                        <TableCell className="font-mono text-xs">{r.ip}</TableCell>
                        <TableCell className="text-xs">
                          {r.status === "used" ? (
                            <Badge className="border-amber-300 bg-amber-100 font-normal text-amber-950 hover:bg-amber-100">
                              疑似占用
                            </Badge>
                          ) : (
                            <Badge className="border-blue-300 bg-blue-100 font-normal text-blue-950 hover:bg-blue-100">
                              疑似空闲
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {run.results.length > 256 && (
                <p className="mt-2 text-xs text-slate-500">仅显示前 256 行，完整数据请查看接口返回。</p>
              )}
            </details>
          ))}
        </div>
      </div>

      {lastRun && !runMut.data?.run && (
        <p className="text-xs text-slate-500">
          最近一次扫描：{lastRun.segment} · {formatDateTimeShanghai(lastRun.startedAt)}
        </p>
      )}
    </div>
  );
};

export default ToolNetworkIpScan;

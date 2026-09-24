import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiDelete, apiGetJson, apiPostJson, API_BASE } from "@/lib/api";
import { vmCapturePresets, vmCaptureText as T } from "./vmCapture.i18n";
import type {
  VmCaptureFileMeta,
  VmCaptureInterpretLine,
  VmCaptureInterpretResponse,
  VmCaptureListResponse,
  VmCapturePreflight,
  VmCaptureStartRequest,
  VmCaptureStatus,
} from "./types";
import { PcapViewerDialog } from "./PcapViewerDialog";
import "./vmCapture.css";

const enc = encodeURIComponent;

function fmtNum(n: number): string {
  return n.toLocaleString("en-US");
}

function fmtMiB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

function mmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

const protoColor: Record<string, string> = {
  REDIS: "text-[#7ee787]",
  SSH: "text-[#ff7b72]",
  DNS: "text-[#d2a8ff]",
  TLS: "text-[#d2a8ff]",
  HTTP: "text-[#79c0ff]",
  UDP: "text-[#79c0ff]",
  ICMP: "text-[#e3b341]",
  ARP: "text-[#ffa657]",
};

const sevBadge: Record<string, string> = {
  high: "bg-red-500/15 text-red-600 dark:text-red-400",
  mid: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  low: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
  info: "bg-slate-500/10 text-slate-500 dark:text-slate-400",
};

function riskColor(score: number): string {
  if (score >= 70) return "#f4165f";
  if (score >= 40) return "#f59e0b";
  return "#16a34a";
}

function RiskDial({ score }: { score: number }) {
  const c = 144.5;
  const color = riskColor(score);
  return (
    <span className="flex items-center gap-2">
      <span className="relative inline-flex h-[54px] w-[54px]">
        <svg width="54" height="54" viewBox="0 0 54 54" className="-rotate-90">
          <circle cx="27" cy="27" r="23" fill="none" stroke="currentColor" strokeWidth="5" className="text-slate-200 dark:text-slate-700" />
          <circle
            className="vmcap-dial-arc"
            cx="27"
            cy="27"
            r="23"
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - score / 100)}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-extrabold tabular-nums" style={{ color }}>
          {score}
        </span>
      </span>
      <span className="text-[11px] leading-tight text-slate-500 dark:text-slate-400">
        <b className="block text-[12.5px]">{score >= 70 ? T.riskLevels.high : score >= 40 ? T.riskLevels.mid : T.riskLevels.low}</b>
        {T.live.riskDial} 0–100
      </span>
    </span>
  );
}

function AiCallout({ lines, title = "命令与风险解读" }: { lines: VmCaptureInterpretLine[]; title?: string }) {
  const icon: Record<string, string> = { ok: "✔", warn: "⚠", bad: "✖", info: "·" };
  const iconColor: Record<string, string> = {
    ok: "text-green-600 dark:text-green-400",
    warn: "text-amber-600 dark:text-amber-400",
    bad: "text-red-600 dark:text-red-400",
    info: "text-slate-400",
  };
  return (
    <div className="mt-3 rounded-lg border border-violet-500/35 bg-violet-500/5 p-3">
      <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-violet-600 dark:text-violet-400">
        <span className="inline-flex h-[18px] w-[18px] items-center justify-center rounded bg-gradient-to-br from-violet-600 to-sky-400 text-[11px] font-extrabold text-white">
          AI
        </span>
        {title}
      </div>
      {lines.map((l, i) => (
        <div key={i} className="vmcap-line-in flex gap-2 text-[12.8px] leading-relaxed" style={{ animationDelay: `${i * 0.25}s` }}>
          <span className={`shrink-0 font-bold ${iconColor[l.level] ?? iconColor.info}`}>{icon[l.level] ?? icon.info}</span>
          <span className="break-all">{l.text}</span>
        </div>
      ))}
    </div>
  );
}

type ViewerState = { name: string; packets: number; mib: string };

const VmCapturePanel: React.FC<{ moref: string; vmName: string }> = ({ moref, vmName }) => {
  const queryClient = useQueryClient();

  // 预检
  const preflightQ = useQuery({
    queryKey: ["vmcap-preflight", moref],
    queryFn: ({ signal }) => apiGetJson<VmCapturePreflight>(`/api/vcenter/vms/${enc(moref)}/captures/preflight`, { signal }),
    staleTime: 60_000,
    retry: false,
  });

  // 表单
  const [iface, setIface] = useState("any");
  const [snaplen, setSnaplen] = useState(1600);
  const [durationSec, setDurationSec] = useState(300);
  const [maxMiB, setMaxMiB] = useState(128);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [bpf, setBpf] = useState("tcp port 6379");
  const [preset, setPreset] = useState<string>("Redis");

  // AI 解读（表单与抓包卡共用）
  const [interpret, setInterpret] = useState<VmCaptureInterpretResponse | null>(null);
  const interpretMut = useMutation({
    mutationFn: () =>
      apiPostJson<VmCaptureInterpretResponse>(`/api/vcenter/vms/${enc(moref)}/captures/interpret`, {
        bpf,
        iface,
        snaplen,
        maxMiB,
        durationSec,
      }),
    onSuccess: (data) => {
      setInterpret(data);
      toast.success(data.aiUsed ? "AI 已解读当前过滤器" : "已按规则解读（AI 判读模型未启用）");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  // 表单参数变化后用本地规则引擎静默刷新；真正的模型增强仍由按钮显式触发。
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void apiPostJson<VmCaptureInterpretResponse>(
        `/api/vcenter/vms/${enc(moref)}/captures/interpret`,
        { bpf, iface, snaplen, maxMiB, durationSec, rulesOnly: true },
        { signal: controller.signal }
      )
        .then(setInterpret)
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          // 输入过程中的静默规则解读不弹 toast，显式按钮仍会报错。
        });
    }, 400);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [moref, bpf, iface, snaplen, maxMiB, durationSec]);

  // 历史与运行中列表
  const listQ = useQuery({
    queryKey: ["vmcap-list", moref],
    queryFn: ({ signal }) => apiGetJson<VmCaptureListResponse>(`/api/vcenter/vms/${enc(moref)}/captures`, { signal }),
    refetchInterval: 3000,
  });
  const running = listQ.data?.running?.[0];

  // 实时预览游标必须与会话名绑定，避免快速切换会话时沿用上一次序号。
  const cursorRef = useRef(0);
  const cursorSessionRef = useRef("");
  const consumedSeqRef = useRef(0);
  const [lines, setLines] = useState<{ seq: number; proto: string; text: string }[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const termRef = useRef<HTMLDivElement | null>(null);

  // 运行状态轮询（1s）
  const statusQ = useQuery({
    queryKey: ["vmcap-status", moref, running?.name ?? ""],
    queryFn: ({ signal }) => {
      const name = running?.name ?? "";
      const after = cursorSessionRef.current === name ? cursorRef.current : 0;
      return apiGetJson<{ running: boolean; session?: VmCaptureStatus }>(
        `/api/vcenter/vms/${enc(moref)}/captures/file/${enc(name)}?after=${after}`,
        { signal }
      );
    },
    enabled: Boolean(running),
    refetchInterval: 1000,
  });
  const st = statusQ.data?.session;

  // 预览行与风险流（增量追加）
  useEffect(() => {
    if (!st) return;
    const incoming = st.previewLines ?? [];
    if (cursorSessionRef.current !== st.name) {
      cursorSessionRef.current = st.name;
      cursorRef.current = st.previewSeq;
      consumedSeqRef.current = st.previewSeq;
      // 状态轮询回调之外再提交 UI 更新，避免 effect 内同步级联渲染。
      queueMicrotask(() => {
        if (cursorSessionRef.current === st.name) setLines(incoming.slice(-300));
      });
      return;
    }
    cursorRef.current = st.previewSeq;
    if (st.previewSeq <= consumedSeqRef.current) return;
    consumedSeqRef.current = st.previewSeq;
    if (incoming.length > 0) {
      queueMicrotask(() => {
        if (cursorSessionRef.current === st.name) setLines((prev) => [...prev, ...incoming].slice(-300));
      });
    }
  }, [st]);

  useEffect(() => {
    if (autoScroll && termRef.current) {
      termRef.current.scrollTop = termRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  // 会话结束：刷新历史 + 提示
  const lastRunningNameRef = useRef("");
  useEffect(() => {
    if (running) {
      lastRunningNameRef.current = running.name;
      return;
    }
    const finishedName = lastRunningNameRef.current;
    if (!finishedName) return;
    if (listQ.error) return;
    const meta = listQ.data?.files.find((file) => file.name === finishedName);
    if (!meta && listQ.isFetching) return;
    lastRunningNameRef.current = "";
    cursorSessionRef.current = "";
    cursorRef.current = 0;
    consumedSeqRef.current = 0;
    if (meta?.status === "error") {
      toast.error(meta.errText || "抓包异常结束");
    } else if (meta?.stopReason === "size" || meta?.stopReason === "duration") {
      toast.info(T.live.autoStopped);
    } else {
      toast.success(T.live.stopped);
    }
    void queryClient.invalidateQueries({ queryKey: ["vmcap-list", moref] });
  }, [running, listQ.data?.files, listQ.error, listQ.isFetching, queryClient, moref]);

  const startMut = useMutation({
    mutationFn: (body: VmCaptureStartRequest) => apiPostJson<VmCaptureStatus>(`/api/vcenter/vms/${enc(moref)}/captures`, body),
    onSuccess: (data) => {
      setLines([]);
      cursorSessionRef.current = data.name;
      cursorRef.current = 0;
      consumedSeqRef.current = 0;
      void queryClient.invalidateQueries({ queryKey: ["vmcap-list", moref] });
      toast.success(`tcpdump 已启动 · ${data.name}`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const stopMut = useMutation({
    mutationFn: () => apiPostJson<unknown>(`/api/vcenter/vms/${enc(moref)}/captures/file/${enc(running?.name ?? "")}/stop`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["vmcap-list", moref] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VmCaptureFileMeta | null>(null);
  const deleteMut = useMutation({
    mutationFn: (name: string) => apiDelete(`/api/vcenter/vms/${enc(moref)}/captures/file/${enc(name)}`),
    onSuccess: () => {
      toast.success("已删除");
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["vmcap-list", moref] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const preflight = preflightQ.data;
  const preflightPass = preflight?.sshOk && preflight.tcpdumpOk && preflight.sudoOk;
  const history = listQ.data?.files ?? [];

  const stopReasonLabel = (r?: string) =>
    r === "size" ? T.history.reasonSize : r === "duration" ? T.history.reasonDuration : r === "remote-exit" ? T.history.reasonRemote : T.history.reasonManual;

  const protocolLegend = useMemo(
    () => [
      ["#c9d1d9", "TCP"],
      ["#7ee787", "Redis"],
      ["#ff7b72", "SSH"],
      ["#79c0ff", "HTTP/UDP"],
      ["#d2a8ff", "DNS/TLS"],
      ["#e3b341", "ICMP"],
      ["#ffa657", "ARP"],
    ] as const,
    []
  );

  return (
    <div className="space-y-4">
      {listQ.error && (
        <div role="alert" className="rounded-md border border-red-500/35 bg-red-500/5 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {T.errors.list}: {(listQ.error as Error).message}
        </div>
      )}
      {statusQ.error && running && (
        <div role="alert" className="rounded-md border border-amber-500/35 bg-amber-500/5 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          {T.errors.status}: {(statusQ.error as Error).message}
        </div>
      )}
      {/* 预检 */}
      <Card className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-[15px]">{T.preflight.title}</CardTitle>
            <CardDescription className="mt-1">{T.preflight.desc}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {preflight && (
              <Badge className={preflightPass ? "bg-green-500/15 text-green-600 hover:bg-green-500/15 dark:text-green-400" : "bg-amber-500/15 text-amber-600 hover:bg-amber-500/15 dark:text-amber-400"}>
                {preflightPass ? `✔ ${T.preflight.passAll}` : T.preflight.partial}
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={() => void preflightQ.refetch()}>
              {T.preflight.refresh}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {preflightQ.error && (
            <div role="alert" className="mb-3 rounded-md border border-red-500/35 bg-red-500/5 px-3 py-2 text-sm text-red-600 dark:text-red-400">
              {T.errors.preflight}: {(preflightQ.error as Error).message}
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                ok: preflight?.sshOk,
                title: T.preflight.ssh,
                sub: preflight?.sshOk ? `${preflight.guestIp}:22${preflight.rttMs != null ? ` · RTT ${preflight.rttMs} ms` : ""}` : preflight?.sshError ?? T.preflight.hintSsh,
              },
              {
                ok: preflight?.tcpdumpOk,
                title: T.preflight.tcpdump,
                sub: preflight?.tcpdumpOk ? preflight.tcpdumpVersion || "已安装" : T.preflight.hintTcpdump,
              },
              { ok: preflight?.sudoOk, title: T.preflight.sudo, sub: preflight?.sudoOk ? "sudo -n 免密可用" : preflight?.hint ?? T.preflight.hintSudo },
              { ok: preflight?.aiReady, optional: true, title: T.preflight.ai, sub: preflight?.aiReady ? `${preflight.aiModel} ${T.preflight.aiReady}` : T.preflight.aiOff },
            ].map((item, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 rounded-md border p-3 text-[13px] ${
                  item.ok === undefined
                    ? "border-slate-200 dark:border-slate-800"
                    : item.ok
                      ? "border-green-500/30 bg-green-500/5"
                      : "optional" in item && item.optional
                        ? "border-amber-500/30 bg-amber-500/5"
                      : "border-red-500/30 bg-red-500/5"
                }`}
              >
                <span className={item.ok ? "text-green-600 dark:text-green-400" : "optional" in item && item.optional ? "text-amber-600 dark:text-amber-400" : "text-red-500"}>
                  {item.ok === undefined ? "…" : item.ok ? "✔" : "optional" in item && item.optional ? "○" : "✖"}
                </span>
                <div>
                  <b className="font-semibold">{item.title}</b>
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{item.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 表单 */}
      <Card className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <CardHeader className="pb-2">
          <CardTitle className="text-[15px]">{T.form.title}</CardTitle>
          <CardDescription className="mt-1">{T.form.desc}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1.5">
              <Label htmlFor="vmcap-iface">{T.form.iface}</Label>
              <Input id="vmcap-iface" value={iface} onChange={(e) => { setIface(e.target.value); setInterpret(null); }} placeholder="any" className="font-mono" />
              <p className="text-[11.5px] text-slate-500 dark:text-slate-400">{T.form.ifaceHint}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vmcap-snaplen">{T.form.snaplen}</Label>
              <Select value={String(snaplen)} onValueChange={(v) => { setSnaplen(Number(v)); setInterpret(null); }}>
                <SelectTrigger id="vmcap-snaplen">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="96">96（仅头部）</SelectItem>
                  <SelectItem value="1600">1600（推荐）</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vmcap-duration">{T.form.duration}</Label>
              <Select value={String(durationSec)} onValueChange={(v) => { setDurationSec(Number(v)); setInterpret(null); }}>
                <SelectTrigger id="vmcap-duration">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="60">60 秒</SelectItem>
                  <SelectItem value="120">120 秒</SelectItem>
                  <SelectItem value="300">300 秒（推荐）</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vmcap-size">{T.form.size}</Label>
              <Select value={String(maxMiB)} onValueChange={(v) => { setMaxMiB(Number(v)); setInterpret(null); }}>
                <SelectTrigger id="vmcap-size">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="32">32 MiB</SelectItem>
                  <SelectItem value="64">64 MiB</SelectItem>
                  <SelectItem value="128">128 MiB（推荐）</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vmcap-realtime-analysis">{T.form.ai}</Label>
              <div className="flex h-9 items-center gap-2">
                <Switch id="vmcap-realtime-analysis" checked={aiEnabled} onCheckedChange={setAiEnabled} aria-label={T.form.ai} />
                <span className="text-xs text-slate-500 dark:text-slate-400">{aiEnabled ? T.form.aiOn : T.form.aiOff}</span>
              </div>
            </div>
          </div>
          <div className="mt-3 space-y-1.5">
            <Label htmlFor="vmcap-bpf">{T.form.bpf}</Label>
            <Input id="vmcap-bpf" value={bpf} onChange={(e) => { setBpf(e.target.value); setPreset(""); setInterpret(null); }} spellCheck={false} className="font-mono" placeholder="例：tcp port 6379 or host 192.168.21.99" />
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11.5px] text-slate-500">{T.form.presetLabel}</span>
              {vmCapturePresets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    setBpf(p.expr);
                    setPreset(p.label);
                    setInterpret(null);
                  }}
                  className={`rounded-full border px-2.5 py-0.5 text-[12px] transition-colors ${
                    preset === p.label
                      ? "border-violet-500 bg-violet-500/10 text-violet-600 dark:text-violet-400"
                      : "border-slate-200 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                  }`}
                >
                  {p.label} · <span className="font-mono text-[11px]">{p.expr}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button disabled={Boolean(running) || startMut.isPending} onClick={() => startMut.mutate({ bpf, iface, snaplen, maxMiB, durationSec, aiEnabled, vmName })}>
              ▶ {running ? "抓包进行中…" : T.form.start}
            </Button>
            <Button
              variant="outline"
              disabled={interpretMut.isPending}
              className="border-violet-500/40 text-violet-600 hover:bg-violet-500/10 dark:text-violet-400"
              onClick={() => interpretMut.mutate()}
            >
              {interpretMut.isPending ? T.form.interpreting : `✨ ${preflight?.aiReady ? T.form.interpretAI : T.form.interpretRules}`}
            </Button>
            <span className="text-[12px] text-slate-500 dark:text-slate-400">{T.form.adminOnly}</span>
          </div>
          {interpret && <AiCallout lines={interpret.lines} title={interpret.aiUsed ? T.form.aiResult : T.form.rulesResult} />}
        </CardContent>
      </Card>

      {/* 抓包中 */}
      {st && running && (
        <Card className="border-red-500/30 bg-white dark:bg-slate-900">
          <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="animate-pulse bg-red-500 text-white hover:bg-red-500">● {T.live.running}</Badge>
              <span className="text-[13px] text-slate-500 dark:text-slate-400">
                {st.guestIp} · {st.iface} · '{st.bpf || "(全量)"}' · snaplen {st.snaplen}
              </span>
            </div>
            <Button variant="destructive" size="sm" disabled={stopMut.isPending} onClick={() => stopMut.mutate()}>
              ⏹ {T.live.stop}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-2 font-mono text-[12px] text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
              guest$ <b className="text-slate-700 dark:text-slate-200">sudo -n tcpdump -i {st.iface} -U -s {st.snaplen} -w -{st.bpf ? ` '${st.bpf}'` : ""}</b>
              &nbsp;→&nbsp;SSH stdout&nbsp;→&nbsp;/data/captures/{st.name}
            </div>
            <div className={`my-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 ${st.aiEnabled ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
              {[
                { k: T.live.elapsed, v: mmss(st.elapsedSec) },
                { k: T.live.packets, v: fmtNum(st.packets) },
                { k: T.live.bytes, v: `${fmtMiB(st.bytes)} MiB` },
                { k: T.live.pps, v: `${st.pps} pps` },
                ...(st.aiEnabled ? [{ k: T.live.risk, v: `${st.findings?.length ?? 0} ${T.live.items}` }] : []),
              ].map((m) => (
                <div key={m.k} className="rounded-md border border-slate-200 p-2.5 dark:border-slate-700">
                  <div className="text-[11.5px] text-slate-500 dark:text-slate-400">{m.k}</div>
                  <div className="mt-0.5 text-lg font-bold tabular-nums">{m.v}</div>
                </div>
              ))}
            </div>
            <Progress value={Math.min(100, (st.bytes / (st.maxMiB * 1024 * 1024)) * 100)} />
            <div className="mt-1 flex justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>
                {T.live.written} {fmtMiB(st.bytes)} MiB
              </span>
              <span>
                {T.live.cap} {st.maxMiB} MiB · {mmss(st.durationSec - st.elapsedSec)}
              </span>
            </div>

            <div className={`mt-3.5 grid gap-3.5 ${st.aiEnabled ? "lg:grid-cols-[1.55fr_1fr]" : "grid-cols-1"}`}>
              <div>
                <div className="vmcap-term">
                  <div className="flex flex-wrap items-center gap-2 border-b border-[#22293a] px-3 py-1.5 text-xs text-[#8b949e]">
                    <span>{T.live.streamTitle}</span>
                    <span className="flex-1" />
                    <button
                      type="button"
                      className="rounded border border-[#2c3547] px-2 py-0.5 text-[11.5px] hover:bg-[#161c27]"
                      onClick={() => setAutoScroll((v) => !v)}
                    >
                      {autoScroll ? `⏸ ${T.live.pauseScroll}` : `▶ ${T.live.resumeScroll}`}
                    </button>
                    <button type="button" className="rounded border border-[#2c3547] px-2 py-0.5 text-[11.5px] hover:bg-[#161c27]" onClick={() => setLines([])}>
                      {T.live.clear}
                    </button>
                  </div>
                  <div ref={termRef} className="vmcap-term-body">
                    {lines.length === 0 && <div className="text-[#6e7681]">等待数据包…</div>}
                    {lines.map((l) => (
                      <div key={l.seq} className={`vmcap-term-line ${protoColor[l.proto] ?? "text-[#c9d1d9]"}`}>
                        {l.text}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2.5 text-[11.5px] text-slate-500 dark:text-slate-400">
                  {protocolLegend.map(([c, label]) => (
                    <span key={label} className="inline-flex items-center gap-1">
                      <i className="inline-block h-2 w-2 rounded-sm" style={{ background: c }} />
                      {label}
                    </span>
                  ))}
                </div>
              </div>
              {st.aiEnabled && <div className="flex flex-col overflow-hidden rounded-lg border border-violet-500/30 bg-violet-500/5">
                <div className="flex items-center gap-2 border-b border-violet-500/25 px-3.5 py-2.5">
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold text-violet-600 dark:text-violet-400">
                    <span className="inline-flex h-[18px] w-[18px] items-center justify-center rounded bg-gradient-to-br from-violet-600 to-sky-400 text-[11px] font-extrabold text-white">
                      R
                    </span>
                    {T.live.riskTitle}
                  </span>
                  <span className="flex-1" />
                  <RiskDial score={st.riskScore} />
                </div>
                <div className="max-h-[262px] min-h-[200px] flex-1 overflow-y-auto p-2.5">
                  {(st.findings ?? []).length === 0 && <div className="p-2 text-xs text-slate-500 dark:text-slate-400">{T.live.evaluating}</div>}
                  {(st.findings ?? []).map((f) => (
                    <div key={f.id} className="vmcap-finding-in mb-2 rounded-md border border-slate-200 bg-white p-2.5 text-[12.5px] leading-relaxed dark:border-slate-700 dark:bg-slate-900">
                      <div className="mb-0.5 flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${sevBadge[f.sev]}`}>{T.sev[f.sev]}</span>
                        <b className="font-semibold">{f.title}</b>
                      </div>
                      <div className="text-slate-600 dark:text-slate-300">
                        {f.text}
                        {f.packetNo ? <span className="ml-1 text-violet-600 underline decoration-dotted dark:text-violet-400">{T.live.jumpHint} #{f.packetNo}</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-dashed border-slate-200 px-3 py-1.5 text-[11px] text-slate-500 dark:border-slate-700 dark:text-slate-400">{T.live.riskFooter}</div>
              </div>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 历史文件 */}
      <Card className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-2 space-y-0 pb-2">
          <div className="min-w-0">
            <CardTitle className="text-[15px]">{T.history.title}</CardTitle>
            <CardDescription className="mt-1">{T.history.desc}</CardDescription>
          </div>
          {listQ.data && (
            <Badge variant="secondary" className="whitespace-nowrap">
              {T.history.used} {fmtMiB(listQ.data.usedBytes)} MiB / {fmtMiB(listQ.data.quotaBytes)} MiB · {T.history.retain} {listQ.data.retainDays} {T.history.days}
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{T.history.file}</TableHead>
                  <TableHead>{T.history.started}</TableHead>
                  <TableHead>{T.history.duration}</TableHead>
                  <TableHead>{T.history.packets}</TableHead>
                  <TableHead>{T.history.size}</TableHead>
                  <TableHead>{T.history.filter}</TableHead>
                  <TableHead>{T.history.ai}</TableHead>
                  <TableHead>{T.history.status}</TableHead>
                  <TableHead className="w-[190px]">{T.history.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listQ.isLoading && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-slate-500">
                      {T.history.loading}
                    </TableCell>
                  </TableRow>
                )}
                {!listQ.isLoading && !listQ.error && history.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-slate-500">
                      {T.history.empty}
                    </TableCell>
                  </TableRow>
                )}
                {history.map((f) => (
                  <TableRow key={f.name} className="dark:border-slate-800">
                    <TableCell className="font-mono text-[12px]">{f.name}</TableCell>
                    <TableCell className="tabular-nums">{f.startedAt ? new Date(f.startedAt).toLocaleString("zh-CN", { hour12: false }) : "—"}</TableCell>
                    <TableCell className="tabular-nums">{mmss(f.durationSec)}</TableCell>
                    <TableCell className="tabular-nums">{fmtNum(f.packets)}</TableCell>
                    <TableCell className="tabular-nums">{fmtMiB(f.bytes)} MiB</TableCell>
                    <TableCell className="max-w-[180px] truncate font-mono text-[11.5px]" title={f.bpf || "(全量)"}>
                      {f.bpf || "(全量)"}
                    </TableCell>
                    <TableCell>
                      {f.findings?.length > 0 ? (
                        <Badge className="bg-amber-500/15 text-amber-600 hover:bg-amber-500/15 dark:text-amber-400">
                          {f.findings.length} {T.history.aiFound}
                        </Badge>
                      ) : f.aiEnabled === true ? (
                        <Badge className="bg-green-500/15 text-green-600 hover:bg-green-500/15 dark:text-green-400">{T.history.aiNone}</Badge>
                      ) : (
                        <Badge variant="secondary">{T.history.notAnalyzed}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={f.status === "error" ? "destructive" : "secondary"}>{f.status === "error" ? T.history.statusError : stopReasonLabel(f.stopReason)}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1.5">
                        <Button variant="outline" size="sm" onClick={() => setViewer({ name: f.name, packets: f.packets, mib: fmtMiB(f.bytes) })}>
                          👁 {T.history.view}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`${T.history.download} ${f.name}`}
                          title={T.history.download}
                          onClick={() => window.open(`${API_BASE}/api/vcenter/vms/${enc(moref)}/captures/file/${enc(f.name)}/download`, "_blank")}
                        >
                          ⤓
                        </Button>
                        <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-500/10 dark:text-red-400" onClick={() => setDeleteTarget(f)}>
                          {T.history.delete}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">{T.history.footnote}</p>
        </CardContent>
      </Card>

      <PcapViewerDialog
        key={viewer?.name ?? "closed"}
        moref={moref}
        file={viewer}
        onClose={() => setViewer(null)}
      />

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{T.history.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{T.history.confirmDelete}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="break-all rounded-md bg-slate-100 p-2 font-mono text-xs dark:bg-slate-800">{deleteTarget?.name}</div>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <Button variant="destructive" disabled={deleteMut.isPending} onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.name)}>
              {T.history.delete}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default VmCapturePanel;

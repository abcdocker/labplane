import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiGetJson, apiPostJson, API_BASE } from "@/lib/api";
import { vmCaptureText as T } from "./vmCapture.i18n";
import type {
  VmCaptureAIReport,
  VmCaptureChatTurn,
  VmCaptureDecodeResult,
  VmCaptureFileMeta,
} from "./types";
import "./vmCapture.css";

const enc = encodeURIComponent;

const protoBadge: Record<string, string> = {
  REDIS: "bg-green-500/15 text-green-600 dark:text-green-400",
  SSH: "bg-red-500/15 text-red-600 dark:text-red-400",
  DNS: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  TLS: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  HTTP: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  ICMP: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  ARP: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  TCP: "bg-slate-500/15 text-slate-500 dark:text-slate-400",
  UDP: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
};

const sevBadge: Record<string, string> = {
  high: "bg-red-500/15 text-red-600 dark:text-red-400",
  mid: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  low: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
  info: "bg-slate-500/10 text-slate-500",
};

function riskColor(score: number): string {
  if (score >= 70) return "#f4165f";
  if (score >= 40) return "#f59e0b";
  return "#16a34a";
}

function ScoreRing({ score }: { score: number }) {
  const color = riskColor(score);
  return (
    <div
      className="flex h-[74px] w-[74px] shrink-0 items-center justify-center rounded-full text-xl font-extrabold tabular-nums"
      style={{ background: `conic-gradient(${color} ${score * 3.6}deg, rgba(128,128,128,.2) 0)`, color }}
    >
      <span className="flex h-[60px] w-[60px] items-center justify-center rounded-full bg-white dark:bg-slate-900">{score}</span>
    </div>
  );
}

function Bars({ rows, unit }: { rows: { key: string; count: number }[]; unit: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => (
        <div key={r.key} className="grid grid-cols-[130px_1fr_90px] items-center gap-2.5 text-[12.5px]">
          <span className="truncate font-mono text-[11.5px]" title={r.key}>
            {r.key}
          </span>
          <div className="h-4 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded bg-gradient-to-r from-violet-600 to-blue-400" style={{ width: `${(r.count / max) * 100}%` }} />
          </div>
          <span className="text-right tabular-nums text-slate-500 dark:text-slate-400">
            {r.count.toLocaleString("en-US")} {unit}
          </span>
        </div>
      ))}
    </div>
  );
}

type ViewerFile = { name: string; packets: number; mib: string } | null;

export function PcapViewerDialog({ moref, file, onClose }: { moref: string; file: ViewerFile; onClose: () => void }) {
  const queryClient = useQueryClient();
  const name = file?.name ?? "";
  const [tab, setTab] = useState<"raw" | "ai">("raw");
  const [filter, setFilter] = useState("");
  const [packet, setPacket] = useState(0);
  const [flash, setFlash] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatLog, setChatLog] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const chatLogRef = useRef<HTMLDivElement | null>(null);
  const packetRowRefs = useRef(new Map<number, HTMLTableRowElement>());

  const decodeQ = useQuery({
    queryKey: ["vmcap-decode", moref, name, packet],
    queryFn: ({ signal }) =>
      apiGetJson<{ meta: VmCaptureFileMeta; decode: VmCaptureDecodeResult }>(
        `/api/vcenter/vms/${enc(moref)}/captures/file/${enc(name)}/decode?limit=300${packet ? `&packet=${packet}` : ""}`,
        { signal }
      ),
    enabled: Boolean(name),
    staleTime: 30_000,
  });

  const reportQ = useQuery({
    queryKey: ["vmcap-ai-report", moref, name],
    queryFn: () => apiPostJson<VmCaptureAIReport>(`/api/vcenter/vms/${enc(moref)}/captures/file/${enc(name)}/ai-report`, {}),
    enabled: Boolean(name) && tab === "ai",
    staleTime: 60_000,
    retry: false,
  });

  const regenMut = useMutation({
    mutationFn: () => apiPostJson<VmCaptureAIReport>(`/api/vcenter/vms/${enc(moref)}/captures/file/${enc(name)}/ai-report?regen=1`, {}),
    onSuccess: (rep) => {
      queryClient.setQueryData(["vmcap-ai-report", moref, name], rep);
      toast.success(rep.aiUsed ? "AI 报告已重新生成" : "已按规则引擎重新生成（AI 未启用）");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const chatMut = useMutation({
    mutationFn: (question: string) =>
      apiPostJson<{ answer: string; aiUsed: boolean }>(`/api/vcenter/vms/${enc(moref)}/captures/file/${enc(name)}/ai-chat`, {
        question,
        history: chatLog.slice(-6).map((m): VmCaptureChatTurn => ({ role: m.role, content: m.content })),
      }),
    onSuccess: (data) => {
      setChatLog((prev) => [...prev, { role: "assistant", content: data.answer }]);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const sendChat = () => {
    const q = chatInput.trim();
    if (!q || chatMut.isPending) return;
    setChatInput("");
    setChatLog((prev) => [...prev, { role: "user", content: q }]);
    chatMut.mutate(q);
  };

  useEffect(() => {
    if (chatLogRef.current) chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
  }, [chatLog]);

  const jumpToPacket = (no: number) => {
    setTab("raw");
    setFilter("");
    setPacket(no);
    setFlash(true);
    setTimeout(() => setFlash(false), 1300);
  };

  const decode = decodeQ.data?.decode;
  const rows = useMemo(() => {
    if (!decode) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return decode.packets;
    return decode.packets.filter((p) => `${p.src} ${p.dst} ${p.proto} ${p.info}`.toLowerCase().includes(q));
  }, [decode, filter]);

  const report = reportQ.data;
  const meta = decodeQ.data?.meta;

  useEffect(() => {
    if (!packet || !decode) return;
    packetRowRefs.current.get(packet)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [packet, decode]);

  return (
    <Dialog open={Boolean(name)} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[94dvh] w-[min(1200px,97vw)] max-w-[1200px] flex-col overflow-hidden p-0 sm:max-w-[1200px]">
        <DialogHeader className="flex-row flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="min-w-0">
            <DialogTitle className="break-all font-mono text-sm">{name}</DialogTitle>
            <div className="mt-1 flex flex-wrap gap-2.5 text-[12px] text-slate-500 dark:text-slate-400">
              <span>{meta?.vmName || moref}</span>
              {decode && (
                <>
                  <span>
                    {decode.meta.packets.toLocaleString("en-US")} {T.viewer.packetsUnit}
                    {decode.meta.capped ? "（统计截断 50k）" : ""}
                  </span>
                  <span>{decode.meta.firstTs} → {decode.meta.lastTs}</span>
                  <span>{decode.meta.linkType}</span>
                </>
              )}
              {file && (
                <span>
                  {file.mib} MiB · {meta?.bpf || "(全量)"}
                </span>
              )}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Tabs value={tab} onValueChange={(v) => setTab(v as "raw" | "ai")}>
              <TabsList className="h-8">
                <TabsTrigger value="raw" className="h-6 text-xs">
                  {T.viewer.raw}
                </TabsTrigger>
                <TabsTrigger value="ai" className="h-6 text-xs">
                  ✨ {T.viewer.analysis}
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Button variant="outline" size="sm" onClick={() => window.open(`${API_BASE}/api/vcenter/vms/${enc(moref)}/captures/file/${enc(name)}/download`, "_blank")}>
              ⤓ {T.viewer.download}
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              ✕ {T.viewer.close}
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4">
          {tab === "raw" && (
            <div>
              {decodeQ.isLoading && <div className="mb-3 text-sm text-slate-500 dark:text-slate-400">{T.viewer.loading}</div>}
              {decodeQ.error && (
                <div role="alert" className="mb-3 rounded-md border border-red-500/35 bg-red-500/5 px-3 py-2 text-sm text-red-600 dark:text-red-400">
                  {T.viewer.decodeError}: {(decodeQ.error as Error).message}
                </div>
              )}
              <div className="mb-2.5 flex flex-wrap items-center gap-2">
                <Input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder={T.viewer.filterPlaceholder}
                  className="max-w-[420px] font-mono text-[12.5px]"
                  spellCheck={false}
                />
                <Badge variant="secondary" className="tabular-nums">
                  {T.viewer.showing} {rows.length} {T.viewer.of} {decode?.packets.length ?? 0} {T.viewer.packets}
                </Badge>
              </div>
              <div className="max-h-[262px] overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <Table>
                  <TableHeader>
                    <TableRow className="sticky top-0 bg-slate-100 dark:bg-slate-800">
                      <TableHead className="h-7 text-[11px]">#</TableHead>
                      <TableHead className="h-7 text-[11px]">时间</TableHead>
                      <TableHead className="h-7 text-[11px]">源</TableHead>
                      <TableHead className="h-7 text-[11px]">目的</TableHead>
                      <TableHead className="h-7 text-[11px]">协议</TableHead>
                      <TableHead className="h-7 text-[11px]">长度</TableHead>
                      <TableHead className="h-7 text-[11px]">信息</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((p) => (
                      <TableRow
                        key={p.no}
                        onClick={() => setPacket(p.no)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setPacket(p.no);
                          }
                        }}
                        ref={(node) => {
                          if (node) packetRowRefs.current.set(p.no, node);
                          else packetRowRefs.current.delete(p.no);
                        }}
                        tabIndex={0}
                        aria-selected={packet === p.no}
                        className={`cursor-pointer font-mono text-[12px] dark:border-slate-800 ${
                          packet === p.no ? "bg-violet-500/15" : "hover:bg-violet-500/5"
                        } ${flash && packet === p.no ? "vmcap-row-flash" : ""}`}
                      >
                        <TableCell className="py-1">{p.no}</TableCell>
                        <TableCell className="py-1 tabular-nums">{p.tsRel.toFixed(6)}</TableCell>
                        <TableCell className="py-1">
                          {p.src}
                          {p.srcPort ? `:${p.srcPort}` : ""}
                        </TableCell>
                        <TableCell className="py-1">
                          {p.dst}
                          {p.dstPort ? `:${p.dstPort}` : ""}
                        </TableCell>
                        <TableCell className="py-1">
                          <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-bold ${protoBadge[p.proto] ?? protoBadge.TCP}`}>{p.proto}</span>
                        </TableCell>
                        <TableCell className="py-1 tabular-nums">{p.length}</TableCell>
                        <TableCell className="max-w-[330px] truncate py-1" title={p.info}>
                          {p.info}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <div className="max-h-[250px] min-h-[180px] overflow-auto rounded-lg border border-slate-200 p-3 text-[12.5px] dark:border-slate-800">
                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{T.viewer.treeTitle}</div>
                  {decode?.detail ? (
                    decode.detail.tree.map((layer, i) => (
                      <details key={i} open className="my-0.5">
                        <summary
                          className={`cursor-pointer rounded px-1 py-0.5 font-mono text-[12px] font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 ${
                            layer.alert ? "text-red-600 dark:text-red-400" : ""
                          }`}
                        >
                          {layer.layer}
                        </summary>
                        <div className="pl-5 font-mono text-[11.5px] leading-relaxed text-slate-500 dark:text-slate-400">
                          {layer.fields.map((f, j) => (
                            <div key={j}>
                              {f.k}: <b className="font-medium text-slate-800 dark:text-slate-200">{f.v}</b>
                            </div>
                          ))}
                        </div>
                      </details>
                    ))
                  ) : (
                    <div className="text-slate-500 dark:text-slate-400">{T.viewer.treeEmpty}</div>
                  )}
                </div>
                <div className="max-h-[250px] min-h-[180px] overflow-auto rounded-lg border border-slate-200 p-3 text-[12.5px] dark:border-slate-800">
                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {T.viewer.hexTitle} <span className="ml-1 font-normal normal-case">· {T.viewer.hexLegend}</span>
                  </div>
                  {decode?.detail ? (
                    decode.detail.hex.map((line) => (
                      <div key={line.off} className="flex gap-2.5 font-mono text-[11.5px] leading-relaxed">
                        <span className="text-slate-400">{line.off.toString(16).padStart(6, "0")}</span>
                        <span className="w-[330px]">
                          {line.hex.map((h, i) => (
                            <i
                              key={i}
                              className={`not-italic px-px ${decode.detail!.payloadOffset >= 0 && line.off + i >= decode.detail!.payloadOffset ? "rounded bg-violet-400/30" : ""}`}
                            >
                              {h}{" "}
                            </i>
                          ))}
                        </span>
                        <span className="max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap text-slate-400">{line.ascii}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-slate-400">{T.viewer.hexEmpty}</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === "ai" && (
            <div className="mx-auto max-w-[960px]">
              {reportQ.isLoading && (
                <div className="flex items-center gap-2 p-6 text-slate-500">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
                  {T.viewer.aiGenerating}
                </div>
              )}
              {reportQ.error && <div className="p-4 text-red-600">{(reportQ.error as Error).message}</div>}
              {report && (
                <>
                  <div className="mb-3.5 flex flex-wrap items-center gap-4 rounded-xl border border-violet-500/30 bg-violet-500/5 p-4">
                    <ScoreRing score={report.score} />
                    <div className="min-w-0">
                      <div className="text-[15px] font-bold">
                        {report.aiUsed ? T.viewer.aiReportTitle : T.viewer.ruleReportTitle}
                        <Badge className="ml-2 bg-violet-500/10 text-violet-600 hover:bg-violet-500/10 dark:text-violet-400">
                          {report.level} · {report.aiUsed ? "AI 研判" : "规则引擎"}
                        </Badge>
                      </div>
                      <div className="mt-1 break-all text-[12.5px] leading-relaxed text-slate-500 dark:text-slate-400">
                        {name} · {report.engine} · {new Date(report.generatedAt).toLocaleString("zh-CN", { hour12: false })}
                        {report.aiError ? ` · ${report.aiError}` : ""}
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="ml-auto" disabled={regenMut.isPending} onClick={() => regenMut.mutate()}>
                      ↻ {T.viewer.aiRegen}
                    </Button>
                  </div>
                  <div className="mb-2 text-sm font-bold">1 · {T.viewer.summary}</div>
                  <div className="rounded-lg bg-slate-100 p-3 text-[13px] leading-relaxed dark:bg-slate-800/60">{report.summary}</div>
                  <div className="mb-2 mt-4 text-sm font-bold">2 · {T.viewer.findings}</div>
                  {report.findings.map((f, i) => (
                    <div
                      key={i}
                      className={`mb-2 rounded-lg border border-l-[3px] border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900 ${
                        f.severity === "high" ? "border-l-red-500" : f.severity === "mid" ? "border-l-amber-500" : "border-l-violet-500"
                      }`}
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-[13.5px] font-semibold">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${sevBadge[f.severity] ?? sevBadge.low}`}>{T.sev[f.severity] ?? T.sev.low}</span>
                        {f.title}
                        {f.packetNo ? (
                          <button type="button" className="text-violet-600 underline decoration-dotted dark:text-violet-400" onClick={() => jumpToPacket(f.packetNo!)}>
                            {T.viewer.viewPacket} #{f.packetNo}
                          </button>
                        ) : null}
                      </div>
                      <div className="text-[12.8px] leading-relaxed">{f.desc}</div>
                      {f.fix && (
                        <div className="mt-1 text-[12.5px] leading-relaxed text-slate-500 dark:text-slate-400">建议：{f.fix}</div>
                      )}
                    </div>
                  ))}
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div>
                      <div className="mb-2 text-sm font-bold">3 · {T.viewer.protoDist}</div>
                      <Bars rows={report.protoDist} unit="包" />
                    </div>
                    <div>
                      <div className="mb-2 text-sm font-bold">4 · {T.viewer.topTalkers}</div>
                      <Bars rows={report.topTalkers.map((t) => ({ key: t.endpoint, count: t.packets }))} unit="包" />
                    </div>
                  </div>
                  <div className="mb-2 mt-4 text-sm font-bold">5 · {T.viewer.advice}</div>
                  <ul className="space-y-1.5 text-[13px]">
                    {report.advice.map((a, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="shrink-0 text-violet-600 dark:text-violet-400">·</span>
                        <span>
                          <b>{a.when}</b>：{a.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {report.aiUsed ? <div className="mt-4 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                    <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{T.viewer.chatTitle}</div>
                    <div ref={chatLogRef} className="mb-2.5 max-h-[180px] overflow-y-auto">
                      {chatLog.length === 0 && (
                        <div className="rounded-lg bg-slate-100 px-3 py-2 text-[12.8px] leading-relaxed dark:bg-slate-800">
                          已完成对 <b>{name}</b> {T.viewer.chatIntro}
                        </div>
                      )}
                      {chatLog.map((m, i) => (
                        <div
                          key={i}
                          className={`mb-2 max-w-[86%] rounded-xl px-3 py-2 text-[12.8px] leading-relaxed ${
                            m.role === "user" ? "ml-auto rounded-br-sm bg-violet-600 text-white" : "rounded-bl-sm bg-slate-100 dark:bg-slate-800"
                          }`}
                        >
                          {m.content}
                        </div>
                      ))}
                      {chatMut.isPending && <div className="mb-2 w-20 rounded-xl bg-slate-100 px-3 py-2 text-[12.8px] dark:bg-slate-800">…</div>}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && sendChat()}
                        placeholder={T.viewer.chatPlaceholder}
                      />
                      <Button className="bg-violet-600 hover:bg-violet-700" disabled={chatMut.isPending || !chatInput.trim()} onClick={sendChat}>
                        {T.viewer.chatSend}
                      </Button>
                    </div>
                  </div> : (
                    <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">
                      {T.viewer.chatUnavailable}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

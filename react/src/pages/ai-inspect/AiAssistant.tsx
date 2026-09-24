import React, { useRef, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2, Send, Sparkles, Wrench, ShieldCheck, ShieldAlert,
  Radar, CheckCircle2, AlertTriangle, Coins, History, MessageSquarePlus, Trash2, X,
} from "lucide-react";
import { apiGetJson, apiPostJson, apiDeleteJson, ApiHttpError } from "@/lib/api";
import { OpenClawChatMarkdown } from "@/components/OpenClawChatMarkdown";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type ToolTrace = { name: string; arguments: string; result: string; durationMs?: number; write?: boolean };
type DiscoverSuggestion = { title: string; target?: string; reason?: string; playbook_yaml?: string };
type DiscoverResult = {
  inventory?: { prometheusFamilies?: Record<string, number>; victoriaLogsConfigured?: boolean;
    services?: { namespace: string; name: string; family: string; ports: string; readyEndpoints: number }[];
    vcenter?: Record<string, unknown>; existingPlaybooks?: string[]; };
  ai?: { summary_markdown?: string; suggestions?: DiscoverSuggestion[]; rawModel?: boolean; };
};
type ChatMsg = {
  role: "user" | "assistant"; content: string;
  toolTrace?: ToolTrace[]; actions?: { tool: string; arguments: string; result: string }[];
  error?: string; live?: string; status?: string;
  /** true 时在此消息底部显示「确认执行」按钮 */
  needsConfirm?: boolean;
  /** 建议后续操作（点击即发送对应问题） */
  suggestedFollowUps?: string[];
};
type SessionMeta = { id: string; title: string; updatedAt: string; msgCount: number };

const QUICK_PROMPTS = [
  "当前集群有哪些异常 Pod？逐个说明原因",
  "检查所有节点的 Ready 状态与资源分配",
  "最近 1 小时集群里有哪些 Warning 事件？",
  "帮我判断 default 命名空间里服务的健康状态",
];

const timeAgo = (iso: string) => {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
};

const AiAssistant: React.FC = () => {
  const [mode, setMode] = useState<"readonly" | "operate">("readonly");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [discover, setDiscover] = useState<DiscoverResult | null>(null);
  const [discoverError, setDiscoverError] = useState("");
  const [showDiscover, setShowDiscover] = useState(false);
  const [appliedFiles, setAppliedFiles] = useState<Record<number, string>>({});
  const [showSessions, setShowSessions] = useState(false);
  /** 二次确认删除的会话 id；再次点击同一条才真正删除 */
  const [confirmDeleteId, setConfirmDeleteId] = useState("");
  /** 待确认的历史（问题+上下文），确认后重发 */
  const pendingRef = useRef<{ question: string; history: { role: string; content: string }[] } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** messages 的实时镜像：自动保存时避免闭包拿到过期消息列表 */
  const messagesRef = useRef<ChatMsg[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  const qc = useQueryClient();

  const cfgQ = useQuery({
    queryKey: ["ops-ai-config"],
    queryFn: () => apiGetJson<{ ai?: { judgeModel?: { enabled?: boolean; model?: string } } }>("/api/ops/ai-config"),
  });

  const usageQ = useQuery({
    queryKey: ["ops-ai-usage"],
    queryFn: () => apiGetJson<{
      today: { totals: { calls: number; totalTokens: number } };
    }>("/api/ops/ai-usage"),
    refetchInterval: 30_000,
  });

  const sessionsQ = useQuery({
    queryKey: ["ai-assistant-sessions"],
    queryFn: () => apiGetJson<{ sessions: SessionMeta[] }>("/api/ops/ai-assistant/sessions"),
  });

  const runDiscover = async () => {
    if (discovering) return;
    setDiscovering(true); setDiscoverError(""); setDiscover(null);
    try {
      const res = await apiPostJson<DiscoverResult>("/api/ops/ai-discover", {});
      setDiscover(res); setShowDiscover(true);
    } catch (e) {
      setDiscoverError(e instanceof ApiHttpError ? e.serverMessage : String(e));
    } finally { setDiscovering(false); }
  };

  const applySuggestion = async (idx: number, target: string, yaml: string) => {
    try {
      const res = await apiPostJson<{ message?: string; file?: string }>("/api/ops/ai-discover/apply", { target, yaml });
      setAppliedFiles((prev) => ({ ...prev, [idx]: res.file || "已保存" }));
    } catch (e) {
      setAppliedFiles((prev) => ({ ...prev, [idx]: "保存失败：" + (e instanceof ApiHttpError ? e.serverMessage : String(e)) }));
    }
  };

  const scrollBottom = () => requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));
  const patchMsg = (idx: number, fn: (m: ChatMsg) => ChatMsg) => setMessages((prev) => {
    if (prev.length <= idx) return prev;
    const cp = [...prev]; cp[idx] = fn(cp[idx]); return cp;
  });

  /** 流式对话并返回是否有被暂缓的写操作 */
  const streamChat = async (question: string, history: { role: string; content: string }[], confirm: boolean, msgIdx: number): Promise<boolean> => {
    let hasProposedWrite = false;
    const resp = await fetch("/api/ops/ai-assistant/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, history, mode, stream: true, confirm }),
    });
    if (!resp.ok || !resp.body) {
      let msg = `HTTP ${resp.status}`;
      try { const j = await resp.json(); if (j?.error) msg = j.error; } catch { /* 非 JSON 错误响应，保留默认消息 */ }
      throw new Error(msg);
    }
    const reader = resp.body.getReader(); const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        let ev: {
          type?: string; message?: string; round?: number; name?: string; arguments?: string;
          write?: boolean; result?: string; durationMs?: number; error?: string; reply?: string;
          toolTrace?: ToolTrace[]; actions?: { tool: string; arguments: string; result: string }[];
        };
        try { ev = JSON.parse(line); } catch { continue; }
        if (ev.type === "status") {
          patchMsg(msgIdx, (m) => ({ ...m, status: ev.message, live: undefined }));
        } else if (ev.type === "tool_start") {
          const args = typeof ev.arguments === "string" ? ev.arguments : JSON.stringify(ev.arguments ?? {});
          patchMsg(msgIdx, (m) => ({ ...m, status: undefined, live: `${ev.name} ${args}` }));
        } else if (ev.type === "tool_result") {
          const args = typeof ev.arguments === "string" ? ev.arguments : JSON.stringify(ev.arguments ?? {});
          if (ev.write && (ev.result ?? "").includes("[操作已暂缓]")) { hasProposedWrite = true; }
          patchMsg(msgIdx, (m) => ({ ...m, status: undefined, live: undefined,
            toolTrace: [...(m.toolTrace ?? []), { name: ev.name ?? "", arguments: args,
              result: (ev.result ?? "").slice(0, 800), durationMs: ev.durationMs, write: ev.write }] }));
        } else if (ev.type === "proposed") {
          // 后端对被暂缓的写操作发出 proposed 事件
          hasProposedWrite = true;
          const args = typeof ev.arguments === "string" ? ev.arguments : JSON.stringify(ev.arguments ?? {});
          patchMsg(msgIdx, (m) => ({ ...m, status: undefined, live: undefined,
            toolTrace: [...(m.toolTrace ?? []), { name: ev.name ?? "", arguments: args,
              result: "[操作已暂缓] 等待用户确认", write: true }] }));
        } else if (ev.type === "final") {
          const sugg = (ev as any).suggestedFollowUps as string[] | undefined;
          patchMsg(msgIdx, (m) => ({ ...m, content: ev.reply || "（模型未返回内容）",
            toolTrace: ev.toolTrace ?? m.toolTrace, actions: ev.actions, status: undefined, live: undefined,
            suggestedFollowUps: sugg }));
        } else if (ev.type === "error") {
          patchMsg(msgIdx, (m) => ({ ...m, error: ev.error || "执行失败", status: undefined, live: undefined }));
        }
        scrollBottom();
      }
    }
    return hasProposedWrite;
  };

  const send = async (text: string) => {
    const question = text.trim(); if (!question || busy) return;
    setInput(""); setBusy(true);
    const history = messages.filter((m) => !m.error && m.content).slice(-6).map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: "user", content: question }, { role: "assistant", content: "" }]);
    scrollBottom();
    try {
      const hasWrites = await streamChat(question, history, false, messages.length + 1);
      if (hasWrites) {
        pendingRef.current = { question, history };
        patchMsg(messages.length + 1, (m) => ({ ...m, needsConfirm: true }));
      }
      // 自动保存会话
      void saveSession();
    } catch (e) {
      patchMsg(messages.length + 1, (m) => ({ ...m, error: e instanceof Error ? e.message : String(e), status: undefined, live: undefined }));
    } finally { setBusy(false); scrollBottom(); }
  };

  /** 自动保存当前对话到后端（PlatformKV 持久化） */
  const saveSession = async () => {
    try {
      const id = sessionId || `sess-${Date.now()}`;
      await apiPostJson("/api/ops/ai-assistant/sessions", {
        id,
        title: messagesRef.current.find((m) => m.role === "user")?.content?.slice(0, 40) || "AI 对话",
        messages: messagesRef.current.filter((m) => m.content).map((m) => ({ role: m.role, content: m.content })),
      });
      if (!sessionId) setSessionId(id);
      void qc.invalidateQueries({ queryKey: ["ai-assistant-sessions"] });
    } catch { /* 后台保存，失败不影响前端 */ }
  };

  /** 拉取并载入一个历史会话 */
  const loadSession = async (id: string, silent = false) => {
    try {
      const sess = await apiGetJson<{ id: string; messages?: { role: string; content: string }[] }>(
        `/api/ops/ai-assistant/sessions/${id}`,
      );
      if (sess.messages?.length) {
        setSessionId(sess.id);
        setMessages(sess.messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })));
        requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));
      }
    } catch (e) {
      if (!silent) toast.error(e instanceof ApiHttpError ? e.serverMessage : "会话加载失败");
    } finally {
      setShowSessions(false);
    }
  };

  /** 开启新对话（当前内容已在上一轮发送后自动保存） */
  const newConversation = () => {
    if (busy) return;
    setSessionId("");
    setMessages([]);
    pendingRef.current = null;
    setConfirmDeleteId("");
    setShowSessions(false);
  };

  /** 删除历史会话（二次确认） */
  const deleteSession = async (id: string) => {
    if (confirmDeleteId !== id) { setConfirmDeleteId(id); return; }
    setConfirmDeleteId("");
    try {
      await apiDeleteJson(`/api/ops/ai-assistant/sessions/${id}`);
      if (id === sessionId) { setSessionId(""); setMessages([]); pendingRef.current = null; }
      toast.success("会话已删除");
      void qc.invalidateQueries({ queryKey: ["ai-assistant-sessions"] });
    } catch (e) {
      toast.error(e instanceof ApiHttpError ? e.serverMessage : "删除失败");
    }
  };

  // 首次进入恢复最近一个会话（仅一次）
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || !sessionsQ.isSuccess) return;
    restoredRef.current = true;
    const latest = sessionsQ.data?.sessions?.[0];
    if (latest) void loadSession(latest.id, true);

  }, [sessionsQ.isSuccess, sessionsQ.data]);

  /** 用户点击确认后，以 confirm=true 重发同一问题 */
  const resendConfirmed = () => {
    const p = pendingRef.current; if (!p || busy) return;
    pendingRef.current = null;
    setBusy(true);
    const history = messages.filter((m) => !m.error && m.content).slice(-6).map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: "user", content: p.question }, { role: "assistant", content: "" }]);
    scrollBottom();
    streamChat(p.question, history, true, messages.length + 1)
      .catch((e) => patchMsg(messages.length, (m) => ({ ...m, error: e instanceof Error ? e.message : String(e) })))
      .finally(() => { setBusy(false); scrollBottom(); void saveSession(); });
  };

  const judgeReady = cfgQ.data?.ai?.judgeModel?.enabled;
  const today = usageQ.data?.today?.totals;
  const model = cfgQ.data?.ai?.judgeModel?.model || "—";

  return (
    <div className="fixed inset-0 left-64 top-[72px] z-30 flex flex-col overflow-hidden bg-slate-50 pt-3">
      {/* 紧凑顶栏 */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-white px-4 py-2.5">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-bold text-slate-900">AI 运维助手</h1>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">{model}</span>
          {today && today.calls > 0 ? (
            <span className="flex items-center gap-1 text-[10px] text-slate-400">
              <Coins className="h-3 w-3" />
              今日 {today.calls} 次 · {today.totalTokens.toLocaleString()} tokens
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs"
            onClick={newConversation} disabled={busy}>
            <MessageSquarePlus className="h-3 w-3" />
            新对话
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs"
            onClick={() => { setConfirmDeleteId(""); setShowSessions(true); }}>
            <History className="h-3 w-3" />
            历史会话
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs"
            onClick={() => { void runDiscover(); setShowDiscover(true); }}
            disabled={discovering || judgeReady === false}>
            {discovering ? <Loader2 className="h-3 w-3 animate-spin" /> : <Radar className="h-3 w-3" />}
            服务发现
          </Button>
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
            <ShieldCheck className={cn("h-3.5 w-3.5", mode === "operate" ? "text-amber-600" : "text-emerald-600")} />
            <Switch checked={mode === "operate"} onCheckedChange={(v) => setMode(v ? "operate" : "readonly")} />
            <Label className={cn("text-xs", mode === "operate" ? "text-amber-700" : "text-slate-600")}>
              {mode === "operate" ? "运维模式" : "只读"}
            </Label>
          </div>
        </div>
      </div>

      {judgeReady === false ? (
        <div className="shrink-0 rounded-none border-b border-amber-200 bg-amber-50/90 px-4 py-2 text-xs text-amber-950">
          请到 <a href="/cluster/ai-inspect/configure" className="underline">AI 巡检配置</a> 启用判读模型并填写 API Key。
        </div>
      ) : null}

      {showDiscover && discover?.ai?.summary_markdown ? (
        <div className="max-h-[28vh] shrink-0 space-y-2 overflow-y-auto border-b border-violet-200/60 bg-violet-50/30 p-3">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
              <Radar className="h-3.5 w-3.5 text-violet-600" /> AI 服务发现报告
            </p>
            <Button type="button" size="sm" variant="ghost" className="h-6 px-1.5 text-[11px]" onClick={() => setShowDiscover(false)}>收起</Button>
          </div>
          <div className="rounded-md border border-slate-200 bg-white/90 px-2.5 py-1.5 text-[12px]">
            <OpenClawChatMarkdown source={discover.ai.summary_markdown} />
          </div>
          {(discover.ai.suggestions ?? []).map((s, i) => (
            <div key={i} className="rounded-md border border-violet-200/60 bg-white/90 px-2.5 py-1.5 text-[12px]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{i + 1}. {s.title}</span>
                {s.playbook_yaml ? (
                  appliedFiles[i] ? (
                    <span className="flex items-center gap-1 text-xs text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" /> {appliedFiles[i]}
                    </span>
                  ) : (
                    <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[11px]"
                      onClick={() => void applySuggestion(i, s.target || s.title, s.playbook_yaml || "")}>
                      采纳为剧本
                    </Button>
                  )
                ) : null}
              </div>
              {s.reason ? <p className="mt-0.5 text-[11px] text-slate-500">{s.reason}</p> : null}
            </div>
          ))}
        </div>
      ) : null}

      {/* 历史会话抽屉 */}
      {showSessions ? (
        <>
          <div className="absolute inset-0 z-10 bg-slate-900/20" onClick={() => setShowSessions(false)} />
          <aside className="absolute bottom-0 left-0 top-0 z-20 flex w-72 flex-col border-r border-slate-200 bg-white shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                <History className="h-3.5 w-3.5 text-slate-500" /> 历史会话
              </p>
              <Button type="button" size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setShowSessions(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
              {(sessionsQ.data?.sessions ?? []).map((s) => (
                <li key={s.id} className="group flex items-center gap-1">
                  <button
                    type="button"
                    className={cn(
                      "min-w-0 flex-1 rounded-lg px-2.5 py-2 text-left",
                      s.id === sessionId ? "bg-sky-50" : "hover:bg-slate-50",
                    )}
                    onClick={() => void loadSession(s.id)}
                  >
                    <span className="block truncate text-[13px] text-slate-900">{s.title}</span>
                    <span className="mt-0.5 block text-[10px] text-slate-400">
                      {s.msgCount} 条{s.updatedAt ? ` · ${timeAgo(s.updatedAt)}` : ""}
                    </span>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-7 w-7 shrink-0 p-0 opacity-0 group-hover:opacity-100",
                      confirmDeleteId === s.id ? "text-red-600 opacity-100" : "text-slate-400",
                    )}
                    title={confirmDeleteId === s.id ? "再次点击确认删除" : "删除会话"}
                    onClick={() => void deleteSession(s.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
              {(sessionsQ.data?.sessions ?? []).length === 0 ? (
                <li className="px-2.5 py-6 text-center text-xs text-slate-400">暂无历史会话</li>
              ) : null}
            </ul>
            <div className="shrink-0 border-t border-slate-100 p-2">
              <Button type="button" variant="secondary" className="h-8 w-full text-xs" onClick={newConversation} disabled={busy}>
                <MessageSquarePlus className="mr-1 h-3.5 w-3.5" /> 开启新对话
              </Button>
            </div>
          </aside>
        </>
      ) : null}

      {/* 对话区域——唯一滚动区域 */}
      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="space-y-2.5">
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <Sparkles className="h-4 w-4 text-violet-500" /> 试试这些：
            </p>
            <div className="flex flex-wrap gap-2">
              {QUICK_PROMPTS.map((p) => (
                <Button key={p} type="button" variant="secondary" className="h-8 px-3 text-xs" onClick={() => void send(p)}>
                  {p}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        {messages.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn(
              "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm",
              m.role === "user" ? "bg-sky-600 text-white"
                : m.error ? "border border-red-200 bg-red-50/90 text-red-900"
                : "border border-slate-200 bg-slate-50/90 text-slate-900"
            )}>
              {m.role === "assistant" && !m.error && m.content ? (
                <OpenClawChatMarkdown source={m.content} />
              ) : m.role === "assistant" && !m.error ? null : (
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
              )}
              {m.role === "assistant" && (m.status || m.live) ? (
                <p className="mt-2 flex items-center gap-2 font-mono text-[11px] text-slate-500">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {m.status || `正在检查：${m.live}`}
                </p>
              ) : null}
              {/* 内联确认按钮：AI 提出写操作且未执行时显示 */}
              {m.role === "assistant" && m.needsConfirm ? (
                <div className="mt-2 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50/90 px-3 py-2">
                  <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" />
                  <span className="text-xs font-medium text-amber-900">以上操作需要你的确认才会执行</span>
                  <Button type="button" size="sm" className="ml-auto h-7 bg-amber-600 px-3 text-xs text-white hover:bg-amber-700"
                    onClick={resendConfirmed}>
                    确认执行
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs"
                    onClick={() => patchMsg(i, (msg) => ({ ...msg, needsConfirm: false }))}>
                    取消
                  </Button>
                </div>
              ) : null}
              {m.toolTrace && m.toolTrace.length > 0 ? (
                <details className="mt-2 rounded-lg border border-slate-200 bg-white/80 px-2 py-1.5" open={Boolean(m.status || m.live)}>
                  <summary className="cursor-pointer text-[11px] font-medium text-slate-600">
                    <Wrench className="mr-1 inline h-3 w-3" /> 工具调用 {m.toolTrace.length} 次
                  </summary>
                  <ul className="mt-1.5 space-y-1.5">
                    {m.toolTrace.map((t, j) => (
                      <li key={j} className="font-mono text-[10px] leading-relaxed text-slate-700">
                        <span className={cn("font-semibold", t.write ? "text-amber-700" : "text-sky-700")}>{t.name}</span>
                        {t.write ? "（写）" : ""} {t.arguments}
                        {t.durationMs != null ? <span className="text-slate-400"> · {t.durationMs}ms</span> : null}
                        <span className="mt-0.5 block whitespace-pre-wrap break-words text-slate-500">{t.result?.slice(0, 300)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
              {m.actions && m.actions.length > 0 ? (
                <div className="mt-2 space-y-1">
                  {m.actions.map((a, j) => (
                    <p key={j} className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 font-mono text-[10px] text-amber-900">
                      已执行：{a.tool} {a.arguments} → {a.result}
                    </p>
                  ))}
                </div>
              ) : null}
              {m.suggestedFollowUps && m.suggestedFollowUps.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2">
                  {m.suggestedFollowUps.map((s, j) => (
                    <Button key={j} type="button" variant="outline" size="sm"
                      className="h-6 px-2 text-[11px] text-cyan-700 border-cyan-200 hover:bg-cyan-50"
                      onClick={() => void send(s)}>
                      {s}
                    </Button>
                  ))}
                </div>
              ) : null}
              {m.error ? <p className="text-sm">{m.error}</p> : null}
            </div>
          </div>
        ))}
        {busy && (messages.length === 0 || messages[messages.length - 1]?.role === "user") ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> 助手思考中…
          </div>
        ) : null}
      </div>

      {/* 输入框 */}
      <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-2.5">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
          <Input value={input} placeholder={mode === "operate" ? "描述问题或故障处置需求…" : "询问集群状态、服务健康、故障定位…"}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); void send(input); } }} />
          <Button type="submit" disabled={busy || !input.trim()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </div>

    </div>
  );
};

export default AiAssistant;

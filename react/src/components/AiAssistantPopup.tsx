import React, { useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2, Send, Sparkles, Wrench, ShieldCheck, ShieldAlert, Bot, X,
} from "lucide-react";
import { apiGetJson } from "@/lib/api";
import { lazy, Suspense } from "react";
// markdown 渲染链（react-markdown/katex 等）体积大，仅在弹窗首次展示消息时加载
const OpenClawChatMarkdown = lazy(() =>
  import("@/components/OpenClawChatMarkdown").then((m) => ({ default: m.OpenClawChatMarkdown }))
);
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/auth/auth-context";

// 全局 AI 助手弹窗：随随地呼出（桌面右侧抽屉 / 移动端底部抽屉）。
// 与全屏 AI 助手共用后端 GLM function calling 通道（/api/ops/ai-assistant/chat），
// 内置「创建用户」快捷指令（headscale / Authentik 双模），写操作走运维模式 + 二次确认。
// 仅 admin 可见（后端 chat 端点为 AdminOnly）；堡垒机与 Pod 终端全屏页自动隐藏。

type ToolTrace = { name: string; arguments: string; result: string; durationMs?: number; write?: boolean };
type ChatAction = { tool: string; arguments: string; result: string };
type ChatMsg = {
  role: "user" | "assistant";
  content: string;
  toolTrace?: ToolTrace[];
  actions?: ChatAction[];
  error?: string;
  live?: string;
  status?: string;
  needsConfirm?: boolean;
};

/** 双模建户快捷指令：点击后填入输入框，由管理员补全用户名等信息后发送 */
const USER_QUICK_PROMPTS = [
  "在 Authentik 上创建 SSO 用户：用户名（待补充），邮箱（待补充），加入 users 组，并生成初始密码",
  "在 headscale 上创建异地组网用户（用户名待补充），并签发一个 24 小时可复用的加入密钥",
  "查询 Authentik 现有用户，确认某用户名是否已存在",
  "列出 headscale 现有用户",
];

/** 与 AppLayout 一致的全屏页判定：这些页面不注入悬浮按钮 */
function isFullBleedPath(pathname: string): boolean {
  const isBastion =
    pathname === "/cluster/bastion" ||
    pathname.startsWith("/cluster/bastion/") ||
    pathname === "/cluster/vcenter/bastion" ||
    pathname.startsWith("/cluster/vcenter/bastion/");
  const isPodTerminal = /\/cluster\/ns\/[^/]+\/pods\/[^/]+\/terminal\/?$/.test(pathname);
  return isBastion || isPodTerminal;
}

const AiAssistantPopup: React.FC = () => {
  const { pathname } = useLocation();
  const { status } = useAuth();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"readonly" | "operate">("readonly");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  /** 待确认写操作的历史（问题+上下文），确认后以 confirm=true 重发 */
  const pendingRef = useRef<{ question: string; history: { role: string; content: string }[] } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const cfgQ = useQuery({
    queryKey: ["ops-ai-config"],
    queryFn: () => apiGetJson<{ ai?: { judgeModel?: { enabled?: boolean; model?: string } } }>("/api/ops/ai-config"),
    enabled: open,
    staleTime: 60_000,
  });
  const judgeReady = cfgQ.data?.ai?.judgeModel?.enabled;
  const model = cfgQ.data?.ai?.judgeModel?.model || "—";

  if (status?.role !== "admin" || isFullBleedPath(pathname)) return null;

  const scrollBottom = () =>
    requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));
  const patchMsg = (idx: number, fn: (m: ChatMsg) => ChatMsg) =>
    setMessages((prev) => {
      if (prev.length <= idx) return prev;
      const cp = [...prev];
      cp[idx] = fn(cp[idx]);
      return cp;
    });

  const streamChat = async (
    question: string,
    history: { role: string; content: string }[],
    confirm: boolean,
    msgIdx: number,
  ): Promise<boolean> => {
    let hasProposedWrite = false;
    const resp = await fetch("/api/ops/ai-assistant/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, history, mode, stream: true, confirm }),
    });
    if (!resp.ok || !resp.body) {
      let msg = `HTTP ${resp.status}`;
      try {
        const j = await resp.json();
        if (j?.error) msg = j.error;
      } catch { /* 忽略非 JSON 错误体 */ }
      throw new Error(msg);
    }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        let ev: {
          type?: string; message?: string; name?: string; arguments?: unknown;
          write?: boolean; result?: string; durationMs?: number; error?: string; reply?: string;
          toolTrace?: ToolTrace[]; actions?: ChatAction[];
        };
        try {
          ev = JSON.parse(line);
        } catch {
          continue;
        }
        const argsStr = typeof ev.arguments === "string" ? ev.arguments : JSON.stringify(ev.arguments ?? {});
        if (ev.type === "status") {
          patchMsg(msgIdx, (m) => ({ ...m, status: ev.message, live: undefined }));
        } else if (ev.type === "tool_start") {
          patchMsg(msgIdx, (m) => ({ ...m, status: undefined, live: `${ev.name} ${argsStr}` }));
        } else if (ev.type === "tool_result") {
          if (ev.write && (ev.result ?? "").includes("[操作已暂缓]")) hasProposedWrite = true;
          patchMsg(msgIdx, (m) => ({
            ...m, status: undefined, live: undefined,
            toolTrace: [...(m.toolTrace ?? []), { name: ev.name ?? "", arguments: argsStr, result: (ev.result ?? "").slice(0, 800), durationMs: ev.durationMs, write: ev.write }],
          }));
        } else if (ev.type === "proposed") {
          hasProposedWrite = true;
          patchMsg(msgIdx, (m) => ({
            ...m, status: undefined, live: undefined,
            toolTrace: [...(m.toolTrace ?? []), { name: ev.name ?? "", arguments: argsStr, result: "[操作已暂缓] 等待用户确认", write: true }],
          }));
        } else if (ev.type === "final") {
          patchMsg(msgIdx, (m) => ({
            ...m, content: ev.reply || "（模型未返回内容）", toolTrace: ev.toolTrace ?? m.toolTrace,
            actions: ev.actions, status: undefined, live: undefined,
          }));
        } else if (ev.type === "error") {
          patchMsg(msgIdx, (m) => ({ ...m, error: ev.error || "执行失败", status: undefined, live: undefined }));
        }
        scrollBottom();
      }
    }
    return hasProposedWrite;
  };

  const historyOf = () =>
    messages.filter((m) => !m.error && m.content).slice(-6).map((m) => ({ role: m.role, content: m.content }));

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    setInput("");
    setBusy(true);
    const history = historyOf();
    setMessages((prev) => [...prev, { role: "user", content: question }, { role: "assistant", content: "" }]);
    scrollBottom();
    try {
      const hasWrites = await streamChat(question, history, false, messages.length + 1);
      if (hasWrites) {
        pendingRef.current = { question, history };
        patchMsg(messages.length + 1, (m) => ({ ...m, needsConfirm: true }));
      }
    } catch (e) {
      patchMsg(messages.length + 1, (m) => ({
        ...m, error: e instanceof Error ? e.message : String(e), status: undefined, live: undefined,
      }));
    } finally {
      setBusy(false);
      scrollBottom();
    }
  };

  const resendConfirmed = () => {
    const p = pendingRef.current;
    if (!p || busy) return;
    pendingRef.current = null;
    setBusy(true);
    const history = historyOf();
    setMessages((prev) => [...prev, { role: "user", content: p.question }, { role: "assistant", content: "" }]);
    scrollBottom();
    streamChat(p.question, history, true, messages.length + 1)
      .catch((e) =>
        patchMsg(messages.length, (m) => ({ ...m, error: e instanceof Error ? e.message : String(e) })))
      .finally(() => {
        setBusy(false);
        scrollBottom();
      });
  };

  return (
    <>
      {/* 悬浮呼出按钮：移动端抬高避开底部导航 */}
      <button
        type="button"
        aria-label="AI 助手"
        onClick={() => setOpen(true)}
        className={cn(
          "fixed z-40 flex h-12 w-12 items-center justify-center rounded-full bg-violet-600 text-white shadow-lg shadow-violet-600/30 transition hover:bg-violet-700 active:scale-95",
          isMobile ? "bottom-20 right-4" : "bottom-6 right-6",
        )}
      >
        <Bot className="h-6 w-6" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={cn(
            "flex flex-col gap-0 p-0",
            isMobile ? "h-[85dvh] rounded-t-2xl" : "w-[420px] p-0 sm:max-w-[420px]",
          )}
        >
          <SheetHeader className="shrink-0 border-b border-slate-100 px-4 py-3">
            <div className="flex items-center justify-between">
              <SheetTitle className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Sparkles className="h-4 w-4 text-violet-500" /> AI 助手
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-normal text-slate-600">{model}</span>
              </SheetTitle>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1">
                  <ShieldCheck className={cn("h-3 w-3", mode === "operate" ? "text-amber-600" : "text-emerald-600")} />
                  <Switch
                    checked={mode === "operate"}
                    onCheckedChange={(v) => setMode(v ? "operate" : "readonly")}
                  />
                  <Label className={cn("text-[11px]", mode === "operate" ? "text-amber-700" : "text-slate-600")}>
                    {mode === "operate" ? "运维" : "只读"}
                  </Label>
                </div>
                <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <SheetDescription className="sr-only">AI 运维助手弹窗，支持 headscale 与 Authentik 双模动态创建用户</SheetDescription>
          </SheetHeader>

          {judgeReady === false ? (
            <div className="shrink-0 border-b border-amber-200 bg-amber-50/90 px-4 py-2 text-xs text-amber-950">
              判读模型未启用：请先到{" "}
              <a href="/cluster/ai-inspect/configure" className="underline" onClick={() => setOpen(false)}>
                AI 巡检配置
              </a>{" "}
              启用并填写 API Key。
            </div>
          ) : null}

          {/* 消息区 */}
          <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            {messages.length === 0 ? (
              <div className="space-y-2.5">
                <p className="text-xs leading-relaxed text-slate-500">
                  试试下面的快捷指令（创建用户需切换到「运维」模式并二次确认）：
                </p>
                <div className="flex flex-col gap-2">
                  {USER_QUICK_PROMPTS.map((p) => (
                    <Button
                      key={p}
                      type="button"
                      variant="secondary"
                      className="h-auto whitespace-normal px-3 py-2 text-left text-xs leading-relaxed"
                      onClick={() => setInput(p)}
                    >
                      {p}
                    </Button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400">
                  提示：点击快捷指令会填入输入框，补全用户名/邮箱后发送；也可以直接用自然语言描述。
                </p>
              </div>
            ) : null}
            {messages.map((m, i) => (
              <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[88%] rounded-2xl px-3 py-2 text-sm",
                    m.role === "user"
                      ? "bg-sky-600 text-white"
                      : m.error
                        ? "border border-red-200 bg-red-50/90 text-red-900"
                        : "border border-slate-200 bg-slate-50/90 text-slate-900",
                  )}
                >
                  {m.role === "assistant" && !m.error && m.content ? (
                    <Suspense fallback={<div className="py-2 text-xs text-slate-400">渲染中…</div>}>
                      <OpenClawChatMarkdown source={m.content} />
                    </Suspense>
                  ) : m.role === "assistant" && !m.error ? null : (
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  )}
                  {m.role === "assistant" && (m.status || m.live) ? (
                    <p className="mt-2 flex items-center gap-2 font-mono text-[11px] text-slate-500">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {m.status || `正在检查：${m.live}`}
                    </p>
                  ) : null}
                  {m.role === "assistant" && m.needsConfirm ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50/90 px-2.5 py-2">
                      <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" />
                      <span className="text-xs font-medium text-amber-900">确认执行该写操作？</span>
                      <Button
                        type="button"
                        size="sm"
                        className="ml-auto h-7 bg-amber-600 px-3 text-xs text-white hover:bg-amber-700"
                        onClick={resendConfirmed}
                      >
                        确认执行
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                          pendingRef.current = null;
                          patchMsg(i, (msg) => ({ ...msg, needsConfirm: false }));
                        }}
                      >
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
                            <span className="mt-0.5 block whitespace-pre-wrap break-words text-slate-500">{t.result?.slice(0, 300)}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
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

          {/* 输入区：移动端额外避开 iOS 安全区 */}
          <div className="shrink-0 border-t border-slate-100 bg-white px-3 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-2.5">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
            >
              <Input
                value={input}
                placeholder={mode === "operate" ? "如：在 Authentik 创建用户 zhangsan…" : "询问集群状态、创建用户准备…"}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
              />
              <Button type="submit" disabled={busy || !input.trim()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default AiAssistantPopup;

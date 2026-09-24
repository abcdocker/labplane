import React, { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSshLabPlaneXtermOptions } from "@/hooks/use-ssh-labplane-xterm-options";
import { tryLoadXtermWebgl } from "@/lib/xtermShared";
import PlatformRelayBanner from "@/components/PlatformRelayBanner";
import { ApiHttpError, apiGetJson, wsUrlForApiPath } from "@/lib/api";
import { Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function whenTerminalHostReady(
  getEl: () => HTMLDivElement | null,
  run: (el: HTMLDivElement) => void,
  opts?: { maxMs?: number; intervalMs?: number; onTimeout?: () => void }
): () => void {
  const maxMs = opts?.maxMs ?? 4000;
  const intervalMs = opts?.intervalMs ?? 24;
  const start = performance.now();
  const id = window.setInterval(() => {
    const el = getEl();
    if (el) {
      window.clearInterval(id);
      run(el);
      return;
    }
    if (performance.now() - start > maxMs) {
      window.clearInterval(id);
      opts?.onTimeout?.();
    }
  }, intervalMs);
  return () => window.clearInterval(id);
}

type InstanceSshPreflight = {
  readiness?: { ready?: boolean; message?: string };
};

type SshPreflightApi = {
  ok?: boolean;
  /** false 表示服务端可用库中加密的 root 密码直连，弹窗无需再填密码 */
  requireManualPassword?: boolean;
  canDecryptStored?: boolean;
  encryptionKeyReady?: boolean;
  podName?: string;
  sshFailCount?: number;
  needCaptcha?: boolean;
};

type SshWsErr = {
  type: "ssh_error";
  code?: string;
  message?: string;
  needCaptcha?: boolean;
  failCount?: number;
};

export type CloudVmSshTerminalSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceId: number;
};

function parseSshWsFirstMessage(data: string | ArrayBuffer): SshWsErr | { type: "ssh_ready" } | null {
  let text: string;
  if (typeof data === "string") {
    text = data;
  } else {
    const dec = new TextDecoder().decode(new Uint8Array(data));
    if (!dec.trimStart().startsWith("{")) return null;
    text = dec;
  }
  try {
    const j = JSON.parse(text) as { type?: string; code?: string; message?: string; needCaptcha?: boolean; failCount?: number };
    if (j.type === "ssh_ready") return { type: "ssh_ready" };
    if (j.type === "ssh_error") {
      return {
        type: "ssh_error",
        code: j.code,
        message: j.message,
        needCaptcha: j.needCaptcha,
        failCount: j.failCount,
      };
    }
  } catch {
    return null;
  }
  return null;
}

/** 应用中心云主机：连接前输入 root 密码；3 次失败后需验证码；错误留在本页提示 */
const CloudVmSshTerminalSheet: React.FC<CloudVmSshTerminalSheetProps> = ({
  open,
  onOpenChange,
  instanceId,
}) => {
  const xtermOpts = useSshLabPlaneXtermOptions();
  const wrapRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const [password, setPassword] = useState("");
  const [captchaId, setCaptchaId] = useState("");
  const [captchaQuestion, setCaptchaQuestion] = useState("");
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [needCaptcha, setNeedCaptcha] = useState(false);

  const [status, setStatus] = useState<"idle" | "connecting" | "open" | "closed" | "error">("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const disposeRef = useRef<(() => void) | null>(null);
  const cancelWaitRef = useRef<(() => void) | null>(null);
  const connectCancelledRef = useRef(false);

  const base = `/api/app-center/cloud-vm/instances/${encodeURIComponent(String(instanceId))}`;

  const preflightQ = useQuery({
    queryKey: ["cloud-vm-ssh-preflight", instanceId],
    queryFn: ({ signal }) => apiGetJson<SshPreflightApi>(`${base}/ssh/preflight`, { signal }),
    enabled: open && instanceId > 0,
    refetchInterval: open && instanceId > 0 ? 5000 : false,
    staleTime: 0,
  });
  const sshMeta = preflightQ.data ?? null;

  const loadCaptcha = useCallback(async () => {
    try {
      const c = await apiGetJson<{ captchaId?: string; question?: string }>(`${base}/ssh/captcha`);
      setCaptchaId(c.captchaId ?? "");
      setCaptchaQuestion(c.question ?? "");
      setCaptchaAnswer("");
    } catch {
      setCaptchaQuestion("（无法加载验证码，请稍后重试）");
    }
  }, [base]);

  useEffect(() => {
    if (!open || instanceId <= 0) {
      setPassword("");
      setCaptchaId("");
      setCaptchaQuestion("");
      setCaptchaAnswer("");
      setNeedCaptcha(false);
      setErrMsg(null);
      setStatus("idle");
    }
  }, [open, instanceId]);

  useEffect(() => {
    const p = preflightQ.data;
    if (!open || !p) return;
    setNeedCaptcha(Boolean(p.needCaptcha));
  }, [open, preflightQ.data]);

  useEffect(() => {
    if (!open || !preflightQ.data?.needCaptcha) return;
    let cancelled = false;
    void (async () => {
      try {
        const c = await apiGetJson<{ captchaId?: string; question?: string }>(`${base}/ssh/captcha`);
        if (cancelled) return;
        setCaptchaId(c.captchaId ?? "");
        setCaptchaQuestion(c.question ?? "");
        setCaptchaAnswer("");
      } catch {
        if (!cancelled) setCaptchaQuestion("（无法加载验证码，请稍后重试）");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, preflightQ.data?.needCaptcha, base]);

  useEffect(() => {
    if (open) {
      connectCancelledRef.current = false;
      return;
    }
    connectCancelledRef.current = true;
    cancelWaitRef.current?.();
    cancelWaitRef.current = null;
    disposeRef.current?.();
    disposeRef.current = null;
  }, [open]);

  const handleConnect = useCallback(async () => {
    if (instanceId <= 0) return;

    connectCancelledRef.current = false;
    cancelWaitRef.current?.();
    cancelWaitRef.current = null;
    disposeRef.current?.();
    disposeRef.current = null;

    setStatus("connecting");
    setErrMsg(null);

    let useStoredPassword = false;
    try {
      const pf0 = await apiGetJson<SshPreflightApi>(`${base}/ssh/preflight`);
      if (connectCancelledRef.current) return;
      useStoredPassword = pf0.requireManualPassword === false;
    } catch {
      useStoredPassword = false;
    }

    const pwd = password.trim();
    if (!useStoredPassword && !pwd) {
      setErrMsg("请输入 root 密码");
      setStatus("error");
      return;
    }

    try {
      const d = await apiGetJson<InstanceSshPreflight>(base);
      if (connectCancelledRef.current) return;
      if (d.readiness?.ready !== true) {
        setErrMsg(
          d.readiness?.message?.trim()
            ? d.readiness.message
            : "Pod/SSH 尚未就绪，请稍后重试（详情页可查看部署进度）"
        );
        setStatus("error");
        return;
      }
      const pf = await apiGetJson<SshPreflightApi>(`${base}/ssh/preflight`);
      if (connectCancelledRef.current) return;
      if (pf.needCaptcha) {
        setNeedCaptcha(true);
        if (!captchaAnswer.trim()) {
          await loadCaptcha();
          setErrMsg("已连续多次密码错误，请填写验证码后重试。");
          setStatus("error");
          return;
        }
      }
    } catch (e) {
      if (connectCancelledRef.current) return;
      if (e instanceof ApiHttpError) {
        if (e.status === 401) {
          setErrMsg("未登录或会话已过期，请重新登录后再打开 SSH 终端。");
        } else if (e.status === 403) {
          setErrMsg("权限错误");
        } else if (e.status === 503) {
          setErrMsg(e.serverMessage || "服务暂时不可用。");
        } else {
          setErrMsg(e.serverMessage || `${e.status} ${e.path}`);
        }
      } else {
        setErrMsg(e instanceof Error ? e.message : "无法校验实例状态");
      }
      setStatus("error");
      return;
    }

    if (connectCancelledRef.current) return;

    cancelWaitRef.current = whenTerminalHostReady(
      () => wrapRef.current,
      (el) => {
        if (connectCancelledRef.current) return;

        const wsUrl = wsUrlForApiPath(`${base}/ssh/ws`);
        const ws = new WebSocket(wsUrl);
        ws.binaryType = "arraybuffer";

        ws.onopen = () => {
          if (connectCancelledRef.current) return;
          ws.send(
            JSON.stringify({
              type: "auth",
              password: useStoredPassword ? "" : pwd,
              captchaId: captchaId || undefined,
              captchaAnswer: captchaAnswer.trim() || undefined,
            })
          );
        };

        ws.onerror = () => {
          if (connectCancelledRef.current) return;
          setErrMsg("WebSocket 握手失败，请确认已登录及代理配置。");
          setStatus("error");
        };

        ws.onclose = (ev) => {
          if (connectCancelledRef.current) return;
          setStatus("closed");
          if (!ev.wasClean && ev.code !== 1000) {
            setErrMsg((prev) => prev ?? `连接关闭（code ${ev.code}${ev.reason ? ` ${ev.reason}` : ""}）`);
          }
        };

        const term = new XTerm(xtermOpts);
        const fit = new FitAddon();
        term.loadAddon(fit);
        term.open(el);
        tryLoadXtermWebgl(term);
        const doFit = () => {
          try {
            fit.fit();
          } catch {
            /* 容器宽高为 0 时 fit 可能抛错 */
          }
        };
        doFit();
        requestAnimationFrame(() => {
          doFit();
          requestAnimationFrame(doFit);
        });
        term.writeln("");
        term.writeln("\x1b[96m●\x1b[0m \x1b[90m正在连接 SSH，请稍候…\x1b[0m");
        term.writeln("");

        const sendResize = () => {
          doFit();
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
          }
        };

        let started = false;

        const attachTermData = () => {
          const sub = term.onData((data) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(new TextEncoder().encode(data));
            }
          });
          const onWinResize = () => sendResize();
          window.addEventListener("resize", onWinResize);
          const ro = new ResizeObserver(() => sendResize());
          const roTarget = el.parentElement ?? el;
          ro.observe(roTarget);
          disposeRef.current = () => {
            window.removeEventListener("resize", onWinResize);
            ro.disconnect();
            sub.dispose();
            try {
              ws.close();
            } catch {
              /* ignore */
            }
            term.dispose();
          };
        };

        ws.onmessage = (ev: MessageEvent) => {
          if (connectCancelledRef.current) return;
          if (!started) {
            const parsed = parseSshWsFirstMessage(ev.data as string | ArrayBuffer);
            if (parsed?.type === "ssh_error") {
              const msg =
                parsed.message?.trim() ||
                (parsed.code === "CAPTCHA_INVALID"
                  ? "验证码错误"
                  : parsed.code === "PASSWORD_REQUIRED"
                    ? "请输入 root 密码"
                    : "SSH 认证失败");
              setErrMsg(msg);
              setNeedCaptcha(Boolean(parsed.needCaptcha));
              setStatus("error");
              void qc.invalidateQueries({ queryKey: ["cloud-vm-ssh-security-events"] });
              void (async () => {
                try {
                  const p = await apiGetJson<SshPreflightApi>(`${base}/ssh/preflight`);
                  void qc.setQueryData(["cloud-vm-ssh-preflight", instanceId], p);
                  if (parsed.needCaptcha || p.needCaptcha) {
                    await loadCaptcha();
                  }
                } catch {
                  /* ignore */
                }
              })();
              try {
                ws.close();
              } catch {
                /* ignore */
              }
              term.dispose();
              return;
            }
            if (parsed && "type" in parsed && parsed.type === "ssh_ready") {
              started = true;
              setStatus("open");
              setTimeout(sendResize, 0);
              setTimeout(sendResize, 100);
              setTimeout(sendResize, 400);
              toast.success("云主机 SSH 已连接", {
                description: `实例 #${instanceId}`,
                duration: 3000,
              });
              ws.onmessage = (e2: MessageEvent) => {
                if (connectCancelledRef.current) return;
                if (e2.data instanceof ArrayBuffer) {
                  term.write(new Uint8Array(e2.data));
                } else if (typeof e2.data === "string") {
                  term.write(e2.data);
                }
              };
              attachTermData();
              return;
            }
            started = true;
            setStatus("open");
            setTimeout(sendResize, 0);
            setTimeout(sendResize, 100);
            setTimeout(sendResize, 400);
            toast.success("云主机 SSH 已连接", {
              description: `实例 #${instanceId}`,
              duration: 3000,
            });
            if (ev.data instanceof ArrayBuffer) {
              term.write(new Uint8Array(ev.data));
            } else if (typeof ev.data === "string") {
              term.write(ev.data);
            }
            ws.onmessage = (e2: MessageEvent) => {
              if (connectCancelledRef.current) return;
              if (e2.data instanceof ArrayBuffer) {
                term.write(new Uint8Array(e2.data));
              } else if (typeof e2.data === "string") {
                term.write(e2.data);
              }
            };
            attachTermData();
            return;
          }
        };
      },
      {
        onTimeout: () => {
          if (connectCancelledRef.current) return;
          setErrMsg("终端区域未挂载（请关闭弹窗后重试）");
          setStatus("error");
        },
      }
    );
  }, [
    instanceId,
    password,
    captchaId,
    captchaAnswer,
    base,
    qc,
    loadCaptcha,
    xtermOpts,
  ]);

  const statusLabel =
    status === "connecting"
      ? "连接中…"
      : status === "open"
        ? "已连接"
        : status === "closed"
          ? "已断开"
          : status === "error"
            ? "出错"
            : "";

  const podHint = sshMeta?.podName?.trim() || "—";
  const useStoredPasswordUi = sshMeta?.requireManualPassword === false;
  const passwordHint = useStoredPasswordUi
    ? "root 密码已由平台加密保存在实例配置中；点击连接即可由服务端解密并拨号。若连接失败请在创建/重置密码后重试。"
    : "请输入 root 密码。连续多次错误后需算术验证码，异常会记在右上角通知铃铛。";
  const fullBleed = status === "open";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className={
          fullBleed
            ? "!flex h-[min(92vh,900px)] max-h-[92vh] w-[min(98vw,1200px)] !max-w-[min(98vw,1200px)] flex-col gap-0 overflow-hidden border-[#2a2a2a] bg-[#1e1e1e] p-0 shadow-2xl sm:!max-w-[min(98vw,1200px)] [&_[data-slot=dialog-close]]:top-3 [&_[data-slot=dialog-close]]:right-3 [&_[data-slot=dialog-close]]:text-slate-400 [&_[data-slot=dialog-close]]:hover:bg-white/10 [&_[data-slot=dialog-close]]:hover:text-white [&_[data-slot=dialog-close]]:ring-offset-[#1e1e1e]"
            : "!flex h-[min(92vh,900px)] max-h-[92vh] w-[min(98vw,1180px)] !max-w-[min(98vw,1180px)] flex-col gap-0 overflow-hidden border-slate-200 bg-white p-0 shadow-xl sm:!max-w-[min(98vw,1180px)]"
        }
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader
          className={
            fullBleed
              ? "shrink-0 space-y-0.5 border-b border-[#333] bg-[#252525] px-3 py-2.5 pr-12 text-left"
              : "shrink-0 space-y-1 border-b border-slate-200 bg-white px-4 py-3 text-left"
          }
        >
          <DialogTitle
            className={fullBleed ? "text-sm font-semibold text-slate-100" : "text-base font-semibold text-slate-900"}
          >
            云主机 SSH（root）
          </DialogTitle>
          <DialogDescription asChild>
            {fullBleed ? (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-400">
                <span className="font-mono text-slate-300">
                  实例 #{instanceId} · Pod {podHint}
                </span>
                {sshMeta?.sshFailCount != null && sshMeta.sshFailCount > 0 ? (
                  <span className="text-amber-400/95">· 近期失败 {sshMeta.sshFailCount} 次</span>
                ) : null}
                {statusLabel ? <span className="tabular-nums text-slate-500">· {statusLabel}</span> : null}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
                    <span className="font-mono text-slate-700">
                      实例 #{instanceId} · Pod {podHint}
                    </span>
                    {sshMeta?.sshFailCount != null && sshMeta.sshFailCount > 0 ? (
                      <span className="text-amber-800/90">· 近期失败 {sshMeta.sshFailCount} 次</span>
                    ) : null}
                    {statusLabel ? (
                      <span className="tabular-nums text-slate-500">· {statusLabel}</span>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 shrink-0 gap-1 self-start border-slate-300 text-[10px] sm:self-center"
                    disabled={preflightQ.isFetching}
                    onClick={() => void preflightQ.refetch()}
                  >
                    <RefreshCw className={cn("h-3 w-3", preflightQ.isFetching && "animate-spin")} />
                    刷新 Pod 状态
                  </Button>
                </div>
              </div>
            )}
          </DialogDescription>
          {!fullBleed && preflightQ.isFetching ? (
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-slate-200" aria-hidden>
              <div className="h-full w-2/5 animate-pulse rounded-full bg-sky-500" />
            </div>
          ) : null}
        </DialogHeader>
        {!fullBleed && (
          <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
            <PlatformRelayBanner className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-950" />
          </div>
        )}
        {status !== "open" && (
          <div className="shrink-0 space-y-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
            {!useStoredPasswordUi && (
              <div className="space-y-1.5">
                <Label htmlFor="cloud-vm-ssh-pw" className="text-xs text-slate-700">
                  root 密码
                </Label>
                <Input
                  id="cloud-vm-ssh-pw"
                  type="password"
                  autoComplete="off"
                  placeholder="请输入 root 密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
            )}
            <p className="text-[11px] leading-relaxed text-slate-600">{passwordHint}</p>
            {(needCaptcha || sshMeta?.needCaptcha) && (
              <div className="space-y-1.5 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Label className="text-xs text-amber-900">验证码（算术）</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() => void loadCaptcha()}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    换一张
                  </Button>
                </div>
                {captchaQuestion ? (
                  <p className="font-mono text-sm text-slate-800">{captchaQuestion}</p>
                ) : null}
                <Input
                  value={captchaAnswer}
                  onChange={(e) => setCaptchaAnswer(e.target.value)}
                  placeholder="计算结果"
                  className="max-w-[200px] font-mono text-sm"
                />
              </div>
            )}
            <Button
              type="button"
              className="gap-2 bg-sky-600 hover:bg-sky-700"
              disabled={status === "connecting"}
              onClick={() => void handleConnect()}
            >
              {status === "connecting" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  连接中…
                </>
              ) : (
                "连接 SSH"
              )}
            </Button>
          </div>
        )}
        {errMsg && !fullBleed && (
          <div className="shrink-0 px-4 py-2">
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {errMsg}
            </div>
          </div>
        )}
        {errMsg && fullBleed && (
          <div className="shrink-0 border-b border-[#7f1d1d]/60 bg-[#3f0f0f] px-3 py-2 text-center text-xs text-red-200">
            {errMsg}
          </div>
        )}
        <div
          className={
            fullBleed
              ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#1e1e1e]"
              : "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-3 pb-3 pt-2 sm:px-5 sm:pb-4"
          }
        >
          <div
            className={
              fullBleed
                ? "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#1e1e1e]"
                : "relative flex min-h-[min(420px,55vh)] w-full min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#1e1e1e] shadow-[inset_0_2px_12px_rgba(0,0,0,0.35)] sm:min-h-[min(560px,65vh)]"
            }
          >
            <div
              ref={wrapRef}
              className="vc-ssh-xterm-host min-h-0 w-full min-w-0 flex-1 overflow-hidden bg-[#1e1e1e] p-1 sm:p-1.5"
            />
            {status === "connecting" && (
              <div
                className="absolute inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-[#1e1e1e]/95 text-center text-slate-200"
                aria-live="polite"
              >
                <Loader2 className="h-8 w-8 animate-spin text-sky-400" aria-hidden />
                <div className="h-1 w-52 max-w-[85%] overflow-hidden rounded-full bg-slate-700" aria-hidden>
                  <div className="h-full w-2/5 animate-pulse rounded-full bg-sky-400/90" />
                </div>
                <div className="max-w-[280px] text-sm font-medium leading-snug">正在连接 SSH，请稍候…</div>
                <p className="max-w-[320px] px-4 text-xs leading-relaxed text-slate-400">
                  通过平台转发 WebSocket；若长时间无响应请检查网络与实例状态，或关闭后在云主机详情查看部署进度。
                </p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CloudVmSshTerminalSheet;

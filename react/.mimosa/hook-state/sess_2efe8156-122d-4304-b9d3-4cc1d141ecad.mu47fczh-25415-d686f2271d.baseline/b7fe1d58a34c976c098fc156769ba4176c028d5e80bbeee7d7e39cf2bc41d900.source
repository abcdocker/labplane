import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import type { ITerminalOptions } from "@xterm/xterm";
import { toast } from "sonner";
import { tryLoadXtermWebgl } from "@/lib/xtermShared";

/** Radix Dialog 等 Portal 首帧容器常未挂载，轮询直到可挂载 xterm */
export function whenTerminalHostReady(
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

export function buildPodExecWsUrl(namespace: string, name: string, container: string, shell: string): string {
  const q = new URLSearchParams({ container, shell });
  const path = `/api/k8s/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/exec/ws?${q.toString()}`;
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${path}`;
}

export type PodExecTerminalStatus = "idle" | "connecting" | "open" | "closed" | "error";

export type UsePodExecTerminalOpts = {
  enabled: boolean;
  namespace: string;
  podName: string;
  container: string;
  shell: string;
  xtermOpts: ITerminalOptions;
  /** 连接成功/失败时是否 toast（全屏页可关） */
  toasts?: boolean;
};

export function usePodExecTerminal({
  enabled,
  namespace,
  podName,
  container,
  shell,
  xtermOpts,
  toasts = true,
}: UsePodExecTerminalOpts) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<PodExecTerminalStatus>("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const disposeRef = useRef<(() => void) | null>(null);
  const cancelWaitRef = useRef<(() => void) | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const teardown = useCallback(() => {
    cancelWaitRef.current?.();
    cancelWaitRef.current = null;
    disposeRef.current?.();
    disposeRef.current = null;
    const w = wsRef.current;
    if (w) {
      w.onopen = null;
      w.onmessage = null;
      w.onerror = null;
      w.onclose = null;
      if (w.readyState === WebSocket.OPEN || w.readyState === WebSocket.CONNECTING) {
        try {
          w.close(1000, "pod-terminal-closed");
        } catch {
          /* ignore */
        }
      }
    }
    wsRef.current = null;
  }, []);

  useEffect(() => {
    teardown();

    if (!enabled || !container.trim() || !namespace || !podName) {
      setStatus("idle");
      setErrMsg(null);
      return;
    }

    let cancelled = false;

    const cancelWait = whenTerminalHostReady(
      () => wrapRef.current,
      (el) => {
        cancelWaitRef.current = null;
        if (cancelled) return;

        const term = new XTerm(xtermOpts);
        const fit = new FitAddon();
        term.loadAddon(fit);
        term.open(el);
        tryLoadXtermWebgl(term);
        // WebGL 替换渲染后端后字符宽度可能微变，首次 fit 粗算；
        // 再用 rAF 等浏览器完成首帧布局后重算，保证行列数准确。
        fit.fit();
        requestAnimationFrame(() => { if (!cancelled) fit.fit(); });
        term.writeln("");
        term.writeln("\x1b[96m●\x1b[0m \x1b[90m正在连接 Pod exec，请稍候…\x1b[0m");
        term.writeln("");

        setStatus("connecting");
        setErrMsg(null);

        let execEstablished = false;
        let sessionFailed = false;

        const wsUrl = buildPodExecWsUrl(namespace, podName, container, shell);
        const ws = new WebSocket(wsUrl);
        ws.binaryType = "arraybuffer";
        wsRef.current = ws;

        // 防抖：合并 150ms 内连续触发（ResizeObserver 在 flex 布局稳定前可能连发）
        let lastSentCols = 0;
        let lastSentRows = 0;
        let resizeTimer: ReturnType<typeof setTimeout> | null = null;

        const flushResize = () => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const { cols, rows } = term;
          if (cols < 1 || rows < 1) return;
          if (cols === lastSentCols && rows === lastSentRows) return;
          lastSentCols = cols;
          lastSentRows = rows;
          ws.send(JSON.stringify({ type: "resize", cols, rows }));
        };

        const sendResize = () => {
          fit.fit();
          if (resizeTimer !== null) clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => {
            resizeTimer = null;
            flushResize();
          }, 150);
        };

        ws.onopen = () => {
          if (cancelled) {
            try {
              ws.close(1000, "cancelled");
            } catch {
              /* ignore */
            }
            return;
          }
          // 连接建立时立即 fit + 发送尺寸（不走防抖，保证首次列数正确）
          fit.fit();
          flushResize();
          term.focus();
        };

        ws.onmessage = (ev: MessageEvent) => {
          if (cancelled) return;
          if (sessionFailed) return;

          if (!execEstablished) {
            if (typeof ev.data === "string") {
              sessionFailed = true;
              const errText = ev.data.replace(/\r\n/g, "\n").trimEnd();
              setStatus("error");
              setErrMsg(errText);
              if (toasts) {
                toast.error("Pod 终端连接失败", {
                  description: errText || "服务端返回错误",
                  duration: 12_000,
                });
              }
              term.writeln("\r\n\x1b[31m" + errText + "\x1b[0m\r\n");
              return;
            }
            if (ev.data instanceof ArrayBuffer) {
              const u8 = new Uint8Array(ev.data);
              if (u8.length === 0) {
                return;
              }
              execEstablished = true;
              setStatus("open");
              fit.fit();
              flushResize();
              term.writeln("");
              term.writeln(
                "\x1b[92m●\x1b[0m \x1b[1mPod 终端已连接\x1b[0m \x1b[90m· exec 会话已就绪，可输入命令\x1b[0m"
              );
              term.writeln("");
              if (toasts) {
                toast.success("Pod 终端已连接", {
                  description: `${namespace}/${podName} · ${container}`,
                  duration: 4000,
                });
              }
              term.write(u8);
              return;
            }
            return;
          }

          if (ev.data instanceof ArrayBuffer) {
            term.write(new Uint8Array(ev.data));
          } else if (typeof ev.data === "string") {
            term.write(ev.data);
          }
        };

        ws.onerror = () => {
          if (cancelled || execEstablished || sessionFailed) return;
          sessionFailed = true;
          const msg =
            "WebSocket 错误（请确认已登录本平台；exec 由平台服务端转发，另请确认 RBAC 允许 pods/exec）";
          setErrMsg(msg);
          setStatus("error");
          if (toasts) {
            toast.error("Pod 终端连接失败", { description: msg, duration: 10_000 });
          }
        };

        ws.onclose = () => {
          if (wsRef.current === ws) {
            wsRef.current = null;
          }
          if (cancelled) return;

          if (!execEstablished) {
            if (!sessionFailed) {
              sessionFailed = true;
              const msg = "Pod exec 未能建立（连接已关闭）。请核对 Pod/容器名是否存在、Pod 是否 Running。";
              setStatus("error");
              setErrMsg(msg);
              if (toasts) {
                toast.error("Pod 终端连接失败", { description: msg, duration: 10_000 });
              }
              term.writeln("\r\n\x1b[31m" + msg + "\x1b[0m\r\n");
            } else {
              term.writeln("\r\n\x1b[33m[连接已关闭]\x1b[0m\r\n");
            }
            return;
          }

          setStatus("closed");
          term.write("\r\n\x1b[33m[连接已关闭]\x1b[0m\r\n");
        };

        const sub = term.onData((data) => {
          if (ws.readyState === WebSocket.OPEN && execEstablished) {
            ws.send(new TextEncoder().encode(data));
          }
        });

        const onWinResize = () => sendResize();
        window.addEventListener("resize", onWinResize);
        const ro = new ResizeObserver(() => sendResize());
        ro.observe(el);

        disposeRef.current = () => {
          if (resizeTimer !== null) clearTimeout(resizeTimer);
          window.removeEventListener("resize", onWinResize);
          ro.disconnect();
          sub.dispose();
          const cur = wsRef.current;
          if (cur === ws) {
            wsRef.current = null;
          }
          ws.onopen = null;
          ws.onmessage = null;
          ws.onerror = null;
          ws.onclose = null;
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            try {
              ws.close(1000, "pod-terminal-disposed");
            } catch {
              /* ignore */
            }
          }
          term.dispose();
        };
      },
      {
        onTimeout: () => {
          if (cancelled) return;
          setErrMsg("终端区域未挂载（请关闭后重试）");
          setStatus("error");
        },
      }
    );
    cancelWaitRef.current = cancelWait;

    return () => {
      cancelled = true;
      teardown();
    };
  }, [enabled, namespace, podName, container, shell, teardown, xtermOpts, toasts]);

  const showConnectOverlay = enabled && (status === "idle" || status === "connecting");
  const overlayHint =
    status === "idle" ? "正在准备终端…" : "正在连接 Pod exec（约需数秒）…";

  return {
    wrapRef,
    status,
    errMsg,
    showConnectOverlay,
    overlayHint,
    teardown,
  };
}

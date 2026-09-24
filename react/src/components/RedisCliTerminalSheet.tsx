import React, { useEffect, useRef, useState } from "react";
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
import { useLabPlaneXtermOptions } from "@/hooks/use-labplane-xterm-options";
import PlatformRelayBanner from "@/components/PlatformRelayBanner";
import { wsUrlForApiPath } from "@/lib/api";

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

export type RedisCliTerminalSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceId: number;
};

/** 应用中心 Redis：服务端在 Pod 内执行 redis-cli，通过 REDISCLI_AUTH 注入密码，浏览器不展示明文 */
const RedisCliTerminalSheet: React.FC<RedisCliTerminalSheetProps> = ({ open, onOpenChange, instanceId }) => {
  const xtermOpts = useLabPlaneXtermOptions();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"idle" | "connecting" | "open" | "closed" | "error">("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const disposeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const prevDispose = disposeRef.current;
    prevDispose?.();
    disposeRef.current = null;

    if (!open || instanceId <= 0) {
      setStatus("idle");
      setErrMsg(null);
      return;
    }

    let cancelled = false;
    let cancelWait: (() => void) | undefined;

    cancelWait = whenTerminalHostReady(
      () => wrapRef.current,
      (el) => {
        if (cancelled) return;

        const term = new XTerm(xtermOpts);
        const fit = new FitAddon();
        term.loadAddon(fit);
        term.open(el);
        fit.fit();

        setStatus("connecting");
        setErrMsg(null);

        const wsUrl = wsUrlForApiPath(`/api/app-center/redis/instances/${encodeURIComponent(String(instanceId))}/redis-cli/ws`);
        const ws = new WebSocket(wsUrl);
        ws.binaryType = "arraybuffer";

        const sendResize = () => {
          fit.fit();
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
          }
        };

        ws.onopen = () => {
          if (cancelled) return;
          setStatus("open");
          sendResize();
        };

        ws.onmessage = (ev: MessageEvent) => {
          if (cancelled) return;
          if (ev.data instanceof ArrayBuffer) {
            term.write(new Uint8Array(ev.data));
          } else if (typeof ev.data === "string") {
            term.write(ev.data);
          }
        };

        ws.onerror = () => {
          if (cancelled) return;
          setErrMsg(
            "WebSocket 失败（请确认已登录且账号非只读；服务端需 pods/exec 权限）"
          );
          setStatus("error");
        };

        ws.onclose = () => {
          if (cancelled) return;
          setStatus("closed");
          term.write("\r\n\x1b[33m[连接已关闭]\x1b[0m\r\n");
        };

        const sub = term.onData((data) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(new TextEncoder().encode(data));
          }
        });

        const onWinResize = () => sendResize();
        window.addEventListener("resize", onWinResize);
        const ro = new ResizeObserver(() => sendResize());
        ro.observe(el);

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
      },
      {
        onTimeout: () => {
          if (cancelled) return;
          setErrMsg("终端区域未挂载（请关闭弹窗后重试）");
          setStatus("error");
        },
      }
    );

    return () => {
      cancelled = true;
      cancelWait?.();
      disposeRef.current?.();
      disposeRef.current = null;
    };
  }, [open, instanceId, xtermOpts]);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="!flex !max-h-[min(90vh,880px)] w-[min(96vw,960px)] !max-w-[min(96vw,960px)] flex-col gap-0 overflow-hidden border-slate-200 p-0 sm:!max-w-[min(96vw,960px)]"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="shrink-0 space-y-1 border-b border-slate-200 bg-white px-4 py-3 text-left">
          <DialogTitle className="text-base font-semibold text-slate-900">redis-cli</DialogTitle>
          <DialogDescription className="text-xs text-slate-600">
            实例 #{instanceId} · 在 Redis Pod 内交互；认证由服务端注入环境变量，界面不显示密码
            {statusLabel ? ` · ${statusLabel}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="shrink-0 border-b border-sky-100 bg-white px-4 pb-3">
          <PlatformRelayBanner className="rounded-lg border border-sky-200 bg-sky-50/90 px-3 py-2 text-xs leading-relaxed text-sky-950" />
        </div>
        {errMsg && (
          <div className="shrink-0 border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800">
            {errMsg}
          </div>
        )}
        <div
          ref={wrapRef}
          className="pod-exec-xterm-host h-[min(560px,70vh)] min-h-[280px] flex-1 overflow-hidden rounded-b-lg border-t border-slate-800 bg-[#1e1e1e] p-2"
        />
      </DialogContent>
    </Dialog>
  );
};

export default RedisCliTerminalSheet;

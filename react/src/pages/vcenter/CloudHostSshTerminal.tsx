import React, { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { Button } from "@/components/ui/button";
import { apiGetJson } from "@/lib/api";
import { useSshLabPlaneXtermOptions } from "@/hooks/use-ssh-labplane-xterm-options";
import { tryLoadXtermWebgl } from "@/lib/xtermShared";
import PlatformRelayBanner from "@/components/PlatformRelayBanner";
import { cn } from "@/lib/utils";

function buildCloudHostSshWsUrl(hostId: string): string {
  const path = `/api/cloud-hosts/${encodeURIComponent(hostId)}/ssh/ws`;
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${path}`;
}

export type CloudHostSSHSettings = {
  id: string;
  sshHost: string;
  sshPort: number;
  sshUserHint?: string;
  fromEnv: boolean;
  canConnect: boolean;
  writable: boolean;
  encryptionReady: boolean;
  needsEncryptionKey?: boolean;
  stored?: boolean;
  user?: string;
  port?: number;
  passwordSet?: boolean;
  privateKeySet?: boolean;
  insecureHostKey?: boolean;
  hostKeyFingerprint?: string;
};

type CloudHostSshTerminalProps = {
  hostId: string;
  displayName: string;
  /** 独立页全高布局：终端占满、说明条紧凑；列表内嵌用 default */
  variant?: "default" | "page";
};

const CloudHostSshTerminal: React.FC<CloudHostSshTerminalProps> = ({
  hostId,
  displayName,
  variant = "default",
}) => {
  const xtermOpts = useSshLabPlaneXtermOptions();
  const isPage = variant === "page";
  const sshQ = useQuery({
    queryKey: ["cloud-host-ssh-settings", hostId],
    queryFn: ({ signal }) =>
      apiGetJson<CloudHostSSHSettings>(`/api/cloud-hosts/${encodeURIComponent(hostId)}/ssh-settings`, { signal }),
  });

  const wrapRef = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);
  const [status, setStatus] = useState<"idle" | "connecting" | "open" | "closed" | "error">("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const disposeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const prev = disposeRef.current;
    prev?.();
    disposeRef.current = null;

    if (!started || !hostId) {
      setStatus("idle");
      setErrMsg(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      const el = wrapRef.current;
      if (!el || cancelled) return;

      const term = new XTerm(xtermOpts);
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(el);
      tryLoadXtermWebgl(term);
      fit.fit();

      setStatus("connecting");
      setErrMsg(null);

      const wsUrl = buildCloudHostSshWsUrl(hostId);
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
          "WebSocket 失败（请确认已登录本平台；会话由平台转发，若仍失败请检查平台服务端至该 SSH 地址的网络）"
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
    }, 80);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      disposeRef.current?.();
      disposeRef.current = null;
    };
  }, [started, hostId, xtermOpts]);

  const sshOk = sshQ.data?.canConnect === true;

  return (
    <div
      className={cn(
        isPage ? "flex h-full min-h-0 flex-1 flex-col gap-3" : "space-y-4"
      )}
    >
      {!isPage && <PlatformRelayBanner />}

      {!isPage && (
        <div
          className={cn(
            "flex flex-wrap items-baseline gap-x-3 gap-y-1",
            "rounded-xl border border-violet-100 bg-white px-4 py-3 shadow-sm"
          )}
        >
          <span className="text-base font-semibold text-slate-900">{displayName}</span>
          <span className="font-mono text-sm text-violet-700/90">
            {sshQ.data?.sshHost}:{sshQ.data?.sshPort || 22}
          </span>
        </div>
      )}

      {sshQ.data?.fromEnv && !isPage && (
        <div className="rounded-lg border border-blue-100 bg-blue-50/80 px-3 py-2 text-xs text-blue-900">
          已检测到全局 <code className="rounded bg-white px-1">VCENTER_VM_SSH_*</code>{" "}
          凭据；平台服务端将用其拨号至列表中的 SSH 地址（非您电脑直连）。
        </div>
      )}

      {!sshQ.data?.encryptionReady && sshQ.data?.writable === false && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          未配置 <code className="rounded bg-white px-1">LABPLANE_ENCRYPTION_KEY</code> 或 SSH 存储，无法保存每台主机密码/私钥。
            可设置环境变量或全局 SSH 后连接。
        </div>
      )}

      {!sshOk && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          当前无法连接：请配置全局 <code className="rounded bg-white px-1">VCENTER_VM_SSH_USER</code> 与密码/私钥路径，或在<strong> SFTP 面板</strong>中按主机保存凭据（需{" "}
          <code className="rounded bg-white px-1">SSH_SETTINGS_BACKEND=file</code> 与{" "}
          <code className="rounded bg-white px-1">SSH_SETTINGS_DIR</code>）。
        </div>
      )}

      {sshOk && (
        <div
          className={cn(
            "flex flex-col gap-2",
            isPage && "min-h-0 flex-1"
          )}
        >
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-slate-50/40 px-1 py-2 sm:px-2">
            {!isPage && (
              <span className="text-xs text-slate-600">
                目标为列表中的 SSH 地址；由平台服务端转发，凭据不经过浏览器。
              </span>
            )}
            <div className={`flex items-center gap-3 ${isPage ? "ml-auto w-full justify-end" : ""}`}>
              <span className="text-xs tabular-nums text-slate-500">
                {status === "connecting" && "正在连接…"}
                {status === "open" && "已连接"}
                {status === "closed" && "已断开"}
                {status === "error" && "连接出错"}
                {status === "idle" && started === false && "未连接"}
              </span>
              {!started ? (
                <Button
                  type="button"
                  size="sm"
                  className="bg-violet-600 hover:bg-violet-700"
                  onClick={() => setStarted(true)}
                >
                  连接 SSH
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    disposeRef.current?.();
                    disposeRef.current = null;
                    setStarted(false);
                    setStatus("idle");
                    setErrMsg(null);
                  }}
                >
                  断开
                </Button>
              )}
            </div>
          </div>
          {errMsg && (
            <div className="shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {errMsg}
            </div>
          )}
          {started ? (
            <div
              className={cn(
                "vc-ssh-xterm-host flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-[#1e1e1e] p-2 sm:p-3",
                !isPage &&
                  "rounded-xl border border-[#2a2a2a] shadow-[inset_0_2px_12px_rgba(0,0,0,0.35)] h-[420px] max-h-[min(560px,70vh)] min-h-[280px] shrink-0",
                isPage &&
                  "min-h-[min(62dvh,720px)] flex-1 border-t border-[#2a2a2a] sm:min-h-[min(68dvh,780px)]"
              )}
            >
              <div ref={wrapRef} className="min-h-0 flex-1 overflow-hidden" />
            </div>
          ) : (
            isPage && (
              <div className="flex min-h-[min(48dvh,420px)] flex-1 flex-col items-center justify-center border border-dashed border-slate-300/90 bg-slate-50/50 px-6 py-10 text-center">
                <p className="text-sm font-medium text-slate-700">终端区域</p>
                <p className="mt-1 max-w-sm text-xs text-slate-500">
                  点击上方「连接 SSH」后，终端将平铺占用下方空间。
                </p>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
};

export default CloudHostSshTerminal;

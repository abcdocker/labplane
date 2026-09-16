import React, { useCallback, useEffect, useRef } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import "@xterm/xterm/css/xterm.css";
import { Maximize2, Minimize2, Terminal as TerminalIcon } from "lucide-react";
import { useKubeBtXtermOptions } from "@/hooks/use-kube-bt-xterm-options";
import PlatformRelayBanner from "@/components/PlatformRelayBanner";
import { usePodExecTerminal } from "./usePodExecTerminal";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** 与 Orion Visor 终端页 URL 一致思路：独立路由 + query */
export function clusterPodTerminalHref(
  namespace: string,
  podName: string,
  container: string,
  shell = "/bin/sh"
): string {
  const q = new URLSearchParams({ container, shell });
  return `/cluster/ns/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(podName)}/terminal?${q}`;
}

/**
 * 参考 Dromara Orion Visor host-terminal 暗色布局：
 * 顶栏 #232323、活动标签 #434343、内容区 #1A1B1C / 侧栏色 #2A2A2A、终端视口 #1e1e1e。
 */
const ClusterPodTerminalPage: React.FC = () => {
  const { namespace = "", podName = "" } = useParams<{ namespace: string; podName: string }>();
  const [search] = useSearchParams();
  const container = (search.get("container") ?? "").trim();
  const shell = (search.get("shell") ?? "/bin/sh").trim() || "/bin/sh";

  const xtermOpts = useKubeBtXtermOptions();
  const shellHostRef = useRef<HTMLDivElement>(null);
  const [fs, setFs] = React.useState(false);

  const enabled = !!namespace && !!podName && !!container;
  const { wrapRef, status, errMsg, showConnectOverlay, overlayHint, teardown } = usePodExecTerminal({
    enabled,
    namespace,
    podName,
    container,
    shell,
    xtermOpts,
    toasts: true,
  });

  const backToPod = `/cluster/ns/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(podName)}`;

  useEffect(() => {
    const t = `终端 · ${podName} · ${namespace}`;
    const prev = document.title;
    document.title = t;
    return () => {
      document.title = prev;
    };
  }, [namespace, podName]);

  const toggleFullscreen = useCallback(() => {
    const el = shellHostRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      void el.requestFullscreen().then(() => setFs(true)).catch(() => setFs(false));
    } else {
      void document.exitFullscreen().then(() => setFs(false)).catch(() => setFs(false));
    }
  }, []);

  useEffect(() => {
    const onFs = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  if (!enabled) {
    return (
      <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-4 px-4 text-center text-white/75">
        <p className="text-sm">
          缺少参数 <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-white/90">container</code>
          ，请从 Pod 详情页选择容器后打开终端。
        </p>
        <Link
          to="/cluster/ns"
          className="text-sm font-medium text-[#8ab4ff] underline-offset-2 hover:underline"
        >
          返回命名空间
        </Link>
      </div>
    );
  }

  const statusDot =
    status === "open"
      ? "bg-emerald-500"
      : status === "connecting" || status === "idle"
        ? "bg-amber-400"
        : status === "error"
          ? "bg-red-500"
          : "bg-white/30";

  return (
    <div
      ref={shellHostRef}
      className={cn(
        "orion-pod-terminal-host flex h-full min-h-0 flex-col overflow-hidden bg-[#1A1B1C]",
        !fs && "rounded-none border-0 shadow-none",
        fs && "fixed inset-0 z-[200] min-h-dvh rounded-none border-0"
      )}
    >
      {/* Orion 风格顶栏 */}
      <header className="flex h-11 shrink-0 select-none items-stretch bg-[#232323] text-[rgba(255,255,255,0.88)] shadow-[0_1px_0_rgba(0,0,0,0.35)]">
        <div className="flex w-[142px] shrink-0 items-center gap-2 pl-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#434343]">
            <TerminalIcon className="h-4 w-4 text-white/90" strokeWidth={2} />
          </div>
          <span className="truncate text-[15px] font-medium tracking-tight text-white/90">Pod 终端</span>
        </div>

        <div className="flex min-w-0 flex-1 items-stretch overflow-hidden">
          <div className="flex max-w-full items-center bg-[#434343] px-[14px] py-0">
            <div className="flex min-w-0 items-center gap-2 text-[13px] leading-none">
              <span
                className={cn("h-2 w-2 shrink-0 rounded-full", statusDot)}
                title={status}
                aria-hidden
              />
              <span className="truncate font-mono text-white/[0.92]">
                {namespace} / {podName}
              </span>
              <span className="shrink-0 text-white/40">·</span>
              <span className="truncate font-mono text-white/75">{container}</span>
            </div>
          </div>
          <div className="pointer-events-none flex-1 bg-gradient-to-r from-[#262626] to-transparent" />
        </div>

        <div className="flex w-[200px] shrink-0 items-center justify-end gap-1 pr-2">
          <button
            type="button"
            onClick={toggleFullscreen}
            className="flex h-8 w-8 items-center justify-center rounded text-white/70 transition-colors hover:bg-[#434343] hover:text-white"
            title={fs ? "退出全屏" : "全屏"}
          >
            {fs ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <Link
            to={backToPod}
            onClick={() => teardown()}
            className="rounded px-3 py-1.5 text-[13px] font-medium text-white/80 transition-colors hover:bg-[#434343] hover:text-white"
          >
            返回 Pod
          </Link>
        </div>
      </header>

      {/* 主内容区：顶部信息条 + 铺满的终端 */}
      <div className="flex min-h-0 flex-1 flex-col bg-[#1e1e1e]">
        {/* 信息条：仅在有内容时显示，紧贴顶栏 */}
        {(shell !== "/bin/sh" || errMsg) && (
          <div className="shrink-0 border-b border-white/10 bg-[#2A2A2A] px-3 py-1.5 space-y-1">
            {shell !== "/bin/sh" ? (
              <p className="font-mono text-[11px] text-white/65">
                Shell: <span className="text-[#8ab4ff]">{shell}</span>
              </p>
            ) : null}
            {errMsg ? (
              <p className="text-xs text-red-300">{errMsg}</p>
            ) : null}
          </div>
        )}

        <PlatformRelayBanner className="shrink-0 border-b border-white/10 bg-[#2A2A2A] px-3 py-1.5 text-[11px] leading-relaxed text-white/60" />

        {/* xterm 铺满剩余黑色区域，与堡垒机终端保持一致 */}
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div
            ref={wrapRef}
            className="vc-ssh-xterm-host absolute inset-0 overflow-hidden"
          />
          {showConnectOverlay && (
            <div
              className="absolute inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-[#1e1e1e]/97 text-center text-slate-200"
              aria-live="polite"
            >
              <Loader2 className="h-8 w-8 animate-spin text-[#5b8cff]" aria-hidden />
              <div className="max-w-[280px] text-sm font-medium leading-snug text-white/90">
                {overlayHint}
              </div>
              <p className="max-w-[320px] px-4 text-xs leading-relaxed text-white/45">
                WebSocket 由平台转发；若长时间无响应请检查网络与 RBAC（pods/exec）。
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClusterPodTerminalPage;

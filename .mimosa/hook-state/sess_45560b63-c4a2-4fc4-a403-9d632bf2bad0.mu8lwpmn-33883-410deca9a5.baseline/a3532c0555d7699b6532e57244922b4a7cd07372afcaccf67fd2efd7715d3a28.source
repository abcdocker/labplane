import React, { useEffect, useRef, useState } from "react";
import RFB from "@novnc/novnc";
import { Keyboard, Maximize2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ConsoleState = "connecting" | "connected" | "disconnected" | "error";

export const IdracVncConsole: React.FC<{
  className?: string;
  vncPassword?: string;
}> = ({ className, vncPassword }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<RFB | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ConsoleState>("connecting");
  const [message, setMessage] = useState("正在连接 iDRAC VNC…");

  useEffect(() => {
    const screen = screenRef.current;
    if (!screen) return;

    let active = true;
    setState("connecting");
    setMessage("正在连接 iDRAC VNC…");
    screen.replaceChildren();

    const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${scheme}//${window.location.host}/api/idrac/vnc-ws`;
    const socket = new WebSocket(wsUrl);
    let serverCloseReason = "";
    let serverCloseCode = 0;
    const socketClosed = (event: CloseEvent) => {
      serverCloseCode = event.code;
      serverCloseReason = event.reason.trim();
    };
    socket.addEventListener("close", socketClosed);

    const options: { shared: boolean; credentials?: { password: string } } = {
      shared: true,
    };
    if (vncPassword) {
      options.credentials = { password: vncPassword };
    }

    const rfb = new RFB(screen, socket, options);
    rfbRef.current = rfb;
    rfb.scaleViewport = true;
    rfb.resizeSession = false;
    rfb.viewOnly = false;
    rfb.showDotCursor = true;
    rfb.background = "#020617";

    const connected = () => {
      if (!active) return;
      setState("connected");
      setMessage("");
      rfb.focus({ preventScroll: true });
    };
    const disconnected = (event: Event) => {
      if (!active) return;
      const clean = Boolean((event as CustomEvent<{ clean?: boolean }>).detail?.clean);
      setState(clean ? "disconnected" : "error");
      setMessage(
        serverCloseReason
          ? serverCloseReason
          : serverCloseCode === 1006
          ? "WebSocket 升级失败（1006），请检查网关是否转发 Upgrade 头。"
          : clean
          ? "iDRAC VNC 会话已断开。"
          : "iDRAC VNC 内部连接失败。"
      );
    };
    const securityFailure = (event: Event) => {
      if (!active) return;
      const reason = (event as CustomEvent<{ reason?: string }>).detail?.reason;
      setState("error");
      setMessage(
        reason
          ? `安全协商失败：${reason}`
          : "iDRAC VNC 安全协商失败。"
      );
    };
    const credentialsRequired = () => {
      if (!active) return;
      if (vncPassword) {
        rfb.sendCredentials({ password: vncPassword });
        return;
      }
      setState("error");
      setMessage("iDRAC VNC 需要密码，请在运行时配置中填写 VNC 密码。");
      rfb.disconnect();
    };

    rfb.addEventListener("connect", connected);
    rfb.addEventListener("disconnect", disconnected);
    rfb.addEventListener("securityfailure", securityFailure);
    rfb.addEventListener("credentialsrequired", credentialsRequired);

    return () => {
      active = false;
      rfb.removeEventListener("connect", connected);
      rfb.removeEventListener("disconnect", disconnected);
      rfb.removeEventListener("securityfailure", securityFailure);
      rfb.removeEventListener("credentialsrequired", credentialsRequired);
      socket.removeEventListener("close", socketClosed);
      rfb.disconnect();
      rfbRef.current = null;
      screen.replaceChildren();
    };
  }, [attempt, vncPassword]);

  const reconnect = () => setAttempt((value) => value + 1);

  const enterFullscreen = async () => {
    try {
      await rootRef.current?.requestFullscreen();
      rfbRef.current?.focus({ preventScroll: true });
    } catch {
      // 浏览器可能拒绝全屏请求。
    }
  };

  const sendCtrlAltDel = () => {
    rfbRef.current?.sendCtrlAltDel();
    rfbRef.current?.focus({ preventScroll: true });
  };

  const showOverlay = state !== "connected";

  return (
    <div
      ref={rootRef}
      className={cn("relative min-h-[420px] overflow-hidden bg-black", className)}
      onMouseDown={() => rfbRef.current?.focus({ preventScroll: true })}
    >
      <div className="absolute right-3 top-3 z-20 flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="bg-black/65 text-white hover:bg-black/80"
          onClick={sendCtrlAltDel}
          disabled={state !== "connected"}
        >
          <Keyboard className="mr-1 h-4 w-4" />
          Ctrl+Alt+Del
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="bg-black/65 text-white hover:bg-black/80"
          onClick={reconnect}
        >
          <RefreshCw className="mr-1 h-4 w-4" />
          新建会话
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="bg-black/65 text-white hover:bg-black/80"
          onClick={enterFullscreen}
        >
          <Maximize2 className="mr-1 h-4 w-4" />
          全屏
        </Button>
      </div>

      {showOverlay ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950 px-6 text-center text-sm text-slate-200">
          <div>
            <p>{message}</p>
            {state !== "connecting" ? (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-slate-600 bg-transparent text-slate-100"
                  onClick={reconnect}
                >
                  重试
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div ref={screenRef} className="h-full min-h-[420px] w-full bg-slate-950" />
    </div>
  );
};

export default IdracVncConsole;

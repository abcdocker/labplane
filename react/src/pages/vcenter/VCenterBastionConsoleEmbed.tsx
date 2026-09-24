import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import RFB from "@novnc/novnc";
import { Keyboard, Maximize2, RefreshCw, Scaling, StretchHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { apiPostJson } from "@/lib/api";
import { vcenterConsoleText as t } from "./vcenterConsole.i18n";

type ConsoleState = "connecting" | "connected" | "disconnected" | "error";

export const VCenterWebMKSConsole: React.FC<{
  moref: string;
  className?: string;
  fitToContainer?: boolean;
  /** 锁定客机会话分辨率，只保留浏览器全屏切换。 */
  lockedViewport?: boolean;
}> = ({ moref, className, fitToContainer = true, lockedViewport = false }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<RFB | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ConsoleState>("connecting");
  const [message, setMessage] = useState(t("connecting"));
  const [fit, setFit] = useState(lockedViewport ? false : fitToContainer);
  const [stretch, setStretch] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<number | null>(null);
  const resizeTimerRef = useRef<number | null>(null);
  const resizingRef = useRef(false);

  const requestRemoteResize = useCallback(
    (width: number, height: number) => {
      if (!moref || !fit || stretch) return;
      if (width < 640 || height < 480) return;
      if (resizingRef.current) return;
      resizingRef.current = true;
      apiPostJson(`/api/vcenter/vms/${encodeURIComponent(moref)}/screen-resolution`, {
        width: Math.round(width),
        height: Math.round(height),
      })
        .catch(() => {
          // 静默失败：VMware Tools 可能未响应或 VM 不支持，前端仍有 resizeSession 兜底
        })
        .finally(() => {
          resizingRef.current = false;
        });
    },
    [moref, fit, stretch]
  );

  useEffect(() => {
    const screen = screenRef.current;
    if (!screen || !moref) return;

    let active = true;
    setState("connecting");
    setMessage(t("connecting"));
    screen.replaceChildren();

    const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${scheme}//${window.location.host}/api/vcenter/vms/${encodeURIComponent(moref)}/console-ws`;
    const socket = new WebSocket(wsUrl);
    let serverCloseReason = "";
    let serverCloseCode = 0;
    const socketClosed = (event: CloseEvent) => {
      serverCloseCode = event.code;
      serverCloseReason = event.reason.trim();
    };
    socket.addEventListener("close", socketClosed);

    const rfb = new RFB(screen, socket, { shared: true });
    rfbRef.current = rfb;
    // 在当前页面容器内自适应显示；是否向客机同步分辨率由 resizeSession 决定。
    rfb.scaleViewport = true;
    rfb.resizeSession = lockedViewport ? false : fit;
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
          ? t("proxyUpgradeFailed")
          : clean
          ? t("disconnected")
          : t("internalConnectionFailed")
      );
    };
    const securityFailure = (event: Event) => {
      if (!active) return;
      const reason = (event as CustomEvent<{ reason?: string }>).detail?.reason;
      setState("error");
      setMessage(
        reason
          ? t("securityNegotiationFailedWithReason", { reason })
          : t("securityNegotiationFailed")
      );
    };
    const credentialsRequired = () => {
      if (!active) return;
      setState("error");
      setMessage(t("credentialsRequired"));
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
  }, [attempt, moref]);

  useEffect(() => {
    if (rfbRef.current) {
      rfbRef.current.resizeSession = lockedViewport ? false : fit;
    }
  }, [fit, lockedViewport]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
      }
      if (resizeTimerRef.current) {
        window.clearTimeout(resizeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || lockedViewport || !fit || stretch) return;

    const scheduleResize = () => {
      if (resizeTimerRef.current) {
        window.clearTimeout(resizeTimerRef.current);
      }
      resizeTimerRef.current = window.setTimeout(() => {
        const rect = root.getBoundingClientRect();
        requestRemoteResize(rect.width, rect.height);
      }, 500);
    };

    scheduleResize();
    const ro = new ResizeObserver(scheduleResize);
    ro.observe(root);
    return () => {
      ro.disconnect();
      if (resizeTimerRef.current) {
        window.clearTimeout(resizeTimerRef.current);
      }
    };
  }, [fit, stretch, lockedViewport, requestRemoteResize]);

  const showControls = () => {
    setControlsVisible(true);
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false);
    }, 3000);
  };

  const reconnect = () => setAttempt((value) => value + 1);

  const toggleFit = () => setFit((value) => !value);

  const toggleStretch = () => setStretch((value) => !value);

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
      className={cn("relative min-h-0 overflow-hidden bg-black", className)}
      onMouseDown={() => rfbRef.current?.focus({ preventScroll: true })}
      onMouseMove={showControls}
      onClick={showControls}
    >
      <div
        className={cn(
          "absolute inset-x-0 top-0 z-20 flex h-12 items-center justify-end gap-2 border-b border-white/10 bg-black/75 px-3 backdrop-blur-sm transition-opacity duration-300",
          controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onMouseEnter={() => {
          setControlsVisible(true);
          if (hideTimerRef.current) {
            window.clearTimeout(hideTimerRef.current);
          }
        }}
        onMouseLeave={showControls}
      >
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="bg-white/10 text-white hover:bg-white/20"
          onClick={sendCtrlAltDel}
          disabled={state !== "connected"}
          title={t("ctrlAltDelete")}
        >
          <Keyboard className="h-4 w-4" />
          <span className="sr-only">{t("ctrlAltDelete")}</span>
        </Button>
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="bg-white/10 text-white hover:bg-white/20"
          onClick={reconnect}
          title={t("newSession")}
        >
          <RefreshCw className="h-4 w-4" />
          <span className="sr-only">{t("newSession")}</span>
        </Button>
        {!lockedViewport && (
          <>
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className={cn(
                "bg-white/10 text-white hover:bg-white/20",
                fit && "ring-1 ring-blue-400"
              )}
              onClick={toggleFit}
              disabled={state !== "connected"}
              title={fit ? t("fitToContainerOn") : t("fitToContainerOff")}
            >
              <Scaling className="h-4 w-4" />
              <span className="sr-only">{fit ? t("fitToContainerOn") : t("fitToContainerOff")}</span>
            </Button>
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className={cn(
                "bg-white/10 text-white hover:bg-white/20",
                stretch && "ring-1 ring-blue-400"
              )}
              onClick={toggleStretch}
              disabled={state !== "connected"}
              title={stretch ? t("stretchOff") : t("stretchOn")}
            >
              <StretchHorizontal className="h-4 w-4" />
              <span className="sr-only">{stretch ? t("stretchOff") : t("stretchOn")}</span>
            </Button>
          </>
        )}
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="bg-white/10 text-white hover:bg-white/20"
          onClick={enterFullscreen}
          title={t("fullscreen")}
        >
          <Maximize2 className="h-4 w-4" />
          <span className="sr-only">{t("fullscreen")}</span>
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
                  {t("retry")}
                </Button>
                {message.includes("no such host") ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => window.location.assign("/cluster/vcenter/settings")}
                  >
                    {t("configureESXi")}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div
        ref={screenRef}
        className={cn(
          "h-full min-h-0 w-full bg-slate-950",
          stretch && "vcenter-console-stretch"
        )}
      />
    </div>
  );
};

const VCenterBastionConsoleEmbed: React.FC = () => {
  const { moref = "" } = useParams<{ moref: string }>();
  const decoded = decodeURIComponent(moref);
  return (
    <div className="fixed inset-0 z-[100] bg-black">
      <VCenterWebMKSConsole moref={decoded} className="h-full min-h-0" />
    </div>
  );
};

export default VCenterBastionConsoleEmbed;

import React from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import RedisStatusBanner from "./RedisStatusBanner";
import PlatformVersionBanner from "./PlatformVersionBanner";
import UserGuideSheet from "./UserGuideSheet";
import AppLayoutMobile from "./AppLayoutMobile";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

const AppLayout: React.FC = () => {
  const isMobile = useIsMobile();
  const { pathname } = useLocation();

  if (isMobile) return <AppLayoutMobile />;
  const isDocsShell = pathname === "/docs" || pathname.startsWith("/docs/");
  /** 仅 Markdown/画布编辑器占满主区域高度；/docs/media 等仍需主区域滚动 */
  const isDocsEditorViewport = pathname === "/docs" || pathname.startsWith("/docs/doc/");
  /** 堡垒机整段路由：无平台侧栏/顶栏，视口交给堡垒机页面（含 console 嵌入页） */
  const isBastionFullBleed =
    pathname === "/cluster/bastion" ||
    pathname.startsWith("/cluster/bastion/") ||
    pathname === "/cluster/vcenter/bastion" ||
    pathname.startsWith("/cluster/vcenter/bastion/");
  /** Pod Web 终端全屏页：无平台侧栏/顶栏，与 Orion Visor 独占视口一致 */
  const isPodTerminalShell =
    /\/cluster\/ns\/[^/]+\/pods\/[^/]+\/terminal\/?$/.test(pathname);
  const hideAppChrome = isPodTerminalShell || isBastionFullBleed;

  return (
    <div
      data-cmp="AppLayout"
      className="flex h-dvh min-h-0 w-full min-w-0 flex-col overflow-hidden bg-[#F1F5F9] font-sans"
    >
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden bg-white shadow-custom">
        {!isDocsShell && !hideAppChrome ? <Sidebar /> : null}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
          {!hideAppChrome ? <Header /> : null}
          {!hideAppChrome ? <PlatformVersionBanner /> : null}
          {!hideAppChrome ? <RedisStatusBanner /> : null}
          <main
            className={cn(
              "flex min-h-0 flex-1 flex-col overflow-hidden bg-white",
              (isPodTerminalShell || isBastionFullBleed) && "bg-[#0c0f14]"
            )}
          >
            <div
              className={cn(
                "app-main-scroll flex min-h-0 flex-1 flex-col overflow-x-hidden",
                isBastionFullBleed || isPodTerminalShell
                  ? "min-h-0 overflow-hidden p-0"
                  : isDocsEditorViewport
                    ? "min-h-0 overflow-hidden p-0"
                    : isDocsShell
                      ? "overflow-y-auto p-0"
                      : "overflow-y-auto px-3 py-3 sm:px-4 sm:py-4 md:px-6 md:py-6 lg:px-8 lg:py-8"
              )}
            >
              <div
                className={cn(
                  "mx-auto w-full min-w-0 flex-1",
                  isBastionFullBleed || isPodTerminalShell
                    ? "flex h-full min-h-0 max-w-none flex-col overflow-hidden"
                    : isDocsEditorViewport
                      ? "flex h-full min-h-0 max-w-none flex-col overflow-hidden"
                      : isDocsShell
                        ? "max-w-none"
                        : "max-w-[min(100%,1920px)]"
                )}
              >
                <Outlet />
              </div>
            </div>
          </main>
        </div>
      </div>
      <UserGuideSheet />
    </div>
  );
};

export default AppLayout;

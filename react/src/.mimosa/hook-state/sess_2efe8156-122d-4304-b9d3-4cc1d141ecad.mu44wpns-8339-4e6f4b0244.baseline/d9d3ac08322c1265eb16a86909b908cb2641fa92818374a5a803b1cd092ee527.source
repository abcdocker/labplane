import React from "react";
import { Outlet, useLocation, Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Hexagon,
  Monitor,
  AppWindow,
  Settings,
  LayoutDashboard,
  LogOut,
  User,
  Users,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/auth-context";
import { apiPostJson } from "@/lib/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import PlatformVersionBanner from "./PlatformVersionBanner";
import RedisStatusBanner from "./RedisStatusBanner";
import PwaInstallHint from "./PwaInstallHint";
import { useRuntimeStatusQuery } from "@/hooks/use-runtime-status";
import { menuItemVisible, moduleVisible } from "@/lib/platform-permissions";
import HeaderNotificationsSheet from "@/components/HeaderNotificationsSheet";
import { mobileNavText } from "@/i18n/mobile";
import { workspaceFromPathname } from "@/lib/workspace";

// ── Bottom Navigation Bar ──────────────────────────────────────────────────

const BOTTOM_TABS = [
  { id: "home", icon: LayoutDashboard, label: mobileNavText.workbench, to: "/" },
  { id: "k8s", icon: Hexagon, label: mobileNavText.kubernetes, to: "/cluster" },
  {
    id: "vcenter",
    icon: Monitor,
    label: mobileNavText.vcenter,
    to: "/cluster/vcenter/dashboard",
  },
  {
    id: "apps",
    icon: AppWindow,
    label: mobileNavText.apps,
    to: "/cluster/apps/dashboard",
  },
  {
    id: "settings",
    icon: Settings,
    label: mobileNavText.settings,
    to: "/settings",
  },
] as const;

function MobileBottomNav() {
  const { pathname } = useLocation();
  const { status } = useAuth();
  const runtimeQ = useRuntimeStatusQuery();
  const permissions = runtimeQ.data?.config?.permissions;
  const visibleTabs = BOTTOM_TABS.filter(({ id }) => {
    if (id === "k8s") {
      return menuItemVisible(permissions, "kubernetes", status?.role, moduleVisible(permissions, "k8s"));
    }
    if (id === "vcenter") {
      return menuItemVisible(permissions, "vcenter", status?.role, moduleVisible(permissions, "vcenter"));
    }
    if (id === "apps") {
      return menuItemVisible(permissions, "appcenter", status?.role, moduleVisible(permissions, "appcenter"));
    }
    return true;
  });

  // 与桌面端共用工作区判定，避免 /cluster 同时命中 vCenter / 应用中心。
  const workspace = workspaceFromPathname(pathname);
  const activeTab = pathname === "/settings" || pathname.startsWith("/account/")
    ? "settings"
    : workspace === "hub"
      ? "home"
      : workspace === "kubernetes"
        ? "k8s"
        : workspace === "vcenter"
          ? "vcenter"
          : workspace === "appcenter"
            ? "apps"
            : undefined;

  return (
    <nav
      aria-label={mobileNavText.ariaLabel}
      className="relative z-50 shrink-0 border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
      style={{ paddingBottom: "var(--kbts-safe-bottom)" }}
    >
      <div
        className="app-safe-x grid"
        style={{ gridTemplateColumns: `repeat(${visibleTabs.length}, minmax(0, 1fr))` }}
      >
        {visibleTabs.map(({ id, icon: Icon, label, to }) => {
          const active = activeTab === id;
          return (
            <Link
              key={id}
              to={to}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] font-medium transition-colors active:opacity-70",
                active
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-slate-400 dark:text-slate-500"
              )}
            >
              <Icon
                size={20}
                strokeWidth={active ? 2.5 : 1.8}
                className={active ? "text-blue-600 dark:text-blue-400" : "text-slate-400 dark:text-slate-500"}
              />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

// ── Mobile Header ──────────────────────────────────────────────────────────

function MobileHeader() {
  const { status } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const logoutMut = useMutation({
    mutationFn: () => apiPostJson("/api/auth/logout", {}),
    onSuccess: () => {
      queryClient.clear();
      navigate("/login", { replace: true });
    },
  });

  return (
    <header className="app-safe-x app-safe-top flex min-h-[calc(3rem+var(--kbts-safe-top))] shrink-0 items-center justify-between border-b border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-950">
      {/* Brand */}
      <Link to="/" className="flex items-center gap-2">
        <img
          src="/brand-logo.svg"
          alt="Kube-BT-Sync"
          className="h-6 w-auto object-contain"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Kube-BT-Sync</span>
      </Link>

      {/* Right actions */}
      <div className="flex items-center gap-1">
        <HeaderNotificationsSheet />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full px-1 text-sm text-slate-600 transition active:bg-slate-100 dark:text-slate-300 dark:active:bg-slate-800">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                {(status?.username ?? "?").slice(0, 1).toUpperCase()}
              </div>
              <ChevronDown size={13} className="text-slate-400" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <div className="px-3 py-2">
              <p className="text-xs font-medium text-slate-700">{status?.username ?? "—"}</p>
              <p className="text-[11px] text-slate-400">{status?.role === "admin" ? "管理员" : "只读"}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/account/personal" className="flex items-center gap-2">
                <User size={14} />
                我的资料
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/account/settings" className="flex items-center gap-2">
                <Settings size={14} />
                账户设置
              </Link>
            </DropdownMenuItem>
            {status?.role === "admin" && (
              <DropdownMenuItem asChild>
                <Link to="/account/users" className="flex items-center gap-2">
                  <Users size={14} />
                  用户管理
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-red-600 focus:text-red-600"
              onClick={() => logoutMut.mutate()}
            >
              <LogOut size={14} className="mr-2" />
              退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

// ── Mobile App Layout ──────────────────────────────────────────────────────

const AppLayoutMobile: React.FC = () => {
  const { pathname } = useLocation();

  // Full-bleed pages: bastion console, pod terminal — no chrome
  const isBastionFullBleed =
    pathname === "/cluster/bastion" ||
    pathname.startsWith("/cluster/bastion/") ||
    pathname === "/cluster/vcenter/bastion" ||
    pathname.startsWith("/cluster/vcenter/bastion/");

  const isPodTerminalShell =
    /\/cluster\/ns\/[^/]+\/pods\/[^/]+\/terminal\/?$/.test(pathname);

  const hideAppChrome = isPodTerminalShell || isBastionFullBleed;

  if (hideAppChrome) {
    return (
      <div className="app-mobile-shell flex min-h-0 flex-col overflow-hidden bg-[#0c0f14]">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="app-mobile-shell flex min-h-0 min-w-0 flex-col overflow-hidden bg-white dark:bg-slate-950">
      <MobileHeader />
      <PlatformVersionBanner />
      <RedisStatusBanner />

      {/* 底部导航参与 flex 布局，主内容不再重复预留安全区高度。 */}
      <main className="app-safe-x min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain py-3">
        <div className="mx-auto w-full min-w-0 max-w-full">
          <Outlet />
        </div>
      </main>

      <MobileBottomNav />
      <PwaInstallHint />
    </div>
  );
};

export default AppLayoutMobile;

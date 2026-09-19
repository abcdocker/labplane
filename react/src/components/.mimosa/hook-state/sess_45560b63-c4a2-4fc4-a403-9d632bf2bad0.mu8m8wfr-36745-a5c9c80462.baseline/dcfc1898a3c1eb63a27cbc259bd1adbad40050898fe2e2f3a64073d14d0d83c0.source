import React from "react";
import { useAppConfig } from "@/hooks/use-app-config";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  AppWindow,
  ChevronDown,
  Hexagon,
  Home,
  LayoutDashboard,
  LogOut,
  Monitor,
  Network,
  Fingerprint,
  Server,
  Sparkles,
  Settings,
  SquareTerminal,
  User,
  Users,
  Library,
} from "lucide-react";
import { useAuth } from "@/auth/auth-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { workspaceFromPathname } from "@/lib/workspace";
import { cn } from "@/lib/utils";
import GlobalSearchBar from "@/components/GlobalSearchBar";
import { menuItemVisible, moduleVisible } from "@/lib/platform-permissions";
import HeaderNotificationsSheet from "@/components/HeaderNotificationsSheet";

const Header: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { status, logout } = useAuth();
  const workspace = workspaceFromPathname(location.pathname);
  const isHub = workspace === "hub";
  const isK8s = workspace === "kubernetes";
  const isVcenter = workspace === "vcenter";
  const isBaota = workspace === "baota";
  const isAppcenter = workspace === "appcenter";
  const isBastion = workspace === "bastion";
  const isAiInspect = workspace === "aiinspect";
  const isMesh = workspace === "mesh";
  const isAuthentik = workspace === "authentik";
  const isDocs = workspace === "docs";

  const cfgQ = useAppConfig();
  const cfg = cfgQ.data;
  const perm = cfg?.permissions;
  const navRole = status?.role;
  const isViewer = cfg?.dashboardRole === "viewer" || cfg?.viewer === true;
  const headerShowK8s = menuItemVisible(perm, "kubernetes", navRole, moduleVisible(perm, "k8s"));
  const headerShowVc = menuItemVisible(perm, "vcenter", navRole, moduleVisible(perm, "vcenter"));
  const headerShowBaota = menuItemVisible(perm, "baota", navRole, moduleVisible(perm, "baota"));
  const headerShowApp = menuItemVisible(perm, "appcenter", navRole, moduleVisible(perm, "appcenter"));
  const headerShowBastion = menuItemVisible(
    perm,
    "vcenter_bastion",
    navRole,
    moduleVisible(perm, "vcenter") || moduleVisible(perm, "appcenter")
  );
  const headerShowAiInspect = menuItemVisible(perm, "aiInspect", navRole, true);
  const headerShowMesh = menuItemVisible(perm, "mesh", navRole, true);
  const headerShowAuthentik = menuItemVisible(perm, "authentik", navRole, true);

  /** 与 MySQL 是否连通无关：管理员应始终看到入口；无库时页面内会提示配置 MySQL */
  const showPlatformUsers =
    !isViewer &&
    (status?.role === "admin" || cfg?.dashboardRole === "admin");

  const showLogout = Boolean(status?.authRequired && status.loggedIn);
  const displayName =
    status?.loggedIn && status.username
      ? status.username
      : (cfg?.dashboardUser?.trim() || "Admin");
  const userAvatarUrl = (status?.avatarUrl ?? "").trim();

  const showBackHub = location.pathname !== "/" && location.pathname !== "";

  return (
    <header
      data-cmp="Header"
      className="sticky top-0 z-50 flex h-20 w-full min-w-0 flex-shrink-0 items-center gap-3 border-b border-[#E2E8F0] bg-white px-4 sm:px-8"
    >
      {showBackHub && (
        <Link
          to="/"
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50/90 px-2.5 text-sm font-medium text-slate-800 outline-none transition-colors hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-500/30 sm:px-3"
          title="返回工作台首页"
        >
          <LayoutDashboard size={18} className="shrink-0 text-slate-600" aria-hidden />
          <span className="hidden sm:inline">工作台</span>
        </Link>
      )}

      {(cfg?.platformLogoUrl || cfg?.platformDisplayName) && (
        <div className="flex min-w-0 shrink items-center gap-2 border-l border-slate-200 pl-3 sm:pl-4">
          {cfg?.platformLogoUrl && (
            <img
              src={cfg.platformLogoUrl}
              alt=""
              className="h-8 max-h-9 max-w-[140px] object-contain"
            />
          )}
          {cfg?.platformDisplayName && (
            <span
              className={cn(
                "platform-display-name-breathe hidden max-w-[min(200px,28vw)] truncate text-sm font-semibold text-slate-800 sm:inline"
              )}
            >
              {cfg.platformDisplayName}
            </span>
          )}
        </div>
      )}

      <GlobalSearchBar />

      <div className="ml-auto flex min-w-0 shrink-0 items-center space-x-2 sm:space-x-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium outline-none transition-colors",
                "border-slate-200 bg-slate-50/90 text-slate-800 hover:bg-slate-100",
                "focus-visible:ring-2 focus-visible:ring-blue-500/30"
              )}
              aria-label="切换工作区：Kubernetes、vCenter、宝塔、应用中心、堡垒机、AI 巡检、异地组网、Authentik、文档仓库"
            >
              <span
                className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white",
                isHub
                    ? "from-slate-500 to-slate-700"
                    : isDocs
                      ? "from-zinc-700 to-violet-800"
                      : isK8s
                        ? "from-blue-600 to-blue-700"
                        : isVcenter
                          ? "from-violet-600 to-violet-700"
                          : isBaota
                            ? "from-amber-600 to-orange-600"
                            : isBastion
                              ? "from-teal-600 to-emerald-800"
                              : isAiInspect
                                ? "from-cyan-600 to-teal-700"
                                : isMesh
                                  ? "from-indigo-600 to-violet-700"
                                  : isAuthentik
                                    ? "from-fuchsia-600 to-purple-700"
                                    : "from-emerald-600 to-emerald-700"
                )}
              >
                {isHub ? (
                  <Home size={17} strokeWidth={2.25} />
                ) : isDocs ? (
                  <Library size={17} strokeWidth={2.25} />
                ) : isK8s ? (
                  <Hexagon size={18} strokeWidth={2.5} />
                ) : isVcenter ? (
                  <Monitor size={18} strokeWidth={2.25} />
                ) : isBaota ? (
                  <Server size={17} strokeWidth={2.25} />
                ) : isBastion ? (
                  <SquareTerminal size={17} strokeWidth={2.25} />
                ) : isAiInspect ? (
                  <Sparkles size={17} strokeWidth={2.25} />
                ) : isMesh ? (
                  <Network size={17} strokeWidth={2.25} />
                ) : isAuthentik ? (
                  <Fingerprint size={17} strokeWidth={2.25} />
                ) : (
                  <AppWindow size={17} strokeWidth={2.25} />
                )}
              </span>
              <span className="hidden text-left sm:inline">
                {isHub
                  ? "工作台"
                  : isDocs
                    ? "文档仓库"
                    : isK8s
                      ? "Kubernetes"
                      : isVcenter
                        ? "vCenter"
                        : isBaota
                          ? "宝塔"
                          : isBastion
                            ? "堡垒机"
                            : isAiInspect
                              ? "AI 巡检"
                              : isMesh
                                ? "异地组网"
                                : isAuthentik
                                  ? "Authentik"
                                  : "应用中心"}
              </span>
              <ChevronDown size={16} className="text-slate-500" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[228px]">
            {moduleVisible(perm, "k8s") ? (
            <DropdownMenuItem
              className="cursor-pointer gap-2 py-2.5"
              onSelect={() => navigate("/cluster")}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
                <Hexagon className="text-white" size={18} strokeWidth={2.5} />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">Kubernetes</span>
                <span className="text-xs text-muted-foreground">集群资源</span>
              </div>
            </DropdownMenuItem>
            ) : null}
            {headerShowVc ? (
            <DropdownMenuItem
              className="cursor-pointer gap-2 py-2.5"
              onSelect={() => navigate("/cluster/vcenter/dashboard")}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600">
                <Monitor className="text-white" size={17} strokeWidth={2.25} />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">vCenter</span>
                <span className="text-xs text-muted-foreground">虚拟机与控制台</span>
              </div>
            </DropdownMenuItem>
            ) : null}
            {headerShowBaota ? (
            <DropdownMenuItem
              className="cursor-pointer gap-2 py-2.5"
              onSelect={() => navigate("/cluster/baota/sync")}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-600">
                <Server className="text-white" size={17} strokeWidth={2.25} />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">宝塔</span>
                <span className="text-xs text-muted-foreground">Ingress 同步与面板</span>
              </div>
            </DropdownMenuItem>
            ) : null}
            {headerShowApp ? (
            <DropdownMenuItem
              className="cursor-pointer gap-2 py-2.5"
              onSelect={() => navigate("/cluster/apps/dashboard")}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600">
                <AppWindow className="text-white" size={17} strokeWidth={2.25} />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">应用中心</span>
                <span className="text-xs text-muted-foreground">统一应用入口（建设中）</span>
              </div>
            </DropdownMenuItem>
            ) : null}
            {headerShowBastion ? (
            <DropdownMenuItem
              className="cursor-pointer gap-2 py-2.5"
              onSelect={() => navigate("/cluster/bastion/session")}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-teal-600 to-emerald-800">
                <SquareTerminal className="text-white" size={17} strokeWidth={2.25} />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">堡垒机</span>
                <span className="text-xs text-muted-foreground">vCenter 终端 · 应用中心 SSH/Redis</span>
              </div>
            </DropdownMenuItem>
            ) : null}
            {headerShowAiInspect ? (
            <DropdownMenuItem
              className="cursor-pointer gap-2 py-2.5"
              onSelect={() => navigate("/cluster/ai-inspect/dashboard")}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-600 to-teal-700">
                <Sparkles className="text-white" size={17} strokeWidth={2.25} />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">AI 巡检</span>
                <span className="text-xs text-muted-foreground">监控中心 · 告警 · AI 助手</span>
              </div>
            </DropdownMenuItem>
            ) : null}
            {headerShowMesh ? (
            <DropdownMenuItem
              className="cursor-pointer gap-2 py-2.5"
              onSelect={() => navigate("/cluster/mesh")}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-violet-700">
                <Network className="text-white" size={17} strokeWidth={2.25} />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">异地组网</span>
                <span className="text-xs text-muted-foreground">Headscale · 路由 · 流量</span>
              </div>
            </DropdownMenuItem>
            ) : null}
            {headerShowAuthentik ? (
            <DropdownMenuItem
              className="cursor-pointer gap-2 py-2.5"
              onSelect={() => navigate("/cluster/authentik")}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-fuchsia-600 to-purple-700">
                <Fingerprint className="text-white" size={17} strokeWidth={2.25} />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">Authentik</span>
                <span className="text-xs text-muted-foreground">SSO · 用户 · 应用对接</span>
              </div>
            </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              className="cursor-pointer gap-2 py-2.5"
              onSelect={() => navigate("/docs")}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-zinc-700 to-violet-800">
                <Library className="text-white" size={17} strokeWidth={2.25} />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">文档仓库</span>
                <span className="text-xs text-muted-foreground">Markdown 笔记 · 版本 · 媒体</span>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <HeaderNotificationsSheet />

        <div className="h-8 w-px bg-slate-200" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center space-x-3 rounded-xl px-2 py-1.5 outline-none transition-colors hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-500/30"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-blue-200 bg-gradient-to-tr from-blue-100 to-indigo-100 text-blue-600">
                {userAvatarUrl ? (
                  <img src={userAvatarUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <User size={18} />
                )}
              </div>
              <div className="hidden text-left sm:flex sm:flex-col">
                <span className="leading-none text-sm font-semibold text-slate-900">
                  {displayName}
                </span>
                <span className="mt-0.5 text-xs text-slate-500">
                  {status?.authRequired ? "已登录" : "控制台"}
                </span>
              </div>
              <ChevronDown size={16} className="text-slate-400" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[200px]">
            <DropdownMenuItem
              className="cursor-pointer gap-2"
              onSelect={() => navigate("/account/personal")}
            >
              <User size={16} />
              个人中心
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer gap-2"
              onSelect={() => navigate("/account/settings")}
            >
              <Settings size={16} />
              账户与平台设置
            </DropdownMenuItem>
            {showPlatformUsers && (
              <DropdownMenuItem
                className="cursor-pointer gap-2"
                onSelect={() => navigate("/account/users")}
              >
                <Users size={16} />
                平台用户管理
              </DropdownMenuItem>
            )}
            {showLogout && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer gap-2 text-red-600 focus:text-red-600"
                  onSelect={() => void logout().then(() => navigate("/login", { replace: true }))}
                >
                  <LogOut size={16} />
                  退出登录
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

export default Header;

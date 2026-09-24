import React, { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import {
  LayoutDashboard,
  Loader2,
  LogIn,
  Plus,
  Server,
  Settings,
  Boxes,
  CloudCog,
  Activity as NodeActivityIcon,
  Globe,
  Monitor,
  Cpu,
  Cloud,
  AppWindow,
  Bot,
  Sparkles,
  LineChart,
  Bell,
  ScrollText,
  Radar,
  Database,
  FolderTree,
  Ship,
  HardDrive,
  Shield,
  FileText,
  BarChart3,
  Library,
  Search,
  Layers,
  KeyRound,
  Calendar,
  ShieldCheck,
  Hexagon,
  SquareTerminal,
  Router,
  ClipboardList,
  Gauge,
  Network,
  Fingerprint,
  Waypoints,
} from "lucide-react";
import { useAuth } from "@/auth/auth-context";
import { useQuery } from "@tanstack/react-query";
import { apiGetJson } from "@/lib/api";
import { useRuntimeStatusQuery } from "@/hooks/use-runtime-status";
import { WORKSPACE_STORAGE_KEY, type WorkspaceId } from "@/lib/workspace";
import { cn } from "@/lib/utils";
import { menuItemVisible, moduleVisible } from "@/lib/platform-permissions";
import type { K8sSidebarMenuItem } from "@/lib/api";

type SidebarWorkspace = WorkspaceId;

function readWorkspace(): SidebarWorkspace {
  try {
    const v = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (
      v === "hub" ||
      v === "vcenter" ||
      v === "kubernetes" ||
      v === "appcenter" ||
      v === "bastion" ||
      v === "aiinspect" ||
      v === "mesh" ||
      v === "authentik" ||
      v === "docs"
    ) {
      return v;
    }
  } catch {
    /* ignore */
  }
  return "kubernetes";
}

function dashboardPath(ws: SidebarWorkspace): string {
  switch (ws) {
    case "hub":
      return "/";
    case "kubernetes":
      return "/cluster";
    case "vcenter":
      return "/cluster/vcenter/dashboard";
    case "appcenter":
      return "/cluster/apps/dashboard";
    case "bastion":
      return "/cluster/bastion";
    case "aiinspect":
      return "/cluster/ai-inspect/dashboard";
    case "mesh":
      return "/cluster/mesh";
    case "authentik":
      return "/cluster/authentik";
    case "docs":
      return "/docs";
    default:
      return "/cluster";
  }
}

function isDashboardActive(pathname: string, ws: SidebarWorkspace): boolean {
  const p = dashboardPath(ws);
  if (p === "/") {
    return (
      pathname === "/" ||
      pathname === "" ||
      pathname === "/settings" ||
      (pathname.startsWith("/account") &&
        !pathname.startsWith("/account/audit") &&
        !pathname.startsWith("/account/site-stats"))
    );
  }
  if (ws === "docs") {
    return (
      pathname === "/docs" ||
      pathname === "/docs/" ||
      pathname.startsWith("/docs/doc/")
    );
  }
  if (ws === "appcenter") {
    return (
      pathname === "/cluster/apps/dashboard" ||
      pathname === "/cluster/apps" ||
      pathname === "/cluster/apps/"
    );
  }
  if (ws === "bastion") {
    return pathname === "/cluster/bastion" || pathname === "/cluster/bastion/";
  }
  if (ws === "aiinspect") {
    // 仅总览入口高亮 Dashboard；日志查询/日志采集/监控等子页各自高亮，避免与「日志采集」同色冲突
    return (
      pathname === "/cluster/ai-inspect/dashboard" ||
      pathname === "/cluster/ai-inspect" ||
      pathname === "/cluster/ai-inspect/"
    );
  }
  if (ws === "mesh") {
    // 异地组网的 Dashboard 槽位与组内首项指向同一路径。
    return false;
  }
  return pathname === p || pathname === `${p}/`;
}

function navLinkTint(
  isActive: boolean,
  tint: "blue" | "violet" | "amber" | "emerald" | "slate"
) {
  const m = {
    blue: {
      active:
        "bg-blue-50 text-blue-700 shadow-[inset_4px_0_0_0_#2563eb]",
      icon: "text-blue-600",
    },
    violet: {
      active:
        "bg-violet-50 text-violet-800 shadow-[inset_4px_0_0_0_#7c3aed]",
      icon: "text-violet-600",
    },
    amber: {
      active:
        "bg-amber-50 text-amber-900 shadow-[inset_4px_0_0_0_#d97706]",
      icon: "text-amber-600",
    },
    emerald: {
      active:
        "bg-emerald-50 text-emerald-900 shadow-[inset_4px_0_0_0_#059669]",
      icon: "text-emerald-600",
    },
    slate: {
      active:
        "bg-slate-100 text-slate-900 shadow-[inset_4px_0_0_0_#64748b]",
      icon: "text-slate-600",
    },
  }[tint];
  return cn(
    "flex items-center space-x-3 rounded-xl px-4 py-3.5 text-sm font-medium transition-all duration-200",
    isActive ? m.active : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
  );
}

function iconTint(isActive: boolean, tint: "blue" | "violet" | "amber" | "emerald" | "slate") {
  if (!isActive) return "text-slate-400";
  const m = {
    blue: "text-blue-600",
    violet: "text-violet-600",
    amber: "text-amber-600",
    emerald: "text-emerald-600",
    slate: "text-slate-600",
  };
  return m[tint];
}

type K8sNavItem = {
  id: K8sSidebarMenuItem["key"];
  to: string | { pathname: string; search?: string };
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  nsResource?:
    | "pods"
    | "deployments"
    | "statefulsets"
    | "daemonsets"
    | "services"
    | "pvcs"
    | "configmaps"
    | "secrets";
  /** 命名空间浏览入口（/cluster/ns…） */
  namespaceBrowse?: boolean;
  /** /cluster/rbac */
  rbacPage?: boolean;
  /** /cluster/harbor */
  harborPage?: boolean;
  /** /cluster/custom-resources */
  customResourcesPage?: boolean;
  /** /cluster/etcd */
  etcdPage?: boolean;
  /** /cluster/routes — Ingress + Gateway API 路由管理面板 */
  routeManagerPage?: boolean;
};

const DEFAULT_K8S_SIDEBAR_MENU: K8sSidebarMenuItem[] = [
  { key: "pods", label: "Pods", order: 10 },
  { key: "namespaces", label: "NameSpace", order: 20 },
  { key: "nodes", label: "Nodes", order: 30 },
  { key: "etcd", label: "etcd", order: 35 },
  { key: "rbac", label: "RBAC", order: 40 },
  { key: "routeManager", label: "路由管理", order: 45 },
  { key: "harbor", label: "Harbor 仓库", order: 50 },
  { key: "customResources", label: "自定义资源", order: 60 },
];

const k8sNavItems: K8sNavItem[] = [
  {
    id: "pods",
    to: "/cluster/pods",
    label: "Pods",
    icon: Boxes,
    nsResource: "pods",
  },
  {
    id: "namespaces",
    to: { pathname: "/cluster/ns", search: "?resource=pods" },
    label: "NameSpace",
    icon: FolderTree,
    namespaceBrowse: true,
  },
  { id: "nodes", to: "/cluster/nodes", label: "Nodes", icon: NodeActivityIcon },
  { id: "etcd", to: "/cluster/etcd", label: "etcd", icon: Database, etcdPage: true },
  { id: "rbac", to: "/cluster/rbac", label: "RBAC", icon: Shield, rbacPage: true },
  {
    id: "routeManager",
    to: "/cluster/routes",
    label: "路由管理",
    icon: Waypoints,
    routeManagerPage: true,
  },
  { id: "harbor", to: "/cluster/harbor", label: "Harbor 仓库", icon: Ship, harborPage: true },
  {
    id: "customResources",
    to: "/cluster/custom-resources",
    label: "自定义资源",
    icon: Layers,
    customResourcesPage: true,
  },
];

function normalizeK8sSidebarMenu(items?: K8sSidebarMenuItem[]): K8sSidebarMenuItem[] {
  const defaults = new Map(DEFAULT_K8S_SIDEBAR_MENU.map((item) => [item.key, item]));
  const custom = new Map<string, K8sSidebarMenuItem>();
  (items ?? []).forEach((item) => {
    const base = defaults.get(item.key);
    if (!base || custom.has(item.key)) return;
    custom.set(item.key, {
      key: item.key,
      label: item.label?.trim() || base.label,
      hidden: Boolean(item.hidden),
      order: Number(item.order) || base.order,
    });
  });
  return DEFAULT_K8S_SIDEBAR_MENU.map((base) => custom.get(base.key) ?? { ...base })
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((item, index) => ({
      ...item,
      label: item.label?.trim() || defaults.get(item.key)?.label || item.key,
      order: (index + 1) * 10,
    }));
}

/** 侧栏「Pods」仅对应全集群 Pod 列表；命名空间内 Pod 归入「按命名空间浏览」 */
function isNamespaceWorkspacePath(pathname: string): boolean {
  if (pathname === "/cluster/ns" || pathname === "/cluster/ns/") return true;
  return /^\/cluster\/ns\/[^/]+\//.test(pathname);
}

function isWorkspaceResourceActive(
  resource: string,
  pathname: string,
  search: string
): boolean {
  if (resource === "pods") {
    return pathname === "/cluster/pods" || pathname.startsWith("/cluster/pods/");
  }
  const q = new URLSearchParams(search).get("resource") || "pods";
  if (pathname === "/cluster/ns" || pathname === "/cluster/ns/") {
    return q === resource;
  }
  const m = pathname.match(
    /^\/cluster\/ns\/[^/]+\/(pods|deployments|statefulsets|daemonsets|services|pvcs|configmaps|secrets)(?:\/|$)/
  );
  if (m) return m[1] === resource;
  return false;
}

function k8sItemActive(
  item: K8sNavItem,
  pathname: string,
  search: string
): boolean {
  if (item.namespaceBrowse) {
    return isNamespaceWorkspacePath(pathname);
  }
  if (item.rbacPage) {
    return pathname === "/cluster/rbac" || pathname.startsWith("/cluster/rbac/");
  }
  if (item.harborPage) {
    return pathname === "/cluster/harbor" || pathname.startsWith("/cluster/harbor/");
  }
  if (item.customResourcesPage) {
    return (
      pathname === "/cluster/custom-resources" ||
      pathname.startsWith("/cluster/custom-resources/")
    );
  }
  if (item.etcdPage) {
    return pathname === "/cluster/etcd" || pathname.startsWith("/cluster/etcd/");
  }
  if (item.routeManagerPage) {
    return pathname === "/cluster/routes" || pathname.startsWith("/cluster/routes/");
  }
  if (item.nsResource) {
    return isWorkspaceResourceActive(item.nsResource, pathname, search);
  }
  const to = item.to;
  if (typeof to === "string") {
    return pathname === to || pathname.startsWith(`${to}/`);
  }
  return false;
}

function k8sItemKey(item: K8sNavItem): string {
  return item.id;
}

/** 虚拟机列表/详情高亮；排除 dashboard、宿主机、公有云、设置 */
function isVcenterVmNavActive(pathname: string): boolean {
  if (pathname === "/cluster/vcenter/dashboard") return false;
  if (pathname === "/cluster/vcenter/gpu") return false;
  if (pathname === "/cluster/vcenter/router") return false;
  if (pathname === "/cluster/vcenter") return true;
  if (
    pathname === "/cluster/vcenter/hosts" ||
    pathname.startsWith("/cluster/vcenter/hosts/") ||
    pathname === "/cluster/vcenter/settings" ||
    pathname === "/cluster/vcenter/cloud" ||
    pathname.startsWith("/cluster/vcenter/cloud/") ||
    pathname.startsWith("/cluster/vcenter/tools")
  ) {
    return false;
  }
  return pathname.startsWith("/cluster/vcenter/");
}

function isCloudHostsNavActive(pathname: string): boolean {
  return pathname === "/cluster/vcenter/cloud" || pathname.startsWith("/cluster/vcenter/cloud/");
}

const Sidebar: React.FC = () => {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const instParam = searchParams.get("inst") ?? "";
  const meshInstancesQ = useQuery({
    queryKey: ["mesh-instances-sidebar"],
    queryFn: () =>
      apiGetJson<{ instances: { id: string; name: string; region?: string; enabled: boolean }[] }>(
        "/api/ops/mesh/instances",
      ),
    enabled: location.pathname.startsWith("/cluster/mesh"),
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });
  const meshInstances = meshInstancesQ.data?.instances ?? [];
  const authentikInstancesQ = useQuery({
    queryKey: ["authentik-instances"],
    queryFn: () =>
      apiGetJson<{ instances: { id: string; name: string; enabled: boolean }[] }>(
        "/api/ops/authentik/instances",
      ),
    enabled: location.pathname.startsWith("/cluster/authentik"),
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });
  const authentikInstances = authentikInstancesQ.data?.instances ?? [];
  const [workspace, setWorkspace] = useState<SidebarWorkspace>(() => readWorkspace());

  useEffect(() => {
    try {
      localStorage.setItem(WORKSPACE_STORAGE_KEY, workspace);
    } catch {
      /* ignore */
    }
  }, [workspace]);

  useEffect(() => {
    const path = location.pathname;
    if (path === "/" || path === "") {
      setWorkspace("hub");
    } else if (path.startsWith("/account") || path === "/settings") {
      setWorkspace("hub");
    } else if (path.startsWith("/docs")) {
      setWorkspace("docs");
    } else if (path.startsWith("/cluster/vcenter")) {
      setWorkspace("vcenter");
    } else if (path.startsWith("/cluster/apps")) {
      setWorkspace("appcenter");
    } else if (path.startsWith("/cluster/bastion")) {
      setWorkspace("bastion");
    } else if (path.startsWith("/cluster/ai-inspect")) {
      setWorkspace("aiinspect");
    } else if (path.startsWith("/cluster/authentik")) {
      setWorkspace("authentik");
    } else if (path.startsWith("/cluster/mesh")) {
      setWorkspace("mesh");
    } else if (path.startsWith("/cluster")) {
      setWorkspace("kubernetes");
    }
  }, [location.pathname]);

  const runtimeQ = useRuntimeStatusQuery();
  const { status: authStatus } = useAuth();
  const navRole = authStatus?.role;

  const check = runtimeQ.data?.systemCheck;
  const cfg = runtimeQ.data?.config;
  const perm = cfg?.permissions;

  // 全局模块显隐：管理员可在平台控制哪些模块对所有人可见
  const moduleVisQ = useQuery({
    queryKey: ["module-visibility"],
    queryFn: () => apiGetJson<{ modules: Record<string, boolean> }>("/api/settings/modules"),
    staleTime: 30_000,
  });
  const moduleVis = moduleVisQ.data?.modules ?? {};
  const globVisible = (mod: string) => moduleVis[mod] !== false;

  const showK8sNav = globVisible("kubernetes") && menuItemVisible(perm, "kubernetes", navRole, moduleVisible(perm, "k8s"));
  const showVcNav = globVisible("vcenter") && menuItemVisible(perm, "vcenter", navRole, moduleVisible(perm, "vcenter"));
  const showAppCenterNav = globVisible("appcenter") && menuItemVisible(perm, "appcenter", navRole, moduleVisible(perm, "appcenter"));
  const showAiInspectNav = globVisible("aiinspect") && menuItemVisible(perm, "aiInspect", navRole, true);
  const showMeshNav = globVisible("mesh") && menuItemVisible(perm, "mesh", navRole, true);
  const showAuthentikNav = globVisible("authentik") && menuItemVisible(perm, "authentik", navRole, true);
  const showBastionNav = menuItemVisible(
    perm,
    "vcenter_bastion",
    navRole,
    moduleVisible(perm, "vcenter") || moduleVisible(perm, "appcenter")
  );
  const showVcCloud = menuItemVisible(perm, "vcenter_cloud", navRole, moduleVisible(perm, "vcenter"));
  const showVcTools = menuItemVisible(perm, "vcenter_tools", navRole, moduleVisible(perm, "vcenter"));
  const showHarborNav = menuItemVisible(perm, "harbor", navRole, moduleVisible(perm, "k8s"));
  const showK8sClusterSettings =
    navRole === "admin" && menuItemVisible(perm, "k8s_settings", navRole, true);
  const showVcSettings =
    navRole === "admin" && menuItemVisible(perm, "vcenter_settings", navRole, true);
  const statusLoading = runtimeQ.isLoading;
  const isViewer = cfg?.dashboardRole === "viewer" || cfg?.viewer === true;
  const showPlatformAudit = !isViewer && navRole === "admin";

  const k8sLive = cfg?.k8sConfigured === true;
  const k8sFile = cfg?.k8sRuntimeConfigured === true;
  const k8sDotClass = statusLoading
    ? "bg-slate-300"
    : k8sLive
      ? "bg-emerald-500"
      : k8sFile
        ? "bg-amber-500"
        : "bg-slate-400";
  const k8sStatusLabel = statusLoading
    ? "Kubernetes …"
    : k8sLive
      ? "Kubernetes 已连接"
      : k8sFile
        ? "Kubernetes 已填写（未连集群）"
        : "Kubernetes 未配置";

  const vcLive = cfg?.vcenterConfigured === true;
  const vcFile = cfg?.vcenterRuntimeConfigured === true;
  const vcDotClass = statusLoading
    ? "bg-slate-300"
    : vcLive
      ? "bg-emerald-500"
      : vcFile
        ? "bg-amber-500"
        : "bg-slate-400";
  const vcStatusLabel = statusLoading
    ? "vCenter …"
    : vcLive
      ? "vCenter 已配置"
      : vcFile
        ? "vCenter 已填写（缺密码或未验证）"
        : "vCenter 未配置";

  const redisAddrOk = isViewer
    ? cfg?.redisAddrPresent === true
    : cfg?.redisConfigured === true;
  const redisDotClass = statusLoading
    ? "bg-slate-300"
    : isViewer
      ? redisAddrOk
        ? "bg-emerald-500"
        : "bg-slate-400"
      : !cfg?.redisConfigured
        ? "bg-amber-500"
        : cfg?.redisConnected
          ? "bg-emerald-500"
          : "bg-amber-500";
  const redisStatusLabel = statusLoading
    ? "Redis …"
    : isViewer
      ? redisAddrOk
        ? "Redis 已填写"
        : "Redis"
      : !cfg?.redisConfigured
        ? "Redis 未配置"
        : cfg?.redisConnected
          ? "Redis 已连接"
          : "Redis 未连接";

  const k8sNavFiltered = isViewer
    ? k8sNavItems.filter(
        (i) =>
          i.harborPage ||
          (i.nsResource !== "pods" && i.nsResource !== "configmaps")
      )
    : k8sNavItems;
  const k8sSidebarMenu = normalizeK8sSidebarMenu(cfg?.k8sSidebarMenu);
  const k8sSidebarMenuMap = new Map(k8sSidebarMenu.map((item) => [item.key, item]));
  const k8sNavComposed = k8sNavFiltered
    .map((item) => {
      const override = k8sSidebarMenuMap.get(item.id);
      return {
        ...item,
        label: override?.label?.trim() || item.label,
        hidden: Boolean(override?.hidden),
        order: override?.order ?? 0,
      };
    })
    .filter((item) => !item.hidden)
    .sort((a, b) => a.order - b.order);

  const isHub = workspace === "hub";
  const isDocs = workspace === "docs";
  const isK8s = workspace === "kubernetes";
  const isVcenter = workspace === "vcenter";
  const isAppcenter = workspace === "appcenter";
  const isBastion = workspace === "bastion";
  const isAiinspect = workspace === "aiinspect";
  const isMesh = workspace === "mesh";
  const isAuthentik = workspace === "authentik";

  const dashActive = isDashboardActive(location.pathname, workspace);
  const dashTo = dashboardPath(workspace);

  const appCenterRedisActive =
    location.pathname === "/cluster/apps/redis" ||
    location.pathname.startsWith("/cluster/apps/redis/");

  const appCenterCloudVmActive =
    location.pathname === "/cluster/apps/cloud-vm" ||
    location.pathname.startsWith("/cluster/apps/cloud-vm/");

  const appCenterOpenSearchActive =
    location.pathname === "/cluster/apps/opensearch" ||
    location.pathname.startsWith("/cluster/apps/opensearch/");

  const appCenterKafkaActive =
    location.pathname === "/cluster/apps/kafka" ||
    location.pathname.startsWith("/cluster/apps/kafka/");

  const appCenterDnsActive =
    location.pathname === "/cluster/apps/dns" ||
    location.pathname.startsWith("/cluster/apps/dns/");

  const appCenterTencentCloudActive =
    location.pathname === "/cluster/apps/tencent-cloud" ||
    location.pathname.startsWith("/cluster/apps/tencent-cloud/");

  const appCenterQiniuCloudActive =
    location.pathname === "/cluster/apps/qiniu-cloud" ||
    location.pathname.startsWith("/cluster/apps/qiniu-cloud/");

  const appCenterUpyunCloudActive =
    location.pathname === "/cluster/apps/upyun-cloud" ||
    location.pathname.startsWith("/cluster/apps/upyun-cloud/");


  const aiInspectReportsActive =
    location.pathname === "/cluster/ai-inspect/reports" ||
    location.pathname.startsWith("/cluster/ai-inspect/reports/");
  const aiInspectConfigureActive =
    location.pathname === "/cluster/ai-inspect/configure" ||
    location.pathname.startsWith("/cluster/ai-inspect/configure/");
  const aiInspectMonitoringActive = location.pathname.startsWith("/cluster/ai-inspect/monitoring");
  const aiInspectAlertsActive = location.pathname.startsWith("/cluster/ai-inspect/alerts");
  const aiInspectLogsActive = location.pathname.startsWith("/cluster/ai-inspect/logs");
  const aiInspectLogCollectionActive = location.pathname.startsWith("/cluster/ai-inspect/log-collection");
  const aiInspectAssistantActive = location.pathname.startsWith("/cluster/ai-inspect/assistant");

  const docsMediaActive =
    location.pathname === "/docs/media" || location.pathname.startsWith("/docs/media/");

  const brandLabel = isDocs
    ? "文档仓库"
    : isHub
      ? "工作台"
      : isK8s
        ? "Kubernetes"
        : isVcenter
          ? "vCenter"
          : isBastion
            ? "堡垒机"
            : isAiinspect
              ? "AI 巡检"
              : isMesh
                ? "异地组网"
                : isAuthentik
                  ? "Authentik"
                  : "应用中心";

  const brandClass = isDocs
    ? "text-violet-600/90"
    : isHub
      ? "text-slate-600/90"
      : isK8s
        ? "text-blue-600/90"
        : isVcenter
          ? "text-violet-600/90"
          : isBastion
            ? "text-teal-600/90"
            : isAiinspect
              ? "text-cyan-600/90"
              : isMesh
                ? "text-indigo-600/90"
                : isAuthentik
                  ? "text-fuchsia-600/90"
                  : "text-emerald-600/90";

  const dashTint: "blue" | "violet" | "amber" | "emerald" | "slate" = isDocs
    ? "violet"
    : isHub
      ? "slate"
      : isK8s
        ? "blue"
        : isVcenter
          ? "violet"
          : isBastion
            ? "emerald"
            : isAiinspect
              ? "slate"
              : isAppcenter
                  ? "slate"
                  : isMesh
                    ? "slate"
                    : isAuthentik
                      ? "slate"
                      : "emerald";

  const dashLabel = isDocs ? "文档库" : isBastion ? "控制台" : isAppcenter ? "概览" : "Dashboard";

  return (
    <aside
      data-cmp="Sidebar"
      data-workspace={workspace}
      className="z-10 flex w-[260px] flex-shrink-0 flex-col border-r border-[#E2E8F0] bg-white"
    >
      <div className="border-b border-[#E2E8F0] px-3 py-3">
        <div className="flex w-full items-center gap-2 rounded-xl px-2 py-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200/90 bg-white p-1 shadow-sm">
            <img
              src={cfg?.platformLogoUrl?.trim() ? cfg.platformLogoUrl.trim() : "/brand-logo.svg"}
              alt=""
              width={40}
              height={40}
              className="max-h-8 w-auto max-w-[40px] object-contain"
            />
          </div>
          <div className="min-w-0 flex-1">
            <span
              className={cn(
                "block truncate text-base font-bold leading-tight text-slate-900",
                cfg?.platformDisplayName?.trim() ? "platform-display-name-breathe" : undefined
              )}
            >
              {cfg?.platformDisplayName?.trim() || "LabPlane"}
            </span>
            <span
              className={cn(
                "mt-0.5 block text-[11px] font-semibold uppercase tracking-wide transition-colors duration-300",
                brandClass
              )}
            >
              {brandLabel}
            </span>
            <span className="mt-1 block text-[10px] leading-tight text-slate-400">
              工作区切换见顶部栏
            </span>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-6">
        {!isBastion ? (
          <Link
            to={dashTo}
            className={navLinkTint(dashActive, dashTint)}
          >
            {isDocs ? (
              <Library size={20} className={iconTint(dashActive, dashTint)} />
            ) : (
              <LayoutDashboard size={20} className={iconTint(dashActive, dashTint)} />
            )}
            <span>{dashLabel}</span>
          </Link>
        ) : null}

        {isDocs && navRole === "admin" ? (
          <>
            <div className="px-4 pb-1 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Markdown
              </p>
            </div>
            <Link to="/docs/media" className={navLinkTint(docsMediaActive, "violet")}>
              <FileText size={20} className={iconTint(docsMediaActive, "violet")} />
              <span>媒体与附件</span>
            </Link>
          </>
        ) : null}

        {isHub ? (
          <>
            <div className="px-4 pb-1 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                模块入口
              </p>
            </div>
            {showK8sNav && (
              <Link to="/cluster" className={navLinkTint(false, "blue")}>
                <Hexagon size={20} className="text-slate-400" />
                <span>Kubernetes</span>
              </Link>
            )}
            {showVcNav && (
              <Link to="/cluster/vcenter/dashboard" className={navLinkTint(false, "violet")}>
                <Monitor size={20} className="text-slate-400" />
                <span>vCenter</span>
              </Link>
            )}
            {showAppCenterNav && (
              <Link to="/cluster/apps/dashboard" className={navLinkTint(false, "emerald")}>
                <AppWindow size={20} className="text-slate-400" />
                <span>应用中心</span>
              </Link>
            )}
            {showBastionNav && (
              <Link to="/cluster/bastion" className={navLinkTint(false, "emerald")}>
                <SquareTerminal size={20} className="text-slate-400" />
                <span>堡垒机</span>
              </Link>
            )}
            {showAiInspectNav && (
              <Link to="/cluster/ai-inspect/dashboard" className={navLinkTint(false, "slate")}>
                <Sparkles size={20} className="text-slate-400" />
                <span>AI 巡检</span>
              </Link>
            )}
            {showPlatformAudit && (
              <>
                <div className="px-4 pb-1 pt-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    管理
                  </p>
                </div>
                <Link
                  to="/account/audit"
                  className={navLinkTint(
                    location.pathname === "/account/audit" || location.pathname.startsWith("/account/audit/"),
                    "slate"
                  )}
                >
                  <FileText
                    size={20}
                    className={iconTint(
                      location.pathname === "/account/audit" || location.pathname.startsWith("/account/audit/"),
                      "slate"
                    )}
                  />
                  <span>平台审计</span>
                </Link>
                <Link
                  to="/account/site-stats"
                  className={navLinkTint(location.pathname === "/account/site-stats", "slate")}
                >
                  <BarChart3 size={20} className={iconTint(location.pathname === "/account/site-stats", "slate")} />
                  <span>站点统计</span>
                </Link>
              </>
            )}
          </>
        ) : null}

        {isDocs ? null : isHub ? null : showK8sNav && isK8s ? (
          <>
            <div className="px-4 pb-1 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">集群</p>
            </div>
            {k8sNavComposed.map((item) => {
              if (item.harborPage && !showHarborNav) return null;
              const isActive = k8sItemActive(item, location.pathname, location.search);
              const Icon = item.icon;
              return (
                <Link key={k8sItemKey(item)} to={item.to} className={navLinkTint(isActive, "blue")}>
                  <Icon size={20} className={iconTint(isActive, "blue")} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
            {showK8sClusterSettings ? (
              <Link
                to="/cluster/settings"
                className={navLinkTint(location.pathname === "/cluster/settings", "blue")}
              >
                <Settings
                  size={20}
                  className={iconTint(location.pathname === "/cluster/settings", "blue")}
                />
                <span>Cluster Settings</span>
              </Link>
            ) : null}
          </>
        ) : showVcNav && isVcenter ? (
          <>
            <div className="px-4 pb-1 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                vCenter
              </p>
            </div>
            <Link
              to="/cluster/vcenter"
              className={navLinkTint(isVcenterVmNavActive(location.pathname), "violet")}
            >
              <Monitor
                size={20}
                className={iconTint(isVcenterVmNavActive(location.pathname), "violet")}
              />
              <span>虚拟机</span>
            </Link>
            <Link
              to="/cluster/vcenter/router"
              className={navLinkTint(location.pathname === "/cluster/vcenter/router", "violet")}
            >
              <Router
                size={20}
                className={iconTint(location.pathname === "/cluster/vcenter/router", "violet")}
              />
              <span>爱快路由</span>
            </Link>
            <Link
              to="/cluster/vcenter/gpu"
              className={navLinkTint(location.pathname === "/cluster/vcenter/gpu", "violet")}
            >
              <Gauge
                size={20}
                className={iconTint(location.pathname === "/cluster/vcenter/gpu", "violet")}
              />
              <span>GPU 监控</span>
            </Link>
            {showVcCloud ? (
            <Link
              to="/cluster/vcenter/cloud"
              className={navLinkTint(isCloudHostsNavActive(location.pathname), "violet")}
            >
              <Cloud
                size={20}
                className={iconTint(isCloudHostsNavActive(location.pathname), "violet")}
              />
              <span>公有云</span>
            </Link>
            ) : null}
            <Link
              to="/cluster/vcenter/hosts"
              className={navLinkTint(
                location.pathname === "/cluster/vcenter/hosts" ||
                  location.pathname.startsWith("/cluster/vcenter/hosts/"),
                "violet"
              )}
            >
              <Cpu
                size={20}
                className={iconTint(
                  location.pathname === "/cluster/vcenter/hosts" ||
                    location.pathname.startsWith("/cluster/vcenter/hosts/"),
                  "violet"
                )}
              />
              <span>宿主机</span>
            </Link>
            {showVcTools ? (
              <Link
                to="/cluster/vcenter/tools/ip-scan"
                className={navLinkTint(
                  location.pathname.startsWith("/cluster/vcenter/tools"),
                  "violet"
                )}
              >
                <Radar
                  size={20}
                  className={iconTint(
                    location.pathname.startsWith("/cluster/vcenter/tools"),
                    "violet"
                  )}
                />
                <span>内网工具箱</span>
              </Link>
            ) : null}
          </>
        ) : showAppCenterNav && isAppcenter ? (
          <>
            <div className="px-4 pb-1 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                应用中心
              </p>
            </div>
            {/* Kafka */}
            <Link
              to="/cluster/apps/kafka"
              className={navLinkTint(appCenterKafkaActive, "emerald")}
            >
              <Database size={20} className={iconTint(appCenterKafkaActive, "emerald")} />
              <span>Kafka</span>
            </Link>
            {/* Redis */}
            <Link
              to="/cluster/apps/redis"
              className={navLinkTint(appCenterRedisActive, "emerald")}
            >
              <Database size={20} className={iconTint(appCenterRedisActive, "emerald")} />
              <span>Redis</span>
            </Link>
            {/* OpenSearch */}
            <Link
              to="/cluster/apps/opensearch"
              className={navLinkTint(appCenterOpenSearchActive, "emerald")}
            >
              <Search size={20} className={iconTint(appCenterOpenSearchActive, "emerald")} />
              <span>OpenSearch</span>
            </Link>
            {/* 云主机 */}
            <Link
              to="/cluster/apps/cloud-vm"
              className={navLinkTint(appCenterCloudVmActive, "emerald")}
            >
              <HardDrive size={20} className={iconTint(appCenterCloudVmActive, "emerald")} />
              <span>云主机</span>
            </Link>
            {/* DNSPod —— 父级：精确匹配 /cluster/apps/dns 才全亮，子页时显示淡绿色（无左 bar） */}
            {(() => {
              const dnsExact = location.pathname === "/cluster/apps/dns" || location.pathname === "/cluster/apps/dns/";
              const dnsParentCls = dnsExact
                ? navLinkTint(true, "emerald")
                : appCenterDnsActive
                  ? "flex items-center space-x-3 rounded-xl px-4 py-3.5 text-sm font-medium text-emerald-700 hover:bg-slate-50"
                  : "flex items-center space-x-3 rounded-xl px-4 py-3.5 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900";
              return (
                <Link to="/cluster/apps/dns" className={dnsParentCls}>
                  <Globe size={20} className={dnsExact ? "text-emerald-600" : appCenterDnsActive ? "text-emerald-500" : "text-slate-400"} />
                  <span>DNSPod</span>
                </Link>
              );
            })()}
            {appCenterDnsActive && (
              <div className="ml-3 border-l-2 border-blue-100 pl-2">
                {[
                  { to: "/cluster/apps/dns/accounts", label: "服务商账号", Icon: KeyRound },
                  { to: "/cluster/apps/dns/domains",  label: "域名管理",   Icon: Globe },
                  { to: "/cluster/apps/dns/records",  label: "解析记录",   Icon: Server },
                  { to: "/cluster/apps/dns/failover", label: "健康监测",   Icon: NodeActivityIcon },
                  { to: "/cluster/apps/dns/scheduled",label: "定时任务",   Icon: Calendar },
                  { to: "/cluster/apps/dns/certs",    label: "SSL 证书",   Icon: ShieldCheck },
                ].map(({ to, label, Icon }) => {
                  const active = location.pathname === to || location.pathname.startsWith(to + "/");
                  return (
                    <Link key={to} to={to} className={navLinkTint(active, "blue")}>
                      <Icon size={16} className={iconTint(active, "blue")} />
                      <span>{label}</span>
                    </Link>
                  );
                })}
              </div>
            )}
            {/* 腾讯云 */}
            <Link
              to="/cluster/apps/tencent-cloud"
              className={navLinkTint(appCenterTencentCloudActive, "emerald")}
            >
              <Cloud size={20} className={iconTint(appCenterTencentCloudActive, "emerald")} />
              <span>腾讯云</span>
            </Link>
            {/* 七牛云 */}
            <Link
              to="/cluster/apps/qiniu-cloud"
              className={navLinkTint(appCenterQiniuCloudActive, "emerald")}
            >
              <CloudCog size={20} className={iconTint(appCenterQiniuCloudActive, "emerald")} />
              <span>七牛云</span>
            </Link>
            {/* 又拍云 */}
            <Link
              to="/cluster/apps/upyun-cloud"
              className={navLinkTint(appCenterUpyunCloudActive, "emerald")}
            >
              <Boxes size={20} className={iconTint(appCenterUpyunCloudActive, "emerald")} />
              <span>又拍云</span>
            </Link>
          </>
        ) : showAiInspectNav && isAiinspect ? (
          <>
            <div className="px-4 pb-1 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                AI 巡检
              </p>
            </div>
            <Link
              to="/cluster/ai-inspect/logs"
              className={navLinkTint(aiInspectLogsActive, "slate")}
            >
              <ScrollText size={20} className={iconTint(aiInspectLogsActive, "slate")} />
              <span>日志查询</span>
            </Link>
            <Link
              to="/cluster/ai-inspect/log-collection"
              className={navLinkTint(aiInspectLogCollectionActive, "emerald")}
            >
              <HardDrive size={20} className={iconTint(aiInspectLogCollectionActive, "emerald")} />
              <span>日志采集</span>
            </Link>
            <Link
              to="/cluster/ai-inspect/monitoring"
              className={navLinkTint(aiInspectMonitoringActive, "slate")}
            >
              <LineChart size={20} className={iconTint(aiInspectMonitoringActive, "slate")} />
              <span>监控中心</span>
            </Link>
            <Link
              to="/cluster/ai-inspect/alerts"
              className={navLinkTint(aiInspectAlertsActive, "slate")}
            >
              <Bell size={20} className={iconTint(aiInspectAlertsActive, "slate")} />
              <span>告警中心</span>
            </Link>
            <Link
              to="/cluster/ai-inspect/reports"
              className={navLinkTint(aiInspectReportsActive, "slate")}
            >
              <ClipboardList size={20} className={iconTint(aiInspectReportsActive, "slate")} />
              <span>巡检报告</span>
            </Link>
            <Link
              to="/cluster/ai-inspect/assistant"
              className={navLinkTint(aiInspectAssistantActive, "slate")}
            >
              <Sparkles size={20} className={iconTint(aiInspectAssistantActive, "slate")} />
              <span>AI 助手</span>
            </Link>
            <Link
              to="/cluster/ai-inspect/configure"
              className={navLinkTint(aiInspectConfigureActive, "slate")}
            >
              <Sparkles size={20} className={iconTint(aiInspectConfigureActive, "slate")} />
              <span>巡检配置</span>
            </Link>
          </>
        ) : showMeshNav && isMesh ? (
          <>
            <div className="px-4 pb-1 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                异地组网
              </p>
            </div>
            <Link
              to="/cluster/mesh/topology"
              className={navLinkTint(location.pathname.startsWith("/cluster/mesh/topology"), "slate")}
            >
              <Network size={20} className={iconTint(location.pathname.startsWith("/cluster/mesh/topology"), "slate")} />
              <span>拓扑总览</span>
            </Link>
            <Link
              to="/cluster/mesh/nodes"
              className={navLinkTint(location.pathname.startsWith("/cluster/mesh/nodes"), "slate")}
            >
              <Server size={20} className={iconTint(location.pathname.startsWith("/cluster/mesh/nodes"), "slate")} />
              <span>节点与路由</span>
            </Link>
            <Link
              to="/cluster/mesh/keys"
              className={navLinkTint(location.pathname.startsWith("/cluster/mesh/keys"), "slate")}
            >
              <KeyRound size={20} className={iconTint(location.pathname.startsWith("/cluster/mesh/keys"), "slate")} />
              <span>预授权密钥</span>
            </Link>
            <Link
              to="/cluster/mesh/traffic"
              className={navLinkTint(location.pathname.startsWith("/cluster/mesh/traffic"), "slate")}
            >
              <NodeActivityIcon size={20} className={iconTint(location.pathname.startsWith("/cluster/mesh/traffic"), "slate")} />
              <span>流量监控</span>
            </Link>
            <Link
              to="/cluster/mesh/service"
              className={navLinkTint(location.pathname.startsWith("/cluster/mesh/service"), "slate")}
            >
              <Globe size={20} className={iconTint(location.pathname.startsWith("/cluster/mesh/service"), "slate")} />
              <span>服务信息</span>
            </Link>
            <Link
              to="/cluster/mesh/join"
              className={navLinkTint(location.pathname.startsWith("/cluster/mesh/join"), "slate")}
            >
              <LogIn size={20} className={iconTint(location.pathname.startsWith("/cluster/mesh/join"), "slate")} />
              <span>加入节点</span>
            </Link>
            <div className="mx-3 mt-1 border-t border-slate-200/70 pt-2">
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-300">
                headscale 实例
              </p>
              <div className="space-y-0.5">
                {meshInstances.map((inst) => {
                  const active = instParam === inst.id;
                  return (
                    <Link
                      key={inst.id}
                      to={{ pathname: location.pathname, search: `inst=${inst.id}` }}
                      title={inst.region || inst.name}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] transition-colors",
                        active ? "bg-slate-900/5 font-medium text-slate-900" : "text-slate-500 hover:bg-slate-900/5 hover:text-slate-800",
                      )}
                    >
                      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", inst.enabled ? "bg-emerald-500" : "bg-slate-300")} />
                      <span className="truncate">{inst.name}</span>
                    </Link>
                  );
                })}
                <Link
                  to={{ pathname: "/cluster/mesh/topology", search: "new=1" }}
                  className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] text-slate-400 transition-colors hover:bg-slate-900/5 hover:text-slate-700"
                >
                  <Plus size={14} />
                  <span>添加实例</span>
                </Link>
              </div>
            </div>
          </>
        ) : showAuthentikNav && isAuthentik ? (
          <>
            <div className="px-4 pb-1 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Authentik
              </p>
            </div>
            <Link
              to={{ pathname: "/cluster/authentik/users", search: instParam ? `?inst=${encodeURIComponent(instParam)}` : "" }}
              className={navLinkTint(location.pathname.startsWith("/cluster/authentik/users"), "slate")}
            >
              <Fingerprint size={20} className={iconTint(location.pathname.startsWith("/cluster/authentik/users"), "slate")} />
              <span>用户管理</span>
            </Link>
            <Link
              to={{ pathname: "/cluster/authentik/apps", search: instParam ? `?inst=${encodeURIComponent(instParam)}` : "" }}
              className={navLinkTint(location.pathname.startsWith("/cluster/authentik/apps"), "slate")}
            >
              <ShieldCheck size={20} className={iconTint(location.pathname.startsWith("/cluster/authentik/apps"), "slate")} />
              <span>应用对接</span>
            </Link>
            <Link
              to={{ pathname: "/cluster/authentik/providers", search: instParam ? `?inst=${encodeURIComponent(instParam)}` : "" }}
              className={navLinkTint(location.pathname.startsWith("/cluster/authentik/providers"), "slate")}
            >
              <KeyRound size={20} className={iconTint(location.pathname.startsWith("/cluster/authentik/providers"), "slate")} />
              <span>提供程序</span>
            </Link>
            <Link
              to={{ pathname: "/cluster/authentik/events", search: instParam ? `?inst=${encodeURIComponent(instParam)}` : "" }}
              className={navLinkTint(location.pathname.startsWith("/cluster/authentik/events"), "slate")}
            >
              <RefreshCw size={20} className={iconTint(location.pathname.startsWith("/cluster/authentik/events"), "slate")} />
              <span>事件</span>
            </Link>
            <div className="mx-3 mt-1 border-t border-slate-200/70 pt-2 dark:border-slate-700/80">
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-300 dark:text-slate-500">
                Authentik 实例
              </p>
              <div className="space-y-0.5">
                {authentikInstances.map((inst) => {
                  const active = instParam === inst.id;
                  return (
                    <Link
                      key={inst.id}
                      to={{ pathname: location.pathname, search: `?inst=${encodeURIComponent(inst.id)}` }}
                      title={inst.name}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] transition-colors",
                        active
                          ? "bg-fuchsia-500/10 font-medium text-fuchsia-800 dark:bg-fuchsia-400/10 dark:text-fuchsia-200"
                          : "text-slate-500 hover:bg-slate-900/5 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100",
                      )}
                    >
                      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", inst.enabled ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600")} />
                      <span className="truncate">{inst.name}</span>
                    </Link>
                  );
                })}
                {authentikInstancesQ.isLoading ? (
                  <span className="flex items-center gap-2 px-3 py-1.5 text-[12px] text-slate-400 dark:text-slate-500">
                    <Loader2 size={13} className="animate-spin" /> 加载实例…
                  </span>
                ) : null}
                {navRole === "admin" ? (
                  <Link
                    to={{ pathname: "/cluster/authentik", search: "?new=1" }}
                    className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] text-slate-400 transition-colors hover:bg-fuchsia-500/5 hover:text-fuchsia-700 dark:text-slate-500 dark:hover:bg-fuchsia-400/10 dark:hover:text-fuchsia-200"
                  >
                    <Plus size={14} />
                    <span>添加实例</span>
                  </Link>
                ) : null}
              </div>
            </div>
          </>
        ) : null}

        {showVcNav && isVcenter && showVcSettings ? (
          <Link
            to="/cluster/vcenter/settings"
            className={navLinkTint(location.pathname === "/cluster/vcenter/settings", "violet")}
          >
            <Settings
              size={20}
              className={iconTint(location.pathname === "/cluster/vcenter/settings", "violet")}
            />
            <span>vCenter Settings</span>
          </Link>
        ) : null}
      </nav>

      <div className="border-t border-[#E2E8F0] p-6">
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <p className="mb-2 text-xs font-semibold text-slate-900">运行状态</p>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${k8sDotClass}`} />
              <span className="text-xs text-slate-600">{k8sStatusLabel}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${vcDotClass}`} />
              <span className="text-xs text-slate-600">{vcStatusLabel}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${redisDotClass}`} />
              <span
                className="text-xs text-slate-600"
                title={
                  !isViewer && cfg?.redisError
                    ? cfg.redisError
                    : undefined
                }
              >
                {redisStatusLabel}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  statusLoading
                    ? "bg-slate-300"
                    : (authStatus?.mysqlDsnConfigured ?? cfg?.mysqlDsnConfigured)
                      ? (authStatus?.mysqlReachable ?? cfg?.mysqlReachable)
                        ? "bg-emerald-500"
                        : "bg-amber-500"
                      : "bg-amber-500"
                }`}
              />
              <span
                className="text-xs text-slate-600"
                title={
                  (authStatus?.mysqlConnectError ?? cfg?.mysqlConnectError)?.trim() || undefined
                }
              >
                {statusLoading
                  ? "MySQL …"
                  : !(authStatus?.mysqlDsnConfigured ?? cfg?.mysqlDsnConfigured)
                    ? "MySQL 未配置"
                    : (authStatus?.mysqlReachable ?? cfg?.mysqlReachable)
                      ? "MySQL 已连接"
                      : "MySQL 未连接"}
              </span>
            </div>
          </div>
          {cfg && (
            <p className="mt-2 truncate text-[11px] text-slate-500" title={cfg.ddnsHost}>
              DDNS: {cfg.ddnsHost}
            </p>
          )}
          {cfg && (
            <p className="text-[11px] text-slate-500">同步间隔: {cfg.syncIntervalSec}s</p>
          )}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;

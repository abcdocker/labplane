import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
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
} from "lucide-react";
import { useAuth } from "@/auth/auth-context";
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
      v === "baota" ||
      v === "appcenter" ||
      v === "bastion" ||
      v === "aiinspect" ||
      v === "mesh" ||
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
    case "baota":
      return "/cluster/baota";
    case "appcenter":
      return "/cluster/apps/dashboard";
    case "bastion":
      return "/cluster/bastion";
    case "aiinspect":
      return "/cluster/ai-inspect/dashboard";
    case "mesh":
      return "/cluster/mesh";
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
  if (ws === "baota") {
    return pathname.startsWith("/cluster/baota");
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
};

const DEFAULT_K8S_SIDEBAR_MENU: K8sSidebarMenuItem[] = [
  { key: "pods", label: "Pods", order: 10 },
  { key: "namespaces", label: "NameSpace", order: 20 },
  { key: "nodes", label: "Nodes", order: 30 },
  { key: "etcd", label: "etcd", order: 35 },
  { key: "rbac", label: "RBAC", order: 40 },
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
    } else if (path.startsWith("/cluster/baota")) {
      setWorkspace("baota");
    } else if (path.startsWith("/cluster/vcenter")) {
      setWorkspace("vcenter");
    } else if (path.startsWith("/cluster/apps")) {
      setWorkspace("appcenter");
    } else if (path.startsWith("/cluster/bastion")) {
      setWorkspace("bastion");
    } else if (path.startsWith("/cluster/ai-inspect")) {
      setWorkspace("aiinspect");
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
  const showK8sNav = menuItemVisible(perm, "kubernetes", navRole, moduleVisible(perm, "k8s"));
  const showVcNav = menuItemVisible(perm, "vcenter", navRole, moduleVisible(perm, "vcenter"));
  const showBaotaNav = menuItemVisible(perm, "baota", navRole, moduleVisible(perm, "baota"));
  const showAppCenterNav = menuItemVisible(perm, "appcenter", navRole, moduleVisible(perm, "appcenter"));
  const showAiInspectNav = menuItemVisible(perm, "aiInspect", navRole, true);
  const showMeshNav = menuItemVisible(perm, "mesh", navRole, true);
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
  const ok = check?.baota.status === "success";
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
  const isBaota = workspace === "baota";
  const isAppcenter = workspace === "appcenter";
  const isBastion = workspace === "bastion";
  const isAiinspect = workspace === "aiinspect";
  const isMesh = workspace === "mesh";

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
          : isBaota
            ? "宝塔"
            : isBastion
              ? "堡垒机"
              : isAiinspect
                ? "AI 巡检"
                : isMesh
                  ? "异地组网"
                  : "应用中心";

  const brandClass = isDocs
    ? "text-violet-600/90"
    : isHub
      ? "text-slate-600/90"
      : isK8s
        ? "text-blue-600/90"
        : isVcenter
          ? "text-violet-600/90"
          : isBaota
            ? "text-amber-600/90"
            : isBastion
              ? "text-teal-600/90"
              : isAiinspect
                ? "text-cyan-600/90"
                : isMesh
                  ? "text-indigo-600/90"
                  : "text-emerald-600/90";

  const dashTint: "blue" | "violet" | "amber" | "emerald" | "slate" = isDocs
    ? "violet"
    : isHub
      ? "slate"
      : isK8s
        ? "blue"
        : isVcenter
          ? "violet"
          : isBaota
            ? "amber"
            : isBastion
              ? "emerald"
              : isAiinspect
                ? "slate"
                : isAppcenter
                  ? "slate"
                  : isMesh
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
              {cfg?.platformDisplayName?.trim() || "Kube-BT-Sync"}
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
            {showBaotaNav && (
              <Link to="/cluster/baota/sync" className={navLinkTint(false, "amber")}>
                <Server size={20} className="text-slate-400" />
                <span>宝塔</span>
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
        ) : showBaotaNav && isBaota ? (
          <>
            <div className="px-4 pb-1 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                宝塔
              </p>
            </div>
            <Link
              to="/cluster/baota/ingress"
              className={navLinkTint(
                location.pathname === "/cluster/baota/ingress",
                "amber"
              )}
            >
              <Globe size={20} className={iconTint(location.pathname === "/cluster/baota/ingress", "amber")} />
              <span>Ingress Rules</span>
            </Link>
            <Link
              to="/cluster/baota/sync"
              className={navLinkTint(location.pathname === "/cluster/baota/sync", "amber")}
            >
              <Server size={20} className={iconTint(location.pathname === "/cluster/baota/sync", "amber")} />
              <span>Ingress 同步</span>
            </Link>
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
              to="/cluster/mesh"
              className={navLinkTint(location.pathname === "/cluster/mesh", "slate")}
            >
              <Network size={20} className={iconTint(location.pathname === "/cluster/mesh", "slate")} />
              <span>控制面与节点</span>
            </Link>
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
        {showBaotaNav && isBaota && (
          <Link
            to="/cluster/baota/settings"
            className={navLinkTint(location.pathname === "/cluster/baota/settings", "amber")}
          >
            <Settings
              size={20}
              className={iconTint(location.pathname === "/cluster/baota/settings", "amber")}
            />
            <span>宝塔设置</span>
          </Link>
        )}
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
            <div className="flex items-center gap-2">
              <div
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  runtimeQ.isLoading ? "bg-slate-300" : ok ? "bg-emerald-500" : "bg-amber-500"
                }`}
              />
              <span className="text-xs text-slate-600">
                {runtimeQ.isLoading
                  ? "宝塔 …"
                  : ok
                    ? "宝塔 可达"
                    : check?.baota.status === "error"
                      ? "宝塔 不可达"
                      : "宝塔 待检查"}
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

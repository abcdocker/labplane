/** 与 Sidebar 中 localStorage 键一致，供需要时读取 */
export const WORKSPACE_STORAGE_KEY = "kube-bt-sidebar-workspace";

export type WorkspaceId =
  | "hub"
  | "kubernetes"
  | "vcenter"
  | "baota"
  | "appcenter"
  | "bastion"
  | "aiinspect"
  | "docs";

export function workspaceFromPathname(pathname: string): WorkspaceId {
  if (pathname === "/" || pathname === "") return "hub";
  /** 账户/平台页不属于集群工作区，与侧栏「工作台」一致 */
  if (pathname.startsWith("/account") || pathname === "/settings") return "hub";
  if (pathname.startsWith("/docs")) return "docs";
  if (pathname.startsWith("/cluster/baota")) return "baota";
  if (pathname.startsWith("/cluster/apps")) return "appcenter";
  if (pathname.startsWith("/cluster/bastion")) return "bastion";
  if (pathname.startsWith("/cluster/ai-inspect")) return "aiinspect";
  if (pathname.startsWith("/cluster/vcenter")) return "vcenter";
  if (pathname.startsWith("/cluster")) return "kubernetes";
  return "kubernetes";
}

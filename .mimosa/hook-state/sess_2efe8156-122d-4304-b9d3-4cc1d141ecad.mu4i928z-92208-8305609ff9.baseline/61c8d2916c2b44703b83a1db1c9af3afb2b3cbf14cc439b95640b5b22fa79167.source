import type { PlatformPermissions } from "@/lib/api";

export function moduleVisible(
  p: PlatformPermissions | undefined | null,
  m: "k8s" | "vcenter" | "baota" | "appcenter"
): boolean {
  if (!p) return true;
  const v = p[m];
  return v !== "none";
}

/**
 * 侧栏 / 顶栏 / 工作台卡片：menu[key] 显式 false 则隐藏；未配置时按 moduleFallback（通常来自模块 none/ro/rw）。
 * admin：menu 中显式 false 仍可隐藏某菜单。
 */
export function menuItemVisible(
  p: PlatformPermissions | undefined | null,
  key: string,
  role: string | undefined,
  moduleFallback: boolean
): boolean {
  if (role === "admin") {
    if (p?.menu && Object.prototype.hasOwnProperty.call(p.menu, key)) {
      return p.menu[key] !== false;
    }
    return true;
  }
  if (!p || p.legacyViewer) {
    return moduleFallback;
  }
  if (p.menu && Object.prototype.hasOwnProperty.call(p.menu, key)) {
    return p.menu[key] === true;
  }
  return moduleFallback;
}

export function k8sPodExecAllowed(
  role: string | undefined,
  p: PlatformPermissions | undefined | null
): boolean {
  if (role === "admin") return true;
  if (!p || p.legacyViewer) return false;
  return p.k8sPodExec === true;
}

export function k8sPodDeleteAllowed(
  role: string | undefined,
  p: PlatformPermissions | undefined | null
): boolean {
  if (role === "admin") return true;
  if (!p || p.legacyViewer) return false;
  return p.k8sPodDelete === true;
}

/** 应用中心 Redis：是否允许纳管/更新/删除（非只读子域） */
export function redisAppCenterCanWrite(
  role: string | undefined,
  p: PlatformPermissions | undefined | null
): boolean {
  if (role === "admin") return true;
  if (!p || p.legacyViewer) return false;
  if (p.appcenter !== "rw") return false;
  if (p.appcenterRedis === "readonly") return false;
  return true;
}

/** 应用中心 OpenSearch：与 Redis 同一 appcenter / appcenterRedis 子域模型 */
export function openSearchAppCenterCanWrite(
  role: string | undefined,
  p: PlatformPermissions | undefined | null
): boolean {
  return redisAppCenterCanWrite(role, p);
}

/**
 * 应用中心云主机：写操作权限（创建/删除/引导配置等）。
 * `appcenterCloudVm` 未下发时继承 `appcenterRedis`；`managed_only` 与后端中间件一致时默认禁止写。
 */
export function cloudVmAppCenterCanWrite(
  role: string | undefined,
  p: PlatformPermissions | undefined | null
): boolean {
  if (role === "admin") return true;
  if (!p || p.legacyViewer) return false;
  if (p.appcenter !== "rw") return false;
  const scope = p.appcenterCloudVm ?? p.appcenterRedis;
  if (scope === "readonly") return false;
  if (scope === "managed_only") return false;
  return true;
}

/** 云主机 Hysteria2：验证平台密码后可查看/编辑已存客户端 YAML；admin 恒为 true */
export function cloudVmHysteriaRevealAllowed(
  role: string | undefined,
  p: PlatformPermissions | undefined | null
): boolean {
  if (role === "admin") return true;
  if (!p || p.legacyViewer) return false;
  return p.appcenterCloudVmHysteriaReveal === true;
}

/** 是否显示 K8s 一键部署（创建）入口 */
export function redisShowK8sDeployWizard(
  role: string | undefined,
  p: PlatformPermissions | undefined | null
): boolean {
  if (role === "admin") return true;
  if (!p || p.legacyViewer) return false;
  if (p.appcenter !== "rw") return false;
  if (p.appcenterRedis === "readonly" || p.appcenterRedis === "managed_only") return false;
  return true;
}

/** 与旧版「viewer 仅只读」等价的界面限制（无自定义权限时） */
export function isLegacyStyleViewer(
  role: string | undefined,
  cfgViewer: boolean | undefined,
  p: PlatformPermissions | undefined | null
): boolean {
  if (role === "admin") return false;
  if (p && !p.legacyViewer) return false;
  return role === "viewer" || cfgViewer === true;
}

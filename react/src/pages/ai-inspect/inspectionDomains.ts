export const INSPECTION_DOMAINS = [
  { id: "vcenter", configKey: "inspectVCenter", label: "vCenter", description: "虚拟机资源、事件与宿主机告警" },
  { id: "bastion", configKey: "inspectBastion", label: "堡垒机", description: "访问策略、目标连通性与安全配置" },
  { id: "headscale", configKey: "inspectHeadscale", label: "Headscale", description: "实例健康、节点在线率、路由与标签" },
  { id: "authentik", configKey: "inspectAuthentik", label: "Authentik", description: "服务健康、对象统计与异常认证事件" },
] as const;

export type InfrastructureInspectionDomain = (typeof INSPECTION_DOMAINS)[number]["id"];
export type InspectionRunDomain = "platform" | InfrastructureInspectionDomain;

export function inspectionDomainReportURL(domain: InspectionRunDomain, offset: number, limit: number): string {
  const query = new URLSearchParams({ domain, offset: String(offset), limit: String(limit) });
  return `/api/ops/inspect/reports?${query.toString()}`;
}

export function inspectionDomainLabel(domain: string | undefined): string {
  if (!domain || domain === "platform") return "平台级";
  return INSPECTION_DOMAINS.find((item) => item.id === domain)?.label ?? domain;
}

import type { AuditRecord } from "@/lib/api";

/** 将审计行转为简短中文说明（面向控制台用户，非原始 access log） */
export function formatAuditTitle(r: AuditRecord): string {
  const a = r.action || "";
  if (a === "login_ok") {
    if (r.detail === "oidc") return "登录成功（OIDC）";
    if (r.detail === "password") return "登录成功（密码）";
    return "登录成功";
  }
  if (a === "login_fail") {
    if (r.detail === "username") return "登录失败（用户名错误）";
    if (r.detail === "password") return "登录失败（密码错误）";
    return "登录失败";
  }
  if (a === "logout") return "退出登录";
  if (a === "security_ip_ban") return "安全：admin 密码错误过多，已临时封禁来源 IP";
  if (a === "security_probe") return "安全：疑似漏洞扫描或注入探测";

  if (a === "api") {
    const m = (r.method || "").toUpperCase();
    const p = r.path || "";
    return apiMutationLabel(m, p);
  }

  return a || "操作";
}

function apiMutationLabel(method: string, path: string): string {
  const verb =
    method === "POST"
      ? "提交"
      : method === "PUT" || method === "PATCH"
        ? "更新"
        : method === "DELETE"
          ? "删除"
          : method;

  if (path.includes("/api/setup")) return "保存初始化向导";
  if (path.includes("/api/ingress/yaml")) return "应用 Ingress YAML";
  if (path.includes("/api/ingress/delete")) return "删除 Ingress";
  if (path.includes("/api/k8s/apply-yaml")) return "应用 Kubernetes YAML";
  if (path.includes("/api/k8s/objects/")) return "删除 Kubernetes 资源";
  if (path.includes("/api/k8s/pods/") && method === "DELETE") return "删除 Pod";
  if (path.includes("/api/settings/runtime")) return "保存运行配置";
  if (path.includes("/api/prometheus/source")) return "保存 Prometheus 数据源";
  if (path.includes("/api/prometheus/query")) return "Prometheus 查询（已不记入审计列表）";
  if (path.includes("/api/app-center/cloud-vm/instances") && method === "POST") return "创建云主机实例";
  if (path.includes("/api/app-center/cloud-vm/instances/") && method === "DELETE") return "删除云主机实例";
  if (path.includes("/api/app-center/cloud-vm/instances/") && method === "PUT") return "更新云主机（如初始化脚本）";
  if (path.includes("/api/app-center/cloud-vm/") && path.includes("reset-root-password")) return "重置云主机 root 密码";
  if (path.includes("/api/app-center/opensearch/")) return apiOpenSearchMutationLabel(method, path);
  if (path.includes("/api/app-center/kafka/")) return apiKafkaMutationLabel(method, path);
  if (path.includes("/api/app-center/redis/")) return apiRedisMutationLabel(method, path);
  if (path.includes("/api/vcenter/") && method === "PUT") return "更新 vCenter 相关配置或虚拟机";
  if (path.includes("/api/vcenter/") && method === "POST") return "vCenter 操作（电源/控制台等）";
  if (path.includes("/sftp/upload")) return "云主机 SFTP 上传";
  if (path.includes("/ssh-settings")) {
    return method === "DELETE" ? "清除 SSH 凭据" : "更新 SSH 设置";
  }
  if (path.includes("/api/cloud-hosts") && method === "POST") return "新增云主机";
  if (path.includes("/api/cloud-hosts") && (method === "PUT" || method === "PATCH"))
    return "更新云主机";
  if (path.includes("/api/cloud-hosts") && method === "DELETE") return "删除云主机";
  if (path.includes("/vcenter/vms/") && path.includes("/power")) return "虚拟机电源操作";
  if (path.includes("/vcenter/vms/") && path.includes("/hardware")) return "更新虚拟机硬件";
  if (path.includes("/vcenter/vms/") && path.includes("/disk/expand")) return "扩展虚拟机磁盘";

  const short = path.replace(/^\/api\//, "");
  return `${verb} ${short || path}`;
}

function apiKafkaMutationLabel(method: string, path: string): string {
  if (path.includes("/k8s-deploy")) return "应用中心 Kafka+ZK 部署到集群";
  if (path.includes("/kafka/templates") && method === "POST") return "创建 Kafka 部署模版";
  if (path.includes("/kafka/templates") && (method === "PUT" || method === "PATCH")) return "更新 Kafka 部署模版";
  if (path.includes("/kafka/templates") && method === "DELETE") return "删除 Kafka 部署模版";
  if (path.includes("/topics") && method === "POST") return "Kafka 创建主题";
  if (path.includes("/topics") && method === "DELETE") return "Kafka 删除主题";
  if (path.includes("/acls/delete")) return "Kafka 删除 ACL";
  if (path.includes("/acls") && method === "POST") return "Kafka 创建 ACL";
  if (path.includes("/scram-users") && method === "POST") return "Kafka 创建/更新 SCRAM 用户";
  if (path.includes("/scram-users") && method === "DELETE") return "Kafka 删除 SCRAM 用户";
  return "应用中心 Kafka 操作";
}

function apiOpenSearchMutationLabel(method: string, path: string): string {
  if (path.includes("/k8s-deploy")) return "应用中心 OpenSearch 部署到集群";
  if (path.includes("/indices/prune")) return "OpenSearch 按时间清理索引";
  if (path.includes("/index/settings") && (method === "PUT" || method === "PATCH")) return "OpenSearch 更新索引设置";
  if (path.includes("/opensearch/instances/") && path.includes("/index") && method === "DELETE") return "OpenSearch 删除索引";
  if (path.includes("/opensearch/templates") && method === "POST") return "创建 OpenSearch 部署模版";
  if (path.includes("/opensearch/templates") && (method === "PUT" || method === "PATCH")) return "更新 OpenSearch 部署模版";
  if (path.includes("/opensearch/templates") && method === "DELETE") return "删除 OpenSearch 部署模版";
  return "应用中心 OpenSearch 操作";
}

function apiRedisMutationLabel(method: string, path: string): string {
  if (path.includes("/k8s-deploy")) return "应用中心 Redis 部署到集群";
  if (path.includes("/redis/templates") && method === "POST") return "创建 Redis 部署模版";
  if (path.includes("/redis/templates") && (method === "PUT" || method === "PATCH")) return "更新 Redis 部署模版";
  if (path.includes("/redis/templates") && method === "DELETE") return "删除 Redis 部署模版";
  if (path.includes("/instances") && method === "POST" && path.endsWith("/instances")) return "创建 Redis 实例";
  if (path.includes("/keys/delete")) return "删除 Redis 键";
  if (method === "DELETE") return "删除 Redis 实例或资源";
  if (method === "PUT" || method === "PATCH") return "更新 Redis 实例";
  return "应用中心 Redis 操作";
}

/** 平台审计页右侧模块标签 */
export function auditModuleLabel(r: AuditRecord): string {
  const a = r.action || "";
  if (a === "login_ok" || a === "login_fail" || a === "logout") return "登录与安全";
  if (a === "security_ip_ban" || a === "security_probe") return "平台安全";
  const p = r.path || "";
  if (p.includes("/k8s/") || p.includes("/ingress")) return "Kubernetes";
  if (p.includes("/vcenter/")) return "vCenter";
  if (p.includes("/app-center/")) return "应用中心";
  if (p.includes("baota")) return "宝塔";
  if (p.includes("/settings/runtime") || p.includes("/admin/")) return "平台";
  if (p.includes("/cloud-hosts")) return "公有云主机";
  if (p.includes("/prometheus")) return "监控";
  return "其他";
}

/** 平台审计列表右侧标签配色 */
export function auditModuleBadgeClass(label: string): string {
  switch (label) {
    case "登录与安全":
      return "border-amber-200 bg-amber-50 text-amber-950";
    case "平台安全":
      return "border-red-300 bg-red-50 text-red-900";
    case "Kubernetes":
      return "border-blue-200 bg-blue-50 text-blue-900";
    case "vCenter":
      return "border-violet-200 bg-violet-50 text-violet-900";
    case "应用中心":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "宝塔":
      return "border-amber-300 bg-amber-50/90 text-amber-950";
    case "平台":
      return "border-slate-300 bg-slate-100 text-slate-900";
    case "公有云主机":
      return "border-cyan-200 bg-cyan-50 text-cyan-950";
    case "监控":
      return "border-orange-200 bg-orange-50 text-orange-950";
    default:
      return "border-slate-200 bg-white text-slate-800";
  }
}

export function formatAuditTime(ts: string): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

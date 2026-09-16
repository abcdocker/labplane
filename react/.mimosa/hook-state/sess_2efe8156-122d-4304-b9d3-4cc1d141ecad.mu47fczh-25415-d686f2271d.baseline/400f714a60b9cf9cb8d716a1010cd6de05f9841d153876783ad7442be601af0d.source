/**
 * 与 Go 服务同源部署时使用相对路径；本地 `vite` 开发时由 vite.config 代理 /api。
 * 如需跨域可设置 VITE_API_BASE=http://127.0.0.1:8080
 */
export const API_BASE = import.meta.env.VITE_API_BASE ?? "";

/** 与页面不同源时携带会话 Cookie（否则预检 /api 会 401，WebSocket 亦无法带登录态）。 */
function apiFetchCredentials(): RequestCredentials {
  const b = API_BASE.trim();
  if (b === "") return "same-origin";
  if (typeof window === "undefined") return "include";
  try {
    if (new URL(b, window.location.href).origin === window.location.origin) {
      return "same-origin";
    }
  } catch {
    /* ignore */
  }
  return "include";
}

/** 与 fetch 使用的 API 根一致：同源或 `VITE_API_BASE` 时用于 `/api/...` 的 WebSocket。 */
export function wsUrlForApiPath(path: string): string {
  const base = API_BASE.trim();
  if (base.startsWith("http://")) return "ws://" + base.slice(7) + path;
  if (base.startsWith("https://")) return "wss://" + base.slice(8) + path;
  if (typeof window === "undefined") return `ws://localhost${path}`;
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${path}`;
}

/** 401 整页跳转登录时附带当前路径，登录后回到原 URI（pathname + search）。 */
function loginPageUrlPreservingReturn(): string {
  if (typeof window === "undefined") return "/login";
  const path = window.location.pathname + window.location.search + window.location.hash;
  if (path.startsWith("/login")) return "/login";
  return `/login?redirect=${encodeURIComponent(path)}`;
}

function maybeRedirectLogin(res: Response, path: string) {
  if (res.status !== 401) return;
  if (path.includes("/api/auth/login")) return;
  if (path.includes("/api/auth/status")) return;
  if (path.includes("/api/setup")) return;
  // 初始化页允许在未登录状态下运行，任何后台 401 都不应打断初始化流程。
  if (typeof window !== "undefined" && window.location.pathname === "/setup") return;
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.assign(loginPageUrlPreservingReturn());
  }
}

export type SystemCheck = {
  baota: { status: string; url: string; msg: string };
  ddns: {
    status: string;
    host: string;
    ips: string[];
    msg: string;
    port443: boolean;
    httpsPort: string;
  };
  k8s: {
    ingressInstalled: boolean;
    ingressHostNetwork: boolean;
    nodeIP: string;
  };
};

export type PlatformPermissions = {
  k8s?: string;
  vcenter?: string;
  baota?: string;
  appcenter?: string;
  appcenterRedis?: string;
  /** 应用中心云主机子域；未设置时与 appcenterRedis 一致 */
  appcenterCloudVm?: string;
  /** 验证平台密码后可查看云主机 Hysteria2 客户端 YAML/分享链（与后端 reveal 接口一致） */
  appcenterCloudVmHysteriaReveal?: boolean;
  maskSensitiveData?: boolean;
  legacyViewer?: boolean;
  /** 是否允许 Pod WebSocket 终端（与删除独立） */
  k8sPodExec?: boolean;
  k8sPodDelete?: boolean;
  /** 可选：键为菜单 id，false 强制隐藏；未设置则按模块权限推断（含 aiInspect：AI 巡检） */
  menu?: Record<string, boolean>;
};

export type K8sSidebarMenuItem = {
  key: "pods" | "namespaces" | "nodes" | "rbac" | "harbor" | "customResources" | "etcd";
  label: string;
  hidden?: boolean;
  order: number;
};

export type RuntimeSettingsDTO = Record<string, unknown> & {
  k8sSidebarMenu?: K8sSidebarMenuItem[];
  baotaUpstreamHost?: string;
  baotaUpstreamPort?: string;
  baotaUpstreamScheme?: string;
  baotaSslCertName?: string;
  baotaSslPemContent?: string;
  baotaSslKeyContent?: string;
  clearBaotaSslMaterial?: boolean;
  hasBaotaSSLMaterial?: boolean;
  /** 与 runtime baotaTargets 一致；保存时传完整或 *** 保留 */
  baotaTargets?: Array<{
    id: string;
    name?: string;
    url: string;
    apiKey: string;
    skipTlsVerify?: boolean;
    default?: boolean;
  }>;
};


export type SyncRoute = {
  namespace: string;
  name: string;
  domain: string;
  ddnsPort: string;
  upstreamHost?: string;
  createdAt: string;
  modifiedAt: string;
  version: string;
  scheme: string;
  status: string;
};

/** 与 GET /api/baota/ingress-sync/status 中 report 字段一致 */
export type BaotaSyncStepResult = {
  name: string;
  ok: boolean;
  attempts: number;
  error?: string;
};

export type BaotaSyncDomainReport = {
  domain: string;
  targetUrl?: string;
  baotaHttps?: boolean;
  overallOk: boolean;
  steps: BaotaSyncStepResult[];
  /** 对应集群 Ingress，供控制台跳转 */
  ingressNamespace?: string;
  ingressName?: string;
  /** 多宝塔：同步到的实例 id */
  baotaTargetId?: string;
};

export type BaotaIngressSyncReport = {
  running?: boolean;
  skipped?: boolean;
  skipReason?: string;
  trigger: string;
  startedAt?: string;
  finishedAt?: string;
  summary?: string;
  domains: BaotaSyncDomainReport[];
  ingressManagedCount?: number;
  ingressBaotaSyncEnabled?: boolean;
};

export type IngressRow = {
  namespace: string;
  name: string;
  hosts: string[];
  class: string;
  createdAt: string;
  managed: boolean;
  annotationCount?: number;
  ddnsPort?: string;
  upstreamHost?: string;
  scheme?: string;
  baotaTargetId?: string;
};

export type SetupStatus = {
  initialized: boolean;
  dataDir: string;
  version: number;
  defaults?: {
    connectionsConfigured: boolean;
    platformPublicUrl?: string;
    mysqlDsnConfigured: boolean;
    mysqlHost?: string;
    mysqlPort?: number;
    mysqlDatabase?: string;
    mysqlUser?: string;
    mysqlPasswordConfigured: boolean;
    redisAddr?: string;
    redisHost?: string;
    redisPort?: number;
    redisMode?: string;
    redisSentinelMaster?: string;
    redisPasswordConfigured: boolean;
    encryptionKeyConfigured: boolean;
    dashboardUser?: string;
  };
};

/** GET /api/config 中宝塔多实例摘要（无 apiKey 明文） */
export type BaotaTargetPublic = {
  id: string;
  name?: string;
  url: string;
  hasApiKey: boolean;
  skipTlsVerify?: boolean;
  default?: boolean;
};

export type AppConfig = {
  baotaUrl: string;
  ddnsHost: string;
  defaultPort: string;
  baotaUpstreamHost?: string;
  baotaUpstreamPort?: string;
  baotaUpstreamScheme?: string;
  httpsPort: string;
  syncIntervalSec: number;
  /** 对应 BAOTA_HTTP_TIMEOUT_SEC */
  baotaHttpTimeoutSec?: number;
  /** 对应 BAOTA_TCP_PROBE_TIMEOUT_SEC（/api/system/check 仅 TCP 探活面板端口） */
  baotaTcpProbeTimeoutSec?: number;
  /** 对应 BAOTA_CHECK_MIN_INTERVAL_SEC（服务端探活缓存） */
  baotaCheckMinIntervalSec?: number;
  /** 对应 BAOTA_DISABLE_HTTP_KEEPALIVE */
  baotaDisableHttpKeepalive?: boolean;
  hasBaotaApiKey: boolean;
  /** 与 BAOTA_SKIP_TLS_VERIFY 一致，仅用于展示 */
  baotaSkipTlsVerify?: boolean;
  /** 证书夹证书名（BAOTA_SSL_CERT_NAME），用于宝塔 SetCertToSite */
  baotaSslCertName?: string;
  /** 是否已保存平台侧宝塔 HTTPS PEM/KEY 内容 */
  hasBaotaSSLMaterial?: boolean;
  baotaTargets?: BaotaTargetPublic[];
  /** 是否启用登录（DASHBOARD_PASSWORD） */
  dashboardAuthEnabled?: boolean;
  /** 期望用户名（DASHBOARD_USER，默认 admin） */
  dashboardUser?: string;
  /** 会话天数（DASHBOARD_SESSION_DAYS） */
  dashboardSessionDays?: number;
  /** 监听地址（DASHBOARD_HTTP_ADDR，如 :8080） */
  dashboardListenAddr?: string;
  /** 是否已配置 Prometheus 地址（env 或进程内覆盖） */
  prometheusConfigured?: boolean;
  prometheusUrlHint?: string;
  /** Kubernetes 数据源（prometheusUrlK8s / 兜底） */
  prometheusK8sConfigured?: boolean;
  prometheusUrlK8sHint?: string;
  /** vCenter 数据源 */
  prometheusVcenterConfigured?: boolean;
  prometheusUrlVcenterHint?: string;
  /** 公有云主机列表（prometheusUrlCloud → 继承 vcenter → 兜底） */
  prometheusCloudConfigured?: boolean;
  prometheusUrlCloudHint?: string;
  /** 可选 vmselect；若填写则对应 scope 优先走 VictoriaMetrics */
  vmSelectUrlK8sHint?: string;
  vmSelectUrlVcenterHint?: string;
  vmSelectUrlCloudHint?: string;
  /** VictoriaLogs（VMLog）根地址是否已配置（合并 env + 运行时） */
  victoriaLogsConfigured?: boolean;
  victoriaLogsUrlHint?: string;
  prometheusTimeoutSec?: number;
  prometheusSkipTls?: boolean;
  prometheusHasBearer?: boolean;
  /** 已配置 VCENTER_URL / USER / PASSWORD */
  vcenterConfigured?: boolean;
  vcenterUrlHint?: string;
  /** 由 VCENTER_URL 解析出的 UI 根（不含 /sdk），用于拼接 wmks 静态资源 */
  vcenterUiOrigin?: string;
  /** Nginx 对外的 vSphere UI 根（VCENTER_UI_BASE_URL 或推导） */
  vcenterUiBaseUrl?: string;
  /** 典型登录入口：…/ui（先开此页完成 SSO 再开控制台） */
  vcenterUiLoginUrl?: string;
  /** 首选 wmks.min.js URL；未设 VCENTER_WMKS_SCRIPT_URL 时由服务端按 vCenter 常见路径推导 */
  vcenterWmksScriptUrl?: string;
  vcenterWmksCssUrl?: string;
  /** 多版本 vCenter 路径候选，前端可依次尝试加载 */
  vcenterWmksScriptUrlCandidates?: string[];
  vcenterWmksCssUrlCandidates?: string[];
  vcenterWmksScriptUrlFromEnv?: boolean;
  vcenterWmksCssUrlFromEnv?: boolean;
  vcenterVmSshConfigured?: boolean;
  /** 是否已配置全局 VCENTER_VM_SSH_*（运行时）；与「仅启用 SSH 加密存储」不同 */
  vcenterVmSshGlobalConfigured?: boolean;
  /** iDRAC 带外管理地址（运行时配置 idracHost） */
  idracHost?: string;
  /** iDRAC VNC Server 端口（默认 5900） */
  idracVncPort?: number;
  /** iDRAC VNC 密码；由 noVNC 在 RFB 握手阶段使用 */
  idracVncPassword?: string;
  /** 当前会话角色，与 /api/auth/status 一致 */
  dashboardRole?: string;
  /** 后端对 viewer 下发的只读标记 */
  viewer?: boolean;
  /** 模块与细粒度权限（与 /api/auth/status.permissions 一致） */
  permissions?: PlatformPermissions | null;
  /** 是否可管理 MySQL 中的平台用户 */
  usersManagementEnabled?: boolean;
  /** 是否已写入 dataDir/runtime-config.json */
  setupInitialized?: boolean;
  /** 是否启用本地密码登录 */
  passwordLoginEnabled?: boolean;
  /** 是否配置 OIDC（Authentik 等） */
  oidcConfigured?: boolean;
  /** 持久化目录（K8s 中常挂载 PVC） */
  dataDir?: string;
  platformPublicUrl?: string;
  /** 浏览器标题与顶栏展示名 */
  platformDisplayName?: string;
  /** Logo 图片 URL（https 或站内路径） */
  platformLogoUrl?: string;
  /** 站点图标 URL，覆盖默认 favicon */
  platformFaviconUrl?: string;
  /** 静态资源 CDN 根（无尾斜杠），含 /cmdb 等前缀；空则走默认外链 */
  assetsCdnBaseUrl?: string;
  /** Web SSH xterm 字体族，空则内置等宽栈 */
  sshTerminalFontFamily?: string;
  /** 字号 8–48；0 或未设则默认 13 */
  sshTerminalFontSize?: number;
  ingressBaotaSyncEnabled?: boolean;
  /** auto | ghproxy_preferred | direct | ghproxy_only */
  k8sAddonsManifestMirror?: string;
  /** 安装 ingress 时是否将 registry.k8s.io 改写到国内可拉取前缀（默认 true，可由环境变量关闭） */
  ingressNginxK8sRegistryMirror?: boolean;
  /** ingress-nginx hostNetwork HTTP 端口（默认 80） */
  ingressNginxHostHttpPort?: number;
  /** ingress-nginx hostNetwork HTTPS 端口（默认 443） */
  ingressNginxHostHttpsPort?: number;
  /** 安装 ingress 时默认固定控制器的 Node 名称（kubectl get nodes 的 NAME）；空表示不默认固定 */
  ingressNginxControllerNodeName?: string;
  vcenterCacheTtlSec?: number;
  k8sConfigured?: boolean;
  /** Harbor API（运行时 harborBaseUrl + 凭据） */
  harborConfigured?: boolean;
  harborUrlHint?: string;
  /** 从 harborBaseUrl 解析，用于 docker pull / image: 字段（host:port） */
  harborRegistryHost?: string;
  harborSkipTls?: boolean;
  /** 兼容字段：Harbor 前缀已迁至应用中心 Redis「模版中心」；进程环境变量仍可兜底 */
  harborRedisConfigured?: boolean;
  /** 与 harborRedisConfigured 同义 */
  imageRegistryConfigured?: boolean;
  /** 应用中心 K8s Redis 默认是否持久化、容量与 StorageClass 提示 */
  redisK8sPersistenceEnabled?: boolean;
  redisK8sStorageSize?: string;
  redisK8sStorageClass?: string;
  /** runtime 中已填写 kubeconfig / in-cluster 等（与进程是否连上集群无关） */
  k8sRuntimeConfigured?: boolean;
  /** runtime 中已填写 vCenter URL 与用户（与密码/API 会话是否完整不同） */
  vcenterRuntimeConfigured?: boolean;
  /** 已填写 Redis 地址（与进程是否连上无关；viewer 下 redisConfigured 可能为 false） */
  redisAddrPresent?: boolean;
  /** 合并 redisAddr / redisHost:port 后是否填写了 Redis */
  redisConfigured?: boolean;
  redisConnected?: boolean;
  /** 已配置 Redis 但当前进程连不上时的错误摘要（与 redisConnected 互斥） */
  redisError?: string;
  /** 为 true 且 Redis 可达时，runtime-config 与 platform_kv 会镜像到 Redis（无 TTL） */
  runtimeDualWriteRedis?: boolean;
  redisMirrorRuntimeKey?: string;
  redisMirrorPlatformKvKey?: string;
  mysqlDsnConfigured?: boolean;
  /** 进程是否已成功连接 MySQL（与 /api/auth/status 的 mysqlReachable 一致） */
  mysqlReachable?: boolean;
  /** DSN 已配置但连接失败时的简要错误 */
  mysqlConnectError?: string;
  platformKvReady?: boolean;
  /** 文档中心依赖 MySQL 表 */
  docCenterMysqlReady?: boolean;
  /** 已配置腾讯云 COS 环境变量（附件上传走 COS；否则落盘 dataDir） */
  docCosConfigured?: boolean;
  /** 全局 Kubernetes 左侧菜单配置（顺序 / 文案 / 隐藏） */
  k8sSidebarMenu?: K8sSidebarMenuItem[];
};

/** 与 /api/runtime/status 中 mysqlSchema 字段对齐 */
export type RuntimeMysqlSchemaStatus = {
  configured?: boolean;
  reachable?: boolean;
  schemaVersionExpected?: number;
  schemaVersionRecorded?: string | null;
  schemaMetaPresent?: boolean;
  schemaAligned?: boolean;
  pingError?: string;
  schemaMetaError?: string;
};

/** GET /api/runtime/status — config 与同角色 GET /api/config 一致，systemCheck 与 /api/system/check 一致 */
export type RuntimeStatusResponse = {
  config: AppConfig;
  systemCheck: SystemCheck;
  /** 后端二进制构建版本（发版时与 ldflags 一致） */
  buildVersion?: string;
  mysqlSchema?: RuntimeMysqlSchemaStatus;
};

/** 与 internal.AuditRecord 对齐 */
export type AuditRecord = {
  ts: string;
  action: string;
  ip?: string;
  user?: string;
  method?: string;
  path?: string;
  status?: number;
  durationMs?: number;
  detail?: string;
};

export type AuditLogsResponse = {
  logs: AuditRecord[];
  path: string;
  /** 服务端保留天数（默认 30） */
  retentionDays?: number;
};

/** GET /api/audit/summary */
export type AuditSummaryResponse = {
  activeSessionNonceCount?: number;
  auditRetentionDays?: number;
  auditFileBytes?: number;
  auditFilePath?: string;
};

/** GET /api/audit/harbor-dashboard（管理员）：Harbor 代理统计、远端 statistics、最近访问日志 */
export type HarborProxyLogEntry = {
  ts?: string;
  user?: string;
  ip?: string;
  method?: string;
  apiRoute?: string;
  harborPath?: string;
  status?: number;
  durationMs?: number;
  fromCache?: boolean;
  note?: string;
};

export type HarborAdminDashboardResponse = {
  platform?: {
    harborProxyCalls?: number;
    cacheHits?: number;
    cacheMisses?: number;
    cacheTtlSec?: number;
    /** 单条响应写入 Redis 的最大体积（MB），环境变量 KUBEBT_HARBOR_LIST_CACHE_MAX_BODY_MB */
    cacheMaxBodyMB?: number;
    /** Redis 已连接且 TTL>0 时 Harbor 列表/统计会写入 Redis */
    harborListCacheEnabled?: boolean;
    redisAvailable?: boolean;
    cacheGeneration?: number;
    harborConfigured?: boolean;
  };
  remoteStatistics?: Record<string, unknown> | null;
  /** true 表示 Harbor /statistics 401/403，已由服务端用 /projects 汇总 */
  remoteStatisticsFallback?: boolean;
  /** 浏览器可打开的 Harbor 控制台根地址（优先 external_url） */
  harborUiUrl?: string;
  remoteError?: string;
  logs?: HarborProxyLogEntry[];
};

/** GET /api/prometheus/discover */
export type PrometheusDiscoverCandidate = {
  id: string;
  namespace: string;
  name: string;
  port: number;
  portName?: string;
  baseUrl: string;
  reason: string;
};

/** 与后端 `gin.H` 的 `checks` 等扩展字段对齐（如 Kafka 压测前置校验）。 */
/** 可选传入 AbortSignal，供 React Query 等在卸载/重复请求时取消 fetch。 */
export type ApiFetchOptions = {
  signal?: AbortSignal;
};

function withSignal(init: RequestInit, opt?: ApiFetchOptions): RequestInit {
  if (!opt?.signal) return init;
  return { ...init, signal: opt.signal };
}

export type ApiHttpErrorCheck = { id?: string; ok?: boolean; message?: string };

/** 与后端 `gin.H` 的 `error` / `code` 对齐，便于前端按 code 停止轮询等。 */
export class ApiHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
    public readonly serverMessage: string,
    public readonly code?: string,
    /** 与后端 gin.H「hint」一致，供登录页等单独展示排查说明 */
    public readonly serverHint?: string,
    /** 与后端 gin.H「checks」一致（如压测校验明细） */
    public readonly checks?: ApiHttpErrorCheck[]
  ) {
    const brief = status === 403 ? "权限错误" : serverMessage;
    super(`${status} ${path}: ${brief}`);
    this.name = "ApiHttpError";
  }
}

async function readErrorBody(
  res: Response
): Promise<{ msg: string; code?: string; hint?: string; checks?: ApiHttpErrorCheck[] }> {
  let msg = res.statusText;
  let code: string | undefined;
  let hint: string | undefined;
  let checks: ApiHttpErrorCheck[] | undefined;
  try {
    const j = (await res.json()) as {
      error?: string;
      code?: string;
      hint?: string;
      checks?: unknown;
    };
    if (j?.error) msg = j.error;
    code = j?.code;
    if (typeof j?.hint === "string" && j.hint.trim() !== "") hint = j.hint.trim();
    if (Array.isArray(j?.checks)) {
      checks = j.checks.filter(
        (x): x is ApiHttpErrorCheck =>
          x != null && typeof x === "object" && typeof (x as ApiHttpErrorCheck).message === "string"
      );
    }
  } catch {
    /* ignore */
  }
  // 403：统一为「权限错误」，不附带 hint/checks，避免泄露 IP 策略、模块细节等
  if (res.status === 403) {
    return { msg: "权限错误", code, hint: undefined, checks: undefined };
  }
  return { msg, code, hint, checks };
}

export async function apiGetJson<T>(path: string, opt?: ApiFetchOptions): Promise<T> {
  const res = await fetch(
    `${API_BASE}${path}`,
    withSignal({ credentials: apiFetchCredentials() }, opt)
  );
  maybeRedirectLogin(res, path);
  if (!res.ok) {
    const { msg, code, hint, checks } = await readErrorBody(res);
    throw new ApiHttpError(res.status, path, msg, code, hint, checks);
  }
  return res.json() as Promise<T>;
}

export async function apiGetText(path: string, opt?: ApiFetchOptions): Promise<string> {
  const res = await fetch(
    `${API_BASE}${path}`,
    withSignal({ credentials: apiFetchCredentials() }, opt)
  );
  maybeRedirectLogin(res, path);
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = (await res.json()) as { error?: string };
      if (j?.error) msg = j.error;
    } catch {
      /* ignore */
    }
    if (res.status === 403) msg = "权限错误";
    throw new Error(msg);
  }
  return res.text();
}

export async function apiDelete(path: string, opt?: ApiFetchOptions): Promise<void> {
  const res = await fetch(
    `${API_BASE}${path}`,
    withSignal(
      {
        method: "DELETE",
        credentials: apiFetchCredentials(),
      },
      opt
    )
  );
  maybeRedirectLogin(res, path);
  if (!res.ok) {
    const { msg, code, hint, checks } = await readErrorBody(res);
    throw new ApiHttpError(res.status, path, msg, code, hint, checks);
  }
}

/** DELETE 且解析 JSON 响应体（空体返回空对象）。用于删除实例后读取 k8sWarnings 等。 */
export async function apiDeleteJson<T = Record<string, unknown>>(
  path: string,
  opt?: ApiFetchOptions
): Promise<T> {
  const res = await fetch(
    `${API_BASE}${path}`,
    withSignal(
      {
        method: "DELETE",
        credentials: apiFetchCredentials(),
      },
      opt
    )
  );
  maybeRedirectLogin(res, path);
  if (!res.ok) {
    const { msg, code, hint, checks } = await readErrorBody(res);
    throw new ApiHttpError(res.status, path, msg, code, hint, checks);
  }
  const text = await res.text();
  const t = text.trim();
  if (!t) return {} as T;
  try {
    return JSON.parse(t) as T;
  } catch {
    return {} as T;
  }
}

export async function apiPostJson<TRes = unknown>(
  path: string,
  body: object,
  opt?: ApiFetchOptions
): Promise<TRes> {
  const res = await fetch(
    `${API_BASE}${path}`,
    withSignal(
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: apiFetchCredentials(),
        body: JSON.stringify(body),
      },
      opt
    )
  );
  maybeRedirectLogin(res, path);
  if (!res.ok) {
    const { msg, code, hint, checks } = await readErrorBody(res);
    throw new ApiHttpError(res.status, path, msg, code, hint, checks);
  }
  return res.json() as Promise<TRes>;
}

/** Prometheus 即时查询：POST body，避免在浏览器 Network URL 与网关访问日志中暴露 PromQL；服务端可写入平台 Redis 短缓存（约 60s）。 */
export async function prometheusQueryApi(
  scope: string,
  q: string,
  opt?: ApiFetchOptions
): Promise<unknown> {
  return apiPostJson<unknown>("/api/prometheus/query", { scope, q }, opt);
}

/** Prometheus query_range：同上，使用 POST。 */
export async function prometheusQueryRangeApi(
  scope: string,
  q: string,
  start: number | string,
  end: number | string,
  step: string,
  opt?: ApiFetchOptions
): Promise<unknown> {
  return apiPostJson<unknown>(
    "/api/prometheus/query_range",
    {
      scope,
      q,
      start: String(start),
      end: String(end),
      step,
    },
    opt
  );
}

export async function apiPutJson<TRes = unknown>(
  path: string,
  body: object,
  opt?: ApiFetchOptions
): Promise<TRes> {
  const res = await fetch(
    `${API_BASE}${path}`,
    withSignal(
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: apiFetchCredentials(),
        body: JSON.stringify(body),
      },
      opt
    )
  );
  maybeRedirectLogin(res, path);
  if (!res.ok) {
    const { msg, code, hint, checks } = await readErrorBody(res);
    throw new ApiHttpError(res.status, path, msg, code, hint, checks);
  }
  return res.json() as Promise<TRes>;
}

export async function apiPatchJson<TRes = unknown>(
  path: string,
  body: object,
  opt?: ApiFetchOptions
): Promise<TRes> {
  const res = await fetch(
    `${API_BASE}${path}`,
    withSignal(
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: apiFetchCredentials(),
        body: JSON.stringify(body),
      },
      opt
    )
  );
  maybeRedirectLogin(res, path);
  if (!res.ok) {
    const { msg, code, hint, checks } = await readErrorBody(res);
    throw new ApiHttpError(res.status, path, msg, code, hint, checks);
  }
  return res.json() as Promise<TRes>;
}

/** PUT 原始字节（如 PVC 内文件写入） */
export async function apiPutRaw(
  path: string,
  body: Blob | ArrayBuffer | Uint8Array,
  contentType = "application/octet-stream",
  opt?: ApiFetchOptions
): Promise<void> {
  const blob =
    body instanceof Blob
      ? body
      : new Blob([body as BlobPart]);
  const res = await fetch(
    `${API_BASE}${path}`,
    withSignal(
      {
        method: "PUT",
        headers: { "Content-Type": contentType },
        credentials: apiFetchCredentials(),
        body: blob,
      },
      opt
    )
  );
  maybeRedirectLogin(res, path);
  if (!res.ok) {
    const { msg, code, hint, checks } = await readErrorBody(res);
    throw new ApiHttpError(res.status, path, msg, code, hint, checks);
  }
}

/** POST 原始字节 */
export async function apiPostRaw(
  path: string,
  body: Blob | ArrayBuffer | Uint8Array,
  contentType = "application/octet-stream",
  opt?: ApiFetchOptions
): Promise<void> {
  const blob =
    body instanceof Blob
      ? body
      : new Blob([body as BlobPart]);
  const res = await fetch(
    `${API_BASE}${path}`,
    withSignal(
      {
        method: "POST",
        headers: { "Content-Type": contentType },
        credentials: apiFetchCredentials(),
        body: blob,
      },
      opt
    )
  );
  maybeRedirectLogin(res, path);
  if (!res.ok) {
    const { msg, code, hint, checks } = await readErrorBody(res);
    throw new ApiHttpError(res.status, path, msg, code, hint, checks);
  }
}

/** POST 无 body（如 PVC 删除） */
export async function apiPostNoBody(path: string, opt?: ApiFetchOptions): Promise<void> {
  const res = await fetch(
    `${API_BASE}${path}`,
    withSignal(
      {
        method: "POST",
        credentials: apiFetchCredentials(),
      },
      opt
    )
  );
  maybeRedirectLogin(res, path);
  if (!res.ok) {
    const { msg, code, hint, checks } = await readErrorBody(res);
    throw new ApiHttpError(res.status, path, msg, code, hint, checks);
  }
}

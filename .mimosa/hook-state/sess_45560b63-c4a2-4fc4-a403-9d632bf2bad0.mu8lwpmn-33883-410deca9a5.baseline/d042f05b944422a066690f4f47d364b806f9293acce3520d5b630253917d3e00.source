import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Database,
  Hexagon,
  Info,
  KeyRound,
  Server,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { apiGetJson, apiPostJson, type SetupStatus } from "@/lib/api";
import { setupText } from "@/i18n/setup";

type K8sMode = "none" | "incluster" | "kubeconfig";
type RedisMode = "standalone" | "sentinel" | "cluster";

function parseFirstAddress(addr: string, fallbackHost: string, fallbackPort: number) {
  const first = addr.split(",")[0]?.trim() ?? "";
  const ipv6 = first.match(/^\[([^\]]+)]:(\d+)$/);
  if (ipv6) return { host: ipv6[1], port: Number(ipv6[2]) || fallbackPort };
  const separator = first.lastIndexOf(":");
  if (separator > 0) {
    const port = Number(first.slice(separator + 1));
    if (Number.isInteger(port) && port > 0) {
      return { host: first.slice(0, separator), port };
    }
  }
  return { host: first || fallbackHost, port: fallbackPort };
}

const Setup: React.FC = () => {
  const qc = useQueryClient();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [useEnvironmentConnections, setUseEnvironmentConnections] = useState(false);
  const [useEnvironmentEncryptionKey, setUseEnvironmentEncryptionKey] = useState(false);

  // 必填：平台 URL
  const [platformPublicUrl, setPlatformPublicUrl] = useState("https://");

  // MySQL：默认折叠 host/port
  const [mysqlHost, setMysqlHost] = useState("127.0.0.1");
  const [mysqlPort, setMysqlPort] = useState(3306);
  const [mysqlDatabase, setMysqlDatabase] = useState("");
  const [mysqlUser, setMysqlUser] = useState("");
  const [mysqlPassword, setMysqlPassword] = useState("");
  const [mysqlAdvancedOpen, setMysqlAdvancedOpen] = useState(false);

  // Redis：架构选择
  const [redisMode, setRedisMode] = useState<RedisMode>("standalone");
  const [redisHost, setRedisHost] = useState("127.0.0.1");
  const [redisPort, setRedisPort] = useState(6379);
  const [redisPassword, setRedisPassword] = useState("");
  const [redisSentinelAddrs, setRedisSentinelAddrs] = useState("127.0.0.1:26379");
  const [redisSentinelMaster, setRedisSentinelMaster] = useState("mymaster");
  const [redisClusterAddrs, setRedisClusterAddrs] = useState("127.0.0.1:6379");

  // 加密密钥 + 管理员
  const [encryptionKey, setEncryptionKey] = useState("");
  const [dashboardUser, setDashboardUser] = useState("admin");
  const [dashboardPasswordPlain, setDashboardPasswordPlain] = useState("");

  // 可选模块：默认全部「稍后配置」
  const [baotaEnabled, setBaotaEnabled] = useState(false);
  const [baotaUrl, setBaotaUrl] = useState("");
  const [baotaApiKey, setBaotaApiKey] = useState("");
  const [baotaSkipTls, setBaotaSkipTls] = useState(true);
  const [syncIntervalSec, setSyncIntervalSec] = useState(30);
  const [ddnsHost, setDdnsHost] = useState("home.example.com");
  const [defaultPort, setDefaultPort] = useState("38333");
  const [baotaSslCertName, setBaotaSslCertName] = useState("");
  const [baotaSslPemContent, setBaotaSslPemContent] = useState("");
  const [baotaSslKeyContent, setBaotaSslKeyContent] = useState("");

  const [k8sMode, setK8sMode] = useState<K8sMode>("none");
  const [kubeconfigYaml, setKubeconfigYaml] = useState("");

  const [vcenterEnabled, setVcenterEnabled] = useState(false);
  const [vcenterUrl, setVcenterUrl] = useState("");
  const [vcenterUser, setVcenterUser] = useState("");
  const [vcenterPassword, setVcenterPassword] = useState("");
  const [vcenterInsecure, setVcenterInsecure] = useState(true);
  const [vcenterCacheTtlSec, setVcenterCacheTtlSec] = useState(120);

  const [sshEnabled, setSshEnabled] = useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await apiGetJson<SetupStatus>("/api/setup/status");
        if (!cancelled) {
          setStatus(s);
          const defaults = s.defaults;
          if (defaults) {
            if (defaults.platformPublicUrl) setPlatformPublicUrl(defaults.platformPublicUrl);
            if (defaults.mysqlHost) setMysqlHost(defaults.mysqlHost);
            if (defaults.mysqlPort) setMysqlPort(defaults.mysqlPort);
            if (defaults.mysqlDatabase) setMysqlDatabase(defaults.mysqlDatabase);
            if (defaults.mysqlUser) setMysqlUser(defaults.mysqlUser);
            if (defaults.dashboardUser) setDashboardUser(defaults.dashboardUser);

            const mode = defaults.redisMode;
            if (mode === "standalone" || mode === "sentinel" || mode === "cluster") {
              setRedisMode(mode);
            }
            const redisAddr = defaults.redisAddr?.trim() ?? "";
            const parsed = parseFirstAddress(redisAddr, defaults.redisHost || "127.0.0.1", defaults.redisPort || 6379);
            setRedisHost(defaults.redisHost || parsed.host);
            setRedisPort(defaults.redisPort || parsed.port);
            if (mode === "sentinel" && redisAddr) setRedisSentinelAddrs(redisAddr);
            if (mode === "cluster" && redisAddr) setRedisClusterAddrs(redisAddr);
            if (defaults.redisSentinelMaster) setRedisSentinelMaster(defaults.redisSentinelMaster);

            setUseEnvironmentConnections(defaults.connectionsConfigured);
            setUseEnvironmentEncryptionKey(defaults.encryptionKeyConfigured);
          }
        }
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const buildRedisConfig = () => {
    let finalHost = redisHost;
    let finalPort = redisPort;
    let finalAddr = "";
    if (redisMode === "standalone") {
      finalAddr = `${redisHost}:${redisPort}`;
    } else if (redisMode === "sentinel") {
      finalAddr = redisSentinelAddrs;
      const first = redisSentinelAddrs.split(",")[0].trim();
      if (first) {
        const [h, p] = first.split(":");
        if (h) finalHost = h;
        if (p) finalPort = parseInt(p, 10) || 26379;
      }
    } else if (redisMode === "cluster") {
      finalAddr = redisClusterAddrs;
      const first = redisClusterAddrs.split(",")[0].trim();
      if (first) {
        const [h, p] = first.split(":");
        if (h) finalHost = h;
        if (p) finalPort = parseInt(p, 10) || 6379;
      }
    }
    return { finalHost, finalPort, finalAddr };
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErr(null);
    try {
      if (baotaEnabled && (baotaSslPemContent.trim() === "") !== (baotaSslKeyContent.trim() === "")) {
        setErr("baotaSslPemContent 与 baotaSslKeyContent 必须同时填写");
        setSubmitting(false);
        return;
      }
      const { finalHost, finalPort, finalAddr } = buildRedisConfig();

      const k8s =
        k8sMode === "none"
          ? { mode: "none" as const, kubeconfigYaml: "" }
          : k8sMode === "incluster"
            ? { mode: "incluster" as const, kubeconfigYaml: "" }
            : { mode: "kubeconfig" as const, kubeconfigYaml: kubeconfigYaml };

      const body: Record<string, unknown> = {
        version: 1,
        platformPublicUrl: platformPublicUrl.trim(),
        mysqlHost: mysqlHost.trim(),
        mysqlPort,
        mysqlDatabase: mysqlDatabase.trim(),
        mysqlUser: mysqlUser.trim(),
        mysqlPassword,
        mysqlDsn: "",
        redisHost: finalHost,
        redisPort: finalPort,
        redisAddr: finalAddr,
        redisPassword,
        redisDb: 0,
        redisKeyPrefix: "",
        redisMode,
        redisSentinelMaster: redisMode === "sentinel" ? redisSentinelMaster.trim() : "",
        encryptionKey: encryptionKey.trim(),
        ingressBaotaSyncEnabled: baotaEnabled,
        baotaUrl: baotaUrl.trim(),
        baotaApiKey: baotaApiKey.trim(),
        baotaSkipTlsVerify: baotaSkipTls,
        baotaDisableHttpKeepalive: true,
        baotaHttpTimeoutSec: 45,
        baotaTcpProbeTimeoutSec: 5,
        baotaCheckMinIntervalSec: 90,
        ddnsHost: ddnsHost.trim(),
        defaultPort: defaultPort.trim(),
        syncIntervalSec,
        baotaSslCertName: baotaSslCertName.trim(),
        baotaSslPemContent: baotaSslPemContent.trim(),
        baotaSslKeyContent: baotaSslKeyContent.trim(),
        dashboardUser: dashboardUser.trim(),
        dashboardSessionDays: 7,
        dashboardCookieSecure: false,
        dashboardListenAddr: ":8080",
        prometheusUrl: "",
        prometheusTimeoutSec: 30,
        prometheusSkipTls: false,
        prometheusBearerToken: "",
        vcenterUrl: vcenterEnabled ? vcenterUrl.trim() : "",
        vcenterUser: vcenterEnabled ? vcenterUser.trim() : "",
        vcenterPassword: vcenterEnabled ? vcenterPassword : "",
        vcenterInsecure,
        vcenterWmksScriptUrl: "",
        vcenterWmksCssUrl: "",
        vcenterUiBaseUrl: "",
        vcenterConsoleHost: "",
        vcenterUiThumbprint: "",
        vcenterVmSshUser: "",
        vcenterVmSshPrivateKeyPath: "",
        vcenterVmSshPassword: "",
        vcenterVmSshKeyPassphrase: "",
        vcenterVmSshPort: 22,
        vcenterVmSshInsecureHostKey: false,
        vcenterVmSshHostKeyFingerprint: "",
        vcenterCacheTtlSec: vcenterEnabled ? vcenterCacheTtlSec : 120,
        sshSettingsBackend: sshEnabled ? "file" : "",
        sshSettingsDir: "",
        k8s,
        dashboardPasswordPlain,
        useEnvironmentConnections,
        useEnvironmentEncryptionKey,
      };
      await apiPostJson("/api/setup", body);
      toast.success("初始化保存成功");
      await qc.invalidateQueries({ queryKey: ["setup-status"] });
      window.location.assign("/login");
    } catch (e) {
      const msg = (e as Error).message;
      setErr(msg);
      toast.error(`保存失败：${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-600">
        加载向导…
      </div>
    );
  }

  if (status?.initialized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <p className="text-slate-600">已初始化，正在跳转…</p>
      </div>
    );
  }

  const SectionHeader: React.FC<{ icon: React.ReactNode; title: string; desc?: string }> = ({
    icon,
    title,
    desc,
  }) => (
    <CardHeader className="pb-4">
      <CardTitle className="flex items-center gap-2 text-lg">
        {icon}
        {title}
      </CardTitle>
      {desc && <CardDescription>{desc}</CardDescription>}
    </CardHeader>
  );

  const FieldHint: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <p className="text-xs text-slate-500 mt-1">{children}</p>
  );

  const environmentDefaults = status?.defaults;
  const environmentMySQLAddress = `${environmentDefaults?.mysqlHost || "MySQL"}:${environmentDefaults?.mysqlPort || 3306}`;
  const environmentRedisAddress =
    environmentDefaults?.redisAddr ||
    `${environmentDefaults?.redisHost || "Redis"}:${environmentDefaults?.redisPort || 6379}`;

  return (
    <div className="min-h-dvh bg-slate-100 px-4 py-6 font-sans sm:px-6 lg:py-8">
      <div className="mx-auto grid w-full max-w-6xl items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-8">
        <aside className="overflow-hidden rounded-2xl bg-slate-950 p-6 text-white shadow-xl lg:sticky lg:top-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500 shadow-lg shadow-blue-950/30">
              <Hexagon size={26} strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-blue-300">Kube-BT-Sync</p>
              <h1 className="mt-1 text-xl font-semibold">首次初始化</h1>
            </div>
          </div>

          <p className="mt-5 text-sm leading-6 text-slate-300">
            确认运行环境连接，设置管理员密码后即可进入平台。可选集成可以稍后在系统设置中完成。
          </p>

          <ol className="mt-7 space-y-4 text-sm">
            {[
              ["平台与数据存储", "确认访问地址和连接"],
              ["管理员账号", "设置首个登录账号"],
              ["可选集成", "按需开启，也可稍后配置"],
            ].map(([title, description], index) => (
              <li key={title} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-blue-200">
                  {index + 1}
                </span>
                <span>
                  <span className="block font-medium text-slate-100">{title}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-slate-400">{description}</span>
                </span>
              </li>
            ))}
          </ol>

          <div className="mt-7 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-xs font-medium text-slate-300">数据目录</p>
            <p className="mt-1 break-all font-mono text-[11px] leading-5 text-slate-400">
              {status?.dataDir ?? "…"}
            </p>
          </div>
        </aside>

        <main className="min-w-0">
          <form onSubmit={onSubmit} className="space-y-4">
          {/* 必填：平台与数据存储 */}
          <Card className="border-slate-200 shadow-sm">
            <SectionHeader
              icon={<KeyRound className="h-5 w-5 text-blue-600" />}
              title="必填：平台与数据存储"
              desc="MySQL 存储平台元数据；Redis 用于缓存与平台 KV 双写。"
            />
            <CardContent className="space-y-5">
              {environmentDefaults?.connectionsConfigured && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex gap-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
                      <div className="space-y-1">
                        <Label className="text-blue-950">{setupText.environmentConnectionsTitle}</Label>
                        <p className="text-xs leading-5 text-blue-800">
                          {setupText.environmentConnectionsDescription}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={useEnvironmentConnections}
                      onCheckedChange={setUseEnvironmentConnections}
                      aria-label={setupText.environmentConnectionsTitle}
                    />
                  </div>

                  {useEnvironmentConnections && (
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-lg border border-blue-100 bg-white/80 px-3 py-2.5">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">MySQL</p>
                        <p className="mt-1 truncate font-mono text-xs text-slate-800" title={environmentMySQLAddress}>
                          {environmentMySQLAddress}
                        </p>
                        <p className="mt-1 truncate text-xs text-slate-500">
                          {environmentDefaults.mysqlDatabase || "已配置数据库"}
                        </p>
                      </div>
                      <div className="rounded-lg border border-blue-100 bg-white/80 px-3 py-2.5">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Redis</p>
                        <p className="mt-1 truncate font-mono text-xs text-slate-800" title={environmentRedisAddress}>
                          {environmentRedisAddress}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {environmentDefaults.redisMode || "standalone"} · 密码由服务端沿用
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 平台 URL */}
              <div className="space-y-2">
                <Label>平台访问地址</Label>
                <Input
                  value={platformPublicUrl}
                  onChange={(e) => setPlatformPublicUrl(e.target.value)}
                  required
                  placeholder="https://kube-bt.example.com"
                />
                <FieldHint>浏览器访问本平台的根地址，含协议与域名。</FieldHint>
              </div>

              {!useEnvironmentConnections && (
                <>
              {/* MySQL */}
              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-slate-500" />
                  <span className="text-sm font-medium text-slate-800">MySQL</span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label>库名</Label>
                    <Input
                      value={mysqlDatabase}
                      onChange={(e) => setMysqlDatabase(e.target.value)}
                      required={!useEnvironmentConnections}
                      disabled={useEnvironmentConnections}
                      placeholder="kubebt"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>用户</Label>
                    <Input
                      value={mysqlUser}
                      onChange={(e) => setMysqlUser(e.target.value)}
                      required={!useEnvironmentConnections}
                      disabled={useEnvironmentConnections}
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>密码</Label>
                    <Input
                      type="password"
                      value={mysqlPassword}
                      onChange={(e) => setMysqlPassword(e.target.value)}
                      required={!useEnvironmentConnections}
                      disabled={useEnvironmentConnections}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder={
                        useEnvironmentConnections && status?.defaults?.mysqlPasswordConfigured
                          ? setupText.environmentSecretPlaceholder
                          : setupText.manualSecretPlaceholder
                      }
                    />
                  </div>
                </div>

                {useEnvironmentConnections && status?.defaults?.mysqlDsnConfigured && !status.defaults.mysqlHost && (
                  <FieldHint>{setupText.environmentMySQLDsn}</FieldHint>
                )}

                <Collapsible open={mysqlAdvancedOpen} onOpenChange={setMysqlAdvancedOpen}>
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
                    >
                      {mysqlAdvancedOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      高级选项（Host / 端口）
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-3">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Host</Label>
                        <Input
                          value={mysqlHost}
                          onChange={(e) => setMysqlHost(e.target.value)}
                          disabled={useEnvironmentConnections}
                          placeholder="127.0.0.1"
                          autoComplete="off"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>端口</Label>
                        <Input
                          type="number"
                          min={1}
                          max={65535}
                          value={mysqlPort}
                          onChange={(e) => setMysqlPort(Number(e.target.value))}
                          disabled={useEnvironmentConnections}
                        />
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>

              {/* Redis */}
              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                <div className="flex items-center gap-2">
                  <Server className="h-4 w-4 text-slate-500" />
                  <span className="text-sm font-medium text-slate-800">Redis</span>
                </div>
                <div className="space-y-2">
                  <Label>部署架构</Label>
                  <Select
                    value={redisMode}
                    onValueChange={(v) => setRedisMode(v as RedisMode)}
                    disabled={useEnvironmentConnections}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standalone">单机（Standalone）</SelectItem>
                      <SelectItem value="sentinel">哨兵（Sentinel）</SelectItem>
                      <SelectItem value="cluster">集群（Cluster）</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {redisMode === "standalone" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Host</Label>
                      <Input
                        value={redisHost}
                        onChange={(e) => setRedisHost(e.target.value)}
                        disabled={useEnvironmentConnections}
                        placeholder="127.0.0.1"
                        autoComplete="off"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>端口</Label>
                      <Input
                        type="number"
                        min={1}
                        max={65535}
                        value={redisPort}
                        onChange={(e) => setRedisPort(Number(e.target.value))}
                        disabled={useEnvironmentConnections}
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>密码（可选）</Label>
                      <Input
                        type="password"
                        value={redisPassword}
                        onChange={(e) => setRedisPassword(e.target.value)}
                        disabled={useEnvironmentConnections}
                        autoComplete="off"
                        spellCheck={false}
                        placeholder={
                          useEnvironmentConnections && status?.defaults?.redisPasswordConfigured
                            ? setupText.environmentSecretPlaceholder
                            : setupText.manualSecretPlaceholder
                        }
                      />
                    </div>
                  </div>
                )}

                {redisMode === "sentinel" && (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>Sentinel 地址</Label>
                      <Input
                        value={redisSentinelAddrs}
                        onChange={(e) => setRedisSentinelAddrs(e.target.value)}
                        required={redisMode === "sentinel" && !useEnvironmentConnections}
                        disabled={useEnvironmentConnections}
                        placeholder="host1:26379,host2:26379"
                        autoComplete="off"
                      />
                      <FieldHint>多个 Sentinel 节点用英文逗号分隔。初始化时仅验证首个节点连通性。</FieldHint>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Master 名称</Label>
                        <Input
                          value={redisSentinelMaster}
                          onChange={(e) => setRedisSentinelMaster(e.target.value)}
                          required={redisMode === "sentinel" && !useEnvironmentConnections}
                          disabled={useEnvironmentConnections}
                          placeholder="mymaster"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>密码（可选）</Label>
                        <Input
                          type="password"
                          value={redisPassword}
                          onChange={(e) => setRedisPassword(e.target.value)}
                          disabled={useEnvironmentConnections}
                          autoComplete="off"
                          spellCheck={false}
                          placeholder={
                            useEnvironmentConnections && status?.defaults?.redisPasswordConfigured
                              ? setupText.environmentSecretPlaceholder
                              : setupText.manualSecretPlaceholder
                          }
                        />
                      </div>
                    </div>
                  </div>
                )}

                {redisMode === "cluster" && (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>集群节点地址</Label>
                      <Input
                        value={redisClusterAddrs}
                        onChange={(e) => setRedisClusterAddrs(e.target.value)}
                        required={redisMode === "cluster" && !useEnvironmentConnections}
                        disabled={useEnvironmentConnections}
                        placeholder="host1:6379,host2:6379,host3:6379"
                        autoComplete="off"
                      />
                      <FieldHint>至少填写一个节点地址，多个用英文逗号分隔。初始化时仅验证首个节点连通性。</FieldHint>
                    </div>
                    <div className="space-y-2">
                      <Label>密码（可选）</Label>
                      <Input
                        type="password"
                        value={redisPassword}
                        onChange={(e) => setRedisPassword(e.target.value)}
                        disabled={useEnvironmentConnections}
                        autoComplete="off"
                        spellCheck={false}
                        placeholder={
                          useEnvironmentConnections && status?.defaults?.redisPasswordConfigured
                            ? setupText.environmentSecretPlaceholder
                            : setupText.manualSecretPlaceholder
                        }
                      />
                    </div>
                  </div>
                )}
              </div>
                </>
              )}

              {/* 加密密钥 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-slate-500" />
                    <Label>加密密钥（Encryption Key）</Label>
                  </div>
                  {status?.defaults?.encryptionKeyConfigured && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {setupText.environmentEncryptionKey}
                      </span>
                      <Switch
                        checked={useEnvironmentEncryptionKey}
                        onCheckedChange={setUseEnvironmentEncryptionKey}
                        aria-label={setupText.environmentEncryptionKey}
                      />
                    </div>
                  )}
                </div>
                {useEnvironmentEncryptionKey ? (
                  <div className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs text-blue-800">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-600" />
                    {setupText.environmentEncryptionKeyDescription}
                  </div>
                ) : (
                  <Input
                    value={encryptionKey}
                    onChange={(e) => setEncryptionKey(e.target.value)}
                    required
                    minLength={16}
                    autoComplete="off"
                    placeholder="至少 16 位随机字符串，建议 32 位"
                  />
                )}
                <div className="flex items-start gap-1.5 text-xs text-slate-500 mt-1">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    用于加密敏感数据（如宝塔 SSL 证书、SSH 私钥、云账号凭证等）。请妥善保存，丢失后无法解密已有数据。
                  </span>
                </div>
              </div>

              {/* 管理员账号 */}
              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-slate-500" />
                  <span className="text-sm font-medium text-slate-800">管理员账号</span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>用户名</Label>
                    <Input value={dashboardUser} onChange={(e) => setDashboardUser(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label>密码</Label>
                    <Input
                      type="password"
                      value={dashboardPasswordPlain}
                      onChange={(e) => setDashboardPasswordPlain(e.target.value)}
                      required
                      minLength={8}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="至少 8 位"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-end justify-between gap-4 px-1 pt-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900">可选集成</h2>
              <p className="mt-1 text-xs text-slate-500">不影响首次登录，可以全部稍后配置。</p>
            </div>
          </div>

          {/* 可选：宝塔同步 */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="py-4">
              <div className="flex items-center justify-between gap-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Server className="h-5 w-5 text-amber-600" />
                  Ingress ↔ 宝塔同步
                </CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">{baotaEnabled ? "直接配置" : "稍后配置"}</span>
                  <Switch checked={baotaEnabled} onCheckedChange={setBaotaEnabled} />
                </div>
              </div>
            </CardHeader>
            {baotaEnabled && (
              <CardContent className="space-y-4 pt-0">
                <div className="space-y-2">
                  <Label>宝塔面板地址</Label>
                  <Input value={baotaUrl} onChange={(e) => setBaotaUrl(e.target.value)} placeholder="https://bt.example.com" />
                </div>
                <div className="space-y-2">
                  <Label>API Key</Label>
                  <Input
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    value={baotaApiKey}
                    onChange={(e) => setBaotaApiKey(e.target.value)}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                  <Label className="cursor-pointer">HTTPS 跳过 TLS 校验</Label>
                  <Switch checked={baotaSkipTls} onCheckedChange={setBaotaSkipTls} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>DDNS 域名</Label>
                    <Input value={ddnsHost} onChange={(e) => setDdnsHost(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>默认端口</Label>
                    <Input value={defaultPort} onChange={(e) => setDefaultPort(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>同步间隔（秒）</Label>
                  <Input
                    type="number"
                    min={1}
                    value={syncIntervalSec}
                    onChange={(e) => setSyncIntervalSec(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>SSL 证书名称（可选）</Label>
                  <Input value={baotaSslCertName} onChange={(e) => setBaotaSslCertName(e.target.value)} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>PEM 证书内容（可选）</Label>
                    <Textarea
                      className="min-h-[120px] font-mono text-xs"
                      value={baotaSslPemContent}
                      onChange={(e) => setBaotaSslPemContent(e.target.value)}
                      placeholder="-----BEGIN CERTIFICATE-----"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>KEY 私钥内容（可选）</Label>
                    <Textarea
                      className="min-h-[120px] font-mono text-xs"
                      value={baotaSslKeyContent}
                      onChange={(e) => setBaotaSslKeyContent(e.target.value)}
                      placeholder="-----BEGIN PRIVATE KEY-----"
                    />
                  </div>
                </div>
                <p className="text-xs text-slate-500">PEM/KEY 需成对填写；内容在服务端加密保存。</p>
              </CardContent>
            )}
          </Card>

          {/* 可选：Kubernetes */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Server className="h-5 w-5 text-emerald-600" />
                  Kubernetes
                </CardTitle>
                <Select value={k8sMode} onValueChange={(v) => setK8sMode(v as K8sMode)}>
                  <SelectTrigger className="w-full sm:w-[240px]" aria-label="Kubernetes 连接模式">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">稍后配置</SelectItem>
                    <SelectItem value="incluster">In-Cluster（本 Pod 在集群内）</SelectItem>
                    <SelectItem value="kubeconfig">Kubeconfig（外部集群）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            {k8sMode === "kubeconfig" && (
              <CardContent className="pb-5 pt-0">
                <div className="space-y-2">
                  <Label>Kubeconfig YAML</Label>
                  <Textarea
                    className="min-h-[180px] font-mono text-xs"
                    value={kubeconfigYaml}
                    onChange={(e) => setKubeconfigYaml(e.target.value)}
                    required={k8sMode === "kubeconfig"}
                  />
                </div>
              </CardContent>
            )}
          </Card>

          {/* 可选：vCenter */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="py-4">
              <div className="flex items-center justify-between gap-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Database className="h-5 w-5 text-violet-600" />
                  vCenter
                </CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">{vcenterEnabled ? "直接配置" : "稍后配置"}</span>
                  <Switch checked={vcenterEnabled} onCheckedChange={setVcenterEnabled} />
                </div>
              </div>
            </CardHeader>
            {vcenterEnabled && (
              <CardContent className="space-y-4 pt-0">
                <div className="space-y-2">
                  <Label>vCenter 地址</Label>
                  <Input value={vcenterUrl} onChange={(e) => setVcenterUrl(e.target.value)} placeholder="https://vcenter.example.com" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>用户名</Label>
                    <Input value={vcenterUser} onChange={(e) => setVcenterUser(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>密码</Label>
                    <Input
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      value={vcenterPassword}
                      onChange={(e) => setVcenterPassword(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <Label className="cursor-pointer">跳过 TLS 校验</Label>
                  <Switch checked={vcenterInsecure} onCheckedChange={setVcenterInsecure} />
                </div>
                <div className="space-y-2">
                  <Label>Redis 缓存 TTL（秒）</Label>
                  <Input
                    type="number"
                    min={10}
                    value={vcenterCacheTtlSec}
                    onChange={(e) => setVcenterCacheTtlSec(Number(e.target.value))}
                  />
                </div>
              </CardContent>
            )}
          </Card>

          {/* 可选：SSH 持久化 */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="py-4">
              <div className="flex items-center justify-between gap-4">
                <CardTitle className="text-lg">SSH 虚拟机凭据持久化</CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">{sshEnabled ? "启用" : "稍后配置"}</span>
                  <Switch checked={sshEnabled} onCheckedChange={setSshEnabled} />
                </div>
              </div>
            </CardHeader>
            {sshEnabled && (
              <CardContent className="pt-0">
                <div className="flex items-start gap-1.5 text-xs text-slate-500">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    启用后，云主机的 SSH 用户名、密码与密钥将加密持久化到本地文件，避免每次连接重新输入。
                  </span>
                </div>
              </CardContent>
            )}
          </Card>

          {err && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {err}
            </div>
          )}

          <div className="sticky bottom-0 z-10 -mx-2 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-white/85">
            <Button type="submit" className="w-full" size="lg" disabled={submitting}>
              {submitting ? "保存中…" : "保存并进入登录"}
            </Button>
          </div>
          </form>
        </main>
      </div>
    </div>
  );
};

export default Setup;

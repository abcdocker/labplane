import React from "react";
import { useAppConfig } from "@/hooks/use-app-config";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Cloud,
  Database,
  HardDrive,
  Monitor,
  Server,
  SquareTerminal,
} from "lucide-react";
import { useAuth } from "@/auth/auth-context";
import { apiGetJson, type AppConfig } from "@/lib/api";
import { menuItemVisible, moduleVisible } from "@/lib/platform-permissions";

type VMRow = { moref: string; name: string; powerState?: string; ip?: string };
type ExtraHostRow = { id: string; name: string; address: string };

/**
 * 堡垒机控制台首页：与 Orion「工作台」类似，汇总本平台已同步的主机/虚拟机数据（来自 vCenter 与策略中的额外主机）。
 */
const BastionConsoleHome: React.FC = () => {
  const { status: auth } = useAuth();
  const cfgQ = useAppConfig();
  const perm = cfgQ.data?.permissions;
  const showApp = menuItemVisible(
    perm,
    "appcenter",
    auth?.role,
    moduleVisible(perm, "appcenter")
  );

  const bastionQ = useQuery({
    queryKey: ["bastion-console-vms"],
    queryFn: ({ signal }) =>
      apiGetJson<{ vms: VMRow[]; extraHosts?: ExtraHostRow[] }>("/api/vcenter/bastion/vms", { signal }),
    staleTime: 60_000,
    gcTime: 120_000,
    refetchOnWindowFocus: false,
  });

  const hostsQ = useQuery({
    queryKey: ["bastion-console-hosts"],
    queryFn: ({ signal }) => apiGetJson<{ hosts: { name?: string }[] }>("/api/vcenter/hosts", { signal }),
    enabled: cfgQ.data?.vcenterConfigured === true,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const cloudVmQ = useQuery({
    queryKey: ["bastion-console-cloud-vm"],
    queryFn: ({ signal }) => apiGetJson<{ instances: { id: number; name: string }[] }>("/api/app-center/cloud-vm/instances", { signal }),
    enabled: showApp,
    staleTime: 60_000,
  });

  const redisQ = useQuery({
    queryKey: ["bastion-console-redis"],
    queryFn: ({ signal }) =>
      apiGetJson<{ instances: { id: number; name: string }[] }>("/api/app-center/redis/instances", { signal }),
    enabled: showApp,
    staleTime: 60_000,
  });

  const nativeSshQ = useQuery({
    queryKey: ["vcenter-bastion-native-ssh"],
    queryFn: ({ signal }) =>
      apiGetJson<{
        enabled?: boolean;
        port?: number;
        hostKeyFingerprint?: string;
        hint?: string;
      }>("/api/vcenter/bastion/native-ssh", { signal }),
    staleTime: 30_000,
  });

  const vms = bastionQ.data?.vms ?? [];
  const extras = bastionQ.data?.extraHosts ?? [];
  const poweredOn = vms.filter((v) => String(v.powerState).toLowerCase().includes("on")).length;
  const nHosts = hostsQ.data?.hosts?.length ?? 0;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto px-4 py-8 sm:px-8">
      <div className="mx-auto w-full max-w-4xl space-y-8">
        <div className="space-y-2 text-center sm:text-left">
          <h1 className="text-xl font-semibold tracking-tight text-slate-100">堡垒机控制台</h1>
          <p className="text-sm text-slate-400">
            数据来自当前运行时已连接的 vCenter 与堡垒机策略；进入「主机与终端」可选择主机、打开 SSH / 远程桌面与 SFTP。
          </p>
        </div>

        <Link
          to="/cluster/bastion/session"
          className="flex items-center justify-between gap-4 rounded-2xl border border-emerald-800/50 bg-gradient-to-r from-emerald-950/50 to-slate-900/40 px-5 py-4 text-left ring-1 ring-emerald-900/30 transition hover:border-emerald-700/60 hover:from-emerald-950/70"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-900/40 text-emerald-300">
              <SquareTerminal className="h-6 w-6" aria-hidden />
            </div>
            <div>
              <p className="font-medium text-emerald-100">主机与终端</p>
              <p className="text-xs text-slate-400">左侧主机列表 · 多标签 SSH · Windows 网页 RDP（HTTPS 网关）</p>
            </div>
          </div>
          <ArrowRight className="h-5 w-5 shrink-0 text-emerald-400/80" aria-hidden />
        </Link>

        {nativeSshQ.data?.enabled ? (
          <div className="rounded-2xl border border-sky-800/50 bg-sky-950/30 px-5 py-4 text-left">
            <p className="text-sm font-medium text-sky-200">OpenSSH 对接本机堡垒机</p>
            <p className="mt-1 text-xs text-slate-500">
              在终端使用与 Web
              相同的平台账号；连接后按提示选择目标。已开两步验证时，密码可写为「密码+6
              位」或「密码|6
              位」。
            </p>
            <p className="mt-2 font-mono text-[11px] text-slate-400">
              ssh -o StrictHostKeyChecking=accept-new -p {nativeSshQ.data?.port ?? 2222} 用户名@&lt;与访问本控制台相同可达的
              IP 或域名&gt;
            </p>
            {nativeSshQ.data?.hostKeyFingerprint ? (
              <p className="mt-1 font-mono text-[10px] text-slate-500">
                主机公钥 SHA256: {nativeSshQ.data.hostKeyFingerprint}
              </p>
            ) : null}
            {auth?.role === "admin" ? (
              <p className="mt-2 text-[11px] text-amber-600/90">
                在「策略与分组」中可启停与修改端口。多副本时仅后台任务 Pod
                会监听；需将 Service / NodePort 或 hostPort 暴露到可访问的地址。
              </p>
            ) : null}
          </div>
        ) : null}

        {bastionQ.isError ? (
          <div className="rounded-xl border border-red-900/50 bg-red-950/20 px-4 py-3 text-sm text-red-200">
            {(bastionQ.error as Error)?.message ?? "加载堡垒机列表失败"}（请确认 vCenter 已配置）
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-[#12161c] p-4">
            <div className="mb-2 flex items-center gap-2 text-slate-400">
              <Monitor className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">虚拟机</span>
            </div>
            <p className="text-2xl font-semibold text-slate-100">
              {bastionQ.isLoading ? "—" : vms.length}
            </p>
            <p className="mt-1 text-xs text-slate-500">清单中可连接目标（含分组过滤前总数）</p>
            <p className="mt-2 text-xs text-emerald-600/90">已开机约 {bastionQ.isLoading ? "—" : poweredOn} 台</p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#12161c] p-4">
            <div className="mb-2 flex items-center gap-2 text-slate-400">
              <HardDrive className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">额外主机</span>
            </div>
            <p className="text-2xl font-semibold text-slate-100">
              {bastionQ.isLoading ? "—" : extras.length}
            </p>
            <p className="mt-1 text-xs text-slate-500">策略中配置的物理机 / 跳板机等</p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#12161c] p-4">
            <div className="mb-2 flex items-center gap-2 text-slate-400">
              <Server className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">ESXi 主机</span>
            </div>
            <p className="text-2xl font-semibold text-slate-100">
              {!cfgQ.data?.vcenterConfigured
                ? "—"
                : hostsQ.isLoading
                  ? "…"
                  : nHosts}
            </p>
            <p className="mt-1 text-xs text-slate-500">vCenter 纳管宿主机数量</p>
          </div>

          {showApp ? (
            <>
              <div className="rounded-xl border border-slate-800 bg-[#12161c] p-4">
                <div className="mb-2 flex items-center gap-2 text-slate-400">
                  <Cloud className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wide">应用中心 · 云主机</span>
                </div>
                <p className="text-2xl font-semibold text-slate-100">
                  {cloudVmQ.isLoading ? "…" : (cloudVmQ.data?.instances?.length ?? 0)}
                </p>
                <p className="mt-1 text-xs text-slate-500">在会话页侧栏可打开 SSH 抽屉</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-[#12161c] p-4">
                <div className="mb-2 flex items-center gap-2 text-slate-400">
                  <Database className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wide">应用中心 · Redis</span>
                </div>
                <p className="text-2xl font-semibold text-slate-100">
                  {redisQ.isLoading ? "…" : (redisQ.data?.instances?.length ?? 0)}
                </p>
                <p className="mt-1 text-xs text-slate-500">redis-cli 终端快捷入口</p>
              </div>
            </>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-3 text-sm">
          <Link
            to="/cluster/bastion/session"
            className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2 text-slate-200 hover:bg-slate-800"
          >
            进入主机与终端
          </Link>
          {auth?.role === "admin" ? (
            <Link
              to="/cluster/bastion/admin"
              className="rounded-lg border border-slate-700 px-4 py-2 text-slate-400 hover:bg-slate-900/50 hover:text-slate-200"
            >
              策略与分组
            </Link>
          ) : null}
          <Link
            to="/cluster/vcenter/settings"
            className="rounded-lg border border-slate-700 px-4 py-2 text-slate-400 hover:bg-slate-900/50 hover:text-slate-200"
          >
            vCenter / SSH 设置
          </Link>
        </div>
      </div>
    </div>
  );
};

export default BastionConsoleHome;

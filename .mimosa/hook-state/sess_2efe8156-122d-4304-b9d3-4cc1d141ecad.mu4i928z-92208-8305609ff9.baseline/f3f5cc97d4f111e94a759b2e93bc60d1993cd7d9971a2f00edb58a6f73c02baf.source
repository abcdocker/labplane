import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppConfig } from "@/hooks/use-app-config";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ExternalLink,
  Home,
  Monitor,
  Search,
  HardDrive,
  ChevronRight,
  Settings,
  X,
  Database,
  SquareTerminal,
} from "lucide-react";
import { useAuth } from "@/auth/auth-context";
import { apiGetJson, type AppConfig } from "@/lib/api";
import { menuItemVisible, moduleVisible } from "@/lib/platform-permissions";
import CloudVmSshTerminalSheet from "@/components/CloudVmSshTerminalSheet";
import RedisCliTerminalSheet from "@/components/RedisCliTerminalSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import BastionHostInsightPanel from "@/components/BastionHostInsightPanel";
import BastionTerminalChrome, {
  bastionTabStatusDotClass,
  type BastionTerminalSessionStatus,
} from "@/components/BastionTerminalChrome";
import VCenterSshTerminal from "./VCenterSshTerminal";
import VCenterBastionSftpPanel from "./VCenterBastionSftpPanel";
import {
  BASTION_SSH_FONT_PRESETS,
  persistSshTerminalTheme,
  readBastionSshFontPresetId,
  readBastionSshFontSize,
  writeBastionSshFontPrefs,
} from "@/lib/bastionSshAppearance";
import { SSH_TERM_PRESETS } from "@/lib/sshTerminalPresets";
import { readSshTerminalThemeId } from "@/lib/sshTermLocal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { BastionOsBadge, bastionGroupAccent } from "@/lib/bastionGuestOs";

type VMRow = {
  moref: string;
  name: string;
  powerState?: string;
  guestId?: string;
  ip?: string;
  folderPath?: string;
  manualGroup?: string;
  /** 策略配置的 JumpServer RDP Web Client 等 HTTPS 内嵌地址 */
  rdpWebUrl?: string;
  /** vCenter QuickStats（列表接口已带，供右侧概览） */
  cpu?: number;
  memoryMB?: number;
  cpuUsageMHz?: number;
  cpuCapacityMHz?: number;
  cpuUsagePercent?: number;
  memoryUsageMB?: number;
  memoryMaxMB?: number;
  memoryUsagePercent?: number;
  uptimeSec?: number;
  overallStatus?: string;
};

type ExtraHostRow = {
  id: string;
  name: string;
  address: string;
  kind?: string;
  sshPort?: number;
  rdpPort?: number;
  sshUser?: string;
  rdpUser?: string;
  rdpWebUrl?: string;
};

type BastionVMListRes = {
  vms: VMRow[];
  extraHosts?: ExtraHostRow[];
  folderPathPending?: boolean;
};

const EMPTY_VMS: VMRow[] = [];
const EMPTY_EXTRAS: ExtraHostRow[] = [];

/** 独立堡垒机路由（与 vCenter 菜单解耦） */
export const BASTION_ROUTE_BASE = "/cluster/bastion";

function bastionSidebarExcludeVmByFolder(vm: VMRow): boolean {
  if (vm.manualGroup?.trim()) return false;
  const fp = vm.folderPath?.trim() ?? "";
  if (!fp) return false;
  if (fp.toLowerCase().includes("discovered virtual machine")) return true;
  const parts = fp
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);
  const last = parts[parts.length - 1];
  if (last && last.toLowerCase() === "vm") return true;
  return false;
}

function parseSel(key: string | null): { kind: "vm"; moref: string } | { kind: "extra"; id: string } | null {
  if (!key) return null;
  if (key.startsWith("extra:")) return { kind: "extra", id: key.slice(6) };
  if (key.startsWith("vm:")) return { kind: "vm", moref: key.slice(3) };
  return null;
}

function isWindowsGuest(guestId?: string): boolean {
  if (!guestId) return false;
  return /win|microsoftWindows/i.test(guestId);
}

function BastionSidebarServiceChip({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "shrink-0 rounded px-1 py-px text-[10px] font-semibold leading-none tracking-wide",
        className,
      )}
    >
      {children}
    </span>
  );
}

type SshSession = { key: string; label: string };

const RDP_OVERRIDE_PREFIX = "bastion-rdp-url:";
/** 堡垒机 Windows 远程固定使用标准 RDP 端口 */
const BASTION_RDP_PORT = 3389;

function loadRdpOverride(k: string): string {
  try {
    return sessionStorage.getItem(RDP_OVERRIDE_PREFIX + k) ?? "";
  } catch {
    return "";
  }
}

function saveRdpOverride(k: string, url: string) {
  try {
    if (url.trim()) sessionStorage.setItem(RDP_OVERRIDE_PREFIX + k, url.trim());
    else sessionStorage.removeItem(RDP_OVERRIDE_PREFIX + k);
  } catch {
    /* ignore */
  }
}

const VCenterBastion: React.FC = () => {
  const { status: auth } = useAuth();
  const isAdmin = auth?.role === "admin";
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  /** Windows：网页 RDP（HTTPS 网关）| OpenSSH 终端 */
  const [winWorkTab, setWinWorkTab] = useState<"remote" | "ssh">("remote");
  const [openDirs, setOpenDirs] = useState<Record<string, boolean>>({});
  const [sftpOpen, setSftpOpen] = useState(false);
  const [sshSessions, setSshSessions] = useState<SshSession[]>([]);
  const [activeSshKey, setActiveSshKey] = useState<string | null>(null);
  const [rdpUrlDraft, setRdpUrlDraft] = useState("");
  const [cloudVmSheetId, setCloudVmSheetId] = useState<number | null>(null);
  const [redisSheetId, setRedisSheetId] = useState<number | null>(null);
  const [sshTermFontSize, setSshTermFontSize] = useState(() => readBastionSshFontSize());
  const [sshFontPresetId, setSshFontPresetId] = useState(() => readBastionSshFontPresetId());
  const [sshTermThemeId, setSshTermThemeId] = useState(() => readSshTerminalThemeId());
  /** 各 SSH 会话连接状态，供顶栏状态灯使用 */
  const [sshBridgeByKey, setSshBridgeByKey] = useState<
    Record<string, { status: BastionTerminalSessionStatus; errMsg: string | null }>
  >({});
  const searchInputRef = useRef<HTMLInputElement>(null);

  const sshFontFamilyCss = useMemo(
    () => BASTION_SSH_FONT_PRESETS.find((p) => p.id === sshFontPresetId)?.css ?? BASTION_SSH_FONT_PRESETS[0].css,
    [sshFontPresetId]
  );

  const persistSshFont = (size: number, preset: string) => {
    writeBastionSshFontPrefs(size, preset);
  };

  const persistTheme = (id: string) => {
    setSshTermThemeId(id);
    persistSshTerminalTheme(id);
  };

  const cfgQ = useAppConfig();
  const perm = cfgQ.data?.permissions;
  const showAppShortcuts = menuItemVisible(
    perm,
    "appcenter",
    auth?.role,
    moduleVisible(perm, "appcenter")
  );

  const cloudVmListQ = useQuery({
    queryKey: ["bastion-sidebar-cloud-vm"],
    queryFn: ({ signal }) => apiGetJson<{ instances: { id: number; name: string }[] }>("/api/app-center/cloud-vm/instances", { signal }),
    enabled: showAppShortcuts,
    staleTime: 60_000,
  });
  const redisListQ = useQuery({
    queryKey: ["bastion-sidebar-redis"],
    queryFn: ({ signal }) =>
      apiGetJson<{ instances: { id: number; name: string }[] }>("/api/app-center/redis/instances", { signal }),
    enabled: showAppShortcuts,
    staleTime: 60_000,
  });

  const vmsQ = useQuery({
    queryKey: ["vcenter-bastion-vms"],
    queryFn: ({ signal }) => apiGetJson<BastionVMListRes>("/api/vcenter/bastion/vms", { signal }),
    staleTime: 1000 * 60 * 15,
    gcTime: 1000 * 60 * 120,
    refetchOnWindowFocus: false,
    refetchInterval: (q) => (q.state.data?.folderPathPending ? 5000 : 1000 * 60 * 10),
  });

  const vms = vmsQ.data?.vms ?? EMPTY_VMS;
  const extraHosts = vmsQ.data?.extraHosts ?? EMPTY_EXTRAS;
  const folderPathPending = vmsQ.data?.folderPathPending === true;

  /** 选中 VM 的 QuickStats 轮询（每 20s，仅在选中 VM 时启用） */
  const selectedVmMoref = selectedKey?.startsWith("vm:") ? selectedKey.slice(3) : null;
  type QuickStatsRes = {
    moref: string;
    cpuUsageMHz?: number;
    cpuCapacityMHz?: number;
    cpuUsagePercent?: number;
    memoryUsageMB?: number;
    memoryMaxMB?: number;
    memoryUsagePercent?: number;
    uptimeSec?: number;
  };
  const quickStatsQ = useQuery({
    queryKey: ["vcenter-vm-quickstats", selectedVmMoref],
    queryFn: ({ signal }) => apiGetJson<QuickStatsRes>(`/api/vcenter/vms/${encodeURIComponent(selectedVmMoref!)}/quickstats`, { signal }),
    enabled: !!selectedVmMoref,
    refetchInterval: 20_000,
    staleTime: 15_000,
    gcTime: 60_000,
    refetchOnWindowFocus: false,
  });

  type NetPerfRes = { moref: string; samples: { ts: number; rxKBs: number; txKBs: number }[] };
  const netPerfQ = useQuery({
    queryKey: ["vcenter-vm-netperf", selectedVmMoref],
    queryFn: ({ signal }) => apiGetJson<NetPerfRes>(`/api/vcenter/vms/${encodeURIComponent(selectedVmMoref!)}/netperf`, { signal }),
    enabled: !!selectedVmMoref,
    refetchInterval: 20_000,
    staleTime: 15_000,
    gcTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const filteredVms = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return vms;
    return vms.filter(
      (v) =>
        v.name.toLowerCase().includes(s) ||
        v.moref.toLowerCase().includes(s) ||
        (v.ip && String(v.ip).toLowerCase().includes(s)) ||
        (v.folderPath && v.folderPath.toLowerCase().includes(s)) ||
        (v.manualGroup && v.manualGroup.toLowerCase().includes(s))
    );
  }, [vms, search]);

  const sidebarVms = useMemo(
    () => filteredVms.filter((v) => !bastionSidebarExcludeVmByFolder(v)),
    [filteredVms]
  );

  const filteredExtras = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return extraHosts;
    return extraHosts.filter(
      (h) =>
        h.name.toLowerCase().includes(s) ||
        h.id.toLowerCase().includes(s) ||
        h.address.toLowerCase().includes(s)
    );
  }, [extraHosts, search]);

  type VmSidebarGroup = { key: string; label: string; manual: boolean; list: VMRow[] };

  const vmGroups = useMemo((): VmSidebarGroup[] => {
    const m = new Map<string, VmSidebarGroup>();
    for (const v of sidebarVms) {
      const mg = v.manualGroup?.trim();
      if (mg) {
        const key = `manual:${mg}`;
        if (!m.has(key)) m.set(key, { key, label: mg, manual: true, list: [] });
        m.get(key)!.list.push(v);
      } else {
        const fp = v.folderPath?.trim() ? v.folderPath : "（未分组）";
        const key = `folder:${fp}`;
        if (!m.has(key)) m.set(key, { key, label: fp, manual: false, list: [] });
        m.get(key)!.list.push(v);
      }
    }
    return Array.from(m.values()).sort((a, b) => {
      if (a.manual !== b.manual) return a.manual ? -1 : 1;
      return a.label.localeCompare(b.label, "zh-CN");
    });
  }, [sidebarVms]);

  useEffect(() => {
    setOpenDirs((prev) => {
      let changed = false;
      const n = { ...prev };
      for (const g of vmGroups) {
        if (!(g.key in n)) {
          n[g.key] = true;
          changed = true;
        }
      }
      return changed ? n : prev;
    });
  }, [vmGroups]);

  const sel = parseSel(selectedKey);
  const selectedVmBase = sel?.kind === "vm" ? vms.find((v) => v.moref === sel.moref) ?? null : null;
  /** 将轮询到的 QuickStats 覆盖列表快照中的旧数据 */
  const selectedVm = useMemo(() => {
    if (!selectedVmBase) return null;
    const qs = quickStatsQ.data;
    if (!qs || qs.moref !== selectedVmBase.moref) return selectedVmBase;
    return {
      ...selectedVmBase,
      cpuUsageMHz: qs.cpuUsageMHz ?? selectedVmBase.cpuUsageMHz,
      cpuCapacityMHz: qs.cpuCapacityMHz ?? selectedVmBase.cpuCapacityMHz,
      cpuUsagePercent: qs.cpuUsagePercent ?? selectedVmBase.cpuUsagePercent,
      memoryUsageMB: qs.memoryUsageMB ?? selectedVmBase.memoryUsageMB,
      memoryMaxMB: qs.memoryMaxMB ?? selectedVmBase.memoryMaxMB,
      memoryUsagePercent: qs.memoryUsagePercent ?? selectedVmBase.memoryUsagePercent,
      uptimeSec: qs.uptimeSec ?? selectedVmBase.uptimeSec,
    };
  }, [selectedVmBase, quickStatsQ.data]);
  const selectedExtra = sel?.kind === "extra" ? extraHosts.find((h) => h.id === sel.id) ?? null : null;

  const isWin =
    selectedVm != null
      ? isWindowsGuest(selectedVm.guestId)
      : selectedExtra != null
        ? String(selectedExtra.kind).toLowerCase() === "windows"
        : false;

  useEffect(() => {
    if (selectedKey) setWinWorkTab("remote");
  }, [selectedKey]);

  const guestAddress =
    selectedVm?.ip && selectedVm.ip !== "—" ? selectedVm.ip.trim() : selectedExtra?.address?.trim() ?? "";
  const rdpUser = selectedExtra?.rdpUser;

  const policyRdpWeb =
    selectedVm?.rdpWebUrl?.trim() ||
    (selectedExtra?.rdpWebUrl && String(selectedExtra.rdpWebUrl).trim()) ||
    "";

  useEffect(() => {
    if (!selectedKey) {
      setRdpUrlDraft("");
      return;
    }
    setRdpUrlDraft(policyRdpWeb || loadRdpOverride(selectedKey));
  }, [selectedKey, policyRdpWeb]);

  const effectiveRdpWebUrl = (rdpUrlDraft || policyRdpWeb).trim();

  const sftpTarget =
    sel?.kind === "vm"
      ? ({ kind: "vm" as const, moref: sel.moref })
      : sel?.kind === "extra"
        ? ({ kind: "extra" as const, id: sel.id })
        : null;

  const addOrFocusSshSession = useCallback(
    (key: string, label: string) => {
      setSshSessions((prev) => {
        if (prev.some((s) => s.key === key)) return prev;
        return [...prev, { key, label }];
      });
      setActiveSshKey(key);
    },
    []
  );

  const closeSshSession = useCallback(
    (key: string) => {
      setSshSessions((prev) => {
        const next = prev.filter((s) => s.key !== key);
        if (activeSshKey === key) {
          const idx = prev.findIndex((s) => s.key === key);
          const fallback = next[Math.max(0, idx - 1)] ?? next[0] ?? null;
          setActiveSshKey(fallback?.key ?? null);
          if (fallback) setSelectedKey(fallback.key);
          else if (selectedKey === key) setSelectedKey(null);
        }
        return next;
      });
    },
    [activeSshKey, selectedKey]
  );

  useEffect(() => {
    if (!selectedKey || !sel) return;
    const label =
      sel.kind === "vm"
        ? vms.find((v) => v.moref === sel.moref)?.name ?? sel.moref
        : extraHosts.find((h) => h.id === sel.id)?.name ?? sel.id;
    addOrFocusSshSession(selectedKey, label);
  }, [selectedKey, sel, vms, extraHosts, addOrFocusSshSession]);

  const onSidebarPick = (key: string) => {
    setSelectedKey(key);
    const p = parseSel(key);
    if (!p) return;
    const label =
      p.kind === "vm"
        ? vms.find((v) => v.moref === p.moref)?.name ?? p.moref
        : extraHosts.find((h) => h.id === p.id)?.name ?? p.id;
    addOrFocusSshSession(key, label);
  };

  const onSshTabClick = (key: string) => {
    setActiveSshKey(key);
    setSelectedKey(key);
  };

  return (
    <div className="flex h-full min-h-0 w-full max-w-none flex-col overflow-hidden bg-[#141414] text-[#ffffff]">
      <header className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-[#1f1f1f] bg-black px-3">
        <div className="flex min-w-0 items-center gap-2">
          <SquareTerminal className="size-4 shrink-0 text-[#1890ff]" aria-hidden />
          <div className="min-w-0">
            <h1 className="truncate text-xs font-semibold tracking-wide text-[#ffffff]">主机与终端</h1>
            <p className="truncate text-[10px] text-[#8c8c8c]">vCenter · JumpServer RDP · SSH</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-[#8c8c8c] hover:bg-[#1f1f1f] hover:text-[#ffffff]"
            asChild
          >
            <Link to="/" title="工作台">
              <Home className="size-4" />
            </Link>
          </Button>
          <button
            type="button"
            className="rounded-md p-2 text-[#8c8c8c] hover:bg-[#1f1f1f] hover:text-[#ffffff]"
            title="聚焦左侧搜索"
            onClick={() => {
              searchInputRef.current?.focus();
              searchInputRef.current?.select();
            }}
          >
            <Search className="size-4" />
          </button>
          {isAdmin ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-[#8c8c8c] hover:bg-[#1f1f1f] hover:text-[#ffffff]"
              asChild
            >
              <Link to={`${BASTION_ROUTE_BASE}/admin`} title="配置与分组">
                <Settings className="size-4" />
              </Link>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-[10px] text-[#8c8c8c] hover:bg-[#1f1f1f] hover:text-[#69c0ff]"
            asChild
          >
            <Link to="/cluster/vcenter/settings">SSH</Link>
          </Button>
          {selectedVm ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-[10px] text-[#8c8c8c] hover:bg-[#1f1f1f] hover:text-[#69c0ff]"
              asChild
            >
              <Link to={`/cluster/vcenter/${encodeURIComponent(selectedVm.moref)}`}>详情</Link>
            </Button>
          ) : null}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <aside className="flex w-full shrink-0 flex-col overflow-hidden border-[#3c3c3c] bg-[#252526] lg:w-[260px] lg:border-r xl:w-[272px]">
          <div className="shrink-0 border-b border-[#3c3c3c] p-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#6e7681]"
                aria-hidden
              />
              <Input
                ref={searchInputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索资产…"
                className="h-8 border-[#3c3c3c] bg-[#1e1e1e] pl-8 text-[13px] text-[#e6edf3] placeholder:text-[#6e7681] focus-visible:ring-[#1890ff]/40"
              />
            </div>
          </div>

          <div className="bastion-asset-sidebar-scroll min-h-0 flex-1">
            {filteredExtras.length > 0 ? (
              <div className="border-b border-[#3c3c3c]/80">
                <p className="px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-[#6e7681]">
                  额外主机
                </p>
                <ul className="space-y-px px-1 pb-2">
                  {filteredExtras.map((h) => {
                    const k = `extra:${h.id}`;
                    const active = selectedKey === k;
                    return (
                      <li key={h.id}>
                        <button
                          type="button"
                          onClick={() => onSidebarPick(k)}
                          className={cn(
                            "group flex w-full items-start gap-2 border-l-2 border-l-violet-400/35 py-1.5 pl-2 pr-1.5 text-left transition-colors",
                            active
                              ? "border-[#1890ff] bg-[#2a2d2e]"
                              : "hover:bg-violet-500/[0.07]",
                          )}
                        >
                          <HardDrive
                            className="mt-0.5 size-3.5 shrink-0 text-[#a78bfa] group-hover:text-[#c4b5fd]"
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-start justify-between gap-2">
                              <span className="truncate text-[13px] font-medium leading-snug text-[#e6edf3]">
                                {h.name || h.id}
                              </span>
                              <BastionOsBadge extraKind={h.kind} />
                            </span>
                            <span className="mt-0.5 block truncate font-mono text-[11px] leading-tight text-[#8c8c8c]">
                              {h.address}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {showAppShortcuts &&
            ((redisListQ.data?.instances?.length ?? 0) > 0 ||
              (cloudVmListQ.data?.instances?.length ?? 0) > 0) ? (
              <div className="border-b border-[#3c3c3c]/80">
                <p className="px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-[#6e7681]">
                  应用中心
                </p>
                <ul className="space-y-px px-1 pb-2">
                  {(cloudVmListQ.data?.instances ?? []).map((r) => (
                    <li key={`cv-${r.id}`}>
                      <button
                        type="button"
                        onClick={() => setCloudVmSheetId(r.id)}
                        className="group flex w-full items-start gap-2 border-l-2 border-transparent py-1.5 pl-2 pr-1.5 text-left transition-colors hover:bg-[#2d3032]"
                      >
                        <HardDrive
                          className="mt-0.5 size-3.5 shrink-0 text-[#3fb950]/85"
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-2">
                            <span className="truncate text-[13px] font-medium leading-snug text-[#e6edf3]">
                              {r.name || `云主机 #${r.id}`}
                            </span>
                            <BastionSidebarServiceChip className="bg-[#238636]/22 text-[#7ee787]">
                              SSH
                            </BastionSidebarServiceChip>
                          </span>
                          <span className="mt-0.5 block truncate font-mono text-[11px] text-[#8c8c8c]">
                            应用中心
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                  {(redisListQ.data?.instances ?? []).map((r) => (
                    <li key={`redis-${r.id}`}>
                      <button
                        type="button"
                        onClick={() => setRedisSheetId(r.id)}
                        className="group flex w-full items-start gap-2 border-l-2 border-transparent py-1.5 pl-2 pr-1.5 text-left transition-colors hover:bg-[#2d3032]"
                      >
                        <Database
                          className="mt-0.5 size-3.5 shrink-0 text-[#f85149]/85"
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-2">
                            <span className="truncate text-[13px] font-medium leading-snug text-[#e6edf3]">
                              {r.name || `Redis #${r.id}`}
                            </span>
                            <BastionSidebarServiceChip className="bg-[#f85149]/18 text-[#ff7b72]">
                              CLI
                            </BastionSidebarServiceChip>
                          </span>
                          <span className="mt-0.5 block truncate font-mono text-[11px] text-[#8c8c8c]">
                            redis-cli
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {vmsQ.isLoading && (
              <p className="px-3 py-2.5 text-[13px] text-[#8c8c8c]">加载中（列表可缓存较久）…</p>
            )}
            {!vmsQ.isLoading && folderPathPending && (
              <p className="px-3 py-2 text-[12px] text-[#8c8c8c]">
                目录分组正在后台补齐，列表已先行展示；数秒后会自动刷新为完整分组。
              </p>
            )}
            {vmsQ.isError && (
              <p className="px-3 py-2.5 text-[13px] text-[#f85149]">{(vmsQ.error as Error).message}</p>
            )}

            {!vmsQ.isLoading && vmGroups.length === 0 && filteredExtras.length === 0 ? (
              <p className="px-3 py-2.5 text-[13px] text-[#8c8c8c]">无可用目标</p>
            ) : null}

            <div className="px-1 pb-2 pt-1">
              {vmGroups.map((grp) => {
                const gAccent = bastionGroupAccent(grp.key);
                return (
                <Collapsible
                  key={grp.key}
                  open={openDirs[grp.key] !== false}
                  onOpenChange={(o) => setOpenDirs((d) => ({ ...d, [grp.key]: o }))}
                >
                  <CollapsibleTrigger
                    className={cn(
                      "mb-0.5 flex w-full cursor-pointer select-none items-center gap-1 rounded-sm border-l-2 py-1 pl-1.5 pr-2 text-left text-[12px] text-[#d4d4d4]",
                      gAccent.border,
                      gAccent.headerBg,
                    )}
                  >
                    <ChevronRight
                      className={cn(
                        "size-3.5 shrink-0 transition-transform",
                        gAccent.chevron,
                        openDirs[grp.key] !== false && "rotate-90",
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate">{grp.label}</span>
                    {grp.manual ? (
                      <span className="shrink-0 rounded bg-[#1890ff]/22 px-1 py-px text-[9px] font-semibold text-[#7dd3fc]">
                        手动
                      </span>
                    ) : null}
                    <span
                      className={cn(
                        "shrink-0 tabular-nums text-[11px] opacity-90",
                        gAccent.chevron,
                      )}
                    >
                      {grp.list.length}
                    </span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <ul className="space-y-px py-0.5 pl-0.5">
                      {grp.list.map((vm) => {
                        const k = `vm:${vm.moref}`;
                        const active = selectedKey === k;
                        const line2 = vm.ip?.trim() || vm.moref;
                        return (
                          <li key={vm.moref}>
                            <button
                              type="button"
                              onClick={() => onSidebarPick(k)}
                              title={`${vm.name} · ${vm.guestId ?? ""} · ${vm.moref}`}
                              className={cn(
                                "group flex w-full items-start gap-2 border-l-2 py-1.5 pl-2 pr-1.5 text-left transition-colors",
                                active
                                  ? "border-[#1890ff] bg-[#2a2d2e]"
                                  : cn(gAccent.rowIdleBorder, gAccent.rowHoverBg),
                              )}
                            >
                              <span className="min-w-0 flex-1">
                                <span className="flex items-start justify-between gap-2">
                                  <span className="truncate text-[13px] font-medium leading-snug text-[#e6edf3]">
                                    {vm.name}
                                  </span>
                                  <BastionOsBadge guestId={vm.guestId} />
                                </span>
                                <span className="mt-0.5 block truncate font-mono text-[11px] leading-tight text-[#8c8c8c]">
                                  {line2}
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </CollapsibleContent>
                </Collapsible>
              );
              })}
            </div>
          </div>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#1e1e1e]">
          {!sel ? (
            <div className="flex flex-1 flex-col items-center justify-center text-[#858585]">
              <Monitor className="mb-2 size-10 opacity-35" />
              <p className="text-sm">请从左侧选择资产</p>
            </div>
          ) : (
            <>
              <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[#303030] bg-[#252526] px-2 py-1.5">
                <span className="truncate text-[13px] font-medium text-[#e8e8e8]">
                  {selectedVm?.name ?? selectedExtra?.name ?? selectedExtra?.id}
                </span>
                <span className="font-mono text-[10px] text-[#858585]">
                  {sel.kind === "vm" ? sel.moref : `extra:${sel.id}`}
                </span>
                <div className="ml-auto flex flex-wrap items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 border-[#3c3c3c] bg-[#1e1e1e] px-2 text-xs text-[#cccccc] hover:bg-[#2d2d2d]"
                    onClick={() => setSftpOpen(true)}
                  >
                    SFTP
                  </Button>
                  {isWin ? (
                    <div className="flex rounded border border-[#3c3c3c] bg-[#1e1e1e] p-0.5">
                      <button
                        type="button"
                        onClick={() => setWinWorkTab("remote")}
                        className={`rounded px-2 py-0.5 text-[11px] ${
                          winWorkTab === "remote" ? "bg-[#1890ff]/35 text-[#e8e8e8]" : "text-[#858585]"
                        }`}
                      >
                        JumpServer RDP
                      </button>
                      <button
                        type="button"
                        onClick={() => setWinWorkTab("ssh")}
                        className={`rounded px-2 py-0.5 text-[11px] ${
                          winWorkTab === "ssh" ? "bg-[#1890ff]/35 text-[#e8e8e8]" : "text-[#858585]"
                        }`}
                      >
                        SSH 终端
                      </button>
                    </div>
                  ) : null}
                  {isWin && winWorkTab === "remote" && effectiveRdpWebUrl ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 border-[#3c3c3c] bg-[#1e1e1e] px-2 text-xs text-[#cccccc] hover:bg-[#2d2d2d]"
                      onClick={() => window.open(effectiveRdpWebUrl, "_blank", "noopener,noreferrer")}
                      title="主区域已内嵌；若嵌入被拦截可点此"
                    >
                      <ExternalLink className="mr-1 size-3" />
                      新标签打开
                    </Button>
                  ) : null}
                </div>
              </div>

              {sshSessions.length > 0 && (!isWin || winWorkTab === "ssh") ? (
                <div className="flex min-h-0 shrink-0 items-end gap-0 border-b border-[#303030] bg-[#252526] px-1 pt-1">
                  {sshSessions.map((s) => {
                    const active = activeSshKey === s.key;
                    const st = sshBridgeByKey[s.key]?.status ?? "idle";
                    return (
                      <div
                        key={s.key}
                        className={`mb-[-1px] flex max-w-[min(260px,44vw)] min-w-0 items-stretch rounded-t border border-b-0 text-[13px] ${
                          active
                            ? "z-[1] border-[#303030] bg-[#1e1e1e] text-[#e8e8e8]"
                            : "border-transparent text-[#969696] hover:border-[#303030]/70 hover:bg-[#2a2d2e]"
                        }`}
                      >
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left"
                          onClick={() => onSshTabClick(s.key)}
                          title={s.label}
                        >
                          <span
                            className={`size-1.5 shrink-0 rounded-full ${bastionTabStatusDotClass(st)}`}
                            aria-hidden
                          />
                          <span className="min-w-0 truncate">{s.label}</span>
                        </button>
                        <button
                          type="button"
                          className={`shrink-0 px-1.5 py-2 text-[#858585] hover:bg-[#ffffff0d] hover:text-[#f85149] ${
                            active ? "" : ""
                          }`}
                          aria-label="关闭会话"
                          onClick={(e) => {
                            e.stopPropagation();
                            closeSshSession(s.key);
                          }}
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {sshSessions.length > 0 && (!isWin || winWorkTab === "ssh") ? (
                <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[#303030] bg-[#1e1e1e] px-2 py-1.5">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-[#858585]">终端</span>
                  <div className="flex items-center gap-1.5">
                    <Label className="whitespace-nowrap text-[10px] text-[#858585]">字号</Label>
                    <Select
                      value={String(sshTermFontSize)}
                      onValueChange={(v) => {
                        const n = Number.parseInt(v, 10);
                        if (!Number.isFinite(n)) return;
                        setSshTermFontSize(n);
                        persistSshFont(n, sshFontPresetId);
                      }}
                    >
                      <SelectTrigger className="h-7 w-[72px] border-[#3c3c3c] bg-[#252526] text-xs text-[#e8e8e8]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-[#3c3c3c] bg-[#252526] text-[#e8e8e8]">
                        {[10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24].map((n) => (
                          <SelectItem key={n} value={String(n)} className="text-xs">
                            {n}px
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:max-w-[280px]">
                    <Label className="shrink-0 whitespace-nowrap text-[10px] text-[#858585]">字体</Label>
                    <Select
                      value={sshFontPresetId}
                      onValueChange={(id) => {
                        setSshFontPresetId(id);
                        persistSshFont(sshTermFontSize, id);
                      }}
                    >
                      <SelectTrigger className="h-7 min-w-0 flex-1 border-[#3c3c3c] bg-[#252526] text-xs text-[#e8e8e8]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-[#3c3c3c] bg-[#252526] text-[#e8e8e8]">
                        {BASTION_SSH_FONT_PRESETS.map((p) => (
                          <SelectItem key={p.id} value={p.id} className="text-xs">
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex w-full min-w-0 flex-col gap-1 sm:max-w-[320px] sm:flex-1">
                    <div className="flex items-center gap-1.5">
                      <Label className="shrink-0 whitespace-nowrap text-[10px] text-[#858585]">配色</Label>
                      <Select
                        value={sshTermThemeId}
                        onValueChange={(id) => persistTheme(id)}
                      >
                        <SelectTrigger className="h-7 min-w-0 flex-1 border-[#3c3c3c] bg-[#252526] text-xs text-[#e8e8e8]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="border-[#3c3c3c] bg-[#252526] text-[#e8e8e8]">
                          {SSH_TERM_PRESETS.map((p) => (
                            <SelectItem key={p.id} value={p.id} className="text-xs">
                              {p.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <p className="w-full text-[10px] leading-snug text-[#6e7681] sm:w-auto sm:pl-1">
                    字体与配色仅存本机；变更后当前 SSH 会重连。
                  </p>
                </div>
              ) : null}

              <div className="min-h-0 flex-1 overflow-hidden p-0">
                {!isWin || winWorkTab === "ssh" ? (
                  <div className="relative h-full min-h-0">
                    {sshSessions.map((s) => {
                      const p = parseSel(s.key);
                      if (!p) return null;
                      const vm = p.kind === "vm" ? vms.find((v) => v.moref === p.moref) : null;
                      const ex = p.kind === "extra" ? extraHosts.find((h) => h.id === p.id) : null;
                      const hint = vm?.ip && vm.ip !== "—" ? vm.ip : ex?.address;
                      const visible = activeSshKey === s.key;
                      return (
                        <div
                          key={s.key}
                          className={visible ? "flex h-full min-h-0 flex-col" : "hidden"}
                          aria-hidden={!visible}
                        >
                          <BastionTerminalChrome
                            className="h-full rounded-none border-0"
                            variant="workbench"
                            title={s.label}
                            subtitle={hint && hint !== "—" ? hint : undefined}
                            protocol="SSH"
                            status={sshBridgeByKey[s.key]?.status ?? "idle"}
                            errMsg={sshBridgeByKey[s.key]?.errMsg ?? null}
                          >
                            <VCenterSshTerminal
                              key={`${s.key}-f${sshTermFontSize}-${sshFontPresetId}-${sshTermThemeId}`}
                              moref={p.kind === "vm" ? p.moref : undefined}
                              bastionExtraId={p.kind === "extra" ? p.id : undefined}
                              guestIpHint={hint}
                              autoConnect
                              showOuterChrome={false}
                              visible={visible}
                              fontSizeOverride={sshTermFontSize}
                              fontFamilyOverride={sshFontFamilyCss}
                              onBridgeStatus={(st) => {
                                setSshBridgeByKey((prev) => ({ ...prev, [s.key]: st }));
                              }}
                              hostClassName="vc-ssh-xterm-host h-full min-h-0 w-full flex-1 overflow-hidden bg-[#0c0c0c] px-1.5 pb-1.5 pt-1.5"
                            />
                          </BastionTerminalChrome>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                {isWin && winWorkTab === "remote" && selectedKey ? (
                  <div className="flex h-full min-h-0 flex-col gap-3 rounded-lg border border-slate-800 bg-[#0a0d12] p-4">
                    <div className="shrink-0 space-y-2">
                      <Label className="text-xs text-slate-400">JumpServer Windows RDP（HTTPS 内嵌地址）</Label>
                      <p className="text-[11px] leading-relaxed text-slate-500">
                        在 JumpServer 中为每台 Windows 资产复制「Web 终端 / RDP」的 HTTPS 链接，到{" "}
                        <Link
                          className="text-sky-400 underline underline-offset-2 hover:text-sky-300"
                          to={`${BASTION_ROUTE_BASE}/admin`}
                        >
                          堡垒机配置
                        </Link>{" "}
                        →「Windows 虚拟机 · JumpServer RDP」里按虚拟机 <span className="font-mono text-slate-400">moRef</span>{" "}
                        绑定（例如两台 Windows 就填两行）。此处亦可临时粘贴同一链接；点「记住」仅保存在本浏览器。
                      </p>
                      {rdpUser ? (
                        <p className="text-[11px] text-slate-500">
                          RDP 用户名提示：<span className="font-mono text-slate-400">{rdpUser}</span>
                        </p>
                      ) : null}
                      <p className="text-[11px] text-slate-600">
                        直连 RDP 端口参考{" "}
                        <span className="font-mono text-slate-500">
                          {guestAddress || "—"}:{BASTION_RDP_PORT}
                        </span>
                        （JumpServer 内登录后使用 Web RDP，无需在本页配置直连密码）。
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Input
                          value={rdpUrlDraft}
                          onChange={(e) => setRdpUrlDraft(e.target.value)}
                          placeholder="https://jump.example.com/luna/...  （JumpServer RDP Web Client）"
                          className="min-w-[200px] flex-1 border-slate-700 bg-[#080a0e] font-mono text-xs text-slate-200"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-9"
                          onClick={() => {
                            if (selectedKey) saveRdpOverride(selectedKey, rdpUrlDraft);
                            toast.success("已记住此地址（仅本浏览器）");
                          }}
                        >
                          记住
                        </Button>
                      </div>
                    </div>
                    {effectiveRdpWebUrl ? (
                      <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-slate-800 bg-black">
                        <iframe
                          title="JumpServer RDP Web"
                          className="h-full min-h-[320px] w-full border-0"
                          src={effectiveRdpWebUrl}
                          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-downloads"
                          referrerPolicy="no-referrer-when-downgrade"
                          allow="clipboard-read; clipboard-write; fullscreen"
                        />
                      </div>
                    ) : (
                      <div className="flex min-h-[200px] flex-1 flex-col items-center justify-center rounded-md border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">
                        <p>
                          尚未绑定 JumpServer RDP 地址。请管理员在「堡垒机配置」中为该虚拟机的{" "}
                          <span className="font-mono text-slate-500">moRef</span> 填写 HTTPS 链接，或在上文临时粘贴后点「记住」。
                        </p>
                      </div>
                    )}
                    <p className="shrink-0 text-[11px] leading-relaxed text-slate-600">
                      若页面空白，多为 JumpServer 返回了{" "}
                      <span className="font-mono text-slate-500">X-Frame-Options</span> /{" "}
                      <span className="font-mono text-slate-500">CSP</span>
                      拒绝嵌入，请使用顶栏「新标签打开」在独立标签登录 JumpServer。
                    </p>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </main>
        <BastionHostInsightPanel
          className="hidden min-h-0 xl:flex"
          vm={selectedVm}
          extra={selectedExtra}
          quickStatsUpdatedAt={quickStatsQ.dataUpdatedAt || undefined}
          netSamples={netPerfQ.data?.samples}
        />
      </div>

      <Dialog open={sftpOpen} onOpenChange={setSftpOpen}>
        <DialogContent className="max-h-[90vh] max-w-[min(96vw,720px)] overflow-hidden border-slate-800 bg-[#0f1419] text-slate-200">
          <DialogHeader>
            <DialogTitle>SFTP</DialogTitle>
          </DialogHeader>
          {sftpTarget ? (
            <div className="h-[min(70vh,520px)] min-h-[300px]">
              <VCenterBastionSftpPanel key={selectedKey ?? ""} target={sftpTarget} />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {cloudVmSheetId != null ? (
        <CloudVmSshTerminalSheet
          instanceId={cloudVmSheetId}
          open
          onOpenChange={(o) => {
            if (!o) setCloudVmSheetId(null);
          }}
        />
      ) : null}
      {redisSheetId != null ? (
        <RedisCliTerminalSheet
          instanceId={redisSheetId}
          open
          onOpenChange={(o) => {
            if (!o) setRedisSheetId(null);
          }}
        />
      ) : null}
    </div>
  );
};

export default VCenterBastion;

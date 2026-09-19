import React, { useMemo, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Activity, HardDrive, Network, Server } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { BastionOsBadge } from "@/lib/bastionGuestOs";

/** 与堡垒机 /api/vcenter/bastion/vms 中虚拟机条目对齐的可选字段 */
export type BastionInsightVm = {
  moref: string;
  name: string;
  powerState?: string;
  guestId?: string;
  ip?: string;
  cpu?: number;
  memoryMB?: number;
  cpuUsageMHz?: number;
  cpuCapacityMHz?: number;
  cpuUsagePercent?: number;
  memoryUsagePercent?: number;
  memoryUsageMB?: number;
  memoryMaxMB?: number;
  uptimeSec?: number;
};

export type BastionInsightExtra = {
  id: string;
  name: string;
  address: string;
  kind?: string;
};

const NT = {
  blue: "#1890ff",
  green: "#52c41a",
  red: "#f5222d",
  text: "#ffffff",
  muted: "#8c8c8c",
  border: "#303030",
} as const;

function formatUptime(sec: number | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return "—";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d} 天 ${h} 小时`;
  if (h > 0) return `${h} 小时 ${m} 分`;
  return `${m} 分钟`;
}

function formatGiBFromMB(mb: number | undefined): string {
  if (mb == null || !Number.isFinite(mb) || mb < 0) return "—";
  return `${(mb / 1024).toFixed(2)} GiB`;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 border-b border-[#303030] pb-1 text-xs font-semibold text-[#ffffff]">{children}</h3>
  );
}

function LoadBox({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-md px-2 py-1.5 text-center"
      style={{ backgroundColor: `${NT.blue}22`, border: `1px solid ${NT.blue}44` }}
    >
      <div className="text-[9px] uppercase tracking-wide text-[#8c8c8c]">{label}</div>
      <div className="font-mono text-xs font-medium text-[#ffffff]">{value}</div>
    </div>
  );
}

function CoreBars({ cores, usagePct }: { cores: number; usagePct: number }) {
  const n = Math.min(32, Math.max(1, Math.round(cores || 1)));
  const p = Math.min(100, Math.max(0, usagePct));
  return (
    <div className="flex h-16 items-end gap-0.5">
      {Array.from({ length: n }, (_, i) => (
        <div
          key={i}
          className="min-w-0 flex-1 rounded-t bg-[#303030]"
          title={`vCPU ${i + 1} · 汇总利用率 ${p.toFixed(0)}%`}
        >
          <div
            className="w-full rounded-t transition-all"
            style={{
              height: `${p}%`,
              minHeight: p > 0 ? "4px" : 0,
              backgroundColor: NT.blue,
            }}
          />
        </div>
      ))}
    </div>
  );
}

function MemoryRing({ usedPct }: { usedPct: number }) {
  const p = Math.min(100, Math.max(0, usedPct));
  const free = 100 - p;
  return (
    <div className="flex items-center gap-3">
      <div
        className="relative size-[88px] shrink-0 rounded-full"
        style={{
          background: `conic-gradient(${NT.red} 0% ${p}%, ${NT.green} ${p}% 100%)`,
        }}
      >
        <div className="absolute inset-[14px] flex flex-col items-center justify-center rounded-full bg-[#1c1c1c] text-center">
          <span className="text-sm font-semibold text-[#ffffff]">{p.toFixed(0)}%</span>
          <span className="text-[9px] text-[#8c8c8c]">已用</span>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-1 text-[11px]">
        <div className="flex items-center gap-2">
          <span className="inline-block size-2 rounded-full" style={{ backgroundColor: NT.red }} />
          <span className="text-[#8c8c8c]">已用</span>
          <span className="font-mono text-[#ffffff]">{p.toFixed(1)}%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block size-2 rounded-full" style={{ backgroundColor: NT.green }} />
          <span className="text-[#8c8c8c]">空闲</span>
          <span className="font-mono text-[#ffffff]">{free.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
}

function DiskBarRow({ label, pct }: { label: string; pct: number | null }) {
  const p = pct == null || !Number.isFinite(pct) ? null : Math.min(100, Math.max(0, pct));
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px] text-[#8c8c8c]">
        <span className="truncate pr-2">{label}</span>
        <span className="shrink-0 font-mono text-[#ffffff]">{p != null ? `${p.toFixed(0)}%` : "—"}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#303030]">
        {p != null ? (
          <div className="h-full rounded-full transition-all" style={{ width: `${p}%`, backgroundColor: NT.blue }} />
        ) : null}
      </div>
    </div>
  );
}

export type NetPerfSample = {
  ts: number;    // Unix 秒
  rxKBs: number; // KBps
  txKBs: number; // KBps
};

export type BastionHostInsightPanelProps = {
  vm: BastionInsightVm | null;
  extra: BastionInsightExtra | null;
  /** QuickStats 最后一次成功更新的时间戳（ms），用于显示刷新时间 */
  quickStatsUpdatedAt?: number;
  /** 网络收发趋势（来自 /api/vcenter/vms/:moref/netperf） */
  netSamples?: NetPerfSample[];
  className?: string;
};

/**
 * 右侧「主机概览」：vCenter 虚拟机使用列表中的 QuickStats；与 Guest 内 top/htop 的 loadavg 不同，不伪造 load 数值。
 */
const BastionHostInsightPanel: React.FC<BastionHostInsightPanelProps> = ({ vm, extra, quickStatsUpdatedAt, netSamples, className }) => {
  /** 将毫秒时间戳格式化为 HH:mm:ss */
  const [updatedLabel, setUpdatedLabel] = useState<string | null>(null);
  useEffect(() => {
    if (!quickStatsUpdatedAt) { setUpdatedLabel(null); return; }
    const fmt = () => {
      const d = new Date(quickStatsUpdatedAt);
      setUpdatedLabel(
        `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`
      );
    };
    fmt();
  }, [quickStatsUpdatedAt]);

  const body = useMemo(() => {
    if (vm) {
      const cpuPct = vm.cpuUsagePercent ?? 0;
      const memPct = vm.memoryUsagePercent ?? 0;
      const cores = vm.cpu ?? 1;
      return (
        <div className="space-y-4 px-3 py-3">
          <div>
            <SectionTitle>系统</SectionTitle>
            <dl className="space-y-1.5 text-[11px]">
              <div className="flex justify-between gap-2">
                <dt className="text-[#8c8c8c]">主机名</dt>
                <dd className="truncate text-right font-medium text-[#ffffff]">{vm.name}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[#8c8c8c]">运行时间</dt>
                <dd className="text-right text-[#ffffff]">{formatUptime(vm.uptimeSec)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="shrink-0 text-[#8c8c8c]">系统</dt>
                <dd className="flex min-w-0 flex-col items-end gap-1.5 text-right">
                  <BastionOsBadge guestId={vm.guestId} className="max-w-[min(200px,72vw)]" />
                  {vm.guestId?.trim() ? (
                    <span
                      className="break-all text-right font-mono text-[9px] leading-snug text-[#6e7681]"
                      title={vm.guestId}
                    >
                      {vm.guestId}
                    </span>
                  ) : (
                    <span className="text-[10px] text-[#6e7681]">—</span>
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[#8c8c8c]">电源</dt>
                <dd className="text-right text-[#ffffff]">{vm.powerState ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[#8c8c8c]">IP</dt>
                <dd className="font-mono text-right text-[10px] text-[#ffffff]">{vm.ip && vm.ip !== "—" ? vm.ip : "—"}</dd>
              </div>
            </dl>
          </div>

          <div>
            <SectionTitle>资源快照</SectionTitle>
            <div className="grid grid-cols-3 gap-1.5">
              <LoadBox
                label="CPU"
                value={typeof vm.cpuUsagePercent === "number" ? `${vm.cpuUsagePercent.toFixed(1)}%` : "—"}
              />
              <LoadBox
                label="内存"
                value={typeof vm.memoryUsagePercent === "number" ? `${vm.memoryUsagePercent.toFixed(1)}%` : "—"}
              />
              <LoadBox
                label="vCPU"
                value={typeof vm.cpu === "number" && vm.cpu > 0 ? `${vm.cpu} 核` : "—"}
              />
            </div>
          </div>

          <div>
            <SectionTitle>CPU</SectionTitle>
            <p className="mb-1 text-[10px] text-[#8c8c8c]">
              {cores} vCPU · 柱状高度均为汇总利用率（非单核）
            </p>
            <CoreBars cores={cores} usagePct={cpuPct} />
          </div>

          <div>
            <SectionTitle>内存</SectionTitle>
            <MemoryRing usedPct={memPct} />
            <p className="mt-2 font-mono text-[11px] text-[#ffffff]">
              {formatGiBFromMB(vm.memoryUsageMB)} / {formatGiBFromMB(vm.memoryMaxMB ?? vm.memoryMB)}
            </p>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-1 border-b border-[#303030] pb-1">
              <Network className="size-3.5 text-[#8c8c8c]" />
              <h3 className="text-xs font-semibold text-[#ffffff]">网络</h3>
              {netSamples && netSamples.length > 0 && (() => {
                const last = netSamples[netSamples.length - 1];
                return (
                  <span className="ml-auto shrink-0 font-mono text-[9px] text-[#595959]">
                    ↓{last.rxKBs >= 1024 ? `${(last.rxKBs / 1024).toFixed(1)}M` : `${last.rxKBs.toFixed(0)}K`}
                    {" "}↑{last.txKBs >= 1024 ? `${(last.txKBs / 1024).toFixed(1)}M` : `${last.txKBs.toFixed(0)}K`}
                  </span>
                );
              })()}
            </div>
            {netSamples && netSamples.length > 1 ? (
              <div className="space-y-1">
                <div className="flex gap-3 text-[10px] text-[#8c8c8c]">
                  <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-full bg-[#1890ff]" />收</span>
                  <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-full bg-[#52c41a]" />发</span>
                  <span className="ml-auto">KBps · vCenter 20s 采样</span>
                </div>
                <ResponsiveContainer width="100%" height={80}>
                  <AreaChart data={netSamples} margin={{ top: 2, right: 2, left: -28, bottom: 0 }}>
                    <defs>
                      <linearGradient id="ngRx" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#1890ff" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#1890ff" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="ngTx" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#52c41a" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#52c41a" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="ts" hide />
                    <YAxis tick={{ fill: "#595959", fontSize: 9 }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ background: "#1f1f1f", border: "1px solid #303030", borderRadius: 6, fontSize: 11 }}
                      labelStyle={{ display: "none" }}
                      itemStyle={{ color: "#e8e8e8" }}
                      formatter={(v: number, name: string) => [
                        v >= 1024 ? `${(v / 1024).toFixed(2)} MBps` : `${v.toFixed(0)} KBps`,
                        name === "rxKBs" ? "收" : "发",
                      ]}
                    />
                    <Area type="monotone" dataKey="rxKBs" stroke="#1890ff" strokeWidth={1.5} fill="url(#ngRx)" dot={false} isAnimationActive={false} />
                    <Area type="monotone" dataKey="txKBs" stroke="#52c41a" strokeWidth={1.5} fill="url(#ngTx)" dot={false} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-[10px] leading-relaxed text-[#8c8c8c]">
                {netSamples ? "暂无性能数据（VM 可能未开机或 vCenter 实时计数器不可用）" : "加载中…"}
              </p>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center gap-1 border-b border-[#303030] pb-1">
              <HardDrive className="size-3.5 text-[#8c8c8c]" />
              <h3 className="text-xs font-semibold text-[#ffffff]">磁盘</h3>
            </div>
            <div className="space-y-3">
              <DiskBarRow label="内存压力（vCenter 内存利用率示意）" pct={memPct} />
              <p className="text-[10px] text-[#8c8c8c]">各挂载点用量请在虚拟机详情或存储视图中查看。</p>
            </div>
          </div>

          <Link
            to={`/cluster/vcenter/${encodeURIComponent(vm.moref)}`}
            className="block rounded-md border border-[#1890ff]/40 bg-[#1890ff]/10 py-2 text-center text-xs font-medium text-[#69c0ff] hover:bg-[#1890ff]/18"
          >
            打开虚拟机详情与性能
          </Link>
        </div>
      );
    }
    if (extra) {
      return (
        <div className="space-y-3 px-3 py-3 text-[11px]">
          <SectionTitle>额外主机</SectionTitle>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="min-w-0 flex-1 text-[#ffffff]">{extra.name}</p>
            <BastionOsBadge extraKind={extra.kind} className="shrink-0" />
          </div>
          <p className="font-mono text-[10px] text-[#8c8c8c]">{extra.address}</p>
          <p className="leading-relaxed text-[#8c8c8c]">
            无 vCenter QuickStats。CPU/内存/磁盘等实时面板需在目标机部署 exporter 或由平台后续接入采集。
          </p>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
        <Server className="size-8 text-[#434343]" />
        <p className="text-sm text-[#8c8c8c]">请从左侧选择主机</p>
        <p className="text-[10px] text-[#595959]">选择虚拟机后可显示 vCenter 侧资源概览</p>
      </div>
    );
  }, [vm, extra]);

  return (
    <aside
      className={cn(
        "flex min-h-0 w-full shrink-0 flex-col overflow-hidden border-[#303030] bg-[#1c1c1c] xl:w-[300px] xl:border-l",
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-[#303030] px-3 py-2">
        <Activity className="size-4 text-[#1890ff]" />
        <span className="text-sm font-medium text-[#ffffff]">主机概览</span>
        {updatedLabel && (
          <span className="ml-auto shrink-0 font-mono text-[9px] text-[#595959]" title="QuickStats 最后更新时间">
            {updatedLabel}
          </span>
        )}
      </div>
      <div className="bastion-asset-sidebar-scroll min-h-0 flex-1">{body}</div>
    </aside>
  );
};

export default BastionHostInsightPanel;

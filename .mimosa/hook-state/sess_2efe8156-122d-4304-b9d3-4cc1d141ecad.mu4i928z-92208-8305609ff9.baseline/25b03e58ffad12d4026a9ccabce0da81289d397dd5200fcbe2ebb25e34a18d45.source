import type { PerfPoint } from "./types";

/** ESXi / VM CPU、内存占用率：背景分区阈值（%） */
export const VC_CPU_MEM_WARN_PCT = 70;
export const VC_CPU_MEM_CRIT_PCT = 85;

/** iDRAC 温度（°C） */
export const VC_IDRAC_CPU_TEMP_WARN = 70;
export const VC_IDRAC_CPU_TEMP_CRIT = 82;
export const VC_IDRAC_DISK_TEMP_WARN = 45;
export const VC_IDRAC_DISK_TEMP_CRIT = 56;

/** 功耗（W）：仅作粗参考，不同机型差异大 */
export const VC_POWER_WARN_W = 380;
export const VC_POWER_CRIT_W = 720;

/** 风扇（RPM）：R730 类双路常见区间粗参考 */
export const VC_FAN_WARN_RPM = 7200;
export const VC_FAN_CRIT_RPM = 11500;

export function maxSeries(pts?: PerfPoint[] | null): number {
  if (!pts?.length) return 0;
  let m = 0;
  for (const p of pts) {
    if (typeof p.v === "number" && Number.isFinite(p.v) && p.v > m) m = p.v;
  }
  return m;
}

export function percentileSorted(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
  return sorted[idx] ?? 0;
}

/** 磁盘/网络吞吐：按本窗口样本算分位，用于背景带（无绝对「%」时的相对偏高） */
export function diskNetPeakSeries(
  rows: { read?: number; write?: number; rx?: number; tx?: number }[]
): number[] {
  const out: number[] = [];
  for (const r of rows) {
    const read = typeof r.read === "number" ? r.read : 0;
    const write = typeof r.write === "number" ? r.write : 0;
    const rx = typeof r.rx === "number" ? r.rx : 0;
    const tx = typeof r.tx === "number" ? r.tx : 0;
    if (read || write) out.push(read + write);
    else if (rx || tx) out.push(rx + tx);
  }
  return out;
}

export function lineColorByMaxPct(maxV: number): string {
  if (maxV >= VC_CPU_MEM_CRIT_PCT) return "hsl(0 72% 48%)";
  if (maxV >= VC_CPU_MEM_WARN_PCT) return "hsl(32 95% 44%)";
  return "hsl(221 83% 48%)";
}

export function lineColorByTemp(maxC: number, warn: number, crit: number): string {
  if (maxC >= crit) return "hsl(0 72% 48%)";
  if (maxC >= warn) return "hsl(32 95% 44%)";
  return "hsl(199 89% 42%)";
}

export function lineColorByPower(maxW: number): string {
  if (maxW >= VC_POWER_CRIT_W) return "hsl(0 72% 48%)";
  if (maxW >= VC_POWER_WARN_W) return "hsl(32 95% 44%)";
  return "hsl(24 95% 48%)";
}

export function lineColorByFan(maxRpm: number): string {
  if (maxRpm >= VC_FAN_CRIT_RPM) return "hsl(0 72% 48%)";
  if (maxRpm >= VC_FAN_WARN_RPM) return "hsl(32 95% 44%)";
  return "hsl(199 89% 42%)";
}

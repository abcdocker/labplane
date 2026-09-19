import type { VCenterVMPerfRateRow } from "./types";

/**
 * vSphere / ikuai 常见「千字节每秒」→ 与运营商标称一致的十进制 Mbps（M = 10⁶ bit/s）。
 * 数值按 1024 字节为 1 KiB（与 vSphere KBps、Go ikuai_*_kbytes_per_second 一致）。
 */
function sampleToDecimalMbps(val: number, unit?: string): number {
  if (!Number.isFinite(val) || val < 0) return 0;
  const u = (unit ?? "").toLowerCase();
  if (u.includes("megabytespersecond") || (u.includes("megabyte") && u.includes("second"))) {
    return (val * 1024 * 1024 * 8) / 1_000_000;
  }
  if (u.includes("kilobytespersecond") || (u.includes("kilobyte") && u.includes("second"))) {
    return (val * 1024 * 8) / 1_000_000;
  }
  return (val * 1024 * 8) / 1_000_000;
}

/** 下载≈入站 netRx，上传≈出站 netTx；与巡检 / perf-snapshot 同源字段 */
export function vcenterVmPerfRowMbps(row: VCenterVMPerfRateRow | undefined): {
  downloadMbps: string;
  uploadMbps: string;
} {
  if (!row) return { downloadMbps: "—", uploadMbps: "—" };
  const dl = sampleToDecimalMbps(row.netRx ?? 0, row.netRxUnit);
  const ul = sampleToDecimalMbps(row.netTx ?? 0, row.netTxUnit);
  return { downloadMbps: dl.toFixed(2), uploadMbps: ul.toFixed(2) };
}

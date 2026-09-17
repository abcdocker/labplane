/** CPU 核数（浮点，如 0.25 核 → 250m），用于 Pod 详情 / 列表用量展示 */
export function formatCpuCores(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n < 0.0005) return "0m";
  if (n < 0.1) return `${Math.round(n * 1000)}m`;
  return n.toFixed(3);
}

/** 字节 → B / KiB / MiB / GiB */
export function formatMemBytes(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n < 1024) return `${n.toFixed(0)} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KiB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MiB`;
  return `${(n / 1024 ** 3).toFixed(2)} GiB`;
}

/** 调度请求的 CPU 毫核 → 如 "0.25c"（工作负载表「申请」列） */
export function formatCpuMilliC(milli: number): string {
  if (!Number.isFinite(milli) || milli <= 0) return "—";
  return `${(milli / 1000).toFixed(2)}c`;
}

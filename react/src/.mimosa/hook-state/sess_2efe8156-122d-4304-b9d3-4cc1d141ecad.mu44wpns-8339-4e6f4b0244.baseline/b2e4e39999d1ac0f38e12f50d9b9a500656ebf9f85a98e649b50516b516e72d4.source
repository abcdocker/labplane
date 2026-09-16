/** LogsQL 值引用，与 `internal/ops_vmlog.go` logsQLQuoteValue 一致。 */
export function logsQLQuoteValue(s: string): string {
  const t = s.trim().replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return `"${t}"`;
}

/** 与 `buildVmLogQuery("kubernetes", ns, "", "any", podName)` 一致。 */
export function buildKubernetesPodVmLogQuery(namespace: string, podName: string): string {
  const ns = namespace.trim();
  const pod = podName.trim();
  const parts: string[] = [];
  if (ns) parts.push(`(kubernetes.namespace_name:${logsQLQuoteValue(ns)})`);
  if (pod) parts.push(`(kubernetes.pod_name:${logsQLQuoteValue(pod)})`);
  if (parts.length === 0) return "*";
  return parts.join(" AND ");
}

function pickStr(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return "";
}

function rowMessage(row: Record<string, unknown>): string {
  const m =
    pickStr(row, ["_msg", "msg", "message", "log", "message_json"]) ||
    (() => {
      try {
        return JSON.stringify(row);
      } catch {
        return String(row);
      }
    })();
  const one = m.replace(/\s+/g, " ").trim();
  return one.length > 900 ? `${one.slice(0, 900)}…` : one;
}

/** 将 VL NDJSON 行压成若干行文本，供重启诊断 prompt 使用。 */
export function formatVmLogRowsForPrompt(rows: Record<string, unknown>[], maxLines: number): string {
  if (!rows.length) return "";
  const tail = rows.length > maxLines ? rows.slice(-maxLines) : rows;
  const out: string[] = [];
  for (const row of tail) {
    const t = pickStr(row, ["_time", "timestamp", "@timestamp", "time"]);
    const cn = pickStr(row, [
      "kubernetes.container_name",
      "kubernetes_container_name",
      "container",
      "container_name",
    ]);
    const msg = rowMessage(row);
    out.push(`${t || "—"}${cn ? ` [${cn}]` : ""} ${msg}`);
  }
  return out.join("\n");
}

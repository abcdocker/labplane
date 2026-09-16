/** 与 Go `internal/k8s_pods_metrics.go` 中 `promLabelValue` 一致，用于 PromQL 标签匹配 */
export function promLabelValueForQuery(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** 单 Pod 的 cAdvisor / 网络指标，与 GET /api/k8s/pods/metrics 同源 */
export function buildPodMetricsRangeQueries(namespace: string, pod: string) {
  const ns = namespace.trim();
  const p = pod.trim();
  const nsMatch = `namespace=${promLabelValueForQuery(ns)}`;
  const podMatch = `,pod=${promLabelValueForQuery(p)}`;
  const commonSel = `${nsMatch}${podMatch},container!="",container!="POD"`;
  return {
    cpu: `sum by (namespace, pod) (rate(container_cpu_usage_seconds_total{${commonSel}}[5m]))`,
    mem: `sum by (namespace, pod) (container_memory_working_set_bytes{${commonSel}})`,
    netRx: `sum by (namespace, pod) (rate(container_network_receive_bytes_total{${nsMatch}${podMatch}}[5m]))`,
    netTx: `sum by (namespace, pod) (rate(container_network_transmit_bytes_total{${nsMatch}${podMatch}}[5m]))`,
  };
}

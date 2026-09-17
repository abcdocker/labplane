/** 与 PodLogsSheet、重启 AI 分析共用的日志 API 路径（等价 kubectl logs / --previous） */
export function buildPodLogsApiPath(
  namespace: string,
  podName: string,
  container: string,
  tailLines: number,
  previous: boolean
): string {
  const q = new URLSearchParams({ tailLines: String(tailLines) });
  const c = container.trim();
  if (c) q.set("container", c);
  if (previous) q.set("previous", "true");
  return `/api/k8s/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(podName)}/logs?${q.toString()}`;
}

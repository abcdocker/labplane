import { useQuery } from "@tanstack/react-query";
import { apiGetJson, type RuntimeStatusResponse } from "@/lib/api";

/** 与后端 Redis 缓存 TTL（默认 90s）配合；不在前台定时轮询，仅首屏/手动失效后拉取 */
const STALE_MS = 5 * 60_000;

export function useRuntimeStatusQuery() {
  return useQuery({
    queryKey: ["runtime-status"],
    queryFn: ({ signal }) => apiGetJson<RuntimeStatusResponse>("/api/runtime/status", { signal }),
    staleTime: STALE_MS,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

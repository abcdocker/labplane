import { useQuery } from "@tanstack/react-query";
import { apiGetJson, type SystemCheck } from "@/lib/api";

/** 与 useRuntimeStatusQuery 共用 ["runtime-status"] 缓存，避免单独打 /api/system/check */
const STALE_MS = 5 * 60_000;

export function useSystemCheckQuery() {
  return useQuery({
    queryKey: ["runtime-status"],
    queryFn: ({ signal }) => apiGetJson<{ systemCheck: SystemCheck }>("/api/runtime/status", { signal }),
    staleTime: STALE_MS,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    select: (d) => d.systemCheck,
  });
}

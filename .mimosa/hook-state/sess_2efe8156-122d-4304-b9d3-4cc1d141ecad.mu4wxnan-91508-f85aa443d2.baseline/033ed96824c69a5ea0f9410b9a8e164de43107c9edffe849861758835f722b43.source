import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { apiGetJson, type AppConfig } from "@/lib/api";

/** 与 React Query 及 invalidateQueries 共用 */
export const APP_CONFIG_QUERY_KEY = ["app-config"] as const;

/** 全局 /api/config 缓存；与后端 Reload 及多页共享一致 */
export const APP_CONFIG_STALE_MS = 60_000;

type AppConfigQueryOptions = Omit<
  UseQueryOptions<AppConfig, Error>,
  "queryKey" | "queryFn" | "staleTime"
>;

/** 全应用统一拉取 GET /api/config（含 AbortSignal，避免切页竞态） */
export function useAppConfig(options?: AppConfigQueryOptions) {
  return useQuery({
    ...options,
    queryKey: APP_CONFIG_QUERY_KEY,
    queryFn: ({ signal }) => apiGetJson<AppConfig>("/api/config", { signal }),
    staleTime: APP_CONFIG_STALE_MS,
  });
}

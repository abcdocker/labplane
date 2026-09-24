import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { ApiHttpError, apiGetJson, apiPostJson } from "@/lib/api";
import { useAuth } from "@/auth/auth-context";

export type HarborImageIndexProgressDTO = {
  state?: string;
  phase?: string;
  message?: string;
  projectsTotal?: number;
  projectsDone?: number;
  reposScanned?: number;
  tagsIndexed?: number;
  currentProject?: string;
  currentRepo?: string;
  startedAt?: string;
  finishedAt?: string;
  percentApprox?: number;
  lastError?: string;
};

export type HarborIndexStatusExtended = {
  redisAvailable?: boolean;
  harborConfigured?: boolean;
  intervalSec?: number;
  crawlTimeoutSec?: number;
  maxRepoPages?: number;
  maxArtifactPages?: number;
  maxProjectPages?: number;
  projectConcurrency?: number;
  backgroundJobsEnabled?: boolean;
  entryCount?: number;
  updatedAt?: string;
  lastDurationMs?: number;
  lastError?: string;
  registryHost?: string;
  contentSha256?: string;
  skippedIdentical?: boolean;
  progress?: HarborImageIndexProgressDTO | null;
  syncRunningProcessLocked?: boolean;
};

function formatTs(iso?: string): string {
  if (!iso?.trim()) return "—";
  const d = Date.parse(iso);
  if (Number.isNaN(d)) return iso;
  return new Date(d).toLocaleString();
}

const HarborRedisIndexSettingsPanel: React.FC = () => {
  const { status: auth } = useAuth();
  const isAdmin = auth?.role === "admin";
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);

  const q = useQuery({
    queryKey: ["harbor-index-status", "settings"],
    queryFn: ({ signal }) => apiGetJson<HarborIndexStatusExtended>("/api/harbor/index/status", { signal }),
    refetchInterval: (query) => {
      const d = query.state.data;
      const running =
        d?.progress?.state === "running" || Boolean(d?.syncRunningProcessLocked);
      return running ? 900 : 20000;
    },
  });

  const st = q.data;
  const prog = st?.progress;
  const running = prog?.state === "running" || Boolean(st?.syncRunningProcessLocked);
  const pct = Math.min(100, Math.max(0, Number(prog?.percentApprox ?? 0)));

  const onSync = async () => {
    setSyncing(true);
    try {
      await apiPostJson("/api/harbor/index/sync", {});
      toast.success("已在后台启动全量索引同步");
      await qc.invalidateQueries({ queryKey: ["harbor-index-status"] });
    } catch (e) {
      if (e instanceof ApiHttpError && e.status === 409) {
        toast.message("已有同步任务在运行");
      } else {
        toast.error((e as Error).message);
      }
    } finally {
      setSyncing(false);
    }
  };

  if (!st?.harborConfigured) {
    return (
      <div className="rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2 text-xs text-amber-900">
        填写上方 Harbor 根地址与账号并保存后，方可建立 Redis 镜像索引（供项目页搜索与展示条数）。
      </div>
    );
  }

  if (!st.redisAvailable) {
    return (
      <div className="rounded-lg border border-red-100 bg-red-50/60 px-3 py-2 text-xs text-red-900">
        Redis 未连接：请在「账户与平台」配置 Redis 并保存；索引快照依赖 Redis 持久化键。
      </div>
    );
  }

  const errLine = prog?.lastError || st.lastError;

  return (
    <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50/40 p-3 text-xs text-slate-700">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-medium text-slate-900">Redis 镜像索引</span>
          <span className="ml-2 text-slate-500">
            后台每 {st.intervalSec ?? 60}s 自动全量同步
            {!st.backgroundJobsEnabled ? (
              <span className="text-amber-700">（LABPLANE_ENABLE_BACKGROUND_JOBS=false，定时任务未启用）</span>
            ) : null}
          </span>
        </div>
        {isAdmin ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-8 gap-1.5"
            disabled={syncing || running}
            onClick={() => void onSync()}
          >
            {syncing || running ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            立即全量同步
          </Button>
        ) : (
          <span className="text-slate-400">仅管理员可手动触发同步</span>
        )}
      </div>

      {running ? (
        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px] text-slate-500">
            <span>
              {prog?.phase === "listing_projects"
                ? "枚举项目"
                : prog?.phase === "crawling"
                  ? "按项目并发抓取（批量同步）"
                  : prog?.phase === "writing_redis"
                    ? "写入 Redis"
                    : "同步中"}
            </span>
            <span>{pct}%</span>
          </div>
          <Progress value={pct} className="h-1.5" />
          <p className="text-[11px] text-slate-600">
            项目 {prog?.projectsDone ?? 0}/{prog?.projectsTotal ?? 0} · 仓库 {prog?.reposScanned ?? 0} · 索引行{" "}
            {prog?.tagsIndexed ?? 0}
            {prog?.currentProject ? (
              <>
                {" "}
                · 当前 <span className="font-mono">{prog.currentProject}</span>
                {prog?.currentRepo ? (
                  <>
                    / <span className="font-mono">{prog.currentRepo}</span>
                  </>
                ) : null}
              </>
            ) : null}
          </p>
          {prog?.message ? <p className="text-[11px] text-slate-500">{prog.message}</p> : null}
        </div>
      ) : (
        <div className="grid gap-1 text-[11px] sm:grid-cols-2">
          <div>
            已索引 <span className="font-semibold text-slate-900">{st.entryCount ?? 0}</span> 条（tag/digest 行）
          </div>
          <div>最近更新 {formatTs(st.updatedAt)}</div>
          <div>耗时 {st.lastDurationMs != null && st.lastDurationMs > 0 ? `${st.lastDurationMs} ms` : "—"}</div>
          <div className="truncate" title={st.registryHost}>
            仓库域名 <span className="font-mono">{st.registryHost || "—"}</span>
          </div>
        </div>
      )}

      {errLine ? (
        <p className="rounded border border-red-100 bg-red-50/80 px-2 py-1.5 text-[11px] text-red-800">{errLine}</p>
      ) : null}

      <details className="text-[11px] text-slate-500">
        <summary className="cursor-pointer select-none text-slate-600">进程参数（环境变量）</summary>
        <ul className="mt-2 list-inside list-disc space-y-0.5 font-mono text-[10px] leading-relaxed">
          <li>LABPLANE_HARBOR_INDEX_INTERVAL_SEC（默认 60，0 关闭定时）</li>
          <li>LABPLANE_HARBOR_INDEX_CRAWL_TIMEOUT_SEC = {st.crawlTimeoutSec ?? "—"}</li>
          <li>LABPLANE_HARBOR_INDEX_PROJECT_CONCURRENCY = {st.projectConcurrency ?? "—"}（按项目并发）</li>
          <li>LABPLANE_HARBOR_INDEX_MAX_PROJECT_PAGES = {st.maxProjectPages ?? "—"}</li>
          <li>LABPLANE_HARBOR_INDEX_MAX_REPO_PAGES = {st.maxRepoPages ?? "—"}</li>
          <li>LABPLANE_HARBOR_INDEX_MAX_ARTIFACT_PAGES = {st.maxArtifactPages ?? "—"}</li>
        </ul>
      </details>
    </div>
  );
};

export default HarborRedisIndexSettingsPanel;

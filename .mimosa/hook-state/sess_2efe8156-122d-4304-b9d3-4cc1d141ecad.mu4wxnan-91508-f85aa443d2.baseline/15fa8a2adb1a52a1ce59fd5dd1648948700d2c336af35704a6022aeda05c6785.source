import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderGit2, Loader2, Package, RefreshCw, Search, Server, ShieldCheck, WifiOff } from "lucide-react";
import { apiGetJson } from "@/lib/api";
import { formatHarborStatCell } from "@/lib/harbor-stat-format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  HarborBreadcrumb,
  HarborEmpty,
  HarborLoading,
  HarborPanel,
  HarborTableWrap,
  HarborToolbar,
  harborBreadcrumbItemsIndex,
  harborTableShellClass,
} from "./HarborUi";
import { cn } from "@/lib/utils";
import { harborRepoRelativeToProject, harborRepoUrlPath } from "./harborPaths";

type HarborProject = {
  project_id?: number;
  name: string;
  owner_name?: string;
  metadata?: { public?: string };
  repo_count?: number;
  creation_time?: string;
  update_time?: string;
};

type HarborIndexStatus = {
  redisAvailable?: boolean;
  harborConfigured?: boolean;
  intervalSec?: number;
  entryCount?: number;
  updatedAt?: string;
  lastError?: string;
  registryHost?: string;
};

type HarborIndexEntry = {
  project: string;
  repo: string;
  tag: string;
  digest?: string;
  pushTime?: string;
  reference: string;
};

/** 列表行：可能带跨项目仓库搜索命中的相对路径（相对项目名） */
type HarborProjectRow = HarborProject & {
  matchingRepos?: string[];
  /** Redis 索引命中（精确到 tag） */
  indexHits?: { repo: string; tag: string; reference: string }[];
};

type HarborRepoNameRow = { name: string };

const HARBOR_PROJECTS_PAGE_SIZE = 100;
const HARBOR_REPO_SCAN_PAGES = 5;

async function harborFetchAllProjects(): Promise<HarborProject[]> {
  const out: HarborProject[] = [];
  for (let page = 1; page <= 50; page++) {
    const qs = new URLSearchParams({
      page: String(page),
      page_size: String(HARBOR_PROJECTS_PAGE_SIZE),
    });
    const batch = await apiGetJson<HarborProject[]>(`/api/harbor/projects?${qs.toString()}`);
    if (!batch?.length) break;
    out.push(...batch);
    if (batch.length < HARBOR_PROJECTS_PAGE_SIZE) break;
  }
  return out;
}

function harborRepoNameMatchesQuery(project: string, repoListName: string, termLower: string): boolean {
  const rel = harborRepoRelativeToProject(project, repoListName).toLowerCase();
  if (rel.includes(termLower)) return true;
  return rel.split("/").some((seg) => seg.includes(termLower));
}

function harborBuildProjectRowsFromIndex(
  entries: HarborIndexEntry[],
  metaByName: Map<string, HarborProject>
): HarborProjectRow[] {
  const byProj = new Map<string, Map<string, HarborIndexEntry[]>>();
  for (const e of entries) {
    const proj = e.project.trim();
    if (!proj) continue;
    if (!byProj.has(proj)) byProj.set(proj, new Map());
    const rm = byProj.get(proj)!;
    const repo = e.repo.trim();
    if (!rm.has(repo)) rm.set(repo, []);
    rm.get(repo)!.push(e);
  }
  const rows: HarborProjectRow[] = [];
  for (const [proj, repoMap] of byProj) {
    const base = metaByName.get(proj);
    const indexHits: HarborProjectRow["indexHits"] = [];
    for (const [, list] of repoMap) {
      for (const e of list) {
        indexHits.push({
          repo: e.repo,
          tag: e.tag,
          reference: e.reference,
        });
      }
    }
    rows.push({
      ...(base ?? { name: proj }),
      indexHits,
    });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}

async function harborFindMatchingRepoPaths(project: string, term: string): Promise<string[]> {
  const termLower = term.toLowerCase();
  const out = new Set<string>();
  const withQ = new URLSearchParams({
    page: "1",
    page_size: String(HARBOR_PROJECTS_PAGE_SIZE),
    q: term,
  });
  let list = await apiGetJson<HarborRepoNameRow[]>(
    `/api/harbor/projects/${encodeURIComponent(project)}/repositories?${withQ.toString()}`
  );
  for (const r of list ?? []) {
    if (harborRepoNameMatchesQuery(project, r.name, termLower)) {
      out.add(harborRepoRelativeToProject(project, r.name));
    }
  }
  if (out.size > 0) return [...out];

  for (let page = 1; page <= HARBOR_REPO_SCAN_PAGES; page++) {
    const plain = new URLSearchParams({
      page: String(page),
      page_size: String(HARBOR_PROJECTS_PAGE_SIZE),
    });
    const batch = await apiGetJson<HarborRepoNameRow[]>(
      `/api/harbor/projects/${encodeURIComponent(project)}/repositories?${plain.toString()}`
    );
    if (!batch?.length) break;
    for (const r of batch) {
      if (harborRepoNameMatchesQuery(project, r.name, termLower)) {
        out.add(harborRepoRelativeToProject(project, r.name));
      }
    }
    if (batch.length < HARBOR_PROJECTS_PAGE_SIZE) break;
  }
  return [...out];
}

type HarborStatus = {
  configured?: boolean;
  reachable?: boolean;
  httpStatus?: number;
  detail?: string;
  /** 浏览器打开 Harbor 控制台（优先 Harbor external_url） */
  harborUiUrl?: string;
  systeminfo?: { harbor_version?: string; external_url?: string };
};

const HARBOR_STAT_CARDS: { key: string; label: string; icon: React.ReactNode }[] = [
  { key: "total_project_count", label: "项目总数", icon: <FolderGit2 className="h-4 w-4" aria-hidden /> },
  { key: "total_repo_count", label: "镜像仓库", icon: <Package className="h-4 w-4" aria-hidden /> },
];

const HarborProjectsPage: React.FC = () => {
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const queryClient = useQueryClient();

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(searchText.trim()), 360);
    return () => window.clearTimeout(id);
  }, [searchText]);

  const statusQ = useQuery({
    queryKey: ["harbor-status"],
    queryFn: ({ signal }) => apiGetJson<HarborStatus>("/api/harbor/status", { signal }),
    staleTime: 30_000,
  });

  const indexStatusQ = useQuery({
    queryKey: ["harbor-index-status"],
    queryFn: ({ signal }) => apiGetJson<HarborIndexStatus>("/api/harbor/index/status", { signal }),
    enabled: statusQ.data?.configured === true,
    staleTime: 20_000,
  });

  const projectsQ = useQuery({
    queryKey: ["harbor-projects", debouncedSearch],
    queryFn: async (): Promise<HarborProjectRow[]> => {
      const term = debouncedSearch;
      if (!term) {
        const qs = new URLSearchParams({ page: "1", page_size: String(HARBOR_PROJECTS_PAGE_SIZE) });
        return apiGetJson<HarborProject[]>(`/api/harbor/projects?${qs.toString()}`);
      }

      const ix = await apiGetJson<HarborIndexStatus>("/api/harbor/index/status");
      if (ix.redisAvailable && (ix.entryCount ?? 0) > 0) {
        const sr = await apiGetJson<{
          entries?: HarborIndexEntry[];
          indexReady?: boolean;
        }>(`/api/harbor/index/search?q=${encodeURIComponent(term)}&limit=1000`);
        const entries = sr.entries ?? [];
        const allProjects = await harborFetchAllProjects();
        const meta = new Map(allProjects.map((p) => [p.name, p]));
        return harborBuildProjectRowsFromIndex(entries, meta);
      }

      const allProjects = await harborFetchAllProjects();
      const termLower = term.toLowerCase();
      const byName = allProjects.filter((p) => p.name.toLowerCase().includes(termLower));
      const nameHit = new Set(byName.map((p) => p.name));

      const repoByProject = new Map<string, string[]>();
      const concurrency = 8;
      for (let i = 0; i < allProjects.length; i += concurrency) {
        const slice = allProjects.slice(i, i + concurrency);
        const pairs = await Promise.all(
          slice.map(async (p) => {
            const paths = await harborFindMatchingRepoPaths(p.name, term);
            return [p.name, paths] as const;
          })
        );
        for (const [proj, paths] of pairs) {
          if (paths.length > 0) repoByProject.set(proj, paths);
        }
      }

      const rows: HarborProjectRow[] = [];
      for (const p of byName) {
        rows.push({ ...p, matchingRepos: repoByProject.get(p.name) });
      }
      for (const p of allProjects) {
        if (nameHit.has(p.name)) continue;
        const repos = repoByProject.get(p.name);
        if (repos?.length) rows.push({ ...p, matchingRepos: repos });
      }
      return rows;
    },
    enabled: statusQ.data?.configured === true,
    staleTime: 20_000,
  });

  const statsQ = useQuery({
    queryKey: ["harbor-statistics"],
    queryFn: ({ signal }) => apiGetJson<Record<string, unknown>>("/api/harbor/statistics", { signal }),
    enabled: statusQ.data?.configured === true,
    staleTime: 25_000,
  });

  if (statusQ.isLoading) {
    return (
      <div className="space-y-5">
        <HarborBreadcrumb items={harborBreadcrumbItemsIndex()} />
        <HarborLoading>正在检查 Harbor 配置…</HarborLoading>
      </div>
    );
  }

  if (!statusQ.data?.configured) {
    return (
      <div className="space-y-5">
        <HarborBreadcrumb items={harborBreadcrumbItemsIndex()} />
        <HarborPanel className="border-amber-200/80 bg-gradient-to-br from-amber-50/90 to-orange-50/30 p-5">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
              <Server className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <p className="font-semibold text-amber-950">尚未连接 Harbor</p>
              <p className="mt-1 text-sm leading-relaxed text-amber-900/90">
                请在「集群设置」运行时配置中填写{" "}
                <code className="rounded bg-white/90 px-1 font-mono text-xs">harborBaseUrl</code>、
                <code className="rounded bg-white/90 px-1 font-mono text-xs">harborUsername</code>、
                <code className="rounded bg-white/90 px-1 font-mono text-xs">harborPassword</code>{" "}
                并保存后刷新。
              </p>
            </div>
          </div>
        </HarborPanel>
      </div>
    );
  }

  const st = statusQ.data;
  const ver = st.systeminfo?.harbor_version;

  return (
    <div className="space-y-5">
      <HarborBreadcrumb items={harborBreadcrumbItemsIndex()} />

      <div
        className={cn(
          "flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 shadow-sm",
          st.reachable
            ? "border-emerald-200/80 bg-gradient-to-r from-emerald-50/90 to-teal-50/40 text-emerald-950"
            : "border-red-200/80 bg-gradient-to-r from-red-50/90 to-rose-50/30 text-red-950"
        )}
      >
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            st.reachable ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
          )}
        >
          {st.reachable ? <ShieldCheck className="h-5 w-5" aria-hidden /> : <WifiOff className="h-5 w-5" aria-hidden />}
        </div>
        <div className="min-w-0 flex-1 text-sm">
          {st.reachable ? (
            <p>
              <span className="font-semibold">Harbor API 已连通</span>
              {ver ? (
                <>
                  <span className="mx-1.5 text-emerald-700/60">·</span>
                  版本 <span className="font-mono text-emerald-900">{ver}</span>
                </>
              ) : null}
            </p>
          ) : (
            <p>
              <span className="font-semibold">无法访问 Harbor</span>
              <span className="mt-1 block text-xs opacity-90">{st.detail || `HTTP ${st.httpStatus ?? "—"}`}</span>
            </p>
          )}
        </div>
      </div>

      <HarborPanel className="overflow-hidden border-cyan-200/70 bg-gradient-to-br from-cyan-50/35 via-white to-sky-50/25 p-0 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cyan-100/80 bg-white/50 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">Harbor 全局统计</h3>
          {statsQ.isFetching ? (
            <span className="inline-flex items-center gap-1 text-xs text-cyan-700">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              更新中
            </span>
          ) : null}
        </div>
        <div className="p-4">
          {statsQ.isLoading && !statsQ.data ? (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin text-cyan-600" aria-hidden />
              加载统计数据…
            </p>
          ) : statsQ.isError ? (
            <p className="text-sm text-red-700">{(statsQ.error as Error).message}</p>
          ) : statsQ.data ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {HARBOR_STAT_CARDS.map(({ key, label, icon }) => (
                <div key={key} className="rounded-xl border border-cyan-200/50 bg-white/90 px-3 py-3 shadow-sm">
                  <div className="flex items-center gap-2 text-cyan-800">
                    {icon}
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">{label}</span>
                  </div>
                  <p className="mt-2 font-mono text-lg font-semibold tabular-nums text-slate-900">
                    {formatHarborStatCell(statsQ.data[key])}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">暂无统计数据</p>
          )}
        </div>
      </HarborPanel>

      <HarborToolbar>
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <Search className="h-3.5 w-3.5 text-cyan-600" aria-hidden />
            搜索项目 / 镜像仓库
          </label>
          <Input
            className="h-10 max-w-md border-slate-200 bg-white font-mono text-xs shadow-sm sm:w-96"
            placeholder="如 busybox — 可匹配项目 tools 下的仓库 busybox"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          {searchText.trim() !== debouncedSearch ? (
            <p className="text-[10px] text-slate-400">输入停顿后搜索…</p>
          ) : indexStatusQ.data?.redisAvailable ? (
            <p className="text-[10px] text-slate-500">
              Redis 镜像索引 {(indexStatusQ.data?.entryCount ?? 0).toLocaleString()} 条
              {(indexStatusQ.data?.entryCount ?? 0) > 0
                ? "（有键词时优先查索引，细到 tag）"
                : "（后台每分钟同步，就绪后自动走索引）"}
              {indexStatusQ.data?.updatedAt ? (
                <span className="text-slate-400">
                  {" "}
                  · 更新 {new Date(indexStatusQ.data.updatedAt).toLocaleString()}
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-10 gap-2 border border-slate-200 bg-white shadow-sm hover:bg-cyan-50/50"
          onClick={() => {
            void projectsQ.refetch();
            void (async () => {
              try {
                const fresh = await apiGetJson<Record<string, unknown>>("/api/harbor/statistics?refresh=1");
                queryClient.setQueryData(["harbor-statistics"], fresh);
              } catch {
                void statsQ.refetch();
              }
            })();
          }}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", projectsQ.isFetching && "animate-spin")} aria-hidden />
          刷新列表
        </Button>
      </HarborToolbar>

      {projectsQ.isLoading ? <HarborLoading>加载项目列表…</HarborLoading> : null}
      {projectsQ.error ? (
        <HarborPanel className="border-red-200 bg-red-50/50 px-4 py-3 text-sm text-red-800">
          {(projectsQ.error as Error).message}
        </HarborPanel>
      ) : null}

      {projectsQ.data && (
        <HarborTableWrap>
          <Table className={harborTableShellClass}>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>项目</TableHead>
                <TableHead>仓库数</TableHead>
                <TableHead>可见性</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projectsQ.data.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5}>
                    <HarborEmpty>
                      <FolderGit2 className="mx-auto mb-2 h-10 w-10 text-slate-300" aria-hidden />
                      {debouncedSearch
                        ? "无匹配项（若已启用 Redis 索引则为索引内无命中；否则为实时扫 Harbor 各库）"
                        : "无项目或当前筛选无结果"}
                    </HarborEmpty>
                  </TableCell>
                </TableRow>
              ) : (
                projectsQ.data.map((p, idx) => {
                  const pub = p.metadata?.public === "true";
                  return (
                    <TableRow key={p.name} className={cn(idx % 2 === 1 && "bg-slate-50/40")}>
                      <TableCell className="max-w-[min(100%,28rem)] align-top text-sm text-slate-900">
                        <p className="font-mono font-semibold">{p.name}</p>
                        {p.indexHits?.length ? (
                          <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1">
                            <span className="text-[10px] font-medium text-slate-500">匹配镜像</span>
                            {p.indexHits.slice(0, 16).map((h) => (
                              <Link
                                key={`${h.repo}:${h.tag}:${h.reference}`}
                                className="max-w-[min(100%,20rem)] truncate text-[11px] font-mono text-cyan-800 underline decoration-cyan-300 underline-offset-2 hover:text-cyan-950"
                                title={h.reference}
                                to={`/cluster/harbor/p/${encodeURIComponent(p.name)}/${harborRepoUrlPath(h.repo)}`}
                              >
                                {h.tag ? `${h.repo}:${h.tag}` : h.repo}
                              </Link>
                            ))}
                            {p.indexHits.length > 16 ? (
                              <span className="text-[10px] text-slate-400">等 {p.indexHits.length} 条</span>
                            ) : null}
                          </div>
                        ) : p.matchingRepos?.length ? (
                          <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1">
                            <span className="text-[10px] font-medium text-slate-500">匹配仓库</span>
                            {p.matchingRepos.slice(0, 12).map((rel) => (
                              <Link
                                key={rel}
                                className="text-[11px] font-mono text-cyan-800 underline decoration-cyan-300 underline-offset-2 hover:text-cyan-950"
                                to={`/cluster/harbor/p/${encodeURIComponent(p.name)}/${harborRepoUrlPath(rel)}`}
                              >
                                {rel}
                              </Link>
                            ))}
                            {p.matchingRepos.length > 12 ? (
                              <span className="text-[10px] text-slate-400">等 {p.matchingRepos.length} 个</span>
                            ) : null}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="tabular-nums text-sm text-slate-700">{p.repo_count ?? "—"}</TableCell>
                      <TableCell>
                        {pub ? (
                          <Badge className="border-0 bg-sky-100 font-normal text-sky-900 hover:bg-sky-100">公开</Badge>
                        ) : (
                          <Badge variant="secondary" className="border border-slate-200/80 bg-slate-100 font-normal">
                            私有
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">{p.creation_time ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          asChild
                          size="sm"
                          className="h-8 gap-1 border-cyan-200/80 bg-cyan-50/50 text-xs text-cyan-950 hover:bg-cyan-100/80"
                        >
                          <Link to={`/cluster/harbor/p/${encodeURIComponent(p.name)}`}>仓库</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </HarborTableWrap>
      )}
    </div>
  );
};

export default HarborProjectsPage;

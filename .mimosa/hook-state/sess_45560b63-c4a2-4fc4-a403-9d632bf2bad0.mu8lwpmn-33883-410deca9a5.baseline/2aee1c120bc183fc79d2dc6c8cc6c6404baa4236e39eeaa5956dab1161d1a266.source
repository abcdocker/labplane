import React, { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Package, RefreshCw, Search, Tag } from "lucide-react";
import { apiGetJson } from "@/lib/api";
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
import {
  harborArtifactsApi,
  harborNormalizeRepositoriesQuery,
  harborRepoRelativeToProject,
  harborRepoUrlSegmentsForProject,
} from "./harborPaths";
import {
  HarborBreadcrumb,
  HarborEmpty,
  HarborLoading,
  HarborPanel,
  HarborTableWrap,
  HarborToolbar,
  harborBreadcrumbItemsFromHome,
  harborTableShellClass,
} from "./HarborUi";
import { cn } from "@/lib/utils";

type HarborRepository = {
  id?: number;
  name: string;
  artifact_count?: number;
  pull_count?: number;
  update_time?: string;
};

type HarborArtifactLite = { tags?: { name?: string }[] };

function artifactListHasExactTag(arts: HarborArtifactLite[] | undefined, tag: string): boolean {
  if (!arts?.length) return false;
  return arts.some((a) => (a.tags ?? []).some((t) => t.name === tag));
}

async function harborRepoHasExactTag(project: string, repoListName: string, tag: string): Promise<boolean> {
  const rel = harborRepoRelativeToProject(project, repoListName);
  const pageSize = 50;
  for (let page = 1; page <= 5; page++) {
    const arts = await apiGetJson<HarborArtifactLite[]>(
      harborArtifactsApi(project, rel, {
        page: String(page),
        page_size: String(pageSize),
        q: `tags.value=${tag}`,
      })
    );
    if (artifactListHasExactTag(arts, tag)) return true;
    if (!arts?.length || arts.length < pageSize) break;
  }
  return false;
}

const HarborReposPage: React.FC = () => {
  const { projectName = "" } = useParams<{ projectName: string }>();
  const project = decodeURIComponent(projectName);
  const [search, setSearch] = useState("");
  const [tagExact, setTagExact] = useState("");

  const reposQ = useQuery({
    queryKey: ["harbor-repos", project, search, tagExact],
    queryFn: async ({ signal }) => {
      const qs = new URLSearchParams({ page: "1", page_size: "100" });
      const qNorm = harborNormalizeRepositoriesQuery(search);
      if (qNorm) qs.set("q", qNorm);
      const list = await apiGetJson<HarborRepository[]>(
        `/api/harbor/projects/${encodeURIComponent(project)}/repositories?${qs.toString()}`
      );
      const tag = tagExact.trim();
      if (!tag) return list;
      const chunk = 6;
      const matched: HarborRepository[] = [];
      for (let i = 0; i < list.length; i += chunk) {
        const slice = list.slice(i, i + chunk);
        const flags = await Promise.all(slice.map((r) => harborRepoHasExactTag(project, r.name, tag)));
        slice.forEach((r, j) => {
          if (flags[j]) matched.push(r);
        });
      }
      return matched;
    },
    enabled: project.length > 0,
    staleTime: 20_000,
  });

  return (
    <div className="space-y-5">
      <HarborBreadcrumb
        items={[...harborBreadcrumbItemsFromHome(), { label: project || "—" }]}
      />

      <HarborToolbar>
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <Search className="h-3.5 w-3.5 text-cyan-600" aria-hidden />
            搜索仓库
          </label>
          <Input
            className="h-10 w-56 border-slate-200 bg-white font-mono text-xs shadow-sm sm:w-64"
            placeholder="名称包含…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <Tag className="h-3.5 w-3.5 text-cyan-600" aria-hidden />
            Tag（精确）
          </label>
          <Input
            className="h-10 w-56 border-slate-200 bg-white font-mono text-xs shadow-sm sm:w-64"
            placeholder="例如 v1.2.3"
            value={tagExact}
            onChange={(e) => setTagExact(e.target.value)}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-10 gap-2 border border-slate-200 bg-white shadow-sm hover:bg-cyan-50/50"
          onClick={() => void reposQ.refetch()}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", reposQ.isFetching && "animate-spin")} aria-hidden />
          刷新列表
        </Button>
      </HarborToolbar>

      {reposQ.isLoading ? <HarborLoading>加载仓库列表…</HarborLoading> : null}
      {reposQ.error ? (
        <HarborPanel className="border-red-200 bg-red-50/50 px-4 py-3 text-sm text-red-800">
          {(reposQ.error as Error).message}
        </HarborPanel>
      ) : null}

      {reposQ.data && (
        <HarborTableWrap>
          <Table className={harborTableShellClass}>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>仓库</TableHead>
                <TableHead>制品数</TableHead>
                <TableHead>拉取次数</TableHead>
                <TableHead>更新时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reposQ.data.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5}>
                    <HarborEmpty>
                      <Package className="mx-auto mb-2 h-10 w-10 text-slate-300" aria-hidden />
                      {tagExact.trim()
                        ? "当前项目下没有仓库包含该 Tag（已按制品标签精确匹配，至多扫描每库前 5 页）"
                        : "无仓库或当前筛选无结果"}
                    </HarborEmpty>
                  </TableCell>
                </TableRow>
              ) : (
                reposQ.data.map((r, idx) => {
                  const pathTail = harborRepoUrlSegmentsForProject(project, r.name);
                  return (
                    <TableRow key={r.name} className={cn(idx % 2 === 1 && "bg-slate-50/40")}>
                      <TableCell className="font-mono text-sm font-semibold text-slate-900">{r.name}</TableCell>
                      <TableCell className="tabular-nums text-sm text-slate-700">{r.artifact_count ?? "—"}</TableCell>
                      <TableCell className="tabular-nums text-sm text-slate-700">{r.pull_count ?? "—"}</TableCell>
                      <TableCell className="text-xs text-slate-500">{r.update_time ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          asChild
                          size="sm"
                          className="h-8 gap-1 border-cyan-200/80 bg-cyan-50/50 text-xs text-cyan-950 hover:bg-cyan-100/80"
                        >
                          <Link to={`/cluster/harbor/p/${encodeURIComponent(project)}/${pathTail}`}>制品</Link>
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

export default HarborReposPage;

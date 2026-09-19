import React, { useCallback, useMemo, useState } from "react";
import { useAppConfig } from "@/hooks/use-app-config";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, History, Layers, Tag, Terminal } from "lucide-react";
import { apiDeleteJson, apiGetJson, type AppConfig } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/auth/auth-context";
import { toast } from "sonner";
import {
  harborArtifactAdditionApi,
  harborArtifactsApi,
  harborDockerImageRef,
  harborDockerImageRefDigest,
  harborRepoRelativeToProject,
} from "./harborPaths";
import { HarborBuildHistorySheet } from "./HarborBuildHistoryPanel";
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

type HarborTag = { name: string; push_time?: string };

type HarborArtifact = {
  id?: number;
  digest?: string;
  tags?: HarborTag[];
  push_time?: string;
  size?: number;
  manifest_media_type?: string;
  addition_links?: Record<string, { href?: string; absolute?: boolean }>;
  scan_overview?: {
    summary?: { critical?: number; high?: number; medium?: number; low?: number; fixable?: number };
  };
};

function fmtSize(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KiB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MiB`;
  return `${(n / 1024 ** 3).toFixed(2)} GiB`;
}

const HarborArtifactsPage: React.FC = () => {
  const { projectName, "*": repoSplat = "" } = useParams<{ projectName: string; "*": string }>();
  const project = decodeURIComponent(projectName ?? "");
  const tail = (repoSplat ?? "").replace(/^\/+/, "");
  let repoFull = tail;
  try {
    repoFull = decodeURIComponent(tail.replace(/\+/g, " "));
  } catch {
    /* 保持原样 */
  }
  /** 与后端一致：列表常返回「项目/仓库」全名，URL 也可能带编码；请求前归一成相对项目名 */
  const repoPath = harborRepoRelativeToProject(project, repoFull);
  const qc = useQueryClient();
  const { status } = useAuth();
  const isAdmin = status?.role === "admin";

  const cfgQ = useAppConfig();
  const registryHost = (cfgQ.data?.harborRegistryHost ?? "").trim();

  const copyText = useCallback(async (label: string, text: string) => {
    if (!text) {
      toast.error("无可复制内容");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success(label);
    } catch {
      toast.error("复制失败（请检查浏览器权限）");
    }
  }, []);

  const [tagExact, setTagExact] = useState("");

  const artifactsQ = useQuery({
    queryKey: ["harbor-artifacts", project, repoPath, tagExact.trim()],
    queryFn: ({ signal }) => {
      const extra: Record<string, string> = { page: "1", page_size: "50" };
      const t = tagExact.trim();
      if (t) extra.q = `tags.value=${t}`;
      return apiGetJson<HarborArtifact[]>(harborArtifactsApi(project, repoPath, extra), { signal });
    },
    enabled: project.length > 0 && repoPath.length > 0,
    staleTime: 15_000,
  });

  const artifactRows = useMemo(() => {
    const raw = artifactsQ.data;
    if (raw == null) return null;
    const t = tagExact.trim();
    if (!t) return raw;
    return raw.filter((a) => (a.tags ?? []).some((x) => x.name === t));
  }, [artifactsQ.data, tagExact]);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRef, setHistoryRef] = useState("");
  const [historyLabel, setHistoryLabel] = useState("");

  const historyQ = useQuery({
    queryKey: ["harbor-artifact-build-history", project, repoPath, historyRef],
    queryFn: ({ signal }) =>
      apiGetJson<unknown>(harborArtifactAdditionApi(project, repoPath, historyRef, "build_history"), { signal }),
    enabled: historyOpen && historyRef.length > 0 && project.length > 0 && repoPath.length > 0,
  });

  const openBuildHistory = useCallback((a: HarborArtifact) => {
    const r = (a.digest || a.tags?.[0]?.name || "").trim();
    if (!r) {
      toast.error("该制品无 tag 或 digest，无法查询打包历史");
      return;
    }
    const label =
      (a.tags ?? []).length > 0
        ? a.tags!.map((t) => t.name).join(", ")
        : r.length > 52
          ? `${r.slice(0, 52)}…`
          : r;
    setHistoryRef(r);
    setHistoryLabel(label);
    setHistoryOpen(true);
  }, []);

  const delMut = useMutation({
    mutationFn: async (reference: string) => {
      const qs = new URLSearchParams();
      qs.set("repository", repoPath);
      qs.set("reference", reference);
      return apiDeleteJson(
        `/api/harbor/projects/${encodeURIComponent(project)}/artifacts?${qs.toString()}`
      );
    },
    onSuccess: () => {
      toast.success("已删除制品");
      void qc.invalidateQueries({ queryKey: ["harbor-artifacts", project, repoPath] });
      void qc.invalidateQueries({ queryKey: ["harbor-repos", project] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="space-y-5">
      <HarborBreadcrumb
        items={[
          ...harborBreadcrumbItemsFromHome(),
          { label: project || "—", to: `/cluster/harbor/p/${encodeURIComponent(project)}` },
          { label: repoPath || "—" },
        ]}
      />

      {!registryHost && cfgQ.data?.harborConfigured ? (
        <HarborPanel className="border-amber-200/90 bg-gradient-to-r from-amber-50/95 to-orange-50/40 px-4 py-3 text-xs text-amber-950 shadow-sm">
          无法解析镜像仓库域名：请确认运行时{" "}
          <code className="rounded-md bg-white/90 px-1.5 py-0.5 font-mono text-[11px]">harborBaseUrl</code> 为完整
          https://主机[:端口] 形式，保存后刷新本页即可使用「复制镜像地址」。
        </HarborPanel>
      ) : null}

      <HarborToolbar>
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <Tag className="h-3.5 w-3.5 text-cyan-600" aria-hidden />
            Tag（精确）
          </label>
          <Input
            className="h-10 w-56 border-slate-200 bg-white font-mono text-xs shadow-sm sm:w-64"
            placeholder="仅显示含该标签的制品"
            value={tagExact}
            onChange={(e) => setTagExact(e.target.value)}
          />
        </div>
      </HarborToolbar>

      {artifactsQ.isLoading ? <HarborLoading>加载制品列表…</HarborLoading> : null}
      {artifactsQ.error ? (
        <HarborPanel className="border-red-200 bg-red-50/50 px-4 py-3 text-sm text-red-800">
          {(artifactsQ.error as Error).message}
        </HarborPanel>
      ) : null}

      <HarborBuildHistorySheet
        open={historyOpen}
        onOpenChange={(v) => {
          setHistoryOpen(v);
          if (!v) {
            setHistoryRef("");
            setHistoryLabel("");
          }
        }}
        title={historyLabel}
        subtitle={`${project}/${repoPath}`}
        isLoading={historyQ.isFetching}
        error={historyQ.isError ? (historyQ.error as Error) : null}
        data={historyQ.data}
      />

      {artifactRows != null && (
        <HarborTableWrap>
          <Table className={harborTableShellClass}>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>标签 / 复制</TableHead>
                <TableHead>Digest</TableHead>
                <TableHead>大小</TableHead>
                <TableHead>推送时间</TableHead>
                <TableHead>打包历史</TableHead>
                <TableHead>扫描摘要</TableHead>
                {isAdmin ? <TableHead className="text-right">操作</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {artifactRows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={isAdmin ? 7 : 6}>
                    <HarborEmpty>
                      <Layers className="mx-auto mb-2 h-10 w-10 text-slate-300" aria-hidden />
                      {tagExact.trim() ? "本页结果中无完全匹配该 Tag 的制品" : "该仓库暂无制品"}
                    </HarborEmpty>
                  </TableCell>
                </TableRow>
              ) : (
                artifactRows.map((a, idx) => {
                  const ref = a.digest || a.tags?.[0]?.name || "";
                  const scan = a.scan_overview?.summary;
                  return (
                    <TableRow key={a.digest || a.id} className={cn(idx % 2 === 1 && "bg-slate-50/40")}>
                      <TableCell className="min-w-[200px] max-w-[min(100%,400px)] align-top">
                        <div className="flex flex-col gap-2">
                          {(a.tags ?? []).length ? (
                            a.tags!.map((t) => {
                              const img =
                                registryHost &&
                                harborDockerImageRef(registryHost, project, repoPath, t.name);
                              return (
                                <div key={t.name} className="flex flex-wrap items-center gap-1">
                                  <Badge
                                    variant="outline"
                                    className="max-w-[min(100%,200px)] truncate border-cyan-200/70 bg-cyan-50/30 font-mono text-[10px] font-normal text-cyan-950"
                                    title={t.name}
                                  >
                                    {t.name}
                                  </Badge>
                                  {img ? (
                                    <>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 shrink-0 text-cyan-800 hover:bg-cyan-100/60"
                                        title="复制镜像地址（registry/project/repo:tag）"
                                        onClick={() => void copyText("已复制镜像地址", img)}
                                      >
                                        <Copy className="h-3.5 w-3.5" aria-hidden />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 shrink-0 text-cyan-800 hover:bg-cyan-100/60"
                                        title="复制 docker pull 命令"
                                        onClick={() => void copyText("已复制 docker pull", `docker pull ${img}`)}
                                      >
                                        <Terminal className="h-3.5 w-3.5" aria-hidden />
                                      </Button>
                                    </>
                                  ) : null}
                                </div>
                              );
                            })
                          ) : (
                            <span className="text-xs text-slate-400">无标签</span>
                          )}
                          {registryHost && a.digest && !(a.tags?.length) ? (
                            <div className="flex flex-wrap items-center gap-1 border-t border-slate-100 pt-2">
                              <span className="text-[10px] text-slate-500">仅 digest</span>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 gap-1 border-cyan-200/80 bg-white px-2 text-[10px] hover:bg-cyan-50/50"
                                onClick={() =>
                                  void copyText(
                                    "已复制镜像地址（@digest）",
                                    harborDockerImageRefDigest(registryHost, project, repoPath, a.digest!)
                                  )
                                }
                              >
                                <Copy className="h-3 w-3" aria-hidden />
                                地址
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 gap-1 border-cyan-200/80 bg-white px-2 text-[10px] hover:bg-cyan-50/50"
                                onClick={() =>
                                  void copyText(
                                    "已复制 docker pull",
                                    `docker pull ${harborDockerImageRefDigest(registryHost, project, repoPath, a.digest!)}`
                                  )
                                }
                              >
                                <Terminal className="h-3 w-3" aria-hidden />
                                pull
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[min(280px,40vw)] truncate font-mono text-[11px]" title={a.digest}>
                        {a.digest ?? "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs tabular-nums text-slate-700">{fmtSize(a.size)}</TableCell>
                      <TableCell className="text-xs text-slate-500">{a.push_time ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1 border-cyan-200/80 bg-white text-xs text-cyan-950 hover:bg-cyan-50/60"
                          disabled={!ref}
                          title={
                            a.addition_links?.build_history
                              ? "Harbor 提供 build_history"
                              : "拉取 Harbor 制品附加信息（无历史时可能 404）"
                          }
                          onClick={() => openBuildHistory(a)}
                        >
                          <History className="h-3.5 w-3.5" aria-hidden />
                          查看
                        </Button>
                      </TableCell>
                      <TableCell className="text-[11px] text-slate-700">
                        {scan ? (
                          <span>
                            C{scan.critical ?? 0} H{scan.high ?? 0} M{scan.medium ?? 0} L{scan.low ?? 0}
                            {scan.fixable != null ? ` · 可修 ${scan.fixable}` : ""}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      {isAdmin ? (
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="h-7 text-xs shadow-sm"
                            disabled={!ref || delMut.isPending}
                            onClick={() => {
                              if (!ref || !window.confirm(`删除制品 ${ref.slice(0, 48)}…？`)) return;
                              delMut.mutate(ref);
                            }}
                          >
                            删除
                          </Button>
                        </TableCell>
                      ) : null}
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

export default HarborArtifactsPage;

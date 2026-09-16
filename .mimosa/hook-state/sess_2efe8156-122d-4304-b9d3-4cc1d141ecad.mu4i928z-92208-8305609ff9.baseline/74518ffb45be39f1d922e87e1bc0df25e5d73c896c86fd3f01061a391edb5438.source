/** 前端路由：多级仓库路径作为 path 段（每段 encode） */
export function harborRepoUrlPath(repoPath: string): string {
  return repoPath
    .split("/")
    .filter(Boolean)
    .map((s) => encodeURIComponent(s))
    .join("/");
}

/**
 * Harbor 列表返回的 name 常为「项目/仓库」；路由已在 /p/:project 下，制品 API 也按项目拆分，
 * 此处去掉与当前项目重复的前缀，避免 tools + tools/kube-bt-sync 误拼成错误的 Harbor path。
 */
export function harborRepoRelativeToProject(project: string, repoName: string): string {
  const p = project.trim().replace(/^\/+|\/+$/g, "");
  let r = repoName.trim().replace(/^\/+|\/+$/g, "");
  if (!p || !r) return r;
  if (r === p) return r;
  const prefix = `${p}/`;
  if (r.startsWith(prefix)) return r.slice(prefix.length);
  return r;
}

/** 制品页路由 path（相对 project 的仓库路径段） */
export function harborRepoUrlSegmentsForProject(project: string, repoName: string): string {
  return harborRepoUrlPath(harborRepoRelativeToProject(project, repoName));
}

/** 与后端 harborSanitizeRepositoryListQ 一致：避免 repositories?q= 含镜像引用冒号触发 Harbor 400 */
export function harborNormalizeRepositoriesQuery(raw: string): string {
  let s = raw.trim();
  if (!s) return "";
  while (s.endsWith(":") || s.endsWith("：")) {
    s = s.slice(0, -1).trimEnd();
  }
  if (!s) return "";
  const ascii = s.lastIndexOf(":");
  const full = s.lastIndexOf("：");
  const i = Math.max(ascii, full);
  if (i > 0) {
    const rhs = s.slice(i + 1).trim();
    const tagOk = rhs.length > 0 && !rhs.includes("/") && /^[A-Za-z0-9._-]+$/.test(rhs);
    if (tagOk) s = s.slice(0, i).trim();
  }
  return s.trim();
}

/** Harbor 制品 API：仓库名放在 query repository（与 Gin 路由兼容） */
export function harborArtifactsApi(project: string, repoPath: string, extraParams?: Record<string, string>) {
  const qs = new URLSearchParams();
  qs.set("repository", repoPath);
  if (extraParams) {
    for (const [k, v] of Object.entries(extraParams)) {
      if (v !== undefined && v !== "") qs.set(k, v);
    }
  }
  return `/api/harbor/projects/${encodeURIComponent(project)}/artifacts?${qs.toString()}`;
}

/** Harbor 制品附加信息：build_history（镜像层/打包历史）、readme 等；addition 默认 build_history */
export function harborArtifactAdditionApi(
  project: string,
  repoPath: string,
  reference: string,
  addition: string = "build_history"
) {
  const qs = new URLSearchParams();
  qs.set("repository", repoPath);
  qs.set("reference", reference);
  qs.set("addition", addition || "build_history");
  return `/api/harbor/projects/${encodeURIComponent(project)}/artifact-additions?${qs.toString()}`;
}

/** Harbor OCI 引用：registry/project/repo:tag */
export function harborDockerImageRef(registryHost: string, project: string, repoPath: string, tag: string): string {
  const host = registryHost.trim();
  const proj = project.trim();
  const repo = repoPath.trim().replace(/^\/+|\/+$/g, "");
  const t = tag.trim();
  if (!host || !proj || !repo || !t) return "";
  return `${host}/${proj}/${repo}:${t}`;
}

/** 按 digest：registry/project/repo@sha256:... */
export function harborDockerImageRefDigest(registryHost: string, project: string, repoPath: string, digest: string): string {
  const host = registryHost.trim();
  const proj = project.trim();
  const repo = repoPath.trim().replace(/^\/+|\/+$/g, "");
  const d = digest.trim();
  if (!host || !proj || !repo || !d) return "";
  return `${host}/${proj}/${repo}@${d}`;
}

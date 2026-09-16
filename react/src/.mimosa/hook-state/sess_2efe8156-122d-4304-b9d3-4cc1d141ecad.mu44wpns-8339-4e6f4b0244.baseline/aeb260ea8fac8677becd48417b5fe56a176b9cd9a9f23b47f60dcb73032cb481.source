import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, matchPath, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, History, Library } from "lucide-react";
import { Editor } from "@bytemd/react";
import gfm from "@bytemd/plugin-gfm";
import highlight from "@bytemd/plugin-highlight";
import math from "@bytemd/plugin-math";
import breaks from "@bytemd/plugin-breaks";
import frontmatter from "@bytemd/plugin-frontmatter";
import mermaid from "@bytemd/plugin-mermaid";
import zhHans from "bytemd/locales/zh_Hans.json";
import "bytemd/dist/index.css";
import "github-markdown-css/github-markdown-light.css";
import "highlight.js/styles/xcode.css";
import "katex/dist/katex.min.css";
import "./md-editor-shell.css";
import { enhancePreviewCodeBlocks } from "./enhancePreviewCodeBlocks";

import { Toolbar } from "./Toolbar";
import { DocumentsList } from "./DocumentsList";
import { Notification } from "./Notification";
import { DEFAULT_EXCALIDRAW_SCENE } from "./docExcalidrawConstants";

const DocExcalidrawPane = lazy(() =>
  import("./DocExcalidrawPane").then((m) => ({ default: m.DocExcalidrawPane }))
);
import { exportMarkdown } from "./utils/exportMarkdown";
import type { EduMdDocument } from "./types";
import { API_BASE, ApiHttpError, apiDeleteJson, apiGetJson, apiPostJson, apiPutJson } from "@/lib/api";
import { useAuth } from "@/auth/auth-context";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { formatDateTimeShanghai } from "@/lib/datetime-cn";

type ApiDocRow = {
  id: number;
  title: string;
  updatedAt: string;
  createdAt?: string;
  contentKind?: string;
};

type ApiDocDetail = Record<string, unknown> & {
  hasSharePassword?: boolean;
  contentKind?: string;
};

function toMs(iso?: string): number {
  if (!iso) return Date.now();
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : Date.now();
}

function firstUrlFromUploadMarkdown(md: string): string | null {
  const s = md.trim();
  const img = s.match(/!\[[^\]]*]\(([^)\s]+)/);
  if (img?.[1]) return img[1];
  const link = s.match(/\[[^\]]*]\(([^)\s]+)/);
  if (link?.[1]) return link[1];
  return null;
}

const plugins = [gfm(), highlight(), math(), breaks(), frontmatter(), mermaid()];

export default function MdEditorPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const { status } = useAuth();
  const isAdmin = status?.role === "admin";

  const docMatch = matchPath({ path: "/docs/doc/:docId", end: true }, location.pathname);
  const docId = docMatch?.params.docId ?? null;
  const activeNumericId = docId && /^\d+$/.test(docId) ? docId : null;

  const [editorTitle, setEditorTitle] = useState("");
  const [editorBody, setEditorBody] = useState("");
  const [published, setPublished] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [saveVersion, setSaveVersion] = useState(true);
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(
    null
  );
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharePwdDraft, setSharePwdDraft] = useState("");
  const [clearSharePwd, setClearSharePwd] = useState(false);
  const [contentKind, setContentKind] = useState<"markdown" | "excalidraw">("markdown");

  const listQ = useQuery({
    queryKey: ["docs-list", ""],
    queryFn: ({ signal }) => apiGetJson<{ docs: ApiDocRow[] }>("/api/docs", { signal }),
    enabled: isAdmin,
  });

  const catQ = useQuery({
    queryKey: ["docs-categories"],
    queryFn: ({ signal }) => apiGetJson<{ categories: { id: number; name: string }[] }>("/api/docs/categories", { signal }),
    enabled: isAdmin,
  });

  const detailQ = useQuery({
    queryKey: ["doc", activeNumericId],
    queryFn: ({ signal }) => apiGetJson<ApiDocDetail>(`/api/docs/${activeNumericId}`, { signal }),
    enabled: Boolean(isAdmin && activeNumericId),
  });

  const verQ = useQuery({
    queryKey: ["doc-versions", activeNumericId],
    queryFn: ({ signal }) =>
      apiGetJson<{ versions: { versionNo: number; title: string; createdBy: string; createdAt: string }[] }>(
        `/api/docs/${activeNumericId}/versions`
      , { signal }),
    enabled: versionsOpen && Boolean(activeNumericId),
  });

  useEffect(() => {
    if (!detailQ.data) return;
    const d = detailQ.data;
    setEditorTitle(String(d.title ?? ""));
    setEditorBody(String(d.bodyMarkdown ?? ""));
    setPublished(Boolean(d.published));
    setContentKind(String(d.contentKind ?? "").toLowerCase() === "excalidraw" ? "excalidraw" : "markdown");
    if (d.categoryId != null) setCategoryId(String(d.categoryId));
    const tn = d.tagNames;
    if (Array.isArray(tn)) setTagInput((tn as string[]).join(", "));
  }, [detailQ.data]);

  useEffect(() => {
    if (activeNumericId) return;
    setEditorTitle("");
    setEditorBody("");
    setPublished(false);
    setCategoryId("");
    setTagInput("");
    setContentKind("markdown");
  }, [activeNumericId]);

  useEffect(() => {
    if (!shareOpen) {
      setSharePwdDraft("");
      setClearSharePwd(false);
    }
  }, [shareOpen]);

  /** 预览区：Mac 窗口条 + 复制（与分享页一致） */
  useEffect(() => {
    if (contentKind !== "markdown" || !activeNumericId) return;
    let cancelled = false;
    let mo: MutationObserver | null = null;
    let attempts = 0;

    const run = () => {
      if (cancelled) return;
      const root = document.querySelector<HTMLElement>(".md-editor-root .bytemd-preview .markdown-body");
      enhancePreviewCodeBlocks(root);
    };

    const trySetup = () => {
      if (cancelled) return;
      const preview = document.querySelector(".md-editor-root .bytemd-preview");
      if (!preview) {
        if (attempts++ < 90) requestAnimationFrame(trySetup);
        return;
      }
      run();
      mo = new MutationObserver(() => requestAnimationFrame(run));
      mo.observe(preview, { childList: true, subtree: true });
    };

    requestAnimationFrame(() => requestAnimationFrame(trySetup));

    return () => {
      cancelled = true;
      mo?.disconnect();
    };
  }, [editorBody, contentKind, activeNumericId]);

  const hasSharePassword = Boolean(detailQ.data?.hasSharePassword);

  const sharePageHref =
    activeNumericId && published ? `/r/${activeNumericId}.html` : "";

  const sharePageFullUrl = useMemo(() => {
    if (!sharePageHref) return "";
    if (typeof window === "undefined") return sharePageHref;
    return `${window.location.origin}${sharePageHref}`;
  }, [sharePageHref]);

  const showNotification = (message: string, type: "success" | "error") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const listRows = listQ.data?.docs ?? [];

  const documents: EduMdDocument[] = useMemo(() => {
    return listRows.map((d) => {
      const id = String(d.id);
      const rowKind =
        String((d as ApiDocRow).contentKind ?? "").toLowerCase() === "excalidraw" ? "excalidraw" : "markdown";
      if (activeNumericId === id) {
        return {
          id,
          title: editorTitle.trim() || "未命名",
          content: editorBody,
          contentKind,
          created: toMs(d.createdAt ?? d.updatedAt),
          updated: toMs(d.updatedAt),
        };
      }
      return {
        id,
        title: d.title || "未命名",
        content: "",
        contentKind: rowKind,
        created: toMs(d.createdAt ?? d.updatedAt),
        updated: toMs(d.updatedAt),
      };
    });
  }, [listRows, activeNumericId, editorTitle, editorBody, contentKind]);

  const currentDoc: EduMdDocument | null = useMemo(() => {
    if (!activeNumericId) return null;
    return documents.find((x) => x.id === activeNumericId) ?? null;
  }, [documents, activeNumericId]);

  const uploadFile = async (file: File, kind: string) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", kind);
    if (activeNumericId) fd.append("docId", activeNumericId);
    const r = await fetch(`${API_BASE}/api/docs/upload`, {
      method: "POST",
      body: fd,
      credentials: API_BASE ? "include" : "same-origin",
    });
    const j = (await r.json()) as { markdown?: string; error?: string };
    if (!r.ok) throw new Error(j.error || "上传失败");
    return j.markdown || "";
  };

  const uploadImages = async (files: File[]) => {
    const out: { url: string; alt?: string; title?: string }[] = [];
    for (const file of files) {
      try {
        const kind = file.type.startsWith("image/") ? "image" : "attachment";
        const md = await uploadFile(file, kind);
        const url = firstUrlFromUploadMarkdown(md);
        if (url) {
          out.push({ url, title: file.name, alt: file.name });
        }
      } catch (e) {
        toast.error(String(e));
      }
    }
    return out;
  };

  const extractTitle = (content: string): string => {
    const m = content.match(/^#\s+(.+)$/m);
    return m ? m[1].trim() : "";
  };

  const handleDocChange = (content: string) => {
    setEditorBody(content);
    if (contentKind === "excalidraw") return;
    const t = extractTitle(content);
    if (t) setEditorTitle(t);
  };

  const createMarkdownMut = useMutation({
    mutationFn: () =>
      apiPostJson<{ id: number }>("/api/docs", {
        title: "未命名文档",
        bodyMarkdown: "",
        contentKind: "markdown",
        published: false,
        saveVersion: true,
        tagNames: [] as string[],
      }),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["docs-list"] });
      showNotification("新文档已创建", "success");
      if (data?.id) navigate(`/docs/doc/${data.id}`, { replace: true });
    },
    onError: (e) => showNotification(e instanceof ApiHttpError ? e.serverMessage : String(e), "error"),
  });

  const createExcalidrawMut = useMutation({
    mutationFn: () =>
      apiPostJson<{ id: number }>("/api/docs", {
        title: "未命名画布",
        bodyMarkdown: DEFAULT_EXCALIDRAW_SCENE,
        contentKind: "excalidraw",
        published: false,
        saveVersion: true,
        tagNames: [] as string[],
      }),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["docs-list"] });
      showNotification("新画布已创建", "success");
      if (data?.id) navigate(`/docs/doc/${data.id}`, { replace: true });
    },
    onError: (e) => showNotification(e instanceof ApiHttpError ? e.serverMessage : String(e), "error"),
  });

  const saveMut = useMutation({
    mutationFn: () => {
      const tagNames = tagInput
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const cat = categoryId ? parseInt(categoryId, 10) : undefined;
      const payload = {
        title: editorTitle.trim() || extractTitle(editorBody) || "未命名",
        bodyMarkdown: editorBody,
        contentKind,
        categoryId: cat && !Number.isNaN(cat) ? cat : undefined,
        tagNames,
        published,
        saveVersion,
      };
      if (!activeNumericId) throw new Error("未选择文档");
      return apiPutJson<{ ok?: boolean; unchanged?: boolean }>(`/api/docs/${activeNumericId}`, payload);
    },
    onSuccess: (data) => {
      if (data?.unchanged) {
        showNotification("文档无变更，未更新修改时间", "success");
        toast.message("无变更，未写入数据库");
        return;
      }
      void qc.invalidateQueries({ queryKey: ["docs-list"] });
      void qc.invalidateQueries({ queryKey: ["doc", activeNumericId] });
      void qc.invalidateQueries({ queryKey: ["doc-versions", activeNumericId] });
      showNotification("已同步到服务器", "success");
      toast.success("已保存");
    },
    onError: (e) => {
      const msg = e instanceof ApiHttpError ? e.serverMessage : String(e);
      showNotification(msg, "error");
      toast.error(msg);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiDeleteJson(`/api/docs/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["docs-list"] });
      showNotification("文档已删除", "success");
      navigate("/docs", { replace: true });
    },
    onError: (e) => showNotification(e instanceof ApiHttpError ? e.serverMessage : String(e), "error"),
  });

  const shareSaveMut = useMutation({
    mutationFn: async () => {
      const tagNames = tagInput
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const cat = categoryId ? parseInt(categoryId, 10) : undefined;
      const payload: Record<string, unknown> = {
        title: editorTitle.trim() || extractTitle(editorBody) || "未命名",
        bodyMarkdown: editorBody,
        contentKind,
        categoryId: cat && !Number.isNaN(cat) ? cat : undefined,
        tagNames,
        published,
        saveVersion: false,
      };
      if (clearSharePwd) payload.newSharePassword = "";
      else if (sharePwdDraft.trim() !== "") payload.newSharePassword = sharePwdDraft.trim();
      if (!activeNumericId) throw new Error("未选择文档");
      return apiPutJson(`/api/docs/${activeNumericId}`, payload);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["doc", activeNumericId] });
      toast.success("分享设置已保存");
      setSharePwdDraft("");
      setClearSharePwd(false);
    },
    onError: (e) => toast.error(e instanceof ApiHttpError ? e.serverMessage : String(e)),
  });

  const restoreMut = useMutation({
    mutationFn: (versionNo: number) =>
      apiPostJson(`/api/docs/${activeNumericId}/restore-version`, { versionNo }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["doc", activeNumericId] });
      setVersionsOpen(false);
      toast.success("已恢复版本");
    },
    onError: (e) => toast.error(e instanceof ApiHttpError ? e.serverMessage : String(e)),
  });

  const createNewMarkdown = () => createMarkdownMut.mutate();
  const createNewCanvas = () => createExcalidrawMut.mutate();

  const saveDoc = () => {
    if (!activeNumericId) return;
    saveMut.mutate();
  };

  const saveDocRef = useRef(saveDoc);
  saveDocRef.current = saveDoc;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "s") return;
      const el = e.target as HTMLElement | null;
      if (el?.closest?.("[data-skip-editor-save-shortcut]")) return;
      if (!activeNumericId || saveMut.isPending) return;
      e.preventDefault();
      saveDocRef.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [activeNumericId, saveMut.isPending]);

  const storageQ = useQuery({
    queryKey: ["docs-attachment-storage"],
    queryFn: ({ signal }) =>
      apiGetJson<{
        mode?: string;
        cos?: {
          configured?: boolean;
          bucket?: string;
          region?: string;
          prefix?: string;
          publicBase?: string;
          source?: string;
        };
        configureHint?: string;
      }>("/api/docs/attachment-storage", { signal }),
    enabled: isAdmin,
    staleTime: 60_000,
  });

  const deleteDoc = (id: string) => {
    if (!window.confirm("确定要删除这个文档吗？（服务器同步删除）")) return;
    deleteMut.mutate(id);
  };

  const handleExportMd = () => {
    if (contentKind === "excalidraw") {
      toast.message("画布请使用分享页阅读；不支持导出 .md");
      return;
    }
    exportMarkdown(editorBody, editorTitle || "document");
  };

  const onSelect = useCallback(
    (doc: EduMdDocument) => {
      navigate(`/docs/doc/${doc.id}`);
    },
    [navigate]
  );

  const attachmentStorageSummary = useMemo(() => {
    const d = storageQ.data;
    if (!d) return null;
    if (d.mode === "cos" && d.cos?.configured) {
      const bits = [d.cos.bucket, d.cos.region].filter(Boolean).join(" · ");
      const src =
        d.cos.source === "kv" ? "控制台" : d.cos.source === "env" ? "环境变量" : "";
      return {
        line: `附件：腾讯云 COS${bits ? ` · ${bits}` : ""}${src ? `（${src}）` : ""}`,
        hint: d.configureHint,
      };
    }
    return { line: "附件：本地存储（可在「媒体库」配置 COS）", hint: d.configureHint };
  }, [storageQ.data]);

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-12 text-center text-sm text-slate-600">
        <p>仅管理员可使用文档编辑器。</p>
        <Link className="text-violet-700 underline" to="/docs">
          返回
        </Link>
      </div>
    );
  }

  return (
    <div className="md-editor-root flex min-h-0 w-full flex-1 flex-col">
      <Toolbar
        onNewMarkdown={createNewMarkdown}
        onNewExcalidraw={createNewCanvas}
        onSave={saveDoc}
        onExportMd={handleExportMd}
        onShare={() => setShareOpen(true)}
        disabled={!activeNumericId || saveMut.isPending}
        shareDisabled={!activeNumericId || !published}
        exportDisabled={contentKind === "excalidraw"}
        showExternalPromo={false}
        attachmentStorageSummary={attachmentStorageSummary}
      />

      {activeNumericId ? (
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3 border-b border-slate-200 bg-slate-50/90 px-4 py-3">
          <Button variant="outline" size="sm" className="h-9 shrink-0" asChild>
            <Link to="/docs" className="gap-1.5">
              <Library className="h-3.5 w-3.5 opacity-80" aria-hidden />
              文档库
            </Link>
          </Button>

          <div className="flex min-w-[7.5rem] flex-col gap-1">
            <Label htmlFor="doc-published" className="text-muted-foreground text-xs font-medium">
              发布
            </Label>
            <div className="flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5">
              <Switch id="doc-published" checked={published} onCheckedChange={setPublished} />
              <span className="text-muted-foreground text-xs">公开页</span>
            </div>
          </div>

          <div className="flex min-w-[7.5rem] flex-col gap-1">
            <Label htmlFor="doc-save-ver" className="text-muted-foreground text-xs font-medium">
              保留版本
            </Label>
            <div className="flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5">
              <Switch id="doc-save-ver" checked={saveVersion} onCheckedChange={setSaveVersion} />
            </div>
          </div>

          <div className="flex min-w-[9rem] max-w-[14rem] flex-1 flex-col gap-1">
            <Label htmlFor="doc-cat" className="text-muted-foreground text-xs font-medium">
              目录
            </Label>
            <Select
              value={categoryId ? categoryId : "__none__"}
              onValueChange={(v) => setCategoryId(v === "__none__" ? "" : v)}
            >
              <SelectTrigger id="doc-cat" className="h-9 w-full bg-white">
                <SelectValue placeholder="未分类" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">未分类</SelectItem>
                {(catQ.data?.categories ?? []).map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex min-w-[10rem] max-w-[20rem] flex-[1.1] flex-col gap-1">
            <Label htmlFor="doc-tags" className="text-muted-foreground text-xs font-medium">
              标签
            </Label>
            <Input
              id="doc-tags"
              className="h-9 bg-white"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="逗号分隔"
            />
          </div>

          <div className="flex min-w-[12rem] max-w-[28rem] flex-[1.4] flex-col gap-1">
            <Label htmlFor="doc-title-bar" className="text-muted-foreground text-xs font-medium">
              标题
            </Label>
            <div className="flex h-9 items-center gap-2">
              <Input
                id="doc-title-bar"
                className="h-9 flex-1 bg-white"
                value={editorTitle}
                onChange={(e) => setEditorTitle(e.target.value)}
                placeholder="文档标题"
              />
              <Badge variant="outline" className="h-8 shrink-0 font-normal text-[10px] text-slate-600">
                {contentKind === "excalidraw" ? "画布" : "Markdown"}
              </Badge>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0 gap-1"
            onClick={() => setVersionsOpen(true)}
          >
            <History className="h-3.5 w-3.5 opacity-80" aria-hidden />
            版本
          </Button>
        </div>
      ) : null}

      <div className="md-editor-inner min-h-0 flex-1">
        <DocumentsList
          documents={documents}
          currentDoc={currentDoc}
          onSelect={onSelect}
          onDelete={deleteDoc}
        />

        <div className="md-editor-panel min-h-0 min-w-0 flex-1">
          {activeNumericId ? (
            detailQ.isLoading ? (
              <div className="md-editor-placeholder">加载中…</div>
            ) : contentKind === "excalidraw" ? (
              <Suspense fallback={<div className="md-editor-placeholder">加载画布组件…</div>}>
                <DocExcalidrawPane
                  key={`${activeNumericId}-${String(detailQ.data?.updatedAt ?? "")}`}
                  docId={activeNumericId}
                  value={editorBody}
                  onChange={setEditorBody}
                />
              </Suspense>
            ) : (
              <Editor
                value={editorBody}
                plugins={plugins}
                locale={zhHans}
                onChange={handleDocChange}
                mode="split"
                placeholder="开始编写你的 Markdown 文档…"
                uploadImages={uploadImages}
                editorConfig={{ lineNumbers: true }}
              />
            )
          ) : (
            <div className="md-editor-placeholder">
              <BookOpen className="mb-2 h-14 w-14 text-slate-300" strokeWidth={1.25} aria-hidden />
              <p className="text-base font-medium text-slate-700">文档仓库</p>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
                选择左侧文档编辑，或使用下方新建。Markdown 支持 GFM / 公式 / Mermaid；画布使用 Excalidraw。保存后可发布飞书风分享页。
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Button
                  type="button"
                  className="bg-violet-600 hover:bg-violet-700"
                  onClick={createNewMarkdown}
                  disabled={createMarkdownMut.isPending}
                >
                  新建 Markdown
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={createNewCanvas}
                  disabled={createExcalidrawMut.isPending}
                >
                  新建画布
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {notification ? <Notification message={notification.message} type={notification.type} /> : null}

      <Sheet open={versionsOpen} onOpenChange={setVersionsOpen}>
        <SheetContent className="flex w-full flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle>版本记录</SheetTitle>
            <SheetDescription className="text-left">恢复后将新增一条版本记录。</SheetDescription>
          </SheetHeader>
          <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto text-sm">
            {(verQ.data?.versions ?? []).map((v) => (
              <div
                key={v.versionNo}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-2"
              >
                <div>
                  <p className="font-medium">
                    v{v.versionNo} · {v.title || "（无标题）"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatDateTimeShanghai(v.createdAt)} · {v.createdBy}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={restoreMut.isPending}
                  onClick={() => restoreMut.mutate(v.versionNo)}
                >
                  恢复
                </Button>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={shareOpen} onOpenChange={setShareOpen}>
        <SheetContent className="flex w-full flex-col gap-4 sm:max-w-md">
          <SheetHeader>
            <SheetTitle>分享</SheetTitle>
            <SheetDescription className="text-left">
              发布并保存后，访客可通过链接阅读；可选访问密码，验证通过后 30 天内同浏览器免再次输入。
            </SheetDescription>
          </SheetHeader>
          {!published ? (
            <p className="text-muted-foreground text-sm">请先在上方打开「发布 · 公开页」，并点击工具栏「保存」后再分享。</p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium">分享链接</Label>
                <div className="flex gap-2">
                  <Input readOnly className="h-10 font-mono text-xs" value={sharePageFullUrl || sharePageHref} />
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-10 shrink-0"
                    onClick={() => {
                      const t = sharePageFullUrl || sharePageHref;
                      if (!t) return;
                      void navigator.clipboard.writeText(t).then(
                        () => toast.success("已复制链接"),
                        () => toast.error("复制失败")
                      );
                    }}
                  >
                    复制
                  </Button>
                </div>
              </div>
              {hasSharePassword ? (
                <p className="text-muted-foreground text-xs">当前已启用访问密码。</p>
              ) : (
                <p className="text-muted-foreground text-xs">未设置密码时，持有链接的访客可直接阅读。</p>
              )}
              <div className="space-y-2">
                <Label htmlFor="share-new-pw" className="text-xs font-medium">
                  新访问密码
                </Label>
                <Input
                  id="share-new-pw"
                  type="password"
                  autoComplete="new-password"
                  className="h-10"
                  value={sharePwdDraft}
                  onChange={(e) => setSharePwdDraft(e.target.value)}
                  placeholder="留空则不修改已有密码"
                  disabled={clearSharePwd}
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="share-clear-pw"
                  checked={clearSharePwd}
                  onCheckedChange={(v) => setClearSharePwd(v === true)}
                />
                <Label htmlFor="share-clear-pw" className="text-sm font-normal">
                  清除访问密码
                </Label>
              </div>
              <Button
                type="button"
                className="w-full sm:w-auto"
                disabled={shareSaveMut.isPending || !activeNumericId}
                onClick={() => shareSaveMut.mutate()}
              >
                保存分享设置
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

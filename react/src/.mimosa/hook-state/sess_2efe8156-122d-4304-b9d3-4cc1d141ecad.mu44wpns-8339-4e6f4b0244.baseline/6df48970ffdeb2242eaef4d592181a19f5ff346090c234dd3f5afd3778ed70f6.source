import React, { useMemo, useState } from "react";
import classNames from "classnames";
import { FileText, PenLine, Search } from "lucide-react";
import type { EduMdDocument } from "./types";
import styles from "./document-list.module.css";

export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60000) {
    return "刚刚";
  }
  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `${minutes}分钟前`;
  }
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours}小时前`;
  }
  if (diff < 604800000) {
    const days = Math.floor(diff / 86400000);
    return `${days}天前`;
  }
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface DocumentsListProps {
  documents: EduMdDocument[];
  currentDoc: EduMdDocument | null;
  onSelect: (doc: EduMdDocument) => void;
  onDelete: (docId: string) => void;
}

export const DocumentsList: React.FC<DocumentsListProps> = ({
  documents,
  currentDoc,
  onSelect,
  onDelete,
}) => {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return documents;
    return documents.filter((d) => d.title.toLowerCase().includes(t));
  }, [documents, q]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <div>
            <h2 className={styles.title}>Markdown 文档库</h2>
            <p className={styles.sub}>.md · GFM · 代码高亮 · Mermaid</p>
          </div>
          <span className={styles.count}>{documents.length} 篇</span>
        </div>
        <div className={styles.searchWrap}>
          <div className={styles.searchOuter}>
            <Search className={styles.searchIcon} aria-hidden strokeWidth={2} />
            <input
              type="search"
              className={styles.search}
              placeholder="按标题筛选…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="筛选文档标题"
            />
          </div>
        </div>
      </div>

      <div className={styles.list}>
        {documents.length === 0 ? (
          <div className={styles.empty}>
            <FileText className={styles.emptyIcon} size={48} strokeWidth={1} aria-hidden />
            <p className="font-medium text-slate-600">文库为空</p>
            <p className={styles.emptyTip}>使用顶部「Markdown」或「画布」创建文档，支持版本与飞书风分享页。</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className={styles.noMatch}>
            没有标题包含「{q.trim()}」的文档
            <br />
            <button
              type="button"
              className="mt-2 text-sm font-medium text-violet-700 underline-offset-2 hover:underline"
              onClick={() => setQ("")}
            >
              清除筛选
            </button>
          </div>
        ) : (
          filtered.map((doc) => (
            <div
              key={doc.id}
              role="button"
              tabIndex={0}
              className={classNames(styles.item, {
                [styles.active]: currentDoc?.id === doc.id,
              })}
              onClick={() => onSelect(doc)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(doc);
                }
              }}
            >
              <div className={styles.itemIcon}>
                {doc.contentKind === "excalidraw" ? (
                  <PenLine size={20} strokeWidth={1.75} aria-hidden />
                ) : (
                  <FileText size={20} strokeWidth={1.75} aria-hidden />
                )}
              </div>

              <div className={styles.itemContent}>
                <div className={styles.itemTitle}>{doc.title}</div>
                <div className={styles.itemMeta}>
                  <span className={styles.itemDate}>{formatDate(doc.updated)}</span>
                  <span className={styles.itemWords}>
                    {doc.contentKind === "excalidraw"
                      ? "画布"
                      : doc.content.length > 0
                        ? `${doc.content.length} 字`
                        : "未加载正文"}
                  </span>
                </div>
              </div>

              <button
                type="button"
                className={styles.deleteButton}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(doc.id);
                }}
                title="删除文档"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
                  <path
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    fill="none"
                  />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

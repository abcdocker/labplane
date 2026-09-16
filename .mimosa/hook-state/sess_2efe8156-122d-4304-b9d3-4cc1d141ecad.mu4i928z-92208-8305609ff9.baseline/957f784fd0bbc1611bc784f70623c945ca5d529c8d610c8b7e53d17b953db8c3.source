package internal

import (
	"bytes"
	"html/template"
	"strings"
	"sync"
	"time"
)

type docPublicPageData struct {
	Title          string
	BodyHTML       template.HTML
	SceneB64Quoted template.JS
	IsExcalidraw   bool
	HasExDrawErr   bool
	ExcalidrawErr  string
	SiteLabel      string
	HomeURL        string
	Author         string
	HasAuthor      bool
	Updated        string
	HasUpdated     bool
	Created        string
	HasCreated     bool
	Category       string
	HasCategory    bool
	Tags           []string
	DocID          uint64
	Year           int
	Desc           string
	DocPublicPageAssetFields
}

type docUnlockPageData struct {
	SiteLabel  string
	DocTitle   string
	ActionPath string
	ErrMsg     string
	HasErr     bool
	HomeURL    string
}

var (
	docPublicPageTmpl     *template.Template
	docPublicPageTmplOnce sync.Once
	docUnlockTmpl         *template.Template
	docUnlockTmplOnce     sync.Once
)

func docPublicPageTemplate() *template.Template {
	docPublicPageTmplOnce.Do(func() {
		docPublicPageTmpl = template.Must(template.New("doc_public").Parse(docPublicPageHTML))
	})
	return docPublicPageTmpl
}

func docUnlockTemplate() *template.Template {
	docUnlockTmplOnce.Do(func() {
		docUnlockTmpl = template.Must(template.New("doc_unlock").Parse(docPublicUnlockHTML))
	})
	return docUnlockTmpl
}

// RenderDocPublicUnlockPage 分享链接启用访问密码时的解锁表单。
func RenderDocPublicUnlockPage(d docUnlockPageData) ([]byte, error) {
	if strings.TrimSpace(d.HomeURL) == "" {
		d.HomeURL = "/"
	}
	var buf bytes.Buffer
	if err := docUnlockTemplate().Execute(&buf, d); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// RenderDocPublicPageHTML 生成已发布文档的完整预览页 HTML（UTF-8）；Markdown 或 Excalidraw 画布。
func RenderDocPublicPageHTML(d docPublicPageData) ([]byte, error) {
	if d.Year == 0 {
		d.Year = time.Now().In(BeijingLocation()).Year()
	}
	if strings.TrimSpace(d.HomeURL) == "" {
		d.HomeURL = "/"
	}
	var buf bytes.Buffer
	if err := docPublicPageTemplate().Execute(&buf, d); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

const docPublicPageHTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>{{.Title}}</title>
{{if .Desc}}<meta name="description" content="{{.Desc}}">{{end}}
<meta property="og:title" content="{{.Title}}">
{{if .Desc}}<meta property="og:description" content="{{.Desc}}">{{end}}
<meta property="og:type" content="article">
{{if .IsExcalidraw}}
<link rel="stylesheet" href="{{.CSSExcalidraw}}" crossorigin="anonymous">
{{else}}
<link rel="stylesheet" href="{{.CSSGithubMarkdown}}" crossorigin="anonymous">
<link rel="stylesheet" href="{{.CSSHighlightTheme}}" crossorigin="anonymous">
<link rel="stylesheet" href="{{.CSSKatex}}" crossorigin="anonymous">
{{end}}
<style>
:root {
  --fs-bg: #f5f6f7;
  --fs-surface: #ffffff;
  --fs-border: #e5e6eb;
  --fs-text: #1f2329;
  --fs-secondary: #646a73;
  --fs-tertiary: #8f959e;
  --fs-link: #3370ff;
  --fs-radius: 12px;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  min-height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  color: var(--fs-text);
  background: var(--fs-bg);
  line-height: 1.65;
  font-size: 15px;
}
a { color: var(--fs-link); text-decoration: none; }
a:hover { text-decoration: underline; }
.fs-header {
  position: sticky;
  top: 0;
  z-index: 50;
  background: rgba(255,255,255,.92);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--fs-border);
}
.fs-header-inner {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0.65rem 1.25rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
.fs-brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--fs-secondary);
}
.fs-brand-mark {
  width: 6px;
  height: 18px;
  border-radius: 3px;
  background: linear-gradient(180deg, #3370ff, #6aa1ff);
}
.fs-nav {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.fs-nav a {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--fs-secondary);
}
.fs-nav a:hover { color: var(--fs-link); text-decoration: none; }
.fs-pill {
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--fs-link);
  background: rgba(51,112,255,.1);
  border: 1px solid rgba(51,112,255,.2);
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
}
.fs-shell { max-width: 1320px; margin: 0 auto; padding: 1.5rem 1.15rem 3.5rem; }
@media (min-width: 640px) { .fs-shell { padding: 2rem 1.5rem 4rem; } }
/* 正文 + 左侧目录 */
.fs-doc-layout {
  display: flex;
  align-items: flex-start;
  gap: 1.5rem;
}
.fs-doc-layout-main { flex: 1; min-width: 0; }
.fs-toc-wrap {
  display: none;
  width: 220px;
  flex-shrink: 0;
  position: sticky;
  top: 3.5rem;
  align-self: flex-start;
  max-height: calc(100vh - 4.5rem);
  overflow: auto;
  padding: 0.35rem 0.65rem 0.75rem 0;
  border-right: 1px solid var(--fs-border);
  margin: -0.25rem 0 0;
}
@media (min-width: 900px) {
  .fs-toc-wrap.fs-toc-visible { display: block; }
}
.fs-toc-title {
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fs-tertiary);
  margin: 0 0 0.65rem;
  padding-right: 0.5rem;
}
.fs-toc-wrap ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.fs-toc-wrap .fs-toc-root > li { margin: 0.2rem 0; }
.fs-toc-wrap .fs-toc-sub { padding-left: 0.75rem; margin-top: 0.2rem; }
.fs-toc-wrap a {
  display: block;
  padding: 0.2rem 0.35rem 0.2rem 0;
  font-size: 0.8125rem;
  line-height: 1.45;
  color: var(--fs-secondary);
  text-decoration: none;
  border-radius: 4px;
  word-break: break-word;
}
.fs-toc-wrap a:hover { color: var(--fs-link); background: rgba(51,112,255,.06); text-decoration: none; }
.feishu-doc.markdown-body h1,
.feishu-doc.markdown-body h2,
.feishu-doc.markdown-body h3,
.feishu-doc.markdown-body h4,
.feishu-doc.markdown-body h5,
.feishu-doc.markdown-body h6 { scroll-margin-top: 4.5rem; }
.fs-shell-excanvas {
  max-width: min(98vw, 1760px);
  margin: 0 auto;
  padding: 0.35rem 0.65rem 0.65rem;
}
@media (min-width: 640px) { .fs-shell-excanvas { padding: 0.45rem 1rem 0.85rem; } }
.fs-header-canvas-preview { position: sticky; top: 0; z-index: 50; }
.fs-header-canvas-preview .fs-header-inner { max-width: min(98vw, 1760px); padding-top: 0.45rem; padding-bottom: 0.45rem; }
.fs-card-excanvas { background: transparent; border: none; box-shadow: none; border-radius: 0; overflow: visible; }
.fs-doc-body-excanvas { padding: 0 !important; }
.fs-ex-wrap-fill {
  min-height: calc(100vh - 52px);
  width: 100%;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--fs-border);
  background: var(--fs-surface);
}
.fs-ex-wrap-fill .excalidraw {
  height: calc(100vh - 52px) !important;
  min-height: 600px !important;
}
@media (min-width: 900px) {
  .fs-ex-wrap-fill .excalidraw { min-height: calc(100vh - 56px) !important; }
}
.fs-card {
  background: var(--fs-surface);
  border: 1px solid var(--fs-border);
  border-radius: var(--fs-radius);
  box-shadow: 0 2px 8px rgba(31,35,41,.06);
  overflow: hidden;
}
.fs-card-head {
  padding: 1.75rem 1.5rem 1.25rem;
  border-bottom: 1px solid var(--fs-border);
}
@media (min-width: 640px) { .fs-card-head { padding: 2rem 2rem 1.35rem; } }
.fs-title {
  margin: 0 0 0.75rem;
  font-size: clamp(1.5rem, 4.2vw, 1.875rem);
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.35;
  color: var(--fs-text);
}
.fs-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.25rem;
  font-size: 0.8125rem;
  color: var(--fs-secondary);
}
.fs-meta span { display: inline-flex; align-items: center; gap: 0.25rem; }
.fs-meta-k { color: var(--fs-tertiary); }
.fs-tags { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.75rem; }
.fs-tag {
  font-size: 0.6875rem;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  background: #f2f3f5;
  color: var(--fs-secondary);
  border: 1px solid var(--fs-border);
}
.fs-doc-body { padding: 1.5rem 1.5rem 2.25rem; }
@media (min-width: 640px) { .fs-doc-body { padding: 1.75rem 2rem 2.5rem; } }
.feishu-doc.markdown-body {
  font-size: 16px;
  line-height: 1.74;
  color: var(--fs-text);
  background: transparent !important;
  max-width: none !important;
}
.feishu-doc.markdown-body h1 { font-size: 1.5rem; font-weight: 600; margin: 1.5em 0 0.6em; border: none; }
.feishu-doc.markdown-body h2 {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 1.35em 0 0.5em;
  padding-bottom: 0.35rem;
  border-bottom: 1px solid var(--fs-border);
}
.feishu-doc.markdown-body h3 { font-size: 1.1rem; font-weight: 600; margin: 1.2em 0 0.45em; }
.feishu-doc.markdown-body p { margin: 0.65em 0; }
.feishu-doc.markdown-body ul, .feishu-doc.markdown-body ol { padding-left: 1.35em; margin: 0.65em 0; }
.feishu-doc.markdown-body blockquote {
  margin: 0.85em 0;
  padding: 0.35em 0 0.35em 0.9em;
  border-left: 3px solid #3370ff;
  background: #f7f8fa;
  color: var(--fs-secondary);
}
/* 仅行内 code */
.feishu-doc.markdown-body :not(pre) > code {
  background: #f2f3f5;
  padding: 0.12em 0.35em;
  border-radius: 4px;
  font-size: 0.9em;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", monospace;
}
/* Mac 窗口风代码块 + highlight.js（xcode 主题） */
.feishu-doc.markdown-body .fs-code-window {
  margin: 0.85em 0;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.12);
  box-shadow: 0 4px 22px rgba(0, 0, 0, 0.07), 0 1px 3px rgba(0, 0, 0, 0.06);
  background: #fff;
}
.feishu-doc.markdown-body .fs-code-titlebar {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  min-height: 38px;
  padding: 0 10px 0 12px;
  background: linear-gradient(180deg, #ececec 0%, #e4e4e6 100%);
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  -webkit-user-select: none;
  user-select: none;
}
.feishu-doc.markdown-body .fs-code-dots {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-shrink: 0;
}
.feishu-doc.markdown-body .fs-code-dot {
  display: block;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.35), 0 0.5px 1px rgba(0, 0, 0, 0.22);
}
.feishu-doc.markdown-body .fs-code-dot:nth-child(1) { background: #ff5f57; border: 1px solid #e0443e; }
.feishu-doc.markdown-body .fs-code-dot:nth-child(2) { background: #febc2e; border: 1px solid #dba524; }
.feishu-doc.markdown-body .fs-code-dot:nth-child(3) { background: #28c840; border: 1px solid #1aab29; }
.feishu-doc.markdown-body .fs-code-lang {
  flex: 1;
  min-width: 0;
  text-align: center;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.03em;
  color: #6e6e73;
  text-transform: lowercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.feishu-doc.markdown-body .fs-code-copy {
  flex-shrink: 0;
  margin: 0;
  padding: 0.28rem 0.65rem;
  font-size: 11px;
  font-weight: 600;
  font-family: inherit;
  color: #3c3c43;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 6px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.feishu-doc.markdown-body .fs-code-copy:hover {
  background: #fff;
  border-color: rgba(0, 0, 0, 0.18);
}
.feishu-doc.markdown-body .fs-code-copy:focus-visible {
  outline: 2px solid var(--fs-link);
  outline-offset: 2px;
}
.feishu-doc.markdown-body .fs-code-copy.fs-code-copy-done {
  color: #1a7f37;
  border-color: rgba(26, 127, 55, 0.28);
  background: rgba(26, 127, 55, 0.1);
}
.feishu-doc.markdown-body .fs-code-body {
  display: flex;
  align-items: stretch;
  min-width: 0;
  background: #fff;
}
.feishu-doc.markdown-body .fs-code-gutter {
  margin: 0;
  padding: 14px 10px 16px 12px;
  border-right: 1px solid rgba(0, 0, 0, 0.08);
  background: #f6f7f8;
  color: #8e8e93;
  font-size: 13px;
  line-height: 1.55;
  text-align: right;
  user-select: none;
  -webkit-user-select: none;
  flex-shrink: 0;
  min-width: 2.75em;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  white-space: pre;
  overflow: hidden;
}
.feishu-doc.markdown-body .fs-code-scroll {
  flex: 1;
  min-width: 0;
  overflow: auto;
  max-width: 100%;
  background: #fff;
  -webkit-overflow-scrolling: touch;
}
.feishu-doc.markdown-body .fs-code-scroll pre {
  margin: 0 !important;
  padding: 0 !important;
  background: transparent !important;
  border: none !important;
  border-radius: 0 !important;
  overflow: visible !important;
}
.feishu-doc.markdown-body .fs-code-scroll pre code.hljs {
  display: block;
  padding: 14px 16px 16px;
  overflow-x: auto;
  font-size: 13px;
  line-height: 1.55;
  white-space: pre;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  tab-size: 4;
  border-radius: 0 !important;
}
.feishu-doc.markdown-body table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 0.9375rem; }
.feishu-doc.markdown-body th, .feishu-doc.markdown-body td { border: 1px solid var(--fs-border); padding: 0.5rem 0.65rem; }
.feishu-doc.markdown-body th { background: #f7f8fa; font-weight: 600; }
.fs-ex-wrap { min-height: 560px; width: 100%; border-radius: 8px; overflow: hidden; border: 1px solid var(--fs-border); }
.fs-ex-wrap .excalidraw { height: min(88vh, 1020px) !important; }
.fs-err {
  padding: 1rem 1.25rem;
  border-radius: 8px;
  background: #fff2f0;
  border: 1px solid #ffccc7;
  color: #cf1322;
  font-size: 0.875rem;
}
.fs-footer {
  margin-top: 2rem;
  text-align: center;
  font-size: 0.75rem;
  color: var(--fs-tertiary);
  line-height: 1.6;
}
@media print {
  body { background: #fff; }
  .fs-header { position: static; }
  .fs-card { box-shadow: none; }
  .fs-toc-wrap { display: none !important; }
  .feishu-doc.markdown-body .fs-code-copy { display: none !important; }
  .feishu-doc.markdown-body .fs-code-window { box-shadow: none; break-inside: avoid; }
}
</style>
</head>
<body>
{{if and .IsExcalidraw (not .HasExDrawErr)}}
<header class="fs-header fs-header-canvas-preview">
  <div class="fs-header-inner">
    <div class="fs-brand">
      <span class="fs-brand-mark" aria-hidden="true"></span>
      <span>{{.SiteLabel}}</span>
    </div>
    <div class="fs-nav">
      <a href="{{.HomeURL}}">工作台</a>
      <span class="fs-pill">画布预览 · 只读</span>
    </div>
  </div>
</header>
<div class="fs-shell fs-shell-excanvas">
  <main class="fs-card fs-card-excanvas">
    <div class="fs-doc-body fs-doc-body-excanvas">
      <div id="xr" class="fs-ex-wrap fs-ex-wrap-fill" aria-label="画布预览（只读）"></div>
      <script type="module">
      (async () => {
        const el = document.getElementById("xr");
        const showErr = (msg) => {
          if (el) {
            el.innerHTML = "";
            const p = document.createElement("p");
            p.className = "fs-err";
            p.setAttribute("role", "alert");
            p.textContent = "画布加载失败：" + msg;
            el.appendChild(p);
          }
        };
        try {
          const importMod = async (u, fb) => {
            try {
              return await import(u);
            } catch (first) {
              if (fb) return await import(fb);
              throw first;
            }
          };
          const ReactMod = await importMod({{.ESMReactQuoted}}, {{.ESMReactFallbackQuoted}});
          const React = ReactMod.default ?? ReactMod;
          const { createRoot } = await importMod({{.ESMReactDOMClientQuoted}}, {{.ESMReactDOMClientFallbackQuoted}});
          const mod = await importMod({{.ESMExcalidrawQuoted}}, {{.ESMExcalidrawFallbackQuoted}});
          const Excalidraw = mod.Excalidraw ?? mod.default;
          if (!el || !Excalidraw) {
            showErr(!el ? "容器缺失" : "Excalidraw 模块无效");
            return;
          }
          const raw = JSON.parse(atob({{.SceneB64Quoted}}));
          const appState = Object.assign({ viewBackgroundColor: "#ffffff", theme: "light" }, raw.appState || {});
          delete appState.collaborators;
          appState.editingGroupId = null;
          appState.selectedElementIds = {};
          const initialData = {
            elements: raw.elements || [],
            appState,
            files: raw.files || {},
          };
          const root = createRoot(el);
          root.render(React.createElement(Excalidraw, {
            initialData,
            viewModeEnabled: true,
            zenModeEnabled: true,
            UIOptions: {
              canvasActions: {
                loadScene: false,
                export: false,
                saveToActiveFile: false,
                saveAsImage: false,
                clearCanvas: false,
                toggleTheme: false,
              },
            },
          }));
        } catch (e) {
          showErr(e && e.message ? e.message : String(e));
        }
      })();
      </script>
    </div>
  </main>
</div>
{{else}}
<header class="fs-header">
  <div class="fs-header-inner">
    <div class="fs-brand">
      <span class="fs-brand-mark" aria-hidden="true"></span>
      <span>{{.SiteLabel}}</span>
    </div>
    <div class="fs-nav">
      <a href="{{.HomeURL}}">工作台</a>
      <span class="fs-pill">分享阅读</span>
    </div>
  </div>
</header>
<div class="fs-shell">
  <main class="fs-card">
    <div class="fs-card-head">
      <h1 class="fs-title">{{.Title}}</h1>
      <div class="fs-meta">
        {{if .HasAuthor}}<span><span class="fs-meta-k">作者</span>{{.Author}}</span>{{end}}
        {{if .HasUpdated}}<span><span class="fs-meta-k">更新</span>{{.Updated}}</span>{{end}}
        {{if .HasCreated}}<span><span class="fs-meta-k">创建</span>{{.Created}}</span>{{end}}
        {{if .HasCategory}}<span><span class="fs-meta-k">目录</span>{{.Category}}</span>{{end}}
        <span><span class="fs-meta-k">编号</span>{{.DocID}}</span>
        {{if .IsExcalidraw}}<span><span class="fs-meta-k">类型</span>画布</span>{{end}}
      </div>
      {{if .Tags}}<div class="fs-tags">{{range .Tags}}<span class="fs-tag">{{.}}</span>{{end}}</div>{{end}}
    </div>
    <div class="fs-doc-body">
      {{if .HasExDrawErr}}
      <div class="fs-err" role="alert">画布数据无法展示：{{.ExcalidrawErr}}</div>
      {{else}}
      <div class="fs-doc-layout">
        <aside class="fs-toc-wrap" id="fs-toc-wrap" aria-label="文档目录">
          <p class="fs-toc-title">目录</p>
          <div id="fs-toc-mount"></div>
        </aside>
        <div class="fs-doc-layout-main">
          <article class="markdown-body feishu-doc" id="fs-doc-article">{{.BodyHTML}}</article>
        </div>
      </div>
      {{end}}
    </div>
  </main>
  <footer class="fs-footer">
    <p>由 <strong>{{.SiteLabel}}</strong> 发布 · {{.Year}}</p>
    <p>公开分享链接阅读；若启用访问密码需先验证。</p>
  </footer>
</div>
{{end}}
{{if not .IsExcalidraw}}
<script src="{{.JSHighlight}}" crossorigin="anonymous"></script>
<script>
document.addEventListener("DOMContentLoaded", function () {
  if (window.hljs) { hljs.highlightAll(); }
  var root = document.querySelector(".feishu-doc.markdown-body");
  if (!root) return;
  root.querySelectorAll("pre").forEach(function (pre) {
    if (pre.closest(".fs-code-window")) return;
    var code = pre.querySelector("code");
    if (!code) return;
    var lang = "";
    var cls = code.className || "";
    var m = cls.match(/language-([a-zA-Z0-9_+-]+)/);
    if (m) lang = m[1];
    var displayLang = lang ? lang.replace(/\+/g, " ") : "代码";
    var wrap = document.createElement("div");
    wrap.className = "fs-code-window";
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "代码块");
    var bar = document.createElement("div");
    bar.className = "fs-code-titlebar";
    var dots = document.createElement("span");
    dots.className = "fs-code-dots";
    dots.setAttribute("aria-hidden", "true");
    for (var di = 0; di < 3; di++) {
      var dot = document.createElement("span");
      dot.className = "fs-code-dot";
      dots.appendChild(dot);
    }
    var title = document.createElement("span");
    title.className = "fs-code-lang";
    title.textContent = displayLang;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "fs-code-copy";
    btn.textContent = "复制";
    btn.setAttribute("aria-label", "复制代码");
    btn.addEventListener("click", function () {
      var text = (code.innerText || code.textContent || "").replace(/\u00a0/g, " ");
      function done(ok) {
        btn.textContent = ok ? "已复制" : "复制失败";
        if (ok) btn.classList.add("fs-code-copy-done");
        setTimeout(function () {
          btn.textContent = "复制";
          btn.classList.remove("fs-code-copy-done");
        }, ok ? 2000 : 1600);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done(true); }).catch(function () { fallback(); });
      } else {
        fallback();
      }
      function fallback() {
        try {
          var ta = document.createElement("textarea");
          ta.value = text;
          ta.setAttribute("readonly", "");
          ta.style.position = "fixed";
          ta.style.left = "-9999px";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
          done(true);
        } catch (e) {
          done(false);
        }
      }
    });
    bar.appendChild(dots);
    bar.appendChild(title);
    bar.appendChild(btn);
    var body = document.createElement("div");
    body.className = "fs-code-body";
    var rawLines = ((code.innerText || code.textContent || "").replace(/\u00a0/g, " ")).split("\n");
    if (rawLines.length === 0) rawLines.push("");
    var gutter = document.createElement("pre");
    gutter.className = "fs-code-gutter";
    gutter.setAttribute("aria-hidden", "true");
    var nums = [];
    for (var ni = 0; ni < rawLines.length; ni++) nums.push(String(ni + 1));
    gutter.textContent = nums.join("\n");
    var scroll = document.createElement("div");
    scroll.className = "fs-code-scroll";
    pre.parentNode.insertBefore(wrap, pre);
    wrap.appendChild(bar);
    wrap.appendChild(body);
    body.appendChild(gutter);
    body.appendChild(scroll);
    scroll.appendChild(pre);
  });

  function slugifyHeading(s) {
    var t = (s || "").trim().toLowerCase().replace(/\s+/g, "-");
    t = t.replace(/[^a-z0-9\u4e00-\u9fff\-_]+/gi, "");
    if (!t) t = "section";
    if (t.length > 80) t = t.slice(0, 80);
    return t;
  }
  var article = document.getElementById("fs-doc-article");
  var tocMount = document.getElementById("fs-toc-mount");
  var tocWrap = document.getElementById("fs-toc-wrap");
  if (article && tocMount && tocWrap) {
    var headings = Array.prototype.slice.call(article.querySelectorAll("h1, h2, h3, h4, h5, h6"));
    if (headings.length) {
      var used = {};
      function uniqueId(base) {
        var id = base;
        var n = 1;
        while (used[id]) id = base + "-" + (++n);
        used[id] = true;
        return id;
      }
      var rootUl = document.createElement("ul");
      rootUl.className = "fs-toc-root";
      var stack = [{ level: 0, ul: rootUl }];
      headings.forEach(function (h) {
        var level = parseInt(h.tagName.slice(1), 10) || 1;
        var text = (h.textContent || "").trim();
        var base = slugifyHeading(text);
        var id = uniqueId(base);
        h.id = id;
        var li = document.createElement("li");
        var a = document.createElement("a");
        a.href = "#" + id;
        a.textContent = text;
        li.appendChild(a);
        while (stack.length > 1 && stack[stack.length - 1].level >= level) stack.pop();
        stack[stack.length - 1].ul.appendChild(li);
        var sub = document.createElement("ul");
        sub.className = "fs-toc-sub";
        li.appendChild(sub);
        stack.push({ level: level, ul: sub });
      });
      Array.prototype.slice.call(rootUl.querySelectorAll("li")).forEach(function (li) {
        var ul = li.querySelector(":scope > ul.fs-toc-sub");
        if (ul && ul.childNodes.length === 0) ul.remove();
      });
      tocMount.appendChild(rootUl);
      tocWrap.classList.add("fs-toc-visible");
    }
  }
});
</script>
{{end}}
</body>
</html>
`

const docPublicUnlockHTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>需要密码 · {{.DocTitle}}</title>
<style>
:root {
  --fs-text: #1f2329;
  --fs-muted: #646a73;
  --fs-border: #e5e6eb;
  --fs-link: #3370ff;
  --fs-bg: #f5f6f7;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
  color: var(--fs-text);
  background: var(--fs-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
}
.fs-unlock {
  width: 100%;
  max-width: 400px;
  background: #fff;
  border: 1px solid var(--fs-border);
  border-radius: 12px;
  padding: 1.75rem 1.5rem 1.5rem;
  box-shadow: 0 2px 12px rgba(31,35,41,.08);
}
.fs-unlock .brand { font-size: 0.75rem; color: var(--fs-muted); margin-bottom: 0.75rem; }
.fs-unlock .brand a { color: var(--fs-link); font-weight: 500; text-decoration: none; }
.fs-unlock .brand a:hover { text-decoration: underline; }
.fs-unlock h1 { margin: 0 0 0.35rem; font-size: 1.15rem; font-weight: 600; }
.fs-unlock p.sub { margin: 0 0 1.15rem; font-size: 0.875rem; color: var(--fs-muted); line-height: 1.5; }
.err { margin: 0 0 1rem; padding: 0.6rem 0.75rem; border-radius: 8px; background: #fff2f0; color: #cf1322; font-size: 0.875rem; }
label { display: block; font-size: 0.8rem; font-weight: 600; color: var(--fs-muted); margin-bottom: 0.35rem; }
input[type=password] {
  width: 100%;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--fs-border);
  border-radius: 8px;
  font-size: 1rem;
  margin-bottom: 1rem;
}
button[type=submit] {
  width: 100%;
  padding: 0.65rem 1rem;
  border: none;
  border-radius: 8px;
  background: var(--fs-link);
  color: #fff;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}
button[type=submit]:hover { filter: brightness(1.05); }
</style>
</head>
<body>
<div class="fs-unlock">
  <div class="brand">{{.SiteLabel}} · <a href="{{.HomeURL}}">返回工作台</a></div>
  <h1>输入访问密码</h1>
  <p class="sub">「{{.DocTitle}}」已启用密码保护。</p>
  {{if .HasErr}}<p class="err">{{.ErrMsg}}</p>{{end}}
  <form method="post" action="{{.ActionPath}}">
    <label for="pw">密码</label>
    <input id="pw" type="password" name="password" autocomplete="current-password" required placeholder="请输入分享密码" />
    <button type="submit">确认并阅读</button>
  </form>
</div>
</body>
</html>
`

func docPublicMetaDescription(title, md string) string {
	s := strings.TrimSpace(md)
	if s == "" {
		return strings.TrimSpace(title)
	}
	s = strings.ReplaceAll(s, "\r\n", "\n")
	lines := strings.Split(s, "\n")
	var b strings.Builder
	for _, ln := range lines {
		ln = strings.TrimSpace(ln)
		if ln == "" || strings.HasPrefix(ln, "#") || strings.HasPrefix(ln, "```") {
			continue
		}
		if strings.HasPrefix(ln, "{") {
			continue
		}
		_, _ = b.WriteString(ln)
		break
	}
	out := strings.TrimSpace(b.String())
	if out == "" {
		out = strings.TrimSpace(title)
	}
	runes := []rune(out)
	if len(runes) > 160 {
		out = string(runes[:157]) + "…"
	}
	return out
}

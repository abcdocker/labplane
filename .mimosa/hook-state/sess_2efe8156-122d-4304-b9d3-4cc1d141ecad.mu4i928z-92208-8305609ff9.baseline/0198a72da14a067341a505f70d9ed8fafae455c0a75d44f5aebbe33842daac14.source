package internal

import (
	"errors"
	"html/template"
	"net/url"
	"strconv"
	"strings"
)

// 以下相对路径对应「CDN 根」下的对象键：后台填写 assetsCdnBaseUrl 须已包含 /cmdb（或其它）前缀，无尾斜杠。
// 与 scripts/export-cmdb-cdn-assets.sh 输出目录一致（上传时保留 cmdb/ 下层级）。
const (
	assetRelDocExcalidrawCSS     = "doc-public/excalidraw/excalidraw-0.18.0-prod/index.css"
	assetRelDocGithubMarkdownCSS = "doc-public/github-markdown-css/5.9.0/github-markdown-light.min.css"
	assetRelDocHighlightThemeCSS = "doc-public/highlightjs/11.11.1/styles/xcode.min.css"
	assetRelDocKatexCSS          = "doc-public/katex/0.16.11/katex.min.css"
	assetRelDocHighlightJS       = "doc-public/highlightjs/11.11.1/highlight.min.js"
	assetRelDocESMReact          = "doc-public/esm/react-18.2.0.mjs"
	assetRelDocESMReactDOMClient = "doc-public/esm/react-dom-client-18.2.0.mjs"
	assetRelDocESMExcalidraw     = "doc-public/esm/excalidraw-0.18.0.mjs"

	assetRelEdgeBootstrapCSS = "edge/bootstrap/5.3.0/dist/css/bootstrap.min.css"
	assetRelEdgeBootstrapJS  = "edge/bootstrap/5.3.0/dist/js/bootstrap.bundle.min.js"
	assetRelEdgeFontAwesome  = "edge/font-awesome/6.4.0/css/all.min.css"

	assetRelEdgeJQuery      = "edge/jquery/3.7.1/jquery.min.js"
	assetRelEdgeJQueryUIJS  = "edge/jquery-ui/1.13.2/jquery-ui.min.js"
	assetRelEdgeJQueryUICSS = "edge/jquery-ui/1.13.2/themes/base/jquery-ui.min.css"
)

const (
	defaultURLDocExcalidrawCSS     = "https://cdn.jsdelivr.net/npm/@excalidraw/excalidraw@0.18.0/dist/prod/index.css"
	defaultURLDocGithubMarkdownCSS = "https://cdn.jsdelivr.net/npm/github-markdown-css@5.9.0/github-markdown-light.min.css"
	defaultURLDocHighlightThemeCSS = "https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/styles/xcode.min.css"
	defaultURLDocKatexCSS          = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css"
	defaultURLDocHighlightJS       = "https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/highlight.min.js"
	defaultURLDocESMReact          = "https://esm.sh/react@18.2.0"
	defaultURLDocESMReactDOMClient = "https://esm.sh/react-dom@18.2.0/client"
	defaultURLDocESMExcalidraw     = "https://esm.sh/@excalidraw/excalidraw@0.18.0?deps=react@18.2.0,react-dom@18.2.0"

	defaultURLEdgeBootstrapCSS = "https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css"
	defaultURLEdgeBootstrapJS  = "https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"
	defaultURLEdgeFontAwesome  = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"

	defaultURLEdgeJQuery      = "https://code.jquery.com/jquery-3.7.1.min.js"
	defaultURLEdgeJQueryUIJS  = "https://code.jquery.com/ui/1.13.2/jquery-ui.min.js"
	defaultURLEdgeJQueryUICSS = "https://code.jquery.com/ui/1.13.2/themes/base/jquery-ui.min.css"
)

// NormalizeAssetsCDNBaseURL 去掉首尾空白与尾斜杠；空表示不启用 CDN。
func NormalizeAssetsCDNBaseURL(s string) string {
	s = strings.TrimSpace(s)
	s = strings.TrimRight(s, "/")
	return s
}

// EffectiveAssetsCDNBase 合并 env + runtime 后的 CDN 根（须含业务前缀如 /cmdb）；空则走默认外链。
func EffectiveAssetsCDNBase(c Config) string {
	return NormalizeAssetsCDNBaseURL(c.AssetsCDNBaseURL)
}

func resolveAssetURL(cdnBase, relPath, defaultFullURL string) string {
	base := NormalizeAssetsCDNBaseURL(cdnBase)
	if base == "" {
		return defaultFullURL
	}
	relPath = strings.TrimLeft(relPath, "/")
	return base + "/" + relPath
}

// ValidateAssetsCDNBaseURL 非空时须为 http(s) 绝对 URL。
func ValidateAssetsCDNBaseURL(s string) error {
	s = NormalizeAssetsCDNBaseURL(s)
	if s == "" {
		return nil
	}
	u, err := url.Parse(s)
	if err != nil {
		return err
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return errors.New("assetsCdnBaseUrl 须为 http 或 https")
	}
	if u.Host == "" {
		return errors.New("assetsCdnBaseUrl 须包含主机名")
	}
	return nil
}

// DocPublicPageAssetFields 注入 doc 公开页模板（link/script 与 import()）。
type DocPublicPageAssetFields struct {
	CSSExcalidraw     string
	CSSGithubMarkdown string
	CSSHighlightTheme string
	CSSKatex          string
	JSHighlight       string
	// ESM*Quoted 为已 JSON 引号包裹的 URL，供 <script type="module"> import() 使用
	ESMReactQuoted          template.JS
	ESMReactDOMClientQuoted template.JS
	ESMExcalidrawQuoted     template.JS
	// 启用自建 CDN 时，若 doc-public/esm/*.mjs 未就绪或 CORS/MIME 异常，浏览器 import 失败；Fallback 为 esm.sh 等公网地址（模板里为 null 或引号 URL）
	ESMReactFallbackQuoted          template.JS
	ESMReactDOMClientFallbackQuoted template.JS
	ESMExcalidrawFallbackQuoted     template.JS
}

// EdgeGatewayAssetFields templates/index.html 外链。
type EdgeGatewayAssetFields struct {
	BootstrapCSS    string
	BootstrapJS     string
	FontAwesomeCSS  string
	JQueryJS        string
	JQueryUIJS      string
	JQueryUICSS     string
}

func buildDocPublicPageAssetFields(cfg Config) DocPublicPageAssetFields {
	b := EffectiveAssetsCDNBase(cfg)
	q := func(u string) template.JS {
		return template.JS(strconv.Quote(u))
	}
	esmFallback := func(defaultU string) template.JS {
		if b == "" {
			return template.JS("null")
		}
		return q(defaultU)
	}
	return DocPublicPageAssetFields{
		CSSExcalidraw:     resolveAssetURL(b, assetRelDocExcalidrawCSS, defaultURLDocExcalidrawCSS),
		CSSGithubMarkdown: resolveAssetURL(b, assetRelDocGithubMarkdownCSS, defaultURLDocGithubMarkdownCSS),
		CSSHighlightTheme: resolveAssetURL(b, assetRelDocHighlightThemeCSS, defaultURLDocHighlightThemeCSS),
		CSSKatex:          resolveAssetURL(b, assetRelDocKatexCSS, defaultURLDocKatexCSS),
		JSHighlight:       resolveAssetURL(b, assetRelDocHighlightJS, defaultURLDocHighlightJS),
		ESMReactQuoted:          q(resolveAssetURL(b, assetRelDocESMReact, defaultURLDocESMReact)),
		ESMReactDOMClientQuoted: q(resolveAssetURL(b, assetRelDocESMReactDOMClient, defaultURLDocESMReactDOMClient)),
		ESMExcalidrawQuoted:     q(resolveAssetURL(b, assetRelDocESMExcalidraw, defaultURLDocESMExcalidraw)),
		ESMReactFallbackQuoted:          esmFallback(defaultURLDocESMReact),
		ESMReactDOMClientFallbackQuoted: esmFallback(defaultURLDocESMReactDOMClient),
		ESMExcalidrawFallbackQuoted:     esmFallback(defaultURLDocESMExcalidraw),
	}
}

// fillDocPublicPageDataAssets 写入公开文档页 CSS/JS/ESM 地址（CDN 或默认外链）。
func fillDocPublicPageDataAssets(d *docPublicPageData, cfg Config) {
	if d == nil {
		return
	}
	d.DocPublicPageAssetFields = buildDocPublicPageAssetFields(cfg)
}

func buildEdgeGatewayAssetFields(cfg Config) EdgeGatewayAssetFields {
	b := EffectiveAssetsCDNBase(cfg)
	return EdgeGatewayAssetFields{
		BootstrapCSS:   resolveAssetURL(b, assetRelEdgeBootstrapCSS, defaultURLEdgeBootstrapCSS),
		BootstrapJS:    resolveAssetURL(b, assetRelEdgeBootstrapJS, defaultURLEdgeBootstrapJS),
		FontAwesomeCSS: resolveAssetURL(b, assetRelEdgeFontAwesome, defaultURLEdgeFontAwesome),
		JQueryJS:       resolveAssetURL(b, assetRelEdgeJQuery, defaultURLEdgeJQuery),
		JQueryUIJS:     resolveAssetURL(b, assetRelEdgeJQueryUIJS, defaultURLEdgeJQueryUIJS),
		JQueryUICSS:    resolveAssetURL(b, assetRelEdgeJQueryUICSS, defaultURLEdgeJQueryUICSS),
	}
}

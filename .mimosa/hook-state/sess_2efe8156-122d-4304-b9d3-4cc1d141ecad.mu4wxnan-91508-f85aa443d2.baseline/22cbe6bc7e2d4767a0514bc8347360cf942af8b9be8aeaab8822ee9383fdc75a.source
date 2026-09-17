#!/usr/bin/env bash
# 生成本地上传 OSS/CDN 的 cmdb/ 目录，与后台 assetsCdnBaseUrl（如 https://cdn.xxx.com/cmdb）及 Go assets_cdn.go 路径一致。
# 用法：仓库根目录  bash scripts/export-cmdb-cdn-assets.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/third_party/cmdb-export/cmdb"
REACT="$ROOT/react"
mkdir -p "$DEST"

dl() {
  local url="$1"
  local out="$2"
  mkdir -p "$(dirname "$out")"
  echo "GET $url"
  curl -fsSL --connect-timeout 25 --max-time 180 "$url" -o "$out"
}

# --- doc-public ---
dl "https://cdn.jsdelivr.net/npm/github-markdown-css@5.9.0/github-markdown-light.min.css" \
  "$DEST/doc-public/github-markdown-css/5.9.0/github-markdown-light.min.css"
dl "https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/styles/xcode.min.css" \
  "$DEST/doc-public/highlightjs/11.11.1/styles/xcode.min.css"
dl "https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/highlight.min.js" \
  "$DEST/doc-public/highlightjs/11.11.1/highlight.min.js"
dl "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" \
  "$DEST/doc-public/katex/0.16.11/katex.min.css"

# KaTeX 字体（公式渲染需要）
for f in KaTeX_AMS-Regular.woff2 KaTeX_Main-Regular.woff2 KaTeX_Math-Italic.woff2 KaTeX_Size1-Regular.woff2 KaTeX_Size2-Regular.woff2 KaTeX_Size3-Regular.woff2 KaTeX_Size4-Regular.woff2; do
  dl "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/fonts/$f" "$DEST/doc-public/katex/0.16.11/fonts/$f" || true
done

# Excalidraw：整包 prod（与公开页 CSS + 自建 ESM 一致）
EX_PKG="$REACT/node_modules/@excalidraw/excalidraw/dist/prod"
EX_OUT="$DEST/doc-public/excalidraw/excalidraw-0.18.0-prod"
if [[ -d "$EX_PKG" ]]; then
  rm -rf "$EX_OUT"
  mkdir -p "$(dirname "$EX_OUT")"
  cp -R "$EX_PKG" "$EX_OUT"
  echo "Copied excalidraw prod -> $EX_OUT"
else
  echo "WARN: 未找到 $EX_PKG；请 cd react && npm ci 后重试以包含 excalidraw 完整产物" >&2
fi

# ESM 预打包（供 import()；需 CDN 正确返回 application/javascript 与 CORS）
echo "GET esm.sh (follow redirect) -> doc-public/esm/"
dl "https://esm.sh/react@18.2.0" "$DEST/doc-public/esm/react-18.2.0.mjs"
dl "https://esm.sh/react-dom@18.2.0/client" "$DEST/doc-public/esm/react-dom-client-18.2.0.mjs"
dl "https://esm.sh/@excalidraw/excalidraw@0.18.0?deps=react@18.2.0,react-dom@18.2.0" \
  "$DEST/doc-public/esm/excalidraw-0.18.0.mjs"

# --- edge：Bootstrap ---
dl "https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" \
  "$DEST/edge/bootstrap/5.3.0/dist/css/bootstrap.min.css"
dl "https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js" \
  "$DEST/edge/bootstrap/5.3.0/dist/js/bootstrap.bundle.min.js"

# Font Awesome 6.4.0
dl "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" \
  "$DEST/edge/font-awesome/6.4.0/css/all.min.css"
for w in fa-brands-400 fa-regular-400 fa-solid-900 fa-v4compatibility; do
  dl "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/${w}.woff2" \
    "$DEST/edge/font-awesome/6.4.0/webfonts/${w}.woff2" || true
  dl "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/${w}.ttf" \
    "$DEST/edge/font-awesome/6.4.0/webfonts/${w}.ttf" || true
done

# jQuery / jQuery UI（堡垒机 WMKS）
dl "https://code.jquery.com/jquery-3.7.1.min.js" "$DEST/edge/jquery/3.7.1/jquery.min.js"
dl "https://code.jquery.com/ui/1.13.2/jquery-ui.min.js" "$DEST/edge/jquery-ui/1.13.2/jquery-ui.min.js"
dl "https://code.jquery.com/ui/1.13.2/themes/base/jquery-ui.min.css" \
  "$DEST/edge/jquery-ui/1.13.2/themes/base/jquery-ui.min.css"

echo ""
echo "完成。请上传目录: $DEST"
echo "后台填写 assetsCdnBaseUrl = https://你的域名/cmdb（与桶内路径一致，无尾斜杠）"
echo "打包: (cd $(dirname "$DEST") && tar -czvf cmdb.tar.gz cmdb)"

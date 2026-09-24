#!/usr/bin/env bash
# 前端首屏体积预算门禁（CI 与本地均可运行，需先 npm run build）。
#
# 规则：
#   1) entry chunk（index.html 中 <script src>）raw 体积 ≤ 500KB
#   2) 首屏总预算（entry + 全部 modulepreload chunk + CSS）raw ≤ 2MB
#
# 背景：路由级 React.lazy + manualChunks 优化后 entry 约 318KB。
# 若新增页面未走 lazy（直接静态 import 重库），entry 或 preload 总量会反弹，
# 此脚本在 CI 拦截，防止首屏体积无声回归。超预算时的解法见 AGENTS.md 前端规范。
set -euo pipefail

DIST_DIR="${1:-react/dist}"
ENTRY_BUDGET_KB=500
FIRST_PAINT_BUDGET_KB=2048

if [ ! -f "${DIST_DIR}/index.html" ]; then
  echo "错误：未找到 ${DIST_DIR}/index.html，请先在 react/ 下执行 npm run build" >&2
  exit 1
fi

size_kb() { # wc -c 跨 macOS/Linux 一致
  local bytes
  bytes=$(wc -c < "$1" | tr -d '[:space:]')
  echo $(( bytes / 1024 ))
}

# 1) entry chunk
entry_file=$(sed -n 's/.*<script[^>]*src="\/assets\/\([^"]*\)".*/\1/p' "${DIST_DIR}/index.html" | head -1)
if [ -z "${entry_file}" ]; then
  echo "错误：index.html 中未找到 entry script" >&2
  exit 1
fi
entry_kb=$(size_kb "${DIST_DIR}/assets/${entry_file}")
echo "entry chunk: assets/${entry_file} = ${entry_kb} KB（预算 ${ENTRY_BUDGET_KB} KB）"
if [ "${entry_kb}" -gt "${ENTRY_BUDGET_KB}" ]; then
  echo "❌ entry chunk 超预算：${entry_kb} KB > ${ENTRY_BUDGET_KB} KB" >&2
  echo "   排查：App.tsx 新增页面是否未用 React.lazy；或新引入了重库静态 import。" >&2
  exit 1
fi

# 2) 首屏总预算 = entry + modulepreload 资源 + CSS
total_kb=${entry_kb}
preload_count=0
while IFS= read -r asset; do
  [ -z "${asset}" ] && continue
  f="${DIST_DIR}/assets/${asset}"
  [ -f "$f" ] || continue
  total_kb=$(( total_kb + $(size_kb "$f") ))
  preload_count=$(( preload_count + 1 ))
done < <(sed -n 's/.*modulepreload[^>]*href="\/assets\/\([^"]*\)".*/\1/p' "${DIST_DIR}/index.html")

# index.html 直接引用的 CSS（link rel=stylesheet 指向 /assets/）
while IFS= read -r asset; do
  [ -z "${asset}" ] && continue
  f="${DIST_DIR}/assets/${asset}"
  [ -f "$f" ] || continue
  total_kb=$(( total_kb + $(size_kb "$f") ))
done < <(sed -n 's/.*<link[^>]*rel="stylesheet"[^>]*href="\/assets\/\([^"]*\)".*/\1/p' "${DIST_DIR}/index.html")

echo "首屏合计（entry + ${preload_count} 个 preload chunk + CSS）= ${total_kb} KB（预算 ${FIRST_PAINT_BUDGET_KB} KB）"
if [ "${total_kb}" -gt "${FIRST_PAINT_BUDGET_KB}" ]; then
  echo "❌ 首屏总量超预算：${total_kb} KB > ${FIRST_PAINT_BUDGET_KB} KB" >&2
  echo "   排查：被首屏静态依赖的组件引入了 markdown/mermaid/codemirror 等重库，" >&2
  echo "   应将其改为 React.lazy 按需加载（先例：AiAssistantPopup 内的 OpenClawChatMarkdown）。" >&2
  exit 1
fi

echo "✅ 前端体积预算通过"

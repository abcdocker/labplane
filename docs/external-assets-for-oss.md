# 静态资源 CDN（cmdb 目录）与后台配置

## 后台配置

在 **账户与平台 → 外观与名称** 中填写 **`assetsCdnBaseUrl`**（JSON 字段同名）：

- 示例：`https://cdn.example.com/cmdb`（**无尾斜杠**；路径须与你在 OSS/桶里部署的前缀一致）。
- **留空**：文档公开分享页、边缘网关 HTML、堡垒机 WMKS 前置 jQuery 等仍使用内置默认公网地址（jsdelivr / esm.sh / code.jquery.com 等）。
- 环境变量（可选）：`LABPLANE_ASSETS_CDN_BASE`，运行时里若填写了 `assetsCdnBaseUrl` 则**以运行时为准**。

## 目录结构（上传 OSS 时保留 `cmdb/` 下层级）

与 `internal/assets_cdn.go` 中常量一致。生成命令：

```bash
bash scripts/export-cmdb-cdn-assets.sh
```

输出：`third_party/cmdb-export/cmdb/`（已 `.gitignore`，请本地生成后上传）。

```
cmdb/
├── doc-public/
│   ├── excalidraw/excalidraw-0.18.0-prod/   # npm 包 dist/prod 整目录
│   ├── esm/
│   │   ├── react-18.2.0.mjs
│   │   ├── react-dom-client-18.2.0.mjs
│   │   └── excalidraw-0.18.0.mjs
│   ├── github-markdown-css/5.9.0/github-markdown-light.min.css
│   ├── highlightjs/11.11.1/styles/xcode.min.css
│   ├── highlightjs/11.11.1/highlight.min.js
│   └── katex/0.16.11/katex.min.css
│       └── fonts/*.woff2                     # 脚本会尝试拉常用字体
└── edge/
    ├── bootstrap/5.3.0/dist/css/bootstrap.min.css
    ├── bootstrap/5.3.0/dist/js/bootstrap.bundle.min.js
    ├── font-awesome/6.4.0/css/all.min.css
    ├── font-awesome/6.4.0/webfonts/*
    ├── jquery/3.7.1/jquery.min.js
    └── jquery-ui/1.13.2/...
```

打包上传示例：

```bash
cd third_party/cmdb-export && tar -czvf cmdb.tar.gz cmdb
```

## 使用 CDN 的资源范围

| 场景 | 说明 |
|------|------|
| 已发布文档 `/r/*.html` | Markdown：github-markdown-css、highlight、katex、脚本；画布：excalidraw CSS + 三份 ESM |
| `templates/index.html`（无 react/dist 时） | Bootstrap、Font Awesome |
| 堡垒机 WMKS 嵌入页 | jQuery、jQuery UI（先于 vCenter wmks 脚本加载） |

**不经过此 CDN**：主控制台 `react/dist` 构建产物（仍由平台同源 `/assets` 提供）。

## ESM 文件说明

`doc-public/esm/*.mjs` 由脚本从 **esm.sh** 拉取；OSS 需对 `.mjs` 返回合适的 `Content-Type`，并允许浏览器 **CORS**（公开页可能为跨域或子域）。若失败可继续留空 `assetsCdnBaseUrl`，回退 esm.sh。

## KaTeX 字体

若公式显示缺字，请从 `katex@0.16.11` npm 包的 `dist/fonts/` 补全到 CDN 上 `cmdb/doc-public/katex/0.16.11/fonts/`（与 `katex.min.css` 相对路径一致）。

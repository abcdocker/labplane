import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import fs from "fs";
import AutoImport from "unplugin-auto-import/vite";
import checker from "vite-plugin-checker";
import * as lucideIcons from "lucide-react";

// 获取所有 lucide-react 导出的符号名
const allLucideExports = Object.keys(lucideIcons).filter(
  // React 19 同样导出 Activity；让 lucide Activity 由页面显式 import，避免自动导入重名。
  (key) => key !== "default" && key !== "Activity"
);

// 扫描 src 目录，找出实际使用的 lucide 图标
function getUsedLucideIcons() {
  const usedIcons = new Set<string>();
  const srcPath = path.resolve(__dirname, "./src");

  function scanDirectory(dir: string) {
    if (!fs.existsSync(dir)) return;

    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      // 防御式约束：解析路径必须仍位于扫描根（src）之内，防止符号链接等方式逃逸
      if (filePath !== srcPath && !filePath.startsWith(srcPath + path.sep)) continue;
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        scanDirectory(filePath);
      } else if (/\.(tsx?|jsx?)$/.test(file)) {
        const content = fs.readFileSync(filePath, "utf-8");

        // 匹配 JSX 标签和标识符使用
        for (const icon of allLucideExports) {
          // 匹配: <IconName、{IconName、= IconName、: IconName 等
          const patterns = [
            new RegExp(`<${icon}[\\s/>]`, "g"),
            new RegExp(`[{\\s,=:]${icon}[\\s,})]`, "g"),
          ];

          if (patterns.some((pattern) => pattern.test(content))) {
            usedIcons.add(icon);
          }
        }
      }
    }
  }

  scanDirectory(srcPath);
  return Array.from(usedIcons);
}

const usedLucideIcons = getUsedLucideIcons();

// https://vite.dev/config/
// 本地若 Go 监听非 8080（如 DASHBOARD_HTTP_ADDR=:18080），在 react/.env 设 VITE_DEV_API_TARGET=http://127.0.0.1:18080
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.VITE_DEV_API_TARGET || "http://127.0.0.1:8080";
  const uiBuildVersion = (env.VITE_UI_BUILD_VERSION || "").trim() || "dev";
  return {
  define: {
    __LABPLANE_UI_BUILD_VERSION__: JSON.stringify(uiBuildVersion),
  },
  server: {
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
        ws: true,
      },
      "/r": { target: apiTarget, changeOrigin: true },
      "/d": { target: apiTarget, changeOrigin: true },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    AutoImport({
      dts: "auto-imports.d.ts",
      include: [/\.[tj]sx?$/],
      imports: [
        "react",
        {
          "lucide-react": usedLucideIcons,
        },
      ],
      eslintrc: {
        enabled: false,
      },
    }),
    ...(command === "serve"
      ? [
          checker({
            typescript: {
              tsconfigPath: "tsconfig.app.json",
            },
          }),
        ]
      : []),
  ],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // 只对"首屏必需且稳定"的库做手动分组（业务迭代不使其缓存失效）。
        // 重型库（mermaid/codemirror/katex/excalidraw/xterm 等）不在此分组：
        // 它们的使用页面已全部 React.lazy，Rollup 会把它们随路由 chunk
        // 自然分割；若手动分组反而会把 entry 在用的一小部分捆绑进大 chunk，
        // 导致整块进入首屏 modulepreload（实测踩过）。
        manualChunks(id) {
          if (id.includes("node_modules/react-dom/") || id.includes("node_modules/react/")) {
            return "react-vendor";
          }
          if (id.includes("node_modules/react-router")) return "router";
          if (id.includes("node_modules/@tanstack/react-query")) return "react-query";
          if (id.includes("node_modules/@radix-ui/")) return "ui-radix";
          if (id.includes("node_modules/lucide-react")) return "ui-icons";
          if (id.includes("node_modules/cmdk") || id.includes("node_modules/sonner") || id.includes("node_modules/vaul") || id.includes("node_modules/embla-carousel")) return "ui-misc";
          if (id.includes("node_modules/react-hook-form") || id.includes("node_modules/@hookform") || id.includes("node_modules/zod")) return "form-lib";
          if (id.includes("node_modules/date-fns") || id.includes("node_modules/react-day-picker")) return "date-lib";
          return undefined;
        },
      },
    },
  },
  };
});

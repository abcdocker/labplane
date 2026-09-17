import type { AppConfig } from "@/lib/api";

/** 与 Go internal/assets_cdn.go 中 assetRel* 一致（相对 CDN 根，即 assetsCdnBaseUrl 之后的 path） */
export const ASSET_PATHS = {
  jquery: "edge/jquery/3.7.1/jquery.min.js",
  jqueryUiJs: "edge/jquery-ui/1.13.2/jquery-ui.min.js",
  jqueryUiCss: "edge/jquery-ui/1.13.2/themes/base/jquery-ui.min.css",
} as const;

const DEFAULT_JQUERY = "https://code.jquery.com/jquery-3.7.1.min.js";
const DEFAULT_JQUERY_UI_JS = "https://code.jquery.com/ui/1.13.2/jquery-ui.min.js";
const DEFAULT_JQUERY_UI_CSS = "https://code.jquery.com/ui/1.13.2/themes/base/jquery-ui.min.css";

function trimBase(base: string): string {
  return base.replace(/\s+/g, "").replace(/\/+$/, "");
}

/** 有 CDN 根时返回 base/path，否则返回默认公网 URL */
export function resolvePublicAssetUrl(
  assetsCdnBaseUrl: string | undefined,
  path: string,
  defaultUrl: string
): string {
  const b = trimBase(String(assetsCdnBaseUrl ?? ""));
  if (!b) return defaultUrl;
  const p = path.replace(/^\/+/, "");
  return `${b}/${p}`;
}

export function bastionJqueryUrls(cfg: AppConfig | undefined): {
  jquery: string;
  jqueryUiJs: string;
  jqueryUiCss: string;
} {
  const base = cfg?.assetsCdnBaseUrl;
  return {
    jquery: resolvePublicAssetUrl(base, ASSET_PATHS.jquery, DEFAULT_JQUERY),
    jqueryUiJs: resolvePublicAssetUrl(base, ASSET_PATHS.jqueryUiJs, DEFAULT_JQUERY_UI_JS),
    jqueryUiCss: resolvePublicAssetUrl(base, ASSET_PATHS.jqueryUiCss, DEFAULT_JQUERY_UI_CSS),
  };
}

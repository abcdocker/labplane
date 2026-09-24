import React from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { RuntimeSettingsDTO } from "@/lib/api";
import OidcAuthentikHelp from "@/components/OidcAuthentikHelp";

type Props = {
  form: RuntimeSettingsDTO;
  setField: (key: string, value: unknown) => void;
  err: string | null;
  ok: string | null;
  saving: boolean;
  onSave: () => void | Promise<void>;
};

/** 仅平台相关：多卡片拆分，不出现 Kubernetes / vCenter 分区标题 */
const AccountPlatformSettingsBody: React.FC<Props> = ({
  form,
  setField,
  err,
  ok,
  saving,
  onSave,
}) => {
  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/80 px-6 py-4">
          <h2 className="text-base font-bold text-slate-900">外观与名称</h2>
          <p className="mt-1 text-xs text-slate-500">
            浏览器标题、顶栏 Logo；支持 https 绝对地址或站内路径（需可公网访问或同源）
          </p>
        </div>
        <div className="space-y-4 p-6">
          <div className="space-y-2">
            <Label>平台显示名称</Label>
            <Input
              placeholder="例如：运维控制台"
              value={String(form.platformDisplayName ?? "")}
              onChange={(e) => setField("platformDisplayName", e.target.value)}
            />
            <p className="text-[11px] text-slate-500">
              保存后将替换侧栏与顶栏默认的「LabPlane」；名称启用时带有轻微呼吸动效（白底界面）。
            </p>
          </div>
          <div className="space-y-2">
            <Label>Logo 图片 URL</Label>
            <Input
              placeholder="https://…/logo.png 或 /static/logo.png"
              value={String(form.platformLogoUrl ?? "")}
              onChange={(e) => setField("platformLogoUrl", e.target.value)}
            />
            <p className="text-[11px] text-slate-500">
              推荐：<strong className="font-medium text-slate-700">约 40×40～48×48 px</strong>（或同比例矢量），
              侧栏/顶栏以约 32–36px 高度展示；文件宜 <strong className="font-medium text-slate-700">小于约 100KB</strong>（优先 SVG 或压缩
              PNG），避免首屏闪烁。
            </p>
          </div>
          <div className="space-y-2">
            <Label>站点图标（favicon）URL</Label>
            <Input
              placeholder="https://…/favicon.ico"
              value={String(form.platformFaviconUrl ?? "")}
              onChange={(e) => setField("platformFaviconUrl", e.target.value)}
            />
          </div>
          <div className="space-y-2 border-t border-slate-100 pt-4">
            <Label>静态资源 CDN 根（assetsCdnBaseUrl）</Label>
            <Input
              className="font-mono text-xs"
              placeholder="https://your-cdn.example.com/cmdb（无尾斜杠；留空则走默认公网 CDN）"
              value={String(form.assetsCdnBaseUrl ?? "")}
              onChange={(e) => setField("assetsCdnBaseUrl", e.target.value)}
            />
            <p className="text-[11px] leading-relaxed text-slate-500">
              用于已发布文档分享页、未构建 React 时的边缘网关模板、堡垒机 WMKS 所需的 jQuery 等。请将仓库{" "}
              <code className="rounded bg-slate-100 px-0.5">scripts/export-cmdb-cdn-assets.sh</code> 生成的{" "}
              <code className="rounded bg-slate-100 px-0.5">cmdb/</code> 目录整包上传到该域名下，使{" "}
              <code className="rounded bg-slate-100 px-0.5">assetsCdnBaseUrl/doc-public/...</code> 可访问。
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/80 px-6 py-4">
          <h2 className="text-base font-bold text-slate-900">SSH 终端（Web）</h2>
          <p className="mt-1 text-xs text-slate-500">
            平台内嵌 xterm（K8s Pod、vCenter、云主机、Redis CLI 等）使用的字体；保存后刷新页面生效。
          </p>
        </div>
        <div className="space-y-4 p-6">
          <div className="space-y-2">
            <Label>字体族（font-family）</Label>
            <Input
              placeholder="留空则使用默认，例如：JetBrains Mono, monospace"
              value={String(form.sshTerminalFontFamily ?? "")}
              onChange={(e) => setField("sshTerminalFontFamily", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>字号（px，1–48；0 表示未设置）</Label>
            <Input
              type="number"
              min={0}
              max={48}
              value={Number(form.sshTerminalFontSize ?? 0)}
              onChange={(e) => setField("sshTerminalFontSize", Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/80 px-6 py-4">
          <h2 className="text-base font-bold text-slate-900">平台 URL</h2>
          <p className="mt-1 text-xs text-slate-500">对外访问基址（与业务路由、回调 URL 相关）</p>
        </div>
        <div className="p-6">
          <div className="space-y-2">
            <Label>platformPublicUrl</Label>
            <Input
              value={String(form.platformPublicUrl ?? "")}
              onChange={(e) => setField("platformPublicUrl", e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/80 px-6 py-4">
          <h2 className="text-base font-bold text-slate-900">MySQL</h2>
          <p className="mt-1 text-xs text-slate-500">
            平台元数据<strong>持久化</strong>存储（账号、审计、部分业务表）；数据在 MySQL 落盘，请自行做好库备份与高可用。分字段填写后保存。
          </p>
        </div>
        <div className="space-y-6 p-6 text-sm">
          {String(form.mysqlHost ?? "").trim() === "" &&
            String(form.mysqlDsn ?? "").trim() !== "" && (
              <div className="space-y-2">
                <Label className="text-amber-800">当前 mysqlDsn（旧格式，请迁移到下方分字段后保存）</Label>
                <Input
                  readOnly
                  className="bg-amber-50 font-mono text-xs"
                  value={String(form.mysqlDsn ?? "")}
                />
              </div>
            )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>主机</Label>
              <Input
                value={String(form.mysqlHost ?? "")}
                onChange={(e) => setField("mysqlHost", e.target.value)}
                placeholder="127.0.0.1"
              />
            </div>
            <div className="space-y-2">
              <Label>端口</Label>
              <Input
                type="number"
                min={1}
                max={65535}
                value={Number(form.mysqlPort ?? 3306)}
                onChange={(e) => setField("mysqlPort", Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>库名</Label>
              <Input
                value={String(form.mysqlDatabase ?? "")}
                onChange={(e) => setField("mysqlDatabase", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>用户</Label>
              <Input
                value={String(form.mysqlUser ?? "")}
                onChange={(e) => setField("mysqlUser", e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>密码（留空或 *** 保留原值）</Label>
              <Input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={String(form.mysqlPassword ?? "")}
                onChange={(e) => setField("mysqlPassword", e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/80 px-6 py-4">
          <h2 className="text-base font-bold text-slate-900">Redis</h2>
          <p className="mt-1 text-xs text-slate-500">
            KV / 热缓存（会话、Prometheus 趋势、vCenter 列表等）；默认内存易失，生产请配持久化（AOF/RDB）或接受缓存可丢。IP 与端口优先于旧版 redisAddr。
          </p>
        </div>
        <div className="space-y-6 p-6 text-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>IP</Label>
              <Input
                value={String(form.redisHost ?? "")}
                onChange={(e) => setField("redisHost", e.target.value)}
                placeholder="127.0.0.1"
              />
            </div>
            <div className="space-y-2">
              <Label>端口</Label>
              <Input
                type="number"
                min={1}
                max={65535}
                value={Number(form.redisPort ?? 6379)}
                onChange={(e) => setField("redisPort", Number(e.target.value))}
              />
            </div>
            {String(form.redisHost ?? "").trim() === "" &&
              String(form.redisAddr ?? "").trim() !== "" && (
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-amber-800">当前 redisAddr（旧格式，请迁移到 IP+端口）</Label>
                  <Input
                    readOnly
                    className="bg-amber-50 font-mono text-xs"
                    value={String(form.redisAddr ?? "")}
                  />
                </div>
              )}
            <div className="space-y-2 sm:col-span-2">
              <Label>密码（留空保留原值）</Label>
              <Input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={String(form.redisPassword ?? "")}
                onChange={(e) => setField("redisPassword", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>逻辑库 DB（redisDb）</Label>
              <Input
                type="number"
                min={0}
                max={255}
                value={Number(form.redisDb ?? 0)}
                onChange={(e) => setField("redisDb", Number(e.target.value))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>键前缀（redisKeyPrefix）</Label>
              <Input
                className="font-mono text-xs"
                placeholder="labplane"
                value={String(form.redisKeyPrefix ?? "")}
                onChange={(e) => setField("redisKeyPrefix", e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>vCenter 虚拟机列表缓存 TTL 秒（vcenterCacheTtlSec）</Label>
              <Input
                type="number"
                min={30}
                max={86400}
                value={Number(form.vcenterCacheTtlSec ?? 120)}
                onChange={(e) => setField("vcenterCacheTtlSec", Number(e.target.value))}
              />
              <p className="text-[11px] text-slate-500">写入 Redis 的 VM 列表快照过期时间；过短会增加 vCenter 压力，过长列表更新滞后。</p>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/80 px-6 py-4">
          <h2 className="text-base font-bold text-slate-900">应用中心 Redis（K8s 默认）</h2>
          <p className="mt-1 text-xs text-slate-500">
            Redis 与 redis_exporter 的<strong>完整镜像地址</strong>、私有仓库拉取 Secret 等已迁至「应用中心 → Redis 缓存 → 模版中心」按模版配置。此处仅保留部署向导的持久化默认值（仍可用环境变量覆盖）。
          </p>
        </div>
        <div className="space-y-4 p-6 text-sm">
          <div className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
            <div>
              <span className="text-slate-800">redisK8sPersistence</span>
              <p className="text-xs text-slate-500">K8s 部署是否默认使用 PVC 持久化</p>
            </div>
            <Switch
              checked={form.redisK8sPersistence !== false}
              onCheckedChange={(x) => setField("redisK8sPersistence", x)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>redisK8sStorageSize</Label>
              <Input
                className="font-mono text-xs"
                placeholder="10Gi"
                value={String(form.redisK8sStorageSize ?? "")}
                onChange={(e) => setField("redisK8sStorageSize", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>redisK8sStorageClass（空则部署时自动选默认 SC）</Label>
              <Input
                className="font-mono text-xs"
                value={String(form.redisK8sStorageClass ?? "")}
                onChange={(e) => setField("redisK8sStorageClass", e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/80 px-6 py-4">
          <h2 className="text-base font-bold text-slate-900">加密</h2>
          <p className="mt-1 text-xs text-slate-500">SSH 凭据等敏感字段加密（留空保留原值）</p>
        </div>
        <div className="p-6">
          <div className="space-y-2">
            <Label>encryptionKey</Label>
            <Input
              value={String(form.encryptionKey ?? "")}
              onChange={(e) => setField("encryptionKey", e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/80 px-6 py-4">
          <h2 className="text-base font-bold text-slate-900">控制台登录</h2>
          <p className="mt-1 text-xs text-slate-500">本地账号、会话与监听地址</p>
        </div>
        <div className="space-y-4 p-6 text-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>dashboardUser</Label>
              <Input
                value={String(form.dashboardUser ?? "")}
                onChange={(e) => setField("dashboardUser", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>dashboardSessionDays</Label>
              <Input
                type="number"
                min={1}
                max={365}
                value={Number(form.dashboardSessionDays ?? 7)}
                onChange={(e) => setField("dashboardSessionDays", Number(e.target.value))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>dashboardPassword（留空或 *** 保留）</Label>
              <Input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={String(form.dashboardPassword ?? "")}
                onChange={(e) => setField("dashboardPassword", e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>dashboardSessionSecret（留空或 *** 保留）</Label>
              <Input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={String(form.dashboardSessionSecret ?? "")}
                onChange={(e) => setField("dashboardSessionSecret", e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>dashboardListenAddr（如 :8080）</Label>
              <Input
                value={String(form.dashboardListenAddr ?? "")}
                onChange={(e) => setField("dashboardListenAddr", e.target.value)}
                placeholder=":8080"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 sm:col-span-2">
              <span className="text-slate-700">dashboardCookieSecure（HTTPS）</span>
              <Switch
                checked={Boolean(form.dashboardCookieSecure)}
                onCheckedChange={(x) => setField("dashboardCookieSecure", x)}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/80 px-6 py-4">
          <h2 className="text-base font-bold text-slate-900">OIDC</h2>
          <p className="mt-1 text-xs text-slate-500">四项须同时填写或全部留空；留空则沿用环境变量</p>
        </div>
        <div className="space-y-4 p-6 text-sm">
          <OidcAuthentikHelp />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>oidcIssuerUrl</Label>
              <Input
                value={String(form.oidcIssuerUrl ?? "")}
                onChange={(e) => setField("oidcIssuerUrl", e.target.value)}
                placeholder="https://idp.example.com/application/o/labplane/"
              />
            </div>
            <div className="space-y-2">
              <Label>oidcClientId</Label>
              <Input
                value={String(form.oidcClientId ?? "")}
                onChange={(e) => setField("oidcClientId", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>oidcClientSecret（留空或 *** 保留）</Label>
              <Input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={String(form.oidcClientSecret ?? "")}
                onChange={(e) => setField("oidcClientSecret", e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>oidcRedirectUrl</Label>
              <Input
                value={String(form.oidcRedirectUrl ?? "")}
                onChange={(e) => setField("oidcRedirectUrl", e.target.value)}
                placeholder="https://dashboard.example.com/api/auth/oidc/callback"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>oidcScopes（空格分隔，默认可留空）</Label>
              <Input
                value={String(form.oidcScopes ?? "")}
                onChange={(e) => setField("oidcScopes", e.target.value)}
                placeholder="openid profile email"
              />
            </div>
          </div>
        </div>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>
      )}
      {ok && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {ok}
        </div>
      )}

      <Button type="button" onClick={() => void onSave()} disabled={saving}>
        {saving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            保存中…
          </>
        ) : (
          <>
            <Save className="mr-2 h-4 w-4" />
            保存并重载
          </>
        )}
      </Button>
    </div>
  );
};

export default AccountPlatformSettingsBody;

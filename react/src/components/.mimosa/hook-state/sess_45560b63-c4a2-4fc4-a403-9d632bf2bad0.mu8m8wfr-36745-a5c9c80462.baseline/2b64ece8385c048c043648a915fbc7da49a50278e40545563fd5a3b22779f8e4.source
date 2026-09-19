import React from "react";
import { CollapsibleManual } from "@/components/CollapsibleManual";

/**
 * 与 Authentik 官方「OAuth2/OpenID Provider」文档字段对齐的填写说明。
 * 参见：https://docs.goauthentik.io/docs/providers/oauth2/
 */
const OidcAuthentikHelp: React.FC = () => {
  return (
    <CollapsibleManual
      storageKey="settings.oidc-authentik-manual"
      title="与 Authentik 对接时字段怎么填"
      variant="indigo"
      titleClassName="text-indigo-900"
    >
      <p className="text-xs text-slate-600">
        在 Authentik 中先创建 <strong>Application</strong> 并绑定 <strong>Provider</strong>（类型选 OAuth2/OpenID
        Provider）。下表左侧为本平台运行时配置项，中间为在 Authentik 控制台中的对应位置，右侧为需要从 Authentik
        <strong>复制到本平台</strong>或<strong>在本平台填写后抄回 Authentik</strong> 的值。
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-indigo-200/80">
              <th className="py-2 pr-3 font-semibold text-slate-900">本平台字段</th>
              <th className="py-2 pr-3 font-semibold text-slate-900">Authentik 中位置（示意）</th>
              <th className="py-2 font-semibold text-slate-900">如何填写</th>
            </tr>
          </thead>
          <tbody className="text-slate-700">
            <tr className="border-b border-indigo-100/80">
              <td className="py-2 pr-2 font-mono text-[11px]">oidcIssuerUrl</td>
              <td className="py-2 pr-2">Provider 详情 → <strong>Issuer</strong> / OpenID Configuration URL</td>
              <td className="py-2">
                复制 Authentik 显示的<strong>发行者 URL</strong>（通常以 <code className="rounded bg-white px-1">/application/o/…/</code>{" "}
                结尾），原样粘贴到本平台。
              </td>
            </tr>
            <tr className="border-b border-indigo-100/80">
              <td className="py-2 pr-2 font-mono text-[11px]">oidcClientId</td>
              <td className="py-2 pr-2">Provider → <strong>Client ID</strong></td>
              <td className="py-2">从 Authentik <strong>复制 Client ID</strong> 到本平台。</td>
            </tr>
            <tr className="border-b border-indigo-100/80">
              <td className="py-2 pr-2 font-mono text-[11px]">oidcClientSecret</td>
              <td className="py-2 pr-2">Provider → <strong>Client Secret</strong></td>
              <td className="py-2">
                在 Authentik 生成或查看 Secret，<strong>仅展示一次时请立即复制</strong>到本平台；本平台保存为密文。
              </td>
            </tr>
            <tr className="border-b border-indigo-100/80">
              <td className="py-2 pr-2 font-mono text-[11px]">oidcRedirectUrl</td>
              <td className="py-2 pr-2">Provider → <strong>Redirect URIs</strong>（重定向 URI 白名单）</td>
              <td className="py-2">
                在本平台填写：<code className="rounded bg-white px-1">https://你的控制台域名/api/auth/oidc/callback</code>
                ，然后在 Authentik 的 Redirect URIs 中<strong>添加完全相同的一行</strong>（协议、域名、路径须一致）。
              </td>
            </tr>
            <tr className="border-b border-indigo-100/80">
              <td className="py-2 pr-2 font-mono text-[11px]">oidcScopes</td>
              <td className="py-2 pr-2">Provider 允许的 OAuth Scope</td>
              <td className="py-2">
                只填<strong>授权范围</strong>，例如 <code className="rounded bg-white px-1">openid profile email</code>
                ；可留空则用服务端默认。<strong>不要</strong>把 <code className="rounded bg-white px-1">preferred_username</code>、
                <code className="rounded bg-white px-1">name</code> 写在这里——它们是 id_token 里的<strong>声明</strong>，不是
                scope，写了也不会改变平台登录名；服务端会忽略这些词并写日志。
              </td>
            </tr>
            <tr className="border-b border-indigo-100/80">
              <td className="py-2 pr-2 align-top font-mono text-[11px]">（登录流程）</td>
              <td className="py-2 pr-2 align-top">账户与平台 · 我的资料</td>
              <td className="py-2 align-top">
                OIDC 登录与平台用户通过 <strong>issuer + sub</strong> 绑定。请先用<strong>平台用户名或邮箱与密码</strong>登录，在「我的资料」中点击<strong>绑定
                Authentik</strong> 完成授权；绑定后方可使用登录页「使用 OIDC 登录」。无需让 IdP 用户名与平台用户名一致。
              </td>
            </tr>
            <tr>
              <td className="py-2 pr-2 align-top font-mono text-[11px]">oidcSupportedSigningAlgs 等</td>
              <td className="py-2 pr-2 align-top">Provider → <strong>协议设置</strong> → <strong>签名密钥</strong></td>
              <td className="py-2 align-top">
                见下方「ID Token 签名算法」；多数场景应在 Authentik 侧改为 <strong>RS256</strong>，而非在本平台填 HS256。
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-4 rounded-lg border border-amber-200/90 bg-amber-50/60 p-3 text-xs text-slate-800">
        <p className="font-semibold text-amber-950">ID Token 签名算法（RS256 / HS256）</p>
        <p className="mt-2 text-slate-700">
          控制台使用标准 OIDC 校验：用 IdP 的 <strong>JWKS</strong> 公钥验证 ID Token 签名。因此要求 IdP 使用<strong>非对称</strong>算法（常见为{" "}
          <strong>RS256</strong>），与 Authentik 文档中「为 OAuth2 Provider 选择 <strong>RSA 证书</strong> 作为签名密钥」一致。
        </p>
        <p className="mt-2 text-slate-700">
          若登录报错中出现 <code className="rounded bg-white px-1">unexpected signature algorithm &quot;HS256&quot;</code>，或提示仅接受{" "}
          <code className="rounded bg-white px-1">RS256</code>，说明当前 IdP 用<strong>对称</strong> HS256 签发 ID Token，多为{" "}
          <strong>未指定 RSA 签名密钥</strong>（界面看似已选证书但实际为空、Terraform 未设置{" "}
          <code className="rounded bg-white px-1">signing_key</code> 等）。
        </p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-slate-700">
          <li>
            打开 Authentik：<strong>Applications → Providers</strong> → 你的 OAuth2/OpenID Provider → <strong>协议设置</strong>。
          </li>
          <li>
            在 <strong>签名密钥（Signing key）</strong> 中<strong>显式选择</strong>一把 <strong>RSA</strong> 证书（如自带的「authentik
            Self-signed Certificate」或自建 CA/证书）；保存 Provider。
          </li>
          <li>
            自检：浏览器访问发行者下的 JWKS（OpenID 配置里的 <code className="rounded bg-white px-1">jwks_uri</code>），响应中应出现{" "}
            <code className="rounded bg-white px-1">RSA</code> 公钥；重新登录后 ID Token 头中的{" "}
            <code className="rounded bg-white px-1">alg</code> 应为 <code className="rounded bg-white px-1">RS256</code>。
          </li>
        </ol>
        <p className="mt-2 text-[11px] text-slate-600">
          官方说明见{" "}
          <a
            href="https://docs.goauthentik.io/add-secure-apps/providers/oauth2/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-700 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-900"
          >
            Authentik · OAuth2/OpenID Provider
          </a>
          （含 Redirect URI、Client 类型等）。GitHub 上亦有「未设置 signing_key 时仍为 HS256」的讨论，可搜 authentik RS256 signing key。
        </p>
        <p className="mt-2 text-[11px] text-slate-600">
          环境变量 <code className="rounded bg-white px-1">OIDC_SUPPORTED_SIGNING_ALGS</code>（或运行时{" "}
          <code className="rounded bg-white px-1">oidcSupportedSigningAlgs</code>）用于 IdP 使用 <strong>ES256</strong> 等仍走 JWKS
          的算法时收窄/显式声明；<strong>不能</strong>单靠此项把 HS256 对称签名变成可验证状态，请在 Authentik 改为 RSA 签名。
        </p>
      </div>

      <p className="mt-3 text-xs text-amber-900/90">
        <strong>重要：</strong>管理员在「平台用户」中创建账号后，用户使用<strong>用户名或邮箱 + 密码</strong>登录，再在「我的资料」绑定
        Authentik；绑定后 OIDC 登录会匹配 id_token 的 <code className="rounded bg-white px-1">iss</code> 与{" "}
        <code className="rounded bg-white px-1">sub</code>。<strong>oidcScopes 留空</strong>时仍使用默认{" "}
        <code className="rounded bg-white px-1">openid profile email</code>；勿将 <code className="rounded bg-white px-1">preferred_username</code>{" "}
        等声明名误写入 scope。
      </p>
    </CollapsibleManual>
  );
};

export default OidcAuthentikHelp;

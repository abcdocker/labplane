import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Activity as ActivityIcon,
  ChevronRight,
  Eye,
  EyeOff,
  Layers,
  LogIn,
  Server,
  Shield,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/auth/auth-context";
import { ApiHttpError, apiPostJson, type SystemCheck } from "@/lib/api";
import { cn } from "@/lib/utils";
import { TechBadge } from "@/components/login/TechBadge";
import { DockerLogo, GoLogo, K8sLogo, PrometheusLogo, VCenterLogo } from "@/components/login/TechLogos";
import "./Login.css";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";
const BRAND_LOGO = "/brand-logo.svg";

type LoginChallenge = {
  captchaRequired: boolean;
  captchaId?: string;
  question?: string;
};

type LoginPublicPayload = {
  systemCheck: SystemCheck;
};

async function fetchLoginChallenge(): Promise<LoginChallenge> {
  try {
    const r = await fetch(`${API_BASE}/api/auth/login-challenge`, { credentials: "same-origin" });
    if (!r.ok) return { captchaRequired: false };
    return (await r.json()) as LoginChallenge;
  } catch {
    return { captchaRequired: false };
  }
}

async function fetchLoginPublicStatus(signal?: AbortSignal): Promise<LoginPublicPayload> {
  const r = await fetch(`${API_BASE}/api/login/public-status`, { credentials: "same-origin", signal });
  if (!r.ok) throw new Error(`public-status ${r.status}`);
  return (await r.json()) as LoginPublicPayload;
}

function mapLoginApiError(e: ApiHttpError): string {
  const m = (e.serverMessage || "").trim();
  if (e.status === 401) return "密码错误";
  if (m.includes("验证码")) return m.startsWith("请") ? m : "验证码错误";
  if (m) return m;
  return "登录失败";
}

function mapTotpApiError(e: ApiHttpError): string {
  const m = (e.serverMessage || "").trim();
  if (e.status === 401) {
    if (m.includes("过期") || m.includes("重新")) return m;
    return m || "验证码错误";
  }
  if (m) return m;
  return "验证失败";
}

type LoginPasswordResponse = { message?: string } | { needsTotp: true; totpToken: string };

function safeRedirectPath(from: unknown): string {
  if (typeof from !== "string" || !from.startsWith("/")) return "/";
  if (from.startsWith("/login")) return "/";
  return from;
}

function LoginErrorPanel({ err, hint }: { err: string | null; hint: string | null }) {
  if (!err && !hint) return null;
  return (
    <div className="space-y-2">
      {err ? (
        <p className="rounded-lg border border-red-100 bg-red-50/90 px-3 py-2 text-sm text-red-700" role="alert">
          {err}
        </p>
      ) : null}
      {hint ? (
        <div
          className="rounded-lg border border-slate-200/90 bg-slate-50/95 px-3 py-2.5 text-left shadow-sm shadow-slate-200/40"
          role="region"
          aria-label="排查提示"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">提示</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{hint}</p>
        </div>
      ) : null}
    </div>
  );
}

/** OIDC 入口：只负责展示，跳转地址仍由服务端 OIDC 登录接口处理。 */
function LoginOidcOpsCard({ href, showLocalDivider }: { href: string; showLocalDivider: boolean }) {
  return (
    <div className="login-oidc-ops-card mb-6 space-y-3 sm:mb-7">
      <div
        className={cn(
          "login-card login-card-ops relative overflow-hidden rounded-2xl border border-slate-200/90 shadow-sm",
          "dark:border-slate-600/90"
        )}
      >
        <div className="login-card-top-accent" aria-hidden />
        <a
          href={href}
          className={cn(
            "login-oidc-ops-link group flex min-h-[4.25rem] w-full items-center gap-3 px-4 py-4 pl-5 transition sm:min-h-[4.5rem] sm:gap-4 sm:px-5 sm:py-5",
            "text-left text-slate-900 dark:text-slate-100",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950"
          )}
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/12 to-indigo-500/12 ring-1 ring-slate-200/90 dark:from-cyan-400/10 dark:to-indigo-400/10 dark:ring-slate-600">
            <Shield className="h-5 w-5 text-[#0891b2] dark:text-cyan-400" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
              SSO · OIDC · Authentik
            </p>
            <p className="truncate text-base font-semibold sm:text-lg">使用统一身份认证登录</p>
            <p className="truncate text-xs text-slate-500 sm:text-[13px] dark:text-slate-400">
              跳转到 IdP 授权，完成后自动回到控制台
            </p>
          </div>
          <ChevronRight
            className="h-5 w-5 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-[#1a5ec8] dark:group-hover:text-cyan-400"
            aria-hidden
          />
        </a>
      </div>
      {showLocalDivider ? (
        <div className="flex items-center gap-2.5 pt-0.5 sm:gap-3">
          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
          <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-slate-400">
            或使用本地账号
          </span>
          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        </div>
      ) : null}
    </div>
  );
}

function LoginSuccessOverlay() {
  return (
    <div className="login-success-overlay" role="status" aria-live="polite">
      <div className="login-success-inner">
        <div className="login-success-logo">
          <img src={BRAND_LOGO} alt="" width={280} height={86} />
        </div>
        <div className="login-success-check-wrap" aria-hidden>
          <svg className="login-success-check-svg" viewBox="0 0 52 52" fill="none">
            <circle className="login-success-check-circle" cx="26" cy="26" r="24" />
            <path className="login-success-check-mark" d="M14 27l8 8 16-16" />
          </svg>
        </div>
        <p className="login-success-title">已登录</p>
        <p className="login-success-sub">正在进入…</p>
        <div className="login-success-bar" aria-hidden />
      </div>
    </div>
  );
}

function shortStatusLabel(status: string): string {
  const s = (status || "").toLowerCase();
  if (s === "success") return "正常";
  if (s === "skipped") return "跳过";
  if (s === "warning") return "注意";
  if (s === "error") return "异常";
  if (s === "hidden") return "受限";
  return status || "—";
}

function LoginLeftStatusPanel({ sc, loading }: { sc: SystemCheck | undefined; loading: boolean }) {
  const baota = sc?.baota;
  const ddns = sc?.ddns;
  const k8s = sc?.k8s;

  const metrics = [
    {
      label: "宝塔",
      value: loading ? "…" : shortStatusLabel(baota?.status ?? ""),
      sub: !loading && baota?.msg ? baota.msg : undefined,
      icon: <ActivityIcon className="h-3.5 w-3.5" />,
    },
    {
      label: "DDNS",
      value: loading ? "…" : shortStatusLabel(ddns?.status ?? ""),
      sub: !loading && ddns?.msg ? ddns.msg : undefined,
      icon: <Server className="h-3.5 w-3.5" />,
    },
    {
      label: "Ingress",
      value: loading ? "…" : k8s?.ingressInstalled ? "已检测" : "未检测",
      sub:
        !loading && k8s?.ingressHostNetwork
          ? "Ingress 主机网络"
          : !loading && k8s?.ingressInstalled
            ? "控制器已就绪"
            : undefined,
      icon: <Layers className="h-3.5 w-3.5" />,
    },
  ];

  const allOk =
    !loading &&
    sc &&
    (baota?.status === "success" || baota?.status === "skipped") &&
    ddns?.status === "success";

  const anyErr = !loading && sc && (baota?.status === "error" || ddns?.status === "error");

  return (
    <div
      className="login-v2-fade-in-up login-v2-d300 flex flex-col gap-4 rounded-2xl border border-slate-200/90 bg-slate-50/80 px-5 py-4 dark:border-slate-700 dark:bg-slate-900/50 min-[420px]:flex-row min-[420px]:flex-wrap min-[420px]:items-center min-[420px]:gap-5 sm:px-6 sm:py-5"
      aria-label="运行状态"
    >
      <div className="flex shrink-0 items-center gap-2">
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            loading ? "bg-slate-300" : anyErr ? "bg-amber-500" : allOk ? "bg-emerald-500" : "bg-sky-500"
          )}
          style={
            !loading && allOk
              ? { boxShadow: "0 0 6px rgba(22,163,74,0.65)" }
              : !loading && anyErr
                ? { boxShadow: "0 0 6px rgba(245,158,11,0.55)" }
                : undefined
          }
        />
        <span className="text-[11px] font-medium text-slate-600 sm:text-xs dark:text-slate-300">
          {loading ? "状态加载中…" : anyErr ? "存在告警" : allOk ? "各链路正常" : "部分待确认"}
        </span>
      </div>
      <div className="hidden h-6 w-px shrink-0 bg-slate-200 min-[420px]:block dark:bg-slate-700" />
      <div className="grid min-w-0 flex-1 grid-cols-1 gap-4 min-[380px]:grid-cols-3 sm:flex sm:flex-wrap sm:items-start sm:gap-x-6 sm:gap-y-3">
        {metrics.map((m) => (
          <div key={m.label} className="flex min-w-0 flex-col gap-1 min-[380px]:max-w-none sm:max-w-[220px]">
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
              <span className="text-[var(--login-v2-primary,#1a5ec8)]">{m.icon}</span>
              <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{m.value}</span>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">{m.label}</span>
            {m.sub ? (
              <span className="line-clamp-2 text-xs leading-snug text-slate-400 dark:text-slate-500" title={m.sub}>
                {m.sub}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

const TECH_ITEMS = [
  {
    name: "Kubernetes",
    version: "集群",
    color: "#326de6",
    floatClass: "login-float-0",
    glowClass: "login-shadow-glow-k8s",
    logo: <K8sLogo size={52} />,
  },
  {
    name: "Docker",
    version: "运行时",
    color: "#0db7ed",
    floatClass: "login-float-1",
    glowClass: "login-shadow-glow-docker",
    logo: <DockerLogo size={52} />,
  },
  {
    name: "Golang",
    version: "服务",
    color: "#00acd7",
    floatClass: "login-float-2",
    glowClass: "login-shadow-glow-go",
    logo: <GoLogo size={52} />,
  },
  {
    name: "Prometheus",
    version: "监控",
    color: "#e6522c",
    floatClass: "login-float-3",
    glowClass: "login-shadow-glow-prom",
    logo: <PrometheusLogo size={52} />,
  },
  {
    name: "vCenter",
    version: "虚拟化",
    color: "#6ab04c",
    floatClass: "login-float-1",
    glowClass: "login-shadow-glow-vcenter",
    logo: <VCenterLogo size={52} />,
  },
] as const;

function LoginCapabilityGrid({ sc, loading }: { sc: SystemCheck | undefined; loading: boolean }) {
  const cards = [
    {
      title: "Kubernetes / Ingress",
      desc: "集群资源、工作负载、YAML、Pod 终端与 Ingress 发布。",
      status: loading ? "检测中" : sc?.k8s?.ingressInstalled ? "Ingress 已检测" : "等待接入",
      tone: "blue",
      icon: <Layers className="h-4 w-4" />,
    },
    {
      title: "宝塔同步 / DDNS",
      desc: "将受管 Ingress 自动同步为宝塔站点与 HTTPS 反向代理。",
      status: loading
        ? "检测中"
        : `${shortStatusLabel(sc?.baota?.status ?? "")} · ${shortStatusLabel(sc?.ddns?.status ?? "")}`,
      tone: "emerald",
      icon: <Server className="h-4 w-4" />,
    },
    {
      title: "vCenter / SSH / 控制台",
      desc: "虚拟机详情、vSphere 控制台、堡垒机 SSH、SFTP 与主机监控。",
      status: "登录后可用",
      tone: "violet",
      icon: <Terminal className="h-4 w-4" />,
    },
    {
      title: "审计与安全",
      desc: "登录限流、TOTP、OIDC、权限控制、异地登录提醒与平台审计。",
      status: "安全登录",
      tone: "cyan",
      icon: <Shield className="h-4 w-4" />,
    },
  ];

  return (
    <div className="login-v2-fade-in-up login-v2-d300 grid gap-3 sm:grid-cols-2">
      {cards.map((card) => (
        <div
          key={card.title}
          className={cn(
            "login-feature-card rounded-2xl border bg-white/88 p-4 shadow-sm backdrop-blur dark:bg-slate-900/62",
            card.tone === "blue" && "border-blue-200/80 dark:border-blue-900/60",
            card.tone === "emerald" && "border-emerald-200/80 dark:border-emerald-900/60",
            card.tone === "violet" && "border-violet-200/80 dark:border-violet-900/60",
            card.tone === "cyan" && "border-cyan-200/80 dark:border-cyan-900/60"
          )}
        >
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                card.tone === "blue" && "bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300",
                card.tone === "emerald" && "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300",
                card.tone === "violet" && "bg-violet-50 text-violet-700 dark:bg-violet-950/70 dark:text-violet-300",
                card.tone === "cyan" && "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/70 dark:text-cyan-300"
              )}
            >
              {card.icon}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{card.title}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{card.desc}</p>
              <p className="mt-3 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {card.status}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { status, loading, refetch } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [errHint, setErrHint] = useState<string | null>(null);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [challenge, setChallenge] = useState<LoginChallenge>({ captchaRequired: false });
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [loginStep, setLoginStep] = useState<"password" | "totp">("password");
  const [totpToken, setTotpToken] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const pubQ = useQuery({
    queryKey: ["login-public-status"],
    queryFn: ({ signal }) => fetchLoginPublicStatus(signal),
    staleTime: 25_000,
    refetchInterval: 60_000,
    retry: 1,
  });

  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const q = p.get("error");
    const h = p.get("hint");
    if (!q && !h) return;
    if (q) setErr(q);
    if (h) setErrHint(h);
    p.delete("error");
    p.delete("hint");
    const qs = p.toString();
    navigate({ pathname: location.pathname, search: qs ? `?${qs}` : "" }, { replace: true });
  }, [location.pathname, location.search, navigate]);

  /** 大屏禁止 html/body 纵向滚动（避免双滚动条）；小屏允许纵向滚动，避免营销区把登录表单顶出可视区。 */
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => {
      if (mq.matches) {
        html.style.overflow = "hidden";
        body.style.overflow = "hidden";
      } else {
        html.style.overflow = prevHtml;
        body.style.overflow = prevBody;
      }
    };
    apply();
    mq.addEventListener("change", apply);
    return () => {
      mq.removeEventListener("change", apply);
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, []);

  const redirectTarget = useMemo(() => {
    const st = (location.state as { from?: unknown } | null)?.from;
    if (typeof st === "string") {
      return safeRedirectPath(st);
    }
    const r = new URLSearchParams(location.search).get("redirect");
    if (r) {
      try {
        return safeRedirectPath(decodeURIComponent(r));
      } catch {
        return "/";
      }
    }
    return "/";
  }, [location.state, location.search]);

  const oidcHref = useMemo(() => {
    const base = `${API_BASE}/api/auth/oidc/login`;
    if (status?.oidcLogin !== true) return base;
    if (redirectTarget === "/") return base;
    return `${base}?redirect=${encodeURIComponent(redirectTarget)}`;
  }, [status?.oidcLogin, redirectTarget]);

  useEffect(() => {
    if (loading || !status) return;
    if (!status.authRequired || status.loggedIn) {
      if (loginSuccess) return;
      navigate(redirectTarget, { replace: true });
    }
  }, [loading, status, navigate, loginSuccess, redirectTarget]);

  useEffect(() => {
    if (!loginSuccess) return;
    const t = window.setTimeout(() => {
      navigate(redirectTarget, { replace: true });
    }, 900);
    return () => window.clearTimeout(t);
  }, [loginSuccess, navigate, redirectTarget]);

  useEffect(() => {
    if (loading || !status) return;
    if (!status.authRequired || status.loggedIn) return;
    if (status.passwordLogin === false) return;
    void fetchLoginChallenge().then(setChallenge);
  }, [loading, status?.authRequired, status?.loggedIn, status?.passwordLogin]);

  const resetToPasswordStep = () => {
    setLoginStep("password");
    setTotpToken("");
    setTotpCode("");
    setErrHint(null);
  };

  const onSubmitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErr(null);
    setErrHint(null);
    try {
      const body: Record<string, string> = { username, password };
      if (challenge.captchaRequired && challenge.captchaId) {
        body.captchaId = challenge.captchaId;
        body.captchaAnswer = captchaAnswer.trim();
      }
      const data = await apiPostJson<LoginPasswordResponse>("/api/auth/login", body);
      if ("needsTotp" in data && data.needsTotp) {
        setTotpToken(data.totpToken);
        setLoginStep("totp");
        setTotpCode("");
        return;
      }
      await refetch();
      setLoginSuccess(true);
    } catch (e) {
      if (e instanceof ApiHttpError && e.path.includes("/api/auth/login")) {
        const msg = mapLoginApiError(e);
        setErr(msg);
        setErrHint(e.serverHint?.trim() ? e.serverHint : null);
        // 若后端提示需要验证码（如连续失败或验证码缺失），同步刷新 challenge 确保输入框立即出现
        if (msg.includes("验证码")) {
          try {
            const c = await fetchLoginChallenge();
            setChallenge(c);
          } catch {
            /* ignore */
          }
        } else {
          void fetchLoginChallenge().then(setChallenge);
        }
      } else {
        setErr((e as Error).message);
        setErrHint(null);
        void fetchLoginChallenge().then(setChallenge);
      }
      setCaptchaAnswer("");
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmitTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErr(null);
    setErrHint(null);
    try {
      await apiPostJson("/api/auth/login-totp", { totpToken, code: totpCode.trim() });
      await refetch();
      setLoginSuccess(true);
    } catch (e) {
      if (e instanceof ApiHttpError) {
        setErr(mapTotpApiError(e));
        setErrHint(e.serverHint?.trim() ? e.serverHint : null);
      } else {
        setErr((e as Error).message);
        setErrHint(null);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const shell = (
    <div className="login-page-v2 relative h-full min-h-full w-full overflow-hidden bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <div className="login-page-v2-grid-bg login-page-v2-grid-bg--pulse pointer-events-none absolute inset-0 opacity-70" />
      <div
        className="login-page-v2-scan-line pointer-events-none absolute left-0 right-0 top-0 h-px opacity-20"
        style={{
          background: "linear-gradient(90deg, transparent, var(--login-v2-primary, #1a5ec8), transparent)",
        }}
      />
      <div
        className="pointer-events-none absolute left-1/4 top-1/4 h-96 w-96 rounded-full blur-3xl opacity-[0.06]"
        style={{ background: "var(--login-v2-k8s, #326de6)" }}
      />
      <div
        className="pointer-events-none absolute bottom-1/4 right-1/3 h-72 w-72 rounded-full blur-3xl opacity-[0.05]"
        style={{ background: "var(--login-v2-vc, #6ab04c)" }}
      />
    </div>
  );

  if (loading || !status) {
    return (
      <div className="relative min-h-[100dvh] min-h-screen w-full overflow-x-hidden overflow-y-auto lg:overflow-y-hidden">
        <div className="absolute inset-0 z-0">{shell}</div>
        <div className="relative z-10 flex min-h-[100dvh] min-h-screen w-full items-center justify-center px-4 py-6">
          <div className="login-v2-fade-in-up mx-auto flex w-full max-w-[min(100vw-2rem,400px)] flex-col items-center gap-4 rounded-2xl border border-slate-200/90 bg-white/95 px-6 py-7 shadow-sm sm:px-10 sm:py-8 dark:border-slate-700 dark:bg-slate-900/90">
            <img src={BRAND_LOGO} alt="" width={200} height={61} className="h-9 w-auto object-contain opacity-90 sm:h-10" />
            <div className="flex items-center gap-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-slate-600 dark:border-slate-700 dark:border-t-slate-300" />
              <span className="text-sm text-slate-500">加载中</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const showPassword = status.passwordLogin !== false;
  const showOidc = status.oidcLogin === true;

  if (!status.authRequired || status.loggedIn) {
    return (
      <div className="relative min-h-[100dvh] min-h-screen w-full overflow-x-hidden overflow-y-auto lg:overflow-y-hidden">
        <div className="absolute inset-0 z-0">{shell}</div>
        <div className="relative z-10 flex min-h-[100dvh] min-h-screen w-full items-center justify-center px-4 py-6">
          <div className="login-v2-fade-in-up mx-auto flex w-full max-w-[min(100vw-2rem,400px)] flex-col items-center gap-4 rounded-2xl border border-slate-200/90 bg-white/95 px-6 py-7 shadow-sm sm:px-10 sm:py-8 dark:border-slate-700 dark:bg-slate-900/90">
            <img src={BRAND_LOGO} alt="" width={200} height={61} className="h-9 w-auto object-contain opacity-90 sm:h-10" />
            <span className="text-sm text-slate-500">正在跳转</span>
          </div>
        </div>
      </div>
    );
  }

  const sc = pubQ.data?.systemCheck;

  return (
    <div className="login-page-v2 relative min-h-[100dvh] min-h-screen w-full overflow-x-hidden overflow-y-auto bg-white lg:overflow-y-hidden dark:bg-slate-950">
      <div className="login-page-v2-grid-bg login-page-v2-grid-bg--pulse pointer-events-none absolute inset-0 opacity-60" />
      <div
        className="login-page-v2-scan-line pointer-events-none absolute left-0 right-0 top-0 h-px opacity-15 dark:opacity-25"
        style={{
          background: "linear-gradient(90deg, transparent, var(--login-v2-primary, #1a5ec8), transparent)",
        }}
      />
      <div
        className="pointer-events-none absolute left-1/4 top-1/4 h-96 w-96 rounded-full blur-3xl opacity-[0.05] dark:opacity-[0.08]"
        style={{ background: "#326de6" }}
      />
      <div
        className="pointer-events-none absolute bottom-1/4 right-1/3 h-72 w-72 rounded-full blur-3xl opacity-[0.04] dark:opacity-[0.07]"
        style={{ background: "#6ab04c" }}
      />

      {loginSuccess && <LoginSuccessOverlay />}

      <div className="relative z-10 mx-auto w-full max-w-[min(100%,92rem)] px-5 pb-[max(1.25rem,var(--kbts-safe-bottom,env(safe-area-inset-bottom)))] pt-[max(0.75rem,var(--kbts-safe-top,env(safe-area-inset-top)))] sm:px-7 md:px-9 lg:px-12 lg:pb-10 lg:pt-8 xl:px-14 xl:pt-10">
        <div className="grid w-full grid-cols-1 content-start gap-y-10 gap-x-0 py-6 sm:gap-y-12 sm:py-8 md:py-10 lg:min-h-[100dvh] lg:grid-cols-[minmax(0,1.14fr)_minmax(0,0.86fr)] lg:content-center lg:items-center lg:gap-x-12 lg:gap-y-0 lg:py-14 xl:gap-x-16 2xl:gap-x-20">
        {/* 左栏：大屏在左；小屏排在登录表单之后 */}
        <div className="order-2 flex min-h-0 w-full flex-col justify-center border-t border-slate-200/80 pt-8 dark:border-slate-800/80 lg:order-none lg:border-t-0 lg:border-r lg:border-b-0 lg:pt-0 lg:pb-0 lg:pr-10 xl:pr-14">
          <div className="mx-auto flex w-full max-w-xl flex-col space-y-7 sm:space-y-8 lg:mx-0 lg:max-w-[min(100%,46rem)] xl:max-w-[50rem]">
            <div className="login-v2-fade-in-up login-v2-d100 mb-5 flex flex-wrap items-center gap-2 sm:mb-8 sm:gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#1a5ec8] shadow-sm">
                <Shield className="h-5 w-5 text-white" aria-hidden />
              </div>
              <img src={BRAND_LOGO} alt="" className="h-9 w-auto max-w-[200px] object-contain sm:h-10" />
              <span
                className="rounded-full border px-2 py-0.5 text-xs font-semibold"
                style={{
                  borderColor: "rgba(106,176,76,0.35)",
                  color: "#3d7a2e",
                  background: "rgba(106,176,76,0.12)",
                }}
              >
                私有云控制台
              </span>
            </div>

            <div className="login-v2-fade-in-up login-v2-d200 mb-3 sm:mb-4">
              <h1 className="mb-2 text-[1.65rem] font-bold leading-[1.2] tracking-tight text-slate-900 sm:mb-3 sm:text-3xl sm:leading-tight md:text-4xl lg:text-[2.65rem] xl:text-5xl dark:text-slate-50">
                云原生基础设施
                <br />
                <span className="text-[#1a5ec8]">管理平台</span>
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base dark:text-slate-400">
                面向 HomeLab 与自建集群的一体化控制台：从 Ingress 自动发布到宝塔，到 vCenter 控制台、SSH 堡垒机、监控与审计，登录后按权限进入各模块。
              </p>
            </div>

            <div className="login-v2-fade-in-up login-v2-d200 -mx-1 flex gap-3 overflow-x-auto overflow-y-hidden pb-2 [-ms-overflow-style:none] [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:pb-0 [&::-webkit-scrollbar]:hidden md:gap-4">
              {TECH_ITEMS.map((item) => (
                <TechBadge
                  key={item.name}
                  name={item.name}
                  version={item.version}
                  color={item.color}
                  floatClass={item.floatClass}
                  glowClass={item.glowClass}
                >
                  {item.logo}
                </TechBadge>
              ))}
            </div>

            <LoginCapabilityGrid sc={sc} loading={pubQ.isPending} />

            <div className="login-v2-fade-in-up login-v2-d400 rounded-2xl border border-slate-200/90 bg-slate-50/80 px-5 py-4 text-xs leading-relaxed text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
              {pubQ.isError ? (
                <span className="text-amber-700 dark:text-amber-300">
                  未登录探活暂不可用：{String(pubQ.error?.message ?? "错误")}
                </span>
              ) : (
                <>
                  未登录仅展示状态摘要，不暴露宝塔地址、DDNS 域名、节点地址、API Key、日志或 Secret。登录后将按账号角色加载完整工作台。
                </>
              )}
            </div>
          </div>
        </div>

        {/* 右栏：小屏优先展示登录表单 */}
        <div className="order-1 flex min-h-0 w-full flex-col justify-center rounded-2xl bg-slate-50/40 px-1 py-2 sm:px-2 lg:order-none lg:rounded-none lg:bg-transparent lg:px-0 lg:py-0 lg:pl-1 xl:pl-3 dark:bg-slate-900/25 dark:lg:bg-transparent">
          <div className="mx-auto w-full min-w-0 max-w-[min(100vw-2rem,28rem)] translate-x-0 sm:max-w-[min(100vw-2.5rem,30rem)] lg:mx-auto lg:max-w-[min(100%,28rem)] lg:translate-x-3 xl:max-w-[30rem] xl:translate-x-5 2xl:translate-x-6">
            <div className="login-v2-fade-in-up login-v2-d200 login-card-glow-v2 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm sm:rounded-3xl sm:p-8 md:p-10 dark:border-slate-700 dark:bg-slate-900/85">
              <div className="mb-6 sm:mb-8">
                <div className="flex items-center gap-3 sm:gap-3.5">
                  <Terminal className="h-6 w-6 shrink-0 text-[#1a5ec8] sm:h-7 sm:w-7" aria-hidden />
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[1.65rem] dark:text-slate-50">
                      登录控制台
                    </h2>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      OIDC 与本地账号可并存，跳转后会回到原访问页面。
                    </p>
                  </div>
                </div>
              </div>

              <div className="mb-6 flex flex-wrap content-start gap-2 rounded-xl border border-slate-200/90 bg-slate-50/90 px-3 py-2.5 sm:mb-7 sm:gap-2.5 sm:px-4 sm:py-3 dark:border-slate-700 dark:bg-slate-800/50">
                <span className="w-full shrink-0 text-xs font-medium text-slate-500 sm:w-auto dark:text-slate-400">
                  可用入口
                </span>
                {showOidc ? (
                  <span
                    className="rounded-md border px-2 py-1 text-xs font-semibold dark:border-slate-600"
                    style={{
                      background: "#0891b214",
                      color: "#0891b2",
                      borderColor: "#0891b233",
                    }}
                  >
                    OIDC SSO
                  </span>
                ) : null}
                {showPassword ? (
                  <span
                    className="rounded-md border px-2 py-1 text-xs font-semibold dark:border-slate-600"
                    style={{
                      background: "#1a5ec814",
                      color: "#1a5ec8",
                      borderColor: "#1a5ec833",
                    }}
                  >
                    本地密码
                  </span>
                ) : null}
                <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                  安全会话
                </span>
              </div>

              {showOidc ? <LoginOidcOpsCard href={oidcHref} showLocalDivider={showPassword} /> : null}

              {showPassword && loginStep === "password" && (
                <form onSubmit={onSubmitPassword} className="flex flex-col gap-6" autoComplete="off">
                  <div className="sr-only" aria-hidden>
                    <input type="text" tabIndex={-1} autoComplete="off" />
                    <input type="password" tabIndex={-1} autoComplete="off" />
                  </div>
                  <div className="flex flex-col gap-2.5">
                    <Label htmlFor="login-account" className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      账号
                    </Label>
                    <Input
                      id="login-account"
                      name="username"
                      autoComplete="username"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      onFocus={() => {
                        setFocusedField("username");
                      }}
                      onBlur={() => setFocusedField(null)}
                      placeholder="用户名"
                      className={cn(
                        "login-v2-input h-12 rounded-xl border bg-white px-4 text-base transition dark:border-slate-600 dark:bg-slate-950 sm:text-sm",
                        focusedField === "username" ? "border-[#1a5ec8] ring-0" : "border-slate-200"
                      )}
                    />
                  </div>
                  <div className="flex flex-col gap-2.5">
                    <Label htmlFor="login-secret" className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      密码
                    </Label>
                    <div className="relative">
                      <Input
                        id="login-secret"
                        name="password"
                        type={passwordVisible ? "text" : "password"}
                        autoComplete="current-password"
                        spellCheck={false}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onFocus={() => setFocusedField("password")}
                        onBlur={() => setFocusedField(null)}
                        className={cn(
                          "login-v2-input h-12 rounded-xl border bg-white pr-11 pl-4 text-base transition dark:border-slate-600 dark:bg-slate-950 sm:text-sm",
                          focusedField === "password" ? "border-[#1a5ec8] ring-0" : "border-slate-200"
                        )}
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                        onClick={() => setPasswordVisible(!passwordVisible)}
                        aria-label={passwordVisible ? "隐藏密码" : "显示密码"}
                      >
                        {passwordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  {challenge.captchaRequired && challenge.question ? (
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="login-captcha" className="text-slate-600 dark:text-slate-300">
                        验证码
                      </Label>
                      <p className="rounded-lg border border-amber-100 bg-amber-50/90 px-3 py-2 font-mono text-sm font-semibold text-amber-950">
                        {challenge.question}
                      </p>
                      <Input
                        id="login-captcha"
                        name="login-captcha"
                        autoComplete="off"
                        value={captchaAnswer}
                        onChange={(e) => setCaptchaAnswer(e.target.value)}
                        placeholder="结果"
                        className="h-11 rounded-xl border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-950"
                      />
                    </div>
                  ) : null}
                  <LoginErrorPanel err={err} hint={errHint} />
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1a5ec8] to-[#0891b2] text-base font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-60 sm:text-sm"
                  >
                    {submitting ? (
                      <>认证中…</>
                    ) : (
                      <>
                        <LogIn className="h-4 w-4" />
                        登录控制台
                      </>
                    )}
                  </Button>
                </form>
              )}

              {showPassword && loginStep === "totp" && (
                <form onSubmit={onSubmitTotp} className="flex flex-col gap-5">
                  <p className="text-center text-sm text-slate-600 dark:text-slate-300">两步验证 · 输入 6 位动态码</p>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="login-totp" className="text-slate-600 dark:text-slate-300">
                      动态码
                    </Label>
                    <Input
                      id="login-totp"
                      name="login-totp"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={8}
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                      placeholder="000000"
                      className="h-11 rounded-xl border-slate-200 bg-white font-mono text-lg tracking-widest dark:border-slate-600 dark:bg-slate-950"
                    />
                  </div>
                  <LoginErrorPanel err={err} hint={errHint} />
                  <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 flex-1 rounded-xl border-slate-200 dark:border-slate-600"
                      disabled={submitting}
                      onClick={() => {
                        resetToPasswordStep();
                        setErr(null);
                        setErrHint(null);
                      }}
                    >
                      返回
                    </Button>
                    <Button
                      type="submit"
                      className="h-11 flex-[2] rounded-xl bg-slate-900 font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
                      disabled={submitting || totpCode.trim().length < 6}
                    >
                      {submitting ? "验证中…" : "继续"}
                    </Button>
                  </div>
                </form>
              )}

              {!showPassword && showOidc && (err || errHint) ? (
                <div className="mt-4">
                  <LoginErrorPanel err={err} hint={errHint} />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};

export default Login;

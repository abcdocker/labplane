import React, { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/auth/auth-context";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ApiHttpError, API_BASE, apiDelete, apiGetJson, apiPostJson, apiPutJson } from "@/lib/api";

type Row = {
  id: number;
  username: string;
  email: string;
  role: string;
  disabled: boolean;
  permissionsJson?: string;
  totpEnabled?: boolean;
  totpConfigured?: boolean;
  virtual?: boolean;
  allowMultiIpLogin?: boolean;
  allowedLoginIps?: string;
  oidcBound?: boolean;
};

type TotpProvisionApiRes = {
  otpauthUrl?: string;
  secret?: string;
  qrPngBase64?: string;
  issuer?: string;
  account?: string;
};

type ListRes = { users?: Row[] | null };

type ModuleAccess = "none" | "ro" | "rw";
type RedisScope = "full" | "readonly" | "managed_only";

type MenuVisibility = {
  kubernetes: boolean;
  vcenter: boolean;
  baota: boolean;
  appcenter: boolean;
  vcenter_cloud: boolean;
  vcenter_tools: boolean;
  vcenter_bastion: boolean;
  hub: boolean;
};

const defaultMenuVisibility = (): MenuVisibility => ({
  kubernetes: true,
  vcenter: true,
  baota: true,
  appcenter: true,
  vcenter_cloud: true,
  vcenter_tools: true,
  vcenter_bastion: true,
  hub: true,
});

function parseMenuFromJson(o: Record<string, unknown>): MenuVisibility {
  const raw = o.menu;
  const m =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, boolean>)
      : {};
  const out = defaultMenuVisibility();
  (Object.keys(out) as (keyof MenuVisibility)[]).forEach((k) => {
    if (Object.prototype.hasOwnProperty.call(m, k)) {
      out[k] = m[k] !== false;
    }
  });
  return out;
}

const MENU_LABELS: Record<keyof MenuVisibility, string> = {
  kubernetes: "Kubernetes（侧栏 / 顶栏 / 工作台）",
  vcenter: "vCenter",
  baota: "宝塔",
  appcenter: "应用中心",
  vcenter_cloud: "vCenter · 公有云",
  vcenter_tools: "vCenter · 内网工具箱",
  vcenter_bastion: "vCenter · 堡垒机",
  hub: "工作台首页（各模块卡片）",
};

type PermForm = {
  k8s: ModuleAccess;
  vcenter: ModuleAccess;
  baota: ModuleAccess;
  appcenter: ModuleAccess;
  appcenterRedis: RedisScope;
  appcenterCloudVm: RedisScope;
  /** 验证平台密码后可查看云主机 Hysteria2 客户端 YAML / 列表内网端点概要 */
  appcenterCloudVmHysteriaReveal: boolean;
  maskSensitiveData: boolean;
  /** 仅 k8s=rw 时写入 permissions_json */
  k8sPodExec: boolean;
  k8sPodDelete: boolean;
  menuVisibility: MenuVisibility;
};

const defaultPermForm = (): PermForm => ({
  k8s: "ro",
  vcenter: "ro",
  baota: "ro",
  appcenter: "ro",
  appcenterRedis: "full",
  appcenterCloudVm: "full",
  appcenterCloudVmHysteriaReveal: false,
  maskSensitiveData: true,
  k8sPodExec: false,
  k8sPodDelete: false,
  menuVisibility: defaultMenuVisibility(),
});

function normalizeModule(v: unknown): ModuleAccess {
  if (v === "none" || v === "ro" || v === "rw") return v;
  return "ro";
}

function normalizeRedisScope(v: unknown): RedisScope {
  if (v === "full" || v === "readonly" || v === "managed_only") return v;
  return "full";
}

function parsePermissionsJson(raw: string | undefined): { useCustom: boolean; form: PermForm } {
  const t = (raw ?? "").trim();
  if (!t) return { useCustom: false, form: defaultPermForm() };
  try {
    const o = JSON.parse(t) as Record<string, unknown>;
    const appcenterRedis = normalizeRedisScope(o.appcenterRedis);
    const appcenterCloudVm = normalizeRedisScope(o.appcenterCloudVm ?? o.appcenterRedis);
    let appcenter = normalizeModule(o.appcenter);
    if (appcenterRedis === "managed_only" || appcenterCloudVm === "managed_only") {
      appcenter = "rw";
    }
    const k8s = normalizeModule(o.k8s);
    const k8sPodExec =
      typeof o.k8sPodExec === "boolean" ? o.k8sPodExec : k8s === "rw";
    const k8sPodDelete =
      typeof o.k8sPodDelete === "boolean" ? o.k8sPodDelete : k8s === "rw";
    return {
      useCustom: true,
      form: {
        k8s,
        vcenter: normalizeModule(o.vcenter),
        baota: normalizeModule(o.baota),
        appcenter,
        appcenterRedis,
        appcenterCloudVm,
        appcenterCloudVmHysteriaReveal:
          typeof o.appcenterCloudVmHysteriaReveal === "boolean"
            ? o.appcenterCloudVmHysteriaReveal
            : false,
        maskSensitiveData: Boolean(o.maskSensitiveData),
        k8sPodExec: k8s === "rw" ? k8sPodExec : false,
        k8sPodDelete: k8s === "rw" ? k8sPodDelete : false,
        menuVisibility: parseMenuFromJson(o),
      },
    };
  } catch {
    return { useCustom: false, form: defaultPermForm() };
  }
}

function buildPermissionsJson(
  useCustom: boolean,
  role: string,
  form: PermForm
): string | undefined {
  if (role === "admin") return undefined;
  if (!useCustom) return "";
  let appcenter = form.appcenter;
  if (form.appcenterRedis === "managed_only" || form.appcenterCloudVm === "managed_only") {
    appcenter = "rw";
  }
  const menuOut: Record<string, boolean> = {};
  (Object.keys(form.menuVisibility) as (keyof MenuVisibility)[]).forEach((k) => {
    if (form.menuVisibility[k] === false) {
      menuOut[k] = false;
    }
  });
  const base: Record<string, unknown> = {
    k8s: form.k8s,
    vcenter: form.vcenter,
    baota: form.baota,
    appcenter,
    appcenterRedis: form.appcenterRedis,
    appcenterCloudVm: form.appcenterCloudVm,
    appcenterCloudVmHysteriaReveal: form.appcenterCloudVmHysteriaReveal,
    maskSensitiveData: form.maskSensitiveData,
  };
  if (form.k8s === "rw") {
    base.k8sPodExec = form.k8sPodExec;
    base.k8sPodDelete = form.k8sPodDelete;
  }
  if (Object.keys(menuOut).length > 0) {
    base.menu = menuOut;
  }
  return JSON.stringify(base);
}

function ModuleSelectRow({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: ModuleAccess;
  onChange: (v: ModuleAccess) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <Label className="shrink-0 text-sm text-slate-700">{label}</Label>
      <Select
        value={value}
        onValueChange={(v) => onChange(v as ModuleAccess)}
        disabled={disabled}
      >
        <SelectTrigger className="h-9 w-full sm:w-[200px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">不可见</SelectItem>
          <SelectItem value="ro">只读</SelectItem>
          <SelectItem value="rw">读写</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

const PlatformUsers: React.FC = () => {
  const { status, loading: authLoading, refetch: refetchAuth } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();
  const usersMgmtOk = status?.usersManagementEnabled === true;
  const mysqlDsnConfigured = status?.mysqlDsnConfigured === true;
  const mysqlConnectErr = (status?.mysqlConnectError ?? "").trim();
  const listQ = useQuery({
    queryKey: ["admin-users"],
    queryFn: ({ signal }) => apiGetJson<ListRes>("/api/admin/users", { signal }),
    enabled: !authLoading && usersMgmtOk && status?.role !== "viewer",
  });

  const oidcBind = searchParams.get("oidc_bind");
  const oidcReason = searchParams.get("reason") ?? "";
  const oidcMessage = searchParams.get("message") ?? "";
  useEffect(() => {
    if (!oidcBind) return;
    if (oidcBind === "ok") {
      toast.success("OIDC 绑定已保存。");
      void refetchAuth();
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
    } else if (oidcBind === "conflict") {
      toast.error("该 Authentik 账号已绑定到其他平台用户。");
    } else if (oidcBind === "duplicate") {
      toast.error("绑定冲突：数据库唯一约束。");
    } else if (oidcBind === "err") {
      const hints: Record<string, string> = {
        exchange: "授权码换取令牌失败。",
        verify: "ID Token 校验失败。",
        discovery: "无法连接 OIDC 发现地址。",
        state: "安全校验失败（state）。",
        nonce: "缺少或无效的 nonce。",
        nonce_mismatch: "nonce 不匹配。",
        nosub: "IdP 返回的 token 缺少 sub。",
        nodb: "未连接 MySQL。",
        lookup: "查询绑定信息失败。",
        save: "保存绑定失败。",
        missing_code: "缺少授权参数。",
        no_id_token: "IdP 未返回 id_token。",
        idp: oidcMessage ? `IdP 错误：${decodeURIComponent(oidcMessage)}` : "IdP 返回错误。",
      };
      toast.error(hints[oidcReason] ?? "绑定失败。");
    }
    setSearchParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.delete("oidc_bind");
        n.delete("reason");
        n.delete("message");
        return n;
      },
      { replace: true }
    );
  }, [oidcBind, oidcReason, oidcMessage, qc, refetchAuth, setSearchParams]);

  const [oidcUnbindRow, setOidcUnbindRow] = useState<Row | null>(null);
  const [oidcUnbindPwd, setOidcUnbindPwd] = useState("");
  const [oidcUnbindBusy, setOidcUnbindBusy] = useState(false);

  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Row | null>(null);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("viewer");
  const [useCustomPermissions, setUseCustomPermissions] = useState(false);
  const [permForm, setPermForm] = useState<PermForm>(() => defaultPermForm());
  const [allowedLoginIps, setAllowedLoginIps] = useState("");
  const [allowMultiIpLogin, setAllowMultiIpLogin] = useState(false);

  const resetForm = () => {
    setEdit(null);
    setUsername("");
    setEmail("");
    setPassword("");
    setRole("viewer");
    setUseCustomPermissions(false);
    setPermForm(defaultPermForm());
    setAllowedLoginIps("");
    setAllowMultiIpLogin(false);
  };

  const openCreate = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = (r: Row) => {
    setEdit(r);
    setUsername(r.username);
    setEmail(r.email);
    setPassword("");
    setRole(r.role);
    const parsed = parsePermissionsJson(r.permissionsJson);
    setUseCustomPermissions(parsed.useCustom);
    setPermForm(parsed.form);
    setAllowedLoginIps((r.allowedLoginIps ?? "").trim());
    setAllowMultiIpLogin(r.allowMultiIpLogin === true);
    setOpen(true);
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      const pj = buildPermissionsJson(useCustomPermissions, role, permForm);
      if (edit) {
        const body: Record<string, unknown> = {
          email,
          role,
          disabled: edit.disabled,
        };
        if (password.trim()) body.password = password;
        if (role !== "admin") {
          body.permissionsJson = pj ?? "";
        }
        body.allowedLoginIps = allowedLoginIps.trim();
        body.allowMultiIpLogin = allowMultiIpLogin;
        return apiPutJson(`/api/admin/users/${edit.id}`, body);
      }
      const createBody: Record<string, unknown> = {
        username: username.trim(),
        email: email.trim(),
        password,
        role,
        allowedLoginIps: allowedLoginIps.trim(),
        allowMultiIpLogin,
      };
      if (role !== "admin") {
        createBody.permissionsJson = pj === "" ? undefined : pj;
      }
      return apiPostJson("/api/admin/users", createBody);
    },
    onSuccess: () => {
      toast.success("已保存");
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
      setOpen(false);
      resetForm();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const delMut = useMutation({
    mutationFn: (id: number) => apiDelete(`/api/admin/users/${id}`),
    onSuccess: () => {
      toast.success("已删除");
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const [totpOpen, setTotpOpen] = useState(false);
  const [totpRow, setTotpRow] = useState<Row | null>(null);
  const [totpRes, setTotpRes] = useState<TotpProvisionApiRes | null>(null);
  const [totpPwdOpen, setTotpPwdOpen] = useState(false);
  const [totpPwdTarget, setTotpPwdTarget] = useState<Row | null>(null);
  const [operatorPassword, setOperatorPassword] = useState("");
  const [totpDisableOpen, setTotpDisableOpen] = useState(false);
  const [totpDisableTarget, setTotpDisableTarget] = useState<Row | null>(null);
  const [operatorPasswordDisable, setOperatorPasswordDisable] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);

  const totpProvisionMut = useMutation({
    mutationFn: async (p: { u: Row; currentPassword: string }) => {
      const { u, currentPassword } = p;
      const body =
        u.id > 0 && !u.virtual
          ? { userId: u.id, currentPassword }
          : { username: u.username, currentPassword };
      return apiPostJson<TotpProvisionApiRes>("/api/admin/users/totp/provision", body);
    },
    onSuccess: (data, p) => {
      setTotpPwdOpen(false);
      setTotpPwdTarget(null);
      setOperatorPassword("");
      setTotpRow(p.u);
      setTotpRes(data);
      setTotpOpen(true);
      toast.success("已生成密钥，请使用 Authenticator 扫码后保存");
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const totpDisableMut = useMutation({
    mutationFn: async (p: { u: Row; currentPassword: string }) => {
      const { u, currentPassword } = p;
      const body =
        u.id > 0 && !u.virtual
          ? { userId: u.id, currentPassword }
          : { username: u.username, currentPassword };
      return apiPostJson("/api/admin/users/totp/disable", body);
    },
    onSuccess: () => {
      setTotpDisableOpen(false);
      setTotpDisableTarget(null);
      setOperatorPasswordDisable("");
      toast.success("已关闭两步验证");
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const setModule = (key: keyof Pick<PermForm, "k8s" | "vcenter" | "baota" | "appcenter">, v: ModuleAccess) => {
    setPermForm((f) => {
      const next = { ...f, [key]: v };
      if (key === "appcenter" && v === "none") {
        next.appcenterRedis = "full";
      }
      if (key === "appcenter" && v !== "none" && f.appcenter === "none") {
        next.appcenterRedis = "full";
      }
      if (key === "k8s") {
        if (v === "rw") {
          next.k8sPodExec = true;
          next.k8sPodDelete = true;
        } else {
          next.k8sPodExec = false;
          next.k8sPodDelete = false;
        }
      }
      return next;
    });
  };

  if (authLoading && !status) {
    return (
      <div className="mx-auto max-w-4xl pb-12">
        <p className="text-slate-500">加载中…</p>
      </div>
    );
  }
  if (status?.role === "viewer") {
    return <Navigate to="/cluster" replace />;
  }

  const showPermUi = role !== "admin";

  return (
    <div className="mx-auto max-w-4xl pb-12">
      <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">平台用户</h1>
          <p className="mt-1 text-sm text-slate-500">
            依赖 MySQL 存储；可为非管理员配置各模块可见性与读写；不勾选「自定义」时与旧版 viewer 一致。可配置授权登录 IP（白名单）及是否允许多 IP 同时在线。
          </p>
        </div>
        <Button
          type="button"
          onClick={openCreate}
          className="shrink-0"
          disabled={!usersMgmtOk}
        >
          新建用户
        </Button>
      </div>

      {!usersMgmtOk && mysqlDsnConfigured && (
        <Alert className="mb-6" variant="destructive">
          <AlertTitle>已配置 MySQL，但当前进程无法连接数据库</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              平台已保存 MySQL 连接信息（含环境变量 <code className="text-xs">MYSQL_DSN</code> 或运行时中的主机/库名/用户等），但<strong>连接失败</strong>，因此无法使用「平台用户」功能。请检查：网络是否可达、端口、账号密码、库权限、防火墙及 MySQL 白名单；修改配置后需<strong>保存运行时配置并触发热重载</strong>（或重启 Pod）。
            </p>
            {mysqlConnectErr ? (
              <p className="rounded-md bg-white/10 px-2 py-1.5 font-mono text-xs break-all">
                {mysqlConnectErr}
              </p>
            ) : null}
          </AlertDescription>
        </Alert>
      )}

      {!usersMgmtOk && !mysqlDsnConfigured && (
        <Alert className="mb-6">
          <AlertTitle>未检测到有效的 MySQL 连接串</AlertTitle>
          <AlertDescription>
            请在<strong>账户与平台设置 → 运行时配置</strong>中填写完整的 MySQL 信息：可直接填 <code className="text-xs">mysqlDsn</code>，或同时填写
            <code className="text-xs"> mysqlHost</code>、<code className="text-xs">mysqlPort</code>、<code className="text-xs">mysqlDatabase</code>、
            <code className="text-xs">mysqlUser</code>（及密码）。仅填主机不填库名时无法生成连接。保存后热重载或重启服务。
          </AlertDescription>
        </Alert>
      )}

      {listQ.isLoading && <p className="text-slate-500">加载中…</p>}
      {listQ.error && <p className="text-red-600">{(listQ.error as Error).message}</p>}

      {listQ.data && (
        <>
          <div className="grid gap-3 md:hidden">
            {(listQ.data.users ?? []).length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
                暂无用户，点击「新建用户」添加。
              </div>
            ) : (
              (listQ.data.users ?? []).map((u) => (
                <article
                  key={u.virtual ? `v-${u.username}` : u.id}
                  className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-all font-mono text-sm font-bold text-slate-900">{u.username}</h3>
                      <p className="mt-0.5 break-all text-xs text-slate-500">{u.email || "—"}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                        {u.role}
                      </span>
                      <span className={`text-xs ${u.disabled ? "text-red-600" : "text-emerald-700"}`}>
                        {u.disabled ? "已禁用" : "正常"}
                      </span>
                    </div>
                  </div>

                  <dl className="mt-3 grid min-w-0 gap-2.5 text-xs">
                    <div className="flex min-w-0 items-center justify-between gap-3">
                      <dt className="shrink-0 text-slate-400">OIDC 绑定</dt>
                      <dd className="min-w-0 text-right text-slate-700">
                        {u.virtual ? "—" : u.oidcBound ? "已绑定" : "未绑定"}
                      </dd>
                    </div>
                    <div className="flex min-w-0 items-center justify-between gap-3">
                      <dt className="shrink-0 text-slate-400">两步验证</dt>
                      <dd className="min-w-0 text-right text-slate-700">
                        {u.totpEnabled ? "已开启" : u.totpConfigured ? "未启用" : "未配置"}
                      </dd>
                    </div>
                    <div className="flex min-w-0 items-center justify-between gap-3">
                      <dt className="shrink-0 text-slate-400">登录限制</dt>
                      <dd className="min-w-0 text-right text-slate-700">
                        {(u.allowedLoginIps ?? "").trim() ? "IP 白名单" : "IP 不限"}
                        <span className="text-slate-400"> · </span>
                        {u.allowMultiIpLogin ? "可多 IP 在线" : "单会话"}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                    {!u.virtual && status?.oidcLogin ? (
                      u.oidcBound ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 border-amber-200 text-xs text-amber-950"
                          disabled={!usersMgmtOk}
                          onClick={() => {
                            setOidcUnbindRow(u);
                            setOidcUnbindPwd("");
                          }}
                        >
                          取消绑定
                        </Button>
                      ) : (
                        <a
                          href={`${API_BASE}/api/admin/users/oidc/bind/start?username=${encodeURIComponent(u.username)}`}
                          className="inline-flex h-7 items-center text-xs font-medium text-sky-700 underline"
                        >
                          绑定 OIDC
                        </a>
                      )
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={!usersMgmtOk || totpProvisionMut.isPending}
                      onClick={() => {
                        setTotpPwdTarget(u);
                        setOperatorPassword("");
                        setTotpPwdOpen(true);
                      }}
                    >
                      {u.totpConfigured ? "重新生成二维码" : "生成二维码"}
                    </Button>
                    {u.totpEnabled ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-red-600"
                        disabled={!usersMgmtOk || totpDisableMut.isPending}
                        onClick={() => {
                          setTotpDisableTarget(u);
                          setOperatorPasswordDisable("");
                          setTotpDisableOpen(true);
                        }}
                      >
                        关闭
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7"
                      disabled={!!u.virtual}
                      title={u.virtual ? "内置账号请在运行时配置中管理；可在此配置二次验证" : undefined}
                      onClick={() => openEdit(u)}
                    >
                      编辑
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-red-600"
                      disabled={!!u.virtual}
                      onClick={() => {
                        if (u.virtual) return;
                        setDeleteTarget(u);
                        setDeleteOpen(true);
                      }}
                    >
                      删除
                    </Button>
                  </div>
                </article>
              ))
            )}
          </div>

          <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>用户名</TableHead>
                <TableHead>邮箱</TableHead>
                <TableHead>角色</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>OIDC 已绑定</TableHead>
                <TableHead>两步验证</TableHead>
                <TableHead>登录限制</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(listQ.data.users ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-sm text-slate-500">
                    暂无用户，点击「新建用户」添加。
                  </TableCell>
                </TableRow>
              ) : (
                (listQ.data.users ?? []).map((u) => (
                  <TableRow key={u.virtual ? `v-${u.username}` : u.id}>
                    <TableCell className="font-mono text-sm">{u.username}</TableCell>
                    <TableCell>{u.email || "—"}</TableCell>
                    <TableCell>{u.role}</TableCell>
                    <TableCell>{u.disabled ? "已禁用" : "正常"}</TableCell>
                    <TableCell className="min-w-[8rem] text-sm text-slate-700">
                      {u.virtual ? (
                        <span className="text-slate-400">—</span>
                      ) : u.oidcBound ? (
                        <div className="flex flex-col gap-1">
                          <span className="text-emerald-700">已绑定</span>
                          {status?.oidcLogin ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 border-amber-200 text-xs text-amber-950"
                              disabled={!usersMgmtOk}
                              onClick={() => {
                                setOidcUnbindRow(u);
                                setOidcUnbindPwd("");
                              }}
                            >
                              取消绑定
                            </Button>
                          ) : null}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <span className="text-slate-500">未绑定</span>
                          {status?.oidcLogin ? (
                            <a
                              href={`${API_BASE}/api/admin/users/oidc/bind/start?username=${encodeURIComponent(u.username)}`}
                              className="text-xs font-medium text-sky-700 underline"
                            >
                              绑定 OIDC
                            </a>
                          ) : null}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-slate-700">
                      <div className="flex flex-col gap-1.5">
                        <span>
                          {u.totpEnabled
                            ? "已开启"
                            : u.totpConfigured
                              ? "未启用"
                              : "未配置"}
                        </span>
                        <div className="flex flex-wrap gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            disabled={!usersMgmtOk || totpProvisionMut.isPending}
                            onClick={() => {
                              setTotpPwdTarget(u);
                              setOperatorPassword("");
                              setTotpPwdOpen(true);
                            }}
                          >
                            {u.totpConfigured ? "重新生成二维码" : "生成二维码"}
                          </Button>
                          {u.totpEnabled ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-red-600"
                              disabled={!usersMgmtOk || totpDisableMut.isPending}
                              onClick={() => {
                                setTotpDisableTarget(u);
                                setOperatorPasswordDisable("");
                                setTotpDisableOpen(true);
                              }}
                            >
                              关闭
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[10rem] text-xs text-slate-700">
                      <div className="flex flex-col gap-1">
                        <span>
                          {(u.allowedLoginIps ?? "").trim()
                            ? "IP 白名单"
                            : "IP 不限"}
                        </span>
                        <span className="text-slate-500">
                          {u.allowMultiIpLogin ? "可多 IP 在线" : "单会话（新登录踢旧）"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!!u.virtual}
                        title={u.virtual ? "内置账号请在运行时配置中管理；可在此配置二次验证" : undefined}
                        onClick={() => openEdit(u)}
                      >
                        编辑
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-red-600"
                        disabled={!!u.virtual}
                        onClick={() => {
                          if (u.virtual) return;
                          setDeleteTarget(u);
                          setDeleteOpen(true);
                        }}
                      >
                        删除
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </div>
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton
          className="left-[50%] top-[50%] max-h-[min(90vh,900px)] w-[min(96vw,56rem)] translate-x-[-50%] translate-y-[-50%] gap-0 overflow-hidden p-0 sm:max-w-none"
        >
          <div className="max-h-[min(90vh,900px)] overflow-y-auto">
            <DialogHeader className="border-b border-slate-100 px-6 py-4 text-left">
              <DialogTitle>{edit ? "编辑用户" : "新建用户"}</DialogTitle>
            </DialogHeader>

            <div className="grid gap-6 px-6 py-5 md:grid-cols-2 md:gap-8">
              <div className="min-w-0 space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">账号</p>
                <div className="space-y-2">
                  <Label>用户名</Label>
                  <Input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={!!edit}
                    placeholder="登录名"
                  />
                </div>
                <div className="space-y-2">
                  <Label>邮箱</Label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="可选" />
                </div>
                <div className="space-y-2">
                  <Label>密码{edit ? "（留空则不修改）" : ""}</Label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={edit ? "留空保留原密码" : "至少 8 位"}
                  />
                </div>
                <div className="space-y-2">
                  <Label>角色</Label>
                  <Select
                    value={role === "admin" || role === "viewer" ? role : "viewer"}
                    onValueChange={setRole}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">admin（全量）</SelectItem>
                      <SelectItem value="viewer">viewer（非管理员）</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {edit && (
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5">
                    <span className="text-sm text-slate-700">禁用账号</span>
                    <Switch
                      checked={edit.disabled}
                      onCheckedChange={(v) => setEdit({ ...edit, disabled: v })}
                    />
                  </div>
                )}
                <Separator />
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">登录安全</p>
                <div className="space-y-2">
                  <Label>授权登录 IP（可选）</Label>
                  <Textarea
                    value={allowedLoginIps}
                    onChange={(e) => setAllowedLoginIps(e.target.value)}
                    placeholder={
                      "留空表示不限制。每行或逗号分隔 IPv4/IPv6 或 CIDR，例如：\n203.0.113.0/24\n2001:db8::/32"
                    }
                    rows={4}
                    className="min-h-[88px] font-mono text-xs"
                  />
                  <p className="text-xs text-slate-500">
                    需在反向代理后正确识别客户端 IP（如配置可信代理）。未列入的 IP 将无法登录。
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">允许多 IP 同时登录</p>
                    <p className="text-xs text-slate-500">
                      开启后不同来源 IP 可各保留一个会话；关闭时新登录会使其他 IP 的会话失效。
                    </p>
                  </div>
                  <Switch checked={allowMultiIpLogin} onCheckedChange={setAllowMultiIpLogin} />
                </div>
              </div>

              <div className="min-w-0 space-y-4 md:border-l md:border-slate-100 md:pl-8">
                {showPermUi ? (
                  <>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">模块权限</p>
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900">自定义模块权限</p>
                        <p className="text-xs text-slate-500">关闭时使用与旧版 viewer 相同的默认规则</p>
                      </div>
                      <Switch checked={useCustomPermissions} onCheckedChange={setUseCustomPermissions} />
                    </div>
                    {useCustomPermissions && (
                      <div className="space-y-3 rounded-xl border border-slate-100 bg-white p-3">
                        <ModuleSelectRow
                          label="Kubernetes"
                          value={permForm.k8s}
                          onChange={(v) => setModule("k8s", v)}
                        />
                        <ModuleSelectRow
                          label="vCenter"
                          value={permForm.vcenter}
                          onChange={(v) => setModule("vcenter", v)}
                        />
                        <ModuleSelectRow
                          label="宝塔"
                          value={permForm.baota}
                          onChange={(v) => setModule("baota", v)}
                        />
                        <ModuleSelectRow
                          label="应用中心"
                          value={permForm.appcenter}
                          onChange={(v) => setModule("appcenter", v)}
                        />
                        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                          <Label className="shrink-0 text-sm text-slate-700">应用中心 · Redis</Label>
                          <Select
                            value={permForm.appcenterRedis}
                            onValueChange={(v) => {
                              const rs = v as RedisScope;
                              setPermForm((f) => ({
                                ...f,
                                appcenterRedis: rs,
                                appcenter: rs === "managed_only" ? "rw" : f.appcenter,
                              }));
                            }}
                            disabled={permForm.appcenter === "none"}
                          >
                            <SelectTrigger className="h-9 w-full sm:w-[200px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="full">完整</SelectItem>
                              <SelectItem value="readonly">仅只读（无明细）</SelectItem>
                              <SelectItem value="managed_only">仅纳管自有实例</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {permForm.appcenterRedis === "managed_only" && (
                          <p className="text-xs text-amber-800/90">
                            「仅纳管」需应用中心为读写，保存时将自动设为读写。
                          </p>
                        )}
                        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                          <Label className="shrink-0 text-sm text-slate-700">应用中心 · 云主机</Label>
                          <Select
                            value={permForm.appcenterCloudVm}
                            onValueChange={(v) => {
                              const rs = v as RedisScope;
                              setPermForm((f) => ({
                                ...f,
                                appcenterCloudVm: rs,
                                appcenter: rs === "managed_only" ? "rw" : f.appcenter,
                              }));
                            }}
                            disabled={permForm.appcenter === "none"}
                          >
                            <SelectTrigger className="h-9 w-full sm:w-[200px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="full">完整</SelectItem>
                              <SelectItem value="readonly">仅只读</SelectItem>
                              <SelectItem value="managed_only">仅纳管（写接口默认关闭）</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {permForm.appcenterCloudVm === "managed_only" && (
                          <p className="text-xs text-amber-800/90">
                            云主机「仅纳管」需应用中心为读写；当前后端对写操作统一拦截，后续可按实例创建者细化。
                          </p>
                        )}
                        {permForm.appcenter !== "none" ? (
                          <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                            <div className="min-w-0 pr-2">
                              <Label className="text-sm text-slate-700">云主机 · 查看 Hysteria2 客户端</Label>
                              <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                                开启后：可验证平台密码查看已保存的分享链接/YAML；列表与 OpenClaw 向导可展示集群内 Hysteria 端点概要。未开启则仅知「已安装」、不暴露明文与内网地址。
                              </p>
                            </div>
                            <Switch
                              checked={permForm.appcenterCloudVmHysteriaReveal}
                              onCheckedChange={(v) =>
                                setPermForm((f) => ({ ...f, appcenterCloudVmHysteriaReveal: v }))
                              }
                            />
                          </div>
                        ) : null}
                        <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                          <Label className="text-sm text-slate-700">敏感数据脱敏（列表概要）</Label>
                          <Switch
                            checked={permForm.maskSensitiveData}
                            onCheckedChange={(v) => setPermForm((f) => ({ ...f, maskSensitiveData: v }))}
                          />
                        </div>
                        {permForm.k8s === "rw" && (
                          <div className="space-y-3 border-t border-slate-100 pt-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                              Kubernetes 细粒度
                            </p>
                            <div className="flex items-center justify-between gap-3">
                              <Label className="text-sm text-slate-700">Pod 终端（exec）</Label>
                              <Switch
                                checked={permForm.k8sPodExec}
                                onCheckedChange={(v) =>
                                  setPermForm((f) => ({ ...f, k8sPodExec: v }))
                                }
                              />
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <Label className="text-sm text-slate-700">删除 Pod</Label>
                              <Switch
                                checked={permForm.k8sPodDelete}
                                onCheckedChange={(v) =>
                                  setPermForm((f) => ({ ...f, k8sPodDelete: v }))
                                }
                              />
                            </div>
                          </div>
                        )}
                        <div className="space-y-2 border-t border-slate-100 pt-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            菜单与工作台
                          </p>
                          <p className="text-xs text-slate-500">
                            取消勾选则隐藏对应入口；未列出项仍按模块权限推断。
                          </p>
                          {(Object.keys(MENU_LABELS) as (keyof MenuVisibility)[]).map((k) => (
                            <div key={k} className="flex items-start gap-2">
                              <Checkbox
                                id={`menu-${k}`}
                                className="mt-0.5"
                                checked={permForm.menuVisibility[k]}
                                onCheckedChange={(v) =>
                                  setPermForm((f) => ({
                                    ...f,
                                    menuVisibility: {
                                      ...f.menuVisibility,
                                      [k]: v === true,
                                    },
                                  }))
                                }
                              />
                              <label
                                htmlFor={`menu-${k}`}
                                className="cursor-pointer text-sm leading-snug text-slate-700"
                              >
                                {MENU_LABELS[k]}
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-slate-500">
                    管理员拥有全部模块权限；无需在此配置。
                  </p>
                )}
              </div>
            </div>

            <Separator />

            <DialogFooter className="flex flex-row justify-end gap-2 px-6 py-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button
                type="button"
                disabled={
                  saveMut.isPending ||
                  (!edit && (username.trim().length < 2 || password.length < 8))
                }
                onClick={() => saveMut.mutate()}
              >
                {saveMut.isPending ? "保存中…" : "保存"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={totpOpen}
        onOpenChange={(o) => {
          setTotpOpen(o);
          if (!o) {
            setTotpRow(null);
            setTotpRes(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>两步验证 · {totpRow?.username ?? ""}</DialogTitle>
          </DialogHeader>
          {totpRes?.qrPngBase64 ? (
            <div className="flex justify-center rounded-lg border border-slate-200 bg-white p-4">
              <img
                src={`data:image/png;base64,${totpRes.qrPngBase64}`}
                width={220}
                height={220}
                alt="TOTP 二维码"
              />
            </div>
          ) : (
            <p className="text-sm text-slate-500">未返回二维码，请重试。</p>
          )}
          {totpRes?.secret ? (
            <p className="break-all font-mono text-xs text-slate-600">
              密钥（手动录入）：{totpRes.secret}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" onClick={() => setTotpOpen(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={totpPwdOpen}
        onOpenChange={(o) => {
          setTotpPwdOpen(o);
          if (!o) {
            setTotpPwdTarget(null);
            setOperatorPassword("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>确认操作 · 生成两步验证</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            为「{totpPwdTarget?.username}」{totpPwdTarget?.totpConfigured ? "重新生成" : "生成"}
            二维码。请输入<strong>您当前登录管理员</strong>的密码。
          </p>
          <div className="space-y-2">
            <Label>当前管理员密码</Label>
            <Input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={operatorPassword}
              onChange={(e) => setOperatorPassword(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setTotpPwdOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              disabled={totpProvisionMut.isPending || !totpPwdTarget || !operatorPassword.trim()}
              onClick={() => {
                if (!totpPwdTarget) return;
                totpProvisionMut.mutate({ u: totpPwdTarget, currentPassword: operatorPassword.trim() });
              }}
            >
              {totpProvisionMut.isPending ? "提交中…" : "确认生成"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={totpDisableOpen}
        onOpenChange={(o) => {
          setTotpDisableOpen(o);
          if (!o) {
            setTotpDisableTarget(null);
            setOperatorPasswordDisable("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>关闭两步验证</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            将关闭用户「{totpDisableTarget?.username}」的两步验证。请输入<strong>您当前登录管理员</strong>的密码。
          </p>
          <div className="space-y-2">
            <Label>当前管理员密码</Label>
            <Input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={operatorPasswordDisable}
              onChange={(e) => setOperatorPasswordDisable(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setTotpDisableOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={totpDisableMut.isPending || !totpDisableTarget || !operatorPasswordDisable.trim()}
              onClick={() => {
                if (!totpDisableTarget) return;
                totpDisableMut.mutate({ u: totpDisableTarget, currentPassword: operatorPasswordDisable.trim() });
              }}
            >
              {totpDisableMut.isPending ? "处理中…" : "确认关闭"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={oidcUnbindRow !== null}
        onOpenChange={(o) => {
          if (!o) {
            setOidcUnbindRow(null);
            setOidcUnbindPwd("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>取消 OIDC 绑定</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            将解除用户「{oidcUnbindRow?.username}」与 IdP 的关联。请输入<strong>您当前登录管理员</strong>的密码。
          </p>
          <div className="space-y-2">
            <Label>当前管理员密码</Label>
            <Input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={oidcUnbindPwd}
              onChange={(e) => setOidcUnbindPwd(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setOidcUnbindRow(null)}>
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={oidcUnbindBusy || !oidcUnbindRow || !oidcUnbindPwd.trim()}
              onClick={async () => {
                if (!oidcUnbindRow) return;
                setOidcUnbindBusy(true);
                try {
                  await apiPostJson("/api/admin/users/oidc/unbind", {
                    username: oidcUnbindRow.username,
                    operatorPassword: oidcUnbindPwd,
                  });
                  toast.success("已取消该用户的 OIDC 绑定");
                  setOidcUnbindRow(null);
                  setOidcUnbindPwd("");
                  void qc.invalidateQueries({ queryKey: ["admin-users"] });
                  void refetchAuth();
                } catch (e) {
                  const msg = e instanceof ApiHttpError ? e.serverMessage : (e as Error).message;
                  toast.error(msg);
                } finally {
                  setOidcUnbindBusy(false);
                }
              }}
            >
              {oidcUnbindBusy ? "处理中…" : "确认解绑"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除用户</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除用户「{deleteTarget?.username}」？此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-600/90"
              onClick={() => {
                if (deleteTarget) delMut.mutate(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PlatformUsers;

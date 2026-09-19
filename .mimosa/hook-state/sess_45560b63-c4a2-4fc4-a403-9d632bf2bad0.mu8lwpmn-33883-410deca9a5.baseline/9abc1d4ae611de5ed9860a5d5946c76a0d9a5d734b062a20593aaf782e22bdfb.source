import React, { useCallback, useEffect, useState } from "react";
import { Loader2, Save, UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useAuth } from "@/auth/auth-context";
import { ApiHttpError, apiGetJson, apiPostJson, apiPutJson } from "@/lib/api";

type ProfileDTO = {
  username: string;
  email: string;
  role: string;
  inDatabase: boolean;
  hasPassword: boolean;
  passwordLoginGlobal: boolean;
  oidcEnabled: boolean;
  oidcBound: boolean;
  avatarUrl?: string;
};

const AccountMyProfile: React.FC = () => {
  const { refetch: refetchAuth } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<ProfileDTO | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [oidcUnbindOpen, setOidcUnbindOpen] = useState(false);
  const [oidcUnbindPwd, setOidcUnbindPwd] = useState("");
  const [oidcUnbindBusy, setOidcUnbindBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const p = await apiGetJson<ProfileDTO>("/api/account/profile");
      setProfile(p);
      setEmail(p.email ?? "");
      setAvatarUrl((p.avatarUrl ?? "").trim());
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      const m = e instanceof ApiHttpError ? `${e.status} ${e.message}` : (e as Error).message;
      setErr(m);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onSave = async () => {
    if (!profile?.inDatabase) {
      toast.error("当前账号不在平台用户表中，无法保存");
      return;
    }
    const np = newPassword.trim();
    const cp = confirmPassword.trim();
    if (np !== "" && np !== cp) {
      toast.error("两次输入的新密码不一致");
      return;
    }
    if (np !== "" && np.length < 8) {
      toast.error("新密码至少 8 位");
      return;
    }
    if (np !== "" && profile.hasPassword && currentPassword.trim() === "") {
      toast.error("修改密码请填写当前密码");
      return;
    }

    const payload: Record<string, string | undefined> = {};
    const emailChanged = email.trim() !== (profile.email ?? "").trim();
    if (emailChanged) {
      payload.email = email.trim();
    }
    const avatarTrim = avatarUrl.trim();
    if (avatarTrim !== (profile.avatarUrl ?? "").trim()) {
      payload.avatarUrl = avatarTrim;
    }
    if (np !== "") {
      payload.newPassword = np;
      if (profile.hasPassword) {
        payload.currentPassword = currentPassword;
      }
    }
    if (Object.keys(payload).length === 0) {
      toast.message("没有变更");
      return;
    }

    setSaving(true);
    try {
      await apiPutJson("/api/account/profile", payload);
      toast.success("已保存");
      await load();
      void refetchAuth();
    } catch (e) {
      const msg = e instanceof ApiHttpError ? e.serverMessage : (e as Error).message;
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mb-6 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500 shadow-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        加载我的资料…
      </div>
    );
  }

  if (err) {
    return (
      <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
        无法加载「我的资料」：{err}
        {/503/.test(err) || err.includes("MySQL") ? "（需已连接 MySQL）" : null}
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="mb-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
          <UserCircle size={22} strokeWidth={2} />
        </span>
        <div>
          <h2 className="text-base font-semibold text-slate-900">我的资料</h2>
          <p className="text-xs text-slate-500">
            登录名 <span className="font-mono text-slate-700">{profile.username}</span>
            {profile.role ? (
              <>
                {" "}
                · 角色 <span className="font-mono text-slate-700">{profile.role}</span>
              </>
            ) : null}
          </p>
        </div>
      </div>

      {!profile.inDatabase ? (
        <p className="text-sm text-amber-900">
          当前会话用户还不在 MySQL「平台用户」表中（例如仅环境变量管理员）。请由管理员在「平台用户管理」中创建同名账号后，即可在此修改邮箱与密码。
        </p>
      ) : (
        <>
          {profile.oidcEnabled ? (
            <div className="mb-4 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-3 text-sm text-slate-800">
              <p className="font-semibold text-indigo-950">Authentik / OIDC</p>
              {profile.oidcBound ? (
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-slate-700">
                    已与 IdP 身份绑定，退出后可直接使用登录页的「使用 OIDC 登录」。
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-amber-200 text-amber-950"
                    onClick={() => {
                      setOidcUnbindPwd("");
                      setOidcUnbindOpen(true);
                    }}
                  >
                    取消 OIDC 绑定
                  </Button>
                  {!profile.hasPassword ? (
                    <p className="text-[11px] text-amber-900">解绑前请先在本页设置本地登录密码。</p>
                  ) : null}
                </div>
              ) : (
                <>
                  <p className="mt-1 text-xs text-slate-700">
                    首次使用 OIDC 前，请点击下方按钮在 Authentik 完成授权，将当前账号与 IdP 的 <span className="font-mono">sub</span>{" "}
                    关联。绑定后用户名与邮箱登录仍可用。
                  </p>
                  <Button asChild className="mt-2" variant="secondary" size="sm" type="button">
                    <a href="/api/account/oidc/bind/start">绑定 Authentik</a>
                  </Button>
                </>
              )}
            </div>
          ) : null}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="profile-avatar">头像图片 URL（可选，HTTPS 图片地址）</Label>
              <Input
                id="profile-avatar"
                type="url"
                autoComplete="off"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://example.com/avatar.png"
              />
              <p className="text-[11px] text-slate-500">将用于顶栏头像展示；请使用可公网访问的图片链接。</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-email">邮箱（可选，用于联系与展示；也可作为登录名）</Label>
              <Input
                id="profile-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
              />
            </div>
            <div className="border-t border-slate-100 pt-4">
              <p className="mb-2 text-sm font-medium text-slate-800">修改密码</p>
              {!profile.hasPassword ? (
                <p className="mb-3 text-xs text-slate-600">
                  当前账号尚无本地密码。设置密码后，可使用「用户名或邮箱 + 密码」登录（与 OIDC 绑定可同时使用）。
                </p>
              ) : (
                <div className="mb-3 space-y-2">
                  <Label htmlFor="profile-cur-pw">当前密码</Label>
                  <Input
                    id="profile-cur-pw"
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="profile-new-pw">新密码（至少 8 位，留空则不修改）</Label>
                  <Input
                    id="profile-new-pw"
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-confirm-pw">确认新密码</Label>
                  <Input
                    id="profile-confirm-pw"
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
              </div>
              {!profile.passwordLoginGlobal ? (
                <p className="mt-2 text-xs text-amber-800/90">
                  提示：当前环境未启用密码登录（如未设置 DASHBOARD_PASSWORD 且仅 OIDC）；修改密码后仍可用 OIDC 登录，密码供日后启用本地登录时使用。
                </p>
              ) : null}
            </div>
          </div>
          <div className="mt-5 flex justify-end">
            <Button type="button" disabled={saving} onClick={() => void onSave()}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              保存
            </Button>
          </div>
        </>
      )}

      <AlertDialog open={oidcUnbindOpen} onOpenChange={setOidcUnbindOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>取消 OIDC 绑定</AlertDialogTitle>
            <AlertDialogDescription>
              需验证当前账号本地登录密码。解绑后请使用用户名/邮箱与密码登录，可再次发起绑定。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="oidc-unbind-pw">登录密码</Label>
            <Input
              id="oidc-unbind-pw"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={oidcUnbindPwd}
              onChange={(e) => setOidcUnbindPwd(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={oidcUnbindBusy}>
              关闭
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={oidcUnbindBusy || !oidcUnbindPwd.trim()}
              onClick={async () => {
                setOidcUnbindBusy(true);
                try {
                  await apiPostJson("/api/account/profile/oidc/unbind", {
                    currentPassword: oidcUnbindPwd,
                  });
                  toast.success("已取消 OIDC 绑定");
                  setOidcUnbindOpen(false);
                  await load();
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
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AccountMyProfile;

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export type AuthPermissions = {
  k8s?: string;
  vcenter?: string;
  baota?: string;
  appcenter?: string;
  appcenterRedis?: string;
  appcenterCloudVm?: string;
  appcenterCloudVmHysteriaReveal?: boolean;
  maskSensitiveData?: boolean;
  legacyViewer?: boolean;
  k8sPodExec?: boolean;
  k8sPodDelete?: boolean;
  menu?: Record<string, boolean>;
};

export type AuthStatus = {
  authRequired: boolean;
  loggedIn: boolean;
  username: string;
  /** admin 全量；viewer 只读界面，禁止 Pod/SSH/宝塔敏感数据等 */
  role?: string;
  /** 与 kubebt_dashboard_users.permissions_json 合并后的模块权限（仅登录后） */
  permissions?: AuthPermissions;
  /** 已配置 MySQL 时可管理数据库中的平台用户 */
  usersManagementEnabled?: boolean;
  /** 合并配置（环境变量 + 运行时）中是否已有 MySQL DSN（含分字段拼出的） */
  mysqlDsnConfigured?: boolean;
  /** 进程是否已成功连接 MySQL（与 usersManagementEnabled 一致） */
  mysqlReachable?: boolean;
  /** DSN 已配置但连接失败时，服务端返回的简要错误（便于排查网络/密码） */
  mysqlConnectError?: string;
  /** 登录页预填用户名（与 DASHBOARD_USER 一致） */
  dashboardUsernameHint?: string;
  /** 是否允许 POST /api/auth/login（本地密码） */
  passwordLogin?: boolean;
  /** 是否允许 GET /api/auth/oidc/login（OIDC / Authentik 等） */
  oidcLogin?: boolean;
  /** 当前用户是否已在「我的资料」完成 OIDC（iss+sub）绑定 */
  oidcBound?: boolean;
  /** 平台用户表中的头像 URL（可选） */
  avatarUrl?: string;
  /** 与二进制构建一致；发版后会话失效需重新登录 */
  buildVersion?: string;
};

type AuthContextValue = {
  status: AuthStatus | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchAuthStatus(): Promise<AuthStatus> {
  const res = await fetch(`${API_BASE}/api/auth/status`, {
    credentials: "same-origin",
  });
  if (!res.ok) {
    throw new Error(`${res.status} /api/auth/status`);
  }
  return res.json() as Promise<AuthStatus>;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await fetchAuthStatus();
      setStatus(s);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const logout = useCallback(async () => {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: "POST",
      credentials: "same-origin",
    });
    queryClient.clear();
    await refetch();
  }, [queryClient, refetch]);

  const value = useMemo(
    () => ({ status, loading, error, refetch, logout }),
    [status, loading, error, refetch, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CollapsibleManual } from "@/components/CollapsibleManual";
import { apiGetJson, apiPostJson, apiPutJson, ApiHttpError } from "@/lib/api";
import { useAuth } from "@/auth/auth-context";
import { toast } from "sonner";

type AlertRule = {
  id: string;
  name: string;
  enabled: boolean;
  scope: string;
  promql: string;
  compare: string;
  threshold: number;
  forSeconds: number;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
};

type AlertChannel = {
  id: string;
  type: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassSet: boolean;
  fromAddr: string;
  toAddrs: string;
  useTls: boolean;
  wecomWebhook: string;
  wecomCorpId?: string;
  wecomAgentId?: number;
  wecomCorpSecretSet?: boolean;
  wecomToUser?: string;
};

type AlertSilence = {
  id: string;
  matchers: Record<string, string>;
  until: string;
  comment: string;
};

type AlertsGet = {
  rules: AlertRule[];
  channels: AlertChannel[];
  channelIds: string[];
  silences: AlertSilence[];
  alertmanagerWebhookTokenConfigured?: boolean;
  alertmanagerWebhookUrl?: string;
  alertmanagerForwardToChannels?: boolean;
};

function normalizeAlertsGet(raw: unknown): AlertsGet {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const fwd = o.alertmanagerForwardToChannels;
  return {
    rules: Array.isArray(o.rules) ? (o.rules as AlertRule[]) : [],
    channels: Array.isArray(o.channels) ? (o.channels as AlertChannel[]) : [],
    channelIds: Array.isArray(o.channelIds) ? (o.channelIds as string[]) : [],
    silences: Array.isArray(o.silences) ? (o.silences as AlertSilence[]) : [],
    alertmanagerWebhookTokenConfigured: Boolean(o.alertmanagerWebhookTokenConfigured),
    alertmanagerWebhookUrl:
      typeof o.alertmanagerWebhookUrl === "string" ? o.alertmanagerWebhookUrl : undefined,
    alertmanagerForwardToChannels: typeof fwd === "boolean" ? fwd : false,
  };
}

const emptyRule = (): AlertRule => ({
  id: `r-${Date.now()}`,
  name: "新告警",
  enabled: true,
  scope: "k8s",
  promql: "vector(1)",
  compare: "gt",
  threshold: 0,
  forSeconds: 120,
  labels: { severity: "warning" },
  annotations: { summary: "阈值告警" },
});

const AiInspectAlerts: React.FC = () => {
  const qc = useQueryClient();
  const { status } = useAuth();
  const isAdmin = status?.role === "admin";
  const q = useQuery({
    queryKey: ["ops-alerts"],
    queryFn: ({ signal }) => apiGetJson<AlertsGet>("/api/ops/alerts", { signal }),
    enabled: isAdmin,
  });
  const logQ = useQuery({
    queryKey: ["ops-alerts-log"],
    queryFn: ({ signal }) => apiGetJson<{ entries: { ts: string; rule: string; status: string; message: string }[] }>(
      "/api/ops/alerts/log"
    , { signal }),
    enabled: isAdmin,
  });

  const [draft, setDraft] = useState<AlertsGet | null>(null);
  const [smtpPass, setSmtpPass] = useState<Record<string, string>>({});
  const [wecomAppSecret, setWecomAppSecret] = useState<Record<string, string>>({});

  useEffect(() => {
    if (q.isSuccess) setDraft(normalizeAlertsGet(q.data));
  }, [q.isSuccess, q.data]);

  const regenWebhookMut = useMutation({
    mutationFn: () =>
      apiPostJson<{ webhookUrl?: string; message?: string; error?: string }>(
        "/api/ops/alerts/alertmanager-webhook/regenerate",
        {},
      ),
    onSuccess: (res) => {
      if (res.webhookUrl) {
        toast.success(res.message || "已生成 Webhook URL");
        void navigator.clipboard.writeText(res.webhookUrl).catch(() => {});
      } else {
        toast.success(res.message || "已处理");
      }
      void qc.invalidateQueries({ queryKey: ["ops-alerts"] });
    },
    onError: (e) => toast.error(e instanceof ApiHttpError ? e.serverMessage : String(e)),
  });

  const saveMut = useMutation({
    mutationFn: (body: AlertsGet) =>
      apiPutJson("/api/ops/alerts", {
        rules: body.rules,
        alertmanagerForwardToChannels: body.alertmanagerForwardToChannels,
        channels: body.channels.map((c) => ({
          id: c.id,
          type: c.type,
          smtpHost: c.smtpHost,
          smtpPort: c.smtpPort,
          smtpUser: c.smtpUser,
          smtpPassword: smtpPass[c.id] || undefined,
          fromAddr: c.fromAddr,
          toAddrs: c.toAddrs,
          useTls: c.useTls,
          wecomWebhook: c.wecomWebhook,
          wecomCorpId: c.wecomCorpId,
          wecomAgentId: c.wecomAgentId,
          wecomCorpSecret: wecomAppSecret[c.id] || undefined,
          wecomToUser: c.wecomToUser,
        })),
        channelIds: body.channelIds,
        silences: body.silences,
      }),
    onSuccess: () => {
      toast.success("告警配置已保存");
      void qc.invalidateQueries({ queryKey: ["ops-alerts"] });
      setSmtpPass({});
      setWecomAppSecret({});
    },
    onError: (e) => toast.error(e instanceof ApiHttpError ? e.serverMessage : String(e)),
  });

  const testMut = useMutation({
    mutationFn: (channelId: string) => apiPostJson("/api/ops/alerts/test-channel", { channelId }),
    onSuccess: () => toast.success("测试消息已发送"),
    onError: (e) => toast.error(e instanceof ApiHttpError ? e.serverMessage : String(e)),
  });

  if (!isAdmin) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">
        告警规则与媒介仅管理员可配置。告警评估在服务端每分钟执行一次，基于 Prometheus 即时查询与抑制规则。
      </div>
    );
  }

  if (q.isError) {
    return (
      <p className="text-sm text-red-600" role="alert">
        加载告警配置失败：{(q.error as Error)?.message ?? String(q.error)}
      </p>
    );
  }

  if (q.isLoading || !draft) {
    return <p className="text-sm text-slate-500">加载中…</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">告警中心</h1>
        <p className="mt-1 text-sm text-slate-600">
          基于 Prometheus 即时查询（与监控中心相同数据源）；支持邮箱、企业微信机器人；支持标签抑制与「for」持续时间；通知正文格式参考 Prometheus 告警文本。
        </p>
      </div>

      <section className="rounded-2xl border border-sky-200 bg-gradient-to-b from-sky-50/60 to-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Alertmanager → 平台</h2>
        <p className="mt-1 text-sm text-slate-600">
          将集群内 <strong className="text-slate-800">kube-prometheus-stack</strong> 或外部{" "}
          <strong className="text-slate-800">Prometheus + Alertmanager</strong> 的告警 POST
          到本平台；事件写入下方「最近通知」，并可选择同步推送到已勾选的邮箱/企微通道。
        </p>
        <div className="mt-4 space-y-3 rounded-lg border border-sky-100 bg-white/90 p-4">
          <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              className="mt-1"
              checked={Boolean(draft.alertmanagerForwardToChannels)}
              onChange={(e) =>
                setDraft((d) => (d ? { ...d, alertmanagerForwardToChannels: e.target.checked } : d))
              }
            />
            <span>
              将 Alertmanager 推送<strong>同时转发</strong>到下方「启用此通道」所选的邮箱 / 企微（与平台规则告警共用通道）。
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={regenWebhookMut.isPending}
              onClick={() => regenWebhookMut.mutate()}
            >
              生成或重置 Webhook URL
            </Button>
            {draft.alertmanagerWebhookUrl ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  void navigator.clipboard.writeText(draft.alertmanagerWebhookUrl || "").catch(() => {})
                }
              >
                复制当前 Webhook URL
              </Button>
            ) : null}
          </div>
          {draft.alertmanagerWebhookUrl ? (
            <div className="space-y-1">
              <Label className="text-xs">完整 Webhook（含 token，勿泄露）</Label>
              <Textarea readOnly className="min-h-[72px] font-mono text-[11px]" value={draft.alertmanagerWebhookUrl} />
            </div>
          ) : (
            <p className="text-xs text-amber-800">
              尚未生成 token：请点击「生成或重置」；需已配置平台对外 URL（<code className="rounded bg-amber-50 px-1">PLATFORM_PUBLIC_URL</code> /
              运行时 <code className="rounded bg-amber-50 px-1">platformPublicUrl</code>）以便拼接公网可达地址。
            </p>
          )}
          <p className="text-[11px] text-slate-500">
            修改「转发」勾选后，请滚动至页面底部点击 <strong>保存全部</strong> 才会持久化。
          </p>
        </div>

        <CollapsibleManual
          storageKey="ai-inspect.alerts.alertmanager-kube-prom"
          title="① 容器内 kube-prometheus-stack：图形化安装 + 对接步骤"
          variant="muted"
          className="mt-4 border-slate-200 bg-slate-100/80"
        >
          <ol className="list-decimal space-y-2 pl-4 text-xs text-slate-700">
            <li>
              在{" "}
              <Link to="/cluster/settings" className="font-medium text-blue-700 underline-offset-2 hover:underline">
                集群设置
              </Link>{" "}
              使用「kube-prometheus-stack」卡片，勾选 <strong>安装 Alertmanager</strong> 并执行一键安装（与 Prometheus Operator 同栈）。
            </li>
            <li>
              在本页点击 <strong>生成或重置 Webhook URL</strong>，复制完整地址（已含 <code className="rounded bg-white px-1">token</code>）。
            </li>
            <li>
              为 Alertmanager 增加 <code className="rounded bg-white px-1">webhook_configs</code>：在集群中编辑 Alertmanager 配置（如通过
              Secret <code className="rounded bg-white px-1">alertmanager-*</code>、Helm values 的{" "}
              <code className="rounded bg-white px-1">alertmanager.config</code>，或 Prometheus Operator 的{" "}
              <code className="rounded bg-white px-1">AlertmanagerConfig</code> CR），在{" "}
              <code className="rounded bg-white px-1">receivers</code> 下增加一项：
              <pre className="mt-2 max-h-48 overflow-auto rounded border border-slate-200 bg-white p-2 text-[10px] leading-relaxed">
{`- name: kube-bt-sync-platform
  webhook_configs:
    - url: '<粘贴本页 Webhook 完整 URL>'
      send_resolved: true`}
              </pre>
              并在 <code className="rounded bg-white px-1">route</code> 中让需要上云的告警指向该 receiver（或与现有 receiver 组合）。
            </li>
            <li>
              重载 Alertmanager 后，在 Prometheus UI → <strong>Alerts</strong> 触发一条测试告警，或等待规则自然 firing；本页「最近通知」应出现来源为
              Alertmanager 的记录。
            </li>
          </ol>
        </CollapsibleManual>

        <CollapsibleManual
          storageKey="ai-inspect.alerts.alertmanager-external"
          title="② 外部 Prometheus：对接步骤（自建/托管）"
          variant="muted"
          className="mt-3 border-slate-200 bg-slate-100/80"
        >
          <ol className="list-decimal space-y-2 pl-4 text-xs text-slate-700">
            <li>确保 Prometheus 已将告警发往你的 Alertmanager（<code className="rounded bg-white px-1">alerting.alertmanagers</code>）。</li>
            <li>Alertmanager 能访问平台公网 URL（防火墙 / Ingress 放行 POST）。</li>
            <li>在本页生成 Webhook URL，写入 Alertmanager 的 <code className="rounded bg-white px-1">receivers[].webhook_configs[].url</code>。</li>
            <li>
              使用 <code className="rounded bg-white px-1">amtool config routes test</code> 或真实 firing 验证；平台返回 HTTP 200 即表示已鉴权并入队记录。
            </li>
          </ol>
        </CollapsibleManual>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">告警规则</h2>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setDraft((d) => (d ? { ...d, rules: [...d.rules, emptyRule()] } : d))}
          >
            添加规则
          </Button>
        </div>
        <div className="mt-4 space-y-6">
          {draft.rules.map((r, idx) => (
            <div key={r.id} className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>名称</Label>
                  <Input
                    value={r.name}
                    onChange={(e) => {
                      const rules = [...draft.rules];
                      rules[idx] = { ...r, name: e.target.value };
                      setDraft({ ...draft, rules });
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label>数据源 scope</Label>
                  <Input
                    value={r.scope}
                    onChange={(e) => {
                      const rules = [...draft.rules];
                      rules[idx] = { ...r, scope: e.target.value };
                      setDraft({ ...draft, rules });
                    }}
                    placeholder="k8s | vcenter | cloud"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>PromQL（即时向量/标量）</Label>
                  <Textarea
                    rows={2}
                    className="font-mono text-xs"
                    value={r.promql}
                    onChange={(e) => {
                      const rules = [...draft.rules];
                      rules[idx] = { ...r, promql: e.target.value };
                      setDraft({ ...draft, rules });
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label>比较</Label>
                  <Input
                    value={r.compare}
                    onChange={(e) => {
                      const rules = [...draft.rules];
                      rules[idx] = { ...r, compare: e.target.value };
                      setDraft({ ...draft, rules });
                    }}
                    placeholder="gt gte lt lte eq neq"
                  />
                </div>
                <div className="space-y-1">
                  <Label>阈值</Label>
                  <Input
                    type="number"
                    value={r.threshold}
                    onChange={(e) => {
                      const rules = [...draft.rules];
                      rules[idx] = { ...r, threshold: parseFloat(e.target.value) || 0 };
                      setDraft({ ...draft, rules });
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label>持续时间 for（秒）</Label>
                  <Input
                    type="number"
                    value={r.forSeconds}
                    onChange={(e) => {
                      const rules = [...draft.rules];
                      rules[idx] = { ...r, forSeconds: parseInt(e.target.value, 10) || 60 };
                      setDraft({ ...draft, rules });
                    }}
                  />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={r.enabled}
                    onChange={(e) => {
                      const rules = [...draft.rules];
                      rules[idx] = { ...r, enabled: e.target.checked };
                      setDraft({ ...draft, rules });
                    }}
                  />
                  启用
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-red-600"
                  onClick={() => {
                    setDraft((d) =>
                      d ? { ...d, rules: d.rules.filter((x) => x.id !== r.id) } : d
                    );
                  }}
                >
                  删除
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">通知通道</h2>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                const id = `c-${Date.now()}`;
                setDraft((d) =>
                  d
                    ? {
                        ...d,
                        channels: [
                          ...d.channels,
                          {
                            id,
                            type: "email",
                            smtpHost: "",
                            smtpPort: 587,
                            smtpUser: "",
                            smtpPassSet: false,
                            fromAddr: "",
                            toAddrs: "",
                            useTls: true,
                            wecomWebhook: "",
                          },
                        ],
                        channelIds: [...d.channelIds, id],
                      }
                    : d
                );
              }}
            >
              添加邮箱通道
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                const id = `c-${Date.now()}`;
                setDraft((d) =>
                  d
                    ? {
                        ...d,
                        channels: [
                          ...d.channels,
                          {
                            id,
                            type: "wecom_app",
                            smtpHost: "",
                            smtpPort: 587,
                            smtpUser: "",
                            smtpPassSet: false,
                            fromAddr: "",
                            toAddrs: "",
                            useTls: true,
                            wecomWebhook: "",
                            wecomCorpId: "",
                            wecomAgentId: 0,
                            wecomCorpSecretSet: false,
                            wecomToUser: "@all",
                          },
                        ],
                        channelIds: [...d.channelIds, id],
                      }
                    : d
                );
              }}
            >
              添加企微应用
            </Button>
          </div>
        </div>
        <div className="mt-4 space-y-6">
          {draft.channels.map((c, idx) => (
            <div key={c.id} className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Label className="text-slate-700">类型</Label>
                <select
                  className="rounded border border-slate-200 bg-white px-2 py-1 text-sm"
                  value={c.type}
                  onChange={(e) => {
                    const channels = [...draft.channels];
                    channels[idx] = { ...c, type: e.target.value };
                    setDraft({ ...draft, channels });
                  }}
                >
                  <option value="email">email</option>
                  <option value="wecom">wecom（群机器人 Webhook）</option>
                  <option value="wecom_app">wecom_app（企业自建应用 API）</option>
                </select>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.channelIds.includes(c.id)}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setDraft((d) => {
                        if (!d) return d;
                        const ids = new Set(d.channelIds);
                        if (on) ids.add(c.id);
                        else ids.delete(c.id);
                        return { ...d, channelIds: [...ids] };
                      });
                    }}
                  />
                  启用此通道
                </label>
                <Button type="button" size="sm" variant="outline" onClick={() => testMut.mutate(c.id)}>
                  发送测试
                </Button>
              </div>
              {c.type === "wecom_app" ? (
                <div className="mt-3 space-y-3">
                  <CollapsibleManual
                    storageKey={`ai-inspect.alerts.wecom-app.${c.id}`}
                    title="企业微信自建应用对接说明"
                    variant="muted"
                    className="border-slate-200 bg-slate-100/80"
                  >
                    <p className="text-xs text-slate-700">
                      在
                      <a
                        className="text-blue-700 underline"
                        href="https://developer.work.weixin.qq.com/document/path/90665"
                        target="_blank"
                        rel="noreferrer"
                      >
                        企业微信管理后台
                      </a>
                      创建「自建应用」，取得企业 ID、应用 AgentId、应用 Secret。本平台通过 gettoken + message/send
                      发文本消息（与群机器人 Webhook 不同）。收件人可填 <code className="rounded bg-white px-1">@all</code>{" "}
                      或成员 userid，多个用 <code className="rounded bg-white px-1">|</code> 分隔。
                    </p>
                  </CollapsibleManual>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label>企业 ID（corpId）</Label>
                      <Input
                        value={c.wecomCorpId ?? ""}
                        onChange={(e) => {
                          const channels = [...draft.channels];
                          channels[idx] = { ...c, wecomCorpId: e.target.value };
                          setDraft({ ...draft, channels });
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>应用 AgentId（整数）</Label>
                      <Input
                        type="number"
                        value={c.wecomAgentId ?? 0}
                        onChange={(e) => {
                          const channels = [...draft.channels];
                          channels[idx] = { ...c, wecomAgentId: parseInt(e.target.value, 10) || 0 };
                          setDraft({ ...draft, channels });
                        }}
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label>应用 Secret {c.wecomCorpSecretSet ? "（已保存，留空保留）" : ""}</Label>
                      <Input
                        type="password"
                        value={wecomAppSecret[c.id] || ""}
                        onChange={(e) => setWecomAppSecret((m) => ({ ...m, [c.id]: e.target.value }))}
                        autoComplete="off"
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label>接收人（touser）</Label>
                      <Input
                        value={c.wecomToUser ?? "@all"}
                        onChange={(e) => {
                          const channels = [...draft.channels];
                          channels[idx] = { ...c, wecomToUser: e.target.value };
                          setDraft({ ...draft, channels });
                        }}
                        placeholder="@all 或 userid，多个用 |"
                      />
                    </div>
                  </div>
                </div>
              ) : c.type === "email" ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>SMTP 主机</Label>
                    <Input
                      value={c.smtpHost}
                      onChange={(e) => {
                        const channels = [...draft.channels];
                        channels[idx] = { ...c, smtpHost: e.target.value };
                        setDraft({ ...draft, channels });
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>端口</Label>
                    <Input
                      type="number"
                      value={c.smtpPort}
                      onChange={(e) => {
                        const channels = [...draft.channels];
                        channels[idx] = { ...c, smtpPort: parseInt(e.target.value, 10) || 25 };
                        setDraft({ ...draft, channels });
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>用户名</Label>
                    <Input
                      value={c.smtpUser}
                      onChange={(e) => {
                        const channels = [...draft.channels];
                        channels[idx] = { ...c, smtpUser: e.target.value };
                        setDraft({ ...draft, channels });
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>密码 {c.smtpPassSet ? "（已设置）" : ""}</Label>
                    <Input
                      type="password"
                      value={smtpPass[c.id] || ""}
                      onChange={(e) => setSmtpPass((m) => ({ ...m, [c.id]: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>发件人</Label>
                    <Input
                      value={c.fromAddr}
                      onChange={(e) => {
                        const channels = [...draft.channels];
                        channels[idx] = { ...c, fromAddr: e.target.value };
                        setDraft({ ...draft, channels });
                      }}
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label>收件人（逗号分隔）</Label>
                    <Input
                      value={c.toAddrs}
                      onChange={(e) => {
                        const channels = [...draft.channels];
                        channels[idx] = { ...c, toAddrs: e.target.value };
                        setDraft({ ...draft, channels });
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-slate-600">
                    在企微群中添加「群机器人」，复制 Webhook 地址。适合简单推送；若需应用级权限与可见范围，请用「企微应用」通道。
                  </p>
                  <div className="space-y-1">
                    <Label>Webhook URL</Label>
                    <Input
                      value={c.wecomWebhook}
                      onChange={(e) => {
                        const channels = [...draft.channels];
                        channels[idx] = { ...c, wecomWebhook: e.target.value };
                        setDraft({ ...draft, channels });
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">抑制（标签全匹配）</h2>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() =>
              setDraft((d) =>
                d
                  ? {
                      ...d,
                      silences: [
                        ...d.silences,
                        {
                          id: `s-${Date.now()}`,
                          matchers: { alertname: "" },
                          until: new Date(Date.now() + 3600_000).toISOString(),
                          comment: "",
                        },
                      ],
                    }
                  : d
              )
            }
          >
            添加抑制
          </Button>
        </div>
        <div className="mt-4 space-y-4">
          {draft.silences.map((s, idx) => (
            <div key={s.id} className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>alertname 等标签（JSON 对象）</Label>
                  <Textarea
                    rows={2}
                    className="font-mono text-xs"
                    value={JSON.stringify(s.matchers, null, 2)}
                    onChange={(e) => {
                      try {
                        const matchers = JSON.parse(e.target.value) as Record<string, string>;
                        const silences = [...draft.silences];
                        silences[idx] = { ...s, matchers };
                        setDraft({ ...draft, silences });
                      } catch {
                        /* ignore */
                      }
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label>静默至（RFC3339）</Label>
                  <Input
                    value={s.until}
                    onChange={(e) => {
                      const silences = [...draft.silences];
                      silences[idx] = { ...s, until: e.target.value };
                      setDraft({ ...draft, silences });
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <Button type="button" onClick={() => draft && saveMut.mutate(draft)} disabled={saveMut.isPending}>
        保存全部
      </Button>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">最近通知</h2>
        <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto font-mono text-[11px] text-slate-700">
          {(logQ.data?.entries ?? []).map((e, i) => {
            const ent = e as { ts: string; status: string; rule: string; message: string; source?: string };
            return (
              <li key={`${ent.ts}-${i}`} className="rounded border border-slate-100 bg-slate-50 px-2 py-1">
                <span className="text-slate-500">{ent.ts}</span> [{ent.status}]{" "}
                {ent.source === "alertmanager" ? (
                  <span className="rounded bg-sky-100 px-1 text-sky-900">AM</span>
                ) : null}{" "}
                {ent.rule}
                <pre className="mt-1 whitespace-pre-wrap text-slate-600">{ent.message}</pre>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
};

export default AiInspectAlerts;

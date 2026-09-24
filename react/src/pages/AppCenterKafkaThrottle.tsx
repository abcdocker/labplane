import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, Loader2, RefreshCw, SlidersHorizontal } from "lucide-react";
import { ApiHttpError, apiGetJson, apiPutJson } from "@/lib/api";
import {
  parseKafkaThrottleRate,
  sleep,
  topicThrottleMatchesExpected,
  userQuotaMatchesExpected,
  type KafkaQuotaRow,
  type KafkaTopicThrottlePayload,
} from "@/lib/kafka-throttle-verify";
import { useAuth } from "@/auth/auth-context";
import { cloudVmAppCenterCanWrite } from "@/lib/platform-permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Badge } from "@/components/ui/badge";

type InstanceRow = { id: number; name: string; config: Record<string, unknown> };

type RolloutRes = {
  clusterReady?: boolean;
  message?: string;
};

function cfgStr(c: Record<string, unknown>, k: string): string {
  const v = c[k];
  return typeof v === "string" ? v : "";
}

const VERIFY_ATTEMPTS = 6;
const VERIFY_DELAY_MS = 450;

async function getTopicThrottle(instanceId: number, topic: string) {
  return apiGetJson<{ throttle: KafkaTopicThrottlePayload }>(
    `/api/app-center/kafka/instances/${instanceId}/topics/${encodeURIComponent(topic)}/throttle`
  );
}

async function getQuotas(instanceId: number) {
  return apiGetJson<{ quotas: KafkaQuotaRow[] }>(`/api/app-center/kafka/instances/${instanceId}/quotas`);
}

async function verifyTopicThrottleAfterPut(
  instanceId: number,
  topic: string,
  want: KafkaTopicThrottlePayload
): Promise<void> {
  let last: KafkaTopicThrottlePayload | null = null;
  for (let i = 0; i < VERIFY_ATTEMPTS; i++) {
    const data = await getTopicThrottle(instanceId, topic);
    last = data.throttle;
    if (topicThrottleMatchesExpected(want, data.throttle)) {
      return;
    }
    await sleep(VERIFY_DELAY_MS);
  }
  const a = last
    ? `leader=${last.leaderReplicationThrottledRate} follower=${last.followerReplicationThrottledRate}`
    : "（未能读回）";
  throw new Error(`读回校验未通过：期望 leader=${want.leaderReplicationThrottledRate} follower=${want.followerReplicationThrottledRate}，实际 ${a}。请稍后重试或检查 Broker 状态。`);
}

async function verifyQuotaAfterPut(
  instanceId: number,
  user: string,
  wantProd: number,
  wantCons: number
): Promise<void> {
  let lastRows: KafkaQuotaRow[] = [];
  for (let i = 0; i < VERIFY_ATTEMPTS; i++) {
    const data = await getQuotas(instanceId);
    lastRows = data.quotas ?? [];
    if (userQuotaMatchesExpected(user, wantProd, wantCons, lastRows)) {
      return;
    }
    await sleep(VERIFY_DELAY_MS);
  }
  const row = lastRows.find((r) => r.user === user.trim());
  const got = row
    ? `producer=${row.producerByteRate} consumer=${row.consumerByteRate}`
    : "无该用户记录";
  throw new Error(`读回校验未通过：期望 user=${user.trim()} producer=${wantProd} consumer=${wantCons}，实际 ${got}。请稍后重试。`);
}

export default function AppCenterKafkaThrottle() {
  const { id } = useParams();
  const parsedId = Number.parseInt(id ?? "0", 10);
  const instanceId = Number.isFinite(parsedId) && parsedId > 0 ? parsedId : 0;
  const invalidInstanceId = instanceId <= 0;
  const qc = useQueryClient();
  const { status: auth } = useAuth();
  const canWrite = cloudVmAppCenterCanWrite(auth?.role, auth?.permissions);

  const statusQ = useQuery({
    queryKey: ["app-center-kafka-status"],
    queryFn: ({ signal }) => apiGetJson<{ mysqlReachable?: boolean }>("/api/app-center/kafka/status", { signal }),
  });

  const [throttleTopicPick, setThrottleTopicPick] = useState("");
  const [throttleLeaderIn, setThrottleLeaderIn] = useState("-1");
  const [throttleFollowerIn, setThrottleFollowerIn] = useState("-1");
  const [quotaUserInput, setQuotaUserInput] = useState("");
  const [quotaProdIn, setQuotaProdIn] = useState("-1");
  const [quotaConsIn, setQuotaConsIn] = useState("-1");

  const [topicVerifyOk, setTopicVerifyOk] = useState<string | null>(null);
  const [quotaVerifyOk, setQuotaVerifyOk] = useState<string | null>(null);

  const instQ = useQuery({
    queryKey: ["app-center-kafka-instances"],
    queryFn: ({ signal }) => apiGetJson<{ instances: InstanceRow[] }>("/api/app-center/kafka/instances", { signal }),
    enabled: !invalidInstanceId && statusQ.data?.mysqlReachable === true,
  });

  const rolloutQ = useQuery({
    queryKey: ["kafka-rollout", instanceId],
    queryFn: ({ signal }) => apiGetJson<RolloutRes>(`/api/app-center/kafka/instances/${instanceId}/rollout`, { signal }),
    enabled: !invalidInstanceId,
    refetchInterval: 12_000,
  });

  const clusterReady = rolloutQ.data?.clusterReady === true;

  const topicsQ = useQuery({
    queryKey: ["kafka-topics", instanceId],
    queryFn: ({ signal }) => apiGetJson<{ topics: Array<{ topic: string }> }>(`/api/app-center/kafka/instances/${instanceId}/topics`, { signal }),
    enabled: instanceId > 0 && clusterReady,
  });

  const quotasQ = useQuery({
    queryKey: ["kafka-quotas", instanceId],
    queryFn: ({ signal }) => apiGetJson<{ quotas: KafkaQuotaRow[] }>(`/api/app-center/kafka/instances/${instanceId}/quotas`, { signal }),
    enabled: instanceId > 0 && clusterReady,
  });

  const topicThrottleQ = useQuery({
    queryKey: ["kafka-topic-throttle", instanceId, throttleTopicPick],
    queryFn: ({ signal }) => getTopicThrottle(instanceId, throttleTopicPick.trim()),
    enabled: instanceId > 0 && clusterReady && throttleTopicPick.trim() !== "",
  });

  const instances = instQ.data?.instances ?? [];
  const selectedInst = useMemo(() => instances.find((i) => i.id === instanceId), [instances, instanceId]);

  useEffect(() => {
    const th = topicThrottleQ.data?.throttle;
    if (!th) return;
    setThrottleLeaderIn(String(th.leaderReplicationThrottledRate));
    setThrottleFollowerIn(String(th.followerReplicationThrottledRate));
  }, [topicThrottleQ.data]);

  const topicThrottleMut = useMutation({
    mutationFn: async () => {
      const topic = throttleTopicPick.trim();
      const l = parseKafkaThrottleRate(throttleLeaderIn);
      const f = parseKafkaThrottleRate(throttleFollowerIn);
      const want: KafkaTopicThrottlePayload = {
        leaderReplicationThrottledRate: l,
        followerReplicationThrottledRate: f,
      };
      await apiPutJson(`/api/app-center/kafka/instances/${instanceId}/topics/${encodeURIComponent(topic)}/throttle`, want);
      await verifyTopicThrottleAfterPut(instanceId, topic, want);
      return want;
    },
    onSuccess: () => {
      setTopicVerifyOk(new Date().toISOString());
      toast.success("Topic 复制限速已生效（已通过读回校验）");
      void qc.invalidateQueries({ queryKey: ["kafka-topic-throttle", instanceId, throttleTopicPick] });
    },
    onError: (e: unknown) => {
      setTopicVerifyOk(null);
      toast.error(e instanceof ApiHttpError ? e.message : e instanceof Error ? e.message : String(e));
    },
  });

  const quotaMut = useMutation({
    mutationFn: async () => {
      const u = quotaUserInput.trim();
      const pr = parseKafkaThrottleRate(quotaProdIn);
      const cr = parseKafkaThrottleRate(quotaConsIn);
      await apiPutJson(`/api/app-center/kafka/instances/${instanceId}/quotas`, {
        user: u,
        producerByteRate: pr,
        consumerByteRate: cr,
      });
      await verifyQuotaAfterPut(instanceId, u, pr, cr);
      return { user: u, pr, cr };
    },
    onSuccess: () => {
      setQuotaVerifyOk(new Date().toISOString());
      toast.success("用户配额已生效（已通过读回校验）");
      void qc.invalidateQueries({ queryKey: ["kafka-quotas", instanceId] });
    },
    onError: (e: unknown) => {
      setQuotaVerifyOk(null);
      toast.error(e instanceof ApiHttpError ? e.message : e instanceof Error ? e.message : String(e));
    },
  });

  const verifyTopicReadonly = useMutation({
    mutationFn: async () => {
      const topic = throttleTopicPick.trim();
      const data = await getTopicThrottle(instanceId, topic);
      return data.throttle;
    },
    onSuccess: (th) => {
      toast.success(
        `当前集群中 Topic「${throttleTopicPick.trim()}」限速：leader=${th.leaderReplicationThrottledRate} follower=${th.followerReplicationThrottledRate} bytes/s`
      );
    },
    onError: (e: unknown) => toast.error(e instanceof ApiHttpError ? e.message : String(e)),
  });

  const verifyQuotaReadonly = useMutation({
    mutationFn: async () => {
      const data = await getQuotas(instanceId);
      return data.quotas ?? [];
    },
    onSuccess: (rows) => {
      toast.success(`已拉取 ${rows.length} 条用户配额记录，列表已刷新`);
      void qc.invalidateQueries({ queryKey: ["kafka-quotas", instanceId] });
    },
    onError: (e: unknown) => toast.error(e instanceof ApiHttpError ? e.message : String(e)),
  });

  if (invalidInstanceId) {
    return <Navigate to="/cluster/apps/kafka" replace />;
  }

  return (
    <div className="mx-auto w-full max-w-[min(100%,96rem)] space-y-5 pb-2 sm:pb-12">
      {statusQ.data?.mysqlReachable === false ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-950">
          需要平台 MySQL。请配置 <code className="rounded bg-white px-1">MYSQL_DSN</code>。
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/cluster/apps/kafka">返回实例列表</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/cluster/apps/kafka/instance/${instanceId}`}>返回管理配置</Link>
          </Button>
          <SlidersHorizontal className="h-5 w-5 text-slate-500" aria-hidden />
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            限速 · {selectedInst?.name ?? `Kafka #${instanceId}`}
          </h1>
          <Badge variant="outline" className="font-mono text-xs">
            {cfgStr(selectedInst?.config ?? {}, "namespace")}/{cfgStr(selectedInst?.config ?? {}, "baseName")}
          </Badge>
        </div>
      </div>

      <Card className="border-slate-200/80 bg-slate-50/50 shadow-sm">
        <CardContent className="py-4 text-sm text-slate-700">
          <p>
            修改限速后，平台会先调用 Kafka 更新配置，再<strong className="font-medium text-slate-900">多次读回校验</strong>
            ，只有与期望值一致时才提示成功。您也可使用下方「验证当前集群中的值」手动核对。
          </p>
        </CardContent>
      </Card>

      {!clusterReady && rolloutQ.data != null ? (
        <Card className="border-amber-200/80 bg-amber-50/40 shadow-sm">
          <CardContent className="py-6 text-center text-sm text-amber-950">
            实例尚未就绪，限速接口暂不可用。请待集群 Ready 后刷新本页。
            {rolloutQ.data?.message ? `（${rolloutQ.data.message}）` : ""}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Topic 复制限速</CardTitle>
            <CardDescription>
              Leader / Follower 副本复制流量（bytes/s）。-1 或留空表示解除该项限速。保存后会读回校验再提示成功。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Topic</Label>
              <Select
                value={throttleTopicPick.trim() === "" ? "__none__" : throttleTopicPick}
                onValueChange={(v) => setThrottleTopicPick(v === "__none__" ? "" : v)}
                disabled={!clusterReady}
              >
                <SelectTrigger className="font-mono text-sm">
                  <SelectValue placeholder="选择主题" />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value="__none__">请选择…</SelectItem>
                  {(topicsQ.data?.topics ?? []).map((t) => (
                    <SelectItem key={t.topic} value={t.topic}>
                      {t.topic}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {throttleTopicPick.trim() ? (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Leader 复制限速（bytes/s）</Label>
                    <Input
                      className="font-mono text-sm"
                      value={throttleLeaderIn}
                      onChange={(e) => setThrottleLeaderIn(e.target.value)}
                      placeholder="-1"
                      disabled={!clusterReady}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Follower 复制限速（bytes/s）</Label>
                    <Input
                      className="font-mono text-sm"
                      value={throttleFollowerIn}
                      onChange={(e) => setThrottleFollowerIn(e.target.value)}
                      placeholder="-1"
                      disabled={!clusterReady}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={!canWrite || !clusterReady || topicThrottleMut.isPending}
                    onClick={() => {
                      setTopicVerifyOk(null);
                      topicThrottleMut.mutate();
                    }}
                  >
                    {topicThrottleMut.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                    应用并校验生效
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!clusterReady}
                    onClick={() => void qc.invalidateQueries({ queryKey: ["kafka-topic-throttle", instanceId, throttleTopicPick] })}
                  >
                    <RefreshCw className="mr-1 h-4 w-4" />
                    重新加载表单
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={!clusterReady || verifyTopicReadonly.isPending}
                    onClick={() => verifyTopicReadonly.mutate()}
                  >
                    {verifyTopicReadonly.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                    验证当前集群中的值
                  </Button>
                </div>
                {topicVerifyOk ? (
                  <p className="flex items-center gap-1 text-xs text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    最近一次保存已通过读回校验
                  </p>
                ) : null}
                {topicThrottleQ.isLoading ? (
                  <p className="text-xs text-slate-500">加载当前配置…</p>
                ) : topicThrottleQ.isError ? (
                  <p className="text-xs text-red-600">{(topicThrottleQ.error as Error)?.message}</p>
                ) : null}
              </>
            ) : (
              <p className="text-xs text-slate-500">请先选择 Topic。</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">用户（USER）客户端配额</CardTitle>
            <CardDescription>
              生产/消费字节速率（bytes/s）。与 SCRAM 用户名对应；-1 或留空表示删除该项。保存后会读回校验再提示成功。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">用户名</Label>
              <Input
                className="font-mono text-sm"
                placeholder="例如 admin 或业务账号"
                value={quotaUserInput}
                onChange={(e) => setQuotaUserInput(e.target.value)}
                disabled={!clusterReady}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">生产者限速（bytes/s）</Label>
                <Input
                  className="font-mono text-sm"
                  value={quotaProdIn}
                  onChange={(e) => setQuotaProdIn(e.target.value)}
                  placeholder="-1"
                  disabled={!clusterReady}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">消费者限速（bytes/s）</Label>
                <Input
                  className="font-mono text-sm"
                  value={quotaConsIn}
                  onChange={(e) => setQuotaConsIn(e.target.value)}
                  placeholder="-1"
                  disabled={!clusterReady}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={!canWrite || !clusterReady || quotaMut.isPending || !quotaUserInput.trim()}
                onClick={() => {
                  setQuotaVerifyOk(null);
                  quotaMut.mutate();
                }}
              >
                {quotaMut.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                应用并校验生效
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!clusterReady || verifyQuotaReadonly.isPending}
                onClick={() => verifyQuotaReadonly.mutate()}
              >
                {verifyQuotaReadonly.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                验证并刷新列表
              </Button>
            </div>
            {quotaVerifyOk ? (
              <p className="flex items-center gap-1 text-xs text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                最近一次保存已通过读回校验
              </p>
            ) : null}
            <div className="overflow-auto rounded-lg border border-slate-100">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>用户</TableHead>
                    <TableHead className="tabular-nums">生产 bytes/s</TableHead>
                    <TableHead className="tabular-nums">消费 bytes/s</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(quotasQ.data?.quotas ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-xs text-slate-500">
                        暂无配额记录或尚未加载
                      </TableCell>
                    </TableRow>
                  ) : (
                    (quotasQ.data?.quotas ?? []).map((q) => (
                      <TableRow key={q.user}>
                        <TableCell className="font-mono text-xs">{q.user}</TableCell>
                        <TableCell className="tabular-nums text-xs">{q.producerByteRate}</TableCell>
                        <TableCell className="tabular-nums text-xs">{q.consumerByteRate}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setQuotaUserInput(q.user);
                              setQuotaProdIn(String(q.producerByteRate));
                              setQuotaConsIn(String(q.consumerByteRate));
                            }}
                          >
                            填入表单
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!clusterReady}
              onClick={() => void qc.invalidateQueries({ queryKey: ["kafka-quotas", instanceId] })}
            >
              <RefreshCw className="mr-1 h-4 w-4" />
              刷新配额列表
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

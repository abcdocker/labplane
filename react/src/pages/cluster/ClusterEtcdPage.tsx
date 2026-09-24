import React, { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/auth/auth-context";
import { apiGetJson, apiPostJson } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { extractErrorMessage } from "@/lib/extract-error-message";
import { ClusterEtcdMonitorCharts } from "./ClusterEtcdMonitorCharts";

type EtcdSummary = {
  queriedAt?: string;
  prometheusConfigured?: boolean;
  error?: string;
  etcdUp?: number | null;
  walFsyncP99Seconds?: number | null;
  walFsyncP99Ms?: number | null;
  walFsyncAlert?: boolean;
  leaderChanges15m?: number | null;
  leaderChanges1h?: number | null;
  leaderChangeAlert?: boolean;
  mvccDbSizeBytes?: number | null;
  processRSSBytes?: number | null;
  proposalsPending?: number | null;
  dbSizeByInstance?: Array<{ metric?: Record<string, string>; value?: number }>;
  leaderChangesThreshold?: number;
  walP99AlertThresholdMs?: number;
};

function fmtBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n < 0) return "—";
  const g = n / 1024 ** 3;
  if (g >= 1) return `${g.toFixed(2)} GiB`;
  const m = n / 1024 ** 2;
  return `${m.toFixed(0)} MiB`;
}

function fmtScalar(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

const DEFAULT_ENDPOINTS =
  "https://192.168.21.10:2379,https://192.168.21.11:2379,https://192.168.21.12:2379";

function shellSnippet(endpoints: string): string {
  const ep = endpoints.trim() || DEFAULT_ENDPOINTS;
  return `export ETCDCTL_API=3
ETCD_ENDPOINTS="${ep}"
CA=/etc/kubernetes/pki/etcd/ca.crt
CERT=/etc/kubernetes/pki/etcd/healthcheck-client.crt
KEY=/etc/kubernetes/pki/etcd/healthcheck-client.key

etcdctl endpoint status -w table \\
  --endpoints="$ETCD_ENDPOINTS" --cacert="$CA" --cert="$CERT" --key="$KEY"

etcdctl defrag \\
  --endpoints="$ETCD_ENDPOINTS" --cacert="$CA" --cert="$CERT" --key="$KEY"
`;
}

const ClusterEtcdPage: React.FC = () => {
  const auth = useAuth();
  const isAdmin = auth.status?.role === "admin";
  const qc = useQueryClient();
  const [namespace, setNamespace] = useState("kube-system");
  const [endpoints, setEndpoints] = useState(DEFAULT_ENDPOINTS);
  const [certHostPath, setCertHostPath] = useState("/etc/kubernetes/pki/etcd");
  const [nodeName, setNodeName] = useState("");
  const [etcdImage, setEtcdImage] = useState("registry.k8s.io/etcd:3.5.16-0");
  const [feedback, setFeedback] = useState<string | null>(null);

  const summaryQ = useQuery({
    queryKey: ["k8s", "etcd", "summary"],
    queryFn: ({ signal }) => apiGetJson<EtcdSummary>("/api/k8s/etcd/summary", { signal }),
    refetchInterval: 60_000,
  });

  const summary = summaryQ.data;

  const defragMut = useMutation({
    mutationFn: () =>
      apiPostJson<{ jobName?: string; namespace?: string; message?: string; error?: string }>(
        "/api/k8s/etcd/defrag-job",
        {
          namespace: namespace.trim() || "kube-system",
          etcdEndpoints: endpoints.trim(),
          certHostPath: certHostPath.trim() || "/etc/kubernetes/pki/etcd",
          image: etcdImage.trim() || "registry.k8s.io/etcd:3.5.16-0",
          nodeName: nodeName.trim(),
        }
      ),
    onSuccess: (data) => {
      setFeedback(data.message || `已创建 Job ${data.jobName}`);
      qc.invalidateQueries({ queryKey: ["k8s", "etcd", "summary"] });
    },
    onError: (e) => setFeedback(extractErrorMessage(e)),
  });

  const yamlMut = useMutation({
    mutationFn: () =>
      apiPostJson<{ yaml?: string; jobName?: string; error?: string }>("/api/k8s/etcd/defrag-job-yaml", {
        namespace: namespace.trim() || "kube-system",
        etcdEndpoints: endpoints.trim(),
        certHostPath: certHostPath.trim() || "/etc/kubernetes/pki/etcd",
        image: etcdImage.trim() || "registry.k8s.io/etcd:3.5.16-0",
        nodeName: nodeName.trim(),
      }),
    onSuccess: (data) => {
      if (data.error) {
        setFeedback(data.error);
        return;
      }
      if (data.yaml) {
        void navigator.clipboard.writeText(data.yaml).catch(() => {});
        setFeedback(`已复制 Job YAML（${data.jobName}）到剪贴板，也可手动保存为 manifest 后 kubectl apply -f。`);
      }
    },
    onError: (e) => setFeedback(extractErrorMessage(e)),
  });

  const copyShell = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shellSnippet(endpoints));
      setFeedback("已复制本机 etcdctl 参考命令到剪贴板（需在控制面节点或已挂载证书的环境执行）。");
    } catch {
      setFeedback("复制失败，请手动全选复制。");
    }
  }, [endpoints]);

  const shellText = useMemo(() => shellSnippet(endpoints), [endpoints]);

  const alertWal = Boolean(summary?.walFsyncAlert);
  const alertLeader = Boolean(summary?.leaderChangeAlert);

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-2 sm:pb-12">
      <div>
        <h1 className="mb-2 text-2xl font-bold text-slate-900 dark:text-slate-100">etcd 管理</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          基于 Prometheus 抓取的控制面 <code className="rounded bg-slate-100 px-1 text-xs dark:bg-slate-800">etcd</code>{" "}
          指标查看资源与延迟；碎片整理通过 Job 在控制面节点挂载 kubeadm 证书路径执行（与{" "}
          <code className="rounded bg-slate-100 px-1 text-xs dark:bg-slate-800">etcdctl</code> 等价）。请先确保{" "}
          <Link to="/cluster/settings" className="font-medium text-blue-600 underline-offset-2 hover:underline">
            集群 Prometheus 地址
          </Link>{" "}
          可查询且已抓取 etcd（kube-prometheus-stack 中 <code className="text-xs">kubeEtcd.enabled</code>）。
        </p>
      </div>

      {summaryQ.isError ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          加载失败：{extractErrorMessage(summaryQ.error)}
        </p>
      ) : null}
      {summary?.error ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{summary.error}</p>
      ) : null}

      <ClusterEtcdMonitorCharts
        promReady={Boolean(summary?.prometheusConfigured && !summary?.error)}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className={cn(alertWal && "border-amber-300 ring-1 ring-amber-200")}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">WAL 落盘 P99</CardTitle>
            <CardDescription>
              <code className="text-xs">etcd_disk_wal_fsync_duration_seconds</code>；建议 P99 &lt;{" "}
              {summary?.walP99AlertThresholdMs ?? 10} ms
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {fmtScalar(summary?.walFsyncP99Ms, 1)} ms
            </p>
            {alertWal ? (
              <p className="mt-2 text-xs font-medium text-amber-800">
                已超过 {summary?.walP99AlertThresholdMs ?? 10}ms 建议阈值，请排查磁盘 IO / 负载。
              </p>
            ) : (
              <p className="mt-2 text-xs text-slate-500">窗口：rate 5m + histogram_quantile 0.99</p>
            )}
          </CardContent>
        </Card>

        <Card className={cn(alertLeader && "border-amber-300 ring-1 ring-amber-200")}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Leader 切换</CardTitle>
            <CardDescription>
              <code className="text-xs">etcd_server_leader_changes_seen_total</code>；15 分钟内 &gt;{" "}
              {summary?.leaderChangesThreshold ?? 1} 次视为异常
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {fmtScalar(summary?.leaderChanges15m, 2)} / 15m
            </p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              近 1h：{fmtScalar(summary?.leaderChanges1h, 2)}
            </p>
            {alertLeader ? (
              <p className="mt-2 text-xs font-medium text-amber-800">短时间内发生多次选主，请检查网络与时钟。</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">抓取目标</CardTitle>
            <CardDescription>Prometheus 中 etcd job 的 up 状态</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {fmtScalar(summary?.etcdUp, 2)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">MVCC 库大小（max）</CardTitle>
            <CardDescription>成员间取最大，便于观察膨胀</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {fmtBytes(summary?.mvccDbSizeBytes ?? null)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">进程 RSS 合计</CardTitle>
            <CardDescription>
              <code className="text-xs">process_resident_memory_bytes</code>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {fmtBytes(summary?.processRSSBytes ?? null)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">待处理提案</CardTitle>
            <CardDescription>
              <code className="text-xs">etcd_server_proposals_pending</code>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {fmtScalar(summary?.proposalsPending, 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {(summary?.dbSizeByInstance?.length ?? 0) > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">各实例 MVCC 占用</CardTitle>
            <CardDescription>来自即时向量查询，标签因抓取配置而异</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>标签摘要</TableHead>
                  <TableHead className="text-right">字节</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary!.dbSizeByInstance!.map((row, i) => {
                  const bits = Object.entries(row.metric || {})
                    .filter(([k]) => k !== "__name__")
                    .map(([k, v]) => `${k}=${v}`)
                    .join(", ");
                  return (
                    <TableRow key={i}>
                      <TableCell className="max-w-md truncate font-mono text-xs" title={bits}>
                        {bits || "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmtBytes(row.value)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">本机 etcdctl 参考</CardTitle>
          <CardDescription>
            在已挂载 <code className="text-xs">/etc/kubernetes/pki/etcd</code> 的控制面主机上执行；endpoints
            请改为你的集群地址。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea readOnly className="min-h-[200px] font-mono text-xs" value={shellText} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => void copyShell()}>
              复制命令
            </Button>
          </div>
        </CardContent>
      </Card>

      {isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">集群内 defrag Job</CardTitle>
            <CardDescription>
              使用 <code className="text-xs">hostPath</code> 挂载控制面节点上的证书目录；Pod 调度到{" "}
              <code className="text-xs">control-plane</code> 并开启 <code className="text-xs">hostNetwork</code>。
              多节点 etcd 时请填写<strong>全部成员</strong> endpoints，与你在节点上执行 etcdctl 时一致。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="etcd-ns">命名空间</Label>
                <Input id="etcd-ns" value={namespace} onChange={(e) => setNamespace(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="etcd-node">固定节点名（可选）</Label>
                <Input
                  id="etcd-node"
                  placeholder="例如 control-plane-01"
                  value={nodeName}
                  onChange={(e) => setNodeName(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="etcd-ep">--endpoints</Label>
              <Input id="etcd-ep" value={endpoints} onChange={(e) => setEndpoints(e.target.value)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="etcd-cert">证书 hostPath</Label>
                <Input id="etcd-cert" value={certHostPath} onChange={(e) => setCertHostPath(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="etcd-img">镜像</Label>
                <Input id="etcd-img" value={etcdImage} onChange={(e) => setEtcdImage(e.target.value)} />
              </div>
            </div>
            {feedback ? <p className="text-sm text-slate-700 dark:text-slate-300">{feedback}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={yamlMut.isPending || !endpoints.trim()}
                variant="secondary"
                onClick={() => {
                  setFeedback(null);
                  yamlMut.mutate();
                }}
              >
                生成并复制 Job YAML
              </Button>
              <Button
                type="button"
                disabled={defragMut.isPending || !endpoints.trim()}
                onClick={() => {
                  setFeedback(null);
                  defragMut.mutate();
                }}
              >
                在集群中创建 defrag Job
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
          仅管理员可在集群内创建 defrag Job 或导出 YAML；当前账号可查看 Prometheus 汇总与复制本机命令参考。
        </p>
      )}

      <p className="text-xs text-slate-500 dark:text-slate-400">
        查询时间：{summary?.queriedAt ?? (summaryQ.isFetching ? "加载中…" : "—")}
      </p>
    </div>
  );
};

export default ClusterEtcdPage;

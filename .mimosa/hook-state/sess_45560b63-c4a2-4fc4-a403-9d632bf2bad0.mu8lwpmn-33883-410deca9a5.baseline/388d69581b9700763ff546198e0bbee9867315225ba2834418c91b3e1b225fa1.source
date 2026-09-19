import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ChevronDown, Copy, Gauge, Loader2, Plus, RefreshCw, Trash2, Layers, Server } from "lucide-react";
import { ApiHttpError, apiDeleteJson, apiGetJson, apiPostJson, apiPutJson } from "@/lib/api";
import type { ApiHttpErrorCheck } from "@/lib/api";
import { useAuth } from "@/auth/auth-context";
import { cloudVmAppCenterCanWrite } from "@/lib/platform-permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

/** MiB/s（二进制 M）→ Kafka quota 字节/秒 */
function mibPerSecToQuotaBytes(s: string): number {
  const t = s.trim();
  if (t === "") return -1;
  const n = Number.parseFloat(t);
  if (!Number.isFinite(n) || n < 0) return -1;
  return Math.round(n * 1024 * 1024);
}

function quotaBytesToMibPerSec(n: number): string {
  if (n == null || !Number.isFinite(n) || n < 0) return "—";
  return (n / (1024 * 1024)).toFixed(2);
}

const ACL_RESOURCE_LABEL: Record<number, string> = {
  0: "Unknown",
  1: "Any",
  2: "Topic",
  3: "Group",
  4: "Cluster",
  5: "TransactionalId",
  6: "DelegationToken",
  7: "User",
};
const ACL_PATTERN_LABEL: Record<number, string> = {
  0: "Unknown",
  1: "Any",
  2: "Match",
  3: "Literal",
  4: "Prefixed",
};
const ACL_OPERATION_LABEL: Record<number, string> = {
  0: "Unknown",
  1: "Any",
  2: "All",
  3: "Read",
  4: "Write",
  5: "Create",
  6: "Delete",
  7: "Alter",
  8: "Describe",
  9: "ClusterAction",
  10: "DescribeConfigs",
  11: "AlterConfigs",
  12: "IdempotentWrite",
  13: "CreateTokens",
  14: "DescribeTokens",
};
const ACL_PERM_LABEL: Record<number, string> = {
  0: "Unknown",
  1: "Any",
  2: "Deny",
  3: "Allow",
};

type KafkaTplCfg = {
  zookeeperImage: string;
  kafkaImage: string;
  busyboxImage?: string;
  imagePullSecret?: string;
  zkReplicas?: number;
  kafkaReplicas?: number;
  zkStorageSize?: string;
  kafkaStorageSize?: string;
  extraKafkaCfgLines?: string[];
  defaultSaslUsername?: string;
  defaultSaslPassword?: string;
};

type KafkaTplRow = { id: number; name: string; description?: string; config: KafkaTplCfg };

type InstanceRow = { id: number; name: string; config: Record<string, unknown> };

type RolloutRes = {
  clusterReady?: boolean;
  namespace?: string;
  baseName?: string;
  zkDesired?: number;
  zkReady?: number;
  kafkaDesired?: number;
  kafkaReady?: number;
  message?: string;
  prometheusConfigured?: boolean;
  cpuUsageCores?: number;
  memUsageBytes?: number;
  cpuQuery?: string;
  memQuery?: string;
  saslMechanism?: string;
};

type ExposureRes = {
  externalExposure?: string;
  externalAdvertiseHost?: string;
  externalNodePorts?: number[];
  kafkaReplicas?: number;
  services?: Array<{ ordinal?: number; name?: string; found?: boolean; nodePort?: number; targetPort?: number }>;
  externalBootstrap?: string;
  externalListenerPort?: number;
  /** 对外连接：每行 broker + 广播 IP + NodePort */
  accessEndpoints?: Array<{ broker?: number; host?: string; nodePort?: number }>;
};

type KafkaPerfProducerMetrics = {
  recordsSent?: number;
  recordsPerSec?: number;
  mbPerSec?: number;
  avgLatencyMs?: number;
  maxLatencyMs?: number;
  p50Ms?: number;
  p95Ms?: number;
  p99Ms?: number;
  p999Ms?: number;
};

type KafkaPerfConsumerMetrics = {
  dataConsumedMB?: number;
  mbPerSec?: number;
  messagesCount?: number;
  msgPerSec?: number;
  fetchMBPerSec?: number;
};

type KafkaPerfReport = {
  jobName?: string;
  namespace?: string;
  status?: string;
  topic?: string;
  recordCount?: number;
  recordSize?: number;
  testMode?: string;
  throttleEnabled?: boolean;
  producerLimit?: number;
  consumerLimit?: number;
  clientUsername?: string;
  throttleUser?: string;
  producer?: KafkaPerfProducerMetrics;
  consumer?: KafkaPerfConsumerMetrics;
  rawLog?: string;
  errorMessage?: string;
  /** 有日志但未解析出指标时的说明 */
  parseNote?: string;
  /** 运行中：指标来自当前日志的提示 */
  progressHint?: string;
  startedAt?: string;
  completedAt?: string;
};

type KafkaPerfJobRow = {
  jobName: string;
  status?: string;
  createdAt?: string;
  topic?: string;
  testMode?: string;
  throttleEnabled?: boolean;
  recordCount?: number;
  recordSize?: number;
};

function emptyCfg(): KafkaTplCfg {
  return {
    zookeeperImage: "docker.io/zookeeper:3.9.3",
    kafkaImage: "docker.io/bitnamilegacy/kafka:3.7.1",
    busyboxImage: "docker.io/library/busybox:1.36.1",
    zkReplicas: 3,
    kafkaReplicas: 3,
    zkStorageSize: "20Gi",
    kafkaStorageSize: "100Gi",
    defaultSaslUsername: "admin",
    defaultSaslPassword: "",
    extraKafkaCfgLines: [],
  };
}

function cfgStr(c: Record<string, unknown>, k: string): string {
  const v = c[k];
  return typeof v === "string" ? v : "";
}

function cfgNum(c: Record<string, unknown>, k: string, def: number): number {
  const v = c[k];
  if (typeof v === "number" && Number.isFinite(v)) return Math.floor(v);
  if (typeof v === "string") {
    const n = Number.parseInt(v, 10);
    if (Number.isFinite(n)) return n;
  }
  return def;
}

function formatMem(bytes?: number): string {
  if (bytes == null || !Number.isFinite(bytes)) return "—";
  if (bytes >= 1 << 30) return `${(bytes / (1 << 30)).toFixed(2)} GiB`;
  if (bytes >= 1 << 20) return `${(bytes / (1 << 20)).toFixed(1)} MiB`;
  return `${Math.round(bytes)} B`;
}

const SASL_MECH_OPTIONS = [
  { value: "SCRAM-SHA-512", label: "SCRAM-SHA-512（推荐）" },
  { value: "SCRAM-SHA-256", label: "SCRAM-SHA-256" },
  { value: "PLAIN", label: "PLAIN（不推荐）" },
] as const;

type AppCenterKafkaInnerProps = {
  /** 来自路由 `/kafka/instance/:id` 时传入，此时只渲染该实例的管理区 */
  routeInstanceId?: number | null;
};

const AppCenterKafkaInner: React.FC<AppCenterKafkaInnerProps> = ({ routeInstanceId }) => {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { status: auth } = useAuth();
  const canWrite = cloudVmAppCenterCanWrite(auth?.role, auth?.permissions);
  const instanceId = routeInstanceId && routeInstanceId > 0 ? routeInstanceId : 0;
  const isInstanceDetailPage = instanceId > 0 && routeInstanceId != null && routeInstanceId > 0;

  const statusQ = useQuery({
    queryKey: ["app-center-kafka-status"],
    queryFn: ({ signal }) => apiGetJson<{ mysqlReachable?: boolean }>("/api/app-center/kafka/status", { signal }),
  });

  const nsQ = useQuery({
    queryKey: ["kafka-deploy-namespaces"],
    queryFn: ({ signal }) => apiGetJson<string[]>("/api/namespaces", { signal }),
  });

  const tplQ = useQuery({
    queryKey: ["app-center-kafka-templates"],
    queryFn: ({ signal }) => apiGetJson<{ templates: KafkaTplRow[]; mysqlRequired?: boolean }>("/api/app-center/kafka/templates", { signal }),
    enabled: statusQ.data?.mysqlReachable === true,
  });

  const instQ = useQuery({
    queryKey: ["app-center-kafka-instances"],
    queryFn: ({ signal }) => apiGetJson<{ instances: InstanceRow[] }>("/api/app-center/kafka/instances", { signal }),
    enabled: statusQ.data?.mysqlReachable === true,
  });

  const [mainTab, setMainTab] = useState<"instances" | "deploy" | "templates">("instances");
  const [manageSubTab, setManageSubTab] = useState<
    "cluster" | "exposure" | "topics" | "perf" | "consumers" | "acl" | "scram"
  >("topics");

  const [ns, setNs] = useState("default");
  const [base, setBase] = useState("kafka-demo");
  const [tplId, setTplId] = useState<number>(0);
  const [sc, setSc] = useState("");
  const [saslUser, setSaslUser] = useState("admin");
  const [saslPass, setSaslPass] = useState("");
  const [saslMech, setSaslMech] = useState<string>("SCRAM-SHA-512");
  const [extraLines, setExtraLines] = useState("");

  const [dlg, setDlg] = useState(false);
  const [editing, setEditing] = useState<KafkaTplRow | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formCfg, setFormCfg] = useState<KafkaTplCfg>(emptyCfg);
  const [extraTplLines, setExtraTplLines] = useState("");

  const [newTopic, setNewTopic] = useState("");
  const [newParts, setNewParts] = useState("3");
  const [newRf, setNewRf] = useState("3");

  /** ACL 向导：图形化 Topic 权限 + 可选用户配额（MiB/s） */
  const [aclWUser, setAclWUser] = useState("");
  const [aclWTopic, setAclWTopic] = useState("");
  const [aclWPattern, setAclWPattern] = useState<"Literal" | "Prefixed">("Literal");
  const [aclWRole, setAclWRole] = useState<"producer" | "consumer" | "both" | "custom">("consumer");
  const [aclWHost, setAclWHost] = useState("*");
  const [aclWSyncQuota, setAclWSyncQuota] = useState(false);
  /** 观测/期望峰值 MiB/s，用于一键推荐配额 */
  const [aclWPeakMiB, setAclWPeakMiB] = useState("");
  const [aclWProdMiB, setAclWProdMiB] = useState("");
  const [aclWConsMiB, setAclWConsMiB] = useState("");
  const [aclWCustomOp, setAclWCustomOp] = useState("Read");
  const [aclWAdvancedOpen, setAclWAdvancedOpen] = useState(false);

  const [scramUser, setScramUser] = useState("");
  const [scramPass, setScramPass] = useState("");

  const [perfTopic, setPerfTopic] = useState("");
  const [perfTestMode, setPerfTestMode] = useState<"both" | "producer" | "consumer">("both");
  const [perfRecords, setPerfRecords] = useState("500000");
  const [perfRecordSize, setPerfRecordSize] = useState("1024");
  const [perfEnableThrottle, setPerfEnableThrottle] = useState(false);
  const [perfProducerLimit, setPerfProducerLimit] = useState("1048576");
  const [perfConsumerLimit, setPerfConsumerLimit] = useState("1048576");
  const [perfQuotaUser, setPerfQuotaUser] = useState("");
  const [perfClientUser, setPerfClientUser] = useState("");
  const [perfClientPass, setPerfClientPass] = useState("");
  const [perfJobName, setPerfJobName] = useState("");
  const [perfValidationChecks, setPerfValidationChecks] = useState<ApiHttpErrorCheck[]>([]);

  const [deleteDlgOpen, setDeleteDlgOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<InstanceRow | null>(null);
  const [selectedTopic, setSelectedTopic] = useState("");
  const [topicPart, setTopicPart] = useState("0");
  const [msgBrowseLimit, setMsgBrowseLimit] = useState("50");
  const [msgBrowseOffset, setMsgBrowseOffset] = useState("");
  const [produceKey, setProduceKey] = useState("");
  const [produceVal, setProduceVal] = useState("");
  const [producePart, setProducePart] = useState("");
  const [topicCfgPatch, setTopicCfgPatch] = useState('{\n  "retention.ms": "604800000"\n}');
  const [selectedGroupLag, setSelectedGroupLag] = useState("");
  const [expMode, setExpMode] = useState<"internal" | "nodeport">("internal");
  const [expHost, setExpHost] = useState("");
  const [expPorts, setExpPorts] = useState<string[]>(["", "", ""]);
  const [kafkaExposureAdvanced, setKafkaExposureAdvanced] = useState(false);

  const rolloutQ = useQuery({
    queryKey: ["kafka-rollout", instanceId],
    queryFn: ({ signal }) => apiGetJson<RolloutRes>(`/api/app-center/kafka/instances/${instanceId}/rollout`, { signal }),
    enabled: instanceId > 0,
    refetchInterval: (q) => {
      const d = q.state.data;
      if (!d) return 4000;
      return d.clusterReady ? 25_000 : 5000;
    },
  });

  const clusterReady = rolloutQ.data?.clusterReady === true;

  const exposureQ = useQuery({
    queryKey: ["kafka-exposure", instanceId],
    queryFn: ({ signal }) => apiGetJson<ExposureRes>(`/api/app-center/kafka/instances/${instanceId}/exposure`, { signal }),
    enabled: instanceId > 0 && clusterReady,
  });

  const exposureMut = useMutation({
    mutationFn: (p: { mode: string; advertiseHost: string; nodePorts: number[] }) =>
      apiPutJson<{
        ok?: boolean;
        message?: string;
        externalAdvertiseHost?: string;
        externalNodePorts?: number[];
      }>(`/api/app-center/kafka/instances/${instanceId}/exposure`, {
        mode: p.mode,
        advertiseHost: p.advertiseHost,
        nodePorts: p.nodePorts,
      }),
    onSuccess: (data) => {
      const ports = data?.externalNodePorts?.filter((n) => Number.isFinite(n));
      const host = (data?.externalAdvertiseHost ?? "").trim();
      if (ports?.length && host) {
        toast.success(`已应用对外访问（Kafka 将滚动重启）。${host} → ${ports.join(", ")}`);
      } else if (ports?.length) {
        toast.success(`已应用对外访问（Kafka 将滚动重启）。NodePort: ${ports.join(", ")}`);
      } else {
        toast.success("已应用对外访问配置（Kafka 将滚动重启）");
      }
      void qc.invalidateQueries({ queryKey: ["kafka-exposure", instanceId] });
      void qc.invalidateQueries({ queryKey: ["kafka-rollout", instanceId] });
      void qc.invalidateQueries({ queryKey: ["kafka-cluster", instanceId] });
    },
    onError: (e: unknown) => toast.error(e instanceof ApiHttpError ? e.message : String(e)),
  });

  const topicsQ = useQuery({
    queryKey: ["kafka-topics", instanceId],
    queryFn: ({ signal }) =>
      apiGetJson<{ topics: Array<{ topic: string; partitions: { partition?: number }[] }> }>(
        `/api/app-center/kafka/instances/${instanceId}/topics`
      , { signal }),
    enabled: instanceId > 0 && clusterReady,
  });

  const groupsQ = useQuery({
    queryKey: ["kafka-groups", instanceId],
    queryFn: ({ signal }) =>
      apiGetJson<{
        groups: Array<{
          groupId: string;
          state?: string;
          protocolType?: string;
          memberCount?: number;
          membersSample?: { clientId?: string; clientHost?: string }[];
        }>;
      }>(`/api/app-center/kafka/instances/${instanceId}/consumer-groups`, { signal }),
    enabled: instanceId > 0 && clusterReady,
  });

  const aclsQ = useQuery({
    queryKey: ["kafka-acls", instanceId],
    queryFn: ({ signal }) => apiGetJson<{ acls: Array<Record<string, unknown>> }>(`/api/app-center/kafka/instances/${instanceId}/acls`, { signal }),
    enabled: instanceId > 0 && clusterReady,
  });

  const quotasQ = useQuery({
    queryKey: ["kafka-quotas", instanceId],
    queryFn: ({ signal }) =>
      apiGetJson<{ quotas: Array<{ user: string; producerByteRate: number; consumerByteRate: number }> }>(
        `/api/app-center/kafka/instances/${instanceId}/quotas`
      , { signal }),
    enabled: instanceId > 0 && clusterReady,
  });

  const clusterQ = useQuery({
    queryKey: ["kafka-cluster", instanceId],
    queryFn: ({ signal }) =>
      apiGetJson<{ brokers?: Array<{ nodeId?: number; host?: string; port?: number; rack?: string }>; clusterId?: string; controllerId?: number }>(
        `/api/app-center/kafka/instances/${instanceId}/cluster`
      , { signal }),
    enabled: instanceId > 0 && clusterReady,
  });

  const topicCfgQ = useQuery({
    queryKey: ["kafka-topic-cfg", instanceId, selectedTopic],
    queryFn: ({ signal }) =>
      apiGetJson<{ configs: Array<{ name?: string; value?: string; isSensitive?: boolean }> }>(
        `/api/app-center/kafka/instances/${instanceId}/topics/${encodeURIComponent(selectedTopic)}/configs`
      , { signal }),
    enabled: instanceId > 0 && clusterReady && selectedTopic.trim() !== "",
  });

  const groupLagQ = useQuery({
    queryKey: ["kafka-group-lag", instanceId, selectedGroupLag],
    queryFn: ({ signal }) =>
      apiGetJson<{
        group?: string;
        state?: string;
        protocol?: string;
        partitions?: Array<{
          topic?: string;
          partition?: number;
          lag?: number;
          committed?: number;
          logEnd?: number;
        }>;
      }>(`/api/app-center/kafka/instances/${instanceId}/consumer-group-lag?group=${encodeURIComponent(selectedGroupLag)}`, { signal }),
    enabled: instanceId > 0 && clusterReady && selectedGroupLag.trim() !== "",
  });

  const perfListQ = useQuery({
    queryKey: ["kafka-perf-jobs", instanceId],
    queryFn: ({ signal }) =>
      apiGetJson<{ jobs: KafkaPerfJobRow[] }>(`/api/app-center/kafka/instances/${instanceId}/perf-tests`, { signal }),
    enabled: instanceId > 0 && clusterReady,
    refetchInterval: 10_000,
  });

  const perfReportQ = useQuery({
    queryKey: ["kafka-perf-report", instanceId, perfJobName],
    queryFn: ({ signal }) =>
      apiGetJson<KafkaPerfReport>(
        `/api/app-center/kafka/instances/${instanceId}/perf-test/${encodeURIComponent(perfJobName)}`
      , { signal }),
    enabled: instanceId > 0 && clusterReady && perfJobName.trim() !== "",
    refetchInterval: (q) => {
      const st = q.state.data?.status;
      return st === "pending" || st === "running" ? 3000 : false;
    },
  });

  const buildKafkaPerfBody = (): Record<string, unknown> | null => {
    const topic = perfTopic.trim();
    if (!topic) return null;
    const body: Record<string, unknown> = {
      topic,
      recordCount: Number.parseInt(perfRecords, 10) || 500000,
      recordSize: Number.parseInt(perfRecordSize, 10) || 1024,
      testMode: perfTestMode,
      enableThrottle: perfEnableThrottle,
    };
    if (perfEnableThrottle) {
      body.producerLimit = Number.parseInt(perfProducerLimit, 10) || 0;
      body.consumerLimit = Number.parseInt(perfConsumerLimit, 10) || 0;
      const qu = perfQuotaUser.trim();
      if (qu) body.throttleUser = qu;
    }
    const cu = perfClientUser.trim();
    if (cu) {
      body.clientUsername = cu;
      body.clientPassword = perfClientPass;
    }
    return body;
  };

  const perfValidateMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPostJson<{ ok?: boolean; checks?: ApiHttpErrorCheck[] }>(
        `/api/app-center/kafka/instances/${instanceId}/perf-test/validate`,
        body
      ),
    onSuccess: (r) => {
      const list = Array.isArray(r.checks) ? r.checks : [];
      setPerfValidationChecks(list);
      if (r.ok === true) toast.success("校验通过，可以启动压测");
      else toast.error("校验未通过，请查看下方明细");
    },
    onError: (e: unknown) => toast.error(e instanceof ApiHttpError ? e.message : String(e)),
  });

  const perfStartMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPostJson<{ jobName?: string; namespace?: string }>(
        `/api/app-center/kafka/instances/${instanceId}/perf-test`,
        body
      ),
    onSuccess: (r) => {
      const jn = typeof r.jobName === "string" ? r.jobName : "";
      if (jn) {
        setPerfJobName(jn);
        void qc.invalidateQueries({ queryKey: ["kafka-perf-report", instanceId, jn] });
      }
      void qc.invalidateQueries({ queryKey: ["kafka-perf-jobs", instanceId] });
      setPerfValidationChecks([]);
      toast.success("压测 Job 已创建，正在集群内执行…");
    },
    onError: (e: unknown) => {
      if (e instanceof ApiHttpError && Array.isArray(e.checks) && e.checks.length > 0) {
        setPerfValidationChecks(e.checks);
      }
      toast.error(e instanceof ApiHttpError ? e.serverMessage : String(e));
    },
  });

  const perfDeleteMut = useMutation({
    mutationFn: (name: string) =>
      apiDeleteJson(`/api/app-center/kafka/instances/${instanceId}/perf-test/${encodeURIComponent(name)}`),
    onSuccess: () => {
      toast.success("已请求删除压测 Job");
      setPerfJobName("");
      void qc.invalidateQueries({ queryKey: ["kafka-perf-report", instanceId] });
      void qc.invalidateQueries({ queryKey: ["kafka-perf-jobs", instanceId] });
    },
    onError: (e: unknown) => toast.error(e instanceof ApiHttpError ? e.message : String(e)),
  });

  const deployMut = useMutation({
    mutationFn: () =>
      apiPostJson<Record<string, unknown>>("/api/app-center/kafka/k8s-deploy", {
        namespace: ns.trim(),
        baseName: base.trim(),
        templateId: tplId,
        storageClassName: sc.trim() || undefined,
        saslUsername: saslUser.trim() || undefined,
        saslPassword: saslPass.trim() || undefined,
        saslMechanism: saslMech,
        extraKafkaCfgLines: extraLines
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean),
      }),
    onSuccess: (r) => {
      toast.success(String(r.message ?? "已提交部署"));
      const p = r.saslPassword;
      if (typeof p === "string" && p) {
        toast.info(`SASL 密码（请妥善保存）: ${p}`, { duration: 20_000 });
      }
      const iid = r.instanceId;
      if (typeof iid === "number" && iid > 0) {
        navigate(`/cluster/apps/kafka/instance/${iid}`);
      }
      void qc.invalidateQueries({ queryKey: ["app-center-kafka-instances"] });
      void qc.invalidateQueries({ queryKey: ["kafka-rollout", iid] });
    },
    onError: (e: unknown) => toast.error(e instanceof ApiHttpError ? e.message : String(e)),
  });

  const saveTpl = useMutation({
    mutationFn: async () => {
      const lines = extraTplLines
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const cfg: KafkaTplCfg = { ...formCfg, extraKafkaCfgLines: lines };
      const body = { name: formName.trim(), description: formDesc.trim(), config: cfg };
      if (editing) {
        await apiPutJson(`/api/app-center/kafka/templates/${editing.id}`, body);
        return editing.id;
      }
      const r = await apiPostJson<{ id: number }>("/api/app-center/kafka/templates", body);
      return r.id;
    },
    onSuccess: () => {
      toast.success("模版已保存");
      setDlg(false);
      void qc.invalidateQueries({ queryKey: ["app-center-kafka-templates"] });
    },
    onError: (e: unknown) => toast.error(e instanceof ApiHttpError ? e.message : String(e)),
  });

  const delTpl = useMutation({
    mutationFn: (id: number) => apiDeleteJson(`/api/app-center/kafka/templates/${id}`),
    onSuccess: () => {
      toast.success("已删除");
      void qc.invalidateQueries({ queryKey: ["app-center-kafka-templates"] });
    },
    onError: (e: unknown) => toast.error(e instanceof ApiHttpError ? e.message : String(e)),
  });

  const createTopicMut = useMutation({
    mutationFn: () =>
      apiPostJson(`/api/app-center/kafka/instances/${instanceId}/topics`, {
        topic: newTopic.trim(),
        partitions: Number.parseInt(newParts, 10) || 3,
        replicationFactor: Number.parseInt(newRf, 10) || 3,
      }),
    onSuccess: () => {
      toast.success("主题已创建");
      void qc.invalidateQueries({ queryKey: ["kafka-topics", instanceId] });
    },
    onError: (e: unknown) => toast.error(e instanceof ApiHttpError ? e.message : String(e)),
  });

  const delTopicMut = useMutation({
    mutationFn: (t: string) => apiDeleteJson(`/api/app-center/kafka/instances/${instanceId}/topics/${encodeURIComponent(t)}`),
    onSuccess: () => {
      toast.success("已删除主题");
      void qc.invalidateQueries({ queryKey: ["kafka-topics", instanceId] });
    },
    onError: (e: unknown) => toast.error(e instanceof ApiHttpError ? e.message : String(e)),
  });

  const buildAclWizardDeleteFilter = () => {
    const u = aclWUser.trim();
    const topic = aclWTopic.trim();
    const principal = u ? (u.startsWith("User:") ? u : `User:${u}`) : "";
    const body: Record<string, string> = {
      resourceType: "Topic",
      resourcePatternType: aclWPattern,
      operation: aclWRole === "custom" ? (aclWCustomOp.trim() || "Any") : "Any",
      permissionType: "Allow",
    };
    if (topic) body.resourceName = topic;
    if (principal) body.principal = principal;
    const h = aclWHost.trim();
    if (h) body.host = h;
    return body;
  };

  const aclBundleMut = useMutation({
    mutationFn: async () => {
      const u = aclWUser.trim();
      if (!u) throw new Error("请填写 Kafka 用户名（与 SCRAM/PLAIN 登录名一致，勿含空格）");
      const topic = aclWTopic.trim();
      if (!topic) throw new Error("请选择或填写 Topic 名称");
      const principal = u.startsWith("User:") ? u : `User:${u}`;
      const host = aclWHost.trim() || "*";
      const pat = aclWPattern;
      let ops: string[];
      if (aclWRole === "producer") ops = ["Write", "Describe"];
      else if (aclWRole === "consumer") ops = ["Read", "Describe"];
      else if (aclWRole === "both") ops = ["Write", "Read", "Describe"];
      else ops = [aclWCustomOp.trim() || "Read"];
      const uniq = [...new Set(ops)];
      for (const op of uniq) {
        await apiPostJson(`/api/app-center/kafka/instances/${instanceId}/acls`, {
          resourceType: "Topic",
          resourceName: topic,
          resourcePatternType: pat,
          principal,
          host,
          operation: op,
          permissionType: "Allow",
        });
      }
      const userEntity = principal.replace(/^User:/i, "");
      if (aclWSyncQuota) {
        const pr = mibPerSecToQuotaBytes(aclWProdMiB);
        const cr = mibPerSecToQuotaBytes(aclWConsMiB);
        await apiPutJson(`/api/app-center/kafka/instances/${instanceId}/quotas`, {
          user: userEntity,
          producerByteRate: pr,
          consumerByteRate: cr,
        });
      }
    },
    onSuccess: () => {
      toast.success(
        aclWSyncQuota ? "已创建 ACL，并已写入用户配额（界面以 MiB/s 填写，已换算为字节/秒提交）" : "已创建 ACL"
      );
      void qc.invalidateQueries({ queryKey: ["kafka-acls", instanceId] });
      void qc.invalidateQueries({ queryKey: ["kafka-quotas", instanceId] });
    },
    onError: (e: unknown) => toast.error(e instanceof ApiHttpError ? e.message : e instanceof Error ? e.message : String(e)),
  });

  const delAclMut = useMutation({
    mutationFn: () => apiPostJson(`/api/app-center/kafka/instances/${instanceId}/acls/delete`, buildAclWizardDeleteFilter()),
    onSuccess: () => {
      toast.success("已按过滤器删除 ACL");
      void qc.invalidateQueries({ queryKey: ["kafka-acls", instanceId] });
    },
    onError: (e: unknown) => toast.error(e instanceof ApiHttpError ? e.message : String(e)),
  });

  const scramMut = useMutation({
    mutationFn: () =>
      apiPostJson(`/api/app-center/kafka/instances/${instanceId}/scram-users`, {
        username: scramUser.trim(),
        password: scramPass,
      }),
    onSuccess: () => {
      toast.success("SCRAM 用户已写入");
      setScramPass("");
    },
    onError: (e: unknown) => toast.error(e instanceof ApiHttpError ? e.message : String(e)),
  });

  const delScramMut = useMutation({
    mutationFn: (username: string) =>
      apiDeleteJson(`/api/app-center/kafka/instances/${instanceId}/scram-users/${encodeURIComponent(username)}`),
    onSuccess: () => {
      toast.success("已删除 SCRAM 用户");
    },
    onError: (e: unknown) => toast.error(e instanceof ApiHttpError ? e.message : String(e)),
  });

  const delInstMut = useMutation({
    mutationFn: (id: number) =>
      apiDeleteJson<{ ok?: boolean; k8sWarnings?: string[] }>(`/api/app-center/kafka/instances/${id}`),
    onSuccess: (data, id) => {
      toast.success("已从平台删除实例");
      const w = data?.k8sWarnings ?? [];
      if (w.length) {
        toast.message(w.join("；"), { duration: 14_000 });
      }
      setDeleteDlgOpen(false);
      setDeleteTarget(null);
      if (routeInstanceId === id) navigate("/cluster/apps/kafka");
      void qc.invalidateQueries({ queryKey: ["app-center-kafka-instances"] });
    },
    onError: (e: unknown) => toast.error(e instanceof ApiHttpError ? e.message : String(e)),
  });

  const patchTopicCfgMut = useMutation({
    mutationFn: () => {
      let entries: Record<string, string> = {};
      try {
        entries = JSON.parse(topicCfgPatch) as Record<string, string>;
      } catch {
        throw new Error("配置 JSON 无效");
      }
      return apiPostJson(`/api/app-center/kafka/instances/${instanceId}/topics/${encodeURIComponent(selectedTopic)}/configs`, {
        entries,
      });
    },
    onSuccess: () => {
      toast.success("主题配置已提交");
      void qc.invalidateQueries({ queryKey: ["kafka-topic-cfg", instanceId, selectedTopic] });
    },
    onError: (e: unknown) => toast.error(e instanceof ApiHttpError ? e.message : String(e)),
  });

  const produceMut = useMutation({
    mutationFn: () => {
      const body: { value: string; key?: string; partition?: number } = { value: produceVal };
      const k = produceKey.trim();
      if (k) body.key = k;
      const pp = producePart.trim();
      if (pp !== "") {
        const n = Number.parseInt(pp, 10);
        if (!Number.isNaN(n)) body.partition = n;
      }
      return apiPostJson<{ partition?: number; offset?: number }>(
        `/api/app-center/kafka/instances/${instanceId}/topics/${encodeURIComponent(selectedTopic)}/messages`,
        body
      );
    },
    onSuccess: (r) => {
      toast.success(`已生产 · p${r.partition ?? "?"} @ ${r.offset ?? "?"}`);
      setProduceVal("");
    },
    onError: (e: unknown) => toast.error(e instanceof ApiHttpError ? e.message : String(e)),
  });

  const browseMut = useMutation({
    mutationFn: () => {
      const p = new URLSearchParams({
        partition: topicPart.trim() || "0",
        limit: msgBrowseLimit.trim() || "50",
      });
      if (msgBrowseOffset.trim() !== "") p.set("offset", msgBrowseOffset.trim());
      return apiGetJson<{ messages: Array<Record<string, unknown>>; startOffset?: number }>(
        `/api/app-center/kafka/instances/${instanceId}/topics/${encodeURIComponent(selectedTopic)}/messages?${p}`
      );
    },
  });

  const tplOptions = tplQ.data?.templates ?? [];
  const namespaces = useMemo(() => {
    const raw = nsQ.data ?? [];
    const base = raw.length > 0 ? [...raw] : ["default"];
    const set = new Set(base);
    if (ns.trim() && !set.has(ns.trim())) set.add(ns.trim());
    return Array.from(set).sort();
  }, [nsQ.data, ns]);

  const openNewTpl = () => {
    setEditing(null);
    setFormName("");
    setFormDesc("");
    setFormCfg(emptyCfg());
    setExtraTplLines("");
    setDlg(true);
  };

  const openEdit = (t: KafkaTplRow) => {
    setEditing(t);
    setFormName(t.name);
    setFormDesc(t.description ?? "");
    setFormCfg({ ...emptyCfg(), ...t.config });
    setExtraTplLines((t.config.extraKafkaCfgLines ?? []).join("\n"));
    setDlg(true);
  };

  const hints = useMemo(
    () => [
      "推荐：3 节点 ZooKeeper + 3 节点 Kafka；每套部署独占一组 ZK。",
      "Kafka 镜像：bitnamilegacy/kafka（ZooKeeper 模式）。Busybox 用于 ZK init；镜像拉取失败时可换私有仓库或固定 digest。",
      "存储：ZK 与 Kafka 均为 StatefulSet volumeClaimTemplates，部署后自动为每个 Pod 创建 data-{工作负载名}-{序号} PVC（可在模版里改盘大小；部署页可选 StorageClass）。",
      "Bitnami 日志：集群内 ZooKeeper 连接为 PLAINTEXT 时可能仍有安全提示 WARN（官方 ZK 镜像未开 SASL/TLS）；broker 间已用 SASL 与客户端同机制，可消除「PLAINTEXT listener」类提示。升级平台后请重新应用/滚动 Kafka StatefulSet。",
      "监听：集群内 SASL_PLAINTEXT :9092；控制台与 broker 网络需互通。",
    ],
    []
  );

  const instances = instQ.data?.instances ?? [];
  const selectedInst = useMemo(() => instances.find((i) => i.id === instanceId), [instances, instanceId]);
  const instSaslMech = (cfgStr(selectedInst?.config ?? {}, "saslMechanism") || "SCRAM-SHA-512").toUpperCase();
  const scramSupported = clusterReady && instSaslMech !== "PLAIN";
  /** ACL / 配额中的登录名，不含 User: 前缀 */
  const scramKafkaUserName = useMemo(() => scramUser.trim().replace(/^User:/i, "").trim(), [scramUser]);
  const scramKafkaPrincipal = scramKafkaUserName ? `User:${scramKafkaUserName}` : "";
  const scramUserAclsForPrincipal = useMemo(() => {
    if (!scramKafkaUserName) return [];
    const key = scramKafkaUserName.toLowerCase();
    return (aclsQ.data?.acls ?? []).filter((raw) => {
      const p = String(raw.principal ?? "")
        .replace(/^User:/i, "")
        .trim()
        .toLowerCase();
      return p === key;
    });
  }, [aclsQ.data?.acls, scramKafkaUserName]);
  const scramQuotaRow = useMemo(() => {
    if (!scramKafkaUserName) return undefined;
    const key = scramKafkaUserName.toLowerCase();
    return (quotasQ.data?.quotas ?? []).find((q) => (q.user || "").toLowerCase() === key);
  }, [quotasQ.data?.quotas, scramKafkaUserName]);
  const instKafkaRep = cfgNum(selectedInst?.config ?? {}, "kafkaReplicas", 3);

  useEffect(() => {
    if (manageSubTab === "perf" && selectedTopic) {
      setPerfTopic((t) => (t.trim() === "" ? selectedTopic : t));
    }
  }, [manageSubTab, selectedTopic]);

  /** 进入压测 Tab 且尚未选中 Job 时，默认选中列表中最新一条，避免刷新后报告区空白 */
  useEffect(() => {
    if (manageSubTab !== "perf") return;
    const jobs = perfListQ.data?.jobs;
    if (!jobs?.length || perfJobName.trim() !== "") return;
    setPerfJobName(jobs[0].jobName);
  }, [manageSubTab, perfListQ.data?.jobs, perfJobName]);

  useEffect(() => {
    setPerfJobName("");
    setPerfValidationChecks([]);
  }, [instanceId]);

  useEffect(() => {
    const d = exposureQ.data;
    if (!d) return;
    setExpMode(d.externalExposure === "nodeport" ? "nodeport" : "internal");
    setExpHost(d.externalAdvertiseHost ?? "");
    const rep =
      d.kafkaReplicas && d.kafkaReplicas > 0 ? d.kafkaReplicas : cfgNum(selectedInst?.config ?? {}, "kafkaReplicas", 3);
    const from =
      d.externalNodePorts && d.externalNodePorts.length > 0
        ? d.externalNodePorts.map(String)
        : Array.from({ length: rep }, () => "");
    while (from.length < rep) from.push("");
    setExpPorts(from.slice(0, rep));
  }, [exposureQ.data, selectedInst, instKafkaRep]);

  return (
    <div className="mx-auto w-full max-w-[min(100%,96rem)] space-y-5 pb-2 sm:pb-12">
      {statusQ.data?.mysqlReachable === false ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-950">
          需要平台 MySQL。请配置 <code className="rounded bg-white px-1">MYSQL_DSN</code>。
        </div>
      ) : null}

      {isInstanceDetailPage ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to="/cluster/apps/kafka">返回实例列表</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to={`/cluster/apps/kafka/instance/${instanceId}/throttle`}>限速配置</Link>
              </Button>
              <h1 className="text-xl font-semibold tracking-tight text-slate-900">
                {selectedInst?.name ?? `Kafka #${instanceId}`}
              </h1>
              <Badge variant="outline" className="font-mono text-xs">
                {cfgStr(selectedInst?.config ?? {}, "namespace")}/{cfgStr(selectedInst?.config ?? {}, "baseName")}
              </Badge>
            </div>
          </div>
          {/* workspace: inlined below — see KAFKA_INSTANCE_WORKSPACE */}
                    <>
                      <Card className="border-slate-200/80 shadow-sm">
                        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
                          <div>
                            <CardTitle className="text-base">进度与资源</CardTitle>
                            <CardDescription>ZooKeeper / Kafka StatefulSet 就绪副本与可选 Prometheus 用量</CardDescription>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void qc.invalidateQueries({ queryKey: ["kafka-rollout", instanceId] })}
                          >
                            <RefreshCw className="mr-1 h-4 w-4" />
                            刷新状态
                          </Button>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm">
                          {rolloutQ.isLoading ? (
                            <div className="flex items-center gap-2 text-slate-500">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              加载中…
                            </div>
                          ) : rolloutQ.isError ? (
                            <p className="text-red-600">{(rolloutQ.error as Error)?.message ?? "加载失败"}</p>
                          ) : (
                            <>
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant={clusterReady ? "default" : "secondary"} className={clusterReady ? "bg-emerald-600" : ""}>
                                  {clusterReady ? "已就绪 · 可管理" : "部署中 / 未就绪"}
                                </Badge>
                                <span className="text-slate-600">{rolloutQ.data?.message}</span>
                              </div>
                              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
                                  <p className="text-[11px] font-medium text-slate-500">ZooKeeper</p>
                                  <p className="mt-0.5 font-mono text-sm tabular-nums">
                                    {rolloutQ.data?.zkReady ?? 0} / {rolloutQ.data?.zkDesired ?? 0}
                                  </p>
                                </div>
                                <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
                                  <p className="text-[11px] font-medium text-slate-500">Kafka</p>
                                  <p className="mt-0.5 font-mono text-sm tabular-nums">
                                    {rolloutQ.data?.kafkaReady ?? 0} / {rolloutQ.data?.kafkaDesired ?? 0}
                                  </p>
                                </div>
                                <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
                                  <p className="text-[11px] font-medium text-slate-500">CPU（集群内 Pod 合计）</p>
                                  <p className="mt-0.5 font-mono text-sm">
                                    {rolloutQ.data?.prometheusConfigured
                                      ? `${(rolloutQ.data?.cpuUsageCores ?? 0).toFixed(3)} cores`
                                      : "未配置监控"}
                                  </p>
                                </div>
                                <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
                                  <p className="text-[11px] font-medium text-slate-500">内存（工作集）</p>
                                  <p className="mt-0.5 font-mono text-sm">
                                    {rolloutQ.data?.prometheusConfigured ? formatMem(rolloutQ.data?.memUsageBytes) : "—"}
                                  </p>
                                </div>
                              </div>
                            </>
                          )}
                        </CardContent>
                      </Card>

                      {!clusterReady ? (
                        <Card className="border-amber-200/80 bg-amber-50/40 shadow-sm">
                          <CardContent className="py-6 text-center text-sm text-amber-950">
                            实例尚未完全就绪，Topic / 消费者 / ACL / SCRAM 管理已锁定。请等待 StatefulSet 副本全部 Ready 后自动解锁（本页会定时刷新）。
                          </CardContent>
                        </Card>
                      ) : (
                        <Tabs value={manageSubTab} onValueChange={(v) => setManageSubTab(v as typeof manageSubTab)} className="space-y-4">
                          <TabsList className="h-11 w-full flex-wrap justify-start gap-1 sm:w-auto">
                            <TabsTrigger value="cluster" className="px-4">
                              集群
                            </TabsTrigger>
                            <TabsTrigger value="exposure" className="px-4">
                              对外访问
                            </TabsTrigger>
                            <TabsTrigger value="topics" className="px-4">
                              Topic
                            </TabsTrigger>
                            <TabsTrigger value="perf" className="gap-1 px-4">
                              <Gauge className="h-3.5 w-3.5 opacity-80" aria-hidden />
                              压测
                            </TabsTrigger>
                            <TabsTrigger value="consumers" className="px-4">
                              消费者组
                            </TabsTrigger>
                            <TabsTrigger value="acl" className="px-4">
                              ACL
                            </TabsTrigger>
                            <TabsTrigger value="scram" className="px-4">
                              SCRAM 用户
                            </TabsTrigger>
                          </TabsList>

                          <TabsContent value="cluster" className="mt-0">
                            <Card className="min-h-[16rem] border-slate-200/80 shadow-sm">
                              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                                <div>
                                  <CardTitle className="text-base">Broker 与集群元数据</CardTitle>
                                  <CardDescription>Metadata：节点、Controller、cluster id（Kafka UI「Brokers」类信息）</CardDescription>
                                </div>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => void qc.invalidateQueries({ queryKey: ["kafka-cluster", instanceId] })}
                                >
                                  <RefreshCw className="mr-1 h-4 w-4" />
                                  刷新
                                </Button>
                              </CardHeader>
                              <CardContent className="space-y-3">
                                {clusterQ.isLoading ? (
                                  <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                                ) : clusterQ.isError ? (
                                  <p className="text-sm text-red-600">{(clusterQ.error as Error)?.message ?? "加载失败"}</p>
                                ) : (
                                  <>
                                    <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                                      {clusterQ.data?.clusterId != null ? (
                                        <Badge variant="outline" className="font-mono">
                                          clusterId: {String(clusterQ.data.clusterId)}
                                        </Badge>
                                      ) : null}
                                      {clusterQ.data?.controllerId != null ? (
                                        <Badge variant="outline">controller: {clusterQ.data.controllerId}</Badge>
                                      ) : null}
                                    </div>
                                    <div className="overflow-auto rounded-lg border border-slate-100">
                                      <Table>
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead>nodeId</TableHead>
                                            <TableHead>host</TableHead>
                                            <TableHead>port</TableHead>
                                            <TableHead>rack</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {(clusterQ.data?.brokers ?? []).map((b) => (
                                            <TableRow key={b.nodeId}>
                                              <TableCell className="tabular-nums">{b.nodeId}</TableCell>
                                              <TableCell className="font-mono text-xs">{b.host}</TableCell>
                                              <TableCell className="tabular-nums">{b.port}</TableCell>
                                              <TableCell className="text-xs">{b.rack || "—"}</TableCell>
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    </div>
                                  </>
                                )}
                              </CardContent>
                            </Card>
                          </TabsContent>

                          <TabsContent value="exposure" className="mt-0">
                            <Card className="min-h-[20rem] border-slate-200/80 shadow-sm">
                              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                                <div>
                                  <CardTitle className="text-base">对外访问</CardTitle>
                                  <CardDescription>
                                    仅集群内：客户端仍走集群 Service（SASL_PLAINTEXT :9092）。对外：一键开启后由平台根据{" "}
                                    <strong>broker-0 所在节点</strong>（若无 Pod 则取首个 Ready 节点）解析 <strong>ExternalIP → InternalIP</strong>，并自动分配每副本
                                    NodePort；客户端只需使用下方表格中的 <strong>IP + 端口</strong>（SASL 与集群内相同，容器 9094）。
                                  </CardDescription>
                                </div>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => void qc.invalidateQueries({ queryKey: ["kafka-exposure", instanceId] })}
                                >
                                  <RefreshCw className="mr-1 h-4 w-4" />
                                  刷新
                                </Button>
                              </CardHeader>
                              <CardContent className="space-y-4">
                                {exposureQ.isLoading ? (
                                  <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                                ) : exposureQ.isError ? (
                                  <p className="text-sm text-red-600">{(exposureQ.error as Error)?.message ?? "加载失败"}</p>
                                ) : (
                                  <>
                                    <div className="space-y-2">
                                      <Label className="text-xs">模式</Label>
                                      <Select value={expMode} onValueChange={(v) => setExpMode(v as "internal" | "nodeport")}>
                                        <SelectTrigger className="max-w-xs">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="internal">仅集群内（内网）</SelectItem>
                                          <SelectItem value="nodeport">NodePort（每副本一个端口）</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>

                                    {expMode === "nodeport" ? (
                                      <>
                                        <div className="rounded-lg border border-sky-200/80 bg-sky-50/60 px-3 py-2.5 text-xs text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/25 dark:text-sky-100">
                                          默认<strong>无需填写</strong>：点击「一键对外暴露」后，由集群推断广播 IP 并分配端口。多网卡/公网入口与推断不一致时，展开高级选项手动填写。
                                        </div>
                                        <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                                          <input
                                            type="checkbox"
                                            className="rounded border-slate-300"
                                            checked={kafkaExposureAdvanced}
                                            onChange={(e) => setKafkaExposureAdvanced(e.target.checked)}
                                          />
                                          高级：手动覆盖广播地址 / NodePort
                                        </label>
                                        {kafkaExposureAdvanced ? (
                                          <>
                                            <div className="space-y-2">
                                              <Label className="text-xs">对外广播地址（留空则仍由平台自动推断）</Label>
                                              <Input
                                                className="max-w-xl font-mono text-sm"
                                                placeholder="例如公网 IP、LB 或内网固定入口"
                                                value={expHost}
                                                onChange={(e) => setExpHost(e.target.value)}
                                              />
                                            </div>
                                            <div className="space-y-2">
                                              <Label className="text-xs">
                                                各副本 NodePort（{instKafkaRep} 个；可全留空自动分配；或全手动 30000–32767 互不重复）
                                              </Label>
                                              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                                {expPorts.map((p, idx) => (
                                                  <div key={idx} className="flex items-center gap-2">
                                                    <span className="w-24 shrink-0 text-xs text-slate-500">broker-{idx}</span>
                                                    <Input
                                                      className="font-mono text-sm"
                                                      placeholder="留空则自动分配"
                                                      value={p}
                                                      onChange={(e) => {
                                                        const next = [...expPorts];
                                                        next[idx] = e.target.value;
                                                        setExpPorts(next);
                                                      }}
                                                    />
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          </>
                                        ) : null}
                                      </>
                                    ) : (
                                      <p className="text-sm text-slate-600">当前不创建 NodePort Service；仅保留集群内访问。</p>
                                    )}

                                    <div className="flex flex-wrap gap-2">
                                      {expMode === "nodeport" ? (
                                        <Button
                                          type="button"
                                          size="sm"
                                          disabled={!canWrite || exposureMut.isPending}
                                          onClick={() => {
                                            exposureMut.mutate({ mode: "nodeport", advertiseHost: "", nodePorts: [] });
                                          }}
                                        >
                                          {exposureMut.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                                          一键对外暴露（自动 IP + NodePort）
                                        </Button>
                                      ) : null}
                                      <Button
                                        size="sm"
                                        variant={expMode === "nodeport" ? "outline" : "default"}
                                        disabled={!canWrite || exposureMut.isPending}
                                        onClick={() => {
                                          if (expMode === "internal") {
                                            exposureMut.mutate({ mode: "internal", advertiseHost: "", nodePorts: [] });
                                            return;
                                          }
                                          const host = expHost.trim();
                                          const rep = instKafkaRep;
                                          const row = expPorts.slice(0, rep);
                                          while (row.length < rep) row.push("");
                                          const trimmed = row.map((p) => p.trim());
                                          const allEmpty = trimmed.every((p) => p === "");
                                          const allFilled = trimmed.every((p) => p !== "");
                                          if (!allEmpty && !allFilled) {
                                            toast.error(`NodePort 请全部留空（自动分配）或填满 ${rep} 个副本端口`);
                                            return;
                                          }
                                          if (allEmpty) {
                                            exposureMut.mutate({ mode: "nodeport", advertiseHost: host, nodePorts: [] });
                                            return;
                                          }
                                          const ports: number[] = [];
                                          for (let i = 0; i < rep; i++) {
                                            const n = Number.parseInt(trimmed[i] ?? "", 10);
                                            if (!Number.isFinite(n) || n < 30000 || n > 32767) {
                                              toast.error(`broker-${i}：NodePort 须为 30000–32767 的整数`);
                                              return;
                                            }
                                            ports.push(n);
                                          }
                                          if (new Set(ports).size !== ports.length) {
                                            toast.error("各副本 NodePort 不可重复");
                                            return;
                                          }
                                          exposureMut.mutate({ mode: "nodeport", advertiseHost: host, nodePorts: ports });
                                        }}
                                      >
                                        {exposureMut.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                                        {expMode === "nodeport" ? "应用高级配置" : "应用配置"}
                                      </Button>
                                      {!canWrite ? <p className="text-xs text-slate-500">无写权限时不可修改。</p> : null}
                                    </div>

                                    {(exposureQ.data?.accessEndpoints?.length ?? 0) > 0 ? (
                                      <div className="space-y-2 rounded-lg border border-emerald-200/90 bg-emerald-50/80 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/30">
                                        <p className="text-xs font-semibold text-emerald-950 dark:text-emerald-100">
                                          对外连接（客户端使用 IP + NodePort，SASL 与集群内相同）
                                        </p>
                                        <div className="overflow-auto rounded-md border border-white/60 bg-white/70 dark:border-emerald-900/40 dark:bg-emerald-950/40">
                                          <Table>
                                            <TableHeader>
                                              <TableRow>
                                                <TableHead className="w-24">副本</TableHead>
                                                <TableHead>IP / 主机</TableHead>
                                                <TableHead className="tabular-nums">NodePort</TableHead>
                                              </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                              {(exposureQ.data?.accessEndpoints ?? []).map((row) => (
                                                <TableRow key={String(row.broker)}>
                                                  <TableCell className="text-sm">broker-{row.broker ?? "—"}</TableCell>
                                                  <TableCell className="font-mono text-xs">{row.host ?? "—"}</TableCell>
                                                  <TableCell className="font-mono text-sm tabular-nums">{row.nodePort ?? "—"}</TableCell>
                                                </TableRow>
                                              ))}
                                            </TableBody>
                                          </Table>
                                        </div>
                                      </div>
                                    ) : null}

                                    {exposureQ.data?.externalBootstrap ? (
                                      <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                          <p className="text-xs font-semibold text-slate-700">外部 bootstrap（逗号分隔）</p>
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="h-8 gap-1"
                                            onClick={() => {
                                              const t = exposureQ.data?.externalBootstrap ?? "";
                                              void navigator.clipboard.writeText(t).then(
                                                () => toast.success("已复制"),
                                                () => toast.error("复制失败")
                                              );
                                            }}
                                          >
                                            <Copy className="h-3.5 w-3.5" />
                                            复制
                                          </Button>
                                        </div>
                                        <p className="break-all font-mono text-xs text-slate-800">{exposureQ.data.externalBootstrap}</p>
                                        {exposureQ.data.externalListenerPort != null ? (
                                          <p className="text-[11px] text-slate-500">
                                            容器 EXTERNAL 监听端口 {exposureQ.data.externalListenerPort}，经 NodePort 映射到上述端口。
                                          </p>
                                        ) : null}
                                      </div>
                                    ) : exposureQ.data?.externalExposure === "nodeport" ? (
                                      <p className="text-xs text-amber-800">保存并滚动完成后将显示 bootstrap 串。</p>
                                    ) : null}

                                    {(exposureQ.data?.services?.length ?? 0) > 0 ? (
                                      <div className="overflow-auto rounded-lg border border-slate-100">
                                        <Table>
                                          <TableHeader>
                                            <TableRow>
                                              <TableHead>副本</TableHead>
                                              <TableHead>Service</TableHead>
                                              <TableHead className="tabular-nums">NodePort</TableHead>
                                              <TableHead>状态</TableHead>
                                            </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                            {(exposureQ.data?.services ?? []).map((s) => (
                                              <TableRow key={String(s.ordinal ?? s.name)}>
                                                <TableCell className="tabular-nums text-sm">{s.ordinal ?? "—"}</TableCell>
                                                <TableCell className="font-mono text-xs">{s.name ?? "—"}</TableCell>
                                                <TableCell className="tabular-nums text-sm">{s.nodePort ?? "—"}</TableCell>
                                                <TableCell className="text-xs">
                                                  {s.found ? (
                                                    <Badge variant="outline" className="text-emerald-800">
                                                      已创建
                                                    </Badge>
                                                  ) : (
                                                    <Badge variant="outline" className="text-slate-600">
                                                      未找到
                                                    </Badge>
                                                  )}
                                                </TableCell>
                                              </TableRow>
                                            ))}
                                          </TableBody>
                                        </Table>
                                      </div>
                                    ) : null}
                                  </>
                                )}
                              </CardContent>
                            </Card>
                          </TabsContent>

                          <TabsContent value="topics" className="mt-0">
                            <Card className="min-h-[28rem] border-slate-200/80 shadow-sm">
                              <CardHeader>
                                <CardTitle className="text-base">Topic</CardTitle>
                                <CardDescription>分区数来自集群元数据</CardDescription>
                              </CardHeader>
                              <CardContent className="space-y-4">
                                <div className="flex flex-wrap gap-2">
                                  <Input
                                    placeholder="topic"
                                    value={newTopic}
                                    onChange={(e) => setNewTopic(e.target.value)}
                                    className="max-w-[220px] font-mono text-sm"
                                  />
                                  <Input
                                    placeholder="分区"
                                    value={newParts}
                                    onChange={(e) => setNewParts(e.target.value)}
                                    className="w-24 text-sm"
                                  />
                                  <Input
                                    placeholder="副本"
                                    value={newRf}
                                    onChange={(e) => setNewRf(e.target.value)}
                                    className="w-24 text-sm"
                                  />
                                  <Button size="sm" disabled={!canWrite} onClick={() => createTopicMut.mutate()}>
                                    创建
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => void qc.invalidateQueries({ queryKey: ["kafka-topics", instanceId] })}
                                  >
                                    <RefreshCw className="mr-1 h-4 w-4" />
                                    刷新
                                  </Button>
                                </div>
                                <div className="overflow-auto rounded-lg border border-slate-100">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead className="min-w-[240px]">Topic</TableHead>
                                        <TableHead>分区数</TableHead>
                                        <TableHead className="text-right">Kafka UI</TableHead>
                                        <TableHead className="text-right">操作</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {(topicsQ.data?.topics ?? []).map((t) => (
                                        <TableRow key={t.topic}>
                                          <TableCell className="font-mono text-sm">{t.topic}</TableCell>
                                          <TableCell className="tabular-nums text-sm">{t.partitions?.length ?? 0}</TableCell>
                                          <TableCell className="text-right">
                                            <Button
                                              size="sm"
                                              variant={selectedTopic === t.topic ? "secondary" : "outline"}
                                              onClick={() => {
                                                setSelectedTopic(t.topic);
                                                setTopicPart("0");
                                              }}
                                            >
                                              配置 / 消息
                                            </Button>
                                          </TableCell>
                                          <TableCell className="text-right">
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              className="text-red-600"
                                              disabled={!canWrite}
                                              onClick={() => {
                                                if (confirm(`删除主题 ${t.topic} ?`)) delTopicMut.mutate(t.topic);
                                              }}
                                            >
                                              删除
                                            </Button>
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>

                                {selectedTopic ? (
                                  <div className="space-y-4 rounded-xl border border-violet-200/80 bg-violet-50/20 p-4">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <p className="text-sm font-medium text-slate-800">
                                        主题工具台：<span className="font-mono text-violet-900">{selectedTopic}</span>
                                      </p>
                                      <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedTopic("")}>
                                        关闭
                                      </Button>
                                    </div>

                                    <div className="grid gap-4 lg:grid-cols-2">
                                      <div className="space-y-2 rounded-lg border border-slate-200 bg-white/90 p-3">
                                        <p className="text-xs font-semibold text-slate-700">主题配置（Describe / IncrementalAlter）</p>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className="gap-1"
                                          onClick={() => void qc.invalidateQueries({ queryKey: ["kafka-topic-cfg", instanceId, selectedTopic] })}
                                        >
                                          <RefreshCw className="h-3.5 w-3.5" />
                                          刷新配置
                                        </Button>
                                        <div className="max-h-48 overflow-auto rounded border border-slate-100 bg-slate-50/80 p-2 font-mono text-[10px] text-slate-800">
                                          {topicCfgQ.isFetching ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                          ) : (
                                            <pre className="whitespace-pre-wrap break-all">
                                              {JSON.stringify(topicCfgQ.data?.configs ?? [], null, 2)}
                                            </pre>
                                          )}
                                        </div>
                                        <Label className="text-xs">增量修改（JSON 对象，键为配置名）</Label>
                                        <Textarea
                                          value={topicCfgPatch}
                                          onChange={(e) => setTopicCfgPatch(e.target.value)}
                                          rows={5}
                                          className="font-mono text-xs"
                                        />
                                        <Button
                                          size="sm"
                                          disabled={!canWrite || patchTopicCfgMut.isPending}
                                          onClick={() => patchTopicCfgMut.mutate()}
                                        >
                                          {patchTopicCfgMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                          应用配置
                                        </Button>
                                      </div>

                                      <div className="space-y-2 rounded-lg border border-slate-200 bg-white/90 p-3">
                                        <p className="text-xs font-semibold text-slate-700">生产消息</p>
                                        <Input
                                          placeholder="Key（可选）"
                                          value={produceKey}
                                          onChange={(e) => setProduceKey(e.target.value)}
                                          className="font-mono text-xs"
                                        />
                                        <Textarea
                                          placeholder="Value"
                                          value={produceVal}
                                          onChange={(e) => setProduceVal(e.target.value)}
                                          rows={3}
                                          className="font-mono text-xs"
                                        />
                                        <Input
                                          placeholder="分区（空=自动）"
                                          value={producePart}
                                          onChange={(e) => setProducePart(e.target.value)}
                                          className="max-w-[120px] font-mono text-xs"
                                        />
                                        <Button
                                          size="sm"
                                          disabled={!canWrite || produceMut.isPending || !produceVal.trim()}
                                          onClick={() => produceMut.mutate()}
                                        >
                                          {produceMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                          发送
                                        </Button>
                                      </div>
                                    </div>

                                    <div className="space-y-2 rounded-lg border border-slate-200 bg-white/90 p-3">
                                      <p className="text-xs font-semibold text-slate-700">浏览消息（按分区拉取）</p>
                                      <div className="flex flex-wrap gap-2">
                                        <Input
                                          className="w-24 text-xs"
                                          value={topicPart}
                                          onChange={(e) => setTopicPart(e.target.value)}
                                          placeholder="分区"
                                        />
                                        <Input
                                          className="w-24 text-xs"
                                          value={msgBrowseLimit}
                                          onChange={(e) => setMsgBrowseLimit(e.target.value)}
                                          placeholder="条数"
                                        />
                                        <Input
                                          className="max-w-[200px] flex-1 font-mono text-xs"
                                          value={msgBrowseOffset}
                                          onChange={(e) => setMsgBrowseOffset(e.target.value)}
                                          placeholder="起始 offset（空=从末尾倒推）"
                                        />
                                        <Button type="button" size="sm" variant="secondary" disabled={browseMut.isPending} onClick={() => browseMut.mutate()}>
                                          {browseMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                          拉取
                                        </Button>
                                      </div>
                                      {browseMut.data?.startOffset != null ? (
                                        <p className="text-[11px] text-slate-500">起始 offset: {browseMut.data.startOffset}</p>
                                      ) : null}
                                      <div className="max-h-64 overflow-auto rounded border border-slate-100 bg-slate-50/80 p-2 font-mono text-[10px]">
                                        <pre className="whitespace-pre-wrap break-all">
                                          {JSON.stringify(browseMut.data?.messages ?? [], null, 2)}
                                        </pre>
                                      </div>
                                    </div>
                                  </div>
                                ) : null}
                              </CardContent>
                            </Card>
                          </TabsContent>

                          <TabsContent value="perf" className="mt-0">
                            <Card className="min-h-[24rem] border-slate-200/80 shadow-sm">
                              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                                <div>
                                  <CardTitle className="text-base">Kafka 压测</CardTitle>
                                  <CardDescription>
                                    在集群内以 Job 运行 kafka-producer-perf-test / kafka-consumer-perf-test。默认不限速（全速）；可选在压测前对用户配额临时限速并在结束后自动解除。
                                  </CardDescription>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      void qc.invalidateQueries({ queryKey: ["kafka-perf-jobs", instanceId] });
                                      if (perfJobName.trim()) {
                                        void qc.invalidateQueries({ queryKey: ["kafka-perf-report", instanceId, perfJobName] });
                                      }
                                    }}
                                  >
                                    <RefreshCw className="mr-1 h-4 w-4" />
                                    刷新列表
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={!perfJobName.trim()}
                                    onClick={() => void qc.invalidateQueries({ queryKey: ["kafka-perf-report", instanceId, perfJobName] })}
                                  >
                                    刷新报告
                                  </Button>
                                </div>
                              </CardHeader>
                              <CardContent className="space-y-6">
                                <div className="space-y-2">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-sm font-medium text-slate-800">压测任务列表</p>
                                    <p className="text-[11px] text-slate-500">
                                      数据来自集群内 Job；刷新页面后仍会显示（Job 完成后约 1h 可能被 TTL 自动删除）。
                                    </p>
                                  </div>
                                  <div className="overflow-auto rounded-lg border border-slate-100">
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>Job</TableHead>
                                          <TableHead>Topic</TableHead>
                                          <TableHead>状态</TableHead>
                                          <TableHead>创建时间</TableHead>
                                          <TableHead className="text-right">操作</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {perfListQ.isLoading ? (
                                          <TableRow>
                                            <TableCell colSpan={5} className="text-sm text-slate-500">
                                              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                                              加载中…
                                            </TableCell>
                                          </TableRow>
                                        ) : (perfListQ.data?.jobs ?? []).length === 0 ? (
                                          <TableRow>
                                            <TableCell colSpan={5} className="text-center text-sm text-slate-500">
                                              暂无压测 Job（尚未创建或已被集群清理）
                                            </TableCell>
                                          </TableRow>
                                        ) : (
                                          (perfListQ.data?.jobs ?? []).map((j) => (
                                            <TableRow
                                              key={j.jobName}
                                              className={cn(perfJobName === j.jobName ? "bg-violet-50/60" : undefined)}
                                            >
                                              <TableCell className="max-w-[200px] truncate font-mono text-xs">{j.jobName}</TableCell>
                                              <TableCell className="font-mono text-xs">{j.topic ?? "—"}</TableCell>
                                              <TableCell>
                                                <Badge
                                                  variant={
                                                    j.status === "completed"
                                                      ? "default"
                                                      : j.status === "failed"
                                                        ? "destructive"
                                                        : "secondary"
                                                  }
                                                  className={j.status === "completed" ? "bg-emerald-600" : ""}
                                                >
                                                  {j.status ?? "—"}
                                                </Badge>
                                              </TableCell>
                                              <TableCell className="whitespace-nowrap text-xs text-slate-600">
                                                {j.createdAt ? new Date(j.createdAt).toLocaleString() : "—"}
                                              </TableCell>
                                              <TableCell className="text-right">
                                                <Button
                                                  type="button"
                                                  size="sm"
                                                  variant={perfJobName === j.jobName ? "secondary" : "outline"}
                                                  onClick={() => setPerfJobName(j.jobName)}
                                                >
                                                  查看报告
                                                </Button>
                                              </TableCell>
                                            </TableRow>
                                          ))
                                        )}
                                      </TableBody>
                                    </Table>
                                  </div>
                                </div>

                                <div className="grid gap-4 lg:grid-cols-2">
                                  <div className="space-y-2">
                                    <Label className="text-xs">Topic（须已存在）</Label>
                                    <Input
                                      className="font-mono text-sm"
                                      placeholder="my-topic"
                                      value={perfTopic}
                                      onChange={(e) => setPerfTopic(e.target.value)}
                                      list="kafka-perf-topic-suggest"
                                    />
                                    <datalist id="kafka-perf-topic-suggest">
                                      {(topicsQ.data?.topics ?? []).map((t) => (
                                        <option key={t.topic} value={t.topic} />
                                      ))}
                                    </datalist>
                                  </div>
                                  <div className="space-y-2">
                                    <Label className="text-xs">模式</Label>
                                    <Select value={perfTestMode} onValueChange={(v) => setPerfTestMode(v as typeof perfTestMode)}>
                                      <SelectTrigger>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="both">生产 + 消费</SelectItem>
                                        <SelectItem value="producer">仅生产</SelectItem>
                                        <SelectItem value="consumer">仅消费</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="space-y-2">
                                    <Label className="text-xs">消息条数（生产/消费）</Label>
                                    <Input className="font-mono text-sm" value={perfRecords} onChange={(e) => setPerfRecords(e.target.value)} />
                                  </div>
                                  <div className="space-y-2">
                                    <Label className="text-xs">单条字节数</Label>
                                    <Input className="font-mono text-sm" value={perfRecordSize} onChange={(e) => setPerfRecordSize(e.target.value)} />
                                  </div>
                                </div>

                                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                      <p className="text-sm font-medium text-slate-800">压测前用户限速（可选）</p>
                                      <p className="text-[11px] text-slate-500">关闭则为全速压测；开启时由实例管理员账号执行 kafka-configs，配额作用在下方「配额用户」上。</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-slate-600">{perfEnableThrottle ? "已开启" : "关闭（全速）"}</span>
                                      <Switch checked={perfEnableThrottle} onCheckedChange={setPerfEnableThrottle} disabled={!canWrite} />
                                    </div>
                                  </div>
                                  {perfEnableThrottle ? (
                                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                      <div className="space-y-1.5">
                                        <Label className="text-xs">生产者限速（bytes/s）</Label>
                                        <Input
                                          className="font-mono text-sm"
                                          value={perfProducerLimit}
                                          onChange={(e) => setPerfProducerLimit(e.target.value)}
                                        />
                                      </div>
                                      <div className="space-y-1.5">
                                        <Label className="text-xs">消费者限速（bytes/s）</Label>
                                        <Input
                                          className="font-mono text-sm"
                                          value={perfConsumerLimit}
                                          onChange={(e) => setPerfConsumerLimit(e.target.value)}
                                        />
                                      </div>
                                      <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                                        <Label className="text-xs">配额用户（留空 = 实例默认 SASL 用户）</Label>
                                        <Input
                                          className="font-mono text-sm"
                                          placeholder={cfgStr(selectedInst?.config ?? {}, "saslUsername") || "admin"}
                                          value={perfQuotaUser}
                                          onChange={(e) => setPerfQuotaUser(e.target.value)}
                                        />
                                      </div>
                                    </div>
                                  ) : null}
                                </div>

                                <div className="rounded-xl border border-violet-200/60 bg-violet-50/20 p-4 space-y-3">
                                  <p className="text-sm font-medium text-slate-800">压测客户端 SASL（可选）</p>
                                  <p className="text-[11px] text-slate-600">
                                    留空则使用实例登记的管理员用户。填写时需同时提供密码，用于生产/消费压测；与「配额用户」可不同（例如用普通账号压测、对另一用户做配额限速）。
                                  </p>
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="space-y-1.5">
                                      <Label className="text-xs">用户名</Label>
                                      <Input
                                        className="font-mono text-sm"
                                        value={perfClientUser}
                                        onChange={(e) => setPerfClientUser(e.target.value)}
                                      />
                                    </div>
                                    <div className="space-y-1.5">
                                      <Label className="text-xs">密码</Label>
                                      <Input
                                        type="password"
                                        className="font-mono text-sm"
                                        value={perfClientPass}
                                        onChange={(e) => setPerfClientPass(e.target.value)}
                                        autoComplete="off"
                                      />
                                    </div>
                                  </div>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={
                                      perfValidateMut.isPending ||
                                      !perfTopic.trim() ||
                                      (perfEnableThrottle &&
                                        (Number.parseInt(perfProducerLimit, 10) || 0) <= 0 &&
                                        (Number.parseInt(perfConsumerLimit, 10) || 0) <= 0) ||
                                      (perfClientUser.trim() !== "" && perfClientPass === "")
                                    }
                                    onClick={() => {
                                      const body = buildKafkaPerfBody();
                                      if (!body) {
                                        toast.error("请填写 Topic");
                                        return;
                                      }
                                      perfValidateMut.mutate(body);
                                    }}
                                  >
                                    {perfValidateMut.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                                    校验配置
                                  </Button>
                                  <Button
                                    size="sm"
                                    disabled={
                                      !canWrite ||
                                      perfStartMut.isPending ||
                                      !perfTopic.trim() ||
                                      (perfEnableThrottle &&
                                        (Number.parseInt(perfProducerLimit, 10) || 0) <= 0 &&
                                        (Number.parseInt(perfConsumerLimit, 10) || 0) <= 0) ||
                                      (perfClientUser.trim() !== "" && perfClientPass === "")
                                    }
                                    onClick={() => {
                                      const body = buildKafkaPerfBody();
                                      if (!body) {
                                        toast.error("请填写 Topic");
                                        return;
                                      }
                                      perfStartMut.mutate(body);
                                    }}
                                  >
                                    {perfStartMut.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                                    启动压测
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="text-red-700"
                                    disabled={!canWrite || !perfJobName.trim() || perfDeleteMut.isPending}
                                    onClick={() => {
                                      if (!confirm(`删除压测 Job「${perfJobName}」？`)) return;
                                      perfDeleteMut.mutate(perfJobName);
                                    }}
                                  >
                                    删除当前 Job
                                  </Button>
                                  {!canWrite ? <span className="text-xs text-slate-500">只读账号无法启动/删除压测。</span> : null}
                                </div>

                                {perfValidationChecks.length > 0 ? (
                                  <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 space-y-2">
                                    <p className="text-xs font-semibold text-slate-700">最近一次校验明细</p>
                                    <ul className="space-y-1.5 text-xs">
                                      {perfValidationChecks.map((c, idx) => (
                                        <li
                                          key={`${c.id ?? "chk"}-${idx}`}
                                          className={cn(
                                            "flex gap-2 rounded border px-2 py-1.5",
                                            c.ok ? "border-emerald-200 bg-emerald-50/50" : "border-red-200 bg-red-50/50"
                                          )}
                                        >
                                          <span className="shrink-0 font-mono text-[10px] text-slate-500">{c.id ?? "—"}</span>
                                          <span className={c.ok ? "text-slate-800" : "text-red-900"}>{c.message ?? ""}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : null}

                                {perfJobName.trim() ? (
                                  <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="text-sm font-medium text-slate-800">当前 Job</span>
                                      <code className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs">{perfJobName}</code>
                                      {perfReportQ.isLoading ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
                                    </div>
                                    {perfReportQ.isError ? (
                                      <p className="text-sm text-red-600">{(perfReportQ.error as Error)?.message ?? "加载失败"}</p>
                                    ) : perfReportQ.data ? (
                                      <>
                                        <div className="flex flex-wrap items-center gap-2 text-xs">
                                          <Badge
                                            variant={
                                              perfReportQ.data.status === "completed"
                                                ? "default"
                                                : perfReportQ.data.status === "failed"
                                                  ? "destructive"
                                                  : "secondary"
                                            }
                                            className={perfReportQ.data.status === "completed" ? "bg-emerald-600" : ""}
                                          >
                                            {perfReportQ.data.status ?? "—"}
                                          </Badge>
                                          <span className="text-slate-600">
                                            topic <span className="font-mono">{perfReportQ.data.topic ?? "—"}</span>
                                          </span>
                                          {perfReportQ.data.throttleEnabled ? (
                                            <Badge variant="outline">限速压测</Badge>
                                          ) : (
                                            <Badge variant="outline">全速</Badge>
                                          )}
                                        </div>
                                        {(perfReportQ.data.clientUsername || perfReportQ.data.throttleUser) && (
                                          <p className="text-[11px] text-slate-600">
                                            {perfReportQ.data.clientUsername ? (
                                              <>
                                                客户端用户 <span className="font-mono">{perfReportQ.data.clientUsername}</span>
                                              </>
                                            ) : (
                                              <>客户端用户：实例默认</>
                                            )}
                                            {perfReportQ.data.throttleUser ? (
                                              <>
                                                {" "}
                                                · 配额用户 <span className="font-mono">{perfReportQ.data.throttleUser}</span>
                                              </>
                                            ) : null}
                                          </p>
                                        )}
                                        {perfReportQ.data.recordCount != null && perfReportQ.data.recordSize != null ? (
                                          <div className="rounded-lg border border-slate-100 bg-slate-50/90 px-3 py-2 text-xs text-slate-700">
                                            <p className="font-medium text-slate-800">计划压测规模</p>
                                            <p className="mt-1 font-mono tabular-nums">
                                              消息条数 <span className="text-slate-900">{perfReportQ.data.recordCount.toLocaleString()}</span>
                                              {" · "}
                                              单条 <span className="text-slate-900">{perfReportQ.data.recordSize}</span> B
                                              {" · "}
                                              约写入 payload{" "}
                                              <span className="text-slate-900">
                                                {(perfReportQ.data.recordCount * perfReportQ.data.recordSize) / (1024 * 1024) >= 1024
                                                  ? `${((perfReportQ.data.recordCount * perfReportQ.data.recordSize) / (1024 * 1024 * 1024)).toFixed(2)} GiB`
                                                  : `${((perfReportQ.data.recordCount * perfReportQ.data.recordSize) / (1024 * 1024)).toFixed(2)} MiB`}
                                              </span>
                                              <span className="text-slate-500">（不含 Kafka 协议开销）</span>
                                            </p>
                                          </div>
                                        ) : null}
                                        {perfReportQ.data.progressHint ? (
                                          <div className="rounded-lg border border-sky-200 bg-sky-50/90 px-3 py-2 text-xs text-sky-950">
                                            {perfReportQ.data.progressHint}
                                          </div>
                                        ) : null}
                                        {(perfReportQ.data.status === "failed" || perfReportQ.data.status === "completed") &&
                                        perfReportQ.data.errorMessage ? (
                                          <pre className="max-h-40 overflow-auto rounded border border-red-100 bg-red-50/80 p-2 font-mono text-[11px] text-red-900 whitespace-pre-wrap">
                                            {perfReportQ.data.errorMessage}
                                          </pre>
                                        ) : null}
                                        {perfReportQ.data.parseNote ? (
                                          <div className="rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs text-amber-950">
                                            {perfReportQ.data.parseNote}
                                          </div>
                                        ) : null}
                                        {perfReportQ.data.producer ? (
                                          <div className="space-y-1">
                                            <p className="text-xs font-semibold text-slate-700">
                                              生产者
                                              {perfReportQ.data.status === "running" || perfReportQ.data.status === "pending" ? (
                                                <span className="ml-2 font-normal text-sky-700">（当前日志中的最新汇总）</span>
                                              ) : null}
                                            </p>
                                            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-xs">
                                              <div className="rounded border border-slate-100 bg-slate-50/80 px-2 py-1.5">
                                                <span className="text-slate-500">吞吐 / 带宽</span>
                                                <p className="font-mono tabular-nums">
                                                  {perfReportQ.data.producer.mbPerSec?.toFixed?.(2) ?? "—"} MB/s
                                                  {perfReportQ.data.producer.mbPerSec != null ? (
                                                    <span className="text-slate-500">
                                                      {" "}
                                                      （≈ {(perfReportQ.data.producer.mbPerSec * 8).toFixed(2)} Mb/s）
                                                    </span>
                                                  ) : null}
                                                </p>
                                                <p className="mt-0.5 font-mono tabular-nums text-slate-600">
                                                  {perfReportQ.data.producer.recordsPerSec?.toFixed?.(0) ?? "—"} 条/s
                                                </p>
                                              </div>
                                              <div className="rounded border border-slate-100 bg-slate-50/80 px-2 py-1.5">
                                                <span className="text-slate-500">已发送条数</span>
                                                <p className="font-mono tabular-nums">
                                                  {perfReportQ.data.producer.recordsSent != null
                                                    ? perfReportQ.data.producer.recordsSent.toLocaleString()
                                                    : "—"}
                                                </p>
                                              </div>
                                              <div className="rounded border border-slate-100 bg-slate-50/80 px-2 py-1.5">
                                                <span className="text-slate-500">延迟 avg / max</span>
                                                <p className="font-mono tabular-nums">
                                                  {perfReportQ.data.producer.avgLatencyMs?.toFixed?.(2) ?? "—"} /{" "}
                                                  {perfReportQ.data.producer.maxLatencyMs?.toFixed?.(2) ?? "—"} ms
                                                </p>
                                              </div>
                                              <div className="rounded border border-slate-100 bg-slate-50/80 px-2 py-1.5 sm:col-span-2 lg:col-span-1">
                                                <span className="text-slate-500">P50 / P95 / P99 / P99.9</span>
                                                <p className="font-mono tabular-nums">
                                                  {perfReportQ.data.producer.p50Ms ?? "—"} / {perfReportQ.data.producer.p95Ms ?? "—"} /{" "}
                                                  {perfReportQ.data.producer.p99Ms ?? "—"} / {perfReportQ.data.producer.p999Ms ?? "—"} ms
                                                </p>
                                              </div>
                                            </div>
                                          </div>
                                        ) : null}
                                        {perfReportQ.data.consumer ? (
                                          <div className="space-y-1">
                                            <p className="text-xs font-semibold text-slate-700">
                                              消费者
                                              {perfReportQ.data.status === "running" || perfReportQ.data.status === "pending" ? (
                                                <span className="ml-2 font-normal text-sky-700">（当前日志中的最新汇总）</span>
                                              ) : null}
                                            </p>
                                            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-xs">
                                              <div className="rounded border border-slate-100 bg-slate-50/80 px-2 py-1.5">
                                                <span className="text-slate-500">消费吞吐 / 带宽</span>
                                                <p className="font-mono tabular-nums">
                                                  {perfReportQ.data.consumer.mbPerSec?.toFixed?.(2) ?? "—"} MB/s
                                                  {perfReportQ.data.consumer.mbPerSec != null ? (
                                                    <span className="text-slate-500">
                                                      {" "}
                                                      （≈ {(perfReportQ.data.consumer.mbPerSec * 8).toFixed(2)} Mb/s）
                                                    </span>
                                                  ) : null}
                                                </p>
                                                <p className="mt-0.5 font-mono tabular-nums text-slate-600">
                                                  {perfReportQ.data.consumer.msgPerSec?.toFixed?.(0) ?? "—"} 条/s
                                                </p>
                                              </div>
                                              <div className="rounded border border-slate-100 bg-slate-50/80 px-2 py-1.5">
                                                <span className="text-slate-500">累计消费数据量</span>
                                                <p className="font-mono tabular-nums">
                                                  {perfReportQ.data.consumer.dataConsumedMB != null
                                                    ? `${perfReportQ.data.consumer.dataConsumedMB.toFixed(2)} MiB`
                                                    : "—"}
                                                </p>
                                                <p className="mt-0.5 text-[11px] text-slate-500">消息条数 {perfReportQ.data.consumer.messagesCount ?? "—"}</p>
                                              </div>
                                              <div className="rounded border border-slate-100 bg-slate-50/80 px-2 py-1.5">
                                                <span className="text-slate-500">Fetch MB/s</span>
                                                <p className="font-mono tabular-nums">{perfReportQ.data.consumer.fetchMBPerSec?.toFixed?.(2) ?? "—"}</p>
                                              </div>
                                            </div>
                                          </div>
                                        ) : null}
                                        {perfReportQ.data.rawLog &&
                                        (perfReportQ.data.status === "completed" ||
                                          perfReportQ.data.status === "failed" ||
                                          perfReportQ.data.status === "running" ||
                                          perfReportQ.data.status === "pending") ? (
                                          <details
                                            className="text-xs"
                                            open={
                                              perfReportQ.data.status === "running" ||
                                              perfReportQ.data.status === "pending" ||
                                              Boolean(perfReportQ.data.parseNote) ||
                                              perfReportQ.data.status === "failed"
                                            }
                                          >
                                            <summary className="cursor-pointer font-medium text-slate-700">原始日志（Pod 完整输出）</summary>
                                            <pre className="mt-2 max-h-64 overflow-auto rounded border border-slate-100 bg-slate-50 p-2 font-mono text-[10px] whitespace-pre-wrap break-all">
                                              {perfReportQ.data.rawLog}
                                            </pre>
                                          </details>
                                        ) : perfReportQ.data.status === "completed" && !perfReportQ.data.rawLog ? (
                                          <p className="text-xs text-slate-500">
                                            无 Pod 日志（可能读取失败或 Job 已过期被清理）。请查看上方错误说明或重新跑一次压测。
                                          </p>
                                        ) : null}
                                      </>
                                    ) : (
                                      <p className="text-sm text-slate-500">等待首次轮询…</p>
                                    )}
                                  </div>
                                ) : (
                                  <p className="text-xs text-slate-500">
                                    启动压测后将显示 Job、计划数据量与实时指标；运行中也会拉取 Pod 日志解析吞吐（约每 3 秒刷新），完成后为最终结果。
                                  </p>
                                )}
                              </CardContent>
                            </Card>
                          </TabsContent>

                          <TabsContent value="consumers" className="mt-0">
                            <Card className="min-h-[28rem] border-slate-200/80 shadow-sm">
                              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                                <div>
                                  <CardTitle className="text-base">消费者组</CardTitle>
                                  <CardDescription>DescribeGroups 摘要（含部分成员示例）</CardDescription>
                                </div>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => void qc.invalidateQueries({ queryKey: ["kafka-groups", instanceId] })}
                                >
                                  <RefreshCw className="mr-1 h-4 w-4" />
                                  刷新
                                </Button>
                              </CardHeader>
                              <CardContent>
                                <div className="overflow-auto rounded-lg border border-slate-100">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead className="min-w-[200px]">Group</TableHead>
                                        <TableHead>状态</TableHead>
                                        <TableHead>协议类型</TableHead>
                                        <TableHead>成员数</TableHead>
                                        <TableHead className="min-w-[220px]">成员示例</TableHead>
                                        <TableHead className="text-right w-[100px]">滞后</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {(groupsQ.data?.groups ?? []).map((g) => (
                                        <TableRow key={g.groupId}>
                                          <TableCell className="font-mono text-sm">{g.groupId}</TableCell>
                                          <TableCell className="text-sm">{g.state ?? "—"}</TableCell>
                                          <TableCell className="text-sm">{g.protocolType ?? "—"}</TableCell>
                                          <TableCell className="tabular-nums text-sm">{g.memberCount ?? 0}</TableCell>
                                          <TableCell className="text-xs text-slate-600">
                                            {(g.membersSample ?? [])
                                              .slice(0, 3)
                                              .map((m) => `${m.clientId ?? "?"} @ ${m.clientHost ?? "?"}`)
                                              .join(" · ") || "—"}
                                          </TableCell>
                                          <TableCell className="text-right">
                                            <Button
                                              size="sm"
                                              variant={selectedGroupLag === g.groupId ? "secondary" : "outline"}
                                              onClick={() => setSelectedGroupLag(g.groupId)}
                                            >
                                              查看
                                            </Button>
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                                {selectedGroupLag ? (
                                  <div className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <p className="text-sm font-medium text-slate-800">
                                        滞后：<span className="font-mono">{selectedGroupLag}</span>
                                      </p>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => void qc.invalidateQueries({ queryKey: ["kafka-group-lag", instanceId, selectedGroupLag] })}
                                      >
                                        <RefreshCw className="mr-1 h-4 w-4" />
                                        刷新
                                      </Button>
                                    </div>
                                    {groupLagQ.isLoading ? (
                                      <Loader2 className="h-5 w-5 animate-spin" />
                                    ) : (
                                      <>
                                        <p className="text-xs text-slate-600">
                                          状态 {groupLagQ.data?.state ?? "—"} · 协议 {groupLagQ.data?.protocol ?? "—"}
                                        </p>
                                        <div className="overflow-auto rounded-lg border border-slate-100 bg-white">
                                          <Table>
                                            <TableHeader>
                                              <TableRow>
                                                <TableHead>Topic</TableHead>
                                                <TableHead>分区</TableHead>
                                                <TableHead>已提交</TableHead>
                                                <TableHead>Log end</TableHead>
                                                <TableHead>滞后</TableHead>
                                              </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                              {(groupLagQ.data?.partitions ?? []).map((p, idx) => (
                                                <TableRow key={`${p.topic}-${p.partition}-${idx}`}>
                                                  <TableCell className="font-mono text-xs">{p.topic}</TableCell>
                                                  <TableCell className="tabular-nums">{p.partition}</TableCell>
                                                  <TableCell className="tabular-nums text-xs">{p.committed ?? "—"}</TableCell>
                                                  <TableCell className="tabular-nums text-xs">{p.logEnd ?? "—"}</TableCell>
                                                  <TableCell className="tabular-nums text-sm font-medium">{p.lag ?? "—"}</TableCell>
                                                </TableRow>
                                              ))}
                                            </TableBody>
                                          </Table>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                ) : null}
                              </CardContent>
                            </Card>
                          </TabsContent>

                          <TabsContent value="acl" className="mt-0">
                            <div className="space-y-4">
                              <Card className="border-slate-200/80 shadow-sm">
                                <CardHeader>
                                  <CardTitle className="text-base">Topic ACL 与客户端配额</CardTitle>
                                  <CardDescription>
                                    按用户（Principal）与 Topic 图形化授权；可选同步设置<strong>用户级配额限速</strong>（以{" "}
                                    <strong>MiB/s</strong> 填写，平台换算为 Kafka 字节/秒）。Topic 复制限速请用{" "}
                                    <Link className="font-medium text-sky-700 underline" to={`/cluster/apps/kafka/instance/${instanceId}/throttle`}>
                                      独立限速页
                                    </Link>
                                    。
                                  </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                  <div className="grid gap-4 lg:grid-cols-2">
                                    <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">1. 用户与 Topic</p>
                                      <div className="space-y-1.5">
                                        <Label className="text-xs">Kafka 用户名</Label>
                                        <Input
                                          className="font-mono text-sm"
                                          placeholder="例如 app-reader（自动加前缀 User:）"
                                          value={aclWUser}
                                          onChange={(e) => setAclWUser(e.target.value)}
                                        />
                                        <p className="text-[11px] text-slate-500">须与 SCRAM/PLAIN 中已有账号一致；新建请先到「SCRAM 用户」页创建。</p>
                                      </div>
                                      <div className="space-y-1.5">
                                        <Label className="text-xs">Topic</Label>
                                        <Input
                                          className="font-mono text-sm"
                                          placeholder="输入或从提示列表选取"
                                          value={aclWTopic}
                                          onChange={(e) => setAclWTopic(e.target.value)}
                                          list="kafka-acl-topic-suggest"
                                        />
                                        <datalist id="kafka-acl-topic-suggest">
                                          {(topicsQ.data?.topics ?? []).map((t) => (
                                            <option key={t.topic} value={t.topic} />
                                          ))}
                                        </datalist>
                                      </div>
                                      <div className="space-y-1.5">
                                        <Label className="text-xs">名称匹配方式</Label>
                                        <Select value={aclWPattern} onValueChange={(v) => setAclWPattern(v as "Literal" | "Prefixed")}>
                                          <SelectTrigger>
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="Literal">精确名称（Literal）</SelectItem>
                                            <SelectItem value="Prefixed">前缀匹配（Prefixed，如 orders-）</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <div className="space-y-1.5">
                                        <Label className="text-xs">来源 Host</Label>
                                        <Input className="font-mono text-sm" value={aclWHost} onChange={(e) => setAclWHost(e.target.value)} placeholder="*" />
                                      </div>
                                    </div>

                                    <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">2. 权限模板</p>
                                      <RadioGroup
                                        value={aclWRole}
                                        onValueChange={(v) => setAclWRole(v as "producer" | "consumer" | "both" | "custom")}
                                        className="grid gap-2"
                                      >
                                        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 has-[[data-state=checked]]:border-violet-400 has-[[data-state=checked]]:bg-violet-50/50">
                                          <RadioGroupItem value="consumer" id="acl-role-cons" className="mt-0.5" />
                                          <div>
                                            <span className="text-sm font-medium">消费者</span>
                                            <p className="text-[11px] text-slate-600">Read + Describe（订阅、消费消息）</p>
                                          </div>
                                        </label>
                                        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 has-[[data-state=checked]]:border-violet-400 has-[[data-state=checked]]:bg-violet-50/50">
                                          <RadioGroupItem value="producer" id="acl-role-prod" className="mt-0.5" />
                                          <div>
                                            <span className="text-sm font-medium">生产者</span>
                                            <p className="text-[11px] text-slate-600">Write + Describe（发送消息、元数据）</p>
                                          </div>
                                        </label>
                                        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 has-[[data-state=checked]]:border-violet-400 has-[[data-state=checked]]:bg-violet-50/50">
                                          <RadioGroupItem value="both" id="acl-role-both" className="mt-0.5" />
                                          <div>
                                            <span className="text-sm font-medium">生产 + 消费</span>
                                            <p className="text-[11px] text-slate-600">Write + Read + Describe</p>
                                          </div>
                                        </label>
                                        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 has-[[data-state=checked]]:border-violet-400 has-[[data-state=checked]]:bg-violet-50/50">
                                          <RadioGroupItem value="custom" id="acl-role-cust" className="mt-0.5" />
                                          <div className="flex-1">
                                            <span className="text-sm font-medium">自定义单条 Operation</span>
                                            <Select value={aclWCustomOp} onValueChange={setAclWCustomOp}>
                                              <SelectTrigger className="mt-2 h-9 font-mono text-xs">
                                                <SelectValue />
                                              </SelectTrigger>
                                              <SelectContent>
                                                {["Read", "Write", "Describe", "Create", "Delete", "Alter", "AlterConfigs", "DescribeConfigs", "IdempotentWrite"].map((op) => (
                                                  <SelectItem key={op} value={op}>
                                                    {op}
                                                  </SelectItem>
                                                ))}
                                              </SelectContent>
                                            </Select>
                                          </div>
                                        </label>
                                      </RadioGroup>
                                    </div>
                                  </div>

                                  <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div className="flex items-center gap-2">
                                        <Switch id="acl-sync-q" checked={aclWSyncQuota} onCheckedChange={setAclWSyncQuota} />
                                        <Label htmlFor="acl-sync-q" className="cursor-pointer text-sm font-medium text-slate-800">
                                          同步设置用户配额限速（MiB/s）
                                        </Label>
                                      </div>
                                      <span className="text-[11px] text-slate-600">对应 Kafka client quota：producer_byte_rate / consumer_byte_rate</span>
                                    </div>
                                    {aclWSyncQuota ? (
                                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                        <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                                          <Label className="text-xs">观测 / 期望峰值吞吐（MiB/s）</Label>
                                          <div className="flex flex-wrap gap-2">
                                            <Input
                                              className="max-w-[200px] font-mono text-sm"
                                              placeholder="例如压测报告中的 MB/s"
                                              value={aclWPeakMiB}
                                              onChange={(e) => setAclWPeakMiB(e.target.value)}
                                            />
                                            <Button
                                              type="button"
                                              size="sm"
                                              variant="secondary"
                                              onClick={() => {
                                                const peak = Number.parseFloat(aclWPeakMiB.trim());
                                                if (!Number.isFinite(peak) || peak <= 0) {
                                                  toast.error("请先填写有效的峰值 MiB/s（可与压测报告 MB/s 近似对照）");
                                                  return;
                                                }
                                                const c = peak * 0.5;
                                                setAclWProdMiB(c.toFixed(2));
                                                setAclWConsMiB(c.toFixed(2));
                                                toast.message("已套用保守配额：0.5× 峰值（生产/消费相同）");
                                              }}
                                            >
                                              保守 0.5×
                                            </Button>
                                            <Button
                                              type="button"
                                              size="sm"
                                              variant="secondary"
                                              onClick={() => {
                                                const peak = Number.parseFloat(aclWPeakMiB.trim());
                                                if (!Number.isFinite(peak) || peak <= 0) {
                                                  toast.error("请先填写有效的峰值 MiB/s");
                                                  return;
                                                }
                                                setAclWProdMiB(peak.toFixed(2));
                                                setAclWConsMiB((peak * 1.1).toFixed(2));
                                                toast.message("已套用推荐：生产≈峰值，消费≈1.1×（拉取略放宽）");
                                              }}
                                            >
                                              推荐 1× / 1.1×
                                            </Button>
                                            <Button
                                              type="button"
                                              size="sm"
                                              variant="secondary"
                                              onClick={() => {
                                                const peak = Number.parseFloat(aclWPeakMiB.trim());
                                                if (!Number.isFinite(peak) || peak <= 0) {
                                                  toast.error("请先填写有效的峰值 MiB/s");
                                                  return;
                                                }
                                                const v = peak * 1.5;
                                                setAclWProdMiB(v.toFixed(2));
                                                setAclWConsMiB((v * 1.1).toFixed(2));
                                                toast.message("已套用宽松：1.5× / 1.65×");
                                              }}
                                            >
                                              宽松 1.5×
                                            </Button>
                                          </div>
                                          <p className="text-[11px] text-slate-600">
                                            「M」按<strong>二进制 MiB/s</strong>（1024² 字节/秒）换算提交；压测工具里的 MB/s 数值常可近似填入。
                                          </p>
                                        </div>
                                        <div className="space-y-1.5">
                                          <Label className="text-xs">生产限速（MiB/s）</Label>
                                          <Input
                                            className="font-mono text-sm"
                                            placeholder="空 = 不限速"
                                            value={aclWProdMiB}
                                            onChange={(e) => setAclWProdMiB(e.target.value)}
                                          />
                                        </div>
                                        <div className="space-y-1.5">
                                          <Label className="text-xs">消费限速（MiB/s）</Label>
                                          <Input
                                            className="font-mono text-sm"
                                            placeholder="空 = 不限速"
                                            value={aclWConsMiB}
                                            onChange={(e) => setAclWConsMiB(e.target.value)}
                                          />
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>

                                  {aclWUser.trim() ? (
                                    <div className="rounded-lg border border-slate-100 bg-white px-3 py-2 text-xs text-slate-600">
                                      <span className="font-medium text-slate-800">当前用户配额快照</span>
                                      {(() => {
                                        const name = aclWUser.trim().replace(/^User:/i, "");
                                        const row = (quotasQ.data?.quotas ?? []).find((q) => q.user === name);
                                        if (!row) return <span className="ml-2">未配置或加载中</span>;
                                        return (
                                          <span className="ml-2 font-mono">
                                            生产 {quotaBytesToMibPerSec(row.producerByteRate)} MiB/s · 消费 {quotaBytesToMibPerSec(row.consumerByteRate)} MiB/s
                                          </span>
                                        );
                                      })()}
                                    </div>
                                  ) : null}

                                  <Collapsible open={aclWAdvancedOpen} onOpenChange={setAclWAdvancedOpen}>
                                    <CollapsibleTrigger asChild>
                                      <Button type="button" variant="ghost" size="sm" className="gap-1 px-0 text-slate-600">
                                        <ChevronDown className={cn("h-4 w-4 transition-transform", aclWAdvancedOpen && "rotate-180")} />
                                        删除说明与幂等生产者提示
                                      </Button>
                                    </CollapsibleTrigger>
                                    <CollapsibleContent className="space-y-2 text-[11px] text-slate-600">
                                      <p>
                                        删除 ACL 使用下方按钮，按当前向导中的 Topic / 用户 / Host 作为过滤器；Operation 选「非自定义」时为 Any，可一次删掉该用户在 Topic
                                        上多条 Allow。留空 Topic 会扩大匹配范围，请谨慎。
                                      </p>
                                      <p>
                                        若使用幂等生产者（idempotent），可能还需对 Cluster 资源授权 IdempotentWrite；请用自定义 Operation 单独添加或命令行 kafka-acls。
                                      </p>
                                    </CollapsibleContent>
                                  </Collapsible>

                                  <div className="flex flex-wrap gap-2">
                                    <Button
                                      size="sm"
                                      disabled={!canWrite || !clusterReady || aclBundleMut.isPending}
                                      onClick={() => aclBundleMut.mutate()}
                                    >
                                      {aclBundleMut.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                                      应用 ACL{aclWSyncQuota ? " 与配额" : ""}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-red-700"
                                      disabled={!canWrite || delAclMut.isPending}
                                      onClick={() => {
                                        if (
                                          !confirm(
                                            "按当前向导中的 Topic、用户、Host 作为过滤器删除匹配的 Allow ACL。\n若 Operation 为 Any，会删除该用户在 Topic 上的多条记录。\n留空 Topic 将匹配所有 Topic，极危险。确认？"
                                          )
                                        ) {
                                          return;
                                        }
                                        delAclMut.mutate();
                                      }}
                                    >
                                      删除匹配的 ACL
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        void qc.invalidateQueries({ queryKey: ["kafka-acls", instanceId] });
                                        void qc.invalidateQueries({ queryKey: ["kafka-quotas", instanceId] });
                                      }}
                                    >
                                      <RefreshCw className="mr-1 h-4 w-4" />
                                      刷新 ACL / 配额
                                    </Button>
                                  </div>
                                </CardContent>
                              </Card>

                              <Card className="border-slate-200/80 shadow-sm">
                                <CardHeader className="py-3">
                                  <CardTitle className="text-sm">当前 ACL 列表</CardTitle>
                                  <CardDescription className="text-xs">来自 DescribeACLs；operation 等为 Kafka 协议枚举值解析</CardDescription>
                                </CardHeader>
                                <CardContent className="p-0">
                                  <div className="overflow-auto">
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>资源</TableHead>
                                          <TableHead>名称 / 模式</TableHead>
                                          <TableHead>Principal</TableHead>
                                          <TableHead>Host</TableHead>
                                          <TableHead>Operation</TableHead>
                                          <TableHead>权限</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {(aclsQ.data?.acls ?? []).length === 0 ? (
                                          <TableRow>
                                            <TableCell colSpan={6} className="text-center text-xs text-slate-500">
                                              {aclsQ.isLoading ? "加载中…" : "暂无 ACL 或尚未加载"}
                                            </TableCell>
                                          </TableRow>
                                        ) : (
                                          (aclsQ.data?.acls ?? []).map((raw, idx) => {
                                            const a = raw as Record<string, unknown>;
                                            const rt = Number(a.resourceType);
                                            const pt = Number(a.resourcePatternType);
                                            const op = Number(a.operation);
                                            const perm = Number(a.permissionType);
                                            return (
                                              <TableRow key={idx}>
                                                <TableCell className="text-xs">{ACL_RESOURCE_LABEL[rt] ?? rt}</TableCell>
                                                <TableCell className="max-w-[200px]">
                                                  <div className="font-mono text-[11px] break-all">{String(a.resourceName ?? "—")}</div>
                                                  <Badge variant="outline" className="mt-1 text-[10px] font-normal">
                                                    {ACL_PATTERN_LABEL[pt] ?? pt}
                                                  </Badge>
                                                </TableCell>
                                                <TableCell className="max-w-[180px] break-all font-mono text-[11px]">{String(a.principal ?? "—")}</TableCell>
                                                <TableCell className="font-mono text-[11px]">{String(a.host ?? "—")}</TableCell>
                                                <TableCell className="text-xs">{ACL_OPERATION_LABEL[op] ?? op}</TableCell>
                                                <TableCell className="text-xs">{ACL_PERM_LABEL[perm] ?? perm}</TableCell>
                                              </TableRow>
                                            );
                                          })
                                        )}
                                      </TableBody>
                                    </Table>
                                  </div>
                                </CardContent>
                              </Card>
                            </div>
                          </TabsContent>

                          <TabsContent value="scram" className="mt-0">
                            <Card className="min-h-[20rem] border-slate-200/80 shadow-sm">
                              <CardHeader>
                                <CardTitle className="text-base">SCRAM 用户</CardTitle>
                                <CardDescription>
                                  仅 SCRAM-SHA-256 / SCRAM-SHA-512 集群可用；PLAIN 请用部署时的 KAFKA_CLIENT_USERS。
                                </CardDescription>
                              </CardHeader>
                              <CardContent className="space-y-4">
                                {!scramSupported ? (
                                  <p className="text-sm text-amber-800">当前实例为 PLAIN 或未识别机制，已禁用 SCRAM API。</p>
                                ) : (
                                  <>
                                    <div className="flex flex-wrap gap-2">
                                      <Input
                                        placeholder="用户名"
                                        value={scramUser}
                                        onChange={(e) => setScramUser(e.target.value)}
                                        className="max-w-[220px] text-sm"
                                      />
                                      <Input
                                        type="password"
                                        placeholder="密码"
                                        value={scramPass}
                                        onChange={(e) => setScramPass(e.target.value)}
                                        className="max-w-[220px] text-sm"
                                      />
                                      <Button size="sm" disabled={!canWrite} onClick={() => scramMut.mutate()}>
                                        创建/更新
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-red-700"
                                        disabled={!canWrite || delScramMut.isPending || !scramUser.trim()}
                                        onClick={() => {
                                          const u = scramUser.trim();
                                          if (!confirm(`删除 SCRAM 用户「${u}」？`)) return;
                                          delScramMut.mutate(u);
                                        }}
                                      >
                                        删除用户
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={!clusterReady}
                                        onClick={() => {
                                          void qc.invalidateQueries({ queryKey: ["kafka-acls", instanceId] });
                                          void qc.invalidateQueries({ queryKey: ["kafka-quotas", instanceId] });
                                        }}
                                      >
                                        <RefreshCw className="mr-1 h-4 w-4" />
                                        刷新权限数据
                                      </Button>
                                    </div>

                                    {scramKafkaUserName ? (
                                      <div className="space-y-4 border-t border-slate-100 pt-4">
                                        <div>
                                          <p className="text-xs font-medium text-slate-800">当前用户信息</p>
                                          <div className="mt-2 grid gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-xs text-slate-700 sm:grid-cols-2">
                                            <div>
                                              <span className="text-slate-500">Kafka Principal（ACL 用）</span>
                                              <div className="mt-0.5 flex flex-wrap items-center gap-1 font-mono text-[11px] text-slate-900">
                                                <span className="break-all">{scramKafkaPrincipal}</span>
                                                <Button
                                                  type="button"
                                                  variant="ghost"
                                                  size="sm"
                                                  className="h-7 px-2 text-slate-600"
                                                  onClick={() => void navigator.clipboard.writeText(scramKafkaPrincipal)}
                                                >
                                                  <Copy className="h-3.5 w-3.5" />
                                                </Button>
                                              </div>
                                            </div>
                                            <div>
                                              <span className="text-slate-500">集群客户端 SASL 机制</span>
                                              <div className="mt-0.5 font-mono text-[11px] text-slate-900">{instSaslMech}</div>
                                            </div>
                                            <div className="sm:col-span-2">
                                              <span className="text-slate-500">客户端配额（DescribeClientQuotas）</span>
                                              <div className="mt-0.5 font-mono text-[11px] text-slate-900">
                                                {quotasQ.isLoading ? (
                                                  "加载中…"
                                                ) : scramQuotaRow ? (
                                                  <>
                                                    生产 {quotaBytesToMibPerSec(scramQuotaRow.producerByteRate)} MiB/s · 消费{" "}
                                                    {quotaBytesToMibPerSec(scramQuotaRow.consumerByteRate)} MiB/s
                                                  </>
                                                ) : (
                                                  "未配置（不限速或尚未同步）"
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        </div>

                                        <div>
                                          <div className="flex flex-wrap items-end justify-between gap-2">
                                            <div>
                                              <p className="text-xs font-medium text-slate-800">该用户 ACL</p>
                                              <p className="text-[11px] text-slate-500">
                                                与「ACL」页同源（DescribeACLs），按 Principal 与上方登录名匹配
                                              </p>
                                            </div>
                                          </div>
                                          <div className="mt-2 overflow-auto rounded-lg border border-slate-100">
                                            <Table>
                                              <TableHeader>
                                                <TableRow className="hover:bg-transparent">
                                                  <TableHead className="text-xs">资源</TableHead>
                                                  <TableHead className="text-xs">名称 / 匹配</TableHead>
                                                  <TableHead className="text-xs">Principal</TableHead>
                                                  <TableHead className="text-xs">Host</TableHead>
                                                  <TableHead className="text-xs">Operation</TableHead>
                                                  <TableHead className="text-xs">Allow/Deny</TableHead>
                                                </TableRow>
                                              </TableHeader>
                                              <TableBody>
                                                {aclsQ.isLoading ? (
                                                  <TableRow>
                                                    <TableCell colSpan={6} className="text-center text-xs text-slate-500">
                                                      加载 ACL…
                                                    </TableCell>
                                                  </TableRow>
                                                ) : scramUserAclsForPrincipal.length === 0 ? (
                                                  <TableRow>
                                                    <TableCell colSpan={6} className="text-center text-xs text-slate-500">
                                                      暂无匹配 ACL。新建 SCRAM 用户后通常需在「ACL」页对该 Principal 授权 Topic 等权限。
                                                    </TableCell>
                                                  </TableRow>
                                                ) : (
                                                  scramUserAclsForPrincipal.map((raw, idx) => {
                                                    const rt = Number(raw.resourceType);
                                                    const pt = Number(raw.resourcePatternType);
                                                    const op = Number(raw.operation);
                                                    const perm = Number(raw.permissionType);
                                                    return (
                                                      <TableRow key={idx}>
                                                        <TableCell className="text-xs">{ACL_RESOURCE_LABEL[rt] ?? rt}</TableCell>
                                                        <TableCell className="max-w-[200px]">
                                                          <div className="font-mono text-[11px] break-all">
                                                            {String(raw.resourceName ?? "—")}
                                                          </div>
                                                          <Badge variant="outline" className="mt-1 text-[10px] font-normal">
                                                            {ACL_PATTERN_LABEL[pt] ?? pt}
                                                          </Badge>
                                                        </TableCell>
                                                        <TableCell className="max-w-[180px] break-all font-mono text-[11px]">
                                                          {String(raw.principal ?? "—")}
                                                        </TableCell>
                                                        <TableCell className="font-mono text-[11px]">{String(raw.host ?? "—")}</TableCell>
                                                        <TableCell className="text-xs">{ACL_OPERATION_LABEL[op] ?? op}</TableCell>
                                                        <TableCell className="text-xs">{ACL_PERM_LABEL[perm] ?? perm}</TableCell>
                                                      </TableRow>
                                                    );
                                                  })
                                                )}
                                              </TableBody>
                                            </Table>
                                          </div>
                                        </div>
                                      </div>
                                    ) : (
                                      <p className="text-xs text-slate-500">
                                        填写用户名后，展示 Kafka Principal、客户端配额摘要，以及 DescribeACLs 中该 Principal 的 ACL 行（与「ACL」页列表一致，可按需刷新）。
                                      </p>
                                    )}
                                  </>
                                )}
                              </CardContent>
                            </Card>
                          </TabsContent>
                        </Tabs>
                      )}
                    </>

        </div>
      ) : null}

      {!isInstanceDetailPage ? (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-800 shadow-sm">
                <Layers className="h-6 w-6" aria-hidden />
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-slate-900">Kafka</h1>
                <p className="text-sm text-slate-500">
                  实例列表与部署模版；Topic、ACL 等在「管理配置」页；Topic/用户限速在独立「限速」页，保存后会读回校验再提示成功。
                </p>
              </div>
            </div>
          </div>

          <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as typeof mainTab)}>
        <TabsList className="h-11 flex-wrap gap-1">
          <TabsTrigger value="instances" className="gap-1.5">
            <Server className="h-4 w-4" />
            实例列表
          </TabsTrigger>
          <TabsTrigger value="deploy">部署新集群</TabsTrigger>
          <TabsTrigger value="templates">部署模版</TabsTrigger>
        </TabsList>

        <TabsContent value="instances" className="mt-4 space-y-4">
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Kafka 实例</CardTitle>
              <CardDescription>选择一行查看滚动部署状态；全部就绪后可管理 Topic、消费者组与 ACL。</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead>名称</TableHead>
                    <TableHead>命名空间</TableHead>
                    <TableHead>部署名</TableHead>
                    <TableHead>SASL</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                    <TableHead className="w-[100px] text-right">删除</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {                    instances.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-slate-500">
                        暂无实例，请先在「部署新集群」创建。
                      </TableCell>
                    </TableRow>
                  ) : (
                    instances.map((i) => {
                      const c = i.config;
                      const sm = cfgStr(c, "saslMechanism") || "SCRAM-SHA-512";
                      return (
                        <TableRow key={i.id}>
                          <TableCell className="font-medium">{i.name}</TableCell>
                          <TableCell className="font-mono text-xs">{cfgStr(c, "namespace")}</TableCell>
                          <TableCell className="font-mono text-xs">{cfgStr(c, "baseName")}</TableCell>
                          <TableCell className="text-xs">{sm}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-wrap justify-end gap-1">
                              <Button size="sm" variant="outline" asChild>
                                <Link to={`/cluster/apps/kafka/instance/${i.id}`}>管理配置</Link>
                              </Button>
                              <Button size="sm" variant="secondary" asChild>
                                <Link to={`/cluster/apps/kafka/instance/${i.id}/throttle`}>限速</Link>
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600"
                              disabled={!canWrite}
                              onClick={() => {
                                setDeleteTarget(i);
                                setDeleteDlgOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="border-slate-100 bg-slate-50/50 shadow-sm">
            <CardContent className="py-6 text-sm text-slate-600">
              在列表中点击「管理配置」打开配置页；点击「限速」进入独立限速页（含读回校验）。部署成功后也会自动跳转到配置页。
            </CardContent>
          </Card>

        </TabsContent>

        <TabsContent value="deploy" className="mt-4 space-y-4">
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">部署新集群</CardTitle>
              <CardDescription>与云主机类似：先选命名空间与模版，再提交到当前连接的 Kubernetes。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="list-disc space-y-1 pl-5 text-xs text-slate-600">
                {hints.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>命名空间</Label>
                  <Select value={ns} onValueChange={setNs}>
                    <SelectTrigger className="font-mono text-sm">
                      <SelectValue placeholder="选择命名空间" />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      {namespaces.map((n) => (
                        <SelectItem key={n} value={n}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {nsQ.isError ? <p className="text-xs text-amber-700">命名空间列表加载失败，可稍后重试或手动在集群创建 NS。</p> : null}
                </div>
                <div className="space-y-1.5">
                  <Label>部署名（{`{名}-zk`} / {`{名}-kafka`}）</Label>
                  <Input value={base} onChange={(e) => setBase(e.target.value)} className="font-mono text-sm" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>部署模版</Label>
                  <Select value={tplId > 0 ? String(tplId) : ""} onValueChange={(v) => setTplId(Number.parseInt(v, 10) || 0)}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择模版…" />
                    </SelectTrigger>
                    <SelectContent>
                      {tplOptions.map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>SASL 机制（集群内为 SASL_PLAINTEXT + 所选机制）</Label>
                  <Select value={saslMech} onValueChange={setSaslMech}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SASL_MECH_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>StorageClass（可选）</Label>
                  <Input value={sc} onChange={(e) => setSc(e.target.value)} className="text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label>SASL 用户名</Label>
                  <Input value={saslUser} onChange={(e) => setSaslUser(e.target.value)} className="text-sm" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>SASL 密码（留空则随机生成并在响应中返回）</Label>
                  <Input type="password" value={saslPass} onChange={(e) => setSaslPass(e.target.value)} className="text-sm" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>附加 KAFKA_CFG_*（每行一条）</Label>
                  <Textarea value={extraLines} onChange={(e) => setExtraLines(e.target.value)} rows={4} className="font-mono text-xs" />
                </div>
              </div>
              <Button disabled={!canWrite || deployMut.isPending || tplId <= 0} onClick={() => deployMut.mutate()}>
                {deployMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                部署到集群
              </Button>
              {!canWrite ? <p className="text-xs text-slate-500">当前账号无应用中心写权限，无法部署。</p> : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-600">镜像、Busybox、副本与默认 SASL 等，可反复用于部署。</p>
            <Button size="sm" variant="outline" onClick={openNewTpl} disabled={!canWrite}>
              <Plus className="mr-1 h-4 w-4" />
              新建模版
            </Button>
          </div>
          <Card className="border-slate-200/80 shadow-sm">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>名称</TableHead>
                    <TableHead className="hidden lg:table-cell">Busybox</TableHead>
                    <TableHead>ZooKeeper</TableHead>
                    <TableHead>Kafka</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tplOptions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-slate-500">
                        暂无模版
                      </TableCell>
                    </TableRow>
                  ) : (
                    tplOptions.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">{t.name}</TableCell>
                        <TableCell className="hidden max-w-[180px] truncate font-mono text-[11px] lg:table-cell">
                          {t.config.busyboxImage ?? "—"}
                        </TableCell>
                        <TableCell className="max-w-[160px] truncate font-mono text-[11px]">{t.config.zookeeperImage}</TableCell>
                        <TableCell className="max-w-[160px] truncate font-mono text-[11px]">{t.config.kafkaImage}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(t)} disabled={!canWrite}>
                            编辑
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600"
                            onClick={() => {
                              if (confirm(`删除模版「${t.name}」？`)) delTpl.mutate(t.id);
                            }}
                            disabled={!canWrite}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
        </>
      ) : null}

      <Dialog
        open={deleteDlgOpen}
        onOpenChange={(o) => {
          setDeleteDlgOpen(o);
          if (!o) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除 Kafka 实例</DialogTitle>
            <DialogDescription>
              将删除 MySQL 中的实例登记，并<strong>同步删除</strong>集群内同名{" "}
              <code className="rounded bg-slate-100 px-1">ZooKeeper StatefulSet</code>、
              <code className="rounded bg-slate-100 px-1">Kafka StatefulSet</code>、Headless Service 及带平台标签的 PVC。此操作不可恢复。
            </DialogDescription>
          </DialogHeader>
          {deleteTarget ? (
            <p className="text-sm text-slate-700">
              <span className="font-medium">{deleteTarget.name}</span>
              <span className="ml-2 font-mono text-xs text-slate-500">
                {cfgStr(deleteTarget.config, "namespace")}/{cfgStr(deleteTarget.config, "baseName")}
              </span>
            </p>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setDeleteDlgOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!deleteTarget || !canWrite || delInstMut.isPending}
              onClick={() => {
                if (deleteTarget) delInstMut.mutate(deleteTarget.id);
              }}
            >
              {delInstMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dlg} onOpenChange={setDlg}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑模版" : "新建模版"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <Label>名称</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>说明</Label>
              <Input value={formDesc} onChange={(e) => setFormDesc(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>ZooKeeper 镜像</Label>
              <Input
                className="font-mono text-xs"
                value={formCfg.zookeeperImage}
                onChange={(e) => setFormCfg((c) => ({ ...c, zookeeperImage: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Kafka 镜像（bitnamilegacy，ZK 模式）</Label>
              <Input
                className="font-mono text-xs"
                value={formCfg.kafkaImage}
                onChange={(e) => setFormCfg((c) => ({ ...c, kafkaImage: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Busybox 镜像（ZK init 写 myid）</Label>
              <Input
                className="font-mono text-xs"
                value={formCfg.busyboxImage ?? ""}
                onChange={(e) => setFormCfg((c) => ({ ...c, busyboxImage: e.target.value }))}
                placeholder="docker.io/library/busybox:1.36.1"
              />
              <p className="text-[11px] text-slate-500">
                若 docker.io 被镜像站拦截，请换私有仓库或可在节点配置 registry mirror。
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">ZK 副本</Label>
                <Input
                  type="number"
                  value={formCfg.zkReplicas ?? 3}
                  onChange={(e) => setFormCfg((c) => ({ ...c, zkReplicas: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Kafka 副本</Label>
                <Input
                  type="number"
                  value={formCfg.kafkaReplicas ?? 3}
                  onChange={(e) => setFormCfg((c) => ({ ...c, kafkaReplicas: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">ZooKeeper 盘 / 副本（PVC）</Label>
                <Input
                  className="font-mono text-xs"
                  placeholder="20Gi"
                  value={formCfg.zkStorageSize ?? ""}
                  onChange={(e) => setFormCfg((c) => ({ ...c, zkStorageSize: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Kafka 盘 / 副本（PVC）</Label>
                <Input
                  className="font-mono text-xs"
                  placeholder="100Gi"
                  value={formCfg.kafkaStorageSize ?? ""}
                  onChange={(e) => setFormCfg((c) => ({ ...c, kafkaStorageSize: e.target.value }))}
                />
              </div>
            </div>
            <p className="text-[11px] text-slate-500">
              与 Kafka 相同：StatefulSet 自动为每个 Pod 创建持久卷声明；ZK 数据与事务日志均在同一 data 卷（/data、/data/datalog）。
            </p>
            <div className="space-y-1">
              <Label className="text-xs">附加 KAFKA_CFG（每行）</Label>
              <Textarea value={extraTplLines} onChange={(e) => setExtraTplLines(e.target.value)} rows={4} className="font-mono text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlg(false)}>
              取消
            </Button>
            <Button onClick={() => saveTpl.mutate()} disabled={saveTpl.isPending || !formName.trim()}>
              {saveTpl.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export function AppCenterKafkaListPage() {
  return <AppCenterKafkaInner />;
}

export function AppCenterKafkaInstancePage() {
  const { id } = useParams();
  const nid = Number.parseInt(id ?? "0", 10);
  if (!Number.isFinite(nid) || nid <= 0) {
    return <Navigate to="/cluster/apps/kafka" replace />;
  }
  return <AppCenterKafkaInner routeInstanceId={nid} />;
}

export default AppCenterKafkaListPage;

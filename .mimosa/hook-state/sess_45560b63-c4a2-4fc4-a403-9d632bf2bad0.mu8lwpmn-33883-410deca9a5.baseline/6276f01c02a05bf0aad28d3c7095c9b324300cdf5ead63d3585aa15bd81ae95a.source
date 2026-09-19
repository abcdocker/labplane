import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity, CheckCircle, ChevronDown, ChevronRight, Loader2,
  Pencil, Plus, RefreshCw, Trash2, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiDeleteJson, apiGetJson, apiPostJson, apiPutJson } from "@/lib/api";
import { useAuth } from "@/auth/auth-context";
import { toast } from "sonner";

type FailoverTask = {
  id: number; name: string; domainId: number; domainName: string; recordId: string;
  checkType: string; checkTarget: string; checkPort: number; checkPath: string;
  checkInterval: number; checkTimeout: number; maxErrors: number;
  failoverValue: string; originalValue: string;
  status: number; errorCount: number;
  lastCheckAt: string | null; lastStatus: string; createdBy: string; createdAt: string;
};
type FailoverLog = { id: number; taskId: number; action: string; oldValue: string; newValue: string; message: string; createdAt: string };
type Domain = { id: number; name: string };

function fmtErr(e: unknown) { return (e as Error).message ?? String(e); }

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  ok: { label: "正常", color: "bg-emerald-50 text-emerald-700" },
  error: { label: "异常", color: "bg-red-50 text-red-700" },
  unknown: { label: "未知", color: "bg-slate-50 text-slate-500" },
};

type FormState = {
  name: string; domainId: number; recordId: string;
  checkType: string; checkTarget: string; checkPort: number; checkPath: string;
  checkInterval: number; checkTimeout: number; maxErrors: number;
  failoverValue: string; originalValue: string; status: number;
};
const defaultForm = (): FormState => ({
  name: "", domainId: 0, recordId: "", checkType: "http", checkTarget: "", checkPort: 80,
  checkPath: "/", checkInterval: 60, checkTimeout: 10, maxErrors: 3,
  failoverValue: "", originalValue: "", status: 1,
});

export default function DnsFailover() {
  const { status: auth } = useAuth();
  const isViewer = auth?.role !== "admin";
  const qc = useQueryClient();

  const listQ = useQuery({
    queryKey: ["dns-failover"],
    queryFn: ({ signal }) => apiGetJson<{ tasks: FailoverTask[] }>("/api/dns/failover", { signal }),
  });
  const domainsQ = useQuery({
    queryKey: ["dns-domains"],
    queryFn: ({ signal }) => apiGetJson<{ domains: Domain[] }>("/api/dns/domains", { signal }),
  });
  const tasks = listQ.data?.tasks ?? [];
  const domains = domainsQ.data?.domains ?? [];

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editID, setEditID] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm());
  const [deleteID, setDeleteID] = useState<number | null>(null);
  const [logsOpen, setLogsOpen] = useState<number | null>(null);
  const [checkingID, setCheckingID] = useState<number | null>(null);

  const logsQ = useQuery({
    queryKey: ["dns-failover-logs", logsOpen],
    queryFn: ({ signal }) => apiGetJson<{ logs: FailoverLog[] }>(`/api/dns/failover/${logsOpen}/logs`, { signal }),
    enabled: logsOpen !== null,
  });

  const openCreate = () => { setEditID(null); setForm(defaultForm()); setDialogOpen(true); };
  const openEdit = (t: FailoverTask) => {
    setEditID(t.id);
    setForm({
      name: t.name, domainId: t.domainId, recordId: t.recordId,
      checkType: t.checkType, checkTarget: t.checkTarget, checkPort: t.checkPort,
      checkPath: t.checkPath, checkInterval: t.checkInterval, checkTimeout: t.checkTimeout,
      maxErrors: t.maxErrors, failoverValue: t.failoverValue, originalValue: t.originalValue,
      status: t.status,
    });
    setDialogOpen(true);
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      if (editID !== null) return apiPutJson(`/api/dns/failover/${editID}`, form);
      return apiPostJson("/api/dns/failover", form);
    },
    onSuccess: () => {
      toast.success(editID !== null ? "任务已更新" : "监测任务已创建");
      setDialogOpen(false);
      void qc.invalidateQueries({ queryKey: ["dns-failover"] });
    },
    onError: (e) => toast.error(fmtErr(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiDeleteJson(`/api/dns/failover/${id}`),
    onSuccess: () => { toast.success("任务已删除"); setDeleteID(null); void qc.invalidateQueries({ queryKey: ["dns-failover"] }); },
    onError: (e) => toast.error(fmtErr(e)),
  });

  const doCheck = async (id: number) => {
    setCheckingID(id);
    try {
      const r = await apiPostJson<{ ok: boolean; message: string }>(`/api/dns/failover/${id}/check`, {});
      toast[r.ok ? "success" : "error"](r.message);
      void qc.invalidateQueries({ queryKey: ["dns-failover"] });
    } catch (e) {
      toast.error(fmtErr(e));
    } finally {
      setCheckingID(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">健康监测 / 故障切换</h2>
          <p className="text-sm text-slate-500">配置 HTTP/TCP 探针，目标故障时自动切换 DNS 解析到备用地址</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["dns-failover"] })}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          {!isViewer && (
            <Button size="sm" onClick={openCreate} className="gap-1.5">
              <Plus className="h-4 w-4" /> 新建监测
            </Button>
          )}
        </div>
      </div>

      {tasks.length === 0 && !listQ.isLoading && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm text-slate-400">
          暂无监测任务
        </div>
      )}

      {tasks.length > 0 && (
        <div className="space-y-2">
          {tasks.map((t) => {
            const st = STATUS_MAP[t.lastStatus] ?? STATUS_MAP.unknown;
            return (
              <div key={t.id} className="rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-800">{t.name}</span>
                      <Badge variant="outline" className={`text-xs ${st.color}`}>
                        {t.status === 0 ? "已停用" : st.label}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {t.checkType.toUpperCase()}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {t.checkTarget} · 检测间隔 {t.checkInterval}s · 域名 {t.domainName} · 错误计数 {t.errorCount}/{t.maxErrors}
                    </p>
                    {t.lastCheckAt && (
                      <p className="mt-0.5 text-xs text-slate-400">
                        上次检测: {new Date(t.lastCheckAt).toLocaleString("zh-CN")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="outline" size="sm" disabled={checkingID === t.id}
                      onClick={() => void doCheck(t.id)}>
                      {checkingID === t.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Activity className="h-3.5 w-3.5" />}
                      <span className="ml-1.5 hidden sm:inline">立即检测</span>
                    </Button>
                    <Button variant="outline" size="sm"
                      onClick={() => setLogsOpen(logsOpen === t.id ? null : t.id)}>
                      {logsOpen === t.id ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      日志
                    </Button>
                    {!isViewer && (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700"
                          onClick={() => setDeleteID(t.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {/* Logs panel */}
                {logsOpen === t.id && (
                  <div className="border-t border-slate-100 px-4 py-3">
                    {logsQ.isLoading && <p className="text-xs text-slate-500">加载日志…</p>}
                    {(logsQ.data?.logs ?? []).length === 0 && !logsQ.isLoading && (
                      <p className="text-xs text-slate-400">暂无日志</p>
                    )}
                    <div className="space-y-1">
                      {(logsQ.data?.logs ?? []).map((log) => (
                        <div key={log.id} className="flex items-start gap-2 text-xs">
                          {log.action.includes("ok") || log.action === "manual_check"
                            ? <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                            : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />}
                          <span className="text-slate-400 shrink-0">
                            {new Date(log.createdAt).toLocaleString("zh-CN")}
                          </span>
                          <span className="text-slate-600">[{log.action}] {log.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              {editID !== null ? "编辑监测任务" : "新建监测任务"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="col-span-2 space-y-1.5">
              <Label>任务名称</Label>
              <Input placeholder="eg. 主站 HTTP 监测" value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>关联域名</Label>
              <Select value={form.domainId ? String(form.domainId) : ""}
                onValueChange={(v) => setForm((f) => ({ ...f, domainId: Number(v) }))}>
                <SelectTrigger><SelectValue placeholder="选择域名" /></SelectTrigger>
                <SelectContent>
                  {domains.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>解析记录 ID（可选）</Label>
              <Input placeholder="留空则切换主域名默认记录" value={form.recordId}
                onChange={(e) => setForm((f) => ({ ...f, recordId: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>检测类型</Label>
              <Select value={form.checkType} onValueChange={(v) => setForm((f) => ({ ...f, checkType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="http">HTTP</SelectItem>
                  <SelectItem value="https">HTTPS</SelectItem>
                  <SelectItem value="tcp">TCP</SelectItem>
                  <SelectItem value="ping">Ping</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>检测目标（IP 或域名）</Label>
              <Input placeholder="1.2.3.4 或 example.com" value={form.checkTarget}
                onChange={(e) => setForm((f) => ({ ...f, checkTarget: e.target.value }))} />
            </div>
            {(form.checkType === "tcp") && (
              <div className="space-y-1.5">
                <Label>端口</Label>
                <Input type="number" value={form.checkPort}
                  onChange={(e) => setForm((f) => ({ ...f, checkPort: Number(e.target.value) }))} />
              </div>
            )}
            {(form.checkType === "http" || form.checkType === "https") && (
              <div className="space-y-1.5">
                <Label>检测路径</Label>
                <Input placeholder="/" value={form.checkPath}
                  onChange={(e) => setForm((f) => ({ ...f, checkPath: e.target.value }))} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>检测间隔（秒）</Label>
              <Input type="number" min={10} value={form.checkInterval}
                onChange={(e) => setForm((f) => ({ ...f, checkInterval: Number(e.target.value) }))} />
            </div>
            <div className="space-y-1.5">
              <Label>超时（秒）</Label>
              <Input type="number" min={1} value={form.checkTimeout}
                onChange={(e) => setForm((f) => ({ ...f, checkTimeout: Number(e.target.value) }))} />
            </div>
            <div className="space-y-1.5">
              <Label>最大连续失败次数</Label>
              <Input type="number" min={1} value={form.maxErrors}
                onChange={(e) => setForm((f) => ({ ...f, maxErrors: Number(e.target.value) }))} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>原始解析值（正常时）</Label>
              <Input placeholder="正常 IP 或解析值" value={form.originalValue}
                onChange={(e) => setForm((f) => ({ ...f, originalValue: e.target.value }))} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>故障切换值</Label>
              <Input placeholder="备用 IP 或解析值" value={form.failoverValue}
                onChange={(e) => setForm((f) => ({ ...f, failoverValue: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending || !form.name || !form.checkTarget}>
              {saveMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteID !== null} onOpenChange={(o) => !o && setDeleteID(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除监测任务</AlertDialogTitle>
            <AlertDialogDescription>删除后将停止监测，相关日志也会保留，此操作无法撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <Button variant="destructive" onClick={() => deleteID !== null && deleteMut.mutate(deleteID)}>
              {deleteMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              删除
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

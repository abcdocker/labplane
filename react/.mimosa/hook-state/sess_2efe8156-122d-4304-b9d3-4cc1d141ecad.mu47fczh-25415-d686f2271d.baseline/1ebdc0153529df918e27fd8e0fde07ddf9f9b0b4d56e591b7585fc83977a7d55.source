import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiDeleteJson, apiGetJson, apiPostJson } from "@/lib/api";
import { useAuth } from "@/auth/auth-context";
import { toast } from "sonner";

type ScheduledTask = {
  id: number; name: string; domainId: number; domainName: string; recordId: string;
  action: string; newValue: string; scheduledAt: string;
  status: string; executedAt: string | null; message: string;
  createdBy: string; createdAt: string;
};
type Domain = { id: number; name: string };

function fmtErr(e: unknown) { return (e as Error).message ?? String(e); }

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  done: "bg-emerald-50 text-emerald-700",
  error: "bg-red-50 text-red-700",
};

const ACTION_LABELS: Record<string, string> = {
  pause: "暂停记录",
  enable: "启用记录",
  modify: "修改记录值",
  delete: "删除记录",
};

type FormState = {
  name: string; domainId: number; recordId: string;
  action: string; newValue: string; scheduledAt: string;
};
const defaultForm = (): FormState => ({
  name: "", domainId: 0, recordId: "", action: "modify", newValue: "",
  scheduledAt: new Date(Date.now() + 3600000).toISOString().slice(0, 16),
});

export default function DnsScheduled() {
  const { status: auth } = useAuth();
  const isViewer = auth?.role !== "admin";
  const qc = useQueryClient();

  const listQ = useQuery({
    queryKey: ["dns-scheduled"],
    queryFn: ({ signal }) => apiGetJson<{ tasks: ScheduledTask[] }>("/api/dns/scheduled", { signal }),
  });
  const domainsQ = useQuery({
    queryKey: ["dns-domains"],
    queryFn: ({ signal }) => apiGetJson<{ domains: Domain[] }>("/api/dns/domains", { signal }),
  });
  const tasks = listQ.data?.tasks ?? [];
  const domains = domainsQ.data?.domains ?? [];

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(defaultForm());
  const [deleteID, setDeleteID] = useState<number | null>(null);

  const saveMut = useMutation({
    mutationFn: () => apiPostJson("/api/dns/scheduled", {
      ...form,
      scheduledAt: form.scheduledAt.replace("T", " ") + ":00",
    }),
    onSuccess: () => {
      toast.success("定时任务已创建");
      setDialogOpen(false);
      void qc.invalidateQueries({ queryKey: ["dns-scheduled"] });
    },
    onError: (e) => toast.error(fmtErr(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiDeleteJson(`/api/dns/scheduled/${id}`),
    onSuccess: () => {
      toast.success("任务已删除");
      setDeleteID(null);
      void qc.invalidateQueries({ queryKey: ["dns-scheduled"] });
    },
    onError: (e) => toast.error(fmtErr(e)),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">定时任务</h2>
          <p className="text-sm text-slate-500">在指定时间自动暂停、启用或修改解析记录</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["dns-scheduled"] })}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          {!isViewer && (
            <Button size="sm" onClick={() => { setForm(defaultForm()); setDialogOpen(true); }} className="gap-1.5">
              <Plus className="h-4 w-4" /> 新建任务
            </Button>
          )}
        </div>
      </div>

      {tasks.length === 0 && !listQ.isLoading && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm text-slate-400">
          暂无定时任务
        </div>
      )}

      {tasks.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80">
                <TableHead>任务名</TableHead>
                <TableHead>域名</TableHead>
                <TableHead>操作</TableHead>
                <TableHead>执行时间</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>说明</TableHead>
                {!isViewer && <TableHead className="text-right">删除</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium text-slate-800">{t.name}</TableCell>
                  <TableCell className="text-sm text-slate-600">{t.domainName}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {ACTION_LABELS[t.action] ?? t.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">
                    {new Date(t.scheduledAt).toLocaleString("zh-CN")}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${STATUS_STYLES[t.status] ?? ""}`}>
                      {t.status === "pending" ? "待执行" : t.status === "done" ? "已执行" : "失败"}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-xs text-slate-500">
                    {t.message || (t.newValue ? `新值: ${t.newValue}` : "—")}
                  </TableCell>
                  {!isViewer && (
                    <TableCell className="text-right">
                      {t.status === "pending" && (
                        <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700"
                          onClick={() => setDeleteID(t.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              新建定时任务
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="col-span-2 space-y-1.5">
              <Label>任务名称</Label>
              <Input placeholder="eg. 节假日流量切换" value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>域名</Label>
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
              <Input placeholder="留空=操作域名" value={form.recordId}
                onChange={(e) => setForm((f) => ({ ...f, recordId: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>执行动作</Label>
              <Select value={form.action} onValueChange={(v) => setForm((f) => ({ ...f, action: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ACTION_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>执行时间</Label>
              <Input type="datetime-local" value={form.scheduledAt}
                onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))} />
            </div>
            {form.action === "modify" && (
              <div className="col-span-2 space-y-1.5">
                <Label>新记录值</Label>
                <Input placeholder="修改后的解析值" value={form.newValue}
                  onChange={(e) => setForm((f) => ({ ...f, newValue: e.target.value }))} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending || !form.name || !form.domainId}>
              {saveMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteID !== null} onOpenChange={(o) => !o && setDeleteID(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>取消定时任务</AlertDialogTitle>
            <AlertDialogDescription>确定要删除该定时任务吗？已执行的任务不受影响。</AlertDialogDescription>
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

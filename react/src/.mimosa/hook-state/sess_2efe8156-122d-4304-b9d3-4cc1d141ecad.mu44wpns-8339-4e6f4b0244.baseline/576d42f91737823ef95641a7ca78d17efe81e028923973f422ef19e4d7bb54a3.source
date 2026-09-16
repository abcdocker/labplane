import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, RefreshCw, Server, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiDeleteJson, apiGetJson, apiPostJson, apiPutJson } from "@/lib/api";
import { dnsLineDisplayLabel } from "@/pages/dns/dns-date-utils";
import { useAuth } from "@/auth/auth-context";
import { toast } from "sonner";

type Domain = { id: number; name: string; accountName: string; provider: string };
type DnsRecord = {
  id: string; domainId: number; recordType: string; host: string; line?: string;
  value: string; ttl: number; mxPriority: number; status: number; remark: string;
};

const RECORD_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA", "PTR"];

function fmtErr(e: unknown) { return (e as Error).message ?? String(e); }

type FormState = {
  recordType: string; host: string; line: string; value: string;
  ttl: number; mxPriority: number; remark: string;
};
const defaultForm = (): FormState => ({
  recordType: "A", host: "@", line: "", value: "", ttl: 600, mxPriority: 0, remark: "",
});

export default function DnsRecords() {
  const { status: auth } = useAuth();
  const isViewer = auth?.role !== "admin";
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const domainIdParam = searchParams.get("domainId");

  const domainsQ = useQuery({
    queryKey: ["dns-domains"],
    queryFn: ({ signal }) => apiGetJson<{ domains: Domain[] }>("/api/dns/domains", { signal }),
  });
  const domains = domainsQ.data?.domains ?? [];
  const [selectedDomainId, setSelectedDomainId] = useState<number>(domainIdParam ? Number(domainIdParam) : 0);

  useEffect(() => {
    if (domains.length > 0 && selectedDomainId === 0) {
      setSelectedDomainId(domains[0].id);
    }
  }, [domains, selectedDomainId]);

  useEffect(() => {
    if (domainIdParam) setSelectedDomainId(Number(domainIdParam));
  }, [domainIdParam]);

  const recordsQ = useQuery({
    queryKey: ["dns-records", selectedDomainId],
    queryFn: ({ signal }) => apiGetJson<{ records: DnsRecord[] }>(`/api/dns/domains/${selectedDomainId}/records`, { signal }),
    enabled: selectedDomainId > 0,
  });
  const records = recordsQ.data?.records ?? [];
  const [search, setSearch] = useState("");
  const filtered = records.filter(
    (r) =>
      !search ||
      r.host.toLowerCase().includes(search.toLowerCase()) ||
      (r.line ?? "").toLowerCase().includes(search.toLowerCase()) ||
      r.value.toLowerCase().includes(search.toLowerCase()) ||
      r.recordType.toLowerCase().includes(search.toLowerCase())
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<DnsRecord | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm());
  const [deleteRec, setDeleteRec] = useState<DnsRecord | null>(null);

  const openCreate = () => { setEditRecord(null); setForm(defaultForm()); setDialogOpen(true); };
  const openEdit = (r: DnsRecord) => {
    setEditRecord(r);
    setForm({
      recordType: r.recordType,
      host: r.host,
      line: r.line ?? "",
      value: r.value,
      ttl: r.ttl,
      mxPriority: r.mxPriority,
      remark: r.remark,
    });
    setDialogOpen(true);
  };

  const syncMut = useMutation({
    mutationFn: () => apiPostJson<{ message: string; count: number }>(`/api/dns/domains/${selectedDomainId}/records/sync`, {}),
    onSuccess: (r) => {
      toast.success(`${r.message}，共 ${r.count} 条记录`);
      void qc.invalidateQueries({ queryKey: ["dns-records", selectedDomainId] });
    },
    onError: (e) => toast.error(fmtErr(e)),
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      if (editRecord) {
        return apiPutJson(`/api/dns/domains/${selectedDomainId}/records/${editRecord.id}`, form);
      }
      return apiPostJson(`/api/dns/domains/${selectedDomainId}/records`, form);
    },
    onSuccess: () => {
      toast.success(editRecord ? "记录已更新" : "记录已添加");
      setDialogOpen(false);
      void qc.invalidateQueries({ queryKey: ["dns-records", selectedDomainId] });
    },
    onError: (e) => toast.error(fmtErr(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (r: DnsRecord) => apiDeleteJson(`/api/dns/domains/${selectedDomainId}/records/${r.id}`),
    onSuccess: () => {
      toast.success("记录已删除");
      setDeleteRec(null);
      void qc.invalidateQueries({ queryKey: ["dns-records", selectedDomainId] });
    },
    onError: (e) => toast.error(fmtErr(e)),
  });

  const toggleMut = useMutation({
    mutationFn: (r: DnsRecord) =>
      apiPostJson(`/api/dns/domains/${selectedDomainId}/records/${r.id}/status`, { enabled: r.status === 0 }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["dns-records", selectedDomainId] }),
    onError: (e) => toast.error(fmtErr(e)),
  });

  const selectedDomain = domains.find((d) => d.id === selectedDomainId);

  const recordFqdn = (host: string) => {
    const z = selectedDomain?.name ?? "";
    if (!z) return host;
    if (host === "@" || host === "") return z;
    return `${host}.${z}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">解析记录</h2>
          <p className="text-sm text-slate-500">管理域名的 A、CNAME、MX、TXT 等解析记录</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => syncMut.mutate()} disabled={!selectedDomainId || syncMut.isPending}>
            {syncMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-1.5 hidden sm:inline">从服务商同步</span>
          </Button>
          {!isViewer && (
            <Button size="sm" onClick={openCreate} disabled={!selectedDomainId} className="gap-1.5">
              <Plus className="h-4 w-4" /> 添加记录
            </Button>
          )}
        </div>
      </div>

      {/* Domain selector */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <Label className="shrink-0 text-sm">域名</Label>
          <Select
            value={selectedDomainId ? String(selectedDomainId) : ""}
            onValueChange={(v) => {
              setSelectedDomainId(Number(v));
              setSearchParams({ domainId: v });
            }}
          >
            <SelectTrigger className="w-52">
              <SelectValue placeholder="选择域名" />
            </SelectTrigger>
            <SelectContent>
              {domains.map((d) => (
                <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selectedDomain && (
          <span className="text-xs text-slate-500">{selectedDomain.accountName}</span>
        )}
        <div className="flex-1">
          <Input
            placeholder="搜索主机、值、类型…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </div>
      </div>

      {!selectedDomainId && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm text-slate-400">
          请先选择一个域名
        </div>
      )}
      {selectedDomainId > 0 && recordsQ.isLoading && <p className="text-sm text-slate-500">加载中…</p>}

      {filtered.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-200/90 bg-white shadow-sm">
          <Table className="min-w-[880px] text-[13px]">
            <TableHeader>
              <TableRow className="border-b border-slate-200/90 bg-[#f6f7fb] hover:bg-[#f6f7fb]">
                <TableHead className="h-10 w-[200px] font-medium text-slate-600">主机记录</TableHead>
                <TableHead className="h-10 w-[72px] font-medium text-slate-600">类型</TableHead>
                <TableHead className="h-10 w-[100px] font-medium text-slate-600">线路</TableHead>
                <TableHead className="min-w-[220px] font-medium text-slate-600">记录值</TableHead>
                <TableHead className="h-10 w-16 font-medium text-slate-600">TTL</TableHead>
                <TableHead className="h-10 w-14 font-medium text-slate-600">优先级</TableHead>
                <TableHead className="h-10 w-[88px] font-medium text-slate-600">状态</TableHead>
                <TableHead className="h-10 min-w-[100px] font-medium text-slate-600">备注</TableHead>
                {!isViewer && <TableHead className="h-10 w-[120px] text-right font-medium text-slate-600">操作</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r, idx) => (
                <TableRow
                  key={r.id}
                  className={idx % 2 === 0 ? "border-b border-slate-100/90 bg-white" : "border-b border-slate-100/90 bg-slate-50/40"}
                >
                  <TableCell className="align-top py-2.5">
                    <div className="font-mono text-sm font-medium text-slate-800">{r.host}</div>
                    <div className="mt-0.5 truncate text-xs text-slate-400" title={recordFqdn(r.host)}>
                      {recordFqdn(r.host)}
                    </div>
                  </TableCell>
                  <TableCell className="align-top py-2.5">
                    <span className="inline-flex rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-xs text-slate-700">
                      {r.recordType}
                    </span>
                  </TableCell>
                  <TableCell className="align-top py-2.5 text-slate-700">{dnsLineDisplayLabel(r.line)}</TableCell>
                  <TableCell className="max-w-[360px] align-top py-2.5">
                    <span className="break-all font-mono text-[12px] leading-snug text-slate-700">{r.value}</span>
                  </TableCell>
                  <TableCell className="align-top py-2.5 tabular-nums text-slate-600">{r.ttl}</TableCell>
                  <TableCell className="align-top py-2.5 tabular-nums text-slate-500">{r.mxPriority || "—"}</TableCell>
                  <TableCell className="align-top py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${r.status === 1 ? "bg-emerald-500" : "bg-slate-300"}`}
                      />
                      <span className={r.status === 1 ? "text-sm text-emerald-700" : "text-sm text-slate-500"}>
                        {r.status === 1 ? "正常" : "暂停"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[140px] align-top py-2.5 text-xs text-slate-500">{r.remark || "—"}</TableCell>
                  {!isViewer && (
                    <TableCell className="align-top py-2.5 text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => toggleMut.mutate(r)}>
                          {r.status === 1
                            ? <ToggleRight className="h-4 w-4 text-emerald-600" />
                            : <ToggleLeft className="h-4 w-4 text-slate-400" />}
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(r)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                          onClick={() => setDeleteRec(r)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {selectedDomainId > 0 && !recordsQ.isLoading && filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm text-slate-400">
          {search ? "无匹配记录" : "暂无解析记录，点击「从服务商同步」或「添加记录」"}
        </div>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              {editRecord ? "编辑解析记录" : "添加解析记录"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>记录类型</Label>
              <Select value={form.recordType}
                onValueChange={(v) => setForm((f) => ({ ...f, recordType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RECORD_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>主机记录</Label>
              <Input placeholder="@ 或 www 或 mail" value={form.host}
                onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>线路</Label>
              <Input
                placeholder="留空为默认；腾讯云/DNSPod 示例：默认、境内"
                value={form.line}
                onChange={(e) => setForm((f) => ({ ...f, line: e.target.value }))}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>记录值</Label>
              <Input placeholder="IP 地址、域名或文本" value={form.value}
                onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>TTL（秒）</Label>
              <Input type="number" min={1} value={form.ttl}
                onChange={(e) => setForm((f) => ({ ...f, ttl: Number(e.target.value) }))} />
            </div>
            {form.recordType === "MX" && (
              <div className="space-y-1.5">
                <Label>MX 优先级</Label>
                <Input type="number" min={0} value={form.mxPriority}
                  onChange={(e) => setForm((f) => ({ ...f, mxPriority: Number(e.target.value) }))} />
              </div>
            )}
            <div className="col-span-2 space-y-1.5">
              <Label>备注（可选）</Label>
              <Input value={form.remark}
                onChange={(e) => setForm((f) => ({ ...f, remark: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !form.host || !form.value}>
              {saveMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteRec !== null} onOpenChange={(o) => !o && setDeleteRec(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除解析记录</AlertDialogTitle>
            <AlertDialogDescription>
              将同时从服务商删除该记录（如 API 支持），此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <Button variant="destructive" onClick={() => deleteRec && deleteMut.mutate(deleteRec)}>
              {deleteMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              删除
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

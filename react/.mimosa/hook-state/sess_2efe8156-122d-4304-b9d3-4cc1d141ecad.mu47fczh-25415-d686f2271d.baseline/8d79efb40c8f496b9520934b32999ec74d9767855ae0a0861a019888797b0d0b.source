import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe, Loader2, Pencil, Plus, RefreshCw, Trash2, ExternalLink, CloudDownload } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiDeleteJson, apiGetJson, apiPostJson, apiPutJson } from "@/lib/api";
import { dnsEffectiveDateLabel } from "@/pages/dns/dns-date-utils";
import { useAuth } from "@/auth/auth-context";
import { toast } from "sonner";

type Account = { id: number; name: string; provider: string };
type Domain = {
  id: number; name: string; accountId: number; accountName: string;
  provider: string; icpBeian: string; expireAt: string | null; remark: string; createdBy: string; createdAt: string;
};

function fmtErr(e: unknown) { return (e as Error).message ?? String(e); }

type FormState = { name: string; accountId: number; icpBeian: string; expireAt: string; remark: string };
const defaultForm = (): FormState => ({ name: "", accountId: 0, icpBeian: "", expireAt: "", remark: "" });

const PROVIDER_LABELS: Record<string, string> = {
  cloudflare: "Cloudflare", aliyun: "阿里云", tencent: "腾讯云",
  dnspod: "DNSPod", dnspod_token: "DNSPod Token", manual: "手动",
};

export default function DnsDomains() {
  const { status: auth } = useAuth();
  const isViewer = auth?.role !== "admin";
  const qc = useQueryClient();

  const listQ = useQuery({
    queryKey: ["dns-domains"],
    queryFn: ({ signal }) => apiGetJson<{ domains: Domain[] }>("/api/dns/domains", { signal }),
  });
  const accountsQ = useQuery({
    queryKey: ["dns-accounts"],
    queryFn: ({ signal }) => apiGetJson<{ accounts: Account[] }>("/api/dns/accounts", { signal }),
  });
  const domains = listQ.data?.domains ?? [];
  const accounts = accountsQ.data?.accounts ?? [];

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editID, setEditID] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm());
  const [deleteID, setDeleteID] = useState<number | null>(null);
  const [syncingID, setSyncingID] = useState<number | null>(null);

  const openCreate = () => {
    setEditID(null);
    setForm(defaultForm());
    setDialogOpen(true);
  };
  const openEdit = (d: Domain) => {
    setEditID(d.id);
    setForm({
      name: d.name, accountId: d.accountId,
      icpBeian: d.icpBeian ?? "",
      expireAt: dnsEffectiveDateLabel(d.expireAt) ?? "",
      remark: d.remark ?? "",
    });
    setDialogOpen(true);
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      const body = { ...form };
      if (editID !== null) {
        return apiPutJson<{ domain: Domain; message: string }>(`/api/dns/domains/${editID}`, body);
      }
      return apiPostJson<{ id: number; message: string }>("/api/dns/domains", body);
    },
    onSuccess: async (res) => {
      const isEdit = editID !== null;
      toast.success(isEdit ? "域名已更新" : "域名已添加");
      setDialogOpen(false);
      if (isEdit && "domain" in res && res.domain) {
        const updated = res.domain;
        qc.setQueryData<{ domains: Domain[] }>(["dns-domains"], (old) => {
          if (!old) return old;
          return {
            domains: old.domains.map((d) => (d.id === editID ? updated : d)),
          };
        });
      }
      await qc.invalidateQueries({ queryKey: ["dns-domains"] });
    },
    onError: (e) => toast.error(fmtErr(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiDeleteJson(`/api/dns/domains/${id}`),
    onSuccess: () => {
      toast.success("域名已删除");
      setDeleteID(null);
      void qc.invalidateQueries({ queryKey: ["dns-domains"] });
    },
    onError: (e) => toast.error(fmtErr(e)),
  });

  const syncRecords = async (domainId: number) => {
    setSyncingID(domainId);
    try {
      const r = await apiPostJson<{ message: string; count: number }>(`/api/dns/domains/${domainId}/records/sync`, {});
      toast.success(`${r.message}，共 ${r.count} 条记录`);
      void qc.invalidateQueries({ queryKey: ["dns-records", domainId] });
    } catch (e) {
      toast.error(fmtErr(e));
    } finally {
      setSyncingID(null);
    }
  };

  const [syncingAllAccounts, setSyncingAllAccounts] = useState(false);
  const syncAllAccountDomains = async () => {
    if (accounts.length === 0) return;
    setSyncingAllAccounts(true);
    let totalAdded = 0;
    let totalDomains = 0;
    for (const acc of accounts) {
      try {
        const r = await apiPostJson<{ total: number; added: number }>(`/api/dns/accounts/${acc.id}/sync-domains`, {});
        totalAdded += r.added;
        totalDomains += r.total;
      } catch {
        // skip failed accounts silently
      }
    }
    setSyncingAllAccounts(false);
    toast.success(`同步完成：共 ${totalDomains} 个域名，新增 ${totalAdded} 个`);
    void qc.invalidateQueries({ queryKey: ["dns-domains"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">域名管理</h2>
          <p className="text-sm text-slate-500">添加并管理需要托管的域名，同步解析记录</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["dns-domains"] })}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          {!isViewer && (
            <Button
              variant="outline" size="sm"
              className="gap-1.5"
              disabled={syncingAllAccounts || accounts.length === 0}
              onClick={() => void syncAllAccountDomains()}
              title="从所有服务商账号拉取域名，自动补全域名列表"
            >
              {syncingAllAccounts
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <CloudDownload className="h-4 w-4" />}
              同步所有账号域名
            </Button>
          )}
          {!isViewer && (
            <Button size="sm" onClick={openCreate} className="gap-1.5">
              <Plus className="h-4 w-4" /> 添加域名
            </Button>
          )}
        </div>
      </div>

      {listQ.isLoading && <p className="text-sm text-slate-500">加载中…</p>}

      {domains.length === 0 && !listQ.isLoading && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm text-slate-400">
          暂无域名，先添加服务商账号后再添加域名
        </div>
      )}

      {domains.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80">
                <TableHead>域名</TableHead>
                <TableHead>服务商</TableHead>
                <TableHead>ICP备案</TableHead>
                <TableHead>到期日</TableHead>
                <TableHead>备注</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {domains.map((d) => {
                const expLabel = dnsEffectiveDateLabel(d.expireAt);
                const isExpiring =
                  !!expLabel && new Date(`${expLabel}T12:00:00`) < new Date(Date.now() + 30 * 86400000);
                return (
                  <TableRow key={d.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-slate-400" />
                        <span className="font-medium text-slate-800">{d.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {PROVIDER_LABELS[d.provider] ?? d.provider} · {d.accountName}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">{d.icpBeian || "—"}</TableCell>
                    <TableCell>
                      {expLabel ? (
                        <span className={isExpiring ? "text-sm font-medium text-red-600" : "text-sm text-slate-600"}>
                          {expLabel}
                          {isExpiring && " ⚠"}
                        </span>
                      ) : (
                        <span className="text-sm text-slate-400">未填写</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">{d.remark || "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button asChild variant="outline" size="sm" className="gap-1">
                          <Link to={`/cluster/apps/dns/records?domainId=${d.id}`}>
                            <ExternalLink className="h-3.5 w-3.5" /> 解析
                          </Link>
                        </Button>
                        <Button
                          variant="outline" size="sm"
                          disabled={syncingID === d.id}
                          onClick={() => void syncRecords(d.id)}
                        >
                          {syncingID === d.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <RefreshCw className="h-3.5 w-3.5" />}
                        </Button>
                        {!isViewer && (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => openEdit(d)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700"
                              onClick={() => setDeleteID(d.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              {editID !== null ? "编辑域名" : "添加域名"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>域名</Label>
              <Input placeholder="example.com" value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>服务商账号</Label>
              <Select value={form.accountId ? String(form.accountId) : ""}
                onValueChange={(v) => setForm((f) => ({ ...f, accountId: Number(v) }))}>
                <SelectTrigger>
                  <SelectValue placeholder="选择服务商账号" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.name} ({PROVIDER_LABELS[a.provider] ?? a.provider})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {accounts.length === 0 && (
                <p className="text-xs text-amber-600">请先在「服务商账号」页面添加账号</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>ICP备案号（可选）</Label>
                <Input placeholder="沪ICP备xxxxxxxx号" value={form.icpBeian}
                  onChange={(e) => setForm((f) => ({ ...f, icpBeian: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>到期日（可选）</Label>
                <Input type="date" value={form.expireAt}
                  onChange={(e) => setForm((f) => ({ ...f, expireAt: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>备注</Label>
              <Input placeholder="可选" value={form.remark}
                onChange={(e) => setForm((f) => ({ ...f, remark: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !form.name || !form.accountId}>
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
            <AlertDialogTitle>删除域名</AlertDialogTitle>
            <AlertDialogDescription>
              将同时删除该域名的所有本地解析记录缓存（不影响服务商实际记录），此操作无法撤销。
            </AlertDialogDescription>
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

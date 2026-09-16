import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, Plus, RefreshCw, Server, ShieldCheck, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { apiDeleteJson, apiGetJson, apiPatchJson, apiPostJson } from "@/lib/api";
import { dnsEffectiveDateLabel } from "@/pages/dns/dns-date-utils";
import { useAuth } from "@/auth/auth-context";
import { toast } from "sonner";

type CertOrder = {
  id: number; name: string; accountId: number;
  domains: string; email: string;
  status: string; certPem?: string; keyPem?: string;
  issuedAt: string | null; expireAt: string | null;
  autoRenew: boolean;
  baotaSiteName?: string;
  autoPushBaota?: boolean;
  createdBy: string; createdAt: string;
};

function fmtErr(e: unknown) { return (e as Error).message ?? String(e); }

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-slate-50 text-slate-600",
  applying: "bg-amber-50 text-amber-700",
  issued: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
  expired: "bg-orange-50 text-orange-700",
};
const STATUS_LABELS: Record<string, string> = {
  pending: "待申请", applying: "申请中", issued: "已签发", failed: "签发失败", expired: "已过期",
};

type FormState = {
  name: string; domains: string; email: string; autoRenew: boolean;
  baotaSiteName: string; autoPushBaota: boolean;
};
const defaultForm = (): FormState => ({
  name: "", domains: "", email: "", autoRenew: true,
  baotaSiteName: "", autoPushBaota: false,
});

export default function DnsCerts() {
  const { status: auth } = useAuth();
  const isViewer = auth?.role !== "admin";
  const qc = useQueryClient();

  const listQ = useQuery({
    queryKey: ["dns-certs"],
    queryFn: ({ signal }) => apiGetJson<{ certs: CertOrder[] }>("/api/dns/certs", { signal }),
  });
  const certs = listQ.data?.certs ?? [];

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(defaultForm());
  const [deleteID, setDeleteID] = useState<number | null>(null);
  const [viewCert, setViewCert] = useState<CertOrder | null>(null);
  const [applyingID, setApplyingID] = useState<number | null>(null);
  const [baotaDlg, setBaotaDlg] = useState<CertOrder | null>(null);
  const [baotaSiteDraft, setBaotaSiteDraft] = useState("");
  const [baotaPushDraft, setBaotaPushDraft] = useState(false);

  useEffect(() => {
    if (baotaDlg) {
      setBaotaSiteDraft((baotaDlg.baotaSiteName ?? "").trim());
      setBaotaPushDraft(!!baotaDlg.autoPushBaota);
    }
  }, [baotaDlg]);

  const saveMut = useMutation({
    mutationFn: () =>
      apiPostJson("/api/dns/certs", {
        name: form.name,
        domains: form.domains.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean),
        email: form.email,
        autoRenew: form.autoRenew,
        baotaSiteName: form.baotaSiteName.trim(),
        autoPushBaota: form.autoPushBaota,
      }),
    onSuccess: () => {
      toast.success("证书申请单已创建");
      setDialogOpen(false);
      void qc.invalidateQueries({ queryKey: ["dns-certs"] });
    },
    onError: (e) => toast.error(fmtErr(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiDeleteJson(`/api/dns/certs/${id}`),
    onSuccess: () => {
      toast.success("证书已删除");
      setDeleteID(null);
      void qc.invalidateQueries({ queryKey: ["dns-certs"] });
    },
    onError: (e) => toast.error(fmtErr(e)),
  });

  const patchBaotaMut = useMutation({
    mutationFn: async () => {
      if (!baotaDlg) throw new Error("未选择证书");
      await apiPatchJson(`/api/dns/certs/${baotaDlg.id}/baota`, {
        baotaSiteName: baotaSiteDraft.trim(),
        autoPushBaota: baotaPushDraft,
      });
    },
    onSuccess: () => {
      toast.success("宝塔关联已保存");
      setBaotaDlg(null);
      void qc.invalidateQueries({ queryKey: ["dns-certs"] });
    },
    onError: (e) => toast.error(fmtErr(e)),
  });

  const pushBaotaMut = useMutation({
    mutationFn: async () => {
      if (!baotaDlg) throw new Error("未选择证书");
      return apiPostJson<{ message: string }>(`/api/dns/certs/${baotaDlg.id}/push-baota`, {
        siteName: baotaSiteDraft.trim(),
      });
    },
    onSuccess: (r) => {
      toast.success(r.message ?? "已请求宝塔部署证书");
      void qc.invalidateQueries({ queryKey: ["dns-certs"] });
    },
    onError: (e) => toast.error(fmtErr(e)),
  });

  const applyCert = async (id: number) => {
    setApplyingID(id);
    try {
      const r = await apiPostJson<{ message: string }>(`/api/dns/certs/${id}/apply`, {});
      toast.info(r.message, { duration: 8000 });
      void qc.invalidateQueries({ queryKey: ["dns-certs"] });
    } catch (e) {
      toast.error(fmtErr(e));
    } finally {
      setApplyingID(null);
    }
  };

  const viewDetail = async (cert: CertOrder) => {
    if (cert.status === "issued") {
      try {
        const r = await apiGetJson<CertOrder>(`/api/dns/certs/${cert.id}`);
        setViewCert(r);
      } catch {
        setViewCert(cert);
      }
    }
  };

  const downloadCert = (cert: CertOrder) => {
    if (!cert.certPem) return;
    const blob = new Blob([cert.certPem], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${cert.name}.crt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadKey = (cert: CertOrder) => {
    if (!cert.keyPem) return;
    const blob = new Blob([cert.keyPem], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${cert.name}.key`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const parseDomains = (domainsJson: string): string => {
    try {
      const arr = JSON.parse(domainsJson) as string[];
      return Array.isArray(arr) ? arr.join(", ") : domainsJson;
    } catch {
      return domainsJson;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">SSL 证书</h2>
          <p className="text-sm text-slate-500">通过 DNS-01 验证申请 Let's Encrypt 免费 SSL 证书</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["dns-certs"] })}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          {!isViewer && (
            <Button size="sm" onClick={() => { setForm(defaultForm()); setDialogOpen(true); }} className="gap-1.5">
              <Plus className="h-4 w-4" /> 申请证书
            </Button>
          )}
        </div>
      </div>

      {/* Info banner */}
      <div className="space-y-2 rounded-xl border border-blue-100 bg-blue-50/80 px-4 py-3 text-sm text-blue-900">
        <p>
          <strong>DNS-01 验证</strong> — 证书申请将通过向 DNS 服务商自动添加 <code>_acme-challenge</code> TXT 记录完成验证。
          确保域名已绑定支持 API 写入的服务商账号（Cloudflare / 阿里云 / 腾讯云）。
        </p>
        <p className="border-t border-blue-200/60 pt-2 text-blue-950/90">
          <strong>宝塔 SSL</strong> — 已签发证书可在此页一键部署到宝塔网站（调用面板 API，与 Ingress 菜单无关）。
          需配置环境变量 <code>BAOTA_URL</code>、<code>BAOTA_API_KEY</code>；站点名须与宝塔「网站」列表中的名称一致。
        </p>
      </div>

      {certs.length === 0 && !listQ.isLoading && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm text-slate-400">
          暂无证书记录，点击「申请证书」开始
        </div>
      )}

      {certs.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80">
                <TableHead>名称</TableHead>
                <TableHead>域名</TableHead>
                <TableHead>邮箱</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>到期日</TableHead>
                <TableHead className="min-w-[120px]">宝塔站点</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {certs.map((cert) => {
                const expLbl = dnsEffectiveDateLabel(cert.expireAt);
                const isExpiring =
                  !!expLbl && new Date(`${expLbl}T12:00:00`) < new Date(Date.now() + 30 * 86400000);
                return (
                  <TableRow key={cert.id}>
                    <TableCell className="font-medium text-slate-800">{cert.name}</TableCell>
                    <TableCell className="max-w-[200px]">
                      <span className="truncate text-sm text-slate-600">{parseDomains(cert.domains)}</span>
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">{cert.email || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${STATUS_STYLES[cert.status] ?? ""}`}>
                        {STATUS_LABELS[cert.status] ?? cert.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {expLbl ? (
                        <span className={`text-sm ${isExpiring ? "font-medium text-red-600" : "text-slate-600"}`}>
                          {expLbl}
                          {isExpiring && " ⚠"}
                        </span>
                      ) : (
                        <span className="text-sm text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[140px]">
                      <span className="line-clamp-2 text-xs text-slate-600" title={cert.baotaSiteName ?? ""}>
                        {(cert.baotaSiteName ?? "").trim() || "—"}
                      </span>
                      {cert.autoPushBaota && (
                        <span className="mt-0.5 block text-[10px] text-teal-700">自动推送</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {cert.status !== "issued" && !isViewer && (
                          <Button variant="outline" size="sm" disabled={applyingID === cert.id}
                            onClick={() => void applyCert(cert.id)}>
                            {applyingID === cert.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Zap className="h-3.5 w-3.5" />}
                            <span className="ml-1.5 hidden sm:inline">申请</span>
                          </Button>
                        )}
                        {cert.status === "issued" && (
                          <Button variant="outline" size="sm" onClick={() => void viewDetail(cert)}>
                            <Download className="h-3.5 w-3.5" />
                            <span className="ml-1.5 hidden sm:inline">查看</span>
                          </Button>
                        )}
                        {!isViewer && (
                          <Button variant="outline" size="sm" className="gap-1" onClick={() => setBaotaDlg(cert)} title="宝塔 SSL 关联与部署">
                            <Server className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">宝塔</span>
                          </Button>
                        )}
                        {!isViewer && (
                          <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700"
                            onClick={() => setDeleteID(cert.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
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

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" /> 申请 SSL 证书
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>证书名称</Label>
              <Input placeholder="eg. 主站通配符证书" value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>域名列表</Label>
              <Textarea
                placeholder={"example.com\n*.example.com\nwww.example.com"}
                rows={3}
                value={form.domains}
                onChange={(e) => setForm((f) => ({ ...f, domains: e.target.value }))}
              />
              <p className="text-xs text-slate-500">每行一个或用逗号分隔，支持通配符 *.domain.com</p>
            </div>
            <div className="space-y-1.5">
              <Label>联系邮箱（Let's Encrypt 通知）</Label>
              <Input type="email" placeholder="admin@example.com" value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="auto-renew"
                checked={form.autoRenew}
                onCheckedChange={(v) => setForm((f) => ({ ...f, autoRenew: v }))}
              />
              <Label htmlFor="auto-renew" className="cursor-pointer">到期前自动续签</Label>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 space-y-3">
              <p className="text-xs font-medium text-slate-600">宝塔（可选）</p>
              <div className="space-y-1.5">
                <Label className="text-xs">默认部署站点名</Label>
                <Input
                  placeholder="与宝塔「网站」中的站点名一致，如 www.example.com"
                  value={form.baotaSiteName}
                  onChange={(e) => setForm((f) => ({ ...f, baotaSiteName: e.target.value }))}
                />
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  id="auto-push-baota-create"
                  checked={form.autoPushBaota}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, autoPushBaota: v }))}
                />
                <Label htmlFor="auto-push-baota-create" className="cursor-pointer text-xs leading-snug">
                  签发成功后自动推送到宝塔（需配置 BAOTA_URL / BAOTA_API_KEY；完整签发流程就绪后生效）
                </Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending || !form.name || !form.domains}>
              {saveMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              创建申请单
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Baota SSL */}
      <Dialog open={baotaDlg !== null} onOpenChange={(o) => !o && setBaotaDlg(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Server className="h-5 w-5 text-teal-600" /> 宝塔 SSL — {baotaDlg?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>宝塔站点名</Label>
              <Input
                placeholder="与面板「网站」列表中的名称一致"
                value={baotaSiteDraft}
                onChange={(e) => setBaotaSiteDraft(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="auto-push-baota-dlg"
                checked={baotaPushDraft}
                onCheckedChange={(v) => setBaotaPushDraft(v)}
              />
              <Label htmlFor="auto-push-baota-dlg" className="cursor-pointer text-sm leading-snug">
                签发成功后自动推送到宝塔（自动化签发就绪后生效）
              </Label>
            </div>
            <p className="text-xs text-slate-500">
              「立即部署」使用上方站点名；若为空则使用已保存的默认站点名。仅「已签发」状态可部署。
            </p>
          </div>
          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setBaotaDlg(null)}>关闭</Button>
            <Button
              variant="secondary"
              disabled={!baotaDlg || patchBaotaMut.isPending}
              onClick={() => patchBaotaMut.mutate()}
            >
              {patchBaotaMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              保存关联
            </Button>
            {baotaDlg?.status === "issued" && (
              <Button disabled={pushBaotaMut.isPending} onClick={() => pushBaotaMut.mutate()}>
                {pushBaotaMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                立即部署证书
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View cert dialog */}
      <Dialog open={viewCert !== null} onOpenChange={(o) => !o && setViewCert(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600" /> {viewCert?.name} — 证书文件
            </DialogTitle>
          </DialogHeader>
          {viewCert && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>证书（.crt / fullchain.pem）</Label>
                  <Button variant="ghost" size="sm" onClick={() => downloadCert(viewCert)}>
                    <Download className="h-4 w-4 mr-1" /> 下载
                  </Button>
                </div>
                <Textarea readOnly rows={6} className="font-mono text-xs" value={viewCert.certPem ?? ""} />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>私钥（.key）</Label>
                  <Button variant="ghost" size="sm" onClick={() => downloadKey(viewCert)}>
                    <Download className="h-4 w-4 mr-1" /> 下载
                  </Button>
                </div>
                <Textarea readOnly rows={6} className="font-mono text-xs" value={viewCert.keyPem ?? ""} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewCert(null)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteID !== null} onOpenChange={(o) => !o && setDeleteID(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除证书记录</AlertDialogTitle>
            <AlertDialogDescription>
              将删除本地证书记录及私钥，不影响已部署的证书。此操作无法撤销。
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

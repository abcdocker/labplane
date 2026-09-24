import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, AlertCircle, Server, HardDrive, Cloud, KeyRound, Database, Globe, Shield, Wallet } from "lucide-react";
import { apiGetJson } from "@/lib/api";
import { CloudAuthGuide } from "./CloudAuthGuide";

function fmtErr(e: unknown) {
  return (e as Error).message ?? String(e);
}

type AccountOverview = {
  accountId: number;
  accountName: string;
  appId: string;
  cvmCount: number;
  lighthouseCount: number;
  cosBucketCount: number;
  cdnDomainCount: number;
  camKeyCount: number;
};

export default function TencentCloudOverview() {
  const overviewQ = useQuery({
    queryKey: ["tencent-cloud-overview"],
    queryFn: ({ signal }) => apiGetJson<{ accounts: AccountOverview[] }>("/api/tencent-cloud/overview", { signal }),
  });

  const accounts = overviewQ.data?.accounts ?? [];
  const accId = accounts.length > 0 ? String(accounts[0].accountId) : "";
  const billingBalanceQ = useQuery({
    queryKey: ["tencent-cloud-billing-balance", accId],
    queryFn: ({ signal }) =>
      apiGetJson<{ balance: Record<string, unknown> }>(`/api/tencent-cloud/billing/balance?account_id=${accId}`, { signal }),
    enabled: accId !== "",
  });
  const billingMonth = new Date().toISOString().slice(0, 7);
  const billingSummaryQ = useQuery({
    queryKey: ["tencent-cloud-billing-summary", accId, billingMonth],
    queryFn: ({ signal }) =>
      apiGetJson<{ summary: { ProductList?: { ProductName?: string; RealTotalCost?: number }[]; RealTotalCost?: number } }>(
        `/api/tencent-cloud/billing/summary?account_id=${accId}&month=${billingMonth}`,
        { signal }
      ),
    enabled: accId !== "",
  });
  const balance = billingBalanceQ.data?.balance ?? {};
  const balanceYuan = (() => {
    const raw = Number(balance.Balance ?? 0);
    if (!Number.isFinite(raw) || raw === 0) return "—";
    return (raw / 100).toFixed(2);
  })();
  const products = (billingSummaryQ.data?.summary?.ProductList ?? []) as { ProductName?: string; RealTotalCost?: number }[];
  const monthCost = Number(billingSummaryQ.data?.summary?.RealTotalCost ?? 0);
  const topProducts = [...products].sort((a, b) => (b.RealTotalCost ?? 0) - (a.RealTotalCost ?? 0)).slice(0, 5);
  const totalCVM = accounts.reduce((s, a) => s + a.cvmCount, 0);
  const totalLH = accounts.reduce((s, a) => s + a.lighthouseCount, 0);
  const totalCOS = accounts.reduce((s, a) => s + a.cosBucketCount, 0);
  const totalCDN = accounts.reduce((s, a) => s + a.cdnDomainCount, 0);
  const totalCAM = accounts.reduce((s, a) => s + a.camKeyCount, 0);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">腾讯云全局预览</h2>
        <p className="text-sm text-slate-500">汇总所有已添加腾讯云账号的资源概况</p>
      </div>

      <CloudAuthGuide provider="tencent" />

      {overviewQ.isLoading && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> 加载中…
        </div>
      )}
      {overviewQ.isError && (
        <div className="flex items-center gap-2 text-sm text-red-600">
          <AlertCircle className="h-4 w-4" /> {fmtErr(overviewQ.error)}
        </div>
      )}

      {accounts.length > 0 && (
        <>
          <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3">
            <div>
              <p className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <Wallet className="h-4 w-4 text-amber-500" /> 账户可用余额
              </p>
              <p className="mt-1 text-xl font-semibold text-slate-800">
                {billingBalanceQ.isLoading ? "…" : balanceYuan === "—" ? "—" : `¥${balanceYuan}`}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">本月消费（{billingMonth}，按产品）</p>
              <p className="mt-1 text-xl font-semibold text-slate-800">
                {billingSummaryQ.isLoading ? "…" : monthCost > 0 ? `¥${monthCost.toFixed(2)}` : "—"}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500">消费 Top 产品</p>
              {topProducts.length === 0 ? (
                <p className="mt-1 text-xs text-slate-400">暂无数据</p>
              ) : (
                <ul className="mt-1 space-y-0.5 text-[11px] leading-relaxed text-slate-600">
                  {topProducts.map((p) => (
                    <li key={p.ProductName} className="flex justify-between gap-2 truncate">
                      <span className="truncate">{p.ProductName || "未知产品"}</span>
                      <span className="tabular-nums">¥{(p.RealTotalCost ?? 0).toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
                <Server className="h-4 w-4 text-blue-500" />
                云服务器 CVM
              </div>
              <p className="mt-2 text-2xl font-semibold text-slate-800">{totalCVM}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
                <Database className="h-4 w-4 text-violet-500" />
                轻量云
              </div>
              <p className="mt-2 text-2xl font-semibold text-slate-800">{totalLH}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
                <HardDrive className="h-4 w-4 text-emerald-500" />
                COS 存储桶
              </div>
              <p className="mt-2 text-2xl font-semibold text-slate-800">{totalCOS}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
                <Globe className="h-4 w-4 text-orange-500" />
                CDN 域名
              </div>
              <p className="mt-2 text-2xl font-semibold text-slate-800">{totalCDN}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
                <Shield className="h-4 w-4 text-rose-500" />
                CAM 密钥
              </div>
              <p className="mt-2 text-2xl font-semibold text-slate-800">{totalCAM}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
                <KeyRound className="h-4 w-4 text-amber-500" />
                账号数
              </div>
              <p className="mt-2 text-2xl font-semibold text-slate-800">{accounts.length}</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">账号名称</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">腾讯云 APPID（UIN）</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600">CVM</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600">轻量云</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600">COS 桶</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600">CDN 域名</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-600">CAM 密钥</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.accountId} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-800">{a.accountName}</td>
                    <td className="px-4 py-3 text-slate-600">{a.appId || "—"}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{a.cvmCount}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{a.lighthouseCount}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{a.cosBucketCount}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{a.cdnDomainCount}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{a.camKeyCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {accounts.length === 0 && !overviewQ.isLoading && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm text-slate-400">
          未配置腾讯云账号，请到 DNSPod → 账号管理 中添加
        </div>
      )}
    </div>
  );
}

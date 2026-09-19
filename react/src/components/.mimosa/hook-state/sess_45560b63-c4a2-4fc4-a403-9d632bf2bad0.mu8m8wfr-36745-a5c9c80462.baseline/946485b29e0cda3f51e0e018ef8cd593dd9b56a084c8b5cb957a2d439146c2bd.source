import React, { useState } from "react";
import { useAppConfig } from "@/hooks/use-app-config";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { YamlEditor } from "@/components/YamlEditor";
import { apiGetJson, apiPostJson, type AppConfig } from "@/lib/api";
import { defaultK8sIngressYamlExample } from "@/lib/buildK8sIngressYaml";
import IngressGraphicalForm from "@/components/IngressGraphicalForm";
import { ingressText } from "@/i18n/ingress";

interface PublishIngressProps {
  onApplied: () => void;
}

const PublishIngress: React.FC<PublishIngressProps> = ({ onApplied }) => {
  const queryClient = useQueryClient();
  const cfgQ = useAppConfig();

  const [yamlText, setYamlText] = useState(() => defaultK8sIngressYamlExample("default"));

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingYaml, setPendingYaml] = useState("");
  const [pendingSummary, setPendingSummary] = useState("");

  const applyYaml = async (content: string) => {
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await apiPostJson<{ message: string }>("/api/ingress/yaml", {
        yamlContent: content,
      });
      setMessage(res.message ?? "已应用");
      void queryClient.invalidateQueries({ queryKey: ["ingresses-all"] });
      onApplied();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const runConfirmedApply = () => {
    setConfirmOpen(false);
    void applyYaml(pendingYaml);
  };

  const defaultPortHint = cfgQ.data?.defaultPort ?? "38333";
  const httpsPortHint = String(cfgQ.data?.ingressNginxHostHttpsPort ?? cfgQ.data?.httpsPort ?? "443");
  const originScheme = cfgQ.data?.baotaUpstreamScheme === "https" ? "HTTPS" : "HTTP";
  const originHost = cfgQ.data?.baotaUpstreamHost?.trim() || cfgQ.data?.ddnsHost?.trim() || "未设置";
  const originPort = cfgQ.data?.baotaUpstreamPort?.trim() || (originScheme === "HTTPS" ? httpsPortHint : defaultPortHint);

  return (
    <div className="w-full min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:p-6">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">暴露新服务到公网</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{ingressText.publishSummary}</p>
          <details className="group mt-2 text-xs text-slate-500 dark:text-slate-400">
            <summary className="w-fit cursor-pointer select-none font-medium text-blue-700 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200">
              {ingressText.configurationDetails}
            </summary>
            <p className="mt-2 max-w-5xl rounded-lg bg-slate-50 p-3 leading-6 dark:bg-slate-900">
              勾选<strong>同步到宝塔</strong>后会添加 <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">baota-sync</code> 等注解。
              证书可使用全局默认或指定宝塔证书名，PEM/KEY 不会写入 Ingress。当前默认回源为{" "}
              <span className="break-all font-mono">{originScheme}://{originHost}:{originPort}</span>。
              YAML 模式仍兼容 <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">ddns-scheme</code> 与{" "}
              <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">ddns-port</code> 覆盖。
            </p>
          </details>
        </div>
      </div>

      <Tabs defaultValue="form" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="form">表单向导</TabsTrigger>
          <TabsTrigger value="yaml">YAML 模式</TabsTrigger>
        </TabsList>

        <TabsContent value="form">
          <IngressGraphicalForm
            idPrefix="publish-ingress"
            defaultBaotaSyncEnabled
            submitButtonText={submitting ? "下发中…" : "生成并下发 Ingress"}
            disabled={submitting}
            onValidationError={(m) => setMessage(m)}
            onPrepareApply={(yaml, summary) => {
              setPendingYaml(yaml);
              setPendingSummary(summary);
              setConfirmOpen(true);
            }}
          />
        </TabsContent>

        <TabsContent value="yaml">
          <p className="mb-2 text-sm text-slate-500">
            直接粘贴完整 Ingress YAML，提交后由服务端 Apply 到集群（与 README「方式二」一致）。
          </p>
          <div className="mb-3">
            <YamlEditor value={yamlText} onChange={setYamlText} height="min(45vh, 360px)" />
          </div>
          <Button
            type="button"
            disabled={submitting}
            onClick={() => {
              setPendingYaml(yamlText);
              setPendingSummary("YAML 模式：将按当前编辑框内容提交");
              setConfirmOpen(true);
            }}
          >
            {submitting ? "应用中…" : "应用 YAML"}
          </Button>
        </TabsContent>
      </Tabs>

      {message && (
        <p
          className={`mt-4 text-sm ${message.startsWith("YAML") || message.includes("成功") || message.includes("已应用") ? "text-emerald-700" : "text-red-600"}`}
        >
          {message}
        </p>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认下发到集群？</AlertDialogTitle>
            <AlertDialogDescription className="text-left text-slate-700">
              {pendingSummary}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <Button type="button" onClick={() => runConfirmedApply()}>
              确认下发
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PublishIngress;

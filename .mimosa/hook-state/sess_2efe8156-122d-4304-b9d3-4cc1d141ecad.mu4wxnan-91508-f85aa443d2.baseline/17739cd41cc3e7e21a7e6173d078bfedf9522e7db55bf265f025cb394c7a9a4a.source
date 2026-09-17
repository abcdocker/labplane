/** 与 PublishIngress / 集群 Ingress 创建向导共用的 Ingress YAML 生成逻辑 */

export type BuildK8sIngressYamlOpts = {
  name: string;
  namespace: string;
  domain: string;
  serviceName: string;
  port: number;
  enableBaotaSync: boolean;
  enableBaotaHttps: boolean;
  baotaSslCertName: string;
  customDdnsPort: string;
  ddnsScheme: "http" | "https";
  /** 多宝塔实例 id */
  baotaTargetId?: string;
};

export function buildK8sIngressYaml(opts: BuildK8sIngressYamlOpts): string {
  if (!opts.enableBaotaSync) {
    return `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${opts.name}
  namespace: ${opts.namespace}
  annotations:
    kubernetes.io/ingress.class: "nginx"
spec:
  ingressClassName: nginx
  rules:
  - host: ${opts.domain}
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: ${opts.serviceName}
            port:
              number: ${opts.port}
`;
  }
  const ddnsPort =
    opts.customDdnsPort.trim() !== ""
      ? `    kube-bt-sync.io/ddns-port: "${opts.customDdnsPort.trim()}"\n`
      : "";
  const ddnsScheme =
    opts.ddnsScheme === "https"
      ? '    kube-bt-sync.io/ddns-scheme: "https"\n'
      : "";
  const https =
    opts.enableBaotaHttps
      ? '    kube-bt-sync.io/baota-https: "true"\n'
      : "";
  const certName = opts.baotaSslCertName.trim();
  const useCertName = opts.enableBaotaHttps && certName !== "";
  const cert =
    useCertName
      ? `    kube-bt-sync.io/baota-ssl-cert-name: "${certName}"\n`
      : "";
  const tid = (opts.baotaTargetId ?? "").trim().replace(/"/g, "");
  const target =
    tid !== ""
      ? `    kube-bt-sync.io/baota-target: "${tid}"\n`
      : "";
  return `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${opts.name}
  namespace: ${opts.namespace}
  annotations:
    kubernetes.io/ingress.class: "nginx"
    kube-bt-sync.io/baota-sync: "true"
${target}${ddnsPort}${ddnsScheme}${https}${cert}spec:
  ingressClassName: nginx
  rules:
  - host: ${opts.domain}
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: ${opts.serviceName}
            port:
              number: ${opts.port}
`;
}

export function defaultK8sIngressYamlExample(namespace = "default"): string {
  return `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-app-ingress
  namespace: ${namespace}
  annotations:
    kubernetes.io/ingress.class: "nginx"
    kube-bt-sync.io/baota-sync: "true"
spec:
  ingressClassName: nginx
  rules:
  - host: app.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: my-app-svc
            port:
              number: 80
`;
}

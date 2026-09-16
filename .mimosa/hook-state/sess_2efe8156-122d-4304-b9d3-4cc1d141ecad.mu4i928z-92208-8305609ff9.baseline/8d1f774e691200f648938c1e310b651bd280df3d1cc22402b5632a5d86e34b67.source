import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { PlatformArchitectureDiagram } from "@/components/PlatformArchitectureDiagram";

/**
 * 全局右下角「使用文档」：汇总控制台主要功能与入口，便于随时查阅。
 * 浮动按钮挂到 document.body，避免主布局 overflow/transform 遮挡；z-index 高于常规内容。
 * 新增模块或权限字段时，请同步更新本文 `DocBody` / `DocToc`，保持与路由及后端一致。云主机预选软件（Docker/Nginx/宝塔/Hysteria2）行为以 `internal/cloud_vm_software.go` 为准，第七节说明需与之同步。〇 节架构图与 `PlatformArchitectureDiagram.tsx` 及 `deploy/deployment.yaml` 典型部署一致；ingress-nginx 与 **Kubernetes Dashboard + metrics-server** 一键安装（国内镜像、安装后自检）及 PVC 文件编辑器行为见第四节。第十三节与文档库编辑器、公开分享页、附件 COS 图形配置及监控中心内置图展示一致。
 */
export default function UserGuideSheet() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fab = (
    <Button
      type="button"
      variant="secondary"
      size="icon"
      onClick={() => setOpen(true)}
      className="pointer-events-auto fixed bottom-5 right-5 z-[60] h-12 w-12 rounded-full border border-slate-200/90 bg-white shadow-lg ring-1 ring-black/5 hover:bg-slate-50 md:bottom-6 md:right-6"
      aria-label="打开使用文档"
      title="使用文档"
    >
      <BookOpen className="h-5 w-5 text-slate-700" />
    </Button>
  );

  return (
    <>
      {mounted && !open && typeof document !== "undefined" ? createPortal(fab, document.body) : null}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="flex h-full w-full max-w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl md:max-w-2xl"
        >
          <SheetHeader className="shrink-0 space-y-1 border-b border-slate-100 bg-slate-50/90 px-6 py-4 text-left">
            <SheetTitle className="text-lg">使用文档</SheetTitle>
            <SheetDescription className="text-xs leading-relaxed">
              按模块梳理路由与常见操作；与侧栏「工作区」及子导航一致。<strong className="text-slate-800">〇</strong> 为典型{" "}
              <strong className="text-slate-800">K8s Pod 部署架构图</strong>及 ingress-nginx hostNetwork、<strong className="text-slate-800">Dashboard + metrics-server</strong> 一键安装说明；第四节含{" "}
              <strong className="text-slate-800">Kubernetes API、Prometheus 与可选 VictoriaMetrics（vmselect）</strong> 的配置步骤；应用中心云主机与
              OpenClaw 见第七节（含<strong className="text-slate-800">预选软件实现原理</strong>：Docker / Nginx / 宝塔在无 systemd 环境下的启动与校验）。
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 text-sm leading-relaxed text-slate-700">
            <DocBody />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 mt-6 border-b border-slate-100 pb-1 text-base font-semibold text-slate-900 first:mt-0">{children}</h3>;
}

function P({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("mb-3 text-slate-600", className)}>{children}</p>;
}

function Ul({ children }: { children: React.ReactNode }) {
  return <ul className="mb-3 list-disc space-y-1.5 pl-5 text-slate-600">{children}</ul>;
}

function Ol({ children }: { children: React.ReactNode }) {
  return <ol className="mb-3 list-decimal space-y-1.5 pl-5 text-slate-600">{children}</ol>;
}

function Li({ children }: { children: React.ReactNode }) {
  return <li>{children}</li>;
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px] text-slate-800">{children}</code>
  );
}

function DocToc() {
  const items: { id: string; title: string }[] = [
    { id: "〇", title: "平台架构（K8s Pod 部署）" },
    { id: "一", title: "右下角入口" },
    { id: "二", title: "登录与权限与数据存储" },
    { id: "三", title: "左侧工作区" },
    { id: "四", title: "Kubernetes（API、Prometheus、VM、路由）" },
    { id: "五", title: "宝塔工作区" },
    { id: "六", title: "应用中心 · 总览与 Redis" },
    { id: "七", title: "应用中心 · 云主机与 OpenClaw（预选软件原理）" },
    { id: "八", title: "vCenter、公有云与网络工具" },
    { id: "九", title: "设置与账户" },
    { id: "十", title: "首次初始化" },
    { id: "十一", title: "运维与仓库说明" },
    { id: "十二", title: "AI 巡检、监控中心与告警" },
    { id: "十三", title: "文档文库、分享页与附件存储" },
  ];
  return (
    <nav
      className="mb-4 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-3 text-xs text-slate-600"
      aria-label="文档目录"
    >
      <p className="mb-2 font-semibold text-slate-800">目录</p>
      <ul className="m-0 flex list-none flex-col gap-y-1.5 p-0">
        {items.map((row) => (
          <li key={row.id} className="flex gap-2 leading-snug">
            <span className="w-6 shrink-0 font-medium tabular-nums text-slate-500">{row.id}</span>
            <span className="min-w-0 text-slate-600">{row.title}</span>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function DocBody() {
  return (
    <>
      <DocToc />

      <H>〇、平台架构（典型：控制台运行在 Kubernetes Pod 内）</H>
      <P>
        <strong className="text-slate-800">kube-bt-sync</strong> 通常以 <strong>Deployment + Service</strong> 部署在目标集群命名空间（如{" "}
        <Code>kube-bt-sync</Code>），容器监听 <Code>:8080</Code>，健康检查 <Code>GET /api/health</Code>；数据目录挂载{" "}
        <strong>PVC</strong> 到 <Code>/data</Code>（含 <Code>runtime-config.json</Code>、审计日志、SSH 凭据目录等）。浏览器通过集群{" "}
        <strong>Ingress</strong> 或 <strong>NodePort</strong> 访问控制台；进程使用 <strong>client-go</strong> 以 in-cluster ServiceAccount 或粘贴的{" "}
        <Code>kubeconfig</Code> 访问 <strong>API Server</strong>，<strong>不</strong>在 Pod 内执行 <Code>kubectl</Code> 子进程。
      </P>
      <PlatformArchitectureDiagram />
      <Ul>
        <Li>
          <strong>ingress-nginx（hostNetwork）</strong>：集群设置页可一键安装官方 bare metal 清单，并将控制器设为 <strong>hostNetwork</strong>，在节点上监听配置的 HTTP/HTTPS 端口（默认 <Code>80</Code> / <Code>443</Code>）；可选将控制器<strong>固定到指定 Node</strong>（<Code>nodeSelector</Code> / <Code>kubernetes.io/hostname</Code>）。<strong>安装、升级、仅应用端口、应用调度节点、卸载</strong>均会在执行前弹出<strong>二次确认</strong>，避免误触。宝塔反代目标为<strong>节点 IP + HTTP 端口</strong>；运行时 <Code>ingressNginxHostHttpPort</Code> / <Code>ingressNginxHostHttpsPort</Code> / <Code>ingressNginxControllerNodeName</Code> 供默认值。
        </Li>
        <Li>
          <strong>kube-prometheus-stack（推荐）</strong>：集群设置页可<strong>一键安装</strong> Prometheus Operator、Prometheus、kube-state-metrics、node-exporter 及默认 ServiceMonitor（命名空间 <Code>kube-bt-sync-monitoring</Code>）；镜像经 DaoCloud 前缀改写；默认<strong>自动写入</strong> <Code>prometheusUrlK8s</Code> 并可选清空 <Code>vmSelectUrlK8s</Code>。进程在集群外时若无法解析 <Code>*.svc</Code>，需手动改为 Ingress/NodePort 等可达地址。详见 <Code>docs/kubernetes-dashboard-prometheus.md</Code> 第 1.2 节。
        </Li>
        <Li>
          <strong>Kubernetes Dashboard + metrics-server（可选 Web UI）</strong>：集群设置页独立卡片可<strong>一键安装</strong> metrics-server v0.7.2 与 Dashboard 2.7（<Code>recommended</Code> 清单）；YAML 下载策略与 ingress 相同（jsDelivr / ghproxy）；容器镜像默认改写为 <Code>m.daocloud.io</Code> 前缀（与 ingress 共用「跳过 K8s 镜像改写」开关）。默认可为 metrics-server 注入 <Code>--kubelet-insecure-tls</Code>；安装后自动轮询 Deployment 就绪，并支持「深度自检」接口。会创建 <Code>kube-bt-sync-dashboard-admin</Code>（cluster-admin，生产请改最小权限）。<strong>不</strong>自动填写 <Code>prometheusUrlK8s</Code>（平台图表请用上一项 kube-prometheus-stack）。详细见仓库 <Code>docs/kubernetes-dashboard-prometheus.md</Code> 第 1.1 节。
        </Li>
        <Li>
          <strong>出站依赖</strong>：宝塔、Prometheus/vmselect、MySQL、Redis、vCenter、云主机 SSH 等均为<strong>可选</strong> TCP 出站；未配置则对应功能不可用或降级为本地存储。
        </Li>
      </Ul>

      <H>一、右下角入口</H>
      <P>
        任意已登录页面<strong className="text-slate-800">右下角</strong>固定有{" "}
        <strong className="text-slate-800">书本图标</strong>
        ，点击打开本文档；再点遮罩或右上角关闭。若需对外编写「带截图的配置步骤」，建议按章节顺序截取：账户与平台（OIDC、MySQL）→
        集群 / vCenter 设置（Prometheus）→ AI 巡检监控中心（Grafana、看板）与告警通道，并在图注中标明对应运行时字段名。
      </P>

      <H>二、登录与权限与数据存储</H>
      <Ul>
        <Li>
          <strong className="text-slate-800">管理员</strong>：配置、部署、同步、Ingress 写入、应用中心 Redis/云主机 等写操作（具体仍受下方模块与子权限约束）。
        </Li>
        <Li>
          <strong className="text-slate-800">只读（viewer）</strong>：以查看为主；写操作及敏感接口会返回无权限；旧版只读账号对部分 WebSocket（如 SSH、redis-cli）仍禁止。
        </Li>
        <Li>
          登录方式：支持<strong>本地密码</strong>（登录框可填<strong>平台用户名或已保存的邮箱</strong>）；若服务端已配置 OIDC，登录页另有<strong>OIDC
          单点登录</strong>。<strong>OIDC 须先绑定</strong>：用户需先用用户名/邮箱与密码登录，在「账户与平台 → 我的资料」中完成{" "}
          <strong>Authentik 绑定</strong>后，方可使用 OIDC 登录；未绑定时点击 OIDC 会提示前往用户中心绑定。账户与平台 OIDC 表单含与 Authentik 字段对照及{" "}
          <strong>RS256 签名</strong>说明。若「OIDC 发现失败」，请核对 <Code>OIDC_ISSUER_URL</Code> 与 IdP 发行者 URL。OIDC 错误页的 <Code>hint</Code> 含排查说明。
        </Li>
        <Li>
          <strong className="text-slate-800">OIDC 与 Authentik（HS256 报错）</strong>：本平台用 IdP 的 <strong>JWKS</strong> 校验 ID Token，需<strong>非对称</strong>签名（常见{" "}
          <Code>RS256</Code>）。在 Authentik 的 OAuth2 Provider「协议设置」中为<strong>签名密钥</strong>显式选择 <strong>RSA</strong> 证书；若报错{" "}
          <Code>unexpected signature algorithm &quot;HS256&quot;</Code>，多为未配置 RSA 密钥（Terraform 等须设置 <Code>signing_key</Code>）。{" "}
          <Code>OIDC_SUPPORTED_SIGNING_ALGS</Code> / <Code>oidcSupportedSigningAlgs</Code> 用于 <Code>ES256</Code> 等仍走 JWKS 的算法，<strong>不能</strong>单靠此项解决 HS256。其他可选环境变量见{" "}
          <Code>README.md</Code>（<Code>OIDC_SKIP_ISSUER_CHECK</Code>、<Code>OIDC_SKIP_CLIENT_ID_CHECK</Code>、<Code>OIDC_CLOCK_SKEW_SEC</Code> 等）。
        </Li>
        <Li>
          <strong className="text-slate-800">删除平台用户</strong>：删除<strong>未禁用</strong>的管理员时，须至少保留一名未禁用的管理员；若目标管理员已在「用户管理」中<strong>禁用</strong>，则不再占用「最后一名管理员」名额，可正常删除。
        </Li>
        <Li>
          危险操作（删除资源、清除 SSH 凭据、关闭他人两步验证等）均使用<strong>页面内确认框</strong>，不再使用浏览器原生{" "}
          <Code>confirm</Code>。
        </Li>
        <Li>
          <strong className="text-slate-800">平台用户权限（MySQL）</strong>：非 admin 用户可在「用户管理」中配置 <Code>permissions_json</Code>。
          <strong>应用中心</strong>模块为 <Code>appcenter</Code>（none / ro / rw）；子域包括 <Code>appcenterRedis</Code> 与 <Code>appcenterCloudVm</Code>（均可为
          full / readonly / managed_only）。未配置 <Code>appcenterCloudVm</Code> 时<strong>继承</strong> <Code>appcenterRedis</Code>。
          「仅纳管」类子域要求应用中心为 rw，且云主机/Redis 部分写能力会按后端策略限制（见接口返回）。
        </Li>
        <Li>
          <strong className="text-slate-800">platform_kv 与 Redis 镜像</strong>：验证码与失败次数、云主机镜像引导等键值写入 MySQL 表 <Code>kubebt_platform_kv</Code>（无
          MySQL 时落盘）；在开启 <Code>KUBEBT_RUNTIME_DUAL_WRITE_REDIS</Code> 时将<strong>全量</strong> platform_kv 镜像到 Redis，便于多副本与灾备恢复。
          平台 Redis 短暂不可用时进程会周期性<strong>自动重连</strong>，恢复后无需重启控制台服务。
        </Li>
      </Ul>

      <H>三、左侧工作区</H>
      <P>侧栏切换工作区后，「首页」与各模块默认路由如下（与 Hub 卡片入口一致）：</P>
      <Ul>
        <Li>
          <strong>Hub / 工作台</strong>：<Code>/</Code>，可跳转到各工作区。
        </Li>
        <Li>
          <strong>Kubernetes</strong>：<Code>/cluster</Code>（集群总览）。
        </Li>
        <Li>
          <strong>vCenter</strong>：<Code>/cluster/vcenter/dashboard</Code>（总览入口）。
        </Li>
        <Li>
          <strong>宝塔</strong>：<Code>/cluster/baota/sync</Code>（Ingress 同步入口；<Code>/cluster/baota</Code> 会重定向至此）。
        </Li>
        <Li>
          <strong>应用中心</strong>：<Code>/cluster/apps/dashboard</Code>；Redis 为 <Code>/cluster/apps/redis</Code>；云主机为{" "}
          <Code>/cluster/apps/cloud-vm</Code>（详情页 <Code>/cluster/apps/cloud-vm/&lt;id&gt;</Code>，首次镜像引导{" "}
          <Code>/cluster/apps/cloud-vm/bootstrap</Code>，仅管理员）；OpenClaw 为 <Code>/cluster/apps/openclaw</Code>。在<strong>应用中心工作区</strong>下，左侧菜单顺序为
          Redis → 云主机 → <strong>OpenClaw</strong>（与顶栏子导航一致）。
        </Li>
        <Li>
          <strong>AI 巡检</strong>：<strong>日志查询</strong> <Code>/cluster/ai-inspect/logs</Code>（VictoriaLogs 可视化，服务端聚合）；<strong>巡检配置</strong>{" "}
          <Code>/cluster/ai-inspect/configure</Code>；<strong>监控中心</strong> <Code>/cluster/ai-inspect/monitoring</Code>；<strong>告警中心</strong>{" "}
          <Code>/cluster/ai-inspect/alerts</Code>。<strong>总览</strong>（<Code>/cluster/ai-inspect/dashboard</Code>）仅从顶栏「Dashboard」进入，侧栏不设重复入口。
        </Li>
        <Li>
          <strong>文档文库</strong>（管理员）：<Code>/docs</Code> 列表与 Markdown/Excalidraw 编辑；单篇 <Code>/docs/doc/&lt;id&gt;</Code>。<strong>媒体与附件</strong>{" "}
          <Code>/docs/media</Code>：腾讯云 COS 图形化配置、本地上传、复制 Markdown 引用。详见第十三节。
        </Li>
      </Ul>
      <P className="text-xs text-slate-500">
        兼容旧链接：<Code>/ingress</Code>、<Code>/baota</Code> 会重定向到宝塔相关页。
      </P>

      <H>四、Kubernetes 工作区</H>
      <P>
        <strong className="text-slate-800">Kubernetes 数据源</strong>包含：① 用 kubeconfig / in-cluster / 进程环境连接 <strong>Kubernetes API</strong>（侧栏、列表、YAML、exec 等均依赖）；② 配置 <strong>Prometheus</strong>（<Code>prometheusUrlK8s</Code>）作为监控与部分图表的数据源；③（可选）若使用 <strong>VictoriaMetrics</strong>，将 <strong>vmselect</strong> 根地址写入 <Code>vmSelectUrlK8s</Code>（或环境变量 <Code>VM_SELECT_URL_K8S</Code>），监控查询会<strong>优先</strong>走 vmselect，留空则仍用 Prometheus。①～③ 均在 <Code>/cluster/settings</Code>（集群设置）中维护，保存后写入 <Code>runtime-config.json</Code> 并热重载。
      </P>
      <P className="font-medium text-slate-800">Kubernetes API、Prometheus 与 VM（vmselect）— 推荐步骤</P>
      <Ol>
        <Li>
          打开 <strong>集群设置</strong>（<Code>/cluster/settings</Code>）。若当前<strong>未连接</strong>集群，进入 <strong>Kubernetes 总览</strong>（<Code>/cluster</Code>）时页面顶部会出现 <strong>连接 Kubernetes 集群</strong> 向导，选项与设置页一致，保存后同样重载运行时。
        </Li>
        <Li>
          在 <strong>Cluster connection</strong>（Kubernetes）中选择<strong>连接方式</strong>（三选一）：
          <Ul>
            <Li>
              <strong>使用进程环境</strong>（<Code>none</Code>）：使用运行控制台进程所在环境的 <Code>KUBECONFIG</Code>，与同一机器上的 <Code>kubectl</Code> 行为一致（适合裸机或本机进程调试）。
            </Li>
            <Li>
              <strong>in-cluster</strong>：控制台以 Deployment 等形式部署在<strong>目标集群内</strong>时选用，使用 Pod 内 ServiceAccount 访问 API Server。
            </Li>
            <Li>
              <strong>粘贴 kubeconfig 全文</strong>：将完整 kubeconfig YAML 粘贴保存。若服务端曾保存过密钥，界面会显示 <Code>***</Code>；<strong>留空再保存</strong>可保留原内容，更换集群请粘贴新 YAML。
            </Li>
          </Ul>
        </Li>
        <Li>
          点击<strong>保存并重载</strong>。侧栏 Kubernetes 旁状态会变为 <strong>已连接</strong>、<strong>已填写（未连集群）</strong> 或 <strong>未配置</strong>，便于排查网络、证书与 RBAC。
        </Li>
        <Li>
          在同一页的 <strong>Kubernetes 监控（Prometheus · VM）</strong>卡片中：填写 <strong>Prometheus 根地址</strong>（<Code>prometheusUrlK8s</Code>，如 <Code>http://prometheus-k8s.monitoring:9090</Code>）；若迁移到 VictoriaMetrics，点击 <strong>「监控数据源（Prometheus / VictoriaMetrics）」</strong> 在对话框中增加 <Code>vmSelectUrlK8s</Code>（vmselect 根地址，如 <Code>http://vmselect.monitoring:8481</Code>），保存后查询优先走 VM。用于集群总览、节点、应用中心 Redis/云主机等监控图表。已能连 API 时，可使用<strong>集群内服务发现</strong>扫描 Prometheus Service；亦可用页面 PromQL 试查确认连通。
        </Li>
        <Li>
          应用中心 <strong>Redis K8s 镜像与 pull Secret</strong>在「Redis → 模版中心」配置；各命名空间需存在模版中填写的 <Code>imagePullSecret</Code> 名称。
        </Li>
        <Li>
          （可选）若集群<strong>未</strong>安装 <strong>ingress-nginx</strong>，可在 <strong>集群设置</strong> 页「Ingress-Nginx（HostNetwork）」由<strong>管理员</strong>一键安装（支持国内 ghproxy、自建清单 URL）。端口可在运行时保存 <Code>ingressNginxHostHttpPort</Code> / <Code>ingressNginxHostHttpsPort</Code>；亦可参考官方部署文档手动 <Code>kubectl</Code>。上述安装/升级/改端口/改节点/卸载均有页面内<strong>二次确认</strong>。
        </Li>
        <Li>
          （推荐）若集群总览、配额趋势等页 <strong>PromQL 无数据</strong>，可在 <strong>集群设置</strong> 页「kube-prometheus-stack」卡片<strong>一键安装</strong>完整采集栈，并默认将 <Code>prometheusUrlK8s</Code> 指向新 Prometheus（可选清空 <Code>vmSelectUrlK8s</Code>）。控制台在集群外时需自行改为可达的 Prometheus 地址。
        </Li>
        <Li>
          （可选）若仅需 <strong>Kubernetes 官方 Dashboard Web UI</strong> 与 <Code>kubectl top</Code>，可在「Kubernetes Dashboard · metrics-server」卡片安装；与平台图表用的 Prometheus 栈是两套能力。
        </Li>
        <Li>
          <strong>PVC 内文件浏览</strong>：命名空间下进入 PVC →「浏览文件」依赖 Running Pod 挂载卷；点击<strong>编辑</strong>后对话框会立即打开并显示<strong>正在读取文件…</strong>（大文件经 exec 拉取可能较慢，避免误以为页面卡死）。编辑器对 <Code>.json</Code> / <Code>.yaml</Code> / <Code>.yml</Code> / <Code>.md</Code> 等使用语法高亮，弹窗宽度已加宽以便阅读。
        </Li>
      </Ol>
      <P className="text-xs text-slate-500">
        说明：账户「平台设置」里若也有 K8s 相关默认值，与集群设置重叠时以<strong>已保存的运行时配置</strong>为准。环境变量（如部署清单中的 <Code>KUBECONFIG</Code>）在选用「进程环境」模式时生效。
      </P>
      <P className="text-xs text-slate-500">
        <strong className="text-slate-800">与 kubectl 的关系</strong>：控制台进程用 Go <strong>client-go</strong> 直连 API Server，<strong>不</strong>在服务端执行 <Code>kubectl</Code> 子进程。巡检、资源浏览、应用中心下发 YAML 等均使用该身份；若权限不足，需在集群里为 kubeconfig / in-cluster 对应的<strong>用户或 ServiceAccount</strong>配置 RBAC。应用中心为<strong>OpenClaw 网关 Pod</strong>创建的 ServiceAccount 名为 <Code>openclaw-&lt;Deployment&gt;</Code>（每套网关独立），与平台进程身份是两回事，详见第七节。
      </P>
      <P className="text-xs text-slate-600">
        <strong className="text-slate-800">Prometheus / VM 查询</strong>：前端通过 <Code>POST /api/prometheus/query</Code> 与{" "}
        <Code>POST /api/prometheus/query_range</Code> 提交 PromQL（<Code>scope=k8s</Code> 时后端按配置选用 Prometheus 或 vmselect，二者查询 API 兼容）；服务端在已连接<strong>平台 Redis</strong>时对相同查询结果做约 60
        秒缓存。首页与工作台仅加载轻量路由；应用中心 Redis、云主机、虚拟机详情等为<strong>按需异步加载</strong>的脚本块以缩短首屏时间。
      </P>

      <P className="font-medium text-slate-800">界面路由（与侧栏一致）</P>
      <Ul>
        <Li>
          <strong>集群总览</strong>：<Code>/cluster</Code>。
        </Li>
        <Li>
          <strong>NameSpace（命名空间列表）</strong>：侧栏与 <Code>/cluster/ns</Code> 一致；列表中每行是一个 Namespace，点击进入该命名空间下的工作负载与配置。与侧栏<strong>全集群 Pods</strong>（<Code>/cluster/pods</Code>）不同：后者不区分命名空间。进入命名空间后默认{" "}
          <Code>/cluster/ns/&lt;ns&gt;/deployments</Code>，左侧可切换 Deployment、StatefulSet、DaemonSet、Service、<strong>Ingress</strong>、PVC、ConfigMap、Secret、本命名空间 Pod 等。
        </Li>
        <Li>
          <strong>Service 端口与关联资源</strong>：Service 列表「端口 / NodePort」列仅展示<strong>前两条</strong>端口摘要，超出以省略提示；完整端口、协议、容器目标端口与 NodePort 在 <strong>Service 详情 · 概览 · 端口映射</strong>表格中查看。各资源详情中的<strong>关联资源</strong>为分行列表（可点击跳转），便于链到 Service、Ingress、工作负载、Pod、ConfigMap、Secret 等；DaemonSet 因无单页详情，名称链到命名空间内列表。
        </Li>
        <Li>
          <strong>Pod 容器终端（exec）</strong>：浏览器通过 <strong>WebSocket</strong> 连接本平台，平台再向 Kubernetes API 建立{" "}
          <Code>pods/exec</Code> 的 TTY 流式会话。<strong>WebSocket 握手成功不等于已进入容器</strong>：若容器名错误、Pod 未就绪等，平台以首条<strong>文本</strong>消息返回原因（如 <Code>container not found</Code>），界面仅在收到首条 TTY <strong>二进制</strong>流后才在终端与 toast 中提示「Pod 终端已连接」；失败时以 toast 与终端内红字展示原因。<strong>关闭终端弹窗时，前端会立即断开 WebSocket（正常关闭码 1000）</strong>，以便释放平台进程与集群 API Server 上的 exec 连接。若只打开不关、或同时开多个终端不关，容易堆积连接并占用资源；用毕请点关闭或离开会触发卸载的页面。说明：这与虚拟机「SSH 终端」同为经平台转发的长连接，不使用时均应关闭会话。
        </Li>
        <Li>
          <strong>RBAC</strong>：<Code>/cluster/rbac</Code>，只读查看 ClusterRole / ClusterRoleBinding、Role / RoleBinding、以及{" "}
          <strong>ServiceAccount</strong>（与 <Code>kubectl get sa</Code> 对应）。若 Dashboard 连接集群所用的账号缺少部分 list 权限，页面会提示并尽量展示已有数据。
        </Li>
        <Li>
          <strong>节点</strong>：<Code>/cluster/nodes</Code>。
        </Li>
        <Li>
          <strong>DaemonSet</strong>：<Code>/cluster/ns?resource=daemonsets</Code>（与命名空间工作区一致；旧路径 <Code>/cluster/daemonsets</Code> 会重定向）。
        </Li>
        <Li>
          <strong>集群设置（运行时）</strong>：<Code>/cluster/settings</Code>，即上文 API + Prometheus（及可选 VM）+ Harbor 等表单项。
        </Li>
      </Ul>

      <H>五、宝塔工作区</H>
      <P>
        需在运行时配置 <Code>baotaUrl</Code>、<Code>baotaApiKey</Code>（宝塔面板 API）及 <Code>platformPublicUrl</Code> 等；保存于「宝塔设置」或完整运行时表单。控制台须能访问宝塔面板与集群 Ingress 接口。
      </P>
      <Ul>
        <Li>
          <strong>Ingress 同步</strong>：<Code>/cluster/baota/sync</Code>（将带注解的 Ingress 域名下发为宝塔站点与反向代理；可配置同步开关与间隔）。<Code>/cluster/baota</Code> 进入后默认打开本页。
        </Li>
        <Li>
          <strong>Ingress 列表</strong>：<Code>/cluster/baota/ingress</Code>。
        </Li>
        <Li>
          <strong>宝塔设置</strong>：<Code>/cluster/baota/settings</Code>（DDNS、默认端口、同步参数、宝塔 API 等）。
        </Li>
      </Ul>

      <H>六、应用中心 · 总览与 Redis</H>
      <P>
        <strong className="text-slate-800">入口</strong>：<Code>/cluster/apps/redis</Code>；应用中心首页为{" "}
        <Code>/cluster/apps/dashboard</Code>。
      </P>
      <P>
        页面通常包含<strong className="text-slate-800">已纳管实例</strong>（连接信息、键空间、K8s 部署状态列等）与{" "}
        <strong className="text-slate-800">快速部署向导</strong>。若实例挂了 redis_exporter，可有 Prometheus 监控图（需 Prometheus 已接入）。
      </P>
      <P>
        <strong className="text-slate-800">Kubernetes 部署向导</strong>在集群中创建资源，支持<strong>单点 / 哨兵 / Cluster</strong>；镜像请填写完整{" "}
        <Code>repository:tag</Code>（留空则按运行时前缀解析为 <Code>redis:7.2</Code> 等）。可配置 maxmemory、淘汰策略、AOF，以及 tcp-backlog、keepalive、
        maxclients、hz、惰性释放、io-threads 等生产常用参数。
      </P>

      <P>
        <strong className="text-amber-900">若看不到「单点、哨兵、Cluster」</strong>：请将向导<strong className="text-slate-900">滚到最上方</strong>
        ，在「步骤 1：选择部署拓扑」三张卡片中选择模式，再填命名空间、镜像、名称、端口等。
      </P>

      <P>
        <strong className="text-slate-800">三种拓扑（K8s）</strong>：
      </P>
      <Ul>
        <Li>
          <strong>单点</strong>：Deployment + 同名 ClusterIP Service；可选 redis_exporter 与 Prometheus 注解。
        </Li>
        <Li>
          <strong>哨兵</strong>：主从 + Sentinel（资源名带 <Code>-master</Code>、<Code>-replica</Code>、<Code>-sentinel</Code> 等）；可配置
          master 名称。
        </Li>
        <Li>
          <strong>Cluster</strong>：6 节点 StatefulSet + 初始化 Job（<Code>redis-cli --cluster create</Code>）；默认不挂 exporter。
        </Li>
      </Ul>

      <P>
        <strong className="text-slate-800">Redis 私有镜像</strong>：在「应用中心 → Redis → 模版中心」配置完整镜像与{" "}
        <Code>imagePullSecret</Code>；进程级 <Code>REDIS_IMAGE_REGISTRY</Code> 等环境变量仍可作兼容兜底。
        Redis 向导中填写完整镜像地址（如 <Code>harbor.example.com/library/redis:7.2</Code>）；并可选择规格模板（CPU/内存 request、limit）。
      </P>
      <P>
        <strong className="text-slate-800">数据持久化</strong>：K8s 向导可开 PVC、容量与 StorageClass（选「自动」则用集群默认 SC）。账户与平台可设默认值：{" "}
        <Code>redisK8sPersistence</Code>、<Code>redisK8sStorageSize</Code>、<Code>redisK8sStorageClass</Code>。
      </P>
      <P>
        <strong className="text-slate-800">删除纳管实例与集群资源</strong>：在控制台删除一条<strong>已通过本平台 K8s 向导部署</strong>的 Redis 实例（配置中含{" "}
        <Code>k8sNamespace</Code> 与 <Code>k8sBaseName</Code>）时，后端会<strong>先</strong>在集群中删除对应拓扑的资源（单点 / 哨兵 / Cluster 下的 Deployment、StatefulSet、Service、Cluster 初始化 Job、相关{" "}
        <strong>PVC</strong> 与鉴权 Secret 等），再移除 MySQL 中的登记。若部分资源删除失败，HTTP 响应体中的 <Code>k8sWarnings</Code> 会列出原因；纯外部地址纳管、未走 K8s 部署的实例不受影响。
      </P>

      <H>七、应用中心 · 云主机与 OpenClaw</H>
      <P>
        <strong className="text-slate-800">路由</strong>：列表与创建 <Code>/cluster/apps/cloud-vm</Code>（子导航「实例列表 / 创建云主机」）；单实例管理{" "}
        <Code>/cluster/apps/cloud-vm/&lt;id&gt;</Code>；管理员<strong>镜像与命名空间模板</strong>{" "}
        <Code>/cluster/apps/cloud-vm/bootstrap</Code>（列表页管理员可见「打开配置页 / 复制完整地址」）。
      </P>
      <P>
        将 Ubuntu 等镜像以 Deployment 运行，<strong>仅</strong> <Code>/data</Code> 挂 PVC；根文件系统随 Pod 重建而重置。SSH 对外暴露为 Service <strong>NodePort</strong>（集群外可用<strong>节点 IP + 端口</strong>），<Code>root</Code> 与创建时密码登录（凭据加密存库）。控制台「SSH 终端」经 WebSocket，服务端在<strong>集群内</strong>部署时会优先经 Service <strong>ClusterIP</strong> 连接 SSH，避免 NodePort 回环等问题；环境变量 <Code>KUBEBT_CLOUD_VM_SSH_USE_CLUSTERIP=0</Code> 可强制仅用节点 IP:NodePort（调试用）。旧版只读账号不可用 WebSocket 终端。
      </P>
      <P>
        <strong className="text-slate-800">创建流程</strong>：与 Redis 类似在本页分 Tab，四步——① 基础（名称、镜像、root 密码）→ ② 规格与数据盘 → ③ 网络与高级（初始化脚本、NodePort、环境变量、自定义
        command/args）→ ④ <strong>自定义软件</strong>（可选 Docker、Nginx、宝塔、<strong>Hysteria2 客户端</strong> 与常用 CLI；可导入官方客户端 YAML。平台将配置中本地{" "}
        <Code>listen: 127.0.0.1:端口</Code> 改为 <Code>0.0.0.0</Code>，并创建集群内 TCP Service（<Code>&lt;Deployment&gt;-hy2</Code>），其它 Pod 可经{" "}
        <Code>*.svc.cluster.local</Code> 使用本地 HTTP/SOCKS inbound）。Hysteria 裸二进制由<strong>云主机镜像引导</strong>页配置的全局下载 URL（留空则用官方 <Code>app/v2.6.5</Code> 路径）按架构拉取，并自动尝试 ghproxy 等镜像。创建成功后跳转管理页。
      </P>
      <P>
        <strong className="text-slate-800">基础镜像与内置软件</strong>：默认可用 <Code>docker.io/library/ubuntu:22.04</Code> 等最小镜像；首次启动脚本会在安装{" "}
        <Code>openssh-server</Code> 时顺带 <Code>apt install</Code> 一批常用 CLI（如 curl、vim-tiny、iproute2、jq 等）。第 4 步勾选项会在用户脚本<strong>之前</strong>合并写入 Secret；仍不足时在<strong>初始化脚本</strong>中自行{" "}
        <Code>apt-get install</Code>，或换引导里配置的镜像。
      </P>
      <P>
        <strong className="text-slate-800">初始化脚本</strong>：在创建第 3 步或管理页编辑（仅用户片段）。平台将「预选软件」块与此合并后写入 Secret <Code>user-init.sh</Code>；<strong>每次容器启动</strong>在
        <Code>chpasswd</Code> 与 sshd 配置之后、<Code>exec sshd</Code> 之前以 <Code>bash</Code> 执行，脚本为 <Code>set -e</Code>。<strong>预选软件或合并后的用户脚本任一步失败，整条启动会退出，sshd 不会监听，Pod 就绪探针持续失败</strong>（与「装不好则不开放 SSH」一致）。仅<strong>用户自定义片段</strong>内的失败也同样会阻止 SSH，请保证脚本可重复执行或自行判断幂等。修改后「保存并应用」会更新 Secret 并滚动 Deployment。若使用<strong>自定义启动命令</strong>覆盖默认入口，平台不再挂载该文件，需在自行命令中处理。
      </P>
      <P className="font-medium text-slate-800">预选软件（Docker、Nginx、宝塔）— 实现原理</P>
      <P className="text-xs text-slate-500">
        云主机本质是集群里的一个 Pod（容器），<strong>PID 1 不是 systemd</strong>，因此包管理器安装的 <Code>docker.io</Code>、<Code>nginx</Code> 等<strong>不会</strong>像物理机那样由{" "}
        <Code>systemctl</Code> 自动拉起；平台在 <Code>user-init.sh</Code> 里用 shell 显式启动进程并做探测，失败即退出。
      </P>
      <Ul>
        <Li>
          <strong className="text-slate-800">合并顺序与持久化</strong>：向导勾选的 bash 块在前，用户初始化脚本在后（中间有注释分隔）。<Code>apt</Code> 缓存与列表可指向 PVC 下的{" "}
          <Code>/data/.kubebt/…</Code>；Ubuntu 官方源会尝试替换为阿里云镜像以加速。勾选任意需 apt 的软件时会执行 <Code>apt-get update</Code>。
        </Li>
        <Li>
          <strong className="text-slate-800">常用 CLI 包</strong>：仅允许白名单内包名；<Code>apt-get install</Code> 在非零退出时因 <Code>set -e</Code> 直接失败，SSH 不会就绪。
        </Li>
        <Li>
          <strong className="text-slate-800">Docker</strong>：安装 <Code>docker.io</Code>，数据目录与 <Code>daemon.json</Code> 指向 <Code>/data/docker</Code>（可配镜像加速）。创建 Deployment 时若勾选 Docker，容器会设 <Code>securityContext.privileged=true</Code>，否则嵌套的{" "}
          <Code>dockerd</Code> 常因 cgroup/权限无法启动。每次启动若 <Code>docker info</Code> 不可用，则后台执行 <Code>dockerd --iptables=false</Code>（避免改宿主机 iptables），日志 <Code>/data/.kubebt/dockerd.log</Code>，超时内仍无法{" "}
          <Code>docker info</Code> 则退出。已有实例若曾勾选 Docker，需通过更新 Secret/滚动 Deployment 等方式使清单带上特权，集群准入策略须允许。
        </Li>
        <Li>
          <strong className="text-slate-800">Nginx</strong>：安装后把默认站点 <Code>root</Code> 改到 <Code>/data/nginx/html</Code>，并确保存在简单 <Code>index.html</Code>，避免空目录导致 403 使健康检查误判。每次启动执行{" "}
          <Code>nginx -t</Code>，已运行则 <Code>nginx -s reload</Code>，否则 <Code>nginx</Code>；再用本机 <Code>curl</Code> 访问 <Code>http://127.0.0.1/</Code> 验证 80 端口，失败则退出。
        </Li>
        <Li>
          <strong className="text-slate-800">宝塔</strong>：首次成功安装后写入标记文件 <Code>/data/bt-panel/.kubebt-baota-ok</Code>；安装过程要求 <Code>wget</Code> 脚本非空、安装脚本成功、且能解析到{" "}
          <Code>bt</Code> 命令。每次启动会尝试 <Code>/etc/init.d/bt start</Code> 与 <Code>bt start</Code>（已运行时返回码可能非 0，故不以此作为唯一判据），随后在约两分钟内轮询本机{" "}
          <Code>http://127.0.0.1:8888/</Code> 或 <Code>https://127.0.0.1:8888/</Code>（跳过证书校验）是否可访问；仍不可达则退出。日志见 <Code>/data/bt-panel/install.log</Code>、<Code>/data/bt-panel/runtime.log</Code>。面板在容器内仍可能受限于无 systemd 的运行环境，但「装不好 / 起不来」不会放行 SSH。
        </Li>
        <Li>
          <strong className="text-slate-800">Hysteria2 客户端</strong>：勾选后可粘贴整行 <Code>hysteria2://</Code>/<Code>hy2://</Code> 分享链接或手写客户端 YAML（写入 Secret <Code>hysteria2.yaml</Code>）；启动命令为 <Code>hysteria client -c</Code>，并将 YAML 中回环{" "}
          <Code>listen</Code> 改为 <Code>0.0.0.0</Code> 以便集群内访问本地代理端口。二进制按<strong>镜像引导模板</strong>中配置的 amd64/arm64 下载地址（及镜像站回退）自动拉取；<strong>下载失败不会阻塞 SSH 就绪</strong>。若仍拉取不到，可在引导页改为自建可访问 URL，或为 Deployment 配置 <Code>HTTP_PROXY</Code>/<Code>HTTPS_PROXY</Code> 后滚动重启。勾选 Hysteria2 时，容器启动会向 <Code>/etc/profile.d/51-kube-bt-hysteria-proxy.sh</Code> 写入本机 HTTP(S) 代理环境变量（及 YAML 中含 <Code>socks5</Code> 时的 <Code>ALL_PROXY</Code>），登录 SSH 交互 shell 即可 <Code>curl</Code> 外网。管理页在勾选客户端时展示基于 Prometheus 的<strong>客户端相关 Pod 网卡流量</strong>；与 OpenClaw 联用时可登记<strong>出站云主机</strong>并填写网关代理。
        </Li>
        <Li>
          <strong className="text-slate-800">与 SSH 就绪探针的关系</strong>：默认入口在 <Code>user-init.sh</Code> 成功结束后才 <Code>exec sshd -D</Code>；Service 就绪探针检测 NodePort 上 SSH 端口。故预选软件或用户脚本的失败会表现为<strong>长时间未就绪</strong>，而非「能连上但环境半残」。
        </Li>
      </Ul>
      <P>
        <strong className="text-slate-800">资源与卷扩容</strong>：管理页「资源扩容」调用{" "}
        <Code>POST /api/app-center/cloud-vm/instances/:id/scale</Code>，可调整 CPU/内存 request、limit 并可选<strong>上调</strong>数据盘 PVC（须大于当前声明，且 StorageClass 开启{" "}
        <Code>allowVolumeExpansion</Code>）。命名空间内 <strong>PVC 列表</strong>（<Code>/cluster/ns/&lt;ns&gt;/pvcs</Code>）操作列提供「扩容」入口，接口为{" "}
        <Code>POST /api/k8s/pvcs/:namespace/:name/expand</Code>，请求体 <Code>{'{"size":"50Gi"}'}</Code>。
      </P>
      <P>
        <strong className="text-slate-800">API 提示</strong>：<Code>PUT /api/app-center/cloud-vm/instances/:id</Code> 可更新 <Code>initScript</Code> 与/或 <Code>software</Code>（含 Hysteria2）；实例元数据表需 MySQL。
      </P>
      <Ul>
        <Li>
          <strong>首次引导</strong>：未完成时管理员跳转 <Code>/cluster/apps/cloud-vm/bootstrap</Code>；键名 <Code>appcenter_cloud_vm_bootstrap_v1</Code>（platform_kv），双写时同步 Redis。
        </Li>
        <Li>
          <strong>监控</strong>：管理页 CPU/内存/网络依赖已配置的 K8s Prometheus 或 vmselect（<Code>vmSelectUrlK8s</Code> 优先）。
        </Li>
        <Li>
          <strong>与公有云主机</strong>：<Code>/cluster/vcenter/cloud</Code> 为外部 SSH 登记；云主机为集群内 Pod，勿混淆。
        </Li>
      </Ul>
      <P>
        <strong className="text-slate-800">OpenClaw 网关</strong>：<Code>/cluster/apps/openclaw</Code>。界面与云主机类似：<strong>实例列表</strong>与<strong>分步创建</strong>（K8s 资源名、对外暴露、模型与密钥）。部署时可登记<strong>带 Hysteria2 客户端的云主机</strong>作为出站；若未手填代理 URL，平台会推导 <Code>http://…-hy2.&lt;ns&gt;.svc.cluster.local:&lt;端口&gt;</Code> 写入网关 <Code>HTTP(S)_PROXY</Code>，并尽量写入 <Code>openclaw.json</Code> 根级 <Code>env</Code>。详情「管理配置」中：先保存出站与代理 → 在出站 Pod 内执行{" "}
        <strong>Google generate_204</strong> 检测（结果存 MySQL）→ 仅检测通过后可开启<strong>对接 Telegram</strong>（Bot Token 加密存 MySQL）→ 可用「验证 getMe」确认与 Telegram API 连通 → 再合并频道到 PVC 上 <Code>openclaw.json</Code>。部署时需自行填写命名空间、Deployment/Service 名称与镜像（占位仅为提示）；命名空间可从集群已有列表中选择或输入新名称。
      </P>
      <P>
        <strong className="text-slate-800">列表「对话」（不经 Control Web UI）</strong>：实例列表每行有<strong>「对话」</strong>，侧栏内多轮消息由<strong>本平台后端</strong>转发到登记中的<strong>集群内</strong> Base（形如{" "}
        <Code>http://&lt;svc&gt;.&lt;ns&gt;.svc.cluster.local:18789/v1</Code>
        ）的 OpenAI 兼容接口 <Code>POST /v1/chat/completions</Code>，请求头 <Code>Authorization: Bearer</Code> 为平台保存的<strong>网关 Token</strong>。浏览器只访问本平台域名，因此<strong>不会触发</strong>网关在浏览器里对 Control UI 做的 <Code>origin</Code> 校验（即不必为浏览器单独配 <Code>allowedOrigins</Code> 也能在本页对话）。前提与「AI 巡检」选用应用中心 OpenClaw 相同：<strong>运行 kube-bt-sync 的进程</strong>须能解析 <Code>*.svc.cluster.local</Code> 并访问该 Service（通常要求控制台部署在集群内或网络打通）。单实例详情 <Code>/cluster/apps/openclaw/&lt;id&gt;</Code> 可编辑 PVC 上 <Code>openclaw.json</Code>（若仍要打开网关上的 Control UI，请在 <Code>gateway.controlUi.allowedOrigins</Code> 中配置可信来源）。
      </P>
      <P>
        <strong className="text-slate-800">对外访问</strong>：① <strong>NodePort</strong>——不指定固定端口，由集群在 30000–32767 内<strong>随机分配</strong>，列表展示节点 IP + 端口形式的示例 URL。② <strong>Ingress + 宝塔</strong>——填写域名并选择{" "}
        <Code>kube-bt-sync.io/baota-sync</Code>（与宝塔工作区「发布 Ingress」一致），Service 为 ClusterIP，由 Ingress 反代到网关端口 18789；登记中的对外 Base 为 <Code>https|http://域名/v1</Code>。
      </P>
      <P>
        资源包含 PVC、ConfigMap、Secret（固定键名如 <Code>OPENAI_API_KEY</Code> 等）、Deployment、Service、可选 Ingress，以及<strong>集群只读</strong> ClusterRole/Binding；部署时创建 <Code>openclaw-&lt;Deployment&gt;</Code> ServiceAccount 并绑定只读 ClusterRole。可<strong>同步到 AI 巡检</strong>（集群内 <Code>…svc.cluster.local:18789/v1</Code> + 网关 Token）。平台界面时间统一按<strong>东八区</strong>展示。
      </P>
      <P>
        <strong className="text-slate-800">持久化与副本（每套网关独立卷）</strong>：新部署按 Deployment 名绑定资源——PVC{" "}
        <Code>openclaw-home-&lt;Deployment&gt;</Code>，以及同前缀的 Secret / ConfigMap / ServiceAccount（<Code>openclaw-secrets-…</Code>、<Code>openclaw-config-…</Code>、<Code>openclaw-…</Code>），同一命名空间内多套 OpenClaw <strong>互不共用</strong>家目录与密钥。Deployment 仍为<strong>副本数 1</strong>、<strong>ReadWriteOnce</strong>、策略 <strong>Recreate</strong>。平台登记中会保存卷名等字段；<strong>旧登记</strong>（字段为空）删除时仍按历史固定名 <Code>openclaw-home-pvc</Code> 等处理，若曾与同命名空间其他实例共用卷，建议删除后按当前版本重建以彻底隔离。
      </P>
      <P>
        <strong className="text-slate-800">删除 OpenClaw 实例</strong>：删除平台登记时会删除 Ingress（若创建时填写了 Ingress 资源名，或暴露方式为 Ingress 时的默认名）、Service、Deployment（前台级联）、实例专属的 ClusterRoleBinding（并尝试删除同名 RoleBinding 以免历史残留）；当<strong>同一命名空间内没有其他 OpenClaw 登记</strong>时，还会删除共享的 PVC、ConfigMap、Secret 与 ServiceAccount，避免残留卷与密钥。<strong>管理员</strong>预设通过 ClusterRoleBinding 绑定 <Code>kube-bt-openclaw-admin</Code>，可对<strong>全集群</strong>执行匹配 RBAC 的操作（与 <Code>tools.profile: full</Code> 是否允许工具为不同一层）。
      </P>
      <P>
        <strong className="text-slate-800">删除云主机实例</strong>：删除时会依次删除 Deployment（前台级联）、Service、<strong>PVC</strong>（数据盘）与实例 Secret，再移除数据库记录。
      </P>

      <H>八、vCenter、公有云与网络工具</H>
      <P>
        vCenter 与虚拟机列表依赖在 <strong>vCenter 设置</strong>（<Code>/cluster/vcenter/settings</Code>）中配置的地址与凭据；同页填写{" "}
        <Code>prometheusUrlVcenter</Code>（监控走 <Code>scope=vcenter</Code>，与 Kubernetes 侧的 <Code>prometheusUrlK8s</Code>{" "}
        <strong>相互独立</strong>）。可选字段 <Code>vmSelectUrlVcenter</Code>、<Code>vmSelectUrlCloud</Code>（及环境变量{" "}
        <Code>VM_SELECT_URL_VCENTER</Code>、<Code>VM_SELECT_URL_CLOUD</Code>）表示 VictoriaMetrics <strong>vmselect</strong>，填写后<strong>优先于</strong>同 scope 的 Prometheus 地址；留空则仍用 Prometheus。公有云主机列表还可填 <Code>prometheusUrlCloud</Code>。
      </P>
      <Ul>
        <Li>
          <strong>vCenter 总览</strong>：<Code>/cluster/vcenter/dashboard</Code>。
        </Li>
        <Li>
          <strong>虚拟机列表</strong>：<Code>/cluster/vcenter</Code>；<strong>虚拟机详情</strong>：<Code>/cluster/vcenter/&lt;moref&gt;</Code>。列表约<strong>每 22 秒</strong>带 <Code>refresh=1</Code> 向 vCenter 重新拉取快照，电源状态（运行中 / 已关机 / 挂起等）会随重启、关机等操作更新；详情页约<strong>每 16 秒</strong>刷新，便于观察电源与 Tools 上报变化。
        </Li>
        <Li>
          <strong>主机</strong>：<Code>/cluster/vcenter/hosts</Code>，主机详情含 <Code>/cluster/vcenter/hosts/&lt;moref&gt;</Code>。
        </Li>
        <Li>
          <strong>公有云主机列表</strong>（非 K8s Pod）：<Code>/cluster/vcenter/cloud</Code>；<strong>SSH 终端</strong>：{" "}
          <Code>/cluster/vcenter/cloud/&lt;hostId&gt;/ssh</Code>（通常仅管理员可用）。
        </Li>
        <Li>
          <strong>vCenter 设置</strong>：<Code>/cluster/vcenter/settings</Code>。
        </Li>
        <Li>
          <strong>IP 扫描</strong>：<Code>/cluster/vcenter/tools/ip-scan</Code>（<Code>/cluster/tools/ip-scan</Code> 会重定向到此处；RBAC
          与角色允许时可见）。
        </Li>
      </Ul>

      <H>九、设置与账户</H>
      <Ul>
        <Li>
          <strong>账户与平台</strong>：<Code>/account/settings</Code>（平台 URL、MySQL、平台 Redis、应用中心 Redis K8s 持久化默认值、控制台与
          OIDC 等；Redis 镜像在应用中心模版配置）。旧地址 <Code>/settings</Code> 会<strong>重定向</strong>到本页。页顶在已连接 MySQL 时提供<strong>我的资料</strong>：登录用户可自行修改<strong>邮箱</strong>与<strong>登录密码</strong>（已有密码时需填当前密码；仅 OIDC 用户可先设置本地密码以备启用密码登录）。工作台侧栏在「Dashboard」下可进入<strong>平台审计</strong>（管理员）。「外观与名称」中的<strong>平台显示名称</strong>与 <strong>Logo URL</strong> 会替换侧栏默认「Kube-BT-Sync」与内置 Logo；名称带有轻微呼吸动效；Logo 字段旁有推荐尺寸说明。
        </Li>
        <Li>
          <strong>平台审计</strong>：<Code>/account/audit</Code>。汇总登录、API 变更与资源操作（按模块筛选）；含时间、用户、来源 IP 与可读说明。服务端 <Code>audit.jsonl</Code> 默认<strong>保留约 30 天</strong>并定时裁剪；<strong>Prometheus 查询</strong>（图表/监控用的 <Code>query</Code> / <Code>query_range</Code>）不写入审计、也不出现在顶部小铃铛，避免刷屏。
        </Li>
        <Li>
          <strong>站点统计</strong>：<Code>/account/site-stats</Code>（管理员）。进程内累计 HTTP 量、访问最多路径与客户端 IP、登录失败按 IP 汇总（重启清零）；与 <Code>audit.jsonl</Code> 互补。
        </Li>
        <Li>
          <strong>小铃铛</strong>：<strong>异地登录</strong>（本次 IP 与上次成功登录不一致时红色强调）、<strong>登录暴力尝试</strong>、<strong>admin 密码错误导致 IP 临时封禁</strong>、<strong>应用中心云主机 SSH 密码失败</strong>，以及最近几条与平台审计同源的记录；<strong>宿主机公网出口 IP</strong>在本通知面板摘要中展示（若已启用出口探测）。
        </Li>
        <Li>
          <strong>两步验证（TOTP）</strong>：管理员在「平台用户」中可为用户生成或关闭 Google Authenticator
          兼容的动态码；生成/重新生成需输入<strong>当前管理员密码</strong>，且同一用户两次生成有最短间隔限制。若需应急解除：可在服务器侧清理对应用户的 TOTP 字段或运行时键值，详见 <Code>README.md</Code>。
        </Li>
        <Li>
          <strong>Kubernetes 集群运行时</strong>：API 与 Prometheus / VM（<Code>vmSelectUrlK8s</Code>）数据源以 <Code>/cluster/settings</Code> 为准；账户页中的同类字段多为<strong>默认模板</strong>，实际以集群设置中<strong>已保存并重载</strong>的配置为准。
        </Li>
        <Li>
          <strong>用户管理</strong>：<Code>/account/users</Code>（需后端开启 MySQL 用户表与权限；管理员可配置 <Code>permissions_json</Code>）。
        </Li>
      </Ul>

      <H>十、首次初始化</H>
      <P>
        未完成初始化时进入 <Code>/setup</Code>：创建管理员、数据目录、MySQL/Redis（可选）、以及<strong>可选的</strong> Kubernetes（kubeconfig / in-cluster）。完成后用所设账号登录 <Code>/login</Code>；若当时未配 K8s，可稍后在第四节步骤中于集群设置补全。
      </P>

      <H>十一、运维与仓库说明</H>
      <P>
        控制台探活一般为 <Code>/api/health</Code>；生产环境请为控制台 Deployment 配置 HTTP 探针。镜像构建、Helm、PVC 与数据目录、<Code>KUBEBT_DATA_DIR</Code>、Redis 双写、出口 IP 探测、<Code>DASHBOARD_TRUSTED_PROXIES</Code> 与登录安全相关说明等，以仓库根目录{" "}
        <Code>README.md</Code> 为准（镜像内无 shell 时勿用 <Code>wget</Code>/<Code>curl</Code> 做探针）。
      </P>
      <P>
        <strong className="text-slate-800">性能模式</strong>：环境变量 <Code>KUBEBT_PERFORMANCE_MODE=1</Code> 时 Gin 使用 release 模式，并对 <Code>GET /api/namespaces</Code> 等热点接口启用 Redis 短缓存（TTL 可用{" "}
        <Code>KUBEBT_NAMESPACES_CACHE_TTL_SEC</Code> 调整）。与多进程水平扩展、连接池调优等组合使用时，请以 <Code>internal/config.go</Code> 与部署说明为准。
      </P>
      <P className="text-xs text-slate-500">
        本文档侧重界面路由与操作；部署参数与运维细节请结合 <Code>README.md</Code> 与 <Code>internal/config.go</Code> 中的环境变量说明。
      </P>

      <H>十二、AI 巡检、监控中心与告警</H>
      <P>
        <strong className="text-slate-800">入口</strong>：顶栏工作区切换或工作台卡片「AI 巡检」→ 总览摘要为 <Code>/cluster/ai-inspect/dashboard</Code>（顶栏「Dashboard」）；
        <Code>/cluster/ai-inspect/logs</Code> 为 VictoriaLogs 可视化；<Code>/cluster/ai-inspect/configure</Code> 为巡检与 OpenClaw 配置。左侧子菜单含 <strong>日志查询</strong>、
        <strong>监控中心</strong>（Grafana 看板同步）、<strong>告警中心</strong>、<strong>巡检配置</strong>（不设与 Dashboard 重复的「总览」项）。
      </P>
      <P className="font-medium text-slate-800">平台「AI 巡检」在服务端如何工作（原理）</P>
      <P className="text-xs text-slate-600">
        全部在 <strong className="text-slate-800">kube-bt-sync 进程内</strong>执行，不依赖浏览器连集群。① 按配置勾选范围，先做<strong>快速检查项</strong>（如能否调
        Kubernetes API、vCenter 是否初始化、Prometheus 即时查询、MySQL 中 Redis/云主机登记数量、SSH 存储是否就绪等）。② 再并行拉取<strong>深度分项</strong>，各模块写成{" "}
        <strong>Markdown 段落</strong>（含表格、事件、<strong>异常 Pod 日志摘录</strong>等）。③ 可选：对 OpenClaw / OpenAI 兼容地址做一次<strong>大模型连通探针</strong>（短请求）。④
        若巡检配置里<strong>启用 OpenClaw</strong> 且填写了 Base URL，服务端将<strong>精简后的巡检 JSON</strong>（摘要、检查项、各分项 id/标题/状态，不含整段 Markdown 正文）连同你在配置页写的<strong>系统提示词与用户模板</strong>，通过{" "}
        <Code>POST …/v1/chat/completions</Code> 发给模型，得到<strong>中文摘要 Markdown</strong> 写入报告。⑤ 完整报告（检查项、分项 Markdown、可选 AI 摘要、探针结果）写入{" "}
        <strong>platform_kv</strong>（并可能双写 Redis），控制台仅<strong>读取展示</strong>。API Key / 网关 Token 依赖 <Code>KUBEBT_ENCRYPTION_KEY</Code> 加密存储。
      </P>
      <pre
        className="mb-3 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-[10px] leading-snug text-slate-700 shadow-inner sm:text-[11px]"
        aria-label="AI 巡检数据流示意图"
      >
        {`  定时任务 / 控制台「立即执行」
           │
           ▼
  ┌──────────────────────┐
  │ RunPlatformInspection │  ← Go：client-go / MySQL / Prom / vCenter SDK…
  └──────────┬───────────┘
             │
     ┌───────┴────────┐
     ▼                ▼
┌─────────┐    ┌─────────────────────┐
│快速检查项 │    │分项 Markdown 采集    │  K8s 统计·事件·异常Pod日志
│(列表徽章)│    │(折叠报告正文)        │  vCenter·Redis·云主机·OpenClaw·SSH
└────┬────┘    └──────────┬──────────┘
     │                    │
     └────────┬───────────┘
              ▼
     ┌─────────────────┐
     │ 合并 Inspection  │
     │ Report + 落盘    │  platform_kv（保留最近若干份）
     └────────┬────────┘
              │
     ┌────────┴────────────────────────┐
     ▼                                 ▼
┌─────────────┐              ┌──────────────────────┐
│ LLM 探针     │              │ 启用 OpenClaw 时     │
│ 短 chat 请求 │              │ 精简 JSON + 提示词   │
└─────────────┘              │ → /v1/chat/completions│
                             └──────────┬───────────┘
                                        ▼
                             ┌──────────────────────┐
                             │ AISummary（Markdown） │
                             └──────────┬───────────┘
                                        ▼
                             ┌──────────────────────┐
                             │ 总览页 / 历史报告渲染  │  含代码块换行与高亮
                             └──────────────────────┘`}
      </pre>
      <P className="text-xs text-slate-500">
        上图可在支持 Mermaid 的编辑器中改为流程图；逻辑与后端 <Code>internal/ops_center_inspect.go</Code>、各{" "}
        <Code>inspectCollect*</Code> 采集函数一致。
      </P>
      <Ul>
        <Li>
          <strong>AI 巡检（管理员）</strong>：可选择<strong>手动填写</strong> OpenAI 兼容 <Code>Base URL</Code>，或选用<strong>应用中心已登记的 OpenClaw</strong>（集群内地址 + 网关 Token，无需在表单重复填 Key）。配置模型与提示词；勾选巡检对象（Kubernetes、vCenter、Prometheus 探活、Redis 实例表、SSH 存储、云主机表等）。可「立即执行」或按所设<strong>每日时刻</strong>自动生成报告；若启用大模型，会将巡检 JSON 送入对话接口生成摘要（需 <Code>KUBEBT_ENCRYPTION_KEY</Code> 以保存 API Key）。
        </Li>
        <Li>
          <strong>监控中心</strong>：填写 Grafana 根地址后「保存」并「同步看板」——服务端仅此时访问 Grafana API（<Code>/api/search</Code>、<Code>/api/dashboards/uid/…</Code>），将看板 JSON 落盘到 <Code>ops_grafana/&lt;uid&gt;.json</Code>。若 Grafana 已接 SSO 无法使用账号密码，请将认证方式选为 <strong>API Token</strong>，在 Grafana 中创建 Service Account 或 API Token 后填入密码框（Bearer）。展示时在页面选择全局 <strong>Prometheus 数据源</strong>（Kubernetes 或 vCenter）；各面板可查看 Grafana 中配置的<strong>数据源标识</strong>，系统会尝试<strong>推断</strong>属于 K8s 或 vCenter，也可对单面板<strong>强制指定</strong>查询后端。实际查询走本平台{" "}
          <Code>POST /api/prometheus/query_range</Code>，默认<strong>不经过 Grafana</strong>。<strong>内置预设图</strong>（不经 Grafana）中，如「容器内存 working set」等对字节类指标可在页面上以 <strong>GiB（纵轴 G）</strong>展示，PromQL 仍为原始字节，便于与告警阈值对齐；说明文字见卡片内提示。
        </Li>
        <Li>
          <strong>告警中心（管理员）</strong>：为每条规则配置 <Code>scope</Code>、PromQL、比较符与阈值、<Code>for</Code>；通知通道支持 <strong>SMTP</strong>、<strong>企业微信群机器人 Webhook</strong>，以及<strong>企业微信自建应用</strong>（<Code>wecom_app</Code>，填写企业 ID、AgentId、应用 Secret，走官方 <Code>gettoken</Code> + <Code>message/send</Code> API）。服务端约每分钟评估一次；支持按标签<strong>抑制</strong>。测试发送使用「发送测试」。
        </Li>
        <Li>
          权限：可在平台用户 <Code>permissions_json.menu.aiInspect</Code> 中关闭顶栏与工作台入口；配置类接口多为管理员专用。
        </Li>
      </Ul>

      <H>十三、文档文库、分享页与附件存储</H>
      <P>
        <strong className="text-slate-800">入口与权限</strong>：文档库为<strong>管理员</strong>功能；进入 <Code>/docs</Code> 后左侧为文档列表，右侧为 Markdown（ByteMD）或 Excalidraw 画布编辑区。顶栏工具条含<strong>保存</strong>、<strong>导出 .md</strong>、<strong>媒体库</strong>（链到 <Code>/docs/media</Code>）、<strong>分享</strong>（已发布文档）。工作区为文档库时主区域占满高度，避免编辑器被压成细条。
      </P>
      <Ul>
        <Li>
          <strong className="text-slate-800">Markdown 编辑与上传</strong>：编辑区支持分栏预览；粘贴或拖拽<strong>图片</strong>会调用 <Code>POST /api/docs/upload</Code> 上传并插入 <Code>![]()</Code>，其它文件插入 <Code>[]()</Code>。若已打开某篇文档，可在表单中附带 <Code>docId</Code> 便于媒体表关联；未打开时亦可上传至附件库。
        </Li>
        <Li>
          <strong className="text-slate-800">媒体与附件页</strong>（<Code>/docs/media</Code>）：① <strong>附件存储</strong>——可在页面内填写<strong>腾讯云 COS</strong>（SecretId、SecretKey、Bucket 含 APPID、Region、可选前缀与 CDN 公网根）并<strong>测试连接</strong>、<strong>保存配置</strong>；凭据写入 <strong>platform_kv</strong>（键 <Code>kubebt_docs_cos_settings_v1</Code>），与双写策略一致时同步 Redis。保存后<strong>优先于</strong>环境变量 <Code>KUBEBT_COS_*</Code>；可<strong>清除控制台 COS</strong> 回退到环境变量或未配置时的<strong>本地目录</strong>（<Code>data/doc-uploads</Code>）。② <strong>上传到附件库</strong>——拖拽或选择文件，成功后<strong>自动将 Markdown 引用复制到剪贴板</strong>，粘贴到正文即可。③ 列表中可对每条记录<strong>复制 MD</strong> 或删除（同步删 COS 对象或本地文件）。
        </Li>
        <Li>
          <strong className="text-slate-800">工具条提示</strong>：编辑器下方一行会标明当前附件走 <strong>腾讯云 COS（控制台 / 环境变量）</strong> 或 <strong>本地存储</strong>，与接口 <Code>GET /api/docs/attachment-storage</Code> 一致。
        </Li>
        <Li>
          <strong className="text-slate-800">公开分享页</strong>（访客 <Code>/r/&lt;id&gt;.html</Code>）：已发布 Markdown 渲染为飞书风正文；<strong>代码块</strong>带行号栏与 Mac 风格标题栏；宽屏下左侧有<strong>目录（TOC）</strong>锚点跳转（标题自动生成 id）。可选分享密码通过 Cookie 验证。画布类型为 Excalidraw 只读预览。
        </Li>
      </Ul>
      <P className="text-xs text-slate-500">
        与实现相关的包：公开页模板 <Code>internal/doc_public_page.go</Code>；COS 生效逻辑 <Code>internal/docs_cos_runtime.go</Code>；编辑器布局 <Code>react/src/md-editor/md-editor-shell.css</Code>。
      </P>
    </>
  );
}

import { Suspense, lazy, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router-dom";
import { AuthProvider } from "@/auth/auth-context";
import AppLayout from "./components/AppLayout";
import RequireAuth from "./components/RequireAuth";
import HomeHub from "./pages/HomeHub";
import IngressList from "./pages/IngressList";
import BaotaSync from "./pages/BaotaSync";
import BaotaLayout from "./pages/baota/BaotaLayout";
import BaotaSettingsPage from "./pages/baota/BaotaSettingsPage";
import Settings from "./pages/Settings";
import AccountSettings from "./pages/account/AccountSettings";
import AccountPersonalCenter from "./pages/account/AccountPersonalCenter";
import SiteStats from "./pages/account/SiteStats";
import ViewerRedirect from "./components/ViewerRedirect";
import ClusterK8sSettings from "./pages/cluster/ClusterK8sSettings";
import ClusterLayout from "./pages/cluster/ClusterLayout";
import ClusterOverview from "./pages/cluster/ClusterOverview";
import ClusterPods from "./pages/cluster/ClusterPods";
import ClusterPodsAll from "./pages/cluster/ClusterPodsAll";
import ClusterServices from "./pages/cluster/ClusterServices";
import ClusterIngresses from "./pages/cluster/ClusterIngresses";
import ClusterNamespacePicker from "./pages/cluster/ClusterNamespacePicker";
import ClusterNamespaceResourcesLayout from "./pages/cluster/ClusterNamespaceResourcesLayout";
import LegacyPodDetailRedirect from "./pages/cluster/LegacyPodDetailRedirect";
import {
  ClusterConfigMapsScoped,
  ClusterDaemonSetsScoped,
  ClusterDeploymentsScoped,
  ClusterPVCsScoped,
  ClusterSecretsScoped,
  ClusterStatefulSetsScoped,
} from "./pages/cluster/ClusterWorkloadPages";
import ClusterNodes from "./pages/cluster/ClusterNodes";
import ClusterEtcdPage from "./pages/cluster/ClusterEtcdPage";
import ClusterRBAC from "./pages/cluster/ClusterRBAC";
import ClusterRBACServiceAccountDetail from "./pages/cluster/ClusterRBACServiceAccountDetail";
import ClusterCustomResourcesLayout, {
  ClusterCustomResourceCrdList,
  ClusterCustomResourceDetail,
  ClusterCustomResourceInstances,
} from "./pages/cluster/ClusterCustomResources";
import ToolNetworkIpScan from "./pages/cluster/ToolNetworkIpScan";
import VCenterHubDashboard from "./pages/vcenter/VCenterHubDashboard";
import VCenterList from "./pages/vcenter/VCenterList";
import VCenterIkuaiRouterPage from "./pages/vcenter/VCenterIkuaiRouterPage";
import VCenterGpuDashboard from "./pages/vcenter/VCenterGpuDashboard";
import VCenterHosts from "./pages/vcenter/VCenterHosts";
import VCenterHostDetail from "./pages/vcenter/VCenterHostDetail";
import VCenterSettings from "./pages/vcenter/VCenterSettings";
import CloudHosts from "./pages/vcenter/CloudHosts";
import CloudHostSshPage from "./pages/vcenter/CloudHostSshPage";
import BastionConsoleHome from "./pages/bastion/BastionConsoleHome";
import VCenterBastionAdmin from "./pages/vcenter/VCenterBastionAdmin";
import VCenterBastionConsoleEmbed from "./pages/vcenter/VCenterBastionConsoleEmbed";
import AppCenterLayout from "./pages/AppCenterLayout";
import BastionLayout from "./pages/bastion/BastionLayout";
import AppCenterDashboard from "./pages/AppCenterDashboard";
import DocsMedia from "./pages/docs/DocsMedia";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import Setup from "./pages/Setup";
import SetupGate from "./components/SetupGate";
import { Toaster } from "sonner";
import BrandingEffect from "./components/BrandingEffect";
import { AppRouteBoundary } from "./components/AppRouteBoundary";

const AppCenterRedis = lazy(() => import("./pages/AppCenterRedis"));
const AppCenterOpenSearch = lazy(() => import("./pages/AppCenterOpenSearch"));
const AppCenterKafka = lazy(() => import("./pages/AppCenterKafka"));
const AppCenterKafkaInstance = lazy(() =>
  import("./pages/AppCenterKafka").then((m) => ({ default: m.AppCenterKafkaInstancePage }))
);
const AppCenterKafkaThrottle = lazy(() => import("./pages/AppCenterKafkaThrottle"));
const AppCenterDns = lazy(() => import("./pages/dns/DnsLayout"));
const TencentCloudLayout = lazy(() => import("./pages/tencent-cloud/TencentCloudLayout"));
const TencentCloudOverview = lazy(() => import("./pages/tencent-cloud/TencentCloudOverview"));
const TencentCloudCVM = lazy(() => import("./pages/tencent-cloud/TencentCloudCVM"));
const TencentCloudLighthouse = lazy(() => import("./pages/tencent-cloud/TencentCloudLighthouse"));
const TencentCloudSSL = lazy(() => import("./pages/tencent-cloud/TencentCloudSSL"));
const TencentCloudCDN = lazy(() => import("./pages/tencent-cloud/TencentCloudCDN"));
const TencentCloudCOS = lazy(() => import("./pages/tencent-cloud/TencentCloudCOS"));
const TencentCloudCAM = lazy(() => import("./pages/tencent-cloud/TencentCloudCAM"));
const QiniuCloudPage = lazy(() => import("./pages/qiniu-cloud/QiniuCloudPage"));
const UpyunCloudPage = lazy(() => import("./pages/upyun-cloud/UpyunCloudPage"));

const AppCenterCloudVm = lazy(() => import("./pages/AppCenterCloudVm"));
const AppCenterCloudVmBootstrap = lazy(() => import("./pages/AppCenterCloudVmBootstrap"));
const AppCenterCloudVmDetail = lazy(() => import("./pages/AppCenterCloudVmDetail"));
const VCenterBastionSession = lazy(() => import("./pages/vcenter/VCenterBastion"));
const VCenterVMDetail = lazy(() => import("./pages/vcenter/VCenterVMDetail"));
const MdEditorPage = lazy(() => import("./md-editor/EditorContainer"));
const PlatformUsersPage = lazy(() => import("./pages/account/PlatformUsers"));
const PlatformAuditPage = lazy(() => import("./pages/account/PlatformAudit"));
const HarborSectionPage = lazy(() => import("./pages/harbor/HarborSection"));
const HarborProjectsPageLazy = lazy(() => import("./pages/harbor/HarborProjectsPage"));
const HarborReposPageLazy = lazy(() => import("./pages/harbor/HarborReposPage"));
const HarborArtifactsPageLazy = lazy(() => import("./pages/harbor/HarborArtifactsPage"));
const AiInspectLayoutPage = lazy(() => import("./pages/ai-inspect/AiInspectLayout"));
const AiInspectDashboardPage = lazy(() => import("./pages/ai-inspect/AiInspectDashboard"));
const AiInspectHomePage = lazy(() => import("./pages/ai-inspect/AiInspectHome"));
const AiAssistantPage = lazy(() => import("./pages/ai-inspect/AiAssistant"));
const AiInspectMonitoringPage = lazy(() => import("./pages/ai-inspect/AiInspectMonitoring"));
const AiInspectAlertsPage = lazy(() => import("./pages/ai-inspect/AiInspectAlerts"));
const AiInspectLogsPage = lazy(() => import("./pages/ai-inspect/AiInspectLogs"));
const AiInspectLogDetailsPage = lazy(() => import("./pages/ai-inspect/AiInspectLogDetails"));
const AiInspectLogCollectionPage = lazy(() => import("./pages/ai-inspect/AiInspectLogCollection"));
const AiInspectReportsPage = lazy(() => import("./pages/ai-inspect/AiInspectReports"));
const MeshPage = lazy(() => import("./pages/mesh/MeshPage"));
const ClusterPodDetailPage = lazy(() => import("./pages/cluster/ClusterPodDetail"));
const ClusterPodTerminalPageLazy = lazy(() => import("./pages/cluster/ClusterPodTerminalPage"));
const ClusterWorkloadDetailPage = lazy(() => import("./pages/cluster/ClusterWorkloadDetail"));
const ClusterServiceDetailPage = lazy(() => import("./pages/cluster/ClusterServiceDetail"));
const ClusterIngressDetailPage = lazy(() => import("./pages/cluster/ClusterIngressDetail"));
const ClusterConfigMapDetailPage = lazy(() => import("./pages/cluster/ClusterConfigMapDetail"));
const ClusterSecretDetailPage = lazy(() => import("./pages/cluster/ClusterSecretDetail"));
const ClusterPVCFilesPageLazy = lazy(() => import("./pages/cluster/ClusterPVCFilesPage"));
const PodRestartAiReportsPageLazy = lazy(() => import("./pages/cluster/PodRestartAiReportsPage"));
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const routeChunkFallback = (
  <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 p-8 text-sm text-slate-500">
    加载模块中…
  </div>
);

function RouteSuspense({ children }: { children: ReactNode }) {
  return <Suspense fallback={routeChunkFallback}>{children}</Suspense>;
}

function DocsLegacyEditRedirect() {
  const { docId } = useParams();
  const id = docId?.trim();
  if (!id || !/^\d+$/.test(id)) return <Navigate to="/docs" replace />;
  return <Navigate to={`/docs/doc/${id}`} replace />;
}

/** 旧链接 /cluster/vcenter/bastion/* → /cluster/bastion/* */
function LegacyVcenterBastionRedirect() {
  const { pathname } = useLocation();
  const rest = pathname.replace(/^\/cluster\/vcenter\/bastion\/?/, "");
  const to = rest ? `/cluster/bastion/${rest}` : "/cluster/bastion/session";
  return <Navigate to={to} replace />;
}

/** 文档中心（ByteMD 等）体积大，仅访问 /docs 时按需加载 */
function DocsEditorLazy() {
  return (
    <Suspense fallback={routeChunkFallback}>
      <MdEditorPage />
    </Suspense>
  );
}

function AuthedAppShell() {
  return (
    <AppRouteBoundary>
      <AppLayout />
    </AppRouteBoundary>
  );
}

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrandingEffect />
        <Toaster position="top-center" richColors closeButton />
        <BrowserRouter>
          <Routes>
            <Route element={<SetupGate />}>
              <Route path="/setup" element={<Setup />} />
              <Route path="/login" element={<Login />} />
              <Route element={<RequireAuth />}>
              <Route element={<AuthedAppShell />}>
                <Route index element={<HomeHub />} />
                <Route path="ingress" element={<Navigate to="/cluster/baota/ingress" replace />} />
                <Route path="baota" element={<Navigate to="/cluster/baota/sync" replace />} />
                <Route path="settings" element={<Settings />} />
                <Route path="account/settings" element={<AccountSettings />} />
                <Route path="account/personal" element={<AccountPersonalCenter />} />
                <Route
                  path="account/users"
                  element={
                    <RouteSuspense>
                      <PlatformUsersPage />
                    </RouteSuspense>
                  }
                />
                <Route
                  path="account/audit"
                  element={
                    <RouteSuspense>
                      <PlatformAuditPage />
                    </RouteSuspense>
                  }
                />
                <Route path="account/site-stats" element={<SiteStats />} />
                <Route path="docs/media" element={<DocsMedia />} />
                <Route path="docs/new" element={<Navigate to="/docs" replace />} />
                <Route path="docs/:docId/edit" element={<DocsLegacyEditRedirect />} />
                <Route path="docs/doc/:docId" element={<DocsEditorLazy />} />
                <Route path="docs" element={<DocsEditorLazy />} />
                <Route path="cluster" element={<Outlet />}>
                  <Route
                    path="baota"
                    element={
                      <ViewerRedirect to="/cluster">
                        <BaotaLayout />
                      </ViewerRedirect>
                    }
                  >
                    <Route index element={<Navigate to="sync" replace />} />
                    <Route path="ingress" element={<IngressList />} />
                    <Route path="sync" element={<BaotaSync />} />
                    <Route path="settings" element={<BaotaSettingsPage />} />
                  </Route>
                  {/* 独占全屏：不经 ClusterLayout / 命名空间侧栏 / AppLayout 侧栏 */}
                  <Route
                    path="ns/:namespace/pods/:podName/terminal"
                    element={
                      <RouteSuspense>
                        <ClusterPodTerminalPageLazy />
                      </RouteSuspense>
                    }
                  />
                  <Route element={<ClusterLayout />}>
                  <Route index element={<ClusterOverview />} />
                  <Route path="ns" element={<ClusterNamespacePicker />} />
                  <Route path="ns/:namespace" element={<ClusterNamespaceResourcesLayout />}>
                    <Route index element={<Navigate to="pods" replace />} />
                    <Route
                      path="pods/:podName"
                      element={
                        <RouteSuspense>
                          <ClusterPodDetailPage />
                        </RouteSuspense>
                      }
                    />
                    <Route path="pods" element={<ClusterPods />} />
                    <Route
                      path="deployments/:workloadName"
                      element={
                        <RouteSuspense>
                          <ClusterWorkloadDetailPage segment="deployments" />
                        </RouteSuspense>
                      }
                    />
                    <Route path="deployments" element={<ClusterDeploymentsScoped />} />
                    <Route
                      path="statefulsets/:workloadName"
                      element={
                        <RouteSuspense>
                          <ClusterWorkloadDetailPage segment="statefulsets" />
                        </RouteSuspense>
                      }
                    />
                    <Route path="statefulsets" element={<ClusterStatefulSetsScoped />} />
                    <Route
                      path="daemonsets/:workloadName"
                      element={
                        <RouteSuspense>
                          <ClusterWorkloadDetailPage segment="daemonsets" />
                        </RouteSuspense>
                      }
                    />
                    <Route path="daemonsets" element={<ClusterDaemonSetsScoped />} />
                    <Route
                      path="services/:serviceName"
                      element={
                        <RouteSuspense>
                          <ClusterServiceDetailPage />
                        </RouteSuspense>
                      }
                    />
                    <Route path="services" element={<ClusterServices />} />
                    <Route
                      path="ingresses/:ingressName"
                      element={
                        <RouteSuspense>
                          <ClusterIngressDetailPage />
                        </RouteSuspense>
                      }
                    />
                    <Route path="ingresses" element={<ClusterIngresses />} />
                    <Route
                      path="pvcs/:pvcName/files"
                      element={
                        <RouteSuspense>
                          <ClusterPVCFilesPageLazy />
                        </RouteSuspense>
                      }
                    />
                    <Route path="pvcs" element={<ClusterPVCsScoped />} />
                    <Route
                      path="configmaps/:configMapName"
                      element={
                        <RouteSuspense>
                          <ClusterConfigMapDetailPage />
                        </RouteSuspense>
                      }
                    />
                    <Route path="configmaps" element={<ClusterConfigMapsScoped />} />
                    <Route
                      path="secrets/:secretName"
                      element={
                        <RouteSuspense>
                          <ClusterSecretDetailPage />
                        </RouteSuspense>
                      }
                    />
                    <Route path="secrets" element={<ClusterSecretsScoped />} />
                  </Route>
                  <Route
                    path="pods/:namespace/:podName"
                    element={<LegacyPodDetailRedirect />}
                  />
                  <Route path="pods" element={<ClusterPodsAll />} />
                  <Route
                    path="statefulsets"
                    element={
                      <Navigate to="/cluster/ns?resource=statefulsets" replace />
                    }
                  />
                  <Route
                    path="services"
                    element={<Navigate to="/cluster/ns?resource=services" replace />}
                  />
                  <Route
                    path="ingresses"
                    element={<Navigate to="/cluster/ns?resource=ingresses" replace />}
                  />
                  <Route
                    path="pvcs"
                    element={<Navigate to="/cluster/ns?resource=pvcs" replace />}
                  />
                  <Route
                    path="configmaps"
                    element={
                      <Navigate to="/cluster/ns?resource=configmaps" replace />
                    }
                  />
                  <Route
                    path="secrets"
                    element={<Navigate to="/cluster/ns?resource=secrets" replace />}
                  />
                  <Route
                    path="deployments"
                    element={<Navigate to="/cluster/ns?resource=deployments" replace />}
                  />
                  <Route
                    path="daemonsets"
                    element={<Navigate to="/cluster/ns?resource=daemonsets" replace />}
                  />
                  <Route path="nodes" element={<ClusterNodes />} />
                  <Route path="etcd" element={<ClusterEtcdPage />} />
                  <Route
                    path="pod-restart-reports"
                    element={
                      <RouteSuspense>
                        <PodRestartAiReportsPageLazy />
                      </RouteSuspense>
                    }
                  />
                  <Route path="rbac" element={<ClusterRBAC />} />
                  <Route path="rbac/sa/:namespace/:name" element={<ClusterRBACServiceAccountDetail />} />
                  <Route path="custom-resources" element={<ClusterCustomResourcesLayout />}>
                    <Route index element={<ClusterCustomResourceCrdList />} />
                    <Route path=":crdName/instances/:namespace/:objName" element={<ClusterCustomResourceDetail />} />
                    <Route path=":crdName" element={<ClusterCustomResourceInstances />} />
                  </Route>
                  <Route
                    path="harbor"
                    element={
                      <RouteSuspense>
                        <HarborSectionPage />
                      </RouteSuspense>
                    }
                  >
                    <Route
                      index
                      element={
                        <RouteSuspense>
                          <HarborProjectsPageLazy />
                        </RouteSuspense>
                      }
                    />
                    <Route
                      path="p/:projectName"
                      element={
                        <RouteSuspense>
                          <HarborReposPageLazy />
                        </RouteSuspense>
                      }
                    />
                    <Route
                      path="p/:projectName/*"
                      element={
                        <RouteSuspense>
                          <HarborArtifactsPageLazy />
                        </RouteSuspense>
                      }
                    />
                  </Route>
                  <Route path="settings" element={<ClusterK8sSettings />} />
                  <Route
                    path="tools/ip-scan"
                    element={<Navigate to="/cluster/vcenter/tools/ip-scan" replace />}
                  />
                  <Route path="apps" element={<AppCenterLayout />}>
                    <Route index element={<Navigate to="dashboard" replace />} />
                    <Route path="dashboard" element={<AppCenterDashboard />} />
                    <Route
                      path="redis"
                      element={
                        <Suspense fallback={routeChunkFallback}>
                          <AppCenterRedis />
                        </Suspense>
                      }
                    />
                    <Route
                      path="opensearch"
                      element={
                        <Suspense fallback={routeChunkFallback}>
                          <AppCenterOpenSearch />
                        </Suspense>
                      }
                    />
                    <Route
                      path="kafka/instance/:id/throttle"
                      element={
                        <Suspense fallback={routeChunkFallback}>
                          <AppCenterKafkaThrottle />
                        </Suspense>
                      }
                    />
                    <Route
                      path="kafka/instance/:id"
                      element={
                        <Suspense fallback={routeChunkFallback}>
                          <AppCenterKafkaInstance />
                        </Suspense>
                      }
                    />
                    <Route
                      path="kafka"
                      element={
                        <Suspense fallback={routeChunkFallback}>
                          <AppCenterKafka />
                        </Suspense>
                      }
                    />
                    <Route
                      path="dns/*"
                      element={
                        <Suspense fallback={routeChunkFallback}>
                          <AppCenterDns />
                        </Suspense>
                      }
                    />
                    <Route
                      path="tencent-cloud"
                      element={
                        <Suspense fallback={routeChunkFallback}>
                          <TencentCloudLayout />
                        </Suspense>
                      }
                    >
                      <Route index element={<Navigate to="overview" replace />} />
                      <Route path="overview" element={
                        <Suspense fallback={routeChunkFallback}><TencentCloudOverview /></Suspense>
                      } />
                      <Route path="cvm" element={
                        <Suspense fallback={routeChunkFallback}><TencentCloudCVM /></Suspense>
                      } />
                      <Route path="lighthouse" element={
                        <Suspense fallback={routeChunkFallback}><TencentCloudLighthouse /></Suspense>
                      } />
                      <Route path="ssl" element={
                        <Suspense fallback={routeChunkFallback}><TencentCloudSSL /></Suspense>
                      } />
                      <Route path="cos" element={
                        <Suspense fallback={routeChunkFallback}><TencentCloudCOS /></Suspense>
                      } />
                      <Route path="cdn" element={
                        <Suspense fallback={routeChunkFallback}><TencentCloudCDN /></Suspense>
                      } />
                      <Route path="cam" element={
                        <Suspense fallback={routeChunkFallback}><TencentCloudCAM /></Suspense>
                      } />
                    </Route>
                    <Route
                      path="qiniu-cloud"
                      element={
                        <Suspense fallback={routeChunkFallback}>
                          <QiniuCloudPage />
                        </Suspense>
                      }
                    />
                    <Route
                      path="upyun-cloud"
                      element={
                        <Suspense fallback={routeChunkFallback}>
                          <UpyunCloudPage />
                        </Suspense>
                      }
                    />

                    <Route
                      path="cloud-vm/bootstrap"
                      element={
                        <Suspense fallback={routeChunkFallback}>
                          <AppCenterCloudVmBootstrap />
                        </Suspense>
                      }
                    />
                    <Route
                      path="cloud-vm/:id"
                      element={
                        <Suspense fallback={routeChunkFallback}>
                          <AppCenterCloudVmDetail />
                        </Suspense>
                      }
                    />
                    <Route
                      path="cloud-vm"
                      element={
                        <Suspense fallback={routeChunkFallback}>
                          <AppCenterCloudVm />
                        </Suspense>
                      }
                    />
                  </Route>
                  <Route
                    path="ai-inspect"
                    element={
                      <RouteSuspense>
                        <AiInspectLayoutPage />
                      </RouteSuspense>
                    }
                  >
                    <Route index element={<Navigate to="dashboard" replace />} />
                    <Route
                      path="dashboard"
                      element={
                        <RouteSuspense>
                          <AiInspectDashboardPage />
                        </RouteSuspense>
                      }
                    />
                    <Route
                      path="reports/*"
                      element={
                        <RouteSuspense>
                          <AiInspectReportsPage />
                        </RouteSuspense>
                      }
                    />
                    <Route
                      path="configure"
                      element={
                        <RouteSuspense>
                          <AiInspectHomePage />
                        </RouteSuspense>
                      }
                    />
                    <Route
                      path="assistant"
                      element={
                        <RouteSuspense>
                          <AiAssistantPage />
                        </RouteSuspense>
                      }
                    />
                    <Route
                      path="monitoring"
                      element={
                        <RouteSuspense>
                          <AiInspectMonitoringPage />
                        </RouteSuspense>
                      }
                    />
                    <Route
                      path="alerts"
                      element={
                        <RouteSuspense>
                          <AiInspectAlertsPage />
                        </RouteSuspense>
                      }
                    />
                    <Route
                      path="logs"
                      element={
                        <RouteSuspense>
                          <AiInspectLogsPage />
                        </RouteSuspense>
                      }
                    />
                    <Route
                      path="logs/detail"
                      element={
                        <RouteSuspense>
                          <AiInspectLogDetailsPage />
                        </RouteSuspense>
                      }
                    />
                    <Route
                      path="log-collection"
                      element={
                        <RouteSuspense>
                          <AiInspectLogCollectionPage />
                        </RouteSuspense>
                      }
                    />
                  </Route>
                  <Route
                    path="mesh"
                    element={
                      <RouteSuspense>
                        <MeshPage />
                      </RouteSuspense>
                    }
                  />
                  <Route path="vcenter/dashboard" element={<VCenterHubDashboard />} />
                  <Route path="vcenter/gpu" element={<VCenterGpuDashboard />} />
                  <Route path="vcenter/hosts/:moref" element={<VCenterHostDetail />} />
                  <Route path="vcenter/hosts" element={<VCenterHosts />} />
                  <Route
                    path="vcenter/cloud/:hostId/ssh"
                    element={
                      <ViewerRedirect to="/cluster/vcenter/dashboard">
                        <CloudHostSshPage />
                      </ViewerRedirect>
                    }
                  />
                  <Route
                    path="vcenter/cloud"
                    element={
                      <ViewerRedirect to="/cluster/vcenter/dashboard">
                        <CloudHosts />
                      </ViewerRedirect>
                    }
                  />
                  <Route path="vcenter/settings" element={<VCenterSettings />} />
                  <Route path="vcenter/bastion/*" element={<LegacyVcenterBastionRedirect />} />
                  <Route
                    path="bastion"
                    element={
                      <ViewerRedirect to="/cluster/vcenter/dashboard">
                        <BastionLayout />
                      </ViewerRedirect>
                    }
                  >
                    <Route index element={<BastionConsoleHome />} />
                    <Route
                      path="session"
                      element={
                        <Suspense fallback={routeChunkFallback}>
                          <VCenterBastionSession />
                        </Suspense>
                      }
                    />
                    <Route path="admin" element={<VCenterBastionAdmin />} />
                    <Route path="console/:moref" element={<VCenterBastionConsoleEmbed />} />
                  </Route>
                  <Route
                    path="vcenter/tools/ip-scan"
                    element={
                      <ViewerRedirect to="/cluster/vcenter/dashboard">
                        <ToolNetworkIpScan />
                      </ViewerRedirect>
                    }
                  />
                  <Route path="vcenter/router" element={<VCenterIkuaiRouterPage />} />
                  <Route path="vcenter" element={<VCenterList />} />
                  <Route
                    path="vcenter/:moref"
                    element={
                      <Suspense fallback={routeChunkFallback}>
                        <VCenterVMDetail />
                      </Suspense>
                    }
                  />
                  </Route>
                </Route>
                <Route path="*" element={<NotFound />} />
              </Route>
            </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;

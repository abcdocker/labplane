package internal

// 全平台 AI 助手扩展工具集：K8s YAML apply / 资源删除、vCenter 虚拟机电源管理、
// 应用中心概览、Prometheus 时序查询。写操作统一走 operate 模式 + 审计。

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/vmware/govmomi"
	"github.com/vmware/govmomi/find"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// ─── K8s 扩展 ───

func aiK8sApplyYAML(app *ServerApp, yamlDoc string) (string, error) {
	if app.K8s() == nil {
		return "", fmt.Errorf("K8s 未连接")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	if err := applyKubernetesYAMLList(ctx, app.K8s(), yamlDoc, true); err != nil {
		return "", err
	}
	docs := len(splitYAMLDocuments(yamlDoc))
	return fmt.Sprintf("YAML 已应用（%d 个文档）", docs), nil
}

func aiK8sDeleteResource(app *ServerApp, kind, namespace, name string) (string, error) {
	if app.K8s() == nil {
		return "", fmt.Errorf("K8s 未连接")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	ns := strings.TrimSpace(namespace)
	var err error
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case "pod":
		err = app.K8s().CoreV1().Pods(ns).Delete(ctx, name, metav1.DeleteOptions{})
	case "deployment":
		err = app.K8s().AppsV1().Deployments(ns).Delete(ctx, name, metav1.DeleteOptions{})
	case "service":
		err = app.K8s().CoreV1().Services(ns).Delete(ctx, name, metav1.DeleteOptions{})
	case "configmap":
		err = app.K8s().CoreV1().ConfigMaps(ns).Delete(ctx, name, metav1.DeleteOptions{})
	case "statefulset":
		err = app.K8s().AppsV1().StatefulSets(ns).Delete(ctx, name, metav1.DeleteOptions{})
	case "daemonset":
		err = app.K8s().AppsV1().DaemonSets(ns).Delete(ctx, name, metav1.DeleteOptions{})
	default:
		return "", fmt.Errorf("不支持的资源类型: %s（支持 pod/deployment/service/configmap/statefulset/daemonset）", kind)
	}
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("已删除 %s/%s（%s）", ns, name, kind), nil
}

// ─── vCenter 虚拟机 ───

type aiVCenterVM struct {
	Moref  string
	Name   string
	Power  string
	GuestIP string
}

func aiVCenterListVMs(app *ServerApp) ([]aiVCenterVM, error) {
	if app.VCenter() == nil || !app.Cfg().vCenterConfigured() {
		return nil, fmt.Errorf("vCenter 未配置")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	payload, _, _, err := vcenterVMListSnapshotBytes(ctx, app, false, false)
	if err != nil {
		return nil, err
	}
	var env struct {
		VMs []map[string]any `json:"vms"`
	}
	if err := json.Unmarshal(payload, &env); err != nil {
		return nil, err
	}
	out := make([]aiVCenterVM, 0, len(env.VMs))
	for _, vm := range env.VMs {
		entry := aiVCenterVM{}
		for k, v := range vm {
			lk := strings.ToLower(k)
			vs := fmt.Sprint(v)
			switch {
			case strings.Contains(lk, "moref"):
				if entry.Moref == "" {
					entry.Moref = vs
				}
			case lk == "name":
				entry.Name = vs
			case strings.Contains(lk, "power"):
				entry.Power = vs
			case strings.Contains(lk, "ip") && entry.GuestIP == "":
				entry.GuestIP = vs
			}
		}
		if entry.Name != "" || entry.Moref != "" {
			out = append(out, entry)
		}
	}
	return out, nil
}

// aiVCenterResolveVM 按名称（忽略大小写）或 moref 定位虚拟机。
func aiVCenterResolveVM(app *ServerApp, nameOrMoref string) (aiVCenterVM, error) {
	vms, err := aiVCenterListVMs(app)
	if err != nil {
		return aiVCenterVM{}, err
	}
	key := strings.ToLower(strings.TrimSpace(nameOrMoref))
	for _, vm := range vms {
		if strings.EqualFold(vm.Name, key) || strings.EqualFold(vm.Moref, key) {
			return vm, nil
		}
	}
	return aiVCenterVM{}, fmt.Errorf("未找到虚拟机 %q（请先用 vc_list_vms 核对名称）", nameOrMoref)
}

func aiVCenterVMPower(app *ServerApp, vmRef aiVCenterVM, action string) (string, error) {
	if app.VCenter() == nil {
		return "", fmt.Errorf("vCenter 未配置")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	var result string
	err := app.VCenter().WithClientRetry(ctx, func(client *govmomi.Client) error {
		f := find.NewFinder(client.Client, true)
		dcs, err := f.DatacenterList(ctx, "*")
		if err != nil {
			return err
		}
		var lastErr error
		for _, dc := range dcs {
			f.SetDatacenter(dc)
			vm, err := f.VirtualMachine(ctx, vmRef.Moref)
			if err != nil {
				lastErr = err
				continue
			}
			switch action {
			case "on":
				_, err = vm.PowerOn(ctx)
			case "off":
				_, err = vm.PowerOff(ctx)
			case "reset":
				_, err = vm.Reset(ctx)
			case "suspend":
				_, err = vm.Suspend(ctx)
			case "shutdown_guest":
				err = vm.ShutdownGuest(ctx)
			case "reboot_guest":
				err = vm.RebootGuest(ctx)
			default:
				return fmt.Errorf("不支持的操作: %s", action)
			}
			if err != nil {
				lastErr = err
				continue
			}
			result = fmt.Sprintf("已对 %s（%s）执行 %s", vmRef.Name, vmRef.Moref, action)
			return nil
		}
		return lastErr
	})
	if err != nil {
		return "", err
	}
	return result, nil
}

// ─── 应用中心概览 ───

func aiAppCenterOverview(app *ServerApp) (string, error) {
	db := app.MySQLDB()
	if db == nil {
		return "未配置 MySQL，无法读取应用中心实例表。", nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	var b strings.Builder
	for _, q := range []struct {
		label string
		table string
	}{
		{"Redis", "kubebt_app_redis_instances"},
		{"OpenSearch", "kubebt_app_opensearch_instances"},
		{"云主机", "kubebt_app_cloud_vm_instances"},
	} {
		var n int
		if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM "+q.table).Scan(&n); err != nil {
			fmt.Fprintf(&b, "- %s：查询失败 %v\n", q.label, err)
			continue
		}
		fmt.Fprintf(&b, "- %s 实例：%d 个\n", q.label, n)
	}
	return b.String(), nil
}

// aiAssistantPlatformTools 全平台扩展工具。
func aiAssistantPlatformTools() []aiAssistantTool {
	tools := []aiAssistantTool{
		{
			Name:        "k8s_apply_yaml",
			Description: "应用 Kubernetes YAML（kubectl apply 语义，支持多文档；用于创建/更新工作负载、服务、ConfigMap 等）",
			Parameters: obj(map[string]any{"yaml": strProp("完整的 Kubernetes YAML 文本")}, "yaml"),
			Write:       true,
			Exec: func(app *ServerApp, a map[string]any) (string, error) {
				return aiK8sApplyYAML(app, strArg(a, "yaml"))
			},
		},
		{
			Name:        "k8s_delete_resource",
			Description: "删除指定 K8s 资源（pod/deployment/service/configmap/statefulset/daemonset）",
			Parameters: obj(map[string]any{
				"kind":      strProp("资源类型"),
				"namespace": strProp("命名空间"),
				"name":      strProp("资源名称"),
			}, "kind", "namespace", "name"),
			Write: true,
			Exec: func(app *ServerApp, a map[string]any) (string, error) {
				return aiK8sDeleteResource(app, strArg(a, "kind"), strArg(a, "namespace"), strArg(a, "name"))
			},
		},
		{
			Name:        "prom_range_query",
			Description: "执行 PromQL 区间查询，返回近 N 分钟的时间序列（用于趋势/监控分析）",
			Parameters: obj(map[string]any{
				"expr":    strProp("PromQL 表达式"),
				"minutes": intProp("回看分钟数，默认 60"),
			}, "expr"),
			Exec: func(app *ServerApp, a map[string]any) (string, error) {
				minutes := intArg(a, "minutes", 60)
				end := time.Now()
				body, status, err := prometheusFetchRange(app.Cfg(), "k8s", strArg(a, "expr"),
					end.Add(-time.Duration(minutes)*time.Minute).Format(time.RFC3339),
					end.Format(time.RFC3339), "60s")
				if err != nil {
					return "", err
				}
				if status >= 400 {
					return "", fmt.Errorf("Prometheus HTTP %d", status)
				}
				var wrap struct {
					Data struct {
						Result []struct {
							Metric map[string]string `json:"metric"`
							Values [][]any           `json:"values"`
						} `json:"result"`
					} `json:"data"`
				}
				if err := json.Unmarshal(body, &wrap); err != nil {
					return "", err
				}
				var b strings.Builder
				for _, r := range wrap.Data.Result {
					label := inspectSeriesObjectLabel(r.Metric)
					var last float64
					for _, v := range r.Values {
						if f, ok := promFloatFromJSONSample(v[1]); ok {
							last = f
						}
					}
					fmt.Fprintf(&b, "%s 最新值 %s（%d 个采样点）\n", label, strconvFormatFloat(last), len(r.Values))
				}
				if b.Len() == 0 {
					return "（无数据）", nil
				}
				return b.String(), nil
			},
		},
		{
			Name:        "app_center_overview",
			Description: "读取应用中心（Redis/OpenSearch/云主机）实例数量概览",
			Parameters:  obj(map[string]any{}),
			Exec: func(app *ServerApp, _ map[string]any) (string, error) {
				return aiAppCenterOverview(app)
			},
		},
		{
			Name:        "vc_list_vms",
			Description: "列出 vCenter 虚拟机（名称/电源状态/IP），用于后续电源操作",
			Parameters:  obj(map[string]any{}),
			Exec: func(app *ServerApp, _ map[string]any) (string, error) {
				vms, err := aiVCenterListVMs(app)
				if err != nil {
					return "", err
				}
				var b strings.Builder
				b.WriteString("name\tpower\tip\n")
				for _, vm := range vms {
					b.WriteString(fmt.Sprintf("%s\t%s\t%s\n", vm.Name, vm.Power, vm.GuestIP))
				}
				return b.String(), nil
			},
		},
		{
			Name:        "vc_vm_power",
			Description: "vCenter 虚拟机电源操作：on/off/suspend/reset/shutdown_guest/reboot_guest（vm 用名称，可先 vc_list_vms 查询）",
			Parameters: obj(map[string]any{
				"vm":     strProp("虚拟机名称或 moref"),
				"action": strProp("on|off|suspend|reset|shutdown_guest|reboot_guest"),
			}, "vm", "action"),
			Write: true,
			Exec: func(app *ServerApp, a map[string]any) (string, error) {
				vmRef, err := aiVCenterResolveVM(app, strArg(a, "vm"))
				if err != nil {
					return "", err
				}
				return aiVCenterVMPower(app, vmRef, strings.TrimSpace(strArg(a, "action")))
			},
		},
	}
	return tools
}

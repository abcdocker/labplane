package internal

// vcenter_event_worker.go — 定期从 vCenter EventManager 拉取 VM 电源与配置变更事件，
// 落盘到 PlatformKV（最多保留 500 条），并暴露查询接口供巡检和前端消费。

import (
	"context"
	"encoding/json"
	"log"
	"reflect"
	"strings"
	"sync"
	"time"

	"github.com/vmware/govmomi"
	"github.com/vmware/govmomi/vim25/methods"
	"github.com/vmware/govmomi/vim25/types"
)

const (
	kvKeyVCenterVMEvents = "kubebt_vcenter_vm_events_v1"
	vcenterEventMaxStore = 500
	vcenterEventPollInterval = 2 * time.Minute
)

// vcenterVMEventRecord 是落盘的单条事件记录。
type vcenterVMEventRecord struct {
	Key       int32  `json:"key"`
	EventType string `json:"eventType"` // VmPoweredOnEvent / VmPoweredOffEvent / VmResetEvent / VmReconfiguredEvent / VmSuspendedEvent / VmMigratedEvent
	VmName    string `json:"vmName"`
	VmMoRef   string `json:"vmMoRef"`
	HostName  string `json:"hostName,omitempty"`
	UserName  string `json:"userName,omitempty"`
	Message   string `json:"message,omitempty"`
	CreatedAt string `json:"createdAt"` // RFC3339，UTC
}

// vcenterEventPayload 是 KV 中存储的完整 payload。
type vcenterEventPayload struct {
	UpdatedAt string                 `json:"updatedAt"`
	Events    []vcenterVMEventRecord `json:"events"`
}

// vcenterEventWorkerMu 防止并发写 KV。
var vcenterEventWorkerMu sync.Mutex

// StartVCenterEventWorker 启动后台协程，每 2 分钟拉取一次 vCenter VM 事件。
func StartVCenterEventWorker(app *ServerApp) {
	go func() {
		// 首次延迟 15s，等 vCenter session 完成初始化。
		time.Sleep(15 * time.Second)
		pollVCenterEvents(app)
		ticker := time.NewTicker(vcenterEventPollInterval)
		defer ticker.Stop()
		for range ticker.C {
			pollVCenterEvents(app)
		}
	}()
	log.Println("vcenter-event-worker: 已启动（VM 电源与配置事件采集，间隔 2m）")
}

// vcenterWatchedEventTypes 是我们关心的 vCenter 事件类型名（govmomi type name）。
var vcenterWatchedEventTypes = []string{
	"VmPoweredOnEvent",
	"VmPoweredOffEvent",
	"VmResetEvent",
	"VmReconfiguredEvent",
	"VmSuspendedEvent",
	"VmMigratedEvent",
}

func pollVCenterEvents(app *ServerApp) {
	vc := app.VCenter()
	if vc == nil || !vc.cfg.vCenterConfigured() {
		return
	}
	kv := app.PlatformKV()
	if kv == nil {
		return
	}

	// 读取上次已持久化的最大 Key，只拉取新事件。
	lastKey := loadVCenterEventLastKey(kv)

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	var records []vcenterVMEventRecord
	err := vc.WithClientRetry(ctx, func(client *govmomi.Client) error {
		em := client.ServiceContent.EventManager
		if em == nil {
			return nil
		}

		// 构造过滤条件：最近 24 小时，仅关心的事件类型。
		since := time.Now().UTC().Add(-24 * time.Hour)
		filter := types.EventFilterSpec{
			EventTypeId: vcenterWatchedEventTypes,
			Time: &types.EventFilterSpecByTime{
				BeginTime: &since,
			},
		}

		req := types.QueryEvents{
			This:   *em,
			Filter: filter,
		}
		res, err := methods.QueryEvents(ctx, client.Client, &req)
		if err != nil {
			return err
		}

		for _, baseEv := range res.Returnval {
			ev := baseEv.GetEvent()
			if ev == nil || ev.Key <= lastKey {
				continue
			}
			typeName := reflect.TypeOf(baseEv).Elem().Name()
			vmName := ""
			vmMoRef := ""
			if ev.Vm != nil {
				vmName = strings.TrimSpace(ev.Vm.Name)
				vmMoRef = ev.Vm.Vm.Value
			}
			hostName := ""
			if ev.Host != nil {
				hostName = strings.TrimSpace(ev.Host.Name)
			}
			records = append(records, vcenterVMEventRecord{
				Key:       ev.Key,
				EventType: typeName,
				VmName:    vmName,
				VmMoRef:   vmMoRef,
				HostName:  hostName,
				UserName:  strings.TrimSpace(ev.UserName),
				Message:   strings.TrimSpace(ev.FullFormattedMessage),
				CreatedAt: ev.CreatedTime.UTC().Format(time.RFC3339),
			})
		}
		return nil
	})
	if err != nil {
		log.Printf("vcenter-event-worker: 拉取事件失败: %v", err)
		return
	}
	if len(records) == 0 {
		return
	}

	vcenterEventWorkerMu.Lock()
	defer vcenterEventWorkerMu.Unlock()

	// 合并到已有记录，去重，按 CreatedAt 降序，截留 500 条。
	existing := loadVCenterEventPayload(kv)
	merged := mergeVCenterEventRecords(existing.Events, records)
	payload := vcenterEventPayload{
		UpdatedAt: time.Now().UTC().Format(time.RFC3339),
		Events:    merged,
	}
	js, err := json.Marshal(payload)
	if err != nil {
		return
	}
	if err := kv.Set(kvKeyVCenterVMEvents, string(js)); err != nil {
		log.Printf("vcenter-event-worker: 写入 KV 失败: %v", err)
	} else {
		log.Printf("vcenter-event-worker: 新增 %d 条 VM 事件，共存 %d 条", len(records), len(merged))
	}
}

// loadVCenterEventLastKey 返回 KV 中已存储的最大 event key（用于增量拉取）。
func loadVCenterEventLastKey(kv PlatformKV) int32 {
	p := loadVCenterEventPayload(kv)
	var max int32
	for _, r := range p.Events {
		if r.Key > max {
			max = r.Key
		}
	}
	return max
}

// loadVCenterEventPayload 从 KV 中读取事件列表；失败返回空结构。
func loadVCenterEventPayload(kv PlatformKV) vcenterEventPayload {
	raw, ok := kv.Get(kvKeyVCenterVMEvents)
	if !ok || strings.TrimSpace(raw) == "" {
		return vcenterEventPayload{}
	}
	var p vcenterEventPayload
	_ = json.Unmarshal([]byte(raw), &p)
	return p
}

// mergeVCenterEventRecords 合并新旧记录，按 CreatedAt 降序排列，去重，截 500 条。
func mergeVCenterEventRecords(existing, incoming []vcenterVMEventRecord) []vcenterVMEventRecord {
	seen := make(map[int32]bool, len(existing))
	out := make([]vcenterVMEventRecord, 0, len(existing)+len(incoming))
	for _, r := range existing {
		if !seen[r.Key] {
			seen[r.Key] = true
			out = append(out, r)
		}
	}
	for _, r := range incoming {
		if !seen[r.Key] {
			seen[r.Key] = true
			out = append(out, r)
		}
	}
	// 按 CreatedAt 降序（最新在前）
	for i := 0; i < len(out)-1; i++ {
		for j := i + 1; j < len(out); j++ {
			if out[i].CreatedAt < out[j].CreatedAt {
				out[i], out[j] = out[j], out[i]
			}
		}
	}
	if len(out) > vcenterEventMaxStore {
		out = out[:vcenterEventMaxStore]
	}
	return out
}

// GetVCenterVMEvents 供 handler 和巡检调用。
// limit<=0 时返回全部（最多 500 条）；sinceHours<=0 时不限时间。
func GetVCenterVMEvents(kv PlatformKV, limit int, sinceHours int) ([]vcenterVMEventRecord, string) {
	if kv == nil {
		return nil, ""
	}
	p := loadVCenterEventPayload(kv)
	out := p.Events
	if sinceHours > 0 {
		cutoff := time.Now().UTC().Add(-time.Duration(sinceHours) * time.Hour).Format(time.RFC3339)
		filtered := out[:0]
		for _, r := range out {
			if r.CreatedAt >= cutoff {
				filtered = append(filtered, r)
			}
		}
		out = filtered
	}
	if limit > 0 && len(out) > limit {
		out = out[:limit]
	}
	return out, p.UpdatedAt
}

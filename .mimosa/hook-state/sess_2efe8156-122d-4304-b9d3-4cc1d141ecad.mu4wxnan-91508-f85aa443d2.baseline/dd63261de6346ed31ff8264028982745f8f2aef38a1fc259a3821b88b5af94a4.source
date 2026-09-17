package internal

import (
	"context"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/vmware/govmomi"
	"github.com/vmware/govmomi/property"
	"github.com/vmware/govmomi/vim25/methods"
	"github.com/vmware/govmomi/vim25/mo"
	"github.com/vmware/govmomi/vim25/types"
)

func hostAlarmStates(ctx context.Context, c *govmomi.Client, hostRef types.ManagedObjectReference) ([]gin.H, string) {
	am := c.ServiceContent.AlarmManager
	if am == nil {
		return []gin.H{}, "vCenter 未返回 AlarmManager，无法同步告警"
	}
	req := types.GetAlarmState{
		This:   *am,
		Entity: hostRef,
	}
	res, err := methods.GetAlarmState(ctx, c.Client, &req)
	if err != nil {
		return nil, err.Error()
	}
	pc := property.DefaultCollector(c.Client)
	out := make([]gin.H, 0, len(res.Returnval))
	for _, s := range res.Returnval {
		name := ""
		var a mo.Alarm
		if err := pc.RetrieveOne(ctx, s.Alarm, []string{"info"}, &a); err == nil {
			name = strings.TrimSpace(a.Info.Name)
		}
		if name == "" {
			name = "Alarm-" + s.Alarm.Value
		}
		row := gin.H{
			"name":          name,
			"key":           s.Key,
			"overallStatus": string(s.OverallStatus),
			"time":          s.Time.UTC().Format(time.RFC3339),
			"alarmMoId":     s.Alarm.Value,
		}
		if s.Acknowledged != nil {
			row["acknowledged"] = *s.Acknowledged
		}
		if strings.TrimSpace(s.AcknowledgedByUser) != "" {
			row["acknowledgedByUser"] = s.AcknowledgedByUser
		}
		out = append(out, row)
	}
	return out, ""
}

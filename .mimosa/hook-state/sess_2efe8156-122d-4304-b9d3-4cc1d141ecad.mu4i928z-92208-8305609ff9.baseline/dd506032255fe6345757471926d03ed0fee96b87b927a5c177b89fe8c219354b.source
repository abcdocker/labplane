package internal

import (
	"context"
	"fmt"
	"strings"

	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/kmsg"
)

func appKafkaListConsumerGroups(ctx context.Context, cl *kgo.Client) ([]map[string]interface{}, error) {
	lg := kmsg.NewPtrListGroupsRequest()
	lg.Version = 3
	resp, err := cl.Request(ctx, lg)
	if err != nil {
		return nil, err
	}
	lgr, ok := resp.(*kmsg.ListGroupsResponse)
	if !ok {
		return nil, fmt.Errorf("非 ListGroups 响应")
	}
	if lgr.ErrorCode != 0 {
		return nil, fmt.Errorf("ListGroups: code=%d", lgr.ErrorCode)
	}
	var ids []string
	for _, g := range lgr.Groups {
		if strings.TrimSpace(g.Group) != "" {
			ids = append(ids, g.Group)
		}
	}
	if len(ids) == 0 {
		return []map[string]interface{}{}, nil
	}

	const batch = 40
	var out []map[string]interface{}
	for i := 0; i < len(ids); i += batch {
		j := i + batch
		if j > len(ids) {
			j = len(ids)
		}
		chunk := ids[i:j]
		dreq := kmsg.NewPtrDescribeGroupsRequest()
		dreq.Version = 5
		dreq.Groups = chunk
		dresp, err := cl.Request(ctx, dreq)
		if err != nil {
			return nil, err
		}
		dgr, ok := dresp.(*kmsg.DescribeGroupsResponse)
		if !ok {
			return nil, fmt.Errorf("非 DescribeGroups 响应")
		}
		for _, g := range dgr.Groups {
			members := make([]map[string]interface{}, 0, len(g.Members))
			for _, m := range g.Members {
				members = append(members, map[string]interface{}{
					"memberId":   m.MemberID,
					"clientId":   m.ClientID,
					"clientHost": m.ClientHost,
				})
			}
			out = append(out, map[string]interface{}{
				"groupId":       g.Group,
				"state":         g.State,
				"protocolType":  g.ProtocolType,
				"protocol":      g.Protocol,
				"errorCode":     g.ErrorCode,
				"memberCount":   len(g.Members),
				"membersSample": members,
			})
		}
	}
	return out, nil
}

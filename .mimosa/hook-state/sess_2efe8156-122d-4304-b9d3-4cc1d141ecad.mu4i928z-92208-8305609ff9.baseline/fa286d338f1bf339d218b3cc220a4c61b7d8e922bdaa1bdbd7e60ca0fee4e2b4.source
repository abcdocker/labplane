package internal

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/kmsg"
	"github.com/twmb/franz-go/pkg/sasl/plain"
	"github.com/twmb/franz-go/pkg/sasl/scram"
)

func appKafkaClusterMetadata(ctx context.Context, cl *kgo.Client) (map[string]interface{}, error) {
	req := kmsg.NewPtrMetadataRequest()
	req.Version = 11
	req.Topics = nil
	resp, err := cl.Request(ctx, req)
	if err != nil {
		return nil, err
	}
	meta, ok := resp.(*kmsg.MetadataResponse)
	if !ok {
		return nil, fmt.Errorf("非 Metadata 响应")
	}
	var brokers []map[string]interface{}
	for _, b := range meta.Brokers {
		brokers = append(brokers, map[string]interface{}{
			"nodeId": b.NodeID,
			"host":   b.Host,
			"port":   b.Port,
			"rack":   b.Rack,
		})
	}
	out := map[string]interface{}{
		"brokers":      brokers,
		"controllerId": meta.ControllerID,
	}
	if meta.ClusterID != nil {
		out["clusterId"] = *meta.ClusterID
	}
	return out, nil
}

func appKafkaDescribeTopicConfigs(ctx context.Context, cl *kgo.Client, topic string) ([]map[string]interface{}, error) {
	req := kmsg.NewPtrDescribeConfigsRequest()
	req.Version = 4
	req.Resources = []kmsg.DescribeConfigsRequestResource{{
		ResourceType: kmsg.ConfigResourceTypeTopic,
		ResourceName: topic,
		ConfigNames:  nil,
	}}
	resp, err := cl.Request(ctx, req)
	if err != nil {
		return nil, err
	}
	dr, ok := resp.(*kmsg.DescribeConfigsResponse)
	if !ok {
		return nil, fmt.Errorf("非 DescribeConfigs 响应")
	}
	var out []map[string]interface{}
	for _, r := range dr.Resources {
		if r.ErrorCode != 0 {
			return nil, fmt.Errorf("DescribeConfigs: %s (%d)", kafkaDerefStrPtr(r.ErrorMessage), r.ErrorCode)
		}
		for _, e := range r.Configs {
			row := map[string]interface{}{
				"name":        e.Name,
				"value":       kafkaDerefStrPtr(e.Value),
				"readOnly":    e.ReadOnly,
				"isDefault":   e.IsDefault,
				"isSensitive": e.IsSensitive,
				"source":      int8(e.Source),
			}
			out = append(out, row)
		}
	}
	return out, nil
}

func kafkaDerefStrPtr(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func appKafkaIncrementalAlterTopicConfigs(ctx context.Context, cl *kgo.Client, topic string, entries map[string]string) error {
	if len(entries) == 0 {
		return fmt.Errorf("entries 为空")
	}
	var cfgs []kmsg.IncrementalAlterConfigsRequestResourceConfig
	for k, v := range entries {
		k = strings.TrimSpace(k)
		if k == "" {
			continue
		}
		val := v
		cfgs = append(cfgs, kmsg.IncrementalAlterConfigsRequestResourceConfig{
			Name:  k,
			Op:    kmsg.IncrementalAlterConfigOpSet,
			Value: &val,
		})
	}
	if len(cfgs) == 0 {
		return fmt.Errorf("无有效配置项")
	}
	req := kmsg.NewPtrIncrementalAlterConfigsRequest()
	req.Version = 1
	req.Resources = []kmsg.IncrementalAlterConfigsRequestResource{{
		ResourceType: kmsg.ConfigResourceTypeTopic,
		ResourceName: topic,
		Configs:      cfgs,
	}}
	resp, err := cl.Request(ctx, req)
	if err != nil {
		return err
	}
	ar, ok := resp.(*kmsg.IncrementalAlterConfigsResponse)
	if !ok {
		return fmt.Errorf("非 IncrementalAlterConfigs 响应")
	}
	for _, r := range ar.Resources {
		if r.ErrorCode != 0 {
			return fmt.Errorf("AlterConfig: %s (%d)", kafkaDerefStrPtr(r.ErrorMessage), r.ErrorCode)
		}
	}
	return nil
}

func appKafkaOffsetFetchAllCommitted(ctx context.Context, cl *kgo.Client, group string) (map[string]map[int32]int64, error) {
	req := kmsg.NewPtrOffsetFetchRequest()
	req.Version = 7
	req.Group = group
	req.Topics = nil
	resp, err := cl.Request(ctx, req)
	if err != nil {
		return nil, err
	}
	of, ok := resp.(*kmsg.OffsetFetchResponse)
	if !ok {
		return nil, fmt.Errorf("非 OffsetFetch 响应")
	}
	if of.ErrorCode != 0 {
		return nil, fmt.Errorf("OffsetFetch: %d", of.ErrorCode)
	}
	out := make(map[string]map[int32]int64)
	for _, t := range of.Topics {
		topic := t.Topic
		if topic == "" {
			continue
		}
		m := make(map[int32]int64)
		for _, p := range t.Partitions {
			if p.ErrorCode != 0 {
				continue
			}
			m[p.Partition] = p.Offset
		}
		if len(m) > 0 {
			out[topic] = m
		}
	}
	return out, nil
}

func appKafkaListLatestOffsets(ctx context.Context, cl *kgo.Client, topicParts map[string][]int32) (map[string]map[int32]int64, error) {
	if len(topicParts) == 0 {
		return map[string]map[int32]int64{}, nil
	}
	req := kmsg.NewPtrListOffsetsRequest()
	req.Version = 7
	req.IsolationLevel = 0
	var topics []kmsg.ListOffsetsRequestTopic
	for topic, parts := range topicParts {
		var lp []kmsg.ListOffsetsRequestTopicPartition
		for _, p := range parts {
			lp = append(lp, kmsg.ListOffsetsRequestTopicPartition{
				Partition: p,
				Timestamp: -1,
			})
		}
		topics = append(topics, kmsg.ListOffsetsRequestTopic{Topic: topic, Partitions: lp})
	}
	req.Topics = topics
	resp, err := cl.Request(ctx, req)
	if err != nil {
		return nil, err
	}
	lr, ok := resp.(*kmsg.ListOffsetsResponse)
	if !ok {
		return nil, fmt.Errorf("非 ListOffsets 响应")
	}
	out := make(map[string]map[int32]int64)
	for _, t := range lr.Topics {
		m := make(map[int32]int64)
		for _, p := range t.Partitions {
			if p.ErrorCode != 0 {
				continue
			}
			m[p.Partition] = p.Offset
		}
		if len(m) > 0 {
			out[t.Topic] = m
		}
	}
	return out, nil
}

func appKafkaListOffsetAt(ctx context.Context, cl *kgo.Client, topic string, partition int32, ts int64) (int64, error) {
	req := kmsg.NewPtrListOffsetsRequest()
	req.Version = 7
	req.IsolationLevel = 0
	req.Topics = []kmsg.ListOffsetsRequestTopic{{
		Topic: topic,
		Partitions: []kmsg.ListOffsetsRequestTopicPartition{{
			Partition: partition,
			Timestamp: ts,
		}},
	}}
	resp, err := cl.Request(ctx, req)
	if err != nil {
		return -1, err
	}
	lr, ok := resp.(*kmsg.ListOffsetsResponse)
	if !ok {
		return -1, fmt.Errorf("非 ListOffsets 响应")
	}
	for _, t := range lr.Topics {
		if t.Topic != topic {
			continue
		}
		for _, p := range t.Partitions {
			if p.Partition == partition && p.ErrorCode == 0 {
				return p.Offset, nil
			}
		}
	}
	return -1, fmt.Errorf("未返回 offset")
}

// appKafkaConsumerGroupLag 返回消费者组各分区滞后（highWatermark - committed）。
func appKafkaConsumerGroupLag(ctx context.Context, cl *kgo.Client, group string) (map[string]interface{}, error) {
	dreq := kmsg.NewPtrDescribeGroupsRequest()
	dreq.Version = 5
	dreq.Groups = []string{group}
	dresp, err := cl.Request(ctx, dreq)
	if err != nil {
		return nil, err
	}
	dgr, ok := dresp.(*kmsg.DescribeGroupsResponse)
	if !ok {
		return nil, fmt.Errorf("非 DescribeGroups 响应")
	}
	var gstate, proto string
	for _, g := range dgr.Groups {
		if g.Group == group {
			gstate = g.State
			proto = g.Protocol
			break
		}
	}

	committed, err := appKafkaOffsetFetchAllCommitted(ctx, cl, group)
	if err != nil {
		return nil, err
	}
	topicParts := make(map[string][]int32)
	for topic, pm := range committed {
		for part := range pm {
			topicParts[topic] = append(topicParts[topic], part)
		}
	}
	latest, err := appKafkaListLatestOffsets(ctx, cl, topicParts)
	if err != nil {
		return nil, err
	}

	var rows []map[string]interface{}
	for topic, pm := range committed {
		lm := latest[topic]
		for part, coff := range pm {
			hwm := int64(-1)
			if lm != nil {
				hwm = lm[part]
			}
			lag := int64(-1)
			if hwm >= 0 && coff >= 0 {
				lag = hwm - coff
				if lag < 0 {
					lag = 0
				}
			}
			rows = append(rows, map[string]interface{}{
				"topic":     topic,
				"partition": part,
				"committed": coff,
				"logEnd":    hwm,
				"lag":       lag,
			})
		}
	}
	return map[string]interface{}{
		"group":      group,
		"state":      gstate,
		"protocol":   proto,
		"partitions": rows,
	}, nil
}

func appKafkaProduceOne(ctx context.Context, cl *kgo.Client, topic string, partition *int32, key, value []byte) (int32, int64, error) {
	r := &kgo.Record{Topic: topic, Key: key, Value: value}
	if partition != nil {
		r.Partition = *partition
	}
	res := cl.ProduceSync(ctx, r)
	rec, err := res.First()
	if err != nil {
		return 0, 0, err
	}
	return rec.Partition, rec.Offset, nil
}

func appKafkaFranzBrowseClient(ctx context.Context, brokers []string, user, pass, mech, topic string, partition int32, start kgo.Offset) (*kgo.Client, error) {
	brokers = strings.Fields(strings.ReplaceAll(strings.Join(brokers, " "), ",", " "))
	var clean []string
	for _, b := range brokers {
		b = strings.TrimSpace(b)
		if b != "" {
			clean = append(clean, b)
		}
	}
	if len(clean) == 0 {
		return nil, fmt.Errorf("bootstrapBrokers 为空")
	}
	m := strings.ToUpper(strings.TrimSpace(mech))
	if m == "" {
		m = "SCRAM-SHA-512"
	}
	u := strings.TrimSpace(user)
	opts := []kgo.Opt{
		kgo.SeedBrokers(clean...),
		kgo.RequestTimeoutOverhead(30 * time.Second),
		kgo.ConsumePartitions(map[string]map[int32]kgo.Offset{
			topic: {partition: start},
		}),
	}
	switch m {
	case "PLAIN":
		opts = append(opts, kgo.SASL(plain.Auth{User: u, Pass: pass}.AsMechanism()))
	case "SCRAM-SHA-256":
		opts = append(opts, kgo.SASL(scram.Auth{User: u, Pass: pass}.AsSha256Mechanism()))
	case "SCRAM-SHA-512":
		opts = append(opts, kgo.SASL(scram.Auth{User: u, Pass: pass}.AsSha512Mechanism()))
	default:
		return nil, fmt.Errorf("不支持的 SASL 机制: %s", m)
	}
	cl, err := kgo.NewClient(opts...)
	if err != nil {
		return nil, err
	}
	_, err = cl.Request(ctx, kmsg.NewPtrMetadataRequest())
	return cl, err
}

func appKafkaBrowseMessages(ctx context.Context, brokers []string, user, pass, mech, topic string, partition int32, startOffset int64, max int) ([]map[string]interface{}, error) {
	if max <= 0 {
		max = 50
	}
	if max > 500 {
		max = 500
	}
	start := kgo.NewOffset().At(startOffset)
	bcl, err := appKafkaFranzBrowseClient(ctx, brokers, user, pass, mech, topic, partition, start)
	if err != nil {
		return nil, err
	}
	defer bcl.Close()

	deadline := time.Now().Add(25 * time.Second)
	var out []map[string]interface{}
	nEmpty := 0
	for len(out) < max && time.Now().Before(deadline) {
		fetches := bcl.PollFetches(ctx)
		if errs := fetches.Errors(); len(errs) > 0 {
			return out, errs[0].Err
		}
		got := false
		fetches.EachRecord(func(r *kgo.Record) {
			if len(out) >= max {
				return
			}
			if r.Topic != topic || r.Partition != partition {
				return
			}
			row := map[string]interface{}{
				"offset":    r.Offset,
				"partition": r.Partition,
			}
			if !r.Timestamp.IsZero() {
				row["timestamp"] = r.Timestamp.UnixMilli()
			}
			if len(r.Key) > 0 {
				row["key"] = string(r.Key)
			}
			if len(r.Value) > 0 {
				row["value"] = string(r.Value)
			}
			out = append(out, row)
			got = true
		})
		if !got {
			nEmpty++
			if nEmpty > 50 {
				break
			}
			time.Sleep(50 * time.Millisecond)
		} else {
			nEmpty = 0
		}
	}
	return out, nil
}

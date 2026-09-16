package internal

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/kmsg"
)

// KafkaTopicThrottleConfig 主题复制限速配置（bytes/sec），-1 表示不限速。
type KafkaTopicThrottleConfig struct {
	// LeaderReplicationThrottledRate leader 副本复制限速（bytes/sec），-1 = 不限制
	LeaderReplicationThrottledRate int64 `json:"leaderReplicationThrottledRate"`
	// FollowerReplicationThrottledRate follower 副本复制限速（bytes/sec），-1 = 不限制
	FollowerReplicationThrottledRate int64 `json:"followerReplicationThrottledRate"`
}

// KafkaClientQuotaConfig 用户级客户端限速配置（bytes/sec），-1 表示不限速。
type KafkaClientQuotaConfig struct {
	User string `json:"user"`
	// ProducerByteRate 生产者限速（bytes/sec），-1 = 不限制
	ProducerByteRate int64 `json:"producerByteRate"`
	// ConsumerByteRate 消费者限速（bytes/sec），-1 = 不限制
	ConsumerByteRate int64 `json:"consumerByteRate"`
}

// appKafkaGetTopicThrottle 读取指定 topic 的复制限速配置。
func appKafkaGetTopicThrottle(ctx context.Context, cl *kgo.Client, topic string) (*KafkaTopicThrottleConfig, error) {
	configs, err := appKafkaDescribeTopicConfigs(ctx, cl, topic)
	if err != nil {
		return nil, err
	}
	cfg := &KafkaTopicThrottleConfig{
		LeaderReplicationThrottledRate:   -1,
		FollowerReplicationThrottledRate: -1,
	}
	for _, entry := range configs {
		name, _ := entry["name"].(string)
		val, _ := entry["value"].(string)
		isDefault, _ := entry["isDefault"].(bool)
		if isDefault || val == "" {
			continue
		}
		switch name {
		case "leader.replication.throttled.rate":
			if v, err := strconv.ParseInt(val, 10, 64); err == nil && v >= 0 {
				cfg.LeaderReplicationThrottledRate = v
			}
		case "follower.replication.throttled.rate":
			if v, err := strconv.ParseInt(val, 10, 64); err == nil && v >= 0 {
				cfg.FollowerReplicationThrottledRate = v
			}
		}
	}
	return cfg, nil
}

// appKafkaSetTopicThrottle 设置 topic 复制限速；rate=-1 时删除该配置（恢复默认无限制）。
func appKafkaSetTopicThrottle(ctx context.Context, cl *kgo.Client, topic string, cfg *KafkaTopicThrottleConfig) error {
	var setCfgs []kmsg.IncrementalAlterConfigsRequestResourceConfig
	var delCfgs []kmsg.IncrementalAlterConfigsRequestResourceConfig

	addEntry := func(key string, rate int64) {
		if rate >= 0 {
			val := strconv.FormatInt(rate, 10)
			setCfgs = append(setCfgs, kmsg.IncrementalAlterConfigsRequestResourceConfig{
				Name:  key,
				Op:    kmsg.IncrementalAlterConfigOpSet,
				Value: &val,
			})
		} else {
			delCfgs = append(delCfgs, kmsg.IncrementalAlterConfigsRequestResourceConfig{
				Name:  key,
				Op:    kmsg.IncrementalAlterConfigOpDelete,
				Value: nil,
			})
		}
	}
	addEntry("leader.replication.throttled.rate", cfg.LeaderReplicationThrottledRate)
	addEntry("follower.replication.throttled.rate", cfg.FollowerReplicationThrottledRate)

	allCfgs := append(setCfgs, delCfgs...)
	if len(allCfgs) == 0 {
		return nil
	}
	req := kmsg.NewPtrIncrementalAlterConfigsRequest()
	req.Version = 1
	req.Resources = []kmsg.IncrementalAlterConfigsRequestResource{{
		ResourceType: kmsg.ConfigResourceTypeTopic,
		ResourceName: topic,
		Configs:      allCfgs,
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
			return fmt.Errorf("设置主题限速失败: %s (%d)", kafkaDerefStrPtr(r.ErrorMessage), r.ErrorCode)
		}
	}
	return nil
}

// appKafkaListClientQuotas 列出所有用户的客户端限速配置。
func appKafkaListClientQuotas(ctx context.Context, cl *kgo.Client) ([]KafkaClientQuotaConfig, error) {
	req := kmsg.NewPtrDescribeClientQuotasRequest()
	req.Version = 0
	req.Strict = false
	req.Components = nil // 不过滤，返回全部配置
	resp, err := cl.Request(ctx, req)
	if err != nil {
		return nil, err
	}
	dr, ok := resp.(*kmsg.DescribeClientQuotasResponse)
	if !ok {
		return nil, fmt.Errorf("非 DescribeClientQuotas 响应")
	}
	if dr.ErrorCode != 0 {
		return nil, fmt.Errorf("DescribeClientQuotas: %s (%d)", kafkaDerefStrPtr(dr.ErrorMessage), dr.ErrorCode)
	}
	var out []KafkaClientQuotaConfig
	for _, entry := range dr.Entries {
		var user string
		for _, e := range entry.Entity {
			if e.Type == "user" && e.Name != nil {
				user = *e.Name
			}
		}
		if user == "" {
			continue
		}
		cfg := KafkaClientQuotaConfig{
			User:             user,
			ProducerByteRate: -1,
			ConsumerByteRate: -1,
		}
		for _, v := range entry.Values {
			switch v.Key {
			case "producer_byte_rate":
				cfg.ProducerByteRate = int64(v.Value)
			case "consumer_byte_rate":
				cfg.ConsumerByteRate = int64(v.Value)
			}
		}
		out = append(out, cfg)
	}
	return out, nil
}

// appKafkaAlterClientQuota 设置或删除指定用户的生产/消费限速；rate=-1 表示删除该配置（不限速）。
func appKafkaAlterClientQuota(ctx context.Context, cl *kgo.Client, cfg *KafkaClientQuotaConfig) error {
	user := strings.TrimSpace(cfg.User)
	if user == "" {
		return fmt.Errorf("user 不能为空")
	}
	addOp := func(key string, rate int64) kmsg.AlterClientQuotasRequestEntryOp {
		if rate >= 0 {
			return kmsg.AlterClientQuotasRequestEntryOp{
				Key:    key,
				Value:  float64(rate),
				Remove: false,
			}
		}
		return kmsg.AlterClientQuotasRequestEntryOp{Key: key, Remove: true}
	}
	ops := []kmsg.AlterClientQuotasRequestEntryOp{
		addOp("producer_byte_rate", cfg.ProducerByteRate),
		addOp("consumer_byte_rate", cfg.ConsumerByteRate),
	}
	req := kmsg.NewPtrAlterClientQuotasRequest()
	req.Version = 0
	req.Entries = []kmsg.AlterClientQuotasRequestEntry{{
		Entity: []kmsg.AlterClientQuotasRequestEntryEntity{{
			Type: "user",
			Name: &user,
		}},
		Ops: ops,
	}}
	resp, err := cl.Request(ctx, req)
	if err != nil {
		return err
	}
	ar, ok := resp.(*kmsg.AlterClientQuotasResponse)
	if !ok {
		return fmt.Errorf("非 AlterClientQuotas 响应")
	}
	for _, e := range ar.Entries {
		if e.ErrorCode != 0 {
			return fmt.Errorf("设置用户限速失败: %s (%d)", kafkaDerefStrPtr(e.ErrorMessage), e.ErrorCode)
		}
	}
	return nil
}

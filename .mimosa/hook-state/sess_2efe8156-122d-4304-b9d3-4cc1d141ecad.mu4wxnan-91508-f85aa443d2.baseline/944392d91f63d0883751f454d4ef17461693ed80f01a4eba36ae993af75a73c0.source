package internal

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/kmsg"
	"github.com/twmb/franz-go/pkg/sasl/plain"
	"github.com/twmb/franz-go/pkg/sasl/scram"
)

func appKafkaFranzClient(ctx context.Context, brokers []string, user, pass, saslMechanism string) (*kgo.Client, error) {
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
	mech := strings.ToUpper(strings.TrimSpace(saslMechanism))
	if mech == "" {
		mech = "SCRAM-SHA-512"
	}
	u := strings.TrimSpace(user)
	opts := []kgo.Opt{
		kgo.SeedBrokers(clean...),
		kgo.RequestTimeoutOverhead(30 * time.Second),
	}
	switch mech {
	case "PLAIN":
		opts = append(opts, kgo.SASL(plain.Auth{User: u, Pass: pass}.AsMechanism()))
	case "SCRAM-SHA-256":
		opts = append(opts, kgo.SASL(scram.Auth{User: u, Pass: pass}.AsSha256Mechanism()))
	case "SCRAM-SHA-512":
		opts = append(opts, kgo.SASL(scram.Auth{User: u, Pass: pass}.AsSha512Mechanism()))
	default:
		return nil, fmt.Errorf("不支持的 SASL 机制: %s（支持 PLAIN、SCRAM-SHA-256、SCRAM-SHA-512）", mech)
	}
	cl, err := kgo.NewClient(opts...)
	if err != nil {
		return nil, err
	}
	req := kmsg.NewPtrMetadataRequest()
	req.Topics = nil
	_, err = cl.Request(ctx, req)
	return cl, err
}

func kafkaDerefTopic(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// appKafkaTopicUsable 校验主题在集群元数据中存在且具备分区（可读写元数据即表示管理员视角可见）。
func appKafkaTopicUsable(ctx context.Context, cl *kgo.Client, topic string) error {
	topic = strings.TrimSpace(topic)
	if topic == "" {
		return fmt.Errorf("topic 为空")
	}
	req := kmsg.NewPtrMetadataRequest()
	tn := topic
	req.Topics = []kmsg.MetadataRequestTopic{{Topic: &tn}}
	resp, err := cl.Request(ctx, req)
	if err != nil {
		return err
	}
	meta, ok := resp.(*kmsg.MetadataResponse)
	if !ok {
		return fmt.Errorf("非 Metadata 响应")
	}
	for _, t := range meta.Topics {
		if kafkaDerefTopic(t.Topic) != topic {
			continue
		}
		if err := kerr.ErrorForCode(t.ErrorCode); err != nil {
			return err
		}
		if len(t.Partitions) == 0 {
			return fmt.Errorf("主题无可用分区")
		}
		return nil
	}
	return fmt.Errorf("集群元数据中未找到主题 %q", topic)
}

func appKafkaListTopics(ctx context.Context, cl *kgo.Client) ([]map[string]interface{}, error) {
	req := kmsg.NewPtrMetadataRequest()
	req.Topics = nil
	resp, err := cl.Request(ctx, req)
	if err != nil {
		return nil, err
	}
	meta, ok := resp.(*kmsg.MetadataResponse)
	if !ok {
		return nil, fmt.Errorf("非 Metadata 响应")
	}
	var out []map[string]interface{}
	for _, t := range meta.Topics {
		name := kafkaDerefTopic(t.Topic)
		if name == "" {
			continue
		}
		var parts []map[string]interface{}
		for _, p := range t.Partitions {
			parts = append(parts, map[string]interface{}{
				"partition": p.Partition,
				"leader":    p.Leader,
				"replicas":  p.Replicas,
				"isr":       p.ISR,
			})
		}
		out = append(out, map[string]interface{}{
			"topic":      name,
			"partitions": parts,
		})
	}
	return out, nil
}

func appKafkaCreateTopic(ctx context.Context, cl *kgo.Client, topic string, partitions int32, rf int16) error {
	req := kmsg.NewPtrCreateTopicsRequest()
	req.Topics = []kmsg.CreateTopicsRequestTopic{{
		Topic:             topic,
		NumPartitions:     partitions,
		ReplicationFactor: rf,
	}}
	resp, err := cl.Request(ctx, req)
	if err != nil {
		return err
	}
	cr, ok := resp.(*kmsg.CreateTopicsResponse)
	if !ok {
		return fmt.Errorf("非 CreateTopics 响应")
	}
	for _, t := range cr.Topics {
		if t.Topic == topic && t.ErrorCode != 0 {
			return fmt.Errorf("创建主题失败: %s (code=%d)", kafkaDerefStrPtr(t.ErrorMessage), t.ErrorCode)
		}
	}
	return nil
}

func appKafkaDeleteTopic(ctx context.Context, cl *kgo.Client, topic string) error {
	req := kmsg.NewPtrDeleteTopicsRequest()
	req.Version = 3
	req.TopicNames = []string{topic}
	resp, err := cl.Request(ctx, req)
	if err != nil {
		return err
	}
	dr, ok := resp.(*kmsg.DeleteTopicsResponse)
	if !ok {
		return fmt.Errorf("非 DeleteTopics 响应")
	}
	for _, t := range dr.Topics {
		if kafkaDerefTopic(t.Topic) == topic && t.ErrorCode != 0 {
			return fmt.Errorf("删除主题失败: %s (code=%d)", kafkaDerefStrPtr(t.ErrorMessage), t.ErrorCode)
		}
	}
	return nil
}

func appKafkaDescribeACLs(ctx context.Context, cl *kgo.Client) ([]map[string]interface{}, error) {
	req := kmsg.NewPtrDescribeACLsRequest()
	req.Version = 2
	req.ResourceType = kmsg.ACLResourceTypeAny
	req.ResourcePatternType = kmsg.ACLResourcePatternTypeAny
	req.Operation = kmsg.ACLOperationAny
	req.PermissionType = kmsg.ACLPermissionTypeAny
	resp, err := cl.Request(ctx, req)
	if err != nil {
		return nil, err
	}
	ar, ok := resp.(*kmsg.DescribeACLsResponse)
	if !ok {
		return nil, fmt.Errorf("非 DescribeACLs 响应")
	}
	if ar.ErrorCode != 0 {
		return nil, fmt.Errorf("DescribeACLs: %s (%d)", kafkaDerefStrPtr(ar.ErrorMessage), ar.ErrorCode)
	}
	var out []map[string]interface{}
	for _, r := range ar.Resources {
		for _, e := range r.ACLs {
			out = append(out, map[string]interface{}{
				"resourceType":        int8(r.ResourceType),
				"resourceName":        r.ResourceName,
				"resourcePatternType": int8(r.ResourcePatternType),
				"principal":           e.Principal,
				"host":                e.Host,
				"operation":           int8(e.Operation),
				"permissionType":      int8(e.PermissionType),
			})
		}
	}
	return out, nil
}

func appKafkaCreateACL(ctx context.Context, cl *kgo.Client, resourceType kmsg.ACLResourceType, resourceName string, patternType kmsg.ACLResourcePatternType, principal, host string, operation kmsg.ACLOperation, perm kmsg.ACLPermissionType) error {
	c := kmsg.NewCreateACLsRequestCreation()
	c.ResourceType = resourceType
	c.ResourceName = resourceName
	c.ResourcePatternType = patternType
	c.Principal = principal
	c.Host = host
	c.Operation = operation
	c.PermissionType = perm
	req := kmsg.NewPtrCreateACLsRequest()
	req.Version = 2
	req.Creations = []kmsg.CreateACLsRequestCreation{c}
	resp, err := cl.Request(ctx, req)
	if err != nil {
		return err
	}
	cr, ok := resp.(*kmsg.CreateACLsResponse)
	if !ok {
		return fmt.Errorf("非 CreateACLs 响应")
	}
	for _, r := range cr.Results {
		if r.ErrorCode != 0 {
			return fmt.Errorf("CreateACL: %s (%d)", kafkaDerefStrPtr(r.ErrorMessage), r.ErrorCode)
		}
	}
	return nil
}

func appKafkaDeleteACLs(ctx context.Context, cl *kgo.Client, filters []kmsg.DeleteACLsRequestFilter) error {
	req := kmsg.NewPtrDeleteACLsRequest()
	req.Version = 2
	req.Filters = filters
	resp, err := cl.Request(ctx, req)
	if err != nil {
		return err
	}
	dr, ok := resp.(*kmsg.DeleteACLsResponse)
	if !ok {
		return fmt.Errorf("非 DeleteACLs 响应")
	}
	for _, r := range dr.Results {
		for _, m := range r.MatchingACLs {
			if m.ErrorCode != 0 {
				return fmt.Errorf("DeleteACL: %s (%d)", kafkaDerefStrPtr(m.ErrorMessage), m.ErrorCode)
			}
		}
	}
	return nil
}

func appKafkaAlterScramUser(ctx context.Context, cl *kgo.Client, username, password, clusterSaslMechanism string) error {
	up, err := kafkaScramUpsertForClusterMechanism(clusterSaslMechanism, username, password)
	if err != nil {
		return err
	}
	req := kmsg.NewPtrAlterUserSCRAMCredentialsRequest()
	req.Upsertions = []kmsg.AlterUserSCRAMCredentialsRequestUpsertion{up}
	resp, err := cl.Request(ctx, req)
	if err != nil {
		return err
	}
	ar, ok := resp.(*kmsg.AlterUserSCRAMCredentialsResponse)
	if !ok {
		return fmt.Errorf("非 AlterUserSCRAMCredentials 响应")
	}
	for _, r := range ar.Results {
		if r.ErrorCode != 0 {
			return fmt.Errorf("AlterUserSCRAM: %s (%d)", kafkaDerefStrPtr(r.ErrorMessage), r.ErrorCode)
		}
	}
	return nil
}

func appKafkaDeleteScramUser(ctx context.Context, cl *kgo.Client, username, clusterSaslMechanism string) error {
	mid, err := kafkaScramDeletionMechanism(clusterSaslMechanism)
	if err != nil {
		return err
	}
	req := kmsg.NewPtrAlterUserSCRAMCredentialsRequest()
	req.Deletions = []kmsg.AlterUserSCRAMCredentialsRequestDeletion{{
		Name:      username,
		Mechanism: mid,
	}}
	resp, err := cl.Request(ctx, req)
	if err != nil {
		return err
	}
	ar, ok := resp.(*kmsg.AlterUserSCRAMCredentialsResponse)
	if !ok {
		return fmt.Errorf("非 AlterUserSCRAMCredentials 响应")
	}
	for _, r := range ar.Results {
		if r.ErrorCode != 0 {
			return fmt.Errorf("DeleteUserSCRAM: %s (%d)", kafkaDerefStrPtr(r.ErrorMessage), r.ErrorCode)
		}
	}
	return nil
}

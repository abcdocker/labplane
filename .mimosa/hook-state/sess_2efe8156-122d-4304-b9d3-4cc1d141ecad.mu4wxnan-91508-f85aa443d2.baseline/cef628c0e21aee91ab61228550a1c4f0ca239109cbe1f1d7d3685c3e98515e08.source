package internal

import (
	"context"
	"fmt"
	"strings"

	"github.com/twmb/franz-go/pkg/kgo"
)

// KafkaPerfCheck 压测启动前单项校验结果。
type KafkaPerfCheck struct {
	ID      string `json:"id"`
	OK      bool   `json:"ok"`
	Message string `json:"message"`
}

func kafkaPerfChecksAllOK(checks []KafkaPerfCheck) bool {
	for _, c := range checks {
		if !c.OK {
			return false
		}
	}
	return true
}

// kafkaPerfRunValidation 在创建压测 Job 前校验 Topic、压测账号、配额相关权限等。
func kafkaPerfRunValidation(ctx context.Context, st *appKafkaInstanceStored, adminCl *kgo.Client, req *KafkaPerfTestRequest) []KafkaPerfCheck {
	var checks []KafkaPerfCheck
	checks = append(checks, KafkaPerfCheck{
		ID:      "instance_admin",
		OK:      true,
		Message: "实例管理员已连接集群",
	})

	if err := appKafkaTopicUsable(ctx, adminCl, req.Topic); err != nil {
		checks = append(checks, KafkaPerfCheck{
			ID:      "topic",
			OK:      false,
			Message: fmt.Sprintf("主题校验失败: %v", err),
		})
	} else {
		checks = append(checks, KafkaPerfCheck{
			ID:      "topic",
			OK:      true,
			Message: fmt.Sprintf("主题 %q 存在且具备分区", req.Topic),
		})
	}

	if req.ClientUsername != "" {
		brokers := strings.Split(st.BootstrapBrokers, ",")
		ccl, err := appKafkaFranzClient(ctx, brokers, req.ClientUsername, req.ClientPassword, st.effectiveSaslMechanism())
		if err != nil {
			checks = append(checks, KafkaPerfCheck{
				ID:      "client_sasl",
				OK:      false,
				Message: fmt.Sprintf("压测账号认证失败: %v", err),
			})
		} else {
			defer ccl.Close()
			if err := appKafkaTopicUsable(ctx, ccl, req.Topic); err != nil {
				checks = append(checks, KafkaPerfCheck{
					ID:      "client_topic",
					OK:      false,
					Message: fmt.Sprintf("压测账号无法访问该主题: %v", err),
				})
			} else {
				checks = append(checks, KafkaPerfCheck{
					ID:      "client_sasl",
					OK:      true,
					Message: fmt.Sprintf("压测账号 %q 认证通过且可读取主题元数据", req.ClientUsername),
				})
			}
		}
	} else {
		checks = append(checks, KafkaPerfCheck{
			ID:      "client_sasl",
			OK:      true,
			Message: "使用实例登记的管理员作为压测客户端",
		})
	}

	if req.EnableThrottle {
		if _, err := appKafkaListClientQuotas(ctx, adminCl); err != nil {
			checks = append(checks, KafkaPerfCheck{
				ID:      "quota_admin",
				OK:      false,
				Message: fmt.Sprintf("管理员无法查询客户端配额（kafka-configs 限速可能失败）: %v", err),
			})
		} else {
			checks = append(checks, KafkaPerfCheck{
				ID:      "quota_admin",
				OK:      true,
				Message: "管理员可查询客户端配额（具备执行用户限速相关 API 的基础权限）",
			})
		}
	}

	return checks
}

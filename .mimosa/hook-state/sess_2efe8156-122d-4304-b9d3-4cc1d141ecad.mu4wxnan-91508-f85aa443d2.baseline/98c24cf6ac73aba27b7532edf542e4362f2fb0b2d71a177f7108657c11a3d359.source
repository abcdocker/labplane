package internal

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

// AppKafkaTemplateConfig 应用中心 Kafka+ZK 模版：镜像、副本、存储与 Kafka 调优（KAFKA_CFG_* 附加行）。
type AppKafkaTemplateConfig struct {
	ZookeeperImage string `json:"zookeeperImage"`
	KafkaImage     string `json:"kafkaImage"`
	BusyboxImage   string `json:"busyboxImage,omitempty"`
	ImagePullSecret string `json:"imagePullSecret,omitempty"`
	// ZkReplicas / KafkaReplicas 默认 3；每套部署一组 ZK + Kafka（1:1）
	ZkReplicas    int `json:"zkReplicas,omitempty"`
	KafkaReplicas int `json:"kafkaReplicas,omitempty"`
	ZkStorageSize string `json:"zkStorageSize,omitempty"`
	KafkaStorageSize string `json:"kafkaStorageSize,omitempty"`
	// ExtraKafkaCfgLines 每行一个 KAFKA_CFG_* 环境变量，如 KAFKA_CFG_NUM_IO_THREADS=16
	ExtraKafkaCfgLines []string `json:"extraKafkaCfgLines,omitempty"`
	// DefaultSaslUsername / DefaultSaslPassword 部署时可覆盖；空密码则部署时随机生成
	DefaultSaslUsername string `json:"defaultSaslUsername,omitempty"`
	DefaultSaslPassword string `json:"defaultSaslPassword,omitempty"`
}

type appKafkaTemplateRow struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	ConfigJSON  string `json:"-"`
	CreatedAt   string `json:"createdAt,omitempty"`
	UpdatedAt   string `json:"updatedAt,omitempty"`
	CreatedBy   string `json:"createdBy,omitempty"`
}

func parseAppKafkaTemplateConfig(raw string) (*AppKafkaTemplateConfig, error) {
	var c AppKafkaTemplateConfig
	if err := json.Unmarshal([]byte(raw), &c); err != nil {
		return nil, err
	}
	return &c, nil
}

func validateAppKafkaTemplateConfig(c *AppKafkaTemplateConfig) error {
	if c == nil {
		return errors.New("模版配置为空")
	}
	if strings.TrimSpace(c.ZookeeperImage) == "" {
		return errors.New("zookeeperImage 不能为空（如 docker.io/zookeeper:3.9.3）")
	}
	if strings.TrimSpace(c.KafkaImage) == "" {
		return errors.New("kafkaImage 不能为空（须支持 ZooKeeper 模式，如 docker.io/bitnamilegacy/kafka:3.7.1）")
	}
	if c.ZkReplicas < 1 || c.ZkReplicas > 7 {
		return errors.New("zkReplicas 须在 1～7")
	}
	if c.KafkaReplicas < 1 || c.KafkaReplicas > 9 {
		return errors.New("kafkaReplicas 须在 1～9")
	}
	return nil
}

func appKafkaTemplateDefaults(c *AppKafkaTemplateConfig) {
	if c.ZkReplicas <= 0 {
		c.ZkReplicas = 3
	}
	if c.KafkaReplicas <= 0 {
		c.KafkaReplicas = 3
	}
	if strings.TrimSpace(c.BusyboxImage) == "" {
		c.BusyboxImage = "docker.io/busybox:1.36"
	}
	if strings.TrimSpace(c.ZkStorageSize) == "" {
		c.ZkStorageSize = "20Gi"
	}
	if strings.TrimSpace(c.KafkaStorageSize) == "" {
		c.KafkaStorageSize = "100Gi"
	}
	if strings.TrimSpace(c.DefaultSaslUsername) == "" {
		c.DefaultSaslUsername = "admin"
	}
}

func appKafkaTemplateListFromMySQL(ctx context.Context, db *sql.DB) ([]appKafkaTemplateRow, error) {
	if db == nil {
		return nil, nil
	}
	rows, err := db.QueryContext(ctx,
		`SELECT id, name, description, config_json, created_at, updated_at, created_by FROM kubebt_app_kafka_templates ORDER BY id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []appKafkaTemplateRow
	for rows.Next() {
		var r appKafkaTemplateRow
		var desc sql.NullString
		var created, updated sql.NullTime
		if err := rows.Scan(&r.ID, &r.Name, &desc, &r.ConfigJSON, &created, &updated, &r.CreatedBy); err != nil {
			return nil, err
		}
		if desc.Valid {
			r.Description = desc.String
		}
		if created.Valid {
			r.CreatedAt = created.Time.UTC().Format(time.RFC3339)
		}
		if updated.Valid {
			r.UpdatedAt = updated.Time.UTC().Format(time.RFC3339)
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func appKafkaTemplateGetByID(ctx context.Context, db *sql.DB, id int64) (*appKafkaTemplateRow, error) {
	var r appKafkaTemplateRow
	var desc sql.NullString
	var created, updated sql.NullTime
	err := db.QueryRowContext(ctx,
		`SELECT id, name, description, config_json, created_at, updated_at, created_by FROM kubebt_app_kafka_templates WHERE id=?`,
		id,
	).Scan(&r.ID, &r.Name, &desc, &r.ConfigJSON, &created, &updated, &r.CreatedBy)
	if err != nil {
		return nil, err
	}
	if desc.Valid {
		r.Description = desc.String
	}
	if created.Valid {
		r.CreatedAt = created.Time.UTC().Format(time.RFC3339)
	}
	if updated.Valid {
		r.UpdatedAt = updated.Time.UTC().Format(time.RFC3339)
	}
	return &r, nil
}

func appKafkaTemplateDelete(ctx context.Context, db *sql.DB, id int64) error {
	_, err := db.ExecContext(ctx, `DELETE FROM kubebt_app_kafka_templates WHERE id=?`, id)
	return err
}

func appKafkaTemplateInsert(ctx context.Context, db *sql.DB, name, description, configJSON, createdBy string) (int64, error) {
	res, err := db.ExecContext(ctx,
		`INSERT INTO kubebt_app_kafka_templates (name, description, config_json, created_by) VALUES (?,?,?,?)`,
		name, nullIfEmpty(description), configJSON, createdBy)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func appKafkaTemplateUpdate(ctx context.Context, db *sql.DB, id int64, name, description, configJSON string) error {
	_, err := db.ExecContext(ctx,
		`UPDATE kubebt_app_kafka_templates SET name=?, description=?, config_json=? WHERE id=?`,
		name, nullIfEmpty(description), configJSON, id)
	return err
}

func appKafkaTemplateRowToPublic(row appKafkaTemplateRow) (map[string]interface{}, error) {
	cfg, err := parseAppKafkaTemplateConfig(row.ConfigJSON)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"id":          row.ID,
		"name":        row.Name,
		"description": row.Description,
		"config":      cfg,
		"createdAt":   row.CreatedAt,
		"updatedAt":   row.UpdatedAt,
		"createdBy":   row.CreatedBy,
	}, nil
}

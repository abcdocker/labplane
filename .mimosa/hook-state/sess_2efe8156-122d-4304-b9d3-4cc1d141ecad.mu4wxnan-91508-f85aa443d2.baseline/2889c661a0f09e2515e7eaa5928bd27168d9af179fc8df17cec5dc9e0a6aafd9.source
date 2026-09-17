package internal

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

// AppRedisTemplateConfig 模版 JSON：镜像与拉取凭据、RDB/AOF 相关默认由部署向导与 K8s 参数覆盖合并。
type AppRedisTemplateConfig struct {
	// RedisImage 完整镜像 repository:tag（必填）
	RedisImage string `json:"redisImage"`
	// ExporterImage 完整 redis_exporter 镜像；空则在部署时按全局/默认解析
	ExporterImage string `json:"exporterImage,omitempty"`
	// ImagePullSecret 目标命名空间内 docker-registry 类 Secret 名称
	ImagePullSecret string `json:"imagePullSecret,omitempty"`
	// RegistryPrefixForTags 列举标签时的仓库前缀（无协议、无尾斜杠），如 harbor.example.com/library；空则向导用 Docker Hub 列举
	RegistryPrefixForTags string `json:"registryPrefixForTags,omitempty"`
	// RdbSaveLines RDB 规则，每行「秒 变更数」如 "900 1"；单行 "off"/"none" 表示 --save ""
	RdbSaveLines []string `json:"rdbSaveLines,omitempty"`
	// DefaultAppendonly 若不为 nil，部署向导选模版时作为 AOF 初始开关（仍可在向导中改）
	DefaultAppendonly *bool `json:"defaultAppendonly,omitempty"`
	// ExtraRedisServerArgs 附加 redis-server 参数（argv 片段，按空格分或逐元素）
	ExtraRedisServerArgs []string `json:"extraRedisServerArgs,omitempty"`
}

type appRedisTemplateRow struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	ConfigJSON  string `json:"-"`
	CreatedAt   string `json:"createdAt,omitempty"`
	UpdatedAt   string `json:"updatedAt,omitempty"`
	CreatedBy   string `json:"createdBy,omitempty"`
}

func parseAppRedisTemplateConfig(raw string) (*AppRedisTemplateConfig, error) {
	var c AppRedisTemplateConfig
	if err := json.Unmarshal([]byte(raw), &c); err != nil {
		return nil, err
	}
	return &c, nil
}

func validateAppRedisTemplateConfig(c *AppRedisTemplateConfig) error {
	if c == nil {
		return errors.New("模版配置为空")
	}
	if strings.TrimSpace(c.RedisImage) == "" {
		return errors.New("redisImage 不能为空（须为完整镜像，如 harbor.example.com/lib/redis:7.2）")
	}
	for _, line := range c.RdbSaveLines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		low := strings.ToLower(line)
		if low == "off" || low == "none" {
			continue
		}
		f := strings.Fields(line)
		if len(f) < 2 {
			return fmt.Errorf("rdbSaveLines 格式无效：%q（须为「秒 变更数」或 off/none）", line)
		}
	}
	return nil
}

func appRedisTemplateListFromMySQL(ctx context.Context, db *sql.DB) ([]appRedisTemplateRow, error) {
	if db == nil {
		return nil, nil
	}
	rows, err := db.QueryContext(ctx,
		`SELECT id, name, description, config_json, created_at, updated_at, created_by FROM kubebt_app_redis_templates ORDER BY id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []appRedisTemplateRow
	for rows.Next() {
		var r appRedisTemplateRow
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

func appRedisTemplateGetByID(ctx context.Context, db *sql.DB, id int64) (*appRedisTemplateRow, error) {
	var r appRedisTemplateRow
	var desc sql.NullString
	var created, updated sql.NullTime
	err := db.QueryRowContext(ctx,
		`SELECT id, name, description, config_json, created_at, updated_at, created_by FROM kubebt_app_redis_templates WHERE id=?`,
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

func appRedisTemplateDelete(ctx context.Context, db *sql.DB, id int64) error {
	_, err := db.ExecContext(ctx, `DELETE FROM kubebt_app_redis_templates WHERE id=?`, id)
	return err
}

func appRedisTemplateInsert(ctx context.Context, db *sql.DB, name, description, configJSON, createdBy string) (int64, error) {
	res, err := db.ExecContext(ctx,
		`INSERT INTO kubebt_app_redis_templates (name, description, config_json, created_by) VALUES (?,?,?,?)`,
		name, nullIfEmpty(description), configJSON, createdBy)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func appRedisTemplateUpdate(ctx context.Context, db *sql.DB, id int64, name, description, configJSON string) error {
	_, err := db.ExecContext(ctx,
		`UPDATE kubebt_app_redis_templates SET name=?, description=?, config_json=? WHERE id=?`,
		name, nullIfEmpty(description), configJSON, id)
	return err
}

func nullIfEmpty(s string) interface{} {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	return s
}

func templateRowToPublic(row appRedisTemplateRow) (map[string]interface{}, error) {
	cfg, err := parseAppRedisTemplateConfig(row.ConfigJSON)
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

// ValidateAppRedisK8sEngineLine 应用中心 K8s 部署仅允许 Redis 6.x / 7.x 主版本线。
func ValidateAppRedisK8sEngineLine(version string) error {
	v := strings.TrimSpace(version)
	if v == "" {
		return errors.New("主版本不能为空")
	}
	major := v
	if i := strings.IndexByte(v, '.'); i >= 0 {
		major = v[:i]
	}
	major = strings.TrimSpace(major)
	if major != "6" && major != "7" {
		return errors.New("应用中心 Redis K8s 部署仅支持 Redis 6.x 与 7.x 主版本")
	}
	return nil
}

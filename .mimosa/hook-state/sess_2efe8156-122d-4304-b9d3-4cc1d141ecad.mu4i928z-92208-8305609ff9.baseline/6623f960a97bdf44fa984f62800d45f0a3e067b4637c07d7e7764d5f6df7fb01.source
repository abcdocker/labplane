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

// AppOpenSearchTemplateConfig 应用中心 OpenSearch 模版：内网 Harbor 镜像与可选调优片段。
type AppOpenSearchTemplateConfig struct {
	OpenSearchImage   string `json:"opensearchImage"`
	DashboardsImage   string `json:"dashboardsImage"`
	ImagePullSecret   string `json:"imagePullSecret,omitempty"`
	RegistryPrefixForTags string `json:"registryPrefixForTags,omitempty"`
	// DefaultJavaOptsMaster / Data 部署向导可覆盖
	DefaultJavaOptsMaster string `json:"defaultJavaOptsMaster,omitempty"`
	DefaultJavaOptsData   string `json:"defaultJavaOptsData,omitempty"`
	// ExtraOpensearchYml 追加到各节点 opensearch.yml（索引/集群级调优）
	ExtraOpensearchYml string `json:"extraOpensearchYml,omitempty"`
	// IndexTemplateJSON 非空时创建 ConfigMap 与一次性 Job，向集群注册 composable index template（须为合法 JSON 对象）
	IndexTemplateJSON string `json:"indexTemplateJSON,omitempty"`
}

type appOpenSearchTemplateRow struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	ConfigJSON  string `json:"-"`
	CreatedAt   string `json:"createdAt,omitempty"`
	UpdatedAt   string `json:"updatedAt,omitempty"`
	CreatedBy   string `json:"createdBy,omitempty"`
}

func parseAppOpenSearchTemplateConfig(raw string) (*AppOpenSearchTemplateConfig, error) {
	var c AppOpenSearchTemplateConfig
	if err := json.Unmarshal([]byte(raw), &c); err != nil {
		return nil, err
	}
	return &c, nil
}

func validateAppOpenSearchTemplateConfig(c *AppOpenSearchTemplateConfig) error {
	if c == nil {
		return errors.New("模版配置为空")
	}
	if strings.TrimSpace(c.OpenSearchImage) == "" {
		return errors.New("opensearchImage 不能为空（完整镜像，如 harbor.example.com/lib/opensearch:2.11.1）")
	}
	if strings.TrimSpace(c.DashboardsImage) == "" {
		return errors.New("dashboardsImage 不能为空（完整镜像，如 harbor.example.com/lib/opensearch-dashboards:2.11.1）")
	}
	if s := strings.TrimSpace(c.IndexTemplateJSON); s != "" {
		var v map[string]interface{}
		if err := json.Unmarshal([]byte(s), &v); err != nil {
			return fmt.Errorf("indexTemplateJSON 须为 JSON 对象: %w", err)
		}
	}
	return nil
}

func appOpenSearchTemplateListFromMySQL(ctx context.Context, db *sql.DB) ([]appOpenSearchTemplateRow, error) {
	if db == nil {
		return nil, nil
	}
	rows, err := db.QueryContext(ctx,
		`SELECT id, name, description, config_json, created_at, updated_at, created_by FROM kubebt_app_opensearch_templates ORDER BY id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []appOpenSearchTemplateRow
	for rows.Next() {
		var r appOpenSearchTemplateRow
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

func appOpenSearchTemplateGetByID(ctx context.Context, db *sql.DB, id int64) (*appOpenSearchTemplateRow, error) {
	var r appOpenSearchTemplateRow
	var desc sql.NullString
	var created, updated sql.NullTime
	err := db.QueryRowContext(ctx,
		`SELECT id, name, description, config_json, created_at, updated_at, created_by FROM kubebt_app_opensearch_templates WHERE id=?`,
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

func appOpenSearchTemplateDelete(ctx context.Context, db *sql.DB, id int64) error {
	_, err := db.ExecContext(ctx, `DELETE FROM kubebt_app_opensearch_templates WHERE id=?`, id)
	return err
}

func appOpenSearchTemplateInsert(ctx context.Context, db *sql.DB, name, description, configJSON, createdBy string) (int64, error) {
	res, err := db.ExecContext(ctx,
		`INSERT INTO kubebt_app_opensearch_templates (name, description, config_json, created_by) VALUES (?,?,?,?)`,
		name, nullIfEmpty(description), configJSON, createdBy)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func appOpenSearchTemplateUpdate(ctx context.Context, db *sql.DB, id int64, name, description, configJSON string) error {
	_, err := db.ExecContext(ctx,
		`UPDATE kubebt_app_opensearch_templates SET name=?, description=?, config_json=? WHERE id=?`,
		name, nullIfEmpty(description), configJSON, id)
	return err
}

func openSearchTemplateRowToPublic(row appOpenSearchTemplateRow) (map[string]interface{}, error) {
	cfg, err := parseAppOpenSearchTemplateConfig(row.ConfigJSON)
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

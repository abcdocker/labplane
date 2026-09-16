package internal

import (
	"context"
	"database/sql"
	"time"
)

type appOpenSearchInstanceRow struct {
	ID         int64  `json:"id"`
	Name       string `json:"name"`
	ConfigJSON string `json:"-"`
	CreatedAt  string `json:"createdAt,omitempty"`
	UpdatedAt  string `json:"updatedAt,omitempty"`
	CreatedBy  string `json:"createdBy,omitempty"`
}

func openSearchInstanceName(namespace, base string) string {
	return namespace + "/" + base
}

func appOpenSearchListFromMySQL(ctx context.Context, db *sql.DB) ([]appOpenSearchInstanceRow, error) {
	if db == nil {
		return nil, nil
	}
	rows, err := db.QueryContext(ctx,
		`SELECT id, name, config_json, created_at, updated_at, created_by FROM kubebt_app_opensearch_instances ORDER BY id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []appOpenSearchInstanceRow
	for rows.Next() {
		var r appOpenSearchInstanceRow
		var created, updated sql.NullTime
		if err := rows.Scan(&r.ID, &r.Name, &r.ConfigJSON, &created, &updated, &r.CreatedBy); err != nil {
			return nil, err
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

func appOpenSearchInsert(ctx context.Context, db *sql.DB, name, configJSON, createdBy string) (int64, error) {
	res, err := db.ExecContext(ctx,
		`INSERT INTO kubebt_app_opensearch_instances (name, config_json, created_by) VALUES (?,?,?)`,
		name, configJSON, createdBy)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func appOpenSearchUpdate(ctx context.Context, db *sql.DB, id int64, name, configJSON string) error {
	_, err := db.ExecContext(ctx,
		`UPDATE kubebt_app_opensearch_instances SET name=?, config_json=? WHERE id=?`,
		name, configJSON, id)
	return err
}

func appOpenSearchGetByID(ctx context.Context, db *sql.DB, id int64) (*appOpenSearchInstanceRow, error) {
	var r appOpenSearchInstanceRow
	var created, updated sql.NullTime
	err := db.QueryRowContext(ctx,
		`SELECT id, name, config_json, created_at, updated_at, created_by FROM kubebt_app_opensearch_instances WHERE id=?`,
		id,
	).Scan(&r.ID, &r.Name, &r.ConfigJSON, &created, &updated, &r.CreatedBy)
	if err != nil {
		return nil, err
	}
	if created.Valid {
		r.CreatedAt = created.Time.UTC().Format(time.RFC3339)
	}
	if updated.Valid {
		r.UpdatedAt = updated.Time.UTC().Format(time.RFC3339)
	}
	return &r, nil
}

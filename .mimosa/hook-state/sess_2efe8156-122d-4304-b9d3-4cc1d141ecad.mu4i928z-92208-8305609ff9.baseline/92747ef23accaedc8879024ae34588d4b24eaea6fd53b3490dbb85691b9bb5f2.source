package internal

import (
	"context"
	"database/sql"
	"time"
)

type appKafkaInstanceRow struct {
	ID         int64  `json:"id"`
	Name       string `json:"name"`
	ConfigJSON string `json:"-"`
	CreatedAt  string `json:"createdAt,omitempty"`
	UpdatedAt  string `json:"updatedAt,omitempty"`
	CreatedBy  string `json:"createdBy,omitempty"`
}

func kafkaInstanceName(namespace, base string) string {
	return namespace + "/" + base
}

func appKafkaListFromMySQL(ctx context.Context, db *sql.DB) ([]appKafkaInstanceRow, error) {
	if db == nil {
		return nil, nil
	}
	rows, err := db.QueryContext(ctx,
		`SELECT id, name, config_json, created_at, updated_at, created_by FROM kubebt_app_kafka_instances ORDER BY id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []appKafkaInstanceRow
	for rows.Next() {
		var r appKafkaInstanceRow
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

func appKafkaInsert(ctx context.Context, db *sql.DB, name, configJSON, createdBy string) (int64, error) {
	res, err := db.ExecContext(ctx,
		`INSERT INTO kubebt_app_kafka_instances (name, config_json, created_by) VALUES (?,?,?)`,
		name, configJSON, createdBy)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func appKafkaUpdate(ctx context.Context, db *sql.DB, id int64, name, configJSON string) error {
	_, err := db.ExecContext(ctx,
		`UPDATE kubebt_app_kafka_instances SET name=?, config_json=? WHERE id=?`,
		name, configJSON, id)
	return err
}

func appKafkaDeleteByID(ctx context.Context, db *sql.DB, id int64) error {
	_, err := db.ExecContext(ctx, `DELETE FROM kubebt_app_kafka_instances WHERE id=?`, id)
	return err
}

func appKafkaGetByID(ctx context.Context, db *sql.DB, id int64) (*appKafkaInstanceRow, error) {
	var r appKafkaInstanceRow
	var created, updated sql.NullTime
	err := db.QueryRowContext(ctx,
		`SELECT id, name, config_json, created_at, updated_at, created_by FROM kubebt_app_kafka_instances WHERE id=?`,
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

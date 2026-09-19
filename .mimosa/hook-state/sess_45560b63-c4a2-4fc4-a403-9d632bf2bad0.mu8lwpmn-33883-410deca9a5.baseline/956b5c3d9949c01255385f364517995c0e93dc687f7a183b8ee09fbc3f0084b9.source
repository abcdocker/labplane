package internal

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"
)

const (
	k8sObjectRevisionRedisMetaTTL = 90 * time.Second
	k8sObjectRevisionRedisPrefix  = "kubebt:k8s_obj_rev:"
)

func redisK8sObjectRevisionMetaKey(namespace, kind, name string) string {
	return k8sObjectRevisionRedisPrefix + "meta:" +
		revisionPathSeg(namespace) + ":" + revisionPathSeg(kind) + ":" + revisionPathSeg(name)
}

func k8sObjectRevisionInvalidateMetaCache(ctx context.Context, app *ServerApp, namespace, kind, name string) {
	r := app.Redis()
	if r == nil {
		return
	}
	key := redisK8sObjectRevisionMetaKey(namespace, kind, name)
	if err := r.Del(ctx, key); err != nil {
		log.Printf("Redis: 清除 K8s 修订列表缓存失败 %s: %v", key, err)
	}
}

func k8sObjectRevisionListMetaMySQL(ctx context.Context, app *ServerApp, namespace, kind, name string) ([]K8sObjectRevisionMeta, error) {
	db := app.MySQLDB()
	if db == nil {
		return nil, fmt.Errorf("MySQL 未配置")
	}
	ns := strings.TrimSpace(namespace)
	k := strings.TrimSpace(kind)
	n := strings.TrimSpace(name)
	if ns == "" || k == "" || n == "" {
		return nil, fmt.Errorf("无效的 namespace/kind/name")
	}

	if r := app.Redis(); r != nil {
		cached, err := r.Get(ctx, redisK8sObjectRevisionMetaKey(ns, k, n))
		if err == nil && strings.TrimSpace(cached) != "" {
			var list []K8sObjectRevisionMeta
			if json.Unmarshal([]byte(cached), &list) == nil && list != nil {
				return list, nil
			}
		}
	}

	rows, err := db.QueryContext(ctx,
		`SELECT id, ts, user, source FROM kubebt_k8s_object_revisions
		 WHERE namespace=? AND kind=? AND res_name=? ORDER BY id ASC`,
		ns, k, n,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []K8sObjectRevisionMeta
	for rows.Next() {
		var id uint64
		var ts time.Time
		var user, source string
		if err := rows.Scan(&id, &ts, &user, &source); err != nil {
			return nil, err
		}
		out = append(out, K8sObjectRevisionMeta{
			ID:     strconv.FormatUint(id, 10),
			Ts:     ts.UTC().Format(time.RFC3339Nano),
			User:   user,
			Source: source,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if out == nil {
		out = []K8sObjectRevisionMeta{}
	}

	if r := app.Redis(); r != nil {
		b, err := json.Marshal(out)
		if err == nil {
			if err := r.Set(ctx, redisK8sObjectRevisionMetaKey(ns, k, n), b, k8sObjectRevisionRedisMetaTTL); err != nil {
				log.Printf("Redis: 写入 K8s 修订列表缓存失败: %v", err)
			}
		}
	}
	return out, nil
}

func k8sObjectRevisionGetYAMLMySQL(ctx context.Context, app *ServerApp, namespace, kind, name, idStr string) (string, K8sObjectRevisionMeta, error) {
	var zero K8sObjectRevisionMeta
	db := app.MySQLDB()
	if db == nil {
		return "", zero, fmt.Errorf("MySQL 未配置")
	}
	idStr = strings.TrimSpace(idStr)
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		return "", zero, ErrK8sRevisionNotFound
	}
	ns := strings.TrimSpace(namespace)
	k := strings.TrimSpace(kind)
	n := strings.TrimSpace(name)
	var yaml string
	var ts time.Time
	var user, source string
	err = db.QueryRowContext(ctx,
		`SELECT yaml, ts, user, source FROM kubebt_k8s_object_revisions
		 WHERE id=? AND namespace=? AND kind=? AND res_name=?`,
		id, ns, k, n,
	).Scan(&yaml, &ts, &user, &source)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", zero, ErrK8sRevisionNotFound
		}
		return "", zero, err
	}
	return yaml, K8sObjectRevisionMeta{
		ID:     strconv.FormatUint(id, 10),
		Ts:     ts.UTC().Format(time.RFC3339Nano),
		User:   user,
		Source: source,
	}, nil
}

func k8sObjectRevisionAppendMySQL(ctx context.Context, app *ServerApp, kind, namespace, name, user, source, yamlContent string) error {
	db := app.MySQLDB()
	if db == nil {
		return fmt.Errorf("MySQL 未配置")
	}
	yamlContent = strings.TrimSpace(yamlContent)
	if yamlContent == "" {
		return nil
	}
	if len(yamlContent) > maxK8sObjectRevisionYAMLBytes {
		yamlContent = yamlContent[:maxK8sObjectRevisionYAMLBytes]
	}
	ns := strings.TrimSpace(namespace)
	k := strings.TrimSpace(kind)
	n := strings.TrimSpace(name)
	if ns == "" || k == "" || n == "" {
		return fmt.Errorf("无效的 namespace/kind/name")
	}
	user = strings.TrimSpace(user)
	source = strings.TrimSpace(source)

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	var lastYAML sql.NullString
	err = tx.QueryRowContext(ctx,
		`SELECT yaml FROM kubebt_k8s_object_revisions
		 WHERE namespace=? AND kind=? AND res_name=? ORDER BY id DESC LIMIT 1`,
		ns, k, n,
	).Scan(&lastYAML)
	if err != nil {
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
	} else if lastYAML.Valid && strings.TrimSpace(lastYAML.String) == yamlContent {
		return nil
	}

	_, err = tx.ExecContext(ctx,
		`INSERT INTO kubebt_k8s_object_revisions (namespace, kind, res_name, user, source, yaml) VALUES (?,?,?,?,?,?)`,
		ns, k, n, user, source, yamlContent,
	)
	if err != nil {
		return err
	}

	var cnt int
	err = tx.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM kubebt_k8s_object_revisions WHERE namespace=? AND kind=? AND res_name=?`,
		ns, k, n,
	).Scan(&cnt)
	if err != nil {
		return err
	}
	if cnt > maxK8sObjectRevisionsKeep {
		extra := cnt - maxK8sObjectRevisionsKeep
		_, err = tx.ExecContext(ctx,
			`DELETE FROM kubebt_k8s_object_revisions
			 WHERE namespace=? AND kind=? AND res_name=?
			 ORDER BY id ASC LIMIT ?`,
			ns, k, n, extra,
		)
		if err != nil {
			return err
		}
	}

	if err := tx.Commit(); err != nil {
		return err
	}
	k8sObjectRevisionInvalidateMetaCache(ctx, app, ns, k, n)
	return nil
}

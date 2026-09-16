package internal

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"html/template"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

func docsRedisOpContext() (context.Context, context.CancelFunc) {
	sec := 10
	if s := strings.TrimSpace(os.Getenv("KUBEBT_DOCS_REDIS_TIMEOUT_SEC")); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n >= 2 && n <= 60 {
			sec = n
		}
	}
	return context.WithTimeout(context.Background(), time.Duration(sec)*time.Second)
}

func docsMySQLOpContext() (context.Context, context.CancelFunc) {
	sec := 60
	if s := strings.TrimSpace(os.Getenv("KUBEBT_DOCS_MYSQL_TIMEOUT_SEC")); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n >= 10 && n <= 300 {
			sec = n
		}
	}
	return context.WithTimeout(context.Background(), time.Duration(sec)*time.Second)
}

func registerDocsRoutes(api *gin.RouterGroup, app *ServerApp) {
	g := api.Group("/docs")
	g.GET("/attachment-storage", AdminOnlyMiddleware(app), func(c *gin.Context) { docsAttachmentStorageInfo(c, app) })
	g.PUT("/attachment-storage", AdminOnlyMiddleware(app), func(c *gin.Context) { docsAttachmentStoragePut(c, app) })
	g.POST("/attachment-storage/test", AdminOnlyMiddleware(app), func(c *gin.Context) { docsAttachmentStorageTest(c, app) })
	g.DELETE("/attachment-storage/cos", AdminOnlyMiddleware(app), func(c *gin.Context) { docsAttachmentStorageClearCosKV(c, app) })
	g.GET("/categories", func(c *gin.Context) { docsListCategories(c, app) })
	g.POST("/categories", AdminOnlyMiddleware(app), func(c *gin.Context) { docsCreateCategory(c, app) })
	g.GET("/tags", func(c *gin.Context) { docsListTags(c, app) })
	g.POST("/tags", AdminOnlyMiddleware(app), func(c *gin.Context) { docsCreateTag(c, app) })
	// 列表必须用 GET /docs（与 POST /docs 创建同路径不同方法），勿使用 /docs/list，否则易被 /:id 误匹配为 id=list →「无效 id」。
	g.GET("", func(c *gin.Context) { docsList(c, app) })
	g.POST("", AdminOnlyMiddleware(app), func(c *gin.Context) { docsCreate(c, app) })
	g.GET("/media", func(c *gin.Context) { docsMediaList(c, app) })
	g.POST("/upload", AdminOnlyMiddleware(app), func(c *gin.Context) { docsUpload(c, app) })
	g.DELETE("/media/:id", AdminOnlyMiddleware(app), func(c *gin.Context) { docsMediaDelete(c, app) })
	g.GET("/:id/versions", func(c *gin.Context) { docsVersions(c, app) })
	g.POST("/:id/restore-version", AdminOnlyMiddleware(app), func(c *gin.Context) { docsRestoreVersion(c, app) })
	g.POST("/:id/duplicate", AdminOnlyMiddleware(app), func(c *gin.Context) { docsDuplicate(c, app) })
	g.PATCH("/:id/category", AdminOnlyMiddleware(app), func(c *gin.Context) { docsPatchCategory(c, app) })
	g.DELETE("/:id", AdminOnlyMiddleware(app), func(c *gin.Context) { docsDelete(c, app) })
	g.GET("/:id", func(c *gin.Context) { docsGet(c, app) })
	g.PUT("/:id", AdminOnlyMiddleware(app), func(c *gin.Context) { docsUpdate(c, app) })
}

func docsRequireMySQL(c *gin.Context, app *ServerApp) *sql.DB {
	db := app.MySQLDB()
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "MySQL 未就绪，文档功能不可用"})
		return nil
	}
	return db
}

func docsActor(c *gin.Context, app *ServerApp) string {
	u, ok := sessionUserFromCookie(c, app.Cfg(), app)
	if !ok || strings.TrimSpace(u) == "" {
		return "user"
	}
	return strings.TrimSpace(u)
}

// docsAttachmentStorageInfo GET /api/docs/attachment-storage — Markdown 图片/附件存储方式（腾讯云 COS 或本地），供编辑器展示配置说明。
func docsAttachmentStorageInfo(c *gin.Context, app *ServerApp) {
	eff := effectiveDocsCos(app)
	mode := "local"
	if eff.UseCOS {
		mode = "cos"
	}
	canKV := app.PlatformKV() != nil
	c.JSON(http.StatusOK, gin.H{
		"mode": mode,
		"cos": gin.H{
			"configured":     eff.UseCOS,
			"bucket":         eff.Bucket,
			"region":         eff.Region,
			"prefix":         eff.Prefix,
			"publicBase":     eff.PublicBase,
			"source":         eff.Source,
			"secretIdMasked": maskDocsSecretID(eff.SecretID),
			"secretKeySet":   eff.UseCOS && strings.TrimSpace(eff.SecretKey) != "",
		},
		"canManageKv": canKV,
		"configureHint": "在「媒体与附件」页图形化配置腾讯云 COS（写入平台存储）；若未配置完整则使用环境变量 KUBEBT_COS_*；均未配置时附件保存在服务器本地目录。",
	})
}

type docsCosPutBody struct {
	SecretID   string `json:"secretId"`
	SecretKey  string `json:"secretKey"`
	Bucket     string `json:"bucket"`
	Region     string `json:"region"`
	Prefix     string `json:"prefix"`
	PublicBase string `json:"publicBase"`
}

func docsAttachmentStoragePut(c *gin.Context, app *ServerApp) {
	if app.PlatformKV() == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "platform_kv 不可用"})
		return
	}
	var body docsCosPutBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效 JSON"})
		return
	}
	st := docsCosStored{
		SecretID:   strings.TrimSpace(body.SecretID),
		Bucket:     strings.TrimSpace(body.Bucket),
		Region:     strings.TrimSpace(body.Region),
		Prefix:     strings.Trim(strings.TrimSpace(body.Prefix), "/"),
		PublicBase: strings.TrimRight(strings.TrimSpace(body.PublicBase), "/"),
	}
	prev, havePrev := loadDocsCosFromKV(app)
	if st.SecretID == "" && havePrev {
		st.SecretID = strings.TrimSpace(prev.SecretID)
	}
	skIn := strings.TrimSpace(body.SecretKey)
	if skIn == "" {
		if havePrev && strings.TrimSpace(prev.SecretKey) != "" {
			st.SecretKey = strings.TrimSpace(prev.SecretKey)
		}
	} else {
		st.SecretKey = skIn
	}
	if !docsCosStoredComplete(st) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请填写 SecretId、SecretKey、Bucket（含 APPID）、Region"})
		return
	}
	if err := saveDocsCosToKV(app, st); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func docsAttachmentStorageClearCosKV(c *gin.Context, app *ServerApp) {
	if app.PlatformKV() == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "platform_kv 不可用"})
		return
	}
	if err := clearDocsCosKV(app); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func docsAttachmentStorageTest(c *gin.Context, app *ServerApp) {
	var body docsCosPutBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效 JSON"})
		return
	}
	secretID := strings.TrimSpace(body.SecretID)
	secretKey := strings.TrimSpace(body.SecretKey)
	bucket := strings.TrimSpace(body.Bucket)
	region := strings.TrimSpace(body.Region)
	prefix := strings.Trim(strings.TrimSpace(body.Prefix), "/")
	if secretKey == "" {
		if prev, ok := loadDocsCosFromKV(app); ok {
			secretKey = strings.TrimSpace(prev.SecretKey)
			if secretID == "" {
				secretID = strings.TrimSpace(prev.SecretID)
			}
			if bucket == "" {
				bucket = strings.TrimSpace(prev.Bucket)
			}
			if region == "" {
				region = strings.TrimSpace(prev.Region)
			}
			if prefix == "" {
				prefix = strings.Trim(strings.TrimSpace(prev.Prefix), "/")
			}
		}
	}
	if secretID == "" || secretKey == "" || bucket == "" || region == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请填写 SecretId、SecretKey、Bucket、Region 以测试"})
		return
	}
	host := bucket + ".cos." + region + ".myqcloud.com"
	probeKey := "__kubebt_probe__/" + uuid.NewString() + ".txt"
	if prefix != "" {
		probeKey = prefix + "/" + probeKey
	}
	payload := []byte("kubebt-cos-probe")
	if err := cosSigV4PutObject(host, region, secretID, secretKey, probeKey, payload, "text/plain"); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "上传探测失败: " + err.Error()})
		return
	}
	if err := cosSigV4DeleteObject(host, region, secretID, secretKey, probeKey); err != nil {
		c.JSON(http.StatusOK, gin.H{"ok": true, "warning": "探测文件已上传但删除失败: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func docsListCategories(c *gin.Context, app *ServerApp) {
	db := docsRequireMySQL(c, app)
	if db == nil {
		return
	}
	rows, err := db.Query(`SELECT id, name, parent_id, sort_order FROM kubebt_doc_categories ORDER BY sort_order ASC, id ASC`)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	defer rows.Close()
	var out []gin.H
	for rows.Next() {
		var id, sort uint64
		var name string
		var parent sql.NullInt64
		if err := rows.Scan(&id, &name, &parent, &sort); err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		h := gin.H{"id": id, "name": name, "sortOrder": sort}
		if parent.Valid {
			h["parentId"] = parent.Int64
		}
		out = append(out, h)
	}
	c.JSON(http.StatusOK, gin.H{"categories": out})
}

type docsCatBody struct {
	Name     string `json:"name"`
	ParentID *int64 `json:"parentId"`
	Sort     int    `json:"sortOrder"`
}

func docsCreateCategory(c *gin.Context, app *ServerApp) {
	db := docsRequireMySQL(c, app)
	if db == nil {
		return
	}
	var body docsCatBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "名称不能为空"})
		return
	}
	var pid interface{}
	if body.ParentID != nil && *body.ParentID > 0 {
		pid = *body.ParentID
	} else {
		pid = nil
	}
	res, err := db.Exec(`INSERT INTO kubebt_doc_categories (name, parent_id, sort_order) VALUES (?,?,?)`, name, pid, body.Sort)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	id, _ := res.LastInsertId()
	docsBumpCtx, docsBumpCancel := context.WithTimeout(context.Background(), 3*time.Second)
	docsBumpDocsAPICache(docsBumpCtx, app)
	docsBumpCancel()
	c.JSON(http.StatusOK, gin.H{"id": uint64(id)})
}

func docsListTags(c *gin.Context, app *ServerApp) {
	db := docsRequireMySQL(c, app)
	if db == nil {
		return
	}
	rows, err := db.Query(`SELECT id, name FROM kubebt_doc_tags ORDER BY name ASC`)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	defer rows.Close()
	var out []gin.H
	for rows.Next() {
		var id uint64
		var name string
		if err := rows.Scan(&id, &name); err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		out = append(out, gin.H{"id": id, "name": name})
	}
	c.JSON(http.StatusOK, gin.H{"tags": out})
}

func docsCreateTag(c *gin.Context, app *ServerApp) {
	db := docsRequireMySQL(c, app)
	if db == nil {
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "标签名不能为空"})
		return
	}
	res, err := db.Exec(`INSERT IGNORE INTO kubebt_doc_tags (name) VALUES (?)`, name)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	id, _ := res.LastInsertId()
	if id == 0 {
		_ = db.QueryRow(`SELECT id FROM kubebt_doc_tags WHERE name=?`, name).Scan(&id)
	}
	docsBumpCtx, docsBumpCancel := context.WithTimeout(context.Background(), 3*time.Second)
	docsBumpDocsAPICache(docsBumpCtx, app)
	docsBumpCancel()
	c.JSON(http.StatusOK, gin.H{"id": uint64(id)})
}

func docsList(c *gin.Context, app *ServerApp) {
	db := docsRequireMySQL(c, app)
	if db == nil {
		return
	}
	category := strings.TrimSpace(c.Query("categoryId"))
	tag := strings.TrimSpace(c.Query("tag"))
	q := strings.TrimSpace(c.Query("q"))
	rctx, rcancel := docsRedisOpContext()
	listRev := docsListRevFromRedis(rctx, app)
	if hit := docsTryListCache(rctx, app, listRev, category, tag, q); len(hit) > 0 {
		rcancel()
		c.Data(http.StatusOK, "application/json", hit)
		return
	}
	rcancel()
	dbCtx, dbCancel := docsMySQLOpContext()
	defer dbCancel()
	args := make([]interface{}, 0)
	where := "1=1"
	if category != "" {
		where += " AND d.category_id = ?"
		args = append(args, category)
	}
	if tag != "" {
		where += " AND EXISTS (SELECT 1 FROM kubebt_doc_tag_map m JOIN kubebt_doc_tags t ON t.id=m.tag_id WHERE m.doc_id=d.id AND t.name=?)"
		args = append(args, tag)
	}
	if q != "" {
		where += " AND (d.title LIKE ? OR d.body_markdown LIKE ?)"
		args = append(args, "%"+q+"%", "%"+q+"%")
	}
	sqlStr := `SELECT d.id, d.title, d.category_id, d.author, d.published, d.created_at, d.updated_at, d.content_kind,
		(SELECT GROUP_CONCAT(t.name ORDER BY t.name SEPARATOR ',') FROM kubebt_doc_tag_map m JOIN kubebt_doc_tags t ON t.id=m.tag_id WHERE m.doc_id=d.id) AS tags
		FROM kubebt_docs d WHERE ` + where + ` ORDER BY d.updated_at DESC LIMIT 500`
	rows, err := db.QueryContext(dbCtx, sqlStr, args...)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	defer rows.Close()
	var list []gin.H
	for rows.Next() {
		var id uint64
		var title, author, contentKind string
		var cat sql.NullInt64
		var pub int
		var created, updated time.Time
		var tags sql.NullString
		if err := rows.Scan(&id, &title, &cat, &author, &pub, &created, &updated, &contentKind, &tags); err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		h := gin.H{
			"id": id, "title": title, "author": author, "published": pub != 0,
			"createdAt": created.Format(time.RFC3339), "updatedAt": updated.Format(time.RFC3339),
			"contentKind": docsNormalizeContentKind(contentKind),
		}
		if cat.Valid {
			h["categoryId"] = cat.Int64
		}
		if tags.Valid && tags.String != "" {
			h["tags"] = strings.Split(tags.String, ",")
		} else {
			h["tags"] = []string{}
		}
		list = append(list, h)
	}
	payload := gin.H{"docs": list}
	c.JSON(http.StatusOK, payload)
	if app.Redis() != nil {
		if jb, err := json.Marshal(payload); err == nil {
			rev := listRev
			go func(b []byte, cat, tg, qq string, r int64) {
				c2, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer cancel()
				docsStoreListCache(c2, app, r, cat, tg, qq, b)
			}(jb, category, tag, q, rev)
		}
	}
}

type docsSaveBody struct {
	Title            string   `json:"title"`
	Body             string   `json:"bodyMarkdown"`
	ContentKind      string   `json:"contentKind"` // markdown | excalidraw
	CategoryID       *uint64  `json:"categoryId"`
	TagNames         []string `json:"tagNames"`
	Published        bool     `json:"published"`
	SaveVersion      bool     `json:"saveVersion"`
	NewSharePassword *string  `json:"newSharePassword"`
}

func docsNormalizeContentKind(s string) string {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "excalidraw":
		return "excalidraw"
	default:
		return "markdown"
	}
}

func docsValidateExcalidrawJSON(raw string) error {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return errors.New("画布数据为空")
	}
	var v map[string]any
	if err := json.Unmarshal([]byte(raw), &v); err != nil {
		return fmt.Errorf("画布 JSON 无效: %w", err)
	}
	if _, ok := v["elements"].([]any); !ok {
		return errors.New("画布缺少 elements 数组")
	}
	return nil
}

// docsSQL 兼容 *sql.DB 与 *sql.Tx（复制/删除等事务内调用）。
type docsSQL interface {
	Exec(query string, args ...any) (sql.Result, error)
	Query(query string, args ...any) (*sql.Rows, error)
	QueryRow(query string, args ...any) *sql.Row
}

func docsNormalizeWireNewlines(s string) string {
	return strings.ReplaceAll(s, "\r\n", "\n")
}

func docsSortedTagList(names []string) []string {
	out := make([]string, 0, len(names))
	for _, raw := range names {
		n := strings.TrimSpace(raw)
		if n != "" {
			out = append(out, n)
		}
	}
	sort.Strings(out)
	return out
}

func docsTagNamesFromDB(db docsSQL, docID uint64) ([]string, error) {
	rows, err := db.Query(`SELECT t.name FROM kubebt_doc_tag_map m JOIN kubebt_doc_tags t ON t.id=m.tag_id WHERE m.doc_id=? ORDER BY t.name`, docID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

func docsCategoryPtr(body docsSaveBody) *uint64 {
	if body.CategoryID != nil && *body.CategoryID > 0 {
		v := *body.CategoryID
		return &v
	}
	return nil
}

func docsCategoryPtrFromNull(cur sql.NullInt64) *uint64 {
	if cur.Valid && cur.Int64 > 0 {
		v := uint64(cur.Int64)
		return &v
	}
	return nil
}

func docsSyncTags(db docsSQL, docID uint64, names []string) error {
	if _, err := db.Exec(`DELETE FROM kubebt_doc_tag_map WHERE doc_id=?`, docID); err != nil {
		return err
	}
	for _, raw := range names {
		n := strings.TrimSpace(raw)
		if n == "" {
			continue
		}
		if _, err := db.Exec(`INSERT IGNORE INTO kubebt_doc_tags (name) VALUES (?)`, n); err != nil {
			return err
		}
		var tid uint64
		if err := db.QueryRow(`SELECT id FROM kubebt_doc_tags WHERE name=?`, n).Scan(&tid); err != nil {
			return err
		}
		if _, err := db.Exec(`INSERT IGNORE INTO kubebt_doc_tag_map (doc_id, tag_id) VALUES (?,?)`, docID, tid); err != nil {
			return err
		}
	}
	return nil
}

func docsNextVersionNo(db docsSQL, docID uint64) (int, error) {
	var n sql.NullInt64
	err := db.QueryRow(`SELECT MAX(version_no) FROM kubebt_doc_versions WHERE doc_id=?`, docID).Scan(&n)
	if err != nil {
		return 0, err
	}
	if !n.Valid {
		return 1, nil
	}
	return int(n.Int64) + 1, nil
}

func docsInsertVersion(db docsSQL, docID uint64, ver int, title, body, who, contentKind string) error {
	k := docsNormalizeContentKind(contentKind)
	_, err := db.Exec(`INSERT INTO kubebt_doc_versions (doc_id, version_no, title, body_markdown, content_kind, created_by) VALUES (?,?,?,?,?,?)`,
		docID, ver, title, body, k, who)
	return err
}

func docsCreate(c *gin.Context, app *ServerApp) {
	db := docsRequireMySQL(c, app)
	if db == nil {
		return
	}
	var body docsSaveBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	who := docsActor(c, app)
	pub := 0
	if body.Published {
		pub = 1
	}
	kind := docsNormalizeContentKind(body.ContentKind)
	if kind == "excalidraw" {
		if err := docsValidateExcalidrawJSON(body.Body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}
	var cat interface{}
	if body.CategoryID != nil && *body.CategoryID > 0 {
		cat = *body.CategoryID
	}
	res, err := db.Exec(`INSERT INTO kubebt_docs (title, body_markdown, content_kind, category_id, author, published) VALUES (?,?,?,?,?,?)`,
		strings.TrimSpace(body.Title), body.Body, kind, cat, who, pub)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	id64, _ := res.LastInsertId()
	docID := uint64(id64)
	if err := docsSyncTags(db, docID, body.TagNames); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := docsInsertVersion(db, docID, 1, strings.TrimSpace(body.Title), body.Body, who, kind); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := docsApplySharePasswordUpdate(db, docID, body.NewSharePassword); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	docsBumpCtx, docsBumpCancel := context.WithTimeout(context.Background(), 3*time.Second)
	docsBumpDocsAPICache(docsBumpCtx, app, docID)
	docsBumpCancel()
	c.JSON(http.StatusOK, gin.H{"id": docID, "previewUrl": fmt.Sprintf("/r/%d.html", docID)})
}

func docsGet(c *gin.Context, app *ServerApp) {
	db := docsRequireMySQL(c, app)
	if db == nil {
		return
	}
	id, err := strconv.ParseUint(strings.TrimSpace(c.Param("id")), 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效 id"})
		return
	}
	rctx, rcancel := docsRedisOpContext()
	if hit := docsTryDetailCache(rctx, app, id); len(hit) > 0 {
		rcancel()
		c.Data(http.StatusOK, "application/json", hit)
		return
	}
	rcancel()
	dbCtx, dbCancel := docsMySQLOpContext()
	defer dbCancel()
	var title, body, author, contentKind string
	var cat sql.NullInt64
	var pub int
	var created, updated time.Time
	var shareHash sql.NullString
	err = db.QueryRowContext(dbCtx, `SELECT title, body_markdown, content_kind, category_id, author, published, created_at, updated_at, share_password_hash FROM kubebt_docs WHERE id=?`, id).
		Scan(&title, &body, &contentKind, &cat, &author, &pub, &created, &updated, &shareHash)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "文档不存在"})
		return
	}
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	tagRows, err := db.QueryContext(dbCtx, `SELECT t.name FROM kubebt_doc_tag_map m JOIN kubebt_doc_tags t ON t.id=m.tag_id WHERE m.doc_id=? ORDER BY t.name`, id)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	defer tagRows.Close()
	var tags []string
	for tagRows.Next() {
		var n string
		if err := tagRows.Scan(&n); err != nil {
			break
		}
		tags = append(tags, n)
	}
	out := gin.H{
		"id": id, "title": title, "bodyMarkdown": body, "author": author, "published": pub != 0,
		"contentKind": docsNormalizeContentKind(contentKind),
		"createdAt": created.Format(time.RFC3339), "updatedAt": updated.Format(time.RFC3339),
		"tagNames": tags, "previewUrl": fmt.Sprintf("/r/%d.html", id),
		"hasSharePassword": shareHash.Valid && strings.TrimSpace(shareHash.String) != "",
	}
	if cat.Valid {
		out["categoryId"] = cat.Int64
	}
	c.JSON(http.StatusOK, out)
	if app.Redis() != nil {
		if jb, err := json.Marshal(out); err == nil {
			docID := id
			go func(b []byte) {
				c2, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer cancel()
				docsStoreDetailCache(c2, app, docID, b)
			}(jb)
		}
	}
}

func docsUpdate(c *gin.Context, app *ServerApp) {
	db := docsRequireMySQL(c, app)
	if db == nil {
		return
	}
	id, err := strconv.ParseUint(strings.TrimSpace(c.Param("id")), 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效 id"})
		return
	}
	var body docsSaveBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	who := docsActor(c, app)
	pub := 0
	if body.Published {
		pub = 1
	}
	var existingKind, curTitle, curBody string
	var curCat sql.NullInt64
	var curPub int
	if err := db.QueryRow(`SELECT content_kind, title, body_markdown, category_id, published FROM kubebt_docs WHERE id=?`, id).
		Scan(&existingKind, &curTitle, &curBody, &curCat, &curPub); err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "文档不存在"})
		return
	} else if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	oldK := docsNormalizeContentKind(existingKind)
	wantK := oldK
	if strings.TrimSpace(body.ContentKind) != "" {
		wantK = docsNormalizeContentKind(body.ContentKind)
	}
	if wantK != oldK {
		c.JSON(http.StatusBadRequest, gin.H{"error": "不支持修改文档类型（Markdown 与画布不能互转）"})
		return
	}
	if wantK == "excalidraw" {
		if err := docsValidateExcalidrawJSON(body.Body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}
	var cat interface{}
	if body.CategoryID != nil && *body.CategoryID > 0 {
		cat = *body.CategoryID
	}
	wantTitle := strings.TrimSpace(body.Title)
	tagsHave, err := docsTagNamesFromDB(db, id)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	tagsEqual := strings.Join(tagsHave, "\x1e") == strings.Join(docsSortedTagList(body.TagNames), "\x1e")
	catEqual := func() bool {
		a := docsCategoryPtr(body)
		b := docsCategoryPtrFromNull(curCat)
		if a == nil && b == nil {
			return true
		}
		if a == nil || b == nil {
			return false
		}
		return *a == *b
	}()
	if strings.TrimSpace(curTitle) == wantTitle &&
		docsNormalizeWireNewlines(curBody) == docsNormalizeWireNewlines(body.Body) &&
		curPub == pub && catEqual && tagsEqual && body.NewSharePassword == nil {
		c.JSON(http.StatusOK, gin.H{"ok": true, "previewUrl": fmt.Sprintf("/r/%d.html", id), "unchanged": true})
		return
	}
	res, err := db.Exec(`UPDATE kubebt_docs SET title=?, body_markdown=?, category_id=?, published=? WHERE id=?`,
		wantTitle, body.Body, cat, pub, id)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "文档不存在"})
		return
	}
	if err := docsSyncTags(db, id, body.TagNames); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if body.SaveVersion {
		v, err := docsNextVersionNo(db, id)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if err := docsInsertVersion(db, id, v, wantTitle, body.Body, who, oldK); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}
	if err := docsApplySharePasswordUpdate(db, id, body.NewSharePassword); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	docsBumpCtx, docsBumpCancel := context.WithTimeout(context.Background(), 3*time.Second)
	docsBumpDocsAPICache(docsBumpCtx, app, id)
	docsBumpCancel()
	c.JSON(http.StatusOK, gin.H{"ok": true, "previewUrl": fmt.Sprintf("/r/%d.html", id)})
}

func docsVersions(c *gin.Context, app *ServerApp) {
	db := docsRequireMySQL(c, app)
	if db == nil {
		return
	}
	id, err := strconv.ParseUint(strings.TrimSpace(c.Param("id")), 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效 id"})
		return
	}
	rows, err := db.Query(`SELECT version_no, title, created_by, created_at FROM kubebt_doc_versions WHERE doc_id=? ORDER BY version_no DESC`, id)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	defer rows.Close()
	var list []gin.H
	for rows.Next() {
		var ver int
		var title, who string
		var ts time.Time
		if err := rows.Scan(&ver, &title, &who, &ts); err != nil {
			break
		}
		list = append(list, gin.H{"versionNo": ver, "title": title, "createdBy": who, "createdAt": ts.Format(time.RFC3339)})
	}
	c.JSON(http.StatusOK, gin.H{"versions": list})
}

func docsRestoreVersion(c *gin.Context, app *ServerApp) {
	db := docsRequireMySQL(c, app)
	if db == nil {
		return
	}
	id, err := strconv.ParseUint(strings.TrimSpace(c.Param("id")), 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效 id"})
		return
	}
	var body struct {
		VersionNo int `json:"versionNo"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.VersionNo <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供 versionNo"})
		return
	}
	var title, md, verKind string
	err = db.QueryRow(`SELECT title, body_markdown, content_kind FROM kubebt_doc_versions WHERE doc_id=? AND version_no=?`, id, body.VersionNo).Scan(&title, &md, &verKind)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "版本不存在"})
		return
	}
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	vk := docsNormalizeContentKind(verKind)
	who := docsActor(c, app)
	if _, err := db.Exec(`UPDATE kubebt_docs SET title=?, body_markdown=?, content_kind=? WHERE id=?`, title, md, vk, id); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	v, err := docsNextVersionNo(db, id)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := docsInsertVersion(db, id, v, title, md, who+"(restore)", vk); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	docsBumpCtx, docsBumpCancel := context.WithTimeout(context.Background(), 3*time.Second)
	docsBumpDocsAPICache(docsBumpCtx, app, id)
	docsBumpCancel()
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func docsDuplicate(c *gin.Context, app *ServerApp) {
	db := docsRequireMySQL(c, app)
	if db == nil {
		return
	}
	id, err := strconv.ParseUint(strings.TrimSpace(c.Param("id")), 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效 id"})
		return
	}
	var title, body, dupKind string
	var cat sql.NullInt64
	err = db.QueryRow(`SELECT title, body_markdown, category_id, content_kind FROM kubebt_docs WHERE id=?`, id).Scan(&title, &body, &cat, &dupKind)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "文档不存在"})
		return
	}
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	who := docsActor(c, app)
	newTitle := strings.TrimSpace(title)
	if newTitle == "" {
		newTitle = "未命名副本"
	} else {
		newTitle = newTitle + " (副本)"
	}
	var catArg interface{}
	if cat.Valid && cat.Int64 > 0 {
		catArg = cat.Int64
	} else {
		catArg = nil
	}
	tx, err := db.Begin()
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	defer func() { _ = tx.Rollback() }()
	res, err := tx.Exec(`INSERT INTO kubebt_docs (title, body_markdown, content_kind, category_id, author, published) VALUES (?,?,?,?,?,0)`,
		newTitle, body, docsNormalizeContentKind(dupKind), catArg, who)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	nid, _ := res.LastInsertId()
	newID := uint64(nid)
	tagRows, err := tx.Query(`SELECT t.name FROM kubebt_doc_tag_map m JOIN kubebt_doc_tags t ON t.id=m.tag_id WHERE m.doc_id=? ORDER BY t.name`, id)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var tagnames []string
	for tagRows.Next() {
		var n string
		if err := tagRows.Scan(&n); err != nil {
			tagRows.Close()
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		tagnames = append(tagnames, n)
	}
	tagRows.Close()
	if err := docsSyncTags(tx, newID, tagnames); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := docsInsertVersion(tx, newID, 1, newTitle, body, who, dupKind); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := tx.Commit(); err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	docsBumpCtx, docsBumpCancel := context.WithTimeout(context.Background(), 3*time.Second)
	docsBumpDocsAPICache(docsBumpCtx, app)
	docsBumpCancel()
	c.JSON(http.StatusOK, gin.H{"id": newID, "previewUrl": fmt.Sprintf("/r/%d.html", newID)})
}

func docsPatchCategory(c *gin.Context, app *ServerApp) {
	db := docsRequireMySQL(c, app)
	if db == nil {
		return
	}
	id, err := strconv.ParseUint(strings.TrimSpace(c.Param("id")), 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效 id"})
		return
	}
	var body struct {
		CategoryID *uint64 `json:"categoryId"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var cat interface{}
	if body.CategoryID != nil && *body.CategoryID > 0 {
		cat = *body.CategoryID
	} else {
		cat = nil
	}
	res, err := db.Exec(`UPDATE kubebt_docs SET category_id=? WHERE id=?`, cat, id)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "文档不存在"})
		return
	}
	docsBumpCtx, docsBumpCancel := context.WithTimeout(context.Background(), 3*time.Second)
	docsBumpDocsAPICache(docsBumpCtx, app, id)
	docsBumpCancel()
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func docsDelete(c *gin.Context, app *ServerApp) {
	db := docsRequireMySQL(c, app)
	if db == nil {
		return
	}
	id, err := strconv.ParseUint(strings.TrimSpace(c.Param("id")), 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效 id"})
		return
	}
	tx, err := db.Begin()
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.Exec(`DELETE FROM kubebt_doc_tag_map WHERE doc_id=?`, id); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if _, err := tx.Exec(`DELETE FROM kubebt_doc_versions WHERE doc_id=?`, id); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if _, err := tx.Exec(`UPDATE kubebt_doc_media SET doc_id=NULL WHERE doc_id=?`, id); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	res, err := tx.Exec(`DELETE FROM kubebt_docs WHERE id=?`, id)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "文档不存在"})
		return
	}
	if err := tx.Commit(); err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	docsBumpCtx, docsBumpCancel := context.WithTimeout(context.Background(), 3*time.Second)
	docsBumpDocsAPICache(docsBumpCtx, app, id)
	docsBumpCancel()
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type docsUploadResult struct {
	PublicURL   string
	Storage     string
	StorageKey  string
	PublicToken string
}

func docsSaveUploadedMedia(app *ServerApp, origName string, mimeType string, data []byte) (docsUploadResult, error) {
	cfg := app.Cfg()
	eff := effectiveDocsCos(app)
	token := uuid.NewString()
	ext := strings.ToLower(filepath.Ext(origName))
	if ext == "" {
		ext = guessExtFromMime(mimeType)
	}
	sub := time.Now().UTC().Format("2006/01") + "/" + token + ext
	if eff.UseCOS {
		objKey := sub
		if eff.Prefix != "" {
			objKey = eff.Prefix + "/" + sub
		}
		host := eff.bucketHost()
		if err := cosSigV4PutObject(host, eff.Region, eff.SecretID, eff.SecretKey, objKey, data, mimeType); err != nil {
			return docsUploadResult{}, err
		}
		return docsUploadResult{
			PublicURL:   docsCosPublicURLFor(eff, objKey),
			Storage:     "cos",
			StorageKey:  objKey,
			PublicToken: token,
		}, nil
	}
	dir := filepath.Join(app.DataDir(), "doc-uploads", filepath.Dir(sub))
	if err := os.MkdirAll(dir, 0700); err != nil {
		return docsUploadResult{}, err
	}
	full := filepath.Join(app.DataDir(), "doc-uploads", sub)
	if err := os.WriteFile(full, data, 0600); err != nil {
		return docsUploadResult{}, err
	}
	base := strings.TrimRight(cfg.PlatformPublicURL, "/")
	return docsUploadResult{
		PublicURL:   base + "/d/" + token,
		Storage:     "local",
		StorageKey:  sub,
		PublicToken: token,
	}, nil
}

func guessExtFromMime(m string) string {
	switch strings.Split(m, ";")[0] {
	case "image/png":
		return ".png"
	case "image/jpeg", "image/jpg":
		return ".jpg"
	case "image/gif":
		return ".gif"
	case "image/webp":
		return ".webp"
	case "application/json":
		return ".json"
	case "text/plain":
		return ".txt"
	default:
		return ".bin"
	}
}

func docsUpload(c *gin.Context, app *ServerApp) {
	db := docsRequireMySQL(c, app)
	if db == nil {
		return
	}
	fh, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择文件字段 file"})
		return
	}
	f, err := fh.Open()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, 32<<20))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	kind := strings.TrimSpace(c.PostForm("kind"))
	if kind == "" {
		kind = "attachment"
	}
	var docID sql.NullInt64
	if s := strings.TrimSpace(c.PostForm("docId")); s != "" {
		if n, e := strconv.ParseUint(s, 10, 64); e == nil && n > 0 {
			docID = sql.NullInt64{Int64: int64(n), Valid: true}
		}
	}
	mimeType := fh.Header.Get("Content-Type")
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}
	up, err := docsSaveUploadedMedia(app, fh.Filename, mimeType, data)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	who := docsActor(c, app)
	var res sql.Result
	if docID.Valid {
		res, err = db.Exec(`INSERT INTO kubebt_doc_media (doc_id, kind, orig_name, mime, size_bytes, storage, storage_key, public_token, public_url, created_by) VALUES (?,?,?,?,?,?,?,?,?,?)`,
			docID.Int64, kind, fh.Filename, mimeType, len(data), up.Storage, up.StorageKey, up.PublicToken, up.PublicURL, who)
	} else {
		res, err = db.Exec(`INSERT INTO kubebt_doc_media (doc_id, kind, orig_name, mime, size_bytes, storage, storage_key, public_token, public_url, created_by) VALUES (NULL,?,?,?,?,?,?,?,?,?)`,
			kind, fh.Filename, mimeType, len(data), up.Storage, up.StorageKey, up.PublicToken, up.PublicURL, who)
	}
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	mid, _ := res.LastInsertId()
	mdSnippet := fmt.Sprintf("[%s](%s)", strings.ReplaceAll(fh.Filename, "]", ""), up.PublicURL)
	if strings.HasPrefix(mimeType, "image/") {
		mdSnippet = fmt.Sprintf("![%s](%s)", strings.ReplaceAll(fh.Filename, "]", ""), up.PublicURL)
	}
	c.JSON(http.StatusOK, gin.H{
		"id": mid, "url": up.PublicURL, "markdown": mdSnippet,
	})
}

func docsMediaList(c *gin.Context, app *ServerApp) {
	db := docsRequireMySQL(c, app)
	if db == nil {
		return
	}
	rows, err := db.Query(`SELECT id, doc_id, kind, orig_name, mime, size_bytes, public_url, created_by, created_at FROM kubebt_doc_media ORDER BY id DESC LIMIT 500`)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	defer rows.Close()
	var list []gin.H
	for rows.Next() {
		var id, size uint64
		var docID sql.NullInt64
		var kind, oname, mime, pub, who string
		var ts time.Time
		if err := rows.Scan(&id, &docID, &kind, &oname, &mime, &size, &pub, &who, &ts); err != nil {
			break
		}
		h := gin.H{"id": id, "kind": kind, "origName": oname, "mime": mime, "sizeBytes": size, "publicUrl": pub, "createdBy": who, "createdAt": ts.Format(time.RFC3339)}
		if docID.Valid {
			h["docId"] = docID.Int64
		}
		list = append(list, h)
	}
	c.JSON(http.StatusOK, gin.H{"items": list})
}

func docsMediaDelete(c *gin.Context, app *ServerApp) {
	db := docsRequireMySQL(c, app)
	if db == nil {
		return
	}
	id, err := strconv.ParseUint(strings.TrimSpace(c.Param("id")), 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效 id"})
		return
	}
	var storage, skey string
	err = db.QueryRow(`SELECT storage, storage_key FROM kubebt_doc_media WHERE id=?`, id).Scan(&storage, &skey)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "不存在"})
		return
	}
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	eff := effectiveDocsCos(app)
	if storage == "cos" && eff.UseCOS {
		host := eff.bucketHost()
		_ = cosSigV4DeleteObject(host, eff.Region, eff.SecretID, eff.SecretKey, skey)
	} else if storage == "local" && skey != "" {
		_ = os.Remove(filepath.Join(app.DataDir(), "doc-uploads", skey))
	}
	if _, err := db.Exec(`DELETE FROM kubebt_doc_media WHERE id=?`, id); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func docsApplySharePasswordUpdate(db *sql.DB, docID uint64, p *string) error {
	if p == nil {
		return nil
	}
	raw := strings.TrimSpace(*p)
	if raw == "" {
		_, err := db.Exec(`UPDATE kubebt_docs SET share_password_hash=NULL WHERE id=?`, docID)
		return err
	}
	if len(raw) > 500 {
		return fmt.Errorf("访问密码过长")
	}
	h, err := bcrypt.GenerateFromPassword([]byte(raw), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	_, err = db.Exec(`UPDATE kubebt_docs SET share_password_hash=? WHERE id=?`, string(h), docID)
	return err
}

func parseDocPublicAssetPath(rp string) (uint64, bool) {
	p := strings.TrimPrefix(strings.TrimSpace(rp), "/")
	if !strings.HasSuffix(strings.ToLower(p), ".html") {
		return 0, false
	}
	idStr := strings.TrimSuffix(p, filepath.Ext(p))
	docID, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil || docID == 0 {
		return 0, false
	}
	return docID, true
}

func docPublicSiteLabel(app *ServerApp) string {
	site := strings.TrimSpace(app.Cfg().PlatformDisplayName)
	if site == "" {
		return "文档文库"
	}
	return site
}

func docPublicHomeURL(cfg Config) string {
	u := strings.TrimSpace(cfg.PlatformPublicURL)
	if u == "" {
		return "/"
	}
	return strings.TrimRight(u, "/") + "/"
}

// HandleDocPublicRoute GET/POST /r/123.html — 无需登录；已发布可访问；可选分享密码（Cookie 验证）。
func HandleDocPublicRoute(c *gin.Context, app *ServerApp) {
	switch c.Request.Method {
	case http.MethodGet:
		handleDocPublicGET(c, app)
	case http.MethodPost:
		handleDocPublicPOST(c, app)
	default:
		c.Status(http.StatusMethodNotAllowed)
	}
}

func handleDocPublicGET(c *gin.Context, app *ServerApp) {
	db := app.MySQLDB()
	if db == nil {
		c.String(http.StatusServiceUnavailable, "service unavailable")
		return
	}
	docID, ok := parseDocPublicAssetPath(c.Param("rp"))
	if !ok {
		c.Status(http.StatusNotFound)
		return
	}
	var title, md, author, docKind string
	var created, updated time.Time
	var tagCSV, catName, shareHash sql.NullString
	err := db.QueryRow(`SELECT d.title, d.body_markdown, d.content_kind, d.author, d.created_at, d.updated_at,
		(SELECT GROUP_CONCAT(t.name ORDER BY t.name SEPARATOR ',') FROM kubebt_doc_tag_map m JOIN kubebt_doc_tags t ON t.id=m.tag_id WHERE m.doc_id=d.id) AS tag_csv,
		c.name, d.share_password_hash
		FROM kubebt_docs d
		LEFT JOIN kubebt_doc_categories c ON c.id = d.category_id
		WHERE d.id=? AND d.published <> 0`, docID).Scan(&title, &md, &docKind, &author, &created, &updated, &tagCSV, &catName, &shareHash)
	if err == sql.ErrNoRows {
		c.Status(http.StatusNotFound)
		return
	}
	if err != nil {
		c.String(http.StatusInternalServerError, err.Error())
		return
	}
	needPw := shareHash.Valid && strings.TrimSpace(shareHash.String) != ""
	secret := docShareHMACSecret(app.Cfg())
	ck, _ := c.Cookie(docShareCookieName(docID))
	if needPw && !verifyDocShareCookieValue(ck, docID, secret) {
		site := docPublicSiteLabel(app)
		html, err := RenderDocPublicUnlockPage(docUnlockPageData{
			SiteLabel:  site,
			HomeURL:    docPublicHomeURL(app.Cfg()),
			DocTitle:   title,
			ActionPath: fmt.Sprintf("/r/%d.html", docID),
			ErrMsg:     "",
			HasErr:     false,
		})
		if err != nil {
			c.String(http.StatusInternalServerError, "render error")
			return
		}
		c.Data(http.StatusOK, "text/html; charset=utf-8", html)
		return
	}
	serveDocPublicPublishedPage(c, app, docID, title, md, docKind, author, created, updated, tagCSV, catName)
}

func handleDocPublicPOST(c *gin.Context, app *ServerApp) {
	db := app.MySQLDB()
	if db == nil {
		c.String(http.StatusServiceUnavailable, "service unavailable")
		return
	}
	docID, ok := parseDocPublicAssetPath(c.Param("rp"))
	if !ok {
		c.Status(http.StatusNotFound)
		return
	}
	var title string
	var shareHash sql.NullString
	err := db.QueryRow(`SELECT d.title, d.share_password_hash FROM kubebt_docs d WHERE d.id=? AND d.published <> 0`, docID).
		Scan(&title, &shareHash)
	if err == sql.ErrNoRows {
		c.Status(http.StatusNotFound)
		return
	}
	if err != nil {
		c.String(http.StatusInternalServerError, err.Error())
		return
	}
	needPw := shareHash.Valid && strings.TrimSpace(shareHash.String) != ""
	if !needPw {
		c.Redirect(http.StatusSeeOther, fmt.Sprintf("/r/%d.html", docID))
		return
	}
	pass := c.PostForm("password")
	if bcrypt.CompareHashAndPassword([]byte(strings.TrimSpace(shareHash.String)), []byte(pass)) != nil {
		site := docPublicSiteLabel(app)
		html, err := RenderDocPublicUnlockPage(docUnlockPageData{
			SiteLabel:  site,
			HomeURL:    docPublicHomeURL(app.Cfg()),
			DocTitle:   title,
			ActionPath: fmt.Sprintf("/r/%d.html", docID),
			ErrMsg:     "密码错误，请重试",
			HasErr:     true,
		})
		if err != nil {
			c.String(http.StatusInternalServerError, "render error")
			return
		}
		c.Data(http.StatusOK, "text/html; charset=utf-8", html)
		return
	}
	sec := docShareHMACSecret(app.Cfg())
	setDocShareCookie(c, app.Cfg(), docID, mintDocShareCookieValue(docID, sec))
	c.Redirect(http.StatusSeeOther, fmt.Sprintf("/r/%d.html", docID))
}

func serveDocPublicPublishedPage(c *gin.Context, app *ServerApp, docID uint64, title, md, contentKind, author string, created, updated time.Time, tagCSV, catName sql.NullString) {
	redisCtx, redisCancel := docsRedisOpContext()
	if hit := docsTryPublicPageCache(redisCtx, app, docID); len(hit) > 0 {
		redisCancel()
		c.Data(http.StatusOK, "text/html; charset=utf-8", hit)
		return
	}
	redisCancel()

	site := docPublicSiteLabel(app)
	home := docPublicHomeURL(app.Cfg())
	author = strings.TrimSpace(author)
	loc := BeijingLocation()
	updatedStr, createdStr := "", ""
	if !updated.IsZero() {
		updatedStr = updated.In(loc).Format("2006-01-02 15:04")
	}
	if !created.IsZero() {
		createdStr = created.In(loc).Format("2006-01-02 15:04")
	}
	var tags []string
	if tagCSV.Valid && tagCSV.String != "" {
		tags = strings.Split(tagCSV.String, ",")
	}
	cat := ""
	if catName.Valid {
		cat = strings.TrimSpace(catName.String)
	}
	k := docsNormalizeContentKind(contentKind)
	var page []byte
	var err error
	if k == "excalidraw" {
		if err := docsValidateExcalidrawJSON(md); err != nil {
			pd := docPublicPageData{
				Title:         title,
				SiteLabel:     site,
				HomeURL:       home,
				IsExcalidraw:  false,
				ExcalidrawErr: err.Error(),
				HasExDrawErr:  true,
				Author:        author,
				HasAuthor:     author != "",
				Updated:       updatedStr,
				HasUpdated:    updatedStr != "",
				Created:       createdStr,
				HasCreated:    createdStr != "",
				Category:      cat,
				HasCategory:   cat != "",
				Tags:          tags,
				DocID:         docID,
				Year:          time.Now().In(loc).Year(),
				Desc:          strings.TrimSpace(title),
			}
			fillDocPublicPageDataAssets(&pd, app.Cfg())
			page, err = RenderDocPublicPageHTML(pd)
		} else {
			b64 := base64.StdEncoding.EncodeToString([]byte(strings.TrimSpace(md)))
			pd := docPublicPageData{
				Title:          title,
				SiteLabel:      site,
				HomeURL:        home,
				IsExcalidraw:   true,
				SceneB64Quoted: template.JS(strconv.Quote(b64)),
				Author:         author,
				HasAuthor:      author != "",
				Updated:        updatedStr,
				HasUpdated:     updatedStr != "",
				Created:        createdStr,
				HasCreated:     createdStr != "",
				Category:       cat,
				HasCategory:    cat != "",
				Tags:           tags,
				DocID:          docID,
				Year:           time.Now().In(loc).Year(),
				Desc:           strings.TrimSpace(title),
			}
			fillDocPublicPageDataAssets(&pd, app.Cfg())
			page, err = RenderDocPublicPageHTML(pd)
		}
	} else {
		htmlBody, e2 := renderDocMarkdownToHTML(md)
		if e2 != nil {
			c.String(http.StatusInternalServerError, "render error")
			return
		}
		pd := docPublicPageData{
			Title:        title,
			BodyHTML:     template.HTML(htmlBody),
			SiteLabel:    site,
			HomeURL:      home,
			IsExcalidraw: false,
			Author:       author,
			HasAuthor:    author != "",
			Updated:      updatedStr,
			HasUpdated:   updatedStr != "",
			Created:      createdStr,
			HasCreated:   createdStr != "",
			Category:     cat,
			HasCategory:  cat != "",
			Tags:         tags,
			DocID:        docID,
			Year:         time.Now().In(loc).Year(),
			Desc:         docPublicMetaDescription(title, md),
		}
		fillDocPublicPageDataAssets(&pd, app.Cfg())
		page, err = RenderDocPublicPageHTML(pd)
	}
	if err != nil {
		c.String(http.StatusInternalServerError, "render error")
		return
	}
	storeCtx, storeCancel := docsRedisOpContext()
	docsStorePublicPageCache(storeCtx, app, docID, page)
	storeCancel()
	c.Data(http.StatusOK, "text/html; charset=utf-8", page)
}

// HandleDocPublicMedia GET /d/:token — 本地附件直链；COS 则 302 到桶 URL。
func HandleDocPublicMedia(c *gin.Context, app *ServerApp) {
	db := app.MySQLDB()
	if db == nil {
		c.Status(http.StatusNotFound)
		return
	}
	token := strings.TrimSpace(c.Param("token"))
	var storage, skey, pubURL, mime string
	err := db.QueryRow(`SELECT storage, storage_key, public_url, mime FROM kubebt_doc_media WHERE public_token=?`, token).Scan(&storage, &skey, &pubURL, &mime)
	if err == sql.ErrNoRows {
		c.Status(http.StatusNotFound)
		return
	}
	if err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}
	if storage == "cos" && pubURL != "" {
		c.Redirect(http.StatusFound, pubURL)
		return
	}
	if skey == "" {
		c.Status(http.StatusNotFound)
		return
	}
	full := filepath.Join(app.DataDir(), "doc-uploads", skey)
	if _, err := os.Stat(full); err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	if mime == "" {
		mime = "application/octet-stream"
	}
	c.Header("Content-Type", mime)
	c.File(full)
}

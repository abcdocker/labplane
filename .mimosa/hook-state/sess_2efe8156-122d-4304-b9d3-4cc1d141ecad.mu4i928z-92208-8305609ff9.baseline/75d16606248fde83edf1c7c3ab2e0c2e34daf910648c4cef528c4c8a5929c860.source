package internal

// PlatformKV 平台键值（cloud_hosts、向导状态等）；实现可为本地 JSON 文件或 MySQL。
type PlatformKV interface {
	Get(k string) (string, bool)
	Set(k, v string) error
	Snapshot() map[string]string
}

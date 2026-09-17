package internal

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

// PlatformKVFile 将平台键值存于本地 JSON（MySQL DSN 在配置中必填时，可与后续 DB 同步方案并存）。
type PlatformKVFile struct {
	mu   sync.Mutex
	path string
	data map[string]string
}

func newPlatformKVFile(dataDir string) (*PlatformKVFile, error) {
	path := filepath.Join(dataDir, "platform_kv.json")
	p := &PlatformKVFile{path: path, data: map[string]string{}}
	b, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return p, nil
		}
		return nil, err
	}
	if len(b) == 0 {
		return p, nil
	}
	if err := json.Unmarshal(b, &p.data); err != nil {
		return nil, err
	}
	if p.data == nil {
		p.data = map[string]string{}
	}
	return p, nil
}

func (p *PlatformKVFile) Set(k, v string) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.data == nil {
		p.data = map[string]string{}
	}
	p.data[k] = v
	return p.saveLocked()
}

func (p *PlatformKVFile) Get(k string) (string, bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	v, ok := p.data[k]
	return v, ok
}

// Snapshot 返回当前内存映射副本（用于镜像到 Redis）。
func (p *PlatformKVFile) Snapshot() map[string]string {
	p.mu.Lock()
	defer p.mu.Unlock()
	out := make(map[string]string, len(p.data))
	for k, v := range p.data {
		out[k] = v
	}
	return out
}

func (p *PlatformKVFile) saveLocked() error {
	b, err := json.MarshalIndent(p.data, "", "  ")
	if err != nil {
		return err
	}
	tmp := p.path + ".tmp"
	if err := os.WriteFile(tmp, b, 0600); err != nil {
		return err
	}
	return os.Rename(tmp, p.path)
}

var _ PlatformKV = (*PlatformKVFile)(nil)

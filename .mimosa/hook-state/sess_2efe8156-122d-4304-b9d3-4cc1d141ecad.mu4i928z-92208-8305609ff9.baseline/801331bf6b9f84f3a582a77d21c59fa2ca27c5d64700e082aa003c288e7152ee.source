package internal

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

// SSHSettingsBackend 凭据持久化：file（默认无第三方依赖）/ redis / mysql（需 go get 对应驱动）。
type SSHSettingsBackend string

const (
	SSHBackendNone  SSHSettingsBackend = ""
	SSHBackendFile  SSHSettingsBackend = "file"
	SSHBackendRedis SSHSettingsBackend = "redis"
	SSHBackendMySQL SSHSettingsBackend = "mysql"
)

// SSHVMStored 单台虚拟机 SSH 凭据（内存态，已解密）。
type SSHVMStored struct {
	User               string
	Password           string
	PrivateKeyPEM      string
	KeyPassphrase      string
	Port               int
	InsecureHostKey    bool
	HostKeyFingerprint string
}

func (s *SSHVMStored) hasAuth() bool {
	if strings.TrimSpace(s.User) == "" {
		return false
	}
	return strings.TrimSpace(s.Password) != "" || strings.TrimSpace(s.PrivateKeyPEM) != ""
}

// sshVMRecordJSON 文件/Redis 中 JSON（敏感字段为 base64(密文)）。
type sshVMRecordJSON struct {
	User               string `json:"user"`
	PasswordEnc        string `json:"p,omitempty"`
	PrivateKeyEnc      string `json:"k,omitempty"`
	KeyPassEnc         string `json:"kp,omitempty"`
	Port               int    `json:"port"`
	InsecureHostKey    bool   `json:"ih"`
	HostKeyFingerprint string `json:"hostKeyFingerprint,omitempty"`
}

// SSHSettingsStore 按 VM moref 存取 SSH 配置。
type SSHSettingsStore interface {
	GetVM(ctx context.Context, moref string, encKey []byte) (*SSHVMStored, error)
	PutVM(ctx context.Context, moref string, patch *sshVMPutInput, encKey []byte) error
	DeleteVM(ctx context.Context, moref string) error
	Backend() SSHSettingsBackend
}

// sshVMPutInput 更新项：指针 nil 表示不修改该项。
type sshVMPutInput struct {
	User               string
	Password           *string
	PrivateKeyPEM      *string
	KeyPassphrase      *string
	Port               *int
	InsecureHostKey    *bool
	HostKeyFingerprint *string
}

type fileSSHStore struct {
	dir string
	mu  sync.Mutex
}

func (s *fileSSHStore) Backend() SSHSettingsBackend { return SSHBackendFile }

func (s *fileSSHStore) path(moref string) string {
	safe := strings.ReplaceAll(moref, string(os.PathSeparator), "_")
	safe = strings.ReplaceAll(safe, "..", "")
	return filepath.Join(s.dir, safe+".json")
}

func (s *fileSSHStore) readFileVM(moref string, encKey []byte) (*SSHVMStored, error) {
	raw, err := os.ReadFile(s.path(moref))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	return decodeSSHVMJSON(raw, encKey)
}

func (s *fileSSHStore) GetVM(ctx context.Context, moref string, encKey []byte) (*SSHVMStored, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.readFileVM(moref, encKey)
}

func decodeSSHVMJSON(raw []byte, encKey []byte) (*SSHVMStored, error) {
	var j sshVMRecordJSON
	if err := json.Unmarshal(raw, &j); err != nil {
		return nil, err
	}
	out := &SSHVMStored{
		User:               strings.TrimSpace(j.User),
		Port:               j.Port,
		InsecureHostKey:    j.InsecureHostKey,
		HostKeyFingerprint: strings.TrimSpace(j.HostKeyFingerprint),
	}
	if len(encKey) == 0 {
		return out, nil
	}
	var err error
	if j.PasswordEnc != "" {
		out.Password, err = decryptSecret(encKey, j.PasswordEnc)
		if err != nil {
			return nil, fmt.Errorf("解密密码: %w", err)
		}
	}
	if j.PrivateKeyEnc != "" {
		out.PrivateKeyPEM, err = decryptSecret(encKey, j.PrivateKeyEnc)
		if err != nil {
			return nil, fmt.Errorf("解密私钥: %w", err)
		}
	}
	if j.KeyPassEnc != "" {
		out.KeyPassphrase, err = decryptSecret(encKey, j.KeyPassEnc)
		if err != nil {
			return nil, fmt.Errorf("解密私钥口令: %w", err)
		}
	}
	return out, nil
}

func applySSHPatch(prev *SSHVMStored, patch *sshVMPutInput) {
	if patch == nil {
		return
	}
	if strings.TrimSpace(patch.User) != "" {
		prev.User = strings.TrimSpace(patch.User)
	}
	if patch.Password != nil {
		prev.Password = *patch.Password
	}
	if patch.PrivateKeyPEM != nil {
		prev.PrivateKeyPEM = strings.TrimSpace(*patch.PrivateKeyPEM)
	}
	if patch.KeyPassphrase != nil {
		prev.KeyPassphrase = *patch.KeyPassphrase
	}
	if patch.Port != nil && *patch.Port > 0 {
		prev.Port = *patch.Port
	}
	if patch.InsecureHostKey != nil {
		prev.InsecureHostKey = *patch.InsecureHostKey
	}
	if patch.HostKeyFingerprint != nil {
		prev.HostKeyFingerprint = normalizeSSHHostKeyFingerprint(*patch.HostKeyFingerprint)
	}
}

func (s *fileSSHStore) PutVM(ctx context.Context, moref string, patch *sshVMPutInput, encKey []byte) error {
	if len(encKey) == 0 {
		return errors.New("未配置 KUBEBT_ENCRYPTION_KEY，无法写入敏感信息")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	prev, _ := s.readFileVM(moref, encKey)
	if prev == nil {
		prev = &SSHVMStored{Port: 22}
	}
	applySSHPatch(prev, patch)
	j := sshVMRecordJSON{
		User:               prev.User,
		Port:               prev.Port,
		InsecureHostKey:    prev.InsecureHostKey,
		HostKeyFingerprint: prev.HostKeyFingerprint,
	}
	var err error
	j.PasswordEnc, err = encryptSecret(encKey, prev.Password)
	if err != nil {
		return err
	}
	j.PrivateKeyEnc, err = encryptSecret(encKey, prev.PrivateKeyPEM)
	if err != nil {
		return err
	}
	j.KeyPassEnc, err = encryptSecret(encKey, prev.KeyPassphrase)
	if err != nil {
		return err
	}
	b, err := json.MarshalIndent(j, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(s.dir, 0700); err != nil {
		return err
	}
	tmp := s.path(moref) + ".tmp"
	if err := os.WriteFile(tmp, b, 0600); err != nil {
		return err
	}
	return os.Rename(tmp, s.path(moref))
}

func (s *fileSSHStore) DeleteVM(ctx context.Context, moref string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	err := os.Remove(s.path(moref))
	if os.IsNotExist(err) {
		return nil
	}
	return err
}

// OpenSSHSettingsStore 根据 cfg 打开存储；未配置后端返回 nil。
func OpenSSHSettingsStore(cfg Config) (SSHSettingsStore, error) {
	be := SSHSettingsBackend(strings.ToLower(strings.TrimSpace(string(cfg.SSHSettingsBackend))))
	switch be {
	case SSHBackendNone:
		return nil, nil
	case SSHBackendFile:
		dir := strings.TrimSpace(cfg.SSHSettingsDir)
		if dir == "" {
			return nil, fmt.Errorf("SSH_SETTINGS_BACKEND=file 时需 SSH_SETTINGS_DIR（目录路径）")
		}
		abs, err := filepath.Abs(dir)
		if err != nil {
			return nil, err
		}
		if err := os.MkdirAll(abs, 0700); err != nil {
			return nil, err
		}
		return &fileSSHStore{dir: abs}, nil
	case SSHBackendRedis, SSHBackendMySQL:
		return nil, fmt.Errorf("SSH_SETTINGS_BACKEND=redis|mysql 尚未在本发行版中启用；K8s 上请使用 file 并将 SSH_SETTINGS_DIR 放在 PVC 上（如 /data/ssh-settings），并配置 KUBEBT_ENCRYPTION_KEY")
	default:
		return nil, fmt.Errorf("不支持的 SSH_SETTINGS_BACKEND: %s", be)
	}
}

package internal

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"io"
	"strings"
)

// deriveAESKey 从 KUBEBT_ENCRYPTION_KEY 得到 32 字节密钥：64 位十六进制视为原始字节，否则对字符串做 SHA256。
func deriveAESKey(raw string) ([]byte, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, errors.New("KUBEBT_ENCRYPTION_KEY 未设置")
	}
	if len(raw) == 64 {
		b, err := hex.DecodeString(raw)
		if err == nil && len(b) == 32 {
			return b, nil
		}
	}
	h := sha256.Sum256([]byte(raw))
	return h[:], nil
}

func encryptSecret(key []byte, plaintext string) (string, error) {
	if plaintext == "" {
		return "", nil
	}
	b, err := aesEncrypt(key, []byte(plaintext))
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(b), nil
}

func decryptSecret(key []byte, encoded string) (string, error) {
	if strings.TrimSpace(encoded) == "" {
		return "", nil
	}
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", err
	}
	out, err := aesDecrypt(key, raw)
	if err != nil {
		return "", err
	}
	return string(out), nil
}

func aesEncrypt(key, plain []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	return gcm.Seal(nonce, nonce, plain, nil), nil
}

func aesDecrypt(key, data []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	ns := gcm.NonceSize()
	if len(data) < ns {
		return nil, errors.New("密文过短")
	}
	nonce, ct := data[:ns], data[ns:]
	return gcm.Open(nil, nonce, ct, nil)
}

// encryptToBlob 写入 MySQL BLOB（原始密文，非 base64）。
func encryptToBlob(key []byte, plaintext string) ([]byte, error) {
	if strings.TrimSpace(plaintext) == "" {
		return nil, nil
	}
	return aesEncrypt(key, []byte(plaintext))
}

func decryptFromBlob(key []byte, blob []byte) (string, error) {
	if len(blob) == 0 {
		return "", nil
	}
	b, err := aesDecrypt(key, blob)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

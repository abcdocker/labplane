package internal

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/sha512"
	"encoding/base64"
	"fmt"
	"strings"

	"github.com/twmb/franz-go/pkg/kmsg"
)

const kafkaScramSHA512Iterations = 4096
const kafkaScramSHA256Iterations = 4096

// kafkaScramHi512 与 Apache Kafka ScramFormatter.hi（HMAC-SHA512）一致，用于 AlterUserSCRAMCredentials Upsertion.SaltedPassword。
func kafkaScramHi512(passwordUTF8, salt []byte, iterations int) []byte {
	if iterations < 1 {
		iterations = kafkaScramSHA512Iterations
	}
	mac1 := hmac.New(sha512.New, passwordUTF8)
	_, _ = mac1.Write(salt)
	_, _ = mac1.Write([]byte{0, 0, 0, 1})
	u1 := mac1.Sum(nil)
	result := make([]byte, len(u1))
	copy(result, u1)
	prev := u1
	for i := 2; i <= iterations; i++ {
		macN := hmac.New(sha512.New, passwordUTF8)
		_, _ = macN.Write(prev)
		ui := macN.Sum(nil)
		for j := range result {
			result[j] ^= ui[j]
		}
		prev = ui
	}
	return result
}

func kafkaScramHi256(passwordUTF8, salt []byte, iterations int) []byte {
	if iterations < 1 {
		iterations = kafkaScramSHA256Iterations
	}
	mac1 := hmac.New(sha256.New, passwordUTF8)
	_, _ = mac1.Write(salt)
	_, _ = mac1.Write([]byte{0, 0, 0, 1})
	u1 := mac1.Sum(nil)
	result := make([]byte, len(u1))
	copy(result, u1)
	prev := u1
	for i := 2; i <= iterations; i++ {
		macN := hmac.New(sha256.New, passwordUTF8)
		_, _ = macN.Write(prev)
		ui := macN.Sum(nil)
		for j := range result {
			result[j] ^= ui[j]
		}
		prev = ui
	}
	return result
}

func newKafkaScramSHA512Upsertion(username, password string) (kmsg.AlterUserSCRAMCredentialsRequestUpsertion, error) {
	var z kmsg.AlterUserSCRAMCredentialsRequestUpsertion
	if username == "" || password == "" {
		return z, fmt.Errorf("用户名与密码不能为空")
	}
	salt := make([]byte, 32)
	if _, err := rand.Read(salt); err != nil {
		return z, err
	}
	pw := []byte(password)
	hi := kafkaScramHi512(pw, salt, kafkaScramSHA512Iterations)
	z.Name = username
	z.Mechanism = 2 // SCRAM-SHA-512
	z.Iterations = int32(kafkaScramSHA512Iterations)
	z.Salt = salt
	z.SaltedPassword = hi
	return z, nil
}

func newKafkaScramSHA256Upsertion(username, password string) (kmsg.AlterUserSCRAMCredentialsRequestUpsertion, error) {
	var z kmsg.AlterUserSCRAMCredentialsRequestUpsertion
	if username == "" || password == "" {
		return z, fmt.Errorf("用户名与密码不能为空")
	}
	salt := make([]byte, 32)
	if _, err := rand.Read(salt); err != nil {
		return z, err
	}
	pw := []byte(password)
	hi := kafkaScramHi256(pw, salt, kafkaScramSHA256Iterations)
	z.Name = username
	z.Mechanism = 1 // SCRAM-SHA-256
	z.Iterations = int32(kafkaScramSHA256Iterations)
	z.Salt = salt
	z.SaltedPassword = hi
	return z, nil
}

// kafkaScramUpsertForClusterMechanism 与集群 KAFKA_CFG_SASL_ENABLED_MECHANISMS 一致；PLAIN 不支持 SCRAM 凭据写入。
func kafkaScramUpsertForClusterMechanism(clusterSaslMechanism, username, password string) (kmsg.AlterUserSCRAMCredentialsRequestUpsertion, error) {
	m := strings.ToUpper(strings.TrimSpace(clusterSaslMechanism))
	if m == "" {
		m = "SCRAM-SHA-512"
	}
	switch m {
	case "SCRAM-SHA-512":
		return newKafkaScramSHA512Upsertion(username, password)
	case "SCRAM-SHA-256":
		return newKafkaScramSHA256Upsertion(username, password)
	case "PLAIN":
		return kmsg.AlterUserSCRAMCredentialsRequestUpsertion{}, fmt.Errorf("集群为 PLAIN 模式，请通过 KAFKA_CLIENT_USERS 管理用户，勿使用 SCRAM API")
	default:
		return kmsg.AlterUserSCRAMCredentialsRequestUpsertion{}, fmt.Errorf("不支持的集群 SASL 机制: %s", m)
	}
}

func kafkaScramDeletionMechanism(clusterSaslMechanism string) (int8, error) {
	m := strings.ToUpper(strings.TrimSpace(clusterSaslMechanism))
	if m == "" {
		m = "SCRAM-SHA-512"
	}
	switch m {
	case "SCRAM-SHA-512":
		return 2, nil
	case "SCRAM-SHA-256":
		return 1, nil
	case "PLAIN":
		return 0, fmt.Errorf("集群为 PLAIN 模式，无 SCRAM 凭据可删")
	default:
		return 0, fmt.Errorf("不支持的集群 SASL 机制: %s", m)
	}
}

// KafkaScramUpsertBase64 供前端展示「等价 kafka-configs」说明（非 wire 格式）。
func KafkaScramUpsertBase64(u kmsg.AlterUserSCRAMCredentialsRequestUpsertion) map[string]string {
	return map[string]string{
		"saltBase64":           base64.StdEncoding.EncodeToString(u.Salt),
		"saltedPasswordBase64": base64.StdEncoding.EncodeToString(u.SaltedPassword),
		"iterations":           fmt.Sprintf("%d", u.Iterations),
	}
}

package internal

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"
)

// cosSigV4PutObject 使用 AWS Signature V4 兼容方式向腾讯云 COS 上传对象（PUT）。
// host 形如 bucket-appid.cos.ap-guangzhou.myqcloud.com；objectKey 为对象键（不含前导 /）。
func cosSigV4PutObject(host, region, accessKey, secretKey, objectKey string, body []byte, contentType string) error {
	host = strings.TrimSpace(host)
	region = strings.TrimSpace(region)
	accessKey = strings.TrimSpace(accessKey)
	secretKey = strings.TrimSpace(secretKey)
	objectKey = strings.Trim(strings.TrimSpace(objectKey), "/")
	if host == "" || region == "" || accessKey == "" || secretKey == "" || objectKey == "" {
		return fmt.Errorf("COS 参数不完整")
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	canonicalURI := "/" + cosEncodeObjectKey(objectKey)
	amzNow := time.Now().UTC()
	amzDate := amzNow.Format("20060102T150405Z")
	dateStamp := amzNow.Format("20060102")
	payloadHash := sha256Hex(body)

	canonicalHeaders := fmt.Sprintf("content-type:%s\nhost:%s\nx-amz-content-sha256:%s\nx-amz-date:%s\n",
		strings.TrimSpace(contentType), host, payloadHash, amzDate)
	signedHeaders := "content-type;host;x-amz-content-sha256;x-amz-date"
	canonicalRequest := fmt.Sprintf("PUT\n%s\n\n%s\n%s\n%s",
		canonicalURI, canonicalHeaders, signedHeaders, payloadHash)

	credentialScope := fmt.Sprintf("%s/%s/cos/aws4_request", dateStamp, region)
	stringToSign := fmt.Sprintf("AWS4-HMAC-SHA256\n%s\n%s\n%s",
		amzDate, credentialScope, sha256Hex([]byte(canonicalRequest)))

	sig := cosSigV4Sign(secretKey, dateStamp, region, "cos", stringToSign)
	auth := fmt.Sprintf("AWS4-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s",
		accessKey, credentialScope, signedHeaders, sig)

	u := &url.URL{Scheme: "https", Host: host, Path: canonicalURI}
	req, err := http.NewRequest(http.MethodPut, u.String(), bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", contentType)
	req.Header.Set("Host", host)
	req.Header.Set("X-Amz-Date", amzDate)
	req.Header.Set("X-Amz-Content-Sha256", payloadHash)
	req.Header.Set("Authorization", auth)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("COS PUT %d: %s", resp.StatusCode, strings.TrimSpace(string(b)))
	}
	return nil
}

func cosSigV4Sign(secretKey, dateStamp, region, service, stringToSign string) string {
	kSecret := []byte("AWS4" + secretKey)
	kDate := hmacSHA256Raw(kSecret, []byte(dateStamp))
	kRegion := hmacSHA256Raw(kDate, []byte(region))
	kService := hmacSHA256Raw(kRegion, []byte(service))
	kSigning := hmacSHA256Raw(kService, []byte("aws4_request"))
	sig := hmacSHA256Raw(kSigning, []byte(stringToSign))
	return hex.EncodeToString(sig)
}

func hmacSHA256Raw(key, data []byte) []byte {
	h := hmac.New(sha256.New, key)
	_, _ = h.Write(data)
	return h.Sum(nil)
}

func sha256Hex(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

func cosEncodeObjectKey(key string) string {
	key = path.Clean("/" + key)
	key = strings.TrimPrefix(key, "/")
	if key == "" || key == "." {
		return ""
	}
	parts := strings.Split(key, "/")
	for i := range parts {
		parts[i] = url.PathEscape(parts[i])
	}
	return strings.Join(parts, "/")
}

// cosSigV4DeleteObject 删除 COS 对象（DELETE）。
func cosSigV4DeleteObject(host, region, accessKey, secretKey, objectKey string) error {
	objectKey = strings.Trim(strings.TrimSpace(objectKey), "/")
	canonicalURI := "/" + cosEncodeObjectKey(objectKey)
	amzNow := time.Now().UTC()
	amzDate := amzNow.Format("20060102T150405Z")
	dateStamp := amzNow.Format("20060102")
	payloadHash := sha256Hex(nil)

	canonicalHeaders := fmt.Sprintf("host:%s\nx-amz-content-sha256:%s\nx-amz-date:%s\n",
		host, payloadHash, amzDate)
	signedHeaders := "host;x-amz-content-sha256;x-amz-date"
	canonicalRequest := fmt.Sprintf("DELETE\n%s\n\n%s\n%s\n%s",
		canonicalURI, canonicalHeaders, signedHeaders, payloadHash)

	credentialScope := fmt.Sprintf("%s/%s/cos/aws4_request", dateStamp, region)
	stringToSign := fmt.Sprintf("AWS4-HMAC-SHA256\n%s\n%s\n%s",
		amzDate, credentialScope, sha256Hex([]byte(canonicalRequest)))

	sig := cosSigV4Sign(secretKey, dateStamp, region, "cos", stringToSign)
	auth := fmt.Sprintf("AWS4-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s",
		accessKey, credentialScope, signedHeaders, sig)

	u := &url.URL{Scheme: "https", Host: host, Path: canonicalURI}
	req, err := http.NewRequest(http.MethodDelete, u.String(), nil)
	if err != nil {
		return err
	}
	req.Header.Set("Host", host)
	req.Header.Set("X-Amz-Date", amzDate)
	req.Header.Set("X-Amz-Content-Sha256", payloadHash)
	req.Header.Set("Authorization", auth)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 && resp.StatusCode != 404 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("COS DELETE %d: %s", resp.StatusCode, strings.TrimSpace(string(b)))
	}
	return nil
}

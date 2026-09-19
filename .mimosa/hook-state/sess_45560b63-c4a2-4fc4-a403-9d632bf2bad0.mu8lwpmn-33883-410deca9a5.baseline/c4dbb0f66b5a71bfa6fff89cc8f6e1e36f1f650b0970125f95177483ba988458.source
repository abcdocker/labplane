package internal

import (
	"crypto/md5"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"
)

// ProxyNameForDomain 与 syncer CreateProxy 使用的 proxyname 一致，删除时必须同名。
func ProxyNameForDomain(domain string) string {
	s := strings.ReplaceAll(strings.ReplaceAll(domain, "*", "star"), ".", "-")
	name := "k8s-" + s
	if len(name) > 56 {
		h := fmt.Sprintf("%x", md5.Sum([]byte(domain)))
		return "k8s-" + h[:24]
	}
	return name
}

var errBaotaSiteNotFound = errors.New("宝塔站点不存在")

// BaotaSiteIDByDomain 通过站点列表查询网站 id（DeleteSite 必传 id + webname）。
func BaotaSiteIDByDomain(cfg Config, domain string) (int, error) {
	body, err := CallBaotaAPI(cfg, "/data?action=getData&table=sites", map[string]string{
		"p": "1", "limit": "100", "search": domain, "type": "-1",
	})
	if err != nil {
		return 0, err
	}
	var wrap struct {
		Data []struct {
			ID   json.RawMessage `json:"id"`
			Name string          `json:"name"`
		} `json:"data"`
	}
	if err := json.Unmarshal([]byte(body), &wrap); err != nil {
		return 0, fmt.Errorf("解析站点列表: %w", err)
	}
	for _, s := range wrap.Data {
		if s.Name == domain {
			id, err := parseJSONInt(s.ID)
			if err != nil {
				return 0, err
			}
			return id, nil
		}
	}
	return 0, errBaotaSiteNotFound
}

func parseJSONInt(raw json.RawMessage) (int, error) {
	if len(raw) == 0 {
		return 0, fmt.Errorf("空 id")
	}
	var n float64
	if err := json.Unmarshal(raw, &n); err == nil {
		return int(n), nil
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return strconv.Atoi(s)
	}
	return 0, fmt.Errorf("无法解析 id: %s", string(raw))
}

func isBenignBaotaDeleteErr(err error) bool {
	if err == nil {
		return true
	}
	if errors.Is(err, errBaotaSiteNotFound) {
		return true
	}
	s := err.Error()
	return strings.Contains(s, "不存在") ||
		strings.Contains(s, "未找到") ||
		strings.Contains(strings.ToLower(s), "not exist") ||
		strings.Contains(s, "没有这个")
}

// removeBaotaProxy 删除本站下由 kube-bt-sync 创建的反代；失败不阻塞删站点（面板版本参数不一）。
func removeBaotaProxy(cfg Config, domain string) {
	pname := ProxyNameForDomain(domain)
	_, err := CallBaotaAPI(cfg, "/site?action=RemoveProxy", map[string]string{
		"sitename":  domain,
		"proxyname": pname,
	})
	if err == nil || isBenignBaotaDeleteErr(err) {
		return
	}
	_, err2 := CallBaotaAPI(cfg, "/proxy?action=RemoveProxy", map[string]string{
		"sitename":  domain,
		"proxyname": pname,
	})
	if err2 == nil || isBenignBaotaDeleteErr(err2) {
		return
	}
	_, err3 := CallBaotaAPI(cfg, "/proxy?action=RemoveProxy", map[string]string{
		"proxysite": domain,
		"proxyname": pname,
	})
	if err3 == nil || isBenignBaotaDeleteErr(err3) {
		return
	}
	log.Printf("[%s] RemoveProxy 跳过（继续删站点）: %v; %v; %v", domain, err, err2, err3)
}

// DeleteBaotaSiteAndProxy 先删反代再按 id 删站点（与官方 API 一致）。
func DeleteBaotaSiteAndProxy(cfg Config, domain string) error {
	domain = strings.TrimSpace(domain)
	if domain == "" {
		return nil
	}
	removeBaotaProxy(cfg, domain)
	siteID, err := BaotaSiteIDByDomain(cfg, domain)
	if err != nil {
		if errors.Is(err, errBaotaSiteNotFound) || isBenignBaotaDeleteErr(err) {
			return nil
		}
		return err
	}
	_, err = CallBaotaAPI(cfg, "/site?action=DeleteSite", map[string]string{
		"id":      fmt.Sprintf("%d", siteID),
		"webname": domain,
	})
	return err
}

// ScheduleBaotaDeleteRetry 异步重试（无需 Redis；进程内最多尝试几次）。
func ScheduleBaotaDeleteRetry(cfg Config, domain string) {
	domain = strings.TrimSpace(domain)
	if domain == "" {
		return
	}
	go func() {
		backoffs := []time.Duration{3 * time.Second, 8 * time.Second, 20 * time.Second}
		for i, d := range backoffs {
			time.Sleep(d)
			if err := DeleteBaotaSiteAndProxy(cfg, domain); err == nil {
				log.Printf("宝塔删除重试成功 [%s] (第 %d 次)", domain, i+1)
				return
			} else {
				log.Printf("宝塔删除重试失败 [%s]: %v", domain, err)
			}
		}
		log.Printf("宝塔删除重试已放弃 [%s]", domain)
	}()
}

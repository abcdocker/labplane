package internal

import (
	"fmt"
	"net"
	"os"
	"strings"
	"sync"

	geoip2 "github.com/oschwald/geoip2-golang"
)

// effectiveGeoLiteCountryMMDB 返回 MaxMind GeoLite2-Country.mmdb 路径（运行时优先于环境变量）。
func effectiveGeoLiteCountryMMDB(rs *RuntimeSettings, cfg Config) string {
	if rs != nil && strings.TrimSpace(rs.GeoLite2CountryMMDB) != "" {
		return strings.TrimSpace(rs.GeoLite2CountryMMDB)
	}
	return strings.TrimSpace(cfg.GeoLite2CountryMMDB)
}

var (
	vmlogGeoMu     sync.Mutex
	vmlogGeoReader *geoip2.Reader
	vmlogGeoPath   string
)

func vmlogCloseGeoReaderLocked() {
	if vmlogGeoReader != nil {
		_ = vmlogGeoReader.Close()
		vmlogGeoReader = nil
	}
	vmlogGeoPath = ""
}

// vmlogEnsureGeoReader 按路径懒加载 MMDB；路径变更时关闭旧句柄。失败返回 nil。
func vmlogEnsureGeoReader(path string) *geoip2.Reader {
	path = strings.TrimSpace(path)
	vmlogGeoMu.Lock()
	defer vmlogGeoMu.Unlock()
	if path == "" {
		vmlogCloseGeoReaderLocked()
		return nil
	}
	if vmlogGeoPath == path && vmlogGeoReader != nil {
		return vmlogGeoReader
	}
	vmlogCloseGeoReaderLocked()
	st, err := os.Stat(path)
	if err != nil || st.IsDir() {
		return nil
	}
	r, err := geoip2.Open(path)
	if err != nil {
		return nil
	}
	vmlogGeoReader = r
	vmlogGeoPath = path
	return vmlogGeoReader
}

// vmlogGeoRegionForIP 返回用于 Nginx 统计展示的「地区」标签；mmdbPath 为空时仅用 RFC1918/公网等粗分。
func vmlogGeoRegionForIP(mmdbPath, ipStr string) string {
	ipStr = strings.TrimSpace(ipStr)
	ip := net.ParseIP(ipStr)
	if ip == nil {
		return "无效 IP"
	}
	if ip.IsLoopback() {
		return "本机回环"
	}
	if ip.IsPrivate() {
		return "内网 (RFC1918)"
	}
	if ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() {
		return "链路本地"
	}
	if ip.To4() == nil && len(ip) == net.IPv6len {
		if ip[0] == 0xfc || ip[0] == 0xfd {
			return "IPv6 ULA (内网)"
		}
	}

	path := strings.TrimSpace(mmdbPath)
	if path == "" {
		if ip.To4() != nil {
			return "公网 IPv4 (未配置 GeoIP)"
		}
		return "公网 IPv6 (未配置 GeoIP)"
	}
	r := vmlogEnsureGeoReader(path)
	if r == nil {
		if ip.To4() != nil {
			return "公网 IPv4 (GeoIP 库不可用)"
		}
		return "公网 IPv6 (GeoIP 库不可用)"
	}
	rec, err := r.Country(ip)
	if err != nil || rec.Country.IsoCode == "" {
		return "公网 (未知国家)"
	}
	iso := rec.Country.IsoCode
	name := rec.Country.Names["zh-CN"]
	if name == "" {
		name = rec.Country.Names["en"]
	}
	if name == "" {
		return iso
	}
	return fmt.Sprintf("%s (%s)", name, iso)
}

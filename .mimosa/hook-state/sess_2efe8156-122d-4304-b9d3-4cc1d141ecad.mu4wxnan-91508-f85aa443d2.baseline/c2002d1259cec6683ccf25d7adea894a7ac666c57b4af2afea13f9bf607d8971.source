package internal

import (
	"fmt"
	"net"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

// vmlogNginxAggResult 从 _msg / 行字段粗解析 Nginx 访问，供 ELK 式统计与图表（依赖 combined 或常见 JSON 字段）。
type vmlogNginxAggResult struct {
	TopClientIPs []gin.H `json:"topClientIPs"`
	TopPaths     []gin.H `json:"topPaths"`
	TopHosts     []gin.H `json:"topHosts"`
	TopRegions   []gin.H `json:"topRegions"`
	StatusCodes  []gin.H `json:"statusCodes"`
	Methods      []gin.H `json:"methods"`
	Totals       gin.H   `json:"totals"`
	GeoSource    string  `json:"geoSource"`
	ParsedLines  int     `json:"parsedLines"`
	ScannedLines int     `json:"scannedLines"`
}

var (
	reNginxCombined = regexp.MustCompile(`^(\S+)\s+\S+\s+\S+\s+\[[^\]]+\]\s+"([A-Z]+)\s+(\S+)\s+HTTP/[^"]+"\s+(\d{3})(?:\s+(\d+|-))?`)
	reNginxLoose    = regexp.MustCompile(`"(?:GET|POST|HEAD|PUT|DELETE|PATCH|OPTIONS)\s+(\S+)\s+HTTP/[^"]+"`)
	reNginxStatusLoose = regexp.MustCompile(`\s(\d{3})(?:\s|$)`)
	reIPv4Start     = regexp.MustCompile(`^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b`)
)

func topCounts(m map[string]int, n int) []gin.H {
	type kv struct {
		k string
		v int
	}
	var xs []kv
	for k, v := range m {
		if k == "" || v <= 0 {
			continue
		}
		xs = append(xs, kv{k: k, v: v})
	}
	sort.Slice(xs, func(i, j int) bool {
		if xs[i].v == xs[j].v {
			return xs[i].k < xs[j].k
		}
		return xs[i].v > xs[j].v
	})
	if n <= 0 {
		n = 12
	}
	if len(xs) > n {
		xs = xs[:n]
	}
	out := make([]gin.H, 0, len(xs))
	for _, e := range xs {
		out = append(out, gin.H{"name": e.k, "count": e.v})
	}
	return out
}

func nginxNormalizeHost(h string) string {
	h = strings.TrimSpace(strings.ToLower(h))
	if h == "" || h == "<nil>" {
		return ""
	}
	if strings.HasPrefix(h, "[") {
		if i := strings.Index(h, "]"); i > 0 {
			return h[1:i]
		}
	}
	if host, _, err := net.SplitHostPort(h); err == nil {
		return strings.ToLower(strings.TrimSpace(host))
	}
	if i := strings.LastIndex(h, ":"); i > 0 && !strings.Contains(h, "]") {
		return h[:i]
	}
	return h
}

func nginxHostFromRequestPath(path string) string {
	path = strings.TrimSpace(path)
	if path == "" {
		return ""
	}
	if strings.HasPrefix(path, "http://") || strings.HasPrefix(path, "https://") {
		u, err := url.Parse(path)
		if err != nil {
			return ""
		}
		h := strings.TrimSpace(u.Hostname())
		return nginxNormalizeHost(h)
	}
	return ""
}

func nginxHostFromRow(row map[string]any) string {
	if row == nil {
		return ""
	}
	keys := []string{
		"host", "http_host", "server_name", "request_host", "domain",
		"nginx.host", "http.request.host", "httpRequestHost",
	}
	for _, k := range keys {
		if v, ok := row[k]; ok {
			s := strings.TrimSpace(strings.ToLower(nginxFmtCell(v)))
			if s != "" && s != "<nil>" {
				return nginxNormalizeHost(s)
			}
		}
	}
	return ""
}

func nginxClientIPFromRow(row map[string]any) string {
	if row == nil {
		return ""
	}
	keys := []string{"remote_addr", "client_ip", "realip", "http.request.remote", "x_forwarded_for", "x-real-ip"}
	for _, k := range keys {
		if v, ok := row[k]; ok {
			s := strings.TrimSpace(nginxFmtCell(v))
			if s == "" || s == "<nil>" {
				continue
			}
			if k == "x_forwarded_for" || k == "x-real-ip" {
				if i := strings.IndexByte(s, ','); i > 0 {
					s = strings.TrimSpace(s[:i])
				}
			}
			if net.ParseIP(s) != nil {
				return s
			}
		}
	}
	return ""
}

func nginxFmtCell(v any) string {
	return strings.TrimSpace(strings.ReplaceAll(strings.TrimSpace(fmt.Sprintf("%v", v)), "\n", " "))
}

// vmlogAggregateNginxStyle 从已匹配行统计 IP、URI、Host、HTTP 状态、方法、地区（可选 MaxMind Country MMDB）。
func vmlogAggregateNginxStyle(matched []map[string]any, topN int, geoMMDBPath string) vmlogNginxAggResult {
	var res vmlogNginxAggResult
	ipC := map[string]int{}
	pathC := map[string]int{}
	hostC := map[string]int{}
	regionC := map[string]int{}
	statusC := map[string]int{}
	methodC := map[string]int{}
	uniqueIP := map[string]struct{}{}
	uniquePath := map[string]struct{}{}
	uniqueHost := map[string]struct{}{}
	uniqueRegion := map[string]struct{}{}
	var bytesSum int64
	var bytesLines int

	mmdbPath := strings.TrimSpace(geoMMDBPath)
	geoSource := "heuristic"
	if mmdbPath != "" {
		if vmlogEnsureGeoReader(mmdbPath) != nil {
			geoSource = "maxmind-country"
		} else {
			geoSource = "maxmind-unavailable"
		}
	}
	res.GeoSource = geoSource

	for _, row := range matched {
		msg := strings.TrimSpace(vmlogRowMsg(row))
		if msg == "" {
			continue
		}
		res.ScannedLines++
		first := strings.Split(msg, "\n")[0]
		first = strings.TrimSpace(first)
		rowHost := nginxHostFromRow(row)

		if sub := reNginxCombined.FindStringSubmatch(first); len(sub) >= 5 {
			res.ParsedLines++
			ip := strings.TrimSpace(sub[1])
			method := strings.TrimSpace(sub[2])
			path := strings.TrimSpace(sub[3])
			status := strings.TrimSpace(sub[4])
			if len(sub) >= 6 && sub[5] != "" && sub[5] != "-" {
				if n, err := strconv.ParseInt(strings.TrimSpace(sub[5]), 10, 64); err == nil && n >= 0 {
					bytesSum += n
					bytesLines++
				}
			}
			if method != "" {
				methodC[method]++
			}
			if status != "" {
				statusC[status]++
			}
			if ip != "" {
				ipC[ip]++
				uniqueIP[ip] = struct{}{}
				region := vmlogGeoRegionForIP(mmdbPath, ip)
				regionC[region]++
				uniqueRegion[region] = struct{}{}
			}
			host := nginxHostFromRequestPath(path)
			if host == "" {
				host = rowHost
			}
			if host != "" {
				hostC[host]++
				uniqueHost[host] = struct{}{}
			}
			if path != "" {
				if i := strings.IndexAny(path, "?#"); i > 0 {
					path = path[:i]
				}
				pathC[path]++
				uniquePath[path] = struct{}{}
			}
			continue
		}

		if m := reNginxLoose.FindStringSubmatch(first); len(m) >= 2 {
			res.ParsedLines++
			path := strings.TrimSpace(m[1])
			if path != "" {
				if i := strings.IndexAny(path, "?#"); i > 0 {
					path = path[:i]
				}
				pathC[path]++
				uniquePath[path] = struct{}{}
			}
			host := nginxHostFromRequestPath(path)
			if host == "" {
				host = rowHost
			}
			if host != "" {
				hostC[host]++
				uniqueHost[host] = struct{}{}
			}
			ip := ""
			if im := reIPv4Start.FindStringSubmatch(first); len(im) >= 2 {
				ip = im[1]
			}
			if ip == "" {
				ip = nginxClientIPFromRow(row)
			}
			if ip != "" {
				ipC[ip]++
				uniqueIP[ip] = struct{}{}
				region := vmlogGeoRegionForIP(mmdbPath, ip)
				regionC[region]++
				uniqueRegion[region] = struct{}{}
			}
			if sm := reNginxStatusLoose.FindAllStringSubmatch(first, -1); len(sm) > 0 {
				last := sm[len(sm)-1]
				if len(last) >= 2 {
					statusC[last[1]]++
				}
			}
			if i := strings.Index(strings.ToUpper(first), `"GET `); i >= 0 {
				methodC["GET"]++
			} else if i := strings.Index(strings.ToUpper(first), `"POST `); i >= 0 {
				methodC["POST"]++
			} else if i := strings.Index(strings.ToUpper(first), `"HEAD `); i >= 0 {
				methodC["HEAD"]++
			}
		}
	}

	res.TopClientIPs = topCounts(ipC, topN)
	res.TopPaths = topCounts(pathC, topN)
	res.TopHosts = topCounts(hostC, topN)
	res.TopRegions = topCounts(regionC, topN)
	res.StatusCodes = topCounts(statusC, topN)
	res.Methods = topCounts(methodC, topN)
	res.Totals = gin.H{
		"scannedLines":      res.ScannedLines,
		"parsedRequests":    res.ParsedLines,
		"uniqueClientIPs":   len(uniqueIP),
		"uniquePaths":       len(uniquePath),
		"uniqueHosts":       len(uniqueHost),
		"uniqueRegions":     len(uniqueRegion),
		"bytesSum":          bytesSum,
		"bytesLines":        bytesLines,
		"connectionSamples": res.ParsedLines,
	}
	return res
}

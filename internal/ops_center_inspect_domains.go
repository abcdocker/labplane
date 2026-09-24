package internal

import "strings"

func normalizeInspectionDomain(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "", "platform":
		return "platform"
	case "vcenter", "bastion", "headscale", "authentik":
		return strings.ToLower(strings.TrimSpace(raw))
	default:
		return ""
	}
}

func filterInspectReportsByDomain(reports []InspectionReport, domain string) []InspectionReport {
	domain = normalizeInspectionDomain(domain)
	if domain == "" {
		return nil
	}
	out := make([]InspectionReport, 0, len(reports))
	for _, report := range reports {
		reportDomain := normalizeInspectionDomain(report.Domain)
		if reportDomain == domain {
			out = append(out, report)
		}
	}
	return out
}

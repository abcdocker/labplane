package internal

import "regexp"

var logAIRedactionRules = []struct {
	re          *regexp.Regexp
	replacement string
}{
	{regexp.MustCompile(`(?is)-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----.*?-----END [A-Z0-9 ]*PRIVATE KEY-----`), "[REDACTED_PRIVATE_KEY]"},
	{regexp.MustCompile(`(?i)(authorization\s*[:=]\s*(?:bearer|basic)\s+)[^\s,;]+`), `${1}[REDACTED]`},
	{regexp.MustCompile(`(?i)((?:password|passwd|pwd|token|api[_-]?key|secret|client[_-]?secret|cookie|set-cookie)\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;&]+)`), `${1}[REDACTED]`},
	{regexp.MustCompile(`(?i)([a-z][a-z0-9+.-]*://[^:/@\s]+:)[^@\s]+(@)`), `${1}[REDACTED]${2}`},
	{regexp.MustCompile(`\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b`), "[REDACTED_JWT]"},
}

var sensitiveLogFieldNameRE = regexp.MustCompile(`(?i)(password|passwd|pwd|token|api.?key|secret|authorization|cookie|private.?key)`)

func redactLogTextForAI(value string) string {
	for _, rule := range logAIRedactionRules {
		value = rule.re.ReplaceAllString(value, rule.replacement)
	}
	return value
}

func sensitiveLogFieldName(name string) bool {
	return sensitiveLogFieldNameRE.MatchString(name)
}

package internal

import (
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLabPlaneBrandHasNoLegacyIdentifiers(t *testing.T) {
	repoRoot := filepath.Clean("..")
	legacy := []string{
		"home" + "lab-console",
		"home" + "lab console",
		"kube" + "-bt",
		"kube" + "bt_",
		"kb" + "ts",
		"homelab" + "_console",
	}
	extensions := map[string]bool{
		".css": true, ".env": true, ".go": true, ".html": true,
		".js": true, ".json": true, ".md": true, ".mjs": true,
		".sh": true, ".svg": true, ".toml": true, ".ts": true,
		".tsx": true, ".yaml": true, ".yml": true,
	}

	err := filepath.WalkDir(repoRoot, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		rel, err := filepath.Rel(repoRoot, path)
		if err != nil {
			return err
		}
		if entry.IsDir() {
			if entry.Name() == ".mimosa" || entry.Name() == ".playwright-mcp" || entry.Name() == "node_modules" || entry.Name() == "dist" {
				return filepath.SkipDir
			}
			for _, ignored := range []string{
				".git",
				filepath.Join("docs", "superpowers"),
			} {
				if rel == ignored || strings.HasPrefix(rel, ignored+string(filepath.Separator)) {
					return filepath.SkipDir
				}
			}
			return nil
		}
		if !extensions[strings.ToLower(filepath.Ext(path))] {
			return nil
		}
		content, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		contentText := strings.ToLower(string(content))
		for _, marker := range legacy {
			if strings.Contains(contentText, marker) {
				// The pre-rename environment-variable prefix remains a deliberately
				// supported alias. Keep that compatibility narrowly scoped to the
				// implementation, its behavior test, and its documentation.
				if marker == "kube"+"bt_" && isLegacyRegistryCompatibilityFile(rel) {
					continue
				}
				t.Errorf("legacy brand marker %q remains in %s", marker, rel)
			}
		}
		return nil
	})
	if err != nil {
		t.Fatalf("scan repository branding: %v", err)
	}
}

func isLegacyRegistryCompatibilityFile(path string) bool {
	switch filepath.ToSlash(path) {
	case "README.md", "run.sh", "scripts/run-sh-test.sh":
		return true
	default:
		return false
	}
}

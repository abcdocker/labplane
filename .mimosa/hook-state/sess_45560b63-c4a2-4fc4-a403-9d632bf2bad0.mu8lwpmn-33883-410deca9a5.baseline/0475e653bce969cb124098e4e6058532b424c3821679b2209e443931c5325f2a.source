package internal

import (
	"bytes"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/extension"
)

func renderDocMarkdownToHTML(md string) (string, error) {
	src := []byte(md)
	gm := goldmark.New(
		goldmark.WithExtensions(extension.GFM),
	)
	var buf bytes.Buffer
	if err := gm.Convert(src, &buf); err != nil {
		return "", err
	}
	return buf.String(), nil
}

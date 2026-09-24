package mesh_joingoing

import (
	"archive/zip"
	"bytes"
	"strings"
	"testing"
)

func TestBuildMacZip(t *testing.T) {
	data, err := BuildMacZip(ToolConfig{
		Server:    "https://headscale.example.com",
		AuthKey:   "nh10a-abc123",
		Hostname:  "macbook-pro",
		ReportURL: "https://labplane.example.com/api/ops/mesh/instances/x/join-report",
	})
	if err != nil {
		t.Fatalf("BuildMacZip: %v", err)
	}

	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatalf("zip 读取失败: %v", err)
	}

	var cmdFile *zip.File
	var hasReadme bool
	for _, f := range zr.File {
		if f.Name == "加入节点.command" {
			cmdFile = f
		}
		if f.Name == "使用说明.txt" {
			hasReadme = true
		}
	}
	if cmdFile == nil {
		t.Fatal("缺少 加入节点.command")
	}
	if !hasReadme {
		t.Fatal("缺少 使用说明.txt")
	}
	if cmdFile.Mode()&0o111 == 0 {
		t.Fatalf(".command 缺少可执行位: %v", cmdFile.Mode())
	}

	raw, err := readZipFile(cmdFile)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{
		"#!/bin/bash",
		"https://headscale.example.com",
		"nh10a-abc123",
		"--login-server=",
		"--authkey=",
	} {
		if !strings.Contains(raw, want) {
			t.Errorf("脚本缺少 %q", want)
		}
	}
}

func TestBuildMacZipRejectsSingleQuote(t *testing.T) {
	if _, err := BuildMacZip(ToolConfig{Server: "https://x'; touch /tmp/p", AuthKey: "k"}); err == nil {
		t.Fatal("含单引号的 server 应被拒绝")
	}
	if _, err := BuildMacZip(ToolConfig{Server: "https://ok.example.com", AuthKey: "k'}"}); err == nil {
		t.Fatal("含单引号的 authkey 应被拒绝")
	}
}

func readZipFile(f *zip.File) (string, error) {
	rc, err := f.Open()
	if err != nil {
		return "", err
	}
	defer rc.Close()
	var buf bytes.Buffer
	if _, err := buf.ReadFrom(rc); err != nil {
		return "", err
	}
	return buf.String(), nil
}

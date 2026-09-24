//go:build windows

// tsjoin-gui — Windows Tailscale 加入/重连桌面程序。
// 读取同目录 tsjoin.json 配置文件（由 labplane 平台生成），
// 启动内嵌的 PowerShell WinForms GUI 脚本。
package main

import (
	_ "embed"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"

	"github.com/lxn/win"
)

//go:embed payload.ps1
var payloadScript string

func main() {
	exePath, err := os.Executable()
	if err != nil {
		msgBox("错误", "无法定位程序: "+err.Error())
		return
	}
	exeDir := filepath.Dir(exePath)
	cfgPath := filepath.Join(exeDir, "tsjoin.json")

	if _, err := os.Stat(cfgPath); err != nil {
		msgBox("提示", "未找到 tsjoin.json 配置文件。\n请确认 tsjoin.exe 与 tsjoin.json 在同一目录。")
		return
	}

	psPath := filepath.Join(os.TempDir(), "tsjoin-gui.ps1")
	psContent := strings.ReplaceAll(payloadScript, "__CFGDIR__", filepath.ToSlash(exeDir))
	os.WriteFile(psPath, []byte(psContent), 0644)

	win.ShellExecute(0, syscall.StringToUTF16Ptr("open"),
		syscall.StringToUTF16Ptr("powershell.exe"),
		syscall.StringToUTF16Ptr("-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \""+psPath+"\""),
		syscall.StringToUTF16Ptr(tmpDir()), win.SW_HIDE)
}

func msgBox(title, text string) {
	user32 := syscall.NewLazyDLL("user32.dll")
	mb := user32.NewProc("MessageBoxW")
	titlePtr, _ := syscall.UTF16PtrFromString(title)
	textPtr, _ := syscall.UTF16PtrFromString(text)
	mb.Call(0, uintptr(unsafe.Pointer(textPtr)), uintptr(unsafe.Pointer(titlePtr)), 0)
}

func tmpDir() string { return os.TempDir() }

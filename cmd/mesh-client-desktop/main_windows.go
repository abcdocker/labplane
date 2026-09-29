//go:build windows

package main

import (
	"context"
	_ "embed"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"unsafe"

	"github.com/abcdocker/labplane/internal/meshclient"
	"github.com/abcdocker/labplane/internal/meshdesktop"
)

const (
	wsVisible          = 0x10000000
	wsChild            = 0x40000000
	wsOverlappedWindow = 0x00CF0000
	wsTabstop          = 0x00010000
	wmCreate           = 0x0001
	wmDestroy          = 0x0002
	wmCommand          = 0x0111
	wmAppResult        = 0x8001
	buttonImport       = 101
	buttonInstall      = 102
	buttonConnect      = 103
	buttonDisconnect   = 104
	buttonRefresh      = 105
	buttonStart        = 106
	buttonPlatform     = 107
	buttonExit         = 108
	menuScan           = 201
	menuImport         = 202
	menuStart          = 203
	menuPlatform       = 204
	menuExit           = 205
	menuInstall        = 206
	menuConnect        = 207
	menuDisconnect     = 208
)

//go:embed AppIcon.png
var iconPNG []byte

var (
	user32         = syscall.NewLazyDLL("user32.dll")
	kernel32       = syscall.NewLazyDLL("kernel32.dll")
	comdlg32       = syscall.NewLazyDLL("comdlg32.dll")
	shell32        = syscall.NewLazyDLL("shell32.dll")
	createWindowEx = user32.NewProc("CreateWindowExW")
	defWindowProc  = user32.NewProc("DefWindowProcW")
	setWindowText  = user32.NewProc("SetWindowTextW")
	postMessage    = user32.NewProc("PostMessageW")
	mainWindow     uintptr
	statusLabel    uintptr
	detailsLabel   uintptr
	configLabel    uintptr
	messageLabel   uintptr
	installButton  uintptr
	connectButton  uintptr
	startButton    uintptr
	configPath     string
	manualConfig   bool
	platformURL    string
	installed      bool
	complete       bool
	resultMu       sync.Mutex
	messageText    string
	statusText     string
	detailText     string
	detectedPath   string
	detectedURL    string
	detectedName   string
	detected       bool
	detectedDone   bool
)

type wndClassEx struct {
	Size       uint32
	Style      uint32
	WndProc    uintptr
	ClsExtra   int32
	WndExtra   int32
	Instance   uintptr
	Icon       uintptr
	Cursor     uintptr
	Background uintptr
	MenuName   *uint16
	ClassName  *uint16
	IconSmall  uintptr
}

type point struct{ X, Y int32 }
type message struct {
	Window  uintptr
	ID      uint32
	_       uint32
	WParam  uintptr
	LParam  uintptr
	Time    uint32
	Pt      point
	Private uint32
}

type openFileName struct {
	Size            uint32
	Owner           uintptr
	Instance        uintptr
	Filter          *uint16
	CustomFilter    *uint16
	MaxCustomFilter uint32
	FilterIndex     uint32
	File            *uint16
	MaxFile         uint32
	FileTitle       *uint16
	MaxFileTitle    uint32
	InitialDir      *uint16
	Title           *uint16
	Flags           uint32
	FileOffset      uint16
	FileExtension   uint16
	DefExt          *uint16
	CustData        uintptr
	Hook            uintptr
	TemplateName    *uint16
	Reserved        uintptr
	ReservedFlags   uint32
	FlagsEx         uint32
}

type shellExecuteInfo struct {
	Size       uint32
	Mask       uint32
	Window     uintptr
	Verb       *uint16
	File       *uint16
	Parameters *uint16
	Directory  *uint16
	Show       int32
	_          uint32
	Instance   uintptr
	IDList     uintptr
	Class      *uint16
	KeyClass   uintptr
	HotKey     uint32
	_          uint32
	Icon       uintptr
	Process    uintptr
}

func utf16(value string) *uint16 { p, _ := syscall.UTF16PtrFromString(value); return p }

func control(class, label string, x, y, width, height int32, id int) uintptr {
	h, _, _ := createWindowEx.Call(0, uintptr(unsafe.Pointer(utf16(class))), uintptr(unsafe.Pointer(utf16(label))),
		wsChild|wsVisible|wsTabstop, uintptr(x), uintptr(y), uintptr(width), uintptr(height), mainWindow, uintptr(id), 0, 0)
	return h
}

func text(handle uintptr, value string) {
	setWindowText.Call(handle, uintptr(unsafe.Pointer(utf16(value))))
}

func notify(value string) {
	resultMu.Lock()
	messageText = value
	resultMu.Unlock()
	postMessage.Call(mainWindow, wmAppResult, 0, 0)
}

func chooseConfig() {
	buffer := make([]uint16, 1024)
	filter := syscall.StringToUTF16("LabPlane 配置 (*.json)\x00*.json\x00所有文件\x00*.*\x00")
	of := openFileName{Owner: mainWindow, Filter: &filter[0], File: &buffer[0], MaxFile: uint32(len(buffer)),
		Title: utf16("选择平台下载的连接配置"), Flags: 0x00001000 | 0x00000800}
	of.Size = uint32(unsafe.Sizeof(of))
	ret, _, _ := comdlg32.NewProc("GetOpenFileNameW").Call(uintptr(unsafe.Pointer(&of)))
	if ret == 0 {
		return
	}
	path := syscall.UTF16ToString(buffer)
	if _, err := meshclient.LoadConfig(path); err != nil {
		text(messageLabel, "连接配置无效，请在平台重新生成。")
		return
	}
	configPath = path
	manualConfig = true
	if cfg, err := meshclient.LoadConfig(path); err == nil {
		platformURL = cfg.Platform
	}
	text(configLabel, "已导入："+filepath.Base(path))
	text(messageLabel, "点击“安装并连接”以完成设备加入。")
}

func runElevated(agent, directory, command string) error {
	info := shellExecuteInfo{Mask: 0x00000040, Window: mainWindow, Verb: utf16("runas"), File: utf16(agent),
		Parameters: utf16(command), Directory: utf16(directory), Show: 1}
	info.Size = uint32(unsafe.Sizeof(info))
	ret, _, err := shell32.NewProc("ShellExecuteExW").Call(uintptr(unsafe.Pointer(&info)))
	if ret == 0 {
		return fmt.Errorf("管理员授权被取消或启动失败: %w", err)
	}
	defer kernel32.NewProc("CloseHandle").Call(info.Process)
	kernel32.NewProc("WaitForSingleObject").Call(info.Process, 0xffffffff)
	var exitCode uint32
	kernel32.NewProc("GetExitCodeProcess").Call(info.Process, uintptr(unsafe.Pointer(&exitCode)))
	if exitCode != 0 {
		return fmt.Errorf("安装程序退出码 %d", exitCode)
	}
	return nil
}

func install() {
	if complete {
		text(messageLabel, "安装已完成，可直接连接或启动服务。")
		return
	}
	if !installed && configPath == "" {
		text(messageLabel, "请先导入连接配置。")
		return
	}
	selected := configPath
	repairing := installed && !manualConfig
	text(messageLabel, "正在安装，系统将请求管理员授权…")
	go func() {
		var cfg meshclient.Config
		var err error
		if !repairing {
			cfg, err = meshclient.LoadConfig(selected)
			if err != nil {
				notify("连接配置无效，请重新导入。")
				return
			}
		}
		self, err := os.Executable()
		if err != nil {
			notify("无法定位桌面应用。")
			return
		}
		dir, err := os.MkdirTemp("", "LabPlaneMesh-*")
		if err != nil {
			notify("无法创建临时安装目录。")
			return
		}
		defer os.RemoveAll(dir)
		if err := meshdesktop.ExtractWindowsPayload(self, dir); err != nil {
			notify("客户端安装资源损坏。")
			return
		}
		if !repairing {
			if err := meshclient.SaveConfig(filepath.Join(dir, "config.json"), cfg); err != nil {
				notify("无法准备连接配置。")
				return
			}
		}
		if err := runElevated(filepath.Join(dir, "labplane-mesh-client.exe"), dir, "install"); err != nil {
			notify(err.Error())
			return
		}
		notify("安装完成，正在刷新连接状态。")
		refresh()
	}()
}

func agentInstalled() string {
	return filepath.Join(os.Getenv("ProgramData"), "LabPlaneMesh", "labplane-mesh-client.exe")
}

func startService() {
	if !installed {
		text(messageLabel, "尚未安装 LabPlane 客户端。")
		return
	}
	text(messageLabel, "正在启动上报服务…")
	go func() {
		if err := runElevated(agentInstalled(), filepath.Dir(agentInstalled()), "start"); err != nil {
			notify("启动失败，请确认管理员授权。")
		} else {
			notify("上报服务已启动。")
		}
		refresh()
	}()
}

func openPlatform() {
	if platformURL == "" {
		text(messageLabel, "安装或导入配置后才能打开平台。")
		return
	}
	shell32.NewProc("ShellExecuteW").Call(mainWindow, uintptr(unsafe.Pointer(utf16("open"))),
		uintptr(unsafe.Pointer(utf16(platformURL))), 0, 0, 1)
}

func action(name string) {
	if !installed {
		text(messageLabel, "尚未安装 LabPlane 客户端。")
		return
	}
	text(messageLabel, "正在执行"+name+"…")
	go func() {
		var err error
		if name == "连接" {
			out, runErr := exec.Command(agentInstalled(), "connect").CombinedOutput()
			_ = out // Command output may contain environment details; keep it local.
			err = runErr
		} else {
			err = meshclient.Disconnect(context.Background())
		}
		if err != nil {
			notify(name + "失败，请检查 Tailscale 状态。")
		} else {
			notify(name + "命令已执行。")
		}
		refresh()
	}()
}

func refresh() {
	go func() {
		status := meshclient.ReadStatus(context.Background())
		home, _ := os.UserHomeDir()
		candidates := meshclient.ScanEnrollment(home)
		_, transportErr := meshclient.FindTailscale()
		transport := transportErr == nil
		serviceOutput, serviceErr := exec.Command("sc.exe", "query", "LabPlaneMesh").CombinedOutput()
		serviceInstalled := serviceErr == nil
		service := serviceErr == nil && strings.Contains(string(serviceOutput), "RUNNING")
		marker := meshclient.ReadDesktopMarker()
		hasClient := serviceInstalled || marker.Present
		finished := marker.Complete && serviceInstalled && transport
		foundPath, foundURL, foundName := "", "", ""
		if marker.Present {
			foundURL, foundName = marker.Platform, marker.Hostname
		} else if len(candidates) > 0 {
			foundPath, foundURL, foundName = candidates[0].Path, candidates[0].Platform, candidates[0].Hostname
		}
		name := status.Hostname
		if name == "" {
			name = "本机"
		}
		state := "未连接 · " + status.BackendState
		if status.Online {
			state = "已连接 · " + name
		}
		ips := strings.Join(status.TailscaleIPs, ", ")
		if ips == "" {
			ips = "—"
		}
		presence := func(v bool) string {
			if v {
				return "已安装"
			}
			return "未安装"
		}
		running := "未运行"
		if service {
			running = "运行中"
		}
		detail := fmt.Sprintf("客户端：%s · 上报服务：%s · Tailscale：%s\r\nTail IP：%s · 节点 ID：%s\r\nTailscale 版本：%s",
			presence(hasClient), running, presence(transport), ips, status.NodeID, status.ClientVersion)
		resultMu.Lock()
		statusText = state
		detailText = detail
		detectedPath, detectedURL, detectedName, detected, detectedDone = foundPath, foundURL, foundName, hasClient, finished
		resultMu.Unlock()
		postMessage.Call(mainWindow, wmAppResult, 1, 0)
	}()
}

func windowProc(hwnd uintptr, msg uint32, wparam, lparam uintptr) uintptr {
	switch msg {
	case wmCreate:
		mainWindow = hwnd
		control("STATIC", "LabPlane Mesh · 异地组网客户端", 80, 23, 440, 34, 0)
		statusLabel = control("STATIC", "正在扫描本机状态…", 24, 77, 535, 28, 0)
		detailsLabel = control("STATIC", "", 24, 110, 535, 82, 0)
		configLabel = control("STATIC", "正在查找连接配置…", 24, 200, 535, 28, 0)
		control("BUTTON", "导入配置…", 24, 244, 110, 32, buttonImport)
		installButton = control("BUTTON", "安装并连接", 142, 244, 120, 32, buttonInstall)
		startButton = control("BUTTON", "启动服务", 270, 244, 100, 32, buttonStart)
		control("BUTTON", "打开平台", 378, 244, 100, 32, buttonPlatform)
		connectButton = control("BUTTON", "连接", 24, 290, 85, 32, buttonConnect)
		user32.NewProc("EnableWindow").Call(installButton, 0)
		user32.NewProc("EnableWindow").Call(connectButton, 0)
		user32.NewProc("EnableWindow").Call(startButton, 0)
		control("BUTTON", "断开", 117, 290, 85, 32, buttonDisconnect)
		control("BUTTON", "刷新", 210, 290, 85, 32, buttonRefresh)
		control("BUTTON", "退出", 303, 290, 85, 32, buttonExit)
		messageLabel = control("STATIC", "正在检测本机客户端和配置。", 24, 344, 535, 45, 0)
		refresh()
		return 0
	case wmCommand:
		switch uint16(wparam & 0xffff) {
		case buttonImport:
			chooseConfig()
		case buttonInstall, menuInstall:
			install()
		case buttonConnect, menuConnect:
			action("连接")
		case buttonDisconnect, menuDisconnect:
			action("断开")
		case buttonRefresh:
			refresh()
		case buttonStart, menuStart:
			startService()
		case buttonPlatform, menuPlatform:
			openPlatform()
		case buttonExit, menuExit:
			user32.NewProc("DestroyWindow").Call(mainWindow)
		case menuScan:
			refresh()
		case menuImport:
			chooseConfig()
		}
		return 0
	case wmAppResult:
		resultMu.Lock()
		message := messageText
		status := statusText
		detail := detailText
		foundPath, foundURL, foundName, hasClient, finished := detectedPath, detectedURL, detectedName, detected, detectedDone
		resultMu.Unlock()
		if wparam == 1 {
			text(statusLabel, status)
			text(detailsLabel, detail)
			installed = hasClient
			complete = finished
			if foundURL != "" && !manualConfig {
				platformURL = foundURL
			}
			user32.NewProc("EnableWindow").Call(installButton, boolToUintptr(!complete))
			if installed && !complete {
				text(installButton, "继续安装")
			} else {
				text(installButton, "安装并连接")
			}
			user32.NewProc("EnableWindow").Call(connectButton, boolToUintptr(installed))
			user32.NewProc("EnableWindow").Call(startButton, boolToUintptr(installed))
			if installed {
				prefix := "已安装节点："
				if !complete {
					prefix = "检测到未完成的安装："
				}
				text(configLabel, prefix+foundName)
			} else if configPath == "" && foundPath != "" {
				configPath = foundPath
				text(configLabel, "已自动发现："+filepath.Base(foundPath))
			} else if configPath == "" {
				text(configLabel, "未发现连接配置，可点击“导入配置”手动选择。")
			}
		} else {
			text(messageLabel, message)
		}
		return 0
	case wmDestroy:
		user32.NewProc("PostQuitMessage").Call(0)
		return 0
	}
	ret, _, _ := defWindowProc.Call(hwnd, uintptr(msg), wparam, lparam)
	return ret
}

func boolToUintptr(v bool) uintptr {
	if v {
		return 1
	}
	return 0
}

func main() {
	instance, _, _ := kernel32.NewProc("GetModuleHandleW").Call(0)
	className := utf16("LabPlaneMeshWindow")
	class := wndClassEx{Style: 3, WndProc: syscall.NewCallback(windowProc), Instance: instance,
		Cursor:     func() uintptr { v, _, _ := user32.NewProc("LoadCursorW").Call(0, 32512); return v }(),
		Background: 6, ClassName: className}
	if len(iconPNG) > 0 {
		icon, _, _ := user32.NewProc("CreateIconFromResourceEx").Call(uintptr(unsafe.Pointer(&iconPNG[0])), uintptr(len(iconPNG)), 1, 0x30000, 64, 64, 0)
		class.Icon, class.IconSmall = icon, icon
	}
	class.Size = uint32(unsafe.Sizeof(class))
	ret, _, _ := user32.NewProc("RegisterClassExW").Call(uintptr(unsafe.Pointer(&class)))
	if ret == 0 {
		return
	}
	mainWindow, _, _ = createWindowEx.Call(0, uintptr(unsafe.Pointer(className)), uintptr(unsafe.Pointer(utf16("LabPlane Mesh"))),
		wsOverlappedWindow|wsVisible, 200, 150, 590, 455, 0, 0, instance, 0)
	if mainWindow == 0 {
		return
	}
	menu, _, _ := user32.NewProc("CreateMenu").Call()
	for _, group := range []struct {
		title string
		items []struct {
			id    uintptr
			title string
		}
	}{
		{"文件", []struct {
			id    uintptr
			title string
		}{{menuScan, "扫描本机"}, {menuImport, "导入配置…"}, {menuInstall, "安装并连接"}, {menuExit, "退出"}}},
		{"连接", []struct {
			id    uintptr
			title string
		}{{menuStart, "启动服务"}, {menuConnect, "连接"}, {menuDisconnect, "断开"}}},
		{"平台", []struct {
			id    uintptr
			title string
		}{{menuPlatform, "打开平台"}}},
	} {
		popup, _, _ := user32.NewProc("CreatePopupMenu").Call()
		for _, item := range group.items {
			user32.NewProc("AppendMenuW").Call(popup, 0, item.id, uintptr(unsafe.Pointer(utf16(item.title))))
		}
		user32.NewProc("AppendMenuW").Call(menu, 0x10, popup, uintptr(unsafe.Pointer(utf16(group.title))))
	}
	user32.NewProc("SetMenu").Call(mainWindow, menu)
	user32.NewProc("ShowWindow").Call(mainWindow, 1)
	user32.NewProc("UpdateWindow").Call(mainWindow)
	var msg message
	for {
		ok, _, _ := user32.NewProc("GetMessageW").Call(uintptr(unsafe.Pointer(&msg)), 0, 0, 0)
		if int32(ok) <= 0 {
			break
		}
		user32.NewProc("TranslateMessage").Call(uintptr(unsafe.Pointer(&msg)))
		user32.NewProc("DispatchMessageW").Call(uintptr(unsafe.Pointer(&msg)))
	}
}

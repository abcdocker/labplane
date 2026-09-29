# LabPlane 异地组网客户端

Windows 交付图形化 `LabPlaneMesh.exe`，macOS 交付含 `LabPlaneMesh.app` 的 `LabPlaneMesh.dmg`。应用提供图标、头部操作菜单，可安装并加入 Headscale、查看本机状态、启动服务、连接、断开、打开平台和退出。它们内置本机代理和固定版本的 Tailscale 组件，不依赖旧版加入脚本。Linux 仍交付含本机代理与 Tailscale 组件的 ZIP，安装后作为 systemd 服务运行。

## 管理员发放

在「异地组网 → 客户端管控」选择实例、用户、系统架构和设备名。Windows/macOS 分别下载一次可复用的应用，以及为该设备单独签发的 JSON 配置。应用启动后只扫描当前用户的「下载」和「桌面」目录中符合 `labplane-mesh-*.json` 的有效配置，自动选取最近的一份；也可手动导入。点击「安装并连接」完成首次加入。应用分别检测本机客户端、上报服务和 Tailscale 的安装与运行状态；完整安装后禁用重复安装，已有 Tailscale 时跳过组件安装。如果首次安装在 VPN 授权或服务启动阶段中断，按钮会显示「继续安装」，并从已保存配置恢复。Linux 下载包含设备配置的 ZIP，使用 `sudo ./labplane-mesh-client install` 安装。

每次发放会创建有效期 24 小时、不可复用的 Headscale 加入密钥，以及独立的设备上报凭据。JSON 和 Linux ZIP 包含秘密，必须私密交付并在安装后删除。如果平台连接 Headscale API 使用内网地址，请在实例编辑表单填写「客户端控制面公网地址」。macOS 首次使用 VPN 时仍需在系统设置完成授权。

客户端读取本机 `tailscale status --json`，上报节点 ID、Tail IP、候选网络地址、版本、连接状态与心跳时间；平台可下发连接、断开、重命名操作。客户端自报状态不代表 Headscale 已准入。撤销上报凭据仅阻止后续心跳和远程操作；要阻止 VPN 接入，须将 Headscale 节点过期或删除。

## 构建桌面安装包

在 macOS 构建机运行：

```bash
go run ./cmd/mesh-client-bundle -out data/mesh-client-dist
go run ./cmd/mesh-desktop-bundle -out data/mesh-client-dist -platform all
mkdir -p client/desktop/release/macos-{amd64,arm64}
cp data/mesh-client-dist/macos-amd64/LabPlaneMesh.dmg client/desktop/release/macos-amd64/
cp data/mesh-client-dist/macos-arm64/LabPlaneMesh.dmg client/desktop/release/macos-arm64/
```

第一条命令从 Tailscale 官方稳定包站下载固定版本组件及其 `.sha256`，校验后构建代理。第二条生成 Windows x64/ARM64 的单文件 GUI EXE 和 macOS Intel/Apple Silicon 的 DMG。DMG 构建依赖 macOS 的 `clang`、`codesign` 和 `hdiutil`，当前为临时签名。正式对外发布时应使用组织的开发者证书签名并完成 notarization；Windows 也应使用组织的代码签名证书。仓库不包含签名私钥。

Docker 构建默认生成 Linux ZIP 和 Windows EXE。macOS DMG 必须先在 Mac 构建，并按上例放入 `client/desktop/release/`，Docker 构建会一同打包。此目录下的 DMG 是本机生成产物，Git 忽略它们；全新 CI 检出若未注入 DMG，macOS 下载接口会返回资源不可用。`BUILD_MESH_CLIENT_BUNDLES=0` 会跳过所有安装包。运行时也可用 `LABPLANE_MESH_CLIENT_DIST_DIR` 指向预构建产物目录。

## 本机服务

Windows 安装后运行 `LabPlaneMesh` Windows Service；macOS 安装后为当前用户配置 `cn.labplane.mesh-client` LaunchAgent；Linux 使用 `labplane-mesh-client.service` 和 `labplane-tailscaled.service`。完成加入后，客户端删除本地一次性密钥，保留上报凭据用于每分钟心跳和领取操作。macOS 的 LaunchAgent 随用户登录运行，退出登录后不会保持连接。

Windows EXE 的资源管理器图标由 `client/desktop/assets/AppIcon.ico` 和 `cmd/mesh-client-desktop/rsrc_windows_*.syso` 提供。修改源 SVG 后，需要重新生成 PNG/ICO 与两种架构的 COFF 资源，再运行桌面打包器。

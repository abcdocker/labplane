package internal

// AI 助手「身份源」工具集：GLM function calling 动态创建用户的双模实现。
//   - headscale 模式：创建异地组网用户（POST /api/v1/user）+ 签发预授权密钥
//   - authentik 模式：创建 SSO 用户（含初始密码、按组名加入分组）
// 均为 Write 工具：只读模式拒绝、运维模式需前端二次确认、执行后写审计
// （审计明细中的密码/密钥经 aiAssistantMaskAuditSecrets 掩码）。

import (
	"context"
	"crypto/rand"
	"fmt"
	"math/big"
	"regexp"
	"strings"
	"time"
)

// boolArg 解析模型传入的布尔参数（JSON 反序列化后为 float64）。
func boolArg(a map[string]any, key string, def bool) bool {
	switch v := a[key].(type) {
	case bool:
		return v
	case float64:
		return v != 0
	case string:
		return strings.EqualFold(strings.TrimSpace(v), "true")
	}
	return def
}

func boolSchema(desc string) map[string]any {
	return map[string]any{"type": "boolean", "description": desc}
}

// aiUserToolPassword 生成初始密码：16 位，含大小写/数字/安全符号（避开易混淆与 shell 元字符）。
func aiUserToolPassword() string {
	const charset = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@%^_-"
	out := make([]byte, 16)
	max := big.NewInt(int64(len(charset)))
	for i := range out {
		n, err := rand.Int(rand.Reader, max)
		if err != nil {
			return fmt.Sprintf("Pw%d%05d", time.Now().UnixNano()%1_000_000, time.Now().Unix()%100000)
		}
		out[i] = charset[n.Int64()]
	}
	return string(out)
}

// aiToolResolveMeshInstance 解析 headscale 实例：ref 可为 id 或名称（忽略大小写）；
// 留空时仅有一个启用实例则自动选中，多个则报错并列出可选值，避免误写控制面。
func aiToolResolveMeshInstance(app *ServerApp, ref string) (*headscaleClient, MeshInstance, error) {
	b := loadMeshSettings(app.PlatformKV())
	enabled := make([]MeshInstance, 0, len(b.Instances))
	for _, in := range b.Instances {
		if in.Enabled && strings.TrimSpace(in.APIKeyEnc) != "" {
			enabled = append(enabled, in)
		}
	}
	if len(enabled) == 0 {
		return nil, MeshInstance{}, fmt.Errorf("没有已启用且配置了 API Key 的 headscale 实例，请先在「异地组网」中配置")
	}
	ref = strings.TrimSpace(ref)
	if ref == "" {
		if len(enabled) > 1 {
			return nil, MeshInstance{}, fmt.Errorf("存在 %d 个 headscale 实例，请先确认操作哪一个：%s",
				len(enabled), meshInstanceOptions(enabled))
		}
		ref = enabled[0].ID
	}
	for _, in := range enabled {
		if in.ID == ref || strings.EqualFold(in.Name, ref) {
			key, err := meshEncryptionKey(app.Cfg())
			if err != nil {
				return nil, in, err
			}
			apiKey, _ := decryptSecret(key, in.APIKeyEnc)
			cli, err := newHeadscaleClient(in.APIURL, apiKey, 15*time.Second)
			if err != nil {
				return nil, in, err
			}
			return cli, in, nil
		}
	}
	return nil, MeshInstance{}, fmt.Errorf("headscale 实例 %q 不存在或未启用，可选：%s", ref, meshInstanceOptions(enabled))
}

func meshInstanceOptions(instances []MeshInstance) string {
	parts := make([]string, 0, len(instances))
	for _, in := range instances {
		parts = append(parts, fmt.Sprintf("%s(%s)", in.Name, in.ID))
	}
	return strings.Join(parts, "、")
}

// aiToolResolveAuthentikInstance 解析 Authentik 实例，规则同 aiToolResolveMeshInstance。
func aiToolResolveAuthentikInstance(app *ServerApp, ref string) (*authentikClient, AuthentikInstance, error) {
	b := loadAuthentikSettings(app.PlatformKV())
	enabled := make([]AuthentikInstance, 0, len(b.Instances))
	for _, in := range b.Instances {
		if in.Enabled && strings.TrimSpace(in.TokenEnc) != "" {
			enabled = append(enabled, in)
		}
	}
	if len(enabled) == 0 {
		return nil, AuthentikInstance{}, fmt.Errorf("没有已启用且配置了 Token 的 Authentik 实例，请先在「SSO 单点登录」中配置")
	}
	ref = strings.TrimSpace(ref)
	if ref == "" {
		if len(enabled) > 1 {
			return nil, AuthentikInstance{}, fmt.Errorf("存在 %d 个 Authentik 实例，请先确认操作哪一个：%s",
				len(enabled), authentikInstanceOptions(enabled))
		}
		ref = enabled[0].ID
	}
	for _, in := range enabled {
		if in.ID == ref || strings.EqualFold(in.Name, ref) {
			key, err := opsEncryptionKey(app.Cfg())
			if err != nil {
				return nil, in, err
			}
			token, _ := decryptSecret(key, in.TokenEnc)
			cli, err := newAuthentikClient(in.BaseURL, token, 15*time.Second)
			if err != nil {
				return nil, in, err
			}
			return cli, in, nil
		}
	}
	return nil, AuthentikInstance{}, fmt.Errorf("Authentik 实例 %q 不存在或未启用，可选：%s", ref, authentikInstanceOptions(enabled))
}

func authentikInstanceOptions(instances []AuthentikInstance) string {
	parts := make([]string, 0, len(instances))
	for _, in := range instances {
		parts = append(parts, fmt.Sprintf("%s(%s)", in.Name, in.ID))
	}
	return strings.Join(parts, "、")
}

// strListArg 解析模型传入的字符串数组参数。
func strListArg(a map[string]any, key string) []string {
	raw, ok := a[key].([]any)
	if !ok {
		if s, ok := a[key].(string); ok && strings.TrimSpace(s) != "" {
			return strings.Split(s, ",")
		}
		return nil
	}
	out := make([]string, 0, len(raw))
	for _, v := range raw {
		if s, ok := v.(string); ok && strings.TrimSpace(s) != "" {
			out = append(out, strings.TrimSpace(s))
		}
	}
	return out
}

// aiAssistantUserIdentityTools 只读身份查询工具（所有模式可用）。
func aiAssistantUserIdentityTools() []aiAssistantTool {
	return []aiAssistantTool{
		{
			Name:        "headscale_list_users",
			Description: "列出 headscale（异地组网）用户。创建前先用它检查重名；instance 为实例名称或 id，留空=唯一实例时自动选择",
			Parameters: obj(map[string]any{
				"instance": strProp("headscale 实例名称或 id，留空自动选择"),
			}),
			Exec: func(app *ServerApp, a map[string]any) (string, error) {
				cli, inst, err := aiToolResolveMeshInstance(app, strArg(a, "instance"))
				if err != nil {
					return "", err
				}
				ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
				defer cancel()
				users, err := cli.ListUsers(ctx)
				if err != nil {
					return "", err
				}
				var b strings.Builder
				b.WriteString(fmt.Sprintf("实例 %s 共 %d 个用户：\nname\tdisplayName\temail\tid\n", inst.Name, len(users)))
				for _, u := range users {
					b.WriteString(fmt.Sprintf("%s\t%s\t%s\t%s\n", u.Name, u.DisplayName, u.Email, u.ID))
				}
				return b.String(), nil
			},
		},
		{
			Name:        "authentik_list_users",
			Description: "搜索 authentik（SSO）用户。创建前先用它检查重名；search 支持用户名/邮箱模糊匹配",
			Parameters: obj(map[string]any{
				"instance": strProp("Authentik 实例名称或 id，留空自动选择"),
				"search":   strProp("搜索关键字（用户名/姓名/邮箱），留空=全部"),
			}),
			Exec: func(app *ServerApp, a map[string]any) (string, error) {
				cli, inst, err := aiToolResolveAuthentikInstance(app, strArg(a, "instance"))
				if err != nil {
					return "", err
				}
				ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
				defer cancel()
				users, err := cli.ListUsers(ctx, strArg(a, "search"))
				if err != nil {
					return "", err
				}
				var b strings.Builder
				b.WriteString(fmt.Sprintf("实例 %s 共 %d 个用户：\nusername\tname\temail\tactive\tpk\n", inst.Name, len(users)))
				for _, u := range users {
					b.WriteString(fmt.Sprintf("%s\t%s\t%s\t%v\t%d\n", u.Username, u.Name, u.Email, u.IsActive, u.PK))
				}
				return b.String(), nil
			},
		},
		{
			Name:        "headscale_list_preauth_keys",
			Description: "列出某 headscale 用户的预授权密钥（key 值已打码，完整密钥需在异地组网页面查看）",
			Parameters: obj(map[string]any{
				"instance": strProp("headscale 实例名称或 id，留空自动选择"),
				"user":     strProp("headscale 用户名"),
			}, "user"),
			Exec: func(app *ServerApp, a map[string]any) (string, error) {
				cli, inst, err := aiToolResolveMeshInstance(app, strArg(a, "instance"))
				if err != nil {
					return "", err
				}
				ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
				defer cancel()
				keys, err := cli.ListPreAuthKeys(ctx, strings.TrimSpace(strArg(a, "user")))
				if err != nil {
					return "", err
				}
				var b strings.Builder
				b.WriteString(fmt.Sprintf("实例 %s 用户 %s 共 %d 个密钥：\nid\treusable\tephemeral\tused\texpiration\n", inst.Name, strings.TrimSpace(strArg(a, "user")), len(keys)))
				for _, k := range keys {
					b.WriteString(fmt.Sprintf("%s\t%v\t%v\t%v\t%s\n", k.ID, k.Reusable, k.Ephemeral, k.Used, k.Expiration))
				}
				return b.String(), nil
			},
		},
	}
}

// aiAssistantUserWriteTools 写操作工具（仅运维模式注入，且需前端二次确认）。
func aiAssistantUserWriteTools() []aiAssistantTool {
	return []aiAssistantTool{
		{
			Name: "headscale_create_user", Write: true,
			Description: "在 headscale（异地组网）上创建用户。执行前必须先用 headscale_list_users 检查重名，已存在则不要调用",
			Parameters: obj(map[string]any{
				"instance":    strProp("headscale 实例名称或 id，留空自动选择"),
				"username":    strProp("用户名（必填，建议小写字母数字连字符）"),
				"displayName": strProp("显示名（可选）"),
				"email":       strProp("邮箱（可选）"),
			}, "username"),
			Exec: func(app *ServerApp, a map[string]any) (string, error) {
				cli, inst, err := aiToolResolveMeshInstance(app, strArg(a, "instance"))
				if err != nil {
					return "", err
				}
				name := strings.TrimSpace(strArg(a, "username"))
				if name == "" {
					return "", fmt.Errorf("username 必填")
				}
				ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
				defer cancel()
				// 先查重：headscale 重名创建会直接报错，这里提前给出更友好的提示
				if users, lerr := cli.ListUsers(ctx); lerr == nil {
					for _, u := range users {
						if strings.EqualFold(u.Name, name) {
							return "", fmt.Errorf("用户 %q 在实例 %s 上已存在（id=%s），无需重复创建", name, inst.Name, u.ID)
						}
					}
				}
				u, err := cli.CreateUser(ctx, name, strings.TrimSpace(strArg(a, "displayName")), strings.TrimSpace(strArg(a, "email")))
				if err != nil {
					return "", err
				}
				return fmt.Sprintf("已在实例 %s 创建 headscale 用户：%s（id=%s）。设备加入时可再签发预授权密钥（headscale_create_preauth_key）。",
					inst.Name, u.Name, u.ID), nil
			},
		},
		{
			Name: "headscale_create_preauth_key", Write: true,
			Description: "为 headscale 用户签发预授权密钥（设备加入组网的一次性凭证）。用户必须已存在（可先 headscale_create_user）",
			Parameters: obj(map[string]any{
				"instance":  strProp("headscale 实例名称或 id，留空自动选择"),
				"user":      strProp("headscale 用户名（必填）"),
				"reusable":  boolSchema("是否可重复使用，默认 false"),
				"ephemeral": boolSchema("是否临时节点（注销即删除），默认 false"),
				"hours":     intProp("有效期小时数，默认 24；0 视为 24"),
			}, "user"),
			Exec: func(app *ServerApp, a map[string]any) (string, error) {
				cli, inst, err := aiToolResolveMeshInstance(app, strArg(a, "instance"))
				if err != nil {
					return "", err
				}
				userName := strings.TrimSpace(strArg(a, "user"))
				if userName == "" {
					return "", fmt.Errorf("user 必填")
				}
				hours := intArg(a, "hours", 24)
				if hours <= 0 {
					hours = 24
				}
				exp := time.Now().Add(time.Duration(hours) * time.Hour)
				ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
				defer cancel()
				userID, err := meshResolveUserID(ctx, cli, userName)
				if err != nil {
					return "", fmt.Errorf("用户不存在，请先创建：%w", err)
				}
				k, err := cli.CreatePreAuthKey(ctx, userID, boolArg(a, "reusable", false), boolArg(a, "ephemeral", false), &exp, nil)
				if err != nil {
					return "", err
				}
				// 与异地组网页面同款逻辑：平台加密保存完整密钥，供后续在 UI 预览/生成一键加入脚本
				if k.Key != "" {
					if encKey, kerr := meshEncryptionKey(app.Cfg()); kerr == nil {
						if enc, eerr := encryptSecret(encKey, k.Key); eerr == nil {
							items := loadMeshKeyMeta(app.PlatformKV())
							m := items[k.ID]
							m.FullEnc = enc
							items[k.ID] = m
							saveMeshKeyMeta(app.PlatformKV(), items)
						}
					}
				}
				return fmt.Sprintf("已为实例 %s 用户 %s 签发预授权密钥（有效期至 %s，reusable=%v）：\n密钥值：%s\n请提醒用户妥善保管，泄露后应立即过期。",
					inst.Name, userName, exp.Local().Format("2006-01-02 15:04"), boolArg(a, "reusable", false), k.Key), nil
			},
		},
		{
			Name: "authentik_create_user", Write: true,
			Description: "在 authentik（SSO）上创建用户，可同时设置初始密码与加入分组（按组名）。执行前必须先用 authentik_list_users 检查重名。password 留空时自动生成 16 位初始密码并回显一次",
			Parameters: obj(map[string]any{
				"instance": strProp("Authentik 实例名称或 id，留空自动选择"),
				"username": strProp("用户名（必填，登录名）"),
				"name":     strProp("姓名/显示名（可选）"),
				"email":    strProp("邮箱（可选，OIDC sub_mode=user_email 时即登录标识）"),
				"password": strProp("初始密码（可选；留空自动生成）"),
				"groups":   map[string]any{"type": "array", "items": map[string]any{"type": "string"}, "description": "要加入的组名列表（可选，按名称自动解析）"},
			}, "username"),
			Exec: func(app *ServerApp, a map[string]any) (string, error) {
				cli, inst, err := aiToolResolveAuthentikInstance(app, strArg(a, "instance"))
				if err != nil {
					return "", err
				}
				username := strings.TrimSpace(strArg(a, "username"))
				if username == "" {
					return "", fmt.Errorf("username 必填")
				}
				password := strArg(a, "password")
				generated := false
				if strings.TrimSpace(password) == "" {
					password = aiUserToolPassword()
					generated = true
				}
				groupNames := strListArg(a, "groups")
				ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
				defer cancel()
				// 先查重，避免 authentik 抛出裸 400
				if users, lerr := cli.ListUsers(ctx, username); lerr == nil {
					for _, u := range users {
						if strings.EqualFold(u.Username, username) {
							return "", fmt.Errorf("用户 %q 在实例 %s 上已存在（pk=%d），无需重复创建", username, inst.Name, u.PK)
						}
					}
				}
				groupPKs := make([]string, 0, len(groupNames))
				if len(groupNames) > 0 {
					all, gerr := cli.ListGroups(ctx, "")
					if gerr != nil {
						return "", fmt.Errorf("解析分组失败: %w", gerr)
					}
					byName := map[string]string{}
					for _, g := range all {
						byName[g.Name] = g.PK
					}
					var missing []string
					for _, gn := range groupNames {
						if pk, ok := byName[gn]; ok {
							groupPKs = append(groupPKs, pk)
						} else {
							missing = append(missing, gn)
						}
					}
					if len(missing) > 0 {
						return "", fmt.Errorf("以下组不存在，请先在 Authentik 创建或修正名称：%s", strings.Join(missing, "、"))
					}
				}
				u, err := cli.CreateUser(ctx, map[string]any{
					"username": username,
					"name":     strings.TrimSpace(strArg(a, "name")),
					"email":    strings.TrimSpace(strArg(a, "email")),
					"path":     "users",
					"groups":   groupPKs,
				})
				if err != nil {
					return "", err
				}
				if serr := cli.SetUserPassword(ctx, u.PK, password); serr != nil {
					return fmt.Sprintf("用户 %s 已创建（pk=%d），但初始密码设置失败：%s。可在 SSO 页面重设密码。", u.Username, u.PK, serr.Error()), nil
				}
				groupDesc := "无"
				if len(groupNames) > 0 {
					groupDesc = strings.Join(groupNames, "、")
				}
				pwdLine := "使用你提供的密码"
				if generated {
					pwdLine = "初始密码（仅此一次回显，请立即转交用户）：" + password
				}
				return fmt.Sprintf("已在实例 %s 创建 Authentik 用户：%s（pk=%d，邮箱 %s，分组 %s）。%s",
					inst.Name, u.Username, u.PK, u.Email, groupDesc, pwdLine), nil
			},
		},
	}
}

// aiAssistantMaskAuditSecrets 审计明细掩码：写工具的参数/结果可能携带密码与预授权密钥，
// 审计日志只保留动作事实，不落明文凭证。
func aiAssistantMaskAuditSecrets(s string) string {
	if s == "" {
		return s
	}
	out := passwordJSONPattern.ReplaceAllString(s, `"password":"***"`)
	out = labeledSecretPattern.ReplaceAllString(out, "${1}***")
	return out
}

var (
	passwordJSONPattern  = regexp.MustCompile(`"password"\s*:\s*"[^"]*"`)
	labeledSecretPattern = regexp.MustCompile(`((?:初始密码[^：:\n]*[：:]|密钥值[：:])[ \t]*)[^\s"）)]+`)
)

// aiUserToolsSystemPromptSection 系统提示词中的身份管理能力说明（拼接进 aiAssistantSystemPrompt）。
const aiUserToolsSystemPromptSection = `
- 身份管理：创建 headscale（异地组网）用户并签发预授权密钥；创建 Authentik（SSO）用户（含自动生成初始密码、按组名加入分组）。创建前必须先用对应 list 工具查重。`

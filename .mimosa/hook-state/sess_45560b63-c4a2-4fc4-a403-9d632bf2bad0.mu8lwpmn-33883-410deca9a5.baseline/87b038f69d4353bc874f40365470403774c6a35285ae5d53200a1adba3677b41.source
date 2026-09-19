package internal

import (
	"bytes"
	"sort"
	"strings"

	yaml "gopkg.in/yaml.v3"
)

// configMapDataKeyLikeText 判断 data 键名是否可能为多行配置文本（可安全做 \n 字面量还原等）。
func configMapDataKeyLikeText(name string) bool {
	n := strings.TrimSpace(strings.ToLower(name))
	if n == "" {
		return false
	}
	if strings.HasSuffix(n, ".yml") || strings.HasSuffix(n, ".yaml") {
		return true
	}
	if strings.HasSuffix(n, ".conf") || strings.HasSuffix(n, ".config") || strings.HasSuffix(n, ".properties") {
		return true
	}
	if n == "prometheus.yml" || n == "prometheus.yaml" || n == "alerting_rules.yml" {
		return true
	}
	return false
}

// reformatConfigMapYAMLForDisplay 无集群 data 时仅做标量/样式修复（单测、降级）。
func reformatConfigMapYAMLForDisplay(raw []byte) ([]byte, error) {
	return reformatConfigMapYAMLForDisplayWithData(raw, nil)
}

// reformatConfigMapYAMLForDisplayWithData 在已有 yaml 上优化展示；当 data 非空时
// 用 K8s API 返回的 map 重建 data 节（| 多行块），不依赖 sigs.k8s.io/yaml 是否出双引号行。
func reformatConfigMapYAMLForDisplayWithData(raw []byte, data map[string]string) ([]byte, error) {
	var root yaml.Node
	if err := yaml.Unmarshal(raw, &root); err != nil {
		return nil, err
	}
	if data != nil && len(data) > 0 {
		replaceDataMappingNodeFromStringMap(&root, data)
	} else {
		fixConfigMapDataScalars(&root)
	}
	var buf bytes.Buffer
	enc := yaml.NewEncoder(&buf)
	enc.SetIndent(2)
	if err := enc.Encode(&root); err != nil {
		return nil, err
	}
	if err := enc.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// replaceDataMappingNodeFromStringMap 将文档中 data: 的映射整段替换为按名排序的节点，
// 值以集群对象为准，并强制多行/长配置为 literal，避免始终显示为 "global:\n" 的引号串。
func replaceDataMappingNodeFromStringMap(root *yaml.Node, data map[string]string) {
	if root == nil || data == nil || len(data) == 0 {
		return
	}
	if root.Kind != yaml.DocumentNode || len(root.Content) < 1 {
		return
	}
	top := root.Content[0]
	if top.Kind != yaml.MappingNode {
		return
	}
	for i := 0; i+1 < len(top.Content); i += 2 {
		if top.Content[i].Kind == yaml.ScalarNode && top.Content[i].Value == "data" {
			top.Content[i+1] = buildConfigMapDataYAMLNode(data)
			return
		}
	}
}

func buildConfigMapDataYAMLNode(m map[string]string) *yaml.Node {
	n := &yaml.Node{Kind: yaml.MappingNode, Tag: "!!map"}
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		v0 := m[k]
		v := strings.ReplaceAll(v0, "\r\n", "\n")
		v = strings.ReplaceAll(v, "\r", "\n")
		// 字面量反斜杠+n
		if !strings.Contains(v, "\n") && strings.Contains(v, `\n`) &&
			(configMapDataKeyLikeText(k) || (len(v) > 200 && strings.Count(v, `\n`) >= 2)) {
			v2 := strings.ReplaceAll(v, `\r\n`, "\n")
			v2 = strings.ReplaceAll(v2, `\n`, "\n")
			v2 = strings.ReplaceAll(v2, `\r`, "\n")
			v2 = strings.ReplaceAll(v2, `\t`, "\t")
			if strings.Contains(v2, "\n") {
				v = v2
			}
		}
		kNode := &yaml.Node{Kind: yaml.ScalarNode, Value: k, Tag: "!!str"}
		vNode := &yaml.Node{Kind: yaml.ScalarNode, Value: v, Tag: "!!str"}
		if shouldConfigMapDataLiteralStyle(k, v) {
			vNode.Style = yaml.LiteralStyle
		}
		n.Content = append(n.Content, kNode, vNode)
	}
	return n
}

func shouldConfigMapDataLiteralStyle(keyName, s string) bool {
	if strings.Contains(s, "\n") {
		return true
	}
	if configMapDataKeyLikeText(keyName) && len(s) > 80 {
		return true
	}
	if len(s) > 2000 {
		return true
	}
	return false
}

func fixConfigMapDataScalars(n *yaml.Node) {
	if n == nil {
		return
	}
	switch n.Kind {
	case yaml.DocumentNode:
		for _, c := range n.Content {
			fixConfigMapDataScalars(c)
		}
	case yaml.MappingNode:
		for i := 0; i+1 < len(n.Content); i += 2 {
			key := n.Content[i]
			val := n.Content[i+1]
			if key.Kind == yaml.ScalarNode && key.Value == "data" && val.Kind == yaml.MappingNode {
				fixDataValueScalars(val)
				continue
			}
			fixConfigMapDataScalars(val)
		}
	case yaml.SequenceNode:
		for _, c := range n.Content {
			fixConfigMapDataScalars(c)
		}
	}
}

func fixDataValueScalars(dataMap *yaml.Node) {
	for i := 0; i+1 < len(dataMap.Content); i += 2 {
		k := dataMap.Content[i]
		v := dataMap.Content[i+1]
		if v.Kind != yaml.ScalarNode {
			continue
		}
		keyName := ""
		if k.Kind == yaml.ScalarNode {
			keyName = k.Value
		}
		s := v.Value
		// 1) 部分序列化/导出会把换行变成字面量「\n」两个字符（行内长串，无真正 ASCII 0x0a）
		if !strings.Contains(s, "\n") && strings.Contains(s, `\n`) {
			likely := configMapDataKeyLikeText(keyName) ||
				(len(s) > 200 && strings.Count(s, `\n`) >= 2)
			if likely {
				s2 := strings.ReplaceAll(s, `\r\n`, "\n")
				s2 = strings.ReplaceAll(s2, `\n`, "\n")
				s2 = strings.ReplaceAll(s2, `\r`, "\r")
				s2 = strings.ReplaceAll(s2, `\t`, "\t")
				if strings.Contains(s2, "\n") {
					s = s2
					v.Value = s
					v.Tag = ""
				}
			}
		}
		// 2) 多行内容用 literal block 输出（与 kubectl/旧版 单行带转义 相比更易读）
		if strings.Contains(s, "\n") {
			v.Style = yaml.LiteralStyle
			v.Tag = ""
			continue
		}
		// 3) 无换行但极长的单键配置（如仍为一行但数千字符），也落为 | 块，避免横屏一坨
		if (configMapDataKeyLikeText(keyName) && len(s) > 180) || len(s) > 2000 {
			v.Style = yaml.LiteralStyle
			v.Tag = ""
		}
	}
}

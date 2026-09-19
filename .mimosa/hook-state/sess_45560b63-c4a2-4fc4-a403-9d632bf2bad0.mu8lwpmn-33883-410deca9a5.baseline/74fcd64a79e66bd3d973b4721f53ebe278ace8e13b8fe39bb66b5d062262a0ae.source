package internal

import (
	"encoding/json"
	"strings"

	sigyaml "sigs.k8s.io/yaml"
)

const kubectlLastAppliedAnnKey = "kubectl.kubernetes.io/last-applied-configuration"

// inferGVKFromKubectlLastApplied 从 kubectl / KubeSphere 等写入的 last-applied-configuration（JSON）解析 apiVersion/kind。
func inferGVKFromKubectlLastApplied(doc string) (apiVersion, kind string) {
	var root map[string]interface{}
	if err := sigyaml.Unmarshal([]byte(doc), &root); err != nil {
		return "", ""
	}
	meta, ok := root["metadata"].(map[string]interface{})
	if !ok || meta == nil {
		return "", ""
	}
	ann, ok := meta["annotations"].(map[string]interface{})
	if !ok || ann == nil {
		return "", ""
	}
	raw, ok := ann[kubectlLastAppliedAnnKey]
	if !ok || raw == nil {
		return "", ""
	}
	s, ok := raw.(string)
	if !ok {
		return "", ""
	}
	s = strings.TrimSpace(s)
	if s == "" {
		return "", ""
	}
	var js map[string]interface{}
	if err := json.Unmarshal([]byte(s), &js); err != nil {
		return "", ""
	}
	k, _ := js["kind"].(string)
	av, _ := js["apiVersion"].(string)
	return strings.TrimSpace(av), strings.TrimSpace(k)
}

// inferGVKFromWellKnownSpecShape 在缺少顶格 apiVersion/kind 时，按常见 spec 形状推断（如控制台只复制了 metadata 以下部分）。
func inferGVKFromWellKnownSpecShape(doc string) (apiVersion, kind string) {
	var root map[string]interface{}
	if err := sigyaml.Unmarshal([]byte(doc), &root); err != nil {
		return "", ""
	}
	if k, ok := root["kind"].(string); ok && strings.TrimSpace(k) != "" {
		return "", ""
	}
	spec, ok := root["spec"].(map[string]interface{})
	specOK := ok && spec != nil

	if specOK {
		_, hasTpl := spec["template"]
		_, hasSel := spec["selector"]
		if hasTpl && hasSel {
			// batch Job 常带 selector，且没有 apps/v1 工作负载的 strategy/updateStrategy
			if _, ok := spec["parallelism"]; ok {
				return "batch/v1", "Job"
			}
			if _, ok := spec["completions"]; ok {
				return "batch/v1", "Job"
			}
			if _, ok := spec["backoffLimit"]; ok {
				return "batch/v1", "Job"
			}
			if _, ok := spec["ttlSecondsAfterFinished"]; ok {
				return "batch/v1", "Job"
			}
			if _, ok := spec["strategy"]; ok {
				return "apps/v1", "Deployment"
			}
			if _, ok := spec["updateStrategy"]; ok {
				return "apps/v1", "DaemonSet"
			}
			if _, ok := spec["serviceName"]; ok {
				return "apps/v1", "StatefulSet"
			}
			if _, ok := spec["volumeClaimTemplates"]; ok {
				return "apps/v1", "StatefulSet"
			}
			if _, ok := spec["replicas"]; ok {
				return "apps/v1", "ReplicaSet"
			}
		}
		if _, ok := spec["jobTemplate"]; ok {
			return "batch/v1", "CronJob"
		}
		if hasTpl && !hasSel {
			if _, ok := spec["parallelism"]; ok {
				return "batch/v1", "Job"
			}
			if _, ok := spec["completions"]; ok {
				return "batch/v1", "Job"
			}
			if _, ok := spec["ttlSecondsAfterFinished"]; ok {
				return "batch/v1", "Job"
			}
		}
		if _, ok := spec["rules"]; ok {
			return "networking.k8s.io/v1", "Ingress"
		}
		if _, ok := spec["ports"]; ok {
			if _, ok := spec["selector"]; ok {
				return "v1", "Service"
			}
		}
		if _, ok := spec["scaleTargetRef"].(map[string]interface{}); ok {
			return "autoscaling/v2", "HorizontalPodAutoscaler"
		}
		if _, ok := spec["podSelector"]; ok {
			return "networking.k8s.io/v1", "NetworkPolicy"
		}
		if _, ok := spec["accessModes"]; ok {
			if _, ok := spec["resources"]; ok {
				return "v1", "PersistentVolumeClaim"
			}
		}
	}
	if specOK {
		if _, ok := spec["containers"]; ok {
			if _, hasTpl := spec["template"]; !hasTpl {
				return "v1", "Pod"
			}
		}
	}
	if _, ok := root["binaryData"].(map[string]interface{}); ok {
		return "v1", "ConfigMap"
	}
	if _, ok := root["data"].(map[string]interface{}); ok {
		if _, ok := root["stringData"].(map[string]interface{}); ok {
			return "v1", "Secret"
		}
		if t, ok := root["type"].(string); ok && strings.TrimSpace(t) != "" {
			return "v1", "Secret"
		}
		return "v1", "ConfigMap"
	}
	return "", ""
}

// prependYAMLGVK 在文档顶部补上 apiVersion/kind（用于缺头 YAML）。
func prependYAMLGVK(doc, apiVersion, kind string) string {
	apiVersion = strings.TrimSpace(apiVersion)
	kind = strings.TrimSpace(kind)
	if apiVersion == "" || kind == "" {
		return doc
	}
	return "apiVersion: " + apiVersion + "\nkind: " + kind + "\n" + doc
}

// ensureKubernetesYAMLGVK 若缺省 GVK，则尝试从注解或 spec 形状补全。
func ensureKubernetesYAMLGVK(doc string) string {
	if kubernetesYAMLKind(doc) != "" {
		return doc
	}
	av, k := inferGVKFromKubectlLastApplied(doc)
	if k == "" || av == "" {
		av, k = inferGVKFromWellKnownSpecShape(doc)
	}
	if k == "" || av == "" {
		return doc
	}
	return prependYAMLGVK(doc, av, k)
}

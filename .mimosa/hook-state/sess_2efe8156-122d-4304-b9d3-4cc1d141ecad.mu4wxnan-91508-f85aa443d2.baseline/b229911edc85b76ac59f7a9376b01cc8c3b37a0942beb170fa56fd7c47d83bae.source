package internal

import (
	"context"
	"fmt"
	"strings"

	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

func redisDataPVCName(base string) string {
	s := strings.TrimSpace(base) + "-data"
	if len(s) <= 63 {
		return s
	}
	return s[:63]
}

// pickDefaultStorageClassName 优先 annotation 为默认的 SC，否则取列表第一个。
func pickDefaultStorageClassName(ctx context.Context, k8s *kubernetes.Clientset) (string, error) {
	list, err := k8s.StorageV1().StorageClasses().List(ctx, metav1.ListOptions{})
	if err != nil {
		return "", err
	}
	for i := range list.Items {
		sc := &list.Items[i]
		if sc.Annotations["storageclass.kubernetes.io/is-default-class"] == "true" {
			return sc.Name, nil
		}
	}
	if len(list.Items) == 0 {
		return "", fmt.Errorf("集群中无 StorageClass，请在部署时指定或创建默认 StorageClass")
	}
	return list.Items[0].Name, nil
}

// ResolveRedisK8sStorageClass 解析 StorageClass：用户/运行时显式值优先，否则选集群默认。
func ResolveRedisK8sStorageClass(ctx context.Context, k8s *kubernetes.Clientset, userOrCfg string) (string, error) {
	if strings.TrimSpace(userOrCfg) != "" {
		return strings.TrimSpace(userOrCfg), nil
	}
	return pickDefaultStorageClassName(ctx, k8s)
}

func parseStorageSize(s string) (resource.Quantity, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		s = "10Gi"
	}
	return resource.ParseQuantity(s)
}

func buildRedisPVC(ns, name string, storageClassName string, size string, labels map[string]string) (*corev1.PersistentVolumeClaim, error) {
	qty, err := parseStorageSize(size)
	if err != nil {
		return nil, err
	}
	pvc := &corev1.PersistentVolumeClaim{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: ns, Labels: labels},
		Spec: corev1.PersistentVolumeClaimSpec{
			AccessModes: []corev1.PersistentVolumeAccessMode{corev1.ReadWriteOnce},
			Resources: corev1.ResourceRequirements{
				Requests: corev1.ResourceList{corev1.ResourceStorage: qty},
			},
		},
	}
	if strings.TrimSpace(storageClassName) != "" {
		sc := strings.TrimSpace(storageClassName)
		pvc.Spec.StorageClassName = &sc
	}
	return pvc, nil
}

// BuildVolumeClaimTemplate 用于 StatefulSet 的 volumeClaimTemplates（卷名即 PVC 模板名）。
func BuildVolumeClaimTemplate(volumeName string, storageClassName string, size string) (corev1.PersistentVolumeClaim, error) {
	qty, err := parseStorageSize(size)
	if err != nil {
		return corev1.PersistentVolumeClaim{}, err
	}
	tpl := corev1.PersistentVolumeClaim{
		ObjectMeta: metav1.ObjectMeta{Name: volumeName},
		Spec: corev1.PersistentVolumeClaimSpec{
			AccessModes: []corev1.PersistentVolumeAccessMode{corev1.ReadWriteOnce},
			Resources: corev1.ResourceRequirements{
				Requests: corev1.ResourceList{corev1.ResourceStorage: qty},
			},
		},
	}
	if strings.TrimSpace(storageClassName) != "" {
		sc := strings.TrimSpace(storageClassName)
		tpl.Spec.StorageClassName = &sc
	}
	return tpl, nil
}

func applyPVC(ctx context.Context, k8s *kubernetes.Clientset, pvc *corev1.PersistentVolumeClaim) error {
	cli := k8s.CoreV1().PersistentVolumeClaims(pvc.Namespace)
	_, err := cli.Get(ctx, pvc.Name, metav1.GetOptions{})
	if err == nil {
		return nil
	}
	if !apierrors.IsNotFound(err) {
		return err
	}
	_, err = cli.Create(ctx, pvc, metav1.CreateOptions{})
	return err
}

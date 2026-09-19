package internal

import (
	"context"
	"fmt"
	"time"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/wait"
	"k8s.io/client-go/kubernetes"
)

func deleteAdmissionWebhooksForNamespace(ctx context.Context, k8s *kubernetes.Clientset, ns string) error {
	vlist, err := k8s.AdmissionregistrationV1().ValidatingWebhookConfigurations().List(ctx, metav1.ListOptions{})
	if err != nil {
		return fmt.Errorf("列出 ValidatingWebhookConfiguration: %w", err)
	}
	for _, whc := range vlist.Items {
		for _, wh := range whc.Webhooks {
			if wh.ClientConfig.Service != nil && wh.ClientConfig.Service.Namespace == ns {
				if err := k8s.AdmissionregistrationV1().ValidatingWebhookConfigurations().Delete(ctx, whc.Name, metav1.DeleteOptions{}); err != nil && !apierrors.IsNotFound(err) {
					return fmt.Errorf("删除 ValidatingWebhookConfiguration %s: %w", whc.Name, err)
				}
				break
			}
		}
	}
	mlist, err := k8s.AdmissionregistrationV1().MutatingWebhookConfigurations().List(ctx, metav1.ListOptions{})
	if err != nil {
		return fmt.Errorf("列出 MutatingWebhookConfiguration: %w", err)
	}
	for _, whc := range mlist.Items {
		for _, wh := range whc.Webhooks {
			if wh.ClientConfig.Service != nil && wh.ClientConfig.Service.Namespace == ns {
				if err := k8s.AdmissionregistrationV1().MutatingWebhookConfigurations().Delete(ctx, whc.Name, metav1.DeleteOptions{}); err != nil && !apierrors.IsNotFound(err) {
					return fmt.Errorf("删除 MutatingWebhookConfiguration %s: %w", whc.Name, err)
				}
				break
			}
		}
	}
	return nil
}

func waitNamespaceGone(ctx context.Context, k8s *kubernetes.Clientset, name string) error {
	return wait.PollUntilContextTimeout(ctx, 2*time.Second, 6*time.Minute, true, func(ctx context.Context) (bool, error) {
		_, err := k8s.CoreV1().Namespaces().Get(ctx, name, metav1.GetOptions{})
		if apierrors.IsNotFound(err) {
			return true, nil
		}
		if err != nil {
			return false, err
		}
		return false, nil
	})
}

// UninstallKubernetesNamespace 删除命名空间及其引用该命名空间内 Service 的 Admission Webhook（ingress-nginx / MetalLB 等常见布局）。
func UninstallKubernetesNamespace(ctx context.Context, k8s *kubernetes.Clientset, ns string) error {
	if k8s == nil {
		return fmt.Errorf("Kubernetes 客户端未初始化")
	}
	if err := deleteAdmissionWebhooksForNamespace(ctx, k8s, ns); err != nil {
		return err
	}
	fg := metav1.DeletePropagationForeground
	err := k8s.CoreV1().Namespaces().Delete(ctx, ns, metav1.DeleteOptions{PropagationPolicy: &fg})
	if apierrors.IsNotFound(err) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("删除命名空间 %s: %w", ns, err)
	}
	return waitNamespaceGone(ctx, k8s, ns)
}

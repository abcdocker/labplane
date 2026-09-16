package internal

import (
	"errors"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func TestPvcMountsForClaim_skipsCompletedInitContainer(t *testing.T) {
	pods := []corev1.Pod{
		{
			ObjectMeta: metav1.ObjectMeta{Name: "p1"},
			Spec: corev1.PodSpec{
				Volumes: []corev1.Volume{
					{Name: "data", VolumeSource: corev1.VolumeSource{
						PersistentVolumeClaim: &corev1.PersistentVolumeClaimVolumeSource{ClaimName: "my-pvc"},
					}},
				},
				InitContainers: []corev1.Container{
					{
						Name: "vlstorage",
						VolumeMounts: []corev1.VolumeMount{
							{Name: "data", MountPath: "/storage"},
						},
					},
				},
				Containers: []corev1.Container{
					{
						Name: "app",
						VolumeMounts: []corev1.VolumeMount{
							{Name: "data", MountPath: "/data"},
						},
					},
				},
			},
			Status: corev1.PodStatus{
				Phase: corev1.PodRunning,
				InitContainerStatuses: []corev1.ContainerStatus{
					{
						Name: "vlstorage",
						State: corev1.ContainerState{
							Terminated: &corev1.ContainerStateTerminated{ExitCode: 0},
						},
					},
				},
			},
		},
	}
	got := pvcMountsForClaim(pods, "my-pvc")
	if len(got) != 1 {
		t.Fatalf("want 1 mount (app only), got %d: %+v", len(got), got)
	}
	if got[0].Container != "app" || got[0].MountPath != "/data" {
		t.Fatalf("unexpected mount: %+v", got[0])
	}
}

func TestPvcMountsForClaim_includesRunningInitContainer(t *testing.T) {
	pods := []corev1.Pod{
		{
			ObjectMeta: metav1.ObjectMeta{Name: "p1"},
			Spec: corev1.PodSpec{
				Volumes: []corev1.Volume{
					{Name: "data", VolumeSource: corev1.VolumeSource{
						PersistentVolumeClaim: &corev1.PersistentVolumeClaimVolumeSource{ClaimName: "pvc2"},
					}},
				},
				InitContainers: []corev1.Container{
					{
						Name: "slow-init",
						VolumeMounts: []corev1.VolumeMount{
							{Name: "data", MountPath: "/mnt"},
						},
					},
				},
				Containers: []corev1.Container{
					{Name: "app"},
				},
			},
			Status: corev1.PodStatus{
				Phase: corev1.PodRunning,
				InitContainerStatuses: []corev1.ContainerStatus{
					{
						Name: "slow-init",
						State: corev1.ContainerState{
							Running: &corev1.ContainerStateRunning{},
						},
					},
				},
			},
		},
	}
	got := pvcMountsForClaim(pods, "pvc2")
	if len(got) != 1 || got[0].Container != "slow-init" {
		t.Fatalf("want slow-init mount, got %+v", got)
	}
}

func TestClassifyPVCExecEnvironmentError_distrolessShMissing(t *testing.T) {
	err := errors.New(
		`Internal error occurred: error executing command in container: failed to exec in container: failed to start exec "0676889d84c3eefc6f9d0c17a40c878ca51d9b2bf6346ab6149c083c4eeea287": OCI runtime exec failed: exec failed: unable to start container process: exec: "/bin/sh": stat /bin/sh: no such file or directory: unknown`,
	)
	msg, code := classifyPVCExecEnvironmentError(err, "")
	if code != pvcExecUnsupportedCode {
		t.Fatalf("code=%q want %q", code, pvcExecUnsupportedCode)
	}
	if msg == "" {
		t.Fatal("empty msg")
	}
}

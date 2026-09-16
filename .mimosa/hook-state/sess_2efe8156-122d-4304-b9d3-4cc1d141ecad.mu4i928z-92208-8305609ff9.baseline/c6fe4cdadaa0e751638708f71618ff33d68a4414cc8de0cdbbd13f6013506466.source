package internal

import (
	"testing"

	"github.com/vmware/govmomi/vim25/types"
)

func TestVmDiskStorageUsagePct_UncommittedZeroMeansNil(t *testing.T) {
	// 厚置备或 vSphere 未报告未承诺增长时：Committed/(Committed+0) 恒为 100%，与来宾 df 无关，不应展示。
	st := &types.VirtualMachineStorageSummary{Committed: 15 << 30, Uncommitted: 0}
	if p := vmDiskStorageUsagePct(st); p != nil {
		t.Fatalf("expected nil when uncommitted=0, got %v", *p)
	}
}

func TestVmDiskStorageUsagePct_ThinProvisioning(t *testing.T) {
	st := &types.VirtualMachineStorageSummary{Committed: 25 << 30, Uncommitted: 75 << 30}
	p := vmDiskStorageUsagePct(st)
	if p == nil || *p < 24.9 || *p > 25.1 {
		t.Fatalf("expected ~25%%, got %v", p)
	}
}

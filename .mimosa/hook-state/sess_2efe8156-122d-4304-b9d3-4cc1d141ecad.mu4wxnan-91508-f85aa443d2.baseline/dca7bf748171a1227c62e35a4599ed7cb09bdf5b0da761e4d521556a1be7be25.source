package internal

import (
	"context"
	"strings"

	"github.com/vmware/govmomi"
	"github.com/vmware/govmomi/object"
	"github.com/vmware/govmomi/property"
	"github.com/vmware/govmomi/vim25/mo"
	"github.com/vmware/govmomi/vim25/types"
)

// vcenterVMInventoryFolderPath 返回虚拟机所在清单路径（数据中心/文件夹…，不含虚拟机名）。
func vcenterVMInventoryFolderPath(ctx context.Context, client *govmomi.Client, vmMoref string) string {
	vmMoref = strings.TrimSpace(vmMoref)
	if vmMoref == "" || client == nil {
		return ""
	}
	vm := object.NewVirtualMachine(client.Client, types.ManagedObjectReference{Type: "VirtualMachine", Value: vmMoref})
	var m mo.VirtualMachine
	if err := vm.Properties(ctx, vm.Reference(), []string{"parent"}, &m); err != nil || m.Parent == nil {
		return ""
	}
	ref := *m.Parent
	pc := property.DefaultCollector(client.Client)
	var parts []string
	for i := 0; i < 64; i++ {
		var me mo.ManagedEntity
		if err := pc.RetrieveOne(ctx, ref, []string{"name", "parent"}, &me); err != nil {
			break
		}
		switch ref.Type {
		case "Folder":
			if me.Name != "" {
				parts = append([]string{me.Name}, parts...)
			}
		case "Datacenter":
			if me.Name != "" {
				parts = append([]string{me.Name}, parts...)
			}
			return strings.Join(parts, "/")
		case "HostSystem", "ComputeResource", "ClusterComputeResource":
			// 向上走，不把主机名加入路径
		default:
			// ResourcePool、VirtualApp 等仅向上
		}
		if me.Parent == nil {
			break
		}
		ref = *me.Parent
	}
	return strings.Join(parts, "/")
}

package internal

import (
	"encoding/json"
	"testing"
)

func TestCVMInstanceNestedFields(t *testing.T) {
	var instance CVMInstance
	err := json.Unmarshal([]byte(`{
		"InstanceId":"ins-1",
		"Placement":{"Zone":"ap-shanghai-2"},
		"VirtualPrivateCloud":{"VpcId":"vpc-1","SubnetId":"subnet-1"}
	}`), &instance)
	if err != nil {
		t.Fatal(err)
	}
	if instance.Zone != "ap-shanghai-2" || instance.VPCID != "vpc-1" || instance.SubnetID != "subnet-1" {
		t.Fatalf("nested fields not decoded: %+v", instance)
	}
}

package internal

import (
	"testing"

	"github.com/gin-gonic/gin"
)

func TestPromqlPodNetIncrease(t *testing.T) {
	q := promqlPodNetIncrease("container_network_receive_bytes_total", "1d")
	if want := `sum by (namespace, pod) (increase(container_network_receive_bytes_total{namespace!="",pod!=""}[1d]))`; q != want {
		t.Fatalf("unexpected query:\n%s", q)
	}
}

func TestMergePodNetworkRxTx(t *testing.T) {
	rx := []gin.H{
		{"metric": map[string]string{"namespace": "ns1", "pod": "a"}, "value": 100.0},
		{"metric": map[string]string{"namespace": "ns1", "pod": "b"}, "value": 50.0},
	}
	tx := []gin.H{
		{"metric": map[string]string{"namespace": "ns1", "pod": "a"}, "value": 10.0},
		{"metric": map[string]string{"namespace": "ns1", "pod": "b"}, "value": 200.0},
	}
	out := mergePodNetworkRxTx(rx, tx, 10)
	if len(out) != 2 {
		t.Fatalf("len=%d", len(out))
	}
	// b total 250 > a total 110
	if out[0]["pod"] != "b" || out[1]["pod"] != "a" {
		t.Fatalf("order: %#v", out)
	}
}

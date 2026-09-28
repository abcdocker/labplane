package internal

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestMeshSummariesKeepOrderAndIsolateSlowInstance(t *testing.T) {
	instances := []MeshInstance{{ID: "slow", Enabled: true}, {ID: "fast", Enabled: true}, {ID: "off", Enabled: false}}
	start := time.Now()
	got := meshSummarizeInstances(context.Background(), instances, func(ctx context.Context, inst MeshInstance) ([]HSNode, error) {
		if inst.ID == "slow" {
			<-ctx.Done()
			return nil, ctx.Err()
		}
		if inst.ID == "fast" {
			return []HSNode{{Online: true}}, nil
		}
		return nil, errors.New("disabled instance queried")
	}, 40*time.Millisecond)
	if time.Since(start) > 250*time.Millisecond {
		t.Fatal("slow instance blocked summary")
	}
	if len(got) != 3 || got[0].ID != "slow" || got[1].ID != "fast" || got[2].ID != "off" {
		t.Fatalf("order changed: %+v", got)
	}
	if got[0].Healthy || got[0].Error == "" {
		t.Fatalf("slow error missing: %+v", got[0])
	}
	if !got[1].Healthy || got[1].NodesOnline != 1 {
		t.Fatalf("fast missing: %+v", got[1])
	}
	if got[2].Error != "" {
		t.Fatalf("disabled instance queried: %+v", got[2])
	}
}

package internal

import (
	"encoding/json"
	"testing"
)

func TestPromRangeHasPointsFlexibleRows(t *testing.T) {
	// 第三元素为扩展列时，旧版 [][2] 无法反序列化整条 values；应仍能识别有点
	raw := `{
		"status":"success",
		"data":{"result":[{"metric":{"x":"y"},"values":[[1735689600,"1.5"],[1735689660,"2.5","extra"]]}]}
	}`
	if !promRangeHasPoints([]byte(raw)) {
		t.Fatal("expected has points")
	}
	pts := promFirstSeriesNumericPointsFromJSON([]byte(raw))
	if len(pts) != 2 {
		t.Fatalf("expected 2 points, got %d", len(pts))
	}
}

func TestPromFirstSeriesNumericMixedJSONNumbers(t *testing.T) {
	raw := `{
		"status":"success",
		"data":{"result":[{"metric":{},"values":[[1735689600,1.5],[1735689660,2.5]]}]}
	}`
	pts := promFirstSeriesNumericPointsFromJSON([]byte(raw))
	if len(pts) != 2 {
		t.Fatalf("expected 2 points, got %d", len(pts))
	}
}

func TestPromFirstSeriesSecondSeriesFallback(t *testing.T) {
	// 第一条序列 values 反序列化成功但数值全非法；第二条有有效点
	raw := `{
		"status":"success",
		"data":{"result":[
			{"metric":{"a":"1"},"values":[[1735689600,"nan"]]},
			{"metric":{"b":"2"},"values":[[1735689600,"3"]]}
		]}
	}`
	pts := promFirstSeriesNumericPointsFromJSON([]byte(raw))
	if len(pts) != 1 || pts[0]["v"] != 3 {
		t.Fatalf("unexpected pts: %#v", pts)
	}
}

func TestPromRangeMatrixRespUnmarshal(t *testing.T) {
	s := `{"status":"success","data":{"result":[{"values":[[1,"2"]]}]}}`
	var m promRangeMatrixResp
	if err := json.Unmarshal([]byte(s), &m); err != nil {
		t.Fatal(err)
	}
	if len(m.Data.Result) != 1 || len(m.Data.Result[0].Values) != 1 || len(m.Data.Result[0].Values[0]) != 2 {
		t.Fatalf("bad shape: %+v", m.Data.Result)
	}
}

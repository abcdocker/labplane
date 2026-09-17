package internal

import "testing"

func TestParsePerfProducerOutput(t *testing.T) {
	samples := []string{
		`===PERF_PRODUCER_START===
500000 records sent, 98325.08 records/sec (96.02 MB/sec), 1.46 ms avg latency, 341.00 ms max latency, 1 ms 50th, 3 ms 95th, 7 ms 99th, 40 ms 99.9th.
===PERF_PRODUCER_END===`,
		`1000000 records sent, 312788.07992941517 records/sec (305.46 MiB/sec), 0.84 ms avg latency, 395.00 ms max latency, 0 ms 50th, 2 ms 95th, 53 ms 99th, 395 ms 99.9th.`,
		// 无 99.9th
		`2000 records sent, 500.00 records/sec (1.00 MB/sec), 1.00 ms avg latency, 10.00 ms max latency, 1 ms 50th, 2 ms 95th, 3 ms 99th`,
	}
	for i, s := range samples {
		r := parsePerfProducerOutput(s)
		if r == nil {
			t.Fatalf("sample %d: got nil", i)
		}
		if r.RecordsSent <= 0 || r.MBPerSec <= 0 {
			t.Fatalf("sample %d: bad metrics %+v", i, r)
		}
	}
}

func TestParsePerfConsumerOutput(t *testing.T) {
	// Apache Kafka 10 列汇总行
	full := `===PERF_CONSUMER_START===
start.time, end.time, data.consumed.in.MB, MB.sec, data.consumed.in.nMsg, nMsg.sec, rebalance.time.ms, fetch.time.ms, fetch.MB.sec, fetch.nMsg.sec
2020-01-01 00:00:00:000, 2020-01-01 00:00:10:000, 100.5000, 10.0500, 500000, 50000.0000, 100, 9900, 10.1515, 50505.0505
===PERF_CONSUMER_END===`
	r := parsePerfConsumerOutput(full)
	if r == nil || r.MessagesCount != 500000 {
		t.Fatalf("full: %+v", r)
	}
	if r.FetchMBPerSec < 0.01 {
		t.Fatalf("fetch MB/s: %+v", r)
	}

	// 旧版 6 列（无 rebalance/fetch）
	legacy := `start.time, end.time, data.consumed.in.MB, MB.sec, data.consumed.in.nMsg, nMsg.sec
2017-07-13 09:56:00:302, 2017-07-13 09:56:31:093, 7820.1294, 253.9745, 20500000, 665778.9614`
	r2 := parsePerfConsumerOutput(legacy)
	if r2 == nil || r2.MessagesCount != 20500000 {
		t.Fatalf("legacy: %+v", r2)
	}
	if r2.FetchMBPerSec != r2.MBPerSec {
		t.Fatalf("legacy fetch should mirror MB/sec: %+v", r2)
	}
}

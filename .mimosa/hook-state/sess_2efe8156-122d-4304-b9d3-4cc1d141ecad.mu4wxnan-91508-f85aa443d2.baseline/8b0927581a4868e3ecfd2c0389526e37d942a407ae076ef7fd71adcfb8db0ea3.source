package internal

import (
	"context"
	"log"
	"sync"
	"sync/atomic"
)

type queuedAuditRecord struct {
	app *ServerApp
	rec AuditRecord
}

var (
	auditQueue     = make(chan queuedAuditRecord, 1024)
	auditQueueOnce sync.Once
	auditDropped   atomic.Uint64
)

func StartAuditWriter(ctx context.Context) {
	auditQueueOnce.Do(func() {
		go func() {
			for {
				select {
				case item := <-auditQueue:
					AppendAuditRecord(item.app, item.rec)
				case <-ctx.Done():
					for {
						select {
						case item := <-auditQueue:
							AppendAuditRecord(item.app, item.rec)
						default:
							return
						}
					}
				}
			}
		}()
	})
}

func EnqueueAuditRecord(app *ServerApp, rec AuditRecord) {
	select {
	case auditQueue <- queuedAuditRecord{app: app, rec: rec}:
	default:
		if dropped := auditDropped.Add(1); dropped == 1 || dropped%100 == 0 {
			log.Printf("audit queue full: dropped=%d", dropped)
		}
	}
}

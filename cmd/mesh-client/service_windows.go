//go:build windows

package main

import (
	"context"
	"time"

	"github.com/abcdocker/labplane/internal/meshclient"
	"golang.org/x/sys/windows/svc"
)

type meshService struct{}

func (meshService) Execute(_ []string, requests <-chan svc.ChangeRequest, statuses chan<- svc.Status) (bool, uint32) {
	statuses <- svc.Status{State: svc.StartPending}
	cfg, err := meshclient.LoadConfig(configPath())
	if err != nil {
		return false, 1
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go meshclient.Run(ctx, cfg)
	statuses <- svc.Status{State: svc.Running, Accepts: svc.AcceptStop | svc.AcceptShutdown}
	for {
		select {
		case r := <-requests:
			if r.Cmd == svc.Stop || r.Cmd == svc.Shutdown {
				statuses <- svc.Status{State: svc.StopPending}
				cancel()
				time.Sleep(100 * time.Millisecond)
				return false, 0
			}
		case <-ctx.Done():
			return false, 0
		}
	}
}

func runService(ctx context.Context) error {
	isSvc, err := svc.IsWindowsService()
	if err != nil {
		return err
	}
	if isSvc {
		return svc.Run("LabPlaneMesh", meshService{})
	}
	cfg, err := meshclient.LoadConfig(configPath())
	if err != nil {
		return err
	}
	return meshclient.Run(ctx, cfg)
}

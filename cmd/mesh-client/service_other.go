//go:build !windows

package main

import (
	"context"

	"github.com/abcdocker/labplane/internal/meshclient"
)

func runService(ctx context.Context) error {
	cfg, err := meshclient.LoadConfig(configPath())
	if err != nil {
		return err
	}
	return meshclient.Run(ctx, cfg)
}

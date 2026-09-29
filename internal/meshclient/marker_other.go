//go:build !windows

package meshclient

import "errors"

func ReadDesktopMarker() DesktopMarker { return DesktopMarker{} }

func BeginDesktopInstall(Config) error { return errors.New("desktop marker is only used on Windows") }

func WriteDesktopMarker(Config) error { return errors.New("desktop marker is only used on Windows") }

//go:build windows

package meshclient

import (
	"net/url"

	"golang.org/x/sys/windows/registry"
)

const desktopMarkerKey = `SOFTWARE\LabPlaneMesh`

func ReadDesktopMarker() DesktopMarker {
	key, err := registry.OpenKey(registry.LOCAL_MACHINE, desktopMarkerKey, registry.QUERY_VALUE)
	if err != nil {
		return DesktopMarker{}
	}
	defer key.Close()
	complete, _, _ := key.GetIntegerValue("Complete")
	platform, _, err := key.GetStringValue("PlatformURL")
	if err != nil {
		return DesktopMarker{}
	}
	u, err := url.Parse(platform)
	if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil {
		return DesktopMarker{}
	}
	hostname, _, _ := key.GetStringValue("Hostname")
	return DesktopMarker{Present: true, Complete: complete == 1, Platform: platform, Hostname: hostname}
}

func BeginDesktopInstall(cfg Config) error { return writeDesktopMarker(cfg, false) }

func WriteDesktopMarker(cfg Config) error { return writeDesktopMarker(cfg, true) }

func writeDesktopMarker(cfg Config, complete bool) error {
	if err := ValidateConfig(cfg); err != nil {
		return err
	}
	key, _, err := registry.CreateKey(registry.LOCAL_MACHINE, desktopMarkerKey, registry.SET_VALUE)
	if err != nil {
		return err
	}
	defer key.Close()
	if err := key.SetStringValue("PlatformURL", cfg.Platform); err != nil {
		return err
	}
	if err := key.SetStringValue("Hostname", cfg.Hostname); err != nil {
		return err
	}
	value := uint32(0)
	if complete {
		value = 1
	}
	return key.SetDWordValue("Complete", value)
}

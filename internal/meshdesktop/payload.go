package meshdesktop

import (
	"archive/zip"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

const maxPayloadFile = 250 << 20

// PackWindowsExecutable appends a ZIP payload to a Windows GUI executable.
// PE loaders ignore the overlay; archive/zip can still locate the ZIP footer.
func PackWindowsExecutable(template, agent, msi, output string) error {
	dir := filepath.Dir(output)
	if err := os.MkdirAll(dir, 0750); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".mesh-desktop-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	defer tmp.Close()
	base, err := os.Open(template)
	if err != nil {
		return err
	}
	n, err := io.Copy(tmp, base)
	base.Close()
	if err != nil {
		return err
	}
	zw := zip.NewWriter(tmp)
	zw.SetOffset(n)
	for name, source := range map[string]string{"labplane-mesh-client.exe": agent, "tailscale.msi": msi} {
		f, err := os.Open(source)
		if err != nil {
			zw.Close()
			return err
		}
		info, err := f.Stat()
		if err != nil || !info.Mode().IsRegular() || info.Size() > maxPayloadFile {
			f.Close()
			zw.Close()
			return fmt.Errorf("invalid desktop asset %s", name)
		}
		hdr := &zip.FileHeader{Name: name, Method: zip.Store}
		hdr.SetMode(0600)
		w, err := zw.CreateHeader(hdr)
		if err == nil {
			_, err = io.Copy(w, f)
		}
		f.Close()
		if err != nil {
			zw.Close()
			return err
		}
	}
	if err := zw.Close(); err != nil {
		return err
	}
	if err := tmp.Chmod(0755); err != nil {
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), output)
}

// ExtractWindowsPayload extracts only the two fixed installer resources.
func ExtractWindowsPayload(executable, directory string) error {
	z, err := zip.OpenReader(executable)
	if err != nil {
		return err
	}
	defer z.Close()
	if err := os.MkdirAll(directory, 0700); err != nil {
		return err
	}
	found := map[string]bool{}
	for _, f := range z.File {
		if f.Name != "labplane-mesh-client.exe" && f.Name != "tailscale.msi" {
			return fmt.Errorf("unexpected desktop payload entry %q", f.Name)
		}
		if found[f.Name] || f.UncompressedSize64 > maxPayloadFile || !f.Mode().IsRegular() {
			return fmt.Errorf("invalid desktop payload entry %q", f.Name)
		}
		found[f.Name] = true
		in, err := f.Open()
		if err != nil {
			return err
		}
		mode := os.FileMode(0600)
		if f.Name == "labplane-mesh-client.exe" {
			mode = 0700
		}
		out, err := os.OpenFile(filepath.Join(directory, f.Name), os.O_CREATE|os.O_EXCL|os.O_WRONLY, mode)
		if err == nil {
			_, err = io.Copy(out, io.LimitReader(in, maxPayloadFile+1))
			closeErr := out.Close()
			if err == nil {
				err = closeErr
			}
		}
		in.Close()
		if err != nil {
			return err
		}
	}
	if !found["labplane-mesh-client.exe"] || !found["tailscale.msi"] {
		return errors.New("desktop payload is incomplete")
	}
	return nil
}

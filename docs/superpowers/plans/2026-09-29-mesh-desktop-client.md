# Mesh Desktop Client Implementation Plan

**Goal:** Deliver an interactive Windows `.exe` and macOS `.dmg` for installing and controlling the existing LabPlane Mesh agent.

**Architecture:** The platform issues a one-use, device-specific JSON enrollment file separately from reusable desktop installers. Native desktop windows import that file, invoke the bundled Go agent with OS privilege elevation, and display Tailscale status. The agent continues to own Headscale join, background reporting, and remote actions. Linux keeps its service ZIP.

**Tech stack:** Go 1.25, Win32 APIs, Objective-C AppKit, `clang`, `hdiutil`, React/Vite.

## Constraints

- Do not place device secrets in reusable `.exe` or `.dmg` assets.
- Keep `config.json` private, validate HTTPS endpoints, and delete temporary bootstrap copies after installation.
- Build Windows x64 and ARM64; build macOS Apple Silicon and Intel.
- Preserve the existing Linux service workflow.
- Do not expose the old script downloads in the UI or routes.

## Tasks

1. Add a desktop asset resolver and authenticated download endpoint. Test the OS/architecture mapping before implementing it.
2. Extend device issuance to return a one-use `.json` enrollment file for desktop targets. Keep ZIP issuance for Linux. Verify client record and Headscale key cleanup behavior.
3. Build the Windows Win32 GUI executable. Embed the Go agent and official Tailscale MSI in a self-extracting payload. Provide import, install, status, connect, and disconnect controls.
4. Build the macOS AppKit `.app` and package it as a `.dmg`. Bundle the Go agent and official Tailscale PKG. Provide the same controls with a native administrator authorization prompt.
5. Update the client management page to provide separate desktop application and enrollment downloads, with clear import/install guidance and no script links.
6. Build both desktop assets, run Go tests, frontend typecheck/build, inspect `.exe`/`.dmg` contents, and launch the macOS application for a manual smoke test.

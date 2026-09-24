# AI Inspection Infrastructure Domains Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-class vCenter, bastion, Headscale, and Authentik inspection domains with independent switches, runs, and report histories.

**Architecture:** Extend the existing inspection task and report model with a backward-compatible domain discriminator. Reuse the vCenter collectors and add focused deterministic collectors for bastion, Headscale, and Authentik; the platform run composes enabled domains while domain runs store focused reports.

**Tech Stack:** Go 1.25, Gin, PlatformKV, React 19, TypeScript, TanStack Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-22-ai-inspection-infrastructure-domains-design.md`

## Global Constraints

- Preserve existing KV keys and interpret reports without `domain` as `platform`.
- Never include passwords, API tokens, private keys, cookies, authorization headers, session content, or raw Authentik event context in reports or AI input.
- Keep all inspection mutations and report reads behind existing admin middleware.
- New UI must support dark mode and responsive layouts.
- Use deterministic rules for facts; the configured judge model may summarize only sanitized facts.

---

### Task 1: Domain-aware configuration, tasks, and reports

**Files:**
- Modify: `internal/ops_center_store.go`
- Modify: `internal/ops_center_handlers.go`
- Modify: `internal/ops_center_inspect.go`
- Create: `internal/ops_center_inspect_domain_test.go`

**Interfaces:**
- Produces: `normalizeInspectionDomain(string) string`, `InspectionReport.Domain`, request body `{domain}` and report filtering by `domain`.

- [ ] Write failing tests proving empty/unknown domains normalize safely, legacy reports are platform reports, and filtering happens before pagination.
- [ ] Run `go test ./internal -run 'TestInspectionDomain|TestFilterInspectReports'` and confirm failure for missing behavior.
- [ ] Add `InspectBastion`, `InspectHeadscale`, `InspectAuthentik`, report/task domain fields, domain validation, and filtering helpers.
- [ ] Route platform and focused requests through a domain-aware runner while preserving empty-body compatibility.
- [ ] Re-run the focused tests and `go test ./internal`.

### Task 2: Deterministic domain collectors

**Files:**
- Create: `internal/ops_center_inspect_infrastructure.go`
- Create: `internal/ops_center_inspect_infrastructure_test.go`
- Modify: `internal/ops_center_inspect.go`

**Interfaces:**
- Produces: `inspectCollectBastionSection`, `inspectCollectHeadscaleSection`, `inspectCollectAuthentikSection` returning sanitized `InspectionSection` values.
- Consumes: existing vCenter, Headscale, Authentik clients and bastion policy store.

- [ ] Write failing table tests for bastion policy findings, Headscale offline/expired/pending-route findings, and Authentik event classification/redaction.
- [ ] Run the focused tests and confirm they fail because the classifier helpers do not exist.
- [ ] Implement pure classifier/render helpers first, then thin I/O collectors with bounded contexts and per-instance error isolation.
- [ ] Add the new sections to platform runs only when enabled and to focused runs regardless of other domain switches.
- [ ] Verify focused tests and the complete internal package.

### Task 3: Configuration and execution UI

**Files:**
- Modify: `react/src/pages/ai-inspect/AiInspectHome.tsx`
- Create: `react/src/pages/ai-inspect/AiInspectHome.domains.test.tsx`

**Interfaces:**
- Consumes: `POST /api/ops/inspect/run` body `{domain}` and config booleans.
- Produces: responsive domain cards and links to domain report pages.

- [ ] Write a failing Vitest test that verifies the three new switches and that a Headscale run sends `{domain:"headscale"}`.
- [ ] Run the single test and confirm the expected controls are absent.
- [ ] Extend types/default merging, add switches, and render four domain cards with independent run actions and progress feedback.
- [ ] Re-run the focused test and existing AI inspection tests.

### Task 4: Independent report history pages

**Files:**
- Modify: `react/src/pages/ai-inspect/AiInspectReports.tsx`
- Modify: `react/src/pages/ai-inspect/InspectReportRich.tsx`
- Create: `react/src/pages/ai-inspect/AiInspectReports.domains.test.tsx`

**Interfaces:**
- Consumes: `GET /api/ops/inspect/reports?domain=<domain>&offset=<n>&limit=<n>` and `InspectionReport.domain`.

- [ ] Write a failing test for the four new navigation tabs and domain query construction.
- [ ] Run the focused test and verify it fails for the missing tabs.
- [ ] Add domain routes to the local tab parser and a reusable domain report list component; preserve the existing platform/K8s/Pod/workload pages.
- [ ] Display a domain badge in rich report headers and make legacy reports default to platform.
- [ ] Re-run focused and full frontend tests.

### Task 5: Verification and regression review

**Files:**
- Review only: all files changed in Tasks 1–4.

- [ ] Run `gofmt` on changed Go files.
- [ ] Run `go test ./internal`, `go vet ./...`, and `go build ./...`.
- [ ] Run `npm test`, `npm run typecheck`, and `npm run build` from `react/`.
- [ ] Inspect `git diff --check` and review the diff for secret leakage, unbounded network calls, old report compatibility, dark mode, and narrow-screen behavior.
- [ ] Start the local app through the repository run workflow and verify `http://localhost:8080` responds without replacing the user's existing unrelated changes.

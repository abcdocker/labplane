#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEST_TMP="$(mktemp -d "${TMPDIR:-/tmp}/labplane-run-test.XXXXXX")"
trap 'rm -rf "${TEST_TMP}"' EXIT

FAKE_BIN="${TEST_TMP}/bin"
DOCKER_LOG="${TEST_TMP}/docker.log"
mkdir -p "${FAKE_BIN}"

cat >"${FAKE_BIN}/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"${DOCKER_LOG:?}"
if [[ -n "${FAKE_DOCKER_FAIL_MATCH:-}" && "$*" == *"${FAKE_DOCKER_FAIL_MATCH}"* ]]; then
  exit 42
fi
EOF
chmod +x "${FAKE_BIN}/docker"

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

assert_line_count() {
  local EXPECTED="$1"
  local LINE="$2"
  local ACTUAL
  ACTUAL="$(grep -Fxc -- "${LINE}" "${DOCKER_LOG}" || true)"
  [[ "${ACTUAL}" == "${EXPECTED}" ]] || fail "expected ${EXPECTED} occurrence(s) of '${LINE}', got ${ACTUAL}"
}

assert_log_contains() {
  local TEXT="$1"
  grep -Fq -- "${TEXT}" "${DOCKER_LOG}" || fail "docker log does not contain '${TEXT}'"
}

run_case() {
  : >"${DOCKER_LOG}"
  PATH="${FAKE_BIN}:${PATH}" \
    DOCKER_LOG="${DOCKER_LOG}" \
    LABPLANE_IMAGE_TAG="v9.9.9-test" \
    KUBEBT_PROD_REGISTRY="registry.lan/homelab/labplane" \
    LABPLANE_PUBLIC_REGISTRY="ghcr.io/abcdocker/labplane" \
    bash "${ROOT}/run.sh" "$@" >/dev/null
}

run_case_with_env() {
  : >"${DOCKER_LOG}"
  PATH="${FAKE_BIN}:${PATH}" \
    DOCKER_LOG="${DOCKER_LOG}" \
    LABPLANE_IMAGE_TAG="v9.9.9-test" \
    LABPLANE_PROD_REGISTRY="registry.new/team/labplane" \
    KUBEBT_PROD_REGISTRY="registry.old/team/labplane" \
    LABPLANE_PUBLIC_REGISTRY="ghcr.io/abcdocker/labplane" \
    "$@"
}

# Existing local/private publishing remains the default and accepts the legacy
# environment variable used before the LabPlane rename.
run_case prod
assert_log_contains "buildx build"
assert_log_contains "-t registry.lan/homelab/labplane:v9.9.9-test"
assert_line_count 1 "push registry.lan/homelab/labplane:v9.9.9-test"
assert_line_count 0 "push ghcr.io/abcdocker/labplane:v9.9.9-test"

# Opting in to public publishing reuses the built image and pushes both refs.
run_case prod --public
assert_line_count 1 "push registry.lan/homelab/labplane:v9.9.9-test"
assert_line_count 1 "tag registry.lan/homelab/labplane:v9.9.9-test ghcr.io/abcdocker/labplane:v9.9.9-test"
assert_line_count 1 "push ghcr.io/abcdocker/labplane:v9.9.9-test"
assert_line_count 1 "buildx build --platform linux/amd64 -t registry.lan/homelab/labplane:v9.9.9-test --build-arg BUILD_VERSION=v9.9.9-test --build-arg BASE_NODE=node:20-alpine --build-arg BASE_GOLANG=golang:1.25.6-alpine --build-arg BASE_RUNTIME=gcr.io/distroless/static-debian12:nonroot --build-arg HTTP_PROXY= --build-arg HTTPS_PROXY= --build-arg NO_PROXY= --build-arg GOPROXY=https://proxy.golang.org,direct --load -f ${ROOT}/Dockerfile ${ROOT}"

# New LABPLANE_* settings take precedence over legacy values.
run_case_with_env bash "${ROOT}/run.sh" prod >/dev/null
assert_log_contains "-t registry.new/team/labplane:v9.9.9-test"
assert_line_count 0 "push registry.old/team/labplane:v9.9.9-test"

# prod-run supports dual publishing and starts from the private/prod reference.
run_case_with_env bash "${ROOT}/run.sh" prod-run --public >/dev/null
assert_line_count 1 "push registry.new/team/labplane:v9.9.9-test"
assert_line_count 1 "push ghcr.io/abcdocker/labplane:v9.9.9-test"
assert_log_contains "run -d --name labplane-dev --restart unless-stopped -p 8080:8080 -e TZ=Asia/Shanghai -v ${ROOT}/data:/app/data -e DASHBOARD_HTTP_ADDR=:8080 registry.new/team/labplane:v9.9.9-test"

# A failed production push must stop immediately: no public push and no run.
: >"${DOCKER_LOG}"
if PATH="${FAKE_BIN}:${PATH}" \
  DOCKER_LOG="${DOCKER_LOG}" \
  FAKE_DOCKER_FAIL_MATCH="push registry.new/team/labplane" \
  LABPLANE_IMAGE_TAG="v9.9.9-test" \
  LABPLANE_PROD_REGISTRY="registry.new/team/labplane" \
  LABPLANE_PUBLIC_REGISTRY="ghcr.io/abcdocker/labplane" \
  bash "${ROOT}/run.sh" prod-run --public >/dev/null 2>&1; then
  fail "prod-run --public succeeded after production push failure"
fi
assert_line_count 0 "push ghcr.io/abcdocker/labplane:v9.9.9-test"
assert_line_count 0 "run -d --name labplane-dev --restart unless-stopped -p 8080:8080 -e TZ=Asia/Shanghai -v ${ROOT}/data:/app/data -e DASHBOARD_HTTP_ADDR=:8080 registry.new/team/labplane:v9.9.9-test"

# A failed public push also prevents prod-run from starting a container.
: >"${DOCKER_LOG}"
if PATH="${FAKE_BIN}:${PATH}" \
  DOCKER_LOG="${DOCKER_LOG}" \
  FAKE_DOCKER_FAIL_MATCH="push ghcr.io/abcdocker/labplane" \
  LABPLANE_IMAGE_TAG="v9.9.9-test" \
  LABPLANE_PROD_REGISTRY="registry.new/team/labplane" \
  LABPLANE_PUBLIC_REGISTRY="ghcr.io/abcdocker/labplane" \
  bash "${ROOT}/run.sh" prod-run --public >/dev/null 2>&1; then
  fail "prod-run --public succeeded after public push failure"
fi
assert_line_count 0 "run -d --name labplane-dev --restart unless-stopped -p 8080:8080 -e TZ=Asia/Shanghai -v ${ROOT}/data:/app/data -e DASHBOARD_HTTP_ADDR=:8080 registry.new/team/labplane:v9.9.9-test"

# The interactive dual-publish option follows the same path.
: >"${DOCKER_LOG}"
printf '7\n' | PATH="${FAKE_BIN}:${PATH}" \
  DOCKER_LOG="${DOCKER_LOG}" \
  LABPLANE_IMAGE_TAG="v9.9.9-test" \
  LABPLANE_PROD_REGISTRY="registry.new/team/labplane" \
  LABPLANE_PUBLIC_REGISTRY="ghcr.io/abcdocker/labplane" \
  bash "${ROOT}/run.sh" >/dev/null
assert_line_count 1 "push registry.new/team/labplane:v9.9.9-test"
assert_line_count 1 "push ghcr.io/abcdocker/labplane:v9.9.9-test"

# If Prod is already the public repository, no duplicate tag or push occurs.
: >"${DOCKER_LOG}"
PATH="${FAKE_BIN}:${PATH}" \
  DOCKER_LOG="${DOCKER_LOG}" \
  LABPLANE_IMAGE_TAG="v9.9.9-test" \
  LABPLANE_PROD_REGISTRY="ghcr.io/abcdocker/labplane" \
  LABPLANE_PUBLIC_REGISTRY="ghcr.io/abcdocker/labplane" \
  bash "${ROOT}/run.sh" prod --public >/dev/null
assert_line_count 1 "push ghcr.io/abcdocker/labplane:v9.9.9-test"
assert_line_count 0 "tag ghcr.io/abcdocker/labplane:v9.9.9-test ghcr.io/abcdocker/labplane:v9.9.9-test"

# Extra arguments must be rejected before Docker is called.
: >"${DOCKER_LOG}"
if PATH="${FAKE_BIN}:${PATH}" DOCKER_LOG="${DOCKER_LOG}" \
  bash "${ROOT}/run.sh" prod --public typo >/dev/null 2>&1; then
  fail "prod accepted an unexpected third argument"
fi
[[ ! -s "${DOCKER_LOG}" ]] || fail "docker was called before argument validation"

printf 'PASS: run.sh registry publishing behavior\n'

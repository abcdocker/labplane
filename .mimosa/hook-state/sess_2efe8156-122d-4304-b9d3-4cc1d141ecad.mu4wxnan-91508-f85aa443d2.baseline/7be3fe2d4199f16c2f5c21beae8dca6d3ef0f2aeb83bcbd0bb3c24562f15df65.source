#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${PROJECT_DIR}/.env"

if [[ -e "${ENV_FILE}" ]]; then
  echo "Refusing to overwrite existing ${ENV_FILE}"
  exit 1
fi

random_hex() {
  local byte_count="$1"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "${byte_count}"
    return
  fi
  od -An -N "${byte_count}" -tx1 /dev/urandom | tr -d ' \n'
}

umask 077
{
  printf 'KUBEBT_PORT=18081\n'
  printf 'KUBEBT_BIND_ADDRESS=127.0.0.1\n'
  printf 'PLATFORM_PUBLIC_URL=http://127.0.0.1:18081\n'
  printf 'MYSQL_DATABASE=kube_bt_sync\n'
  printf 'MYSQL_USER=kube_bt_sync\n'
  printf 'MYSQL_ROOT_PASSWORD=%s\n' "$(random_hex 24)"
  printf 'MYSQL_PASSWORD=%s\n' "$(random_hex 24)"
  printf 'REDIS_PASSWORD=%s\n' "$(random_hex 24)"
  printf 'DASHBOARD_USER=admin\n'
  printf 'DASHBOARD_PASSWORD=%s\n' "$(random_hex 18)"
  printf 'DASHBOARD_SESSION_SECRET=%s\n' "$(random_hex 32)"
  printf 'KUBEBT_ENCRYPTION_KEY=%s\n' "$(random_hex 32)"
} >"${ENV_FILE}"

echo "Created ${ENV_FILE} with mode 0600-compatible permissions."
echo "Start the environment with: docker compose up -d --build"

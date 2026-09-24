#!/usr/bin/env bash
# labplane：交互式构建与发布脚本
set -euo pipefail
IFS=$'\n\t'

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# ------------------------------------------------------------------------------
# 默认公开镜像仓库；可通过环境变量覆盖为任意 OCI Registry。
# ------------------------------------------------------------------------------
REGISTRY_ROOT="${LABPLANE_REGISTRY_ROOT:-${KUBEBT_REGISTRY_ROOT:-ghcr.io/abcdocker}}"
DEV_REGISTRY="${LABPLANE_DEV_REGISTRY:-${KUBEBT_DEV_REGISTRY:-${REGISTRY_ROOT}/labplane-dev}}"
PROD_REGISTRY="${LABPLANE_PROD_REGISTRY:-${KUBEBT_PROD_REGISTRY:-${REGISTRY_ROOT}/labplane}}"
TEST_REGISTRY="${LABPLANE_TEST_REGISTRY:-${KUBEBT_TEST_REGISTRY:-${REGISTRY_ROOT}/labplane-test}}"
PUBLIC_REGISTRY="${LABPLANE_PUBLIC_REGISTRY:-ghcr.io/abcdocker/labplane}"

usage() {
  cat <<'EOF'
labplane — 构建与发布脚本

用法
  ./run.sh               交互式菜单（默认）
  ./run.sh local         本机原生架构快速构建并启动容器（适合日常开发）
  ./run.sh dev           同 local
  ./run.sh test          构建 linux/amd64 并推送到 Test 仓库
  ./run.sh prod          构建 linux/amd64 并推送到 Prod 仓库
  ./run.sh prod --public 在上述推送后，将同一镜像同时推送到公共仓库
  ./run.sh build         仅构建 linux/amd64 并加载到本地 Docker
  ./run.sh run           构建 linux/amd64 并在本地启动容器（不推送）
  ./run.sh prod-run      推送到 Prod 并在本地启动容器
  ./run.sh prod-run --public
                         推送到 Prod 和公共仓库，再使用 Prod 镜像本地启动
  ./run.sh -h / --help   显示本说明

环境变量（可选）
  LABPLANE_DEV_REGISTRY       Dev/Test 仓库路径（不含 tag）
                            默认：ghcr.io/abcdocker/labplane-dev
  LABPLANE_PROD_REGISTRY      Prod 仓库路径（不含 tag）
                            默认：ghcr.io/abcdocker/labplane
  LABPLANE_TEST_REGISTRY      Test 仓库路径（不含 tag）
                            默认：ghcr.io/abcdocker/labplane-test
  LABPLANE_PUBLIC_REGISTRY    --public 使用的公共仓库路径（不含 tag）
                            默认：ghcr.io/abcdocker/labplane
  LABPLANE_IMAGE_TAG          覆盖自动生成的镜像 Tag
  LABPLANE_LOCAL_IMAGE        local 模式下的本地镜像名（默认 labplane:local）
  LABPLANE_LOCAL_CONTAINER    容器名（默认 labplane-dev）
  LABPLANE_LOCAL_BIND_PORT    宿主机端口（默认 18081）

前置条件
  · 已安装并运行 Docker（含 buildx）。
  · 推送镜像前，请先登录目标 Registry，例如：docker login ghcr.io
  · 旧 KUBEBT_* 环境变量仍可用；同名 LABPLANE_* 变量优先。
  · 若存在 .env.test，本地运行时会作为 --env-file 注入容器。

数据目录
  项目下 data/ 会挂载到容器 /app/data。
EOF
}

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo ">>> 错误: 未找到 docker"
    exit 1
  fi
}

make_tag() {
  local SHORT_SHA
  SHORT_SHA="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo nogit)"
  echo "${LABPLANE_IMAGE_TAG:-${KUBEBT_IMAGE_TAG:-$(date +%Y%m%d-%H%M%S)-${SHORT_SHA}}}"
}

# 本机原生架构快速构建（适合 Mac 日常开发）
run_local_native() {
  require_docker

  local IMAGE="${LABPLANE_LOCAL_IMAGE:-${KUBEBT_LOCAL_IMAGE:-labplane:local}}"
  local CONTAINER="${LABPLANE_LOCAL_CONTAINER:-${KUBEBT_LOCAL_CONTAINER:-labplane-dev}}"
  local HOST_PORT="${LABPLANE_LOCAL_BIND_PORT:-${KUBEBT_LOCAL_BIND_PORT:-8080}}"

  mkdir -p "${ROOT}/data"

  # 先移除旧容器，避免它占用端口导致后续检测误判
  echo ">>> 停止并移除旧容器 ${CONTAINER}（若存在）…"
  docker rm -f "${CONTAINER}" 2>/dev/null || true
  sleep 0.5

  # 若未显式指定端口且 8080 仍被其他进程占用，自动切换并提示
  if [[ "${HOST_PORT}" == "8080" ]]; then
    if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:8080 -sTCP:LISTEN >/dev/null 2>&1; then
      echo ">>> 警告: 8080 已被其他进程占用，改用 18081"
      HOST_PORT=18081
    fi
  fi

  echo ">>> [本地开发] 本机原生架构快速构建…"
  docker build \
    --build-arg HTTP_PROXY="${HTTP_PROXY:-}" \
    --build-arg HTTPS_PROXY="${HTTPS_PROXY:-}" \
    --build-arg NO_PROXY="${NO_PROXY:-}" \
    --build-arg GOPROXY="${GOPROXY:-https://proxy.golang.org,direct}" \
    -t "${IMAGE}" -f "${ROOT}/Dockerfile" "${ROOT}"

  local run_args=(
    -d
    --name "${CONTAINER}"
    --restart unless-stopped
    -p "${HOST_PORT}:8080"
    -e TZ=Asia/Shanghai
    -v "${ROOT}/data:/app/data"
  )

  if [[ -f "${ROOT}/.env.test" ]]; then
    echo ">>> 注入: ${ROOT}/.env.test"
    run_args+=(--env-file "${ROOT}/.env.test")
  fi

  run_args+=(-e "DASHBOARD_HTTP_ADDR=:8080")

  docker run "${run_args[@]}" "${IMAGE}"

  echo ""
  echo ">>> 已启动 ${CONTAINER}  http://127.0.0.1:${HOST_PORT}/"
}

# 构建 linux/amd64 镜像并加载到本地（交叉构建，与生产一致）
build_amd64_image() {
  local REGISTRY="$1"
  local TAG
  TAG="$(make_tag)"
  local IMAGE_REF="${REGISTRY}:${TAG}"

  # 调用方通过命令替换获取 IMAGE_REF，因此构建日志必须走 stderr；
  # stdout 只保留最后一行镜像地址，避免 docker push 收到多行字符串。
  {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ">>> 构建目标: linux/amd64"
    echo ">>> 仓库:     ${REGISTRY}"
    echo ">>> Tag:      ${TAG}"
    echo ">>> 完整镜像: ${IMAGE_REF}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    if ! docker buildx build \
      --platform linux/amd64 \
      -t "${IMAGE_REF}" \
      --build-arg BUILD_VERSION="${TAG}" \
      --build-arg BASE_NODE="${BASE_NODE:-node:20-alpine}" \
      --build-arg BASE_GOLANG="${BASE_GOLANG:-golang:1.26-alpine}" \
      --build-arg BASE_RUNTIME="${BASE_RUNTIME:-gcr.io/distroless/static-debian12:nonroot}" \
      --build-arg HTTP_PROXY="${HTTP_PROXY:-}" \
      --build-arg HTTPS_PROXY="${HTTPS_PROXY:-}" \
      --build-arg NO_PROXY="${NO_PROXY:-}" \
      --build-arg GOPROXY="${GOPROXY:-https://proxy.golang.org,direct}" \
      --load \
      -f "${ROOT}/Dockerfile" \
      "${ROOT}"; then
      echo ""
      echo ">>> 构建失败，未生成镜像: ${IMAGE_REF}"
      return 1
    fi

    echo ""
    echo ">>> 构建完成，镜像已在本地: ${IMAGE_REF}"
    echo ""
  } >&2

  printf '%s\n' "${IMAGE_REF}"
}

# 推送镜像
push_image() {
  local IMAGE_REF="$1"
  local LABEL="$2"
  echo ""
  echo ">>> [${LABEL}] 推送到 Registry…"
  docker push "${IMAGE_REF}" || return $?
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ">>> [${LABEL}] 已推送 ${IMAGE_REF}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# 将已经构建并推送的镜像追加发布到公共仓库，不重复构建。
push_public_image() {
  local SOURCE_IMAGE_REF="$1"
  local TAG="${SOURCE_IMAGE_REF##*:}"
  local PUBLIC_IMAGE_REF="${PUBLIC_REGISTRY}:${TAG}"

  if [[ "${SOURCE_IMAGE_REF}" == "${PUBLIC_IMAGE_REF}" ]]; then
    echo ">>> [Public] 公共仓库与 Prod 仓库相同，无需重复推送"
    return 0
  fi

  echo ""
  echo ">>> [Public] 标记 ${PUBLIC_IMAGE_REF}…"
  docker tag "${SOURCE_IMAGE_REF}" "${PUBLIC_IMAGE_REF}" || return $?
  push_image "${PUBLIC_IMAGE_REF}" "Public" || return $?
}

publish_prod_image() {
  local PUSH_PUBLIC="${1:-false}"
  local IMAGE_REF
  IMAGE_REF="$(build_amd64_image "${PROD_REGISTRY}")" || return $?
  push_image "${IMAGE_REF}" "Prod" >&2 || return $?

  if [[ "${PUSH_PUBLIC}" == "true" ]]; then
    push_public_image "${IMAGE_REF}" >&2 || return $?
  fi

  printf '%s\n' "${IMAGE_REF}"
}

# 使用指定镜像启动本地容器
run_container_from_image() {
  local IMAGE="$1"
  local CONTAINER="${LABPLANE_LOCAL_CONTAINER:-${KUBEBT_LOCAL_CONTAINER:-labplane-dev}}"
  local HOST_PORT="${LABPLANE_LOCAL_BIND_PORT:-${KUBEBT_LOCAL_BIND_PORT:-8080}}"

  mkdir -p "${ROOT}/data"

  # 先移除旧容器，避免它占用端口导致后续检测误判
  echo ">>> 停止并移除旧容器 ${CONTAINER}（若存在）…"
  docker rm -f "${CONTAINER}" 2>/dev/null || true
  sleep 0.5

  # 若未显式指定端口且 8080 仍被其他进程占用，自动切换并提示
  if [[ "${HOST_PORT}" == "8080" ]]; then
    if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:8080 -sTCP:LISTEN >/dev/null 2>&1; then
      echo ">>> 警告: 8080 已被其他进程占用，改用 18081"
      HOST_PORT=18081
    fi
  fi

  local run_args=(
    -d
    --name "${CONTAINER}"
    --restart unless-stopped
    -p "${HOST_PORT}:8080"
    -e TZ=Asia/Shanghai
    -v "${ROOT}/data:/app/data"
  )

  if [[ -f "${ROOT}/.env.test" ]]; then
    echo ">>> 注入: ${ROOT}/.env.test"
    run_args+=(--env-file "${ROOT}/.env.test")
  fi

  run_args+=(-e "DASHBOARD_HTTP_ADDR=:8080")

  echo ">>> 启动容器 ${CONTAINER}…"
  docker run "${run_args[@]}" "${IMAGE}"

  echo ""
  echo ">>> 本地访问: http://127.0.0.1:${HOST_PORT}/"
}

# 交互式菜单
show_menu() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  labplane 构建与发布"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "  1) 本地开发  — 本机原生架构快速构建+启动（最快，适合日常调试）"
  echo "  2) 仅打包    — 构建 linux/amd64 加载到本地（不推送）"
  echo "  3) 打包运行  — 构建 linux/amd64 并在本地启动容器"
  echo "  4) 测试推送  — 构建并推送到 Test 仓库"
  echo "  5) 生产推送  — 构建并推送到 Prod 仓库"
  echo "  6) 生产运行  — 推送到 Prod 并在本地启动容器"
  echo "  7) 双仓发布  — 推送到 Prod，并将同一 Tag 推送到公共仓库"
  echo ""
  echo "  h) 帮助"
  echo "  q) 退出"
  echo ""
}

interactive_menu() {
  while true; do
    show_menu
    local choice=""
    read -r -p "请选择 [1-7/h/q]: " choice || true
    choice="$(echo "${choice}" | tr -d '[:space:]')"

    case "${choice}" in
      1)
        run_local_native
        break
        ;;
      2)
        require_docker
        build_amd64_image "${DEV_REGISTRY}" >/dev/null
        break
        ;;
      3)
        require_docker
        local IMAGE_REF
        IMAGE_REF="$(build_amd64_image "${DEV_REGISTRY}")"
        run_container_from_image "${IMAGE_REF}"
        break
        ;;
      4)
        require_docker
        local IMAGE_REF
        IMAGE_REF="$(build_amd64_image "${TEST_REGISTRY}")"
        push_image "${IMAGE_REF}" "Test"
        break
        ;;
      5)
        require_docker
        publish_prod_image false >/dev/null
        break
        ;;
      6)
        require_docker
        local IMAGE_REF
        IMAGE_REF="$(publish_prod_image false)"
        run_container_from_image "${IMAGE_REF}"
        break
        ;;
      7)
        require_docker
        publish_prod_image true >/dev/null
        break
        ;;
      h|H|help|-h|--help)
        usage
        ;;
      q|Q|quit|exit|"")
        echo ">>> 已取消"
        exit 0
        ;;
      *)
        echo ">>> 无效输入: ${choice}"
        ;;
    esac
  done
}

# ------------------------------------------------------------------------------
# 入口
# ------------------------------------------------------------------------------
case "${1:-}" in
  "")
    interactive_menu
    ;;
  local|dev)
    run_local_native
    ;;
  test)
    require_docker
    IMAGE_REF="$(build_amd64_image "${TEST_REGISTRY}")"
    push_image "${IMAGE_REF}" "Test"
    ;;
  prod)
    if (( $# > 2 )); then echo ">>> 参数过多" >&2; usage; exit 1; fi
    case "${2:-}" in
      "") require_docker; publish_prod_image false >/dev/null ;;
      --public) require_docker; publish_prod_image true >/dev/null ;;
      *) echo ">>> 未知参数: ${2}" >&2; usage; exit 1 ;;
    esac
    ;;
  build)
    require_docker
    build_amd64_image "${DEV_REGISTRY}" >/dev/null
    ;;
  run)
    require_docker
    IMAGE_REF="$(build_amd64_image "${DEV_REGISTRY}")"
    run_container_from_image "${IMAGE_REF}"
    ;;
  prod-run)
    if (( $# > 2 )); then echo ">>> 参数过多" >&2; usage; exit 1; fi
    case "${2:-}" in
      "") require_docker; IMAGE_REF="$(publish_prod_image false)" || exit $? ;;
      --public) require_docker; IMAGE_REF="$(publish_prod_image true)" || exit $? ;;
      *) echo ">>> 未知参数: ${2}" >&2; usage; exit 1 ;;
    esac
    run_container_from_image "${IMAGE_REF}"
    ;;
  help|-h|--help)
    usage
    exit 0
    ;;
  *)
    echo ">>> 未知命令: $1"
    usage
    exit 1
    ;;
esac

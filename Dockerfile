# ------------------------------------------------------------------------------
# 构建参数
# ------------------------------------------------------------------------------
ARG BASE_NODE=node:20-alpine
ARG BASE_GOLANG=golang:1.26-alpine
ARG BASE_RUNTIME=gcr.io/distroless/static-debian12:nonroot

# ------------------------------------------------------------------------------
# 阶段 1：构建 React 前端
# ------------------------------------------------------------------------------
FROM ${BASE_NODE} AS frontend
WORKDIR /app
COPY react/package.json react/package-lock.json ./
# 勿在 npm ci 前设 NODE_ENV=production，否则 devDependencies（含 Vite）不会被安装
RUN npm ci
COPY react/ ./
# 大型前端依赖图在 Node 默认约 2 GiB 堆上可能构建失败；为本地与 CI 容器显式预留空间。
ENV NODE_ENV=production NODE_OPTIONS=--max-old-space-size=4096
RUN npm run build

# ------------------------------------------------------------------------------
# 阶段 2：编译 Go 静态二进制
# ------------------------------------------------------------------------------
FROM ${BASE_GOLANG} AS builder
ENV CGO_ENABLED=0 GOOS=linux GOTOOLCHAIN=local
ARG TARGETARCH=amd64
ARG TARGETOS=linux
# 国内构建时可覆盖：--build-arg GOPROXY=https://goproxy.cn,direct
ARG GOPROXY=https://proxy.golang.org,direct
ENV GOPROXY=${GOPROXY}
# 若宿主机代理指向 127.0.0.1，构建容器内无法访问，需显式置空
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY
ENV HTTP_PROXY=${HTTP_PROXY} HTTPS_PROXY=${HTTPS_PROXY} NO_PROXY=${NO_PROXY}
# 仅用于把时区数据拷入最终镜像（Asia/Shanghai 等）
RUN apk add --no-cache tzdata
WORKDIR /build
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend /app/dist ./react/dist
ARG BUILD_VERSION=dev
RUN GOARCH=${TARGETARCH} GOOS=${TARGETOS} go build -trimpath \
    -ldflags="-s -w -X github.com/abcdocker/labplane/internal.BuildVersion=${BUILD_VERSION}" \
    -o labplane . && mkdir -p /build/runtime-data

# ------------------------------------------------------------------------------
# 阶段 3：最小运行时镜像（无 shell、无包管理器，攻击面小）
# ------------------------------------------------------------------------------
FROM ${BASE_RUNTIME}
WORKDIR /app
ENV TZ=Asia/Shanghai
# 供 Go time.LoadLocation 使用（日志/展示本地时区）
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo
COPY --from=builder /build/labplane /app/labplane
COPY --from=builder /build/react/dist /app/react/dist
COPY --from=builder --chown=nonroot:nonroot /build/runtime-data /app/data
COPY templates /app/templates/
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/app/labplane"]

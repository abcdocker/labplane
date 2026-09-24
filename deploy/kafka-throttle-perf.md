# Kafka 限速压测操作手册

> **适用范围**：任意 Kafka 集群（含 labplane 平台部署）；所有操作仅使用 Kafka 原生工具（`kafka-configs.sh` / `kafka-producer-perf-test.sh` / `kafka-consumer-perf-test.sh`），不依赖任何平台 API。
>
> **支持环境**：Linux 主机直接运行 / Kubernetes Pod exec 进入运行 / Kubernetes Job 自动运行。
>
> **认证要求**：集群开启 SASL 后，所有客户端（包括 kafka-configs.sh）均须携带 SASL 凭据。

---

## 目录

1. [变量配置（两种方式）](#一变量配置两种方式)
2. [生成客户端认证配置文件](#二生成客户端认证配置文件)
3. [Linux 主机运行](#三linux-主机运行)
4. [Kubernetes 运行](#四kubernetes-运行)
   - 4.1 [交互式测试 Pod（exec 进入）](#41-交互式测试-pod)
   - 4.2 [自动化压测 Job](#42-自动化压测-job)
5. [限速操作（Kafka 原生命令）](#五限速操作kafka-原生命令)
   - 5.1 [用户级限速（生产者 / 消费者）](#51-用户级限速生产者--消费者)
   - 5.2 [Topic 复制限速](#52-topic-复制限速)
6. [压测执行流程](#六压测执行流程)
7. [结果判读与验证](#七结果判读与验证)
8. [解除限速](#八解除限速)
9. [清理压测资源](#九清理压测资源)

---

## 一、变量配置（两种方式）

### 方式 A：临时环境变量（Shell 会话有效）

```bash
# ── Kafka 连接 ──────────────────────────────────────────────
export BOOTSTRAP="kafka-demo-kafka-hl.kafka-demo.svc.cluster.local:9092"
#   集群外访问时改为 NodePort 地址，如: 192.168.1.100:30092

# ── SASL 认证 ─────────────────────────────────────────────────
export SASL_USER="admin"
export SASL_PASS="yourpassword"
export SASL_MECH="SCRAM-SHA-512"   # 或 PLAIN

# ── 压测参数 ──────────────────────────────────────────────────
export PERF_TOPIC="perf-throttle-test"   # 压测 Topic 名
export RECORD_SIZE=1024                  # 单条消息字节数
export RECORD_COUNT=3000000              # 压测消息总条数
export PARTITIONS=3                      # 创建 Topic 时的分区数
export REPLICATION=3                     # 创建 Topic 时的副本数

# ── 限速值（bytes/sec；-1 = 不限速，仅用于提示，实际通过命令设置）──
export PRODUCER_LIMIT=10485760   # 10 MB/s
export CONSUMER_LIMIT=5242880    #  5 MB/s
export REPL_LIMIT=1048576        #  1 MB/s（复制限速）
```

---

### 方式 B：配置文件（持久化，推荐生产验证）

将以下内容保存为 `~/kafka-perf-env.sh`：

```bash
#!/usr/bin/env bash
# Kafka 限速压测环境配置文件
# 使用: source ~/kafka-perf-env.sh

BOOTSTRAP="kafka-demo-kafka-hl.kafka-demo.svc.cluster.local:9092"
SASL_USER="admin"
SASL_PASS="yourpassword"
SASL_MECH="SCRAM-SHA-512"   # SCRAM-SHA-512 | SCRAM-SHA-256 | PLAIN

PERF_TOPIC="perf-throttle-test"
RECORD_SIZE=1024
RECORD_COUNT=3000000
PARTITIONS=3
REPLICATION=3

PRODUCER_LIMIT=10485760
CONSUMER_LIMIT=5242880
REPL_LIMIT=1048576

# ── 以下自动导出，无需修改 ─────────────────────────────────────
export BOOTSTRAP SASL_USER SASL_PASS SASL_MECH
export PERF_TOPIC RECORD_SIZE RECORD_COUNT PARTITIONS REPLICATION
export PRODUCER_LIMIT CONSUMER_LIMIT REPL_LIMIT
```

加载配置：

```bash
source ~/kafka-perf-env.sh
```

---

## 二、生成客户端认证配置文件

**所有 Kafka 工具** 均通过 `--command-config`（或 `--consumer.config` / `--producer.config`）指向此文件完成 SASL 认证。执行以下命令自动生成：

```bash
# 脚本根据 SASL_MECH 自动选择对应的 LoginModule
gen_client_props() {
  local mech="${SASL_MECH:-SCRAM-SHA-512}"
  local module
  case "${mech}" in
    PLAIN)
      module="org.apache.kafka.common.security.plain.PlainLoginModule"
      ;;
    SCRAM-SHA-256)
      module="org.apache.kafka.common.security.scram.ScramLoginModule"
      ;;
    SCRAM-SHA-512|*)
      module="org.apache.kafka.common.security.scram.ScramLoginModule"
      ;;
  esac

  cat > /tmp/client.properties <<EOF
bootstrap.servers=${BOOTSTRAP}
security.protocol=SASL_PLAINTEXT
sasl.mechanism=${mech}
sasl.jaas.config=${module} required \
  username="${SASL_USER}" \
  password="${SASL_PASS}";
EOF
  echo "[OK] /tmp/client.properties 已生成 (mechanism=${mech})"
}

gen_client_props
```

> **生产 / 消费 properties 复用同一文件**；如需单独文件：
> ```bash
> cp /tmp/client.properties /tmp/producer.properties
> cp /tmp/client.properties /tmp/consumer.properties
> # consumer 可额外追加 group.id
> echo "group.id=perf-consumer-group" >> /tmp/consumer.properties
> ```

---

## 三、Linux 主机运行

### 3.1 安装 Kafka 客户端工具

```bash
# 推荐版本与集群保持一致（此处以 3.7.1 为例）
KAFKA_VERSION="3.7.1"
SCALA_VERSION="2.13"
KAFKA_TARBALL="kafka_${SCALA_VERSION}-${KAFKA_VERSION}.tgz"

# 有公网访问：
wget "https://downloads.apache.org/kafka/${KAFKA_VERSION}/${KAFKA_TARBALL}"

# 无公网（内网）：从已运行的 Kafka Pod 中复制工具包
# kubectl cp <ns>/<kafka-pod>:/opt/bitnami/kafka /tmp/kafka-tools
# KAFKA_HOME=/tmp/kafka-tools

tar -xzf "${KAFKA_TARBALL}"
export KAFKA_HOME="${PWD}/kafka_${SCALA_VERSION}-${KAFKA_VERSION}"
export PATH="${KAFKA_HOME}/bin:${PATH}"

# 验证
kafka-topics.sh --version
```

### 3.2 加载配置并生成 client.properties

```bash
source ~/kafka-perf-env.sh   # 方式 B
# 或直接粘贴方式 A 的 export 命令

gen_client_props   # 见第二节
```

### 3.3 创建压测 Topic

```bash
kafka-topics.sh \
  --bootstrap-server "${BOOTSTRAP}" \
  --command-config /tmp/client.properties \
  --create \
  --if-not-exists \
  --topic "${PERF_TOPIC}" \
  --partitions "${PARTITIONS}" \
  --replication-factor "${REPLICATION}"

# 确认创建
kafka-topics.sh \
  --bootstrap-server "${BOOTSTRAP}" \
  --command-config /tmp/client.properties \
  --describe \
  --topic "${PERF_TOPIC}"
```

### 3.4 基准生产压测（无限速）

```bash
echo "=== 基准生产压测（不限速）==="
kafka-producer-perf-test.sh \
  --topic "${PERF_TOPIC}" \
  --num-records "${RECORD_COUNT}" \
  --record-size "${RECORD_SIZE}" \
  --throughput -1 \
  --producer.config /tmp/client.properties

# 记录输出末行的 MB/sec 值 → 作为基准吞吐量
```

### 3.5 基准消费压测（无限速）

```bash
echo "=== 基准消费压测（不限速）==="
kafka-consumer-perf-test.sh \
  --bootstrap-server "${BOOTSTRAP}" \
  --topic "${PERF_TOPIC}" \
  --messages "${RECORD_COUNT}" \
  --consumer.config /tmp/client.properties \
  --group perf-baseline-group \
  --from-latest

# 记录输出的 MB/sec 值 → 作为消费基准吞吐量
```

---

## 四、Kubernetes 运行

### 4.1 交互式测试 Pod

将以下 YAML 保存并 apply，然后 `kubectl exec` 进入手动执行所有命令。

```yaml
# 文件：kafka-perf-pod.yaml
# 用法：
#   kubectl apply -f kafka-perf-pod.yaml -n <namespace>
#   kubectl exec -it kafka-perf-shell -n <namespace> -- bash
apiVersion: v1
kind: Pod
metadata:
  name: kafka-perf-shell
  # namespace: kafka-demo        ← 替换为实际命名空间
  labels:
    app: kafka-throttle-perf
spec:
  restartPolicy: Never
  containers:
    - name: shell
      # 使用与 Kafka 集群相同版本的镜像；内网 Harbor 替换路径
      image: docker.io/bitnamilegacy/kafka:3.7.1
      command: ["sleep", "infinity"]
      env:
        # ── 按实际情况修改以下变量 ──────────────────────────
        - name: BOOTSTRAP
          value: "kafka-demo-kafka-hl.kafka-demo.svc.cluster.local:9092"
        - name: SASL_USER
          value: "admin"
        - name: SASL_PASS
          value: "yourpassword"
        - name: SASL_MECH
          value: "SCRAM-SHA-512"
        - name: PERF_TOPIC
          value: "perf-throttle-test"
        - name: RECORD_SIZE
          value: "1024"
        - name: RECORD_COUNT
          value: "3000000"
        - name: PARTITIONS
          value: "3"
        - name: REPLICATION
          value: "3"
        - name: PRODUCER_LIMIT
          value: "10485760"
        - name: CONSUMER_LIMIT
          value: "5242880"
        - name: REPL_LIMIT
          value: "1048576"
      resources:
        requests:
          cpu: "500m"
          memory: "256Mi"
        limits:
          cpu: "2"
          memory: "512Mi"
```

**apply 并进入 Pod：**

```bash
kubectl apply -f kafka-perf-pod.yaml -n kafka-demo
kubectl wait pod/kafka-perf-shell -n kafka-demo \
  --for=condition=Ready --timeout=60s

kubectl exec -it kafka-perf-shell -n kafka-demo -- bash
```

**进入 Pod 后，先执行以下初始化（生成 client.properties）：**

```bash
# Pod 内执行
gen_client_props() {
  local mech="${SASL_MECH:-SCRAM-SHA-512}"
  local module
  case "${mech}" in
    PLAIN)        module="org.apache.kafka.common.security.plain.PlainLoginModule" ;;
    SCRAM-SHA-256) module="org.apache.kafka.common.security.scram.ScramLoginModule" ;;
    *)            module="org.apache.kafka.common.security.scram.ScramLoginModule" ;;
  esac
  cat > /tmp/client.properties <<EOF
bootstrap.servers=${BOOTSTRAP}
security.protocol=SASL_PLAINTEXT
sasl.mechanism=${mech}
sasl.jaas.config=${module} required username="${SASL_USER}" password="${SASL_PASS}";
EOF
  echo "[OK] /tmp/client.properties 生成完成"
}
gen_client_props
```

之后在 Pod 内执行第五节、第六节的所有命令即可。

---

### 4.2 自动化压测 Job

将以下 YAML 整体 apply；**每个 Job 之间按顺序等待上一个完成后再运行**。

> **使用前修改**：将 YAML 开头的 ConfigMap 中所有变量值替换为实际值，其余 Job 无需修改。

```yaml
# 文件名：kafka-throttle-jobs.yaml
# apply:  kubectl apply -f kafka-throttle-jobs.yaml -n <namespace>
---
# ── 公共配置：所有 Job 从此 ConfigMap 读取认证信息 ──────────────
apiVersion: v1
kind: ConfigMap
metadata:
  name: kafka-perf-cfg
  # namespace: kafka-demo
  labels:
    app: kafka-throttle-perf
data:
  BOOTSTRAP: "kafka-demo-kafka-hl.kafka-demo.svc.cluster.local:9092"
  SASL_USER: "admin"
  SASL_PASS: "yourpassword"
  SASL_MECH: "SCRAM-SHA-512"
  PERF_TOPIC: "perf-throttle-test"
  RECORD_SIZE: "1024"
  RECORD_COUNT: "3000000"
  PARTITIONS: "3"
  REPLICATION: "3"
  PRODUCER_LIMIT: "10485760"
  CONSUMER_LIMIT: "5242880"
  REPL_LIMIT: "1048576"
  # ── 初始化脚本：所有 Job 共用 ────────────────────────────────
  init.sh: |
    #!/usr/bin/env bash
    set -e
    MECH="${SASL_MECH:-SCRAM-SHA-512}"
    case "${MECH}" in
      PLAIN)        MODULE="org.apache.kafka.common.security.plain.PlainLoginModule" ;;
      SCRAM-SHA-256) MODULE="org.apache.kafka.common.security.scram.ScramLoginModule" ;;
      *)            MODULE="org.apache.kafka.common.security.scram.ScramLoginModule" ;;
    esac
    cat > /tmp/client.properties <<EOF
    bootstrap.servers=${BOOTSTRAP}
    security.protocol=SASL_PLAINTEXT
    sasl.mechanism=${MECH}
    sasl.jaas.config=${MODULE} required username="${SASL_USER}" password="${SASL_PASS}";
    EOF
    cp /tmp/client.properties /tmp/producer.properties
    cp /tmp/client.properties /tmp/consumer.properties
    echo "group.id=perf-consumer-throttle-group" >> /tmp/consumer.properties
    echo "[init] client.properties 已生成"

---
# ── Job 1：创建压测 Topic ────────────────────────────────────
apiVersion: batch/v1
kind: Job
metadata:
  name: kafka-perf-01-create-topic
  labels:
    app: kafka-throttle-perf
spec:
  ttlSecondsAfterFinished: 600
  template:
    metadata:
      labels:
        app: kafka-throttle-perf
    spec:
      restartPolicy: Never
      volumes:
        - name: cfg
          configMap:
            name: kafka-perf-cfg
            defaultMode: 0755
      containers:
        - name: job
          image: docker.io/bitnamilegacy/kafka:3.7.1
          envFrom:
            - configMapRef:
                name: kafka-perf-cfg
          command: ["/bin/bash", "-c"]
          args:
            - |
              source /cfg/init.sh
              kafka-topics.sh \
                --bootstrap-server "${BOOTSTRAP}" \
                --command-config /tmp/client.properties \
                --create --if-not-exists \
                --topic "${PERF_TOPIC}" \
                --partitions "${PARTITIONS}" \
                --replication-factor "${REPLICATION}"
              echo "--- Topic 详情 ---"
              kafka-topics.sh \
                --bootstrap-server "${BOOTSTRAP}" \
                --command-config /tmp/client.properties \
                --describe \
                --topic "${PERF_TOPIC}"
          volumeMounts:
            - name: cfg
              mountPath: /cfg

---
# ── Job 2：生产者基准压测（无限速）────────────────────────────
apiVersion: batch/v1
kind: Job
metadata:
  name: kafka-perf-02-producer-baseline
  labels:
    app: kafka-throttle-perf
spec:
  ttlSecondsAfterFinished: 600
  template:
    metadata:
      labels:
        app: kafka-throttle-perf
    spec:
      restartPolicy: Never
      volumes:
        - name: cfg
          configMap:
            name: kafka-perf-cfg
            defaultMode: 0755
      containers:
        - name: job
          image: docker.io/bitnamilegacy/kafka:3.7.1
          envFrom:
            - configMapRef:
                name: kafka-perf-cfg
          command: ["/bin/bash", "-c"]
          args:
            - |
              source /cfg/init.sh
              echo "=== 生产者基准压测（无限速）==="
              kafka-producer-perf-test.sh \
                --topic "${PERF_TOPIC}" \
                --num-records "${RECORD_COUNT}" \
                --record-size "${RECORD_SIZE}" \
                --throughput -1 \
                --producer.config /tmp/producer.properties
              echo "=== 记录上方 MB/sec 作为生产基准值 ==="
          volumeMounts:
            - name: cfg
              mountPath: /cfg
          resources:
            requests: { cpu: "500m", memory: "256Mi" }
            limits:   { cpu: "2",    memory: "512Mi" }

---
# ── Job 3：消费者基准压测（无限速）────────────────────────────
apiVersion: batch/v1
kind: Job
metadata:
  name: kafka-perf-03-consumer-baseline
  labels:
    app: kafka-throttle-perf
spec:
  ttlSecondsAfterFinished: 600
  template:
    metadata:
      labels:
        app: kafka-throttle-perf
    spec:
      restartPolicy: Never
      volumes:
        - name: cfg
          configMap:
            name: kafka-perf-cfg
            defaultMode: 0755
      containers:
        - name: job
          image: docker.io/bitnamilegacy/kafka:3.7.1
          envFrom:
            - configMapRef:
                name: kafka-perf-cfg
          command: ["/bin/bash", "-c"]
          args:
            - |
              source /cfg/init.sh
              echo "=== 消费者基准压测（无限速）==="
              kafka-consumer-perf-test.sh \
                --bootstrap-server "${BOOTSTRAP}" \
                --topic "${PERF_TOPIC}" \
                --messages "${RECORD_COUNT}" \
                --consumer.config /tmp/consumer.properties \
                --group perf-baseline-group \
                --from-latest
              echo "=== 记录上方 MB/sec 作为消费基准值 ==="
          volumeMounts:
            - name: cfg
              mountPath: /cfg
          resources:
            requests: { cpu: "500m", memory: "256Mi" }
            limits:   { cpu: "2",    memory: "512Mi" }

---
# ── Job 4：设置用户级限速（生产者 + 消费者）────────────────────
# 此 Job 使用 kafka-configs.sh 原生命令写入限速，无需平台 API
apiVersion: batch/v1
kind: Job
metadata:
  name: kafka-perf-04-set-client-quota
  labels:
    app: kafka-throttle-perf
spec:
  ttlSecondsAfterFinished: 600
  template:
    metadata:
      labels:
        app: kafka-throttle-perf
    spec:
      restartPolicy: Never
      volumes:
        - name: cfg
          configMap:
            name: kafka-perf-cfg
            defaultMode: 0755
      containers:
        - name: job
          image: docker.io/bitnamilegacy/kafka:3.7.1
          envFrom:
            - configMapRef:
                name: kafka-perf-cfg
          command: ["/bin/bash", "-c"]
          args:
            - |
              source /cfg/init.sh
              echo "=== 设置用户 ${SASL_USER} 限速 ==="
              echo "  生产者上限: ${PRODUCER_LIMIT} bytes/sec"
              echo "  消费者上限: ${CONSUMER_LIMIT} bytes/sec"
              kafka-configs.sh \
                --bootstrap-server "${BOOTSTRAP}" \
                --command-config /tmp/client.properties \
                --alter \
                --entity-type users \
                --entity-name "${SASL_USER}" \
                --add-config "producer_byte_rate=${PRODUCER_LIMIT},consumer_byte_rate=${CONSUMER_LIMIT}"
              echo "--- 验证配置 ---"
              kafka-configs.sh \
                --bootstrap-server "${BOOTSTRAP}" \
                --command-config /tmp/client.properties \
                --describe \
                --entity-type users \
                --entity-name "${SASL_USER}"
          volumeMounts:
            - name: cfg
              mountPath: /cfg

---
# ── Job 5：设置 Topic 复制限速 ─────────────────────────────────
apiVersion: batch/v1
kind: Job
metadata:
  name: kafka-perf-05-set-topic-throttle
  labels:
    app: kafka-throttle-perf
spec:
  ttlSecondsAfterFinished: 600
  template:
    metadata:
      labels:
        app: kafka-throttle-perf
    spec:
      restartPolicy: Never
      volumes:
        - name: cfg
          configMap:
            name: kafka-perf-cfg
            defaultMode: 0755
      containers:
        - name: job
          image: docker.io/bitnamilegacy/kafka:3.7.1
          envFrom:
            - configMapRef:
                name: kafka-perf-cfg
          command: ["/bin/bash", "-c"]
          args:
            - |
              source /cfg/init.sh
              echo "=== 设置 Topic ${PERF_TOPIC} 复制限速: ${REPL_LIMIT} bytes/sec ==="
              kafka-configs.sh \
                --bootstrap-server "${BOOTSTRAP}" \
                --command-config /tmp/client.properties \
                --alter \
                --entity-type topics \
                --entity-name "${PERF_TOPIC}" \
                --add-config "leader.replication.throttled.rate=${REPL_LIMIT},follower.replication.throttled.rate=${REPL_LIMIT}"
              echo "--- 验证 Topic 配置 ---"
              kafka-configs.sh \
                --bootstrap-server "${BOOTSTRAP}" \
                --command-config /tmp/client.properties \
                --describe \
                --entity-type topics \
                --entity-name "${PERF_TOPIC}"
          volumeMounts:
            - name: cfg
              mountPath: /cfg

---
# ── Job 6：限速后生产者压测（对比基准）────────────────────────
apiVersion: batch/v1
kind: Job
metadata:
  name: kafka-perf-06-producer-throttled
  labels:
    app: kafka-throttle-perf
spec:
  ttlSecondsAfterFinished: 600
  template:
    metadata:
      labels:
        app: kafka-throttle-perf
    spec:
      restartPolicy: Never
      volumes:
        - name: cfg
          configMap:
            name: kafka-perf-cfg
            defaultMode: 0755
      containers:
        - name: job
          image: docker.io/bitnamilegacy/kafka:3.7.1
          envFrom:
            - configMapRef:
                name: kafka-perf-cfg
          command: ["/bin/bash", "-c"]
          args:
            - |
              source /cfg/init.sh
              echo "=== 限速后生产者压测（预期 ≤ ${PRODUCER_LIMIT} bytes/sec）==="
              kafka-producer-perf-test.sh \
                --topic "${PERF_TOPIC}" \
                --num-records "${RECORD_COUNT}" \
                --record-size "${RECORD_SIZE}" \
                --throughput -1 \
                --producer.config /tmp/producer.properties
              echo "=== 对比 Job 2 的基准值，吞吐量应显著下降 ==="
          volumeMounts:
            - name: cfg
              mountPath: /cfg
          resources:
            requests: { cpu: "500m", memory: "256Mi" }
            limits:   { cpu: "2",    memory: "512Mi" }

---
# ── Job 7：限速后消费者压测（对比基准）────────────────────────
apiVersion: batch/v1
kind: Job
metadata:
  name: kafka-perf-07-consumer-throttled
  labels:
    app: kafka-throttle-perf
spec:
  ttlSecondsAfterFinished: 600
  template:
    metadata:
      labels:
        app: kafka-throttle-perf
    spec:
      restartPolicy: Never
      volumes:
        - name: cfg
          configMap:
            name: kafka-perf-cfg
            defaultMode: 0755
      containers:
        - name: job
          image: docker.io/bitnamilegacy/kafka:3.7.1
          envFrom:
            - configMapRef:
                name: kafka-perf-cfg
          command: ["/bin/bash", "-c"]
          args:
            - |
              source /cfg/init.sh
              echo "=== 限速后消费者压测（预期 ≤ ${CONSUMER_LIMIT} bytes/sec）==="
              kafka-consumer-perf-test.sh \
                --bootstrap-server "${BOOTSTRAP}" \
                --topic "${PERF_TOPIC}" \
                --messages "${RECORD_COUNT}" \
                --consumer.config /tmp/consumer.properties \
                --group perf-throttle-group \
                --from-latest
              echo "=== 对比 Job 3 的基准值，吞吐量应显著下降 ==="
          volumeMounts:
            - name: cfg
              mountPath: /cfg
          resources:
            requests: { cpu: "500m", memory: "256Mi" }
            limits:   { cpu: "2",    memory: "512Mi" }

---
# ── Job 8：解除所有限速 ────────────────────────────────────────
apiVersion: batch/v1
kind: Job
metadata:
  name: kafka-perf-08-remove-throttle
  labels:
    app: kafka-throttle-perf
spec:
  ttlSecondsAfterFinished: 600
  template:
    metadata:
      labels:
        app: kafka-throttle-perf
    spec:
      restartPolicy: Never
      volumes:
        - name: cfg
          configMap:
            name: kafka-perf-cfg
            defaultMode: 0755
      containers:
        - name: job
          image: docker.io/bitnamilegacy/kafka:3.7.1
          envFrom:
            - configMapRef:
                name: kafka-perf-cfg
          command: ["/bin/bash", "-c"]
          args:
            - |
              source /cfg/init.sh
              echo "=== 解除用户 ${SASL_USER} 的客户端限速 ==="
              kafka-configs.sh \
                --bootstrap-server "${BOOTSTRAP}" \
                --command-config /tmp/client.properties \
                --alter \
                --entity-type users \
                --entity-name "${SASL_USER}" \
                --delete-config "producer_byte_rate,consumer_byte_rate"

              echo "=== 解除 Topic ${PERF_TOPIC} 的复制限速 ==="
              kafka-configs.sh \
                --bootstrap-server "${BOOTSTRAP}" \
                --command-config /tmp/client.properties \
                --alter \
                --entity-type topics \
                --entity-name "${PERF_TOPIC}" \
                --delete-config "leader.replication.throttled.rate,follower.replication.throttled.rate"

              echo "--- 验证用户配额（应为空）---"
              kafka-configs.sh \
                --bootstrap-server "${BOOTSTRAP}" \
                --command-config /tmp/client.properties \
                --describe \
                --entity-type users \
                --entity-name "${SASL_USER}"

              echo "--- 验证 Topic 配置（throttle 相关应消失）---"
              kafka-configs.sh \
                --bootstrap-server "${BOOTSTRAP}" \
                --command-config /tmp/client.properties \
                --describe \
                --entity-type topics \
                --entity-name "${PERF_TOPIC}"
          volumeMounts:
            - name: cfg
              mountPath: /cfg

---
# ── Job 9：清理压测 Topic ──────────────────────────────────────
apiVersion: batch/v1
kind: Job
metadata:
  name: kafka-perf-09-cleanup
  labels:
    app: kafka-throttle-perf
spec:
  ttlSecondsAfterFinished: 300
  template:
    metadata:
      labels:
        app: kafka-throttle-perf
    spec:
      restartPolicy: Never
      volumes:
        - name: cfg
          configMap:
            name: kafka-perf-cfg
            defaultMode: 0755
      containers:
        - name: job
          image: docker.io/bitnamilegacy/kafka:3.7.1
          envFrom:
            - configMapRef:
                name: kafka-perf-cfg
          command: ["/bin/bash", "-c"]
          args:
            - |
              source /cfg/init.sh
              kafka-topics.sh \
                --bootstrap-server "${BOOTSTRAP}" \
                --command-config /tmp/client.properties \
                --delete \
                --topic "${PERF_TOPIC}"
              echo "压测 Topic 已删除"
          volumeMounts:
            - name: cfg
              mountPath: /cfg
```

---

## 五、限速操作（Kafka 原生命令）

> 以下命令 **Linux 主机和 Pod exec 均可直接执行**，确保已完成第二节的 `gen_client_props` 步骤。

### 5.1 用户级限速（生产者 / 消费者）

#### 设置限速

```bash
# 同时设置生产者和消费者限速
kafka-configs.sh \
  --bootstrap-server "${BOOTSTRAP}" \
  --command-config /tmp/client.properties \
  --alter \
  --entity-type users \
  --entity-name "${SASL_USER}" \
  --add-config "producer_byte_rate=${PRODUCER_LIMIT},consumer_byte_rate=${CONSUMER_LIMIT}"

# 仅设置生产者限速
kafka-configs.sh \
  --bootstrap-server "${BOOTSTRAP}" \
  --command-config /tmp/client.properties \
  --alter \
  --entity-type users \
  --entity-name "${SASL_USER}" \
  --add-config "producer_byte_rate=${PRODUCER_LIMIT}"

# 仅设置消费者限速
kafka-configs.sh \
  --bootstrap-server "${BOOTSTRAP}" \
  --command-config /tmp/client.properties \
  --alter \
  --entity-type users \
  --entity-name "${SASL_USER}" \
  --add-config "consumer_byte_rate=${CONSUMER_LIMIT}"
```

#### 查询当前配置

```bash
kafka-configs.sh \
  --bootstrap-server "${BOOTSTRAP}" \
  --command-config /tmp/client.properties \
  --describe \
  --entity-type users \
  --entity-name "${SASL_USER}"
```

预期输出（已限速时）：
```
Configs for user-principal '${SASL_USER}' are
  producer_byte_rate=10485760,consumer_byte_rate=5242880
```

#### 解除限速

```bash
kafka-configs.sh \
  --bootstrap-server "${BOOTSTRAP}" \
  --command-config /tmp/client.properties \
  --alter \
  --entity-type users \
  --entity-name "${SASL_USER}" \
  --delete-config "producer_byte_rate,consumer_byte_rate"
```

---

### 5.2 Topic 复制限速

> 复制限速影响 Broker 之间的副本同步带宽，不影响客户端读写速率。

#### 设置

```bash
kafka-configs.sh \
  --bootstrap-server "${BOOTSTRAP}" \
  --command-config /tmp/client.properties \
  --alter \
  --entity-type topics \
  --entity-name "${PERF_TOPIC}" \
  --add-config "leader.replication.throttled.rate=${REPL_LIMIT},follower.replication.throttled.rate=${REPL_LIMIT}"
```

#### 查询

```bash
kafka-configs.sh \
  --bootstrap-server "${BOOTSTRAP}" \
  --command-config /tmp/client.properties \
  --describe \
  --entity-type topics \
  --entity-name "${PERF_TOPIC}"
```

预期输出：
```
Configs for topic '${PERF_TOPIC}' are
  leader.replication.throttled.rate=1048576
  follower.replication.throttled.rate=1048576
```

#### 解除

```bash
kafka-configs.sh \
  --bootstrap-server "${BOOTSTRAP}" \
  --command-config /tmp/client.properties \
  --alter \
  --entity-type topics \
  --entity-name "${PERF_TOPIC}" \
  --delete-config "leader.replication.throttled.rate,follower.replication.throttled.rate"
```

---

## 六、压测执行流程

### 完整流程（Linux 主机 / Pod exec 通用）

```bash
# ① 加载变量（选 A 或 B）
source ~/kafka-perf-env.sh

# ② 生成认证配置文件
gen_client_props

# ③ 创建 Topic
kafka-topics.sh \
  --bootstrap-server "${BOOTSTRAP}" \
  --command-config /tmp/client.properties \
  --create --if-not-exists \
  --topic "${PERF_TOPIC}" \
  --partitions "${PARTITIONS}" \
  --replication-factor "${REPLICATION}"

# ④ 基准生产压测（无限速，记录 MB/sec 基准值）
kafka-producer-perf-test.sh \
  --topic "${PERF_TOPIC}" \
  --num-records "${RECORD_COUNT}" \
  --record-size "${RECORD_SIZE}" \
  --throughput -1 \
  --producer.config /tmp/client.properties

# ⑤ 基准消费压测（无限速，记录 MB/sec 基准值）
kafka-consumer-perf-test.sh \
  --bootstrap-server "${BOOTSTRAP}" \
  --topic "${PERF_TOPIC}" \
  --messages "${RECORD_COUNT}" \
  --consumer.config /tmp/client.properties \
  --group perf-baseline-group \
  --from-latest

# ⑥ 设置限速
kafka-configs.sh \
  --bootstrap-server "${BOOTSTRAP}" \
  --command-config /tmp/client.properties \
  --alter --entity-type users \
  --entity-name "${SASL_USER}" \
  --add-config "producer_byte_rate=${PRODUCER_LIMIT},consumer_byte_rate=${CONSUMER_LIMIT}"

# ⑦ 限速后生产压测（吞吐量应 ≤ PRODUCER_LIMIT）
kafka-producer-perf-test.sh \
  --topic "${PERF_TOPIC}" \
  --num-records "${RECORD_COUNT}" \
  --record-size "${RECORD_SIZE}" \
  --throughput -1 \
  --producer.config /tmp/client.properties

# ⑧ 限速后消费压测（吞吐量应 ≤ CONSUMER_LIMIT）
kafka-consumer-perf-test.sh \
  --bootstrap-server "${BOOTSTRAP}" \
  --topic "${PERF_TOPIC}" \
  --messages "${RECORD_COUNT}" \
  --consumer.config /tmp/client.properties \
  --group perf-throttle-group \
  --from-latest

# ⑨ 查看 Topic 副本落后情况（复制限速验证）
kafka-topics.sh \
  --bootstrap-server "${BOOTSTRAP}" \
  --command-config /tmp/client.properties \
  --describe --topic "${PERF_TOPIC}" \
  --under-replicated-partitions

# ⑩ 解除所有限速
kafka-configs.sh \
  --bootstrap-server "${BOOTSTRAP}" \
  --command-config /tmp/client.properties \
  --alter --entity-type users \
  --entity-name "${SASL_USER}" \
  --delete-config "producer_byte_rate,consumer_byte_rate"

kafka-configs.sh \
  --bootstrap-server "${BOOTSTRAP}" \
  --command-config /tmp/client.properties \
  --alter --entity-type topics \
  --entity-name "${PERF_TOPIC}" \
  --delete-config "leader.replication.throttled.rate,follower.replication.throttled.rate"
```

### Kubernetes Job 顺序执行

```bash
NS=kafka-demo   # 替换为实际命名空间

# ① 先修改 kafka-throttle-jobs.yaml 中 ConfigMap 的值，再 apply
kubectl apply -f kafka-throttle-jobs.yaml -n ${NS}

# 按序等待每个 Job 完成，中间可以插入限速设置步骤
for JOB in \
  kafka-perf-01-create-topic \
  kafka-perf-02-producer-baseline \
  kafka-perf-03-consumer-baseline; do
  kubectl wait job/${JOB} -n ${NS} --for=condition=complete --timeout=600s
  echo "=== ${JOB} 完成 ==="
  kubectl logs -n ${NS} job/${JOB} | tail -10
done

# ── 此时可手动或通过平台 API 设置限速 ──
# 或等待 Job 4/5 自动完成（Job 4/5 使用 kafka-configs.sh 设置限速）

for JOB in \
  kafka-perf-04-set-client-quota \
  kafka-perf-05-set-topic-throttle \
  kafka-perf-06-producer-throttled \
  kafka-perf-07-consumer-throttled \
  kafka-perf-08-remove-throttle \
  kafka-perf-09-cleanup; do
  kubectl wait job/${JOB} -n ${NS} --for=condition=complete --timeout=600s
  echo "=== ${JOB} 完成 ==="
  kubectl logs -n ${NS} job/${JOB} | tail -15
done
```

---

## 七、结果判读与验证

### 7.1 客户端限速是否生效

| 阶段 | 预期输出 | 判断标准 |
|------|---------|---------|
| 基准（无限速） | `96.00 MB/sec` | 记录此值 |
| 限速后（10 MB/s） | `≈ 9.5 ~ 10.5 MB/sec` | 接近设定值即生效 |
| 解除限速后 | 恢复接近基准值 | 误差 ±20% 均正常 |

**典型输出格式**：
```
5000000 records sent, 10240.0 records/sec (10.00 MB/sec),
  avg latency 485.00 ms, max latency 1820 ms
```

### 7.2 复制限速是否生效

```bash
# 写入大量数据后立即查看副本落后情况
# 若复制限速生效，follower 跟不上 leader 写入，会出现 under-replicated 分区
kafka-topics.sh \
  --bootstrap-server "${BOOTSTRAP}" \
  --command-config /tmp/client.properties \
  --describe \
  --topic "${PERF_TOPIC}" \
  --under-replicated-partitions
```

有输出内容（如 `Partition: 0 Leader: 1 Replicas: 1,2,0 Isr: 1`，ISR 数量少于副本数）表示复制已被限速。

### 7.3 通过 labplane 平台验证（可选）

若同时在平台上配置了限速，通过以下命令与平台 UI 数据交叉验证：

```bash
# 以平台设置的用户名/密码重新生成 client.properties 再执行压测
# 平台 UI 中的限速值（bytes/sec）应与压测实测吞吐量吻合
kafka-configs.sh \
  --bootstrap-server "${BOOTSTRAP}" \
  --command-config /tmp/client.properties \
  --describe --entity-type users --entity-name "${SASL_USER}"
```

---

## 八、解除限速

### 一键全部解除（Linux / Pod exec）

```bash
# 解除用户级限速
kafka-configs.sh \
  --bootstrap-server "${BOOTSTRAP}" \
  --command-config /tmp/client.properties \
  --alter --entity-type users \
  --entity-name "${SASL_USER}" \
  --delete-config "producer_byte_rate,consumer_byte_rate"

# 解除 Topic 复制限速
kafka-configs.sh \
  --bootstrap-server "${BOOTSTRAP}" \
  --command-config /tmp/client.properties \
  --alter --entity-type topics \
  --entity-name "${PERF_TOPIC}" \
  --delete-config "leader.replication.throttled.rate,follower.replication.throttled.rate"

# 确认已解除（两条命令均应无 throttle 相关输出）
kafka-configs.sh \
  --bootstrap-server "${BOOTSTRAP}" \
  --command-config /tmp/client.properties \
  --describe --entity-type users --entity-name "${SASL_USER}"

kafka-configs.sh \
  --bootstrap-server "${BOOTSTRAP}" \
  --command-config /tmp/client.properties \
  --describe --entity-type topics --entity-name "${PERF_TOPIC}"
```

---

## 九、清理压测资源

### Linux 主机

```bash
kafka-topics.sh \
  --bootstrap-server "${BOOTSTRAP}" \
  --command-config /tmp/client.properties \
  --delete \
  --topic "${PERF_TOPIC}"
```

### Kubernetes

```bash
# 删除所有压测 Job 和 ConfigMap
kubectl delete jobs,configmaps,pods \
  -n ${NS} \
  -l app=kafka-throttle-perf

# 如果交互式 Pod 还在运行
kubectl delete pod kafka-perf-shell -n ${NS}
```

---

## 附录：限速值速查表

| 目标带宽 | bytes/sec（填入变量） |
|---------|-------------------|
| 1 MB/s | `1048576` |
| 5 MB/s | `5242880` |
| 10 MB/s | `10485760` |
| 20 MB/s | `20971520` |
| 50 MB/s | `52428800` |
| 100 MB/s | `104857600` |
| 解除限速 | 执行 `--delete-config` |

> `bytes/sec = MB/s × 1048576`

---

## 附录：常见问题

**Q：`SASL authentication failed`？**
- 检查 `SASL_USER` / `SASL_PASS` / `SASL_MECH` 是否与集群一致
- PLAIN 机制时确认 `PlainLoginModule` 替换了 `ScramLoginModule`
- 查看 Broker 日志：`kubectl logs <kafka-pod> -n <ns> | grep "Authentication"`

**Q：限速设置成功但吞吐量没有下降？**
- Kafka 配额在 Broker 侧周期性采样（`quota.window.size.seconds` 默认 1 秒），等待 2~3 秒后重测
- 确认 `kafka-configs.sh --describe` 能看到配置条目
- 确认压测用户名与限速配置的 `entity-name` 完全一致（区分大小写）

**Q：内网 Harbor 镜像拉取失败？**
```bash
# 替换 YAML 中所有 image 字段
# 示例：docker.io/bitnamilegacy/kafka:3.7.1
#    → harbor.internal/library/bitnamilegacy-kafka:3.7.1

# 创建 imagePullSecret（如需要）
kubectl create secret docker-registry harbor-secret \
  --docker-server=harbor.internal \
  --docker-username='robot$xxx' \
  --docker-password=<token> \
  -n ${NS}
# 在 Pod/Job spec 中添加:
# imagePullSecrets:
#   - name: harbor-secret
```

**Q：`kafka-consumer-perf-test.sh` 消费条数为 0？**
- 加 `--from-latest` 时需先有生产者写入数据；先运行生产压测再运行消费压测
- 或改为 `--from-beginning` 从头消费已有数据（去掉 `--from-latest` 参数）

**Q：复制限速后 ISR 一直不恢复？**
- 复制限速会导致 ISR 收缩；完成验证后务必执行第八节解除步骤
- 如果 ISR 长时间不恢复，检查是否有 Broker 宕机（与限速无关的问题）

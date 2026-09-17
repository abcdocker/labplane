package internal

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/remotecommand"
)

const (
	k8sPVCMaxReadBytes  = 10 * 1024 * 1024 // 10 MiB
	k8sPVCMaxWriteBytes = 64 * 1024 * 1024 // 64 MiB
)

// k8sPodExecRun 在 Pod 内执行命令（非 TTY），stdin 可选。
func k8sPodExecRun(
	ctx context.Context,
	k8s *kubernetes.Clientset,
	restCfg *rest.Config,
	ns, podName, container string,
	cmd []string,
	stdin io.Reader,
) (stdout, stderr bytes.Buffer, err error) {
	req := k8s.CoreV1().RESTClient().Post().
		Resource("pods").
		Name(podName).
		Namespace(ns).
		SubResource("exec").
		VersionedParams(&corev1.PodExecOptions{
			Container: container,
			Command:   cmd,
			Stdin:     stdin != nil,
			Stdout:    true,
			Stderr:    true,
			TTY:       false,
		}, scheme.ParameterCodec)

	executor, err := remotecommand.NewSPDYExecutor(restCfg, "POST", req.URL())
	if err != nil {
		return stdout, stderr, err
	}
	opts := remotecommand.StreamOptions{
		Stdout: &stdout,
		Stderr: &stderr,
	}
	if stdin != nil {
		opts.Stdin = stdin
	}
	done := make(chan error, 1)
	go func() {
		done <- executor.Stream(opts)
	}()
	select {
	case <-ctx.Done():
		return stdout, stderr, ctx.Err()
	case err := <-done:
		return stdout, stderr, err
	}
}

const pvcExecUnsupportedCode = "pvc_exec_unsupported"

// classifyPVCExecEnvironmentError 识别容器内无法启动 /bin/sh 等环境类错误（如 distroless）。
func classifyPVCExecEnvironmentError(err error, stderr string) (msg string, code string) {
	if err == nil {
		return "", ""
	}
	combined := strings.ToLower(err.Error() + "\n" + stderr)
	if strings.Contains(combined, "stat") && strings.Contains(combined, "/bin/sh") &&
		strings.Contains(combined, "no such file") {
		return "当前容器镜像内没有可用的 shell（未找到 /bin/sh，常见于 distroless 等精简镜像）。PVC 文件浏览依赖在容器内执行命令，因此无法通过此容器列出或读写卷内数据。请换用挂载同一 PVC 且含 shell 的 Pod，或使用 kubectl cp、kubectl debug 临时容器等方式访问数据。",
			pvcExecUnsupportedCode
	}
	if strings.Contains(combined, `exec: "/bin/sh"`) || strings.Contains(combined, `exec: '/bin/sh'`) {
		if strings.Contains(combined, "no such file") || strings.Contains(combined, "not found") {
			return "当前容器镜像内没有可用的 shell（未找到 /bin/sh，常见于 distroless 等精简镜像）。PVC 文件浏览依赖在容器内执行命令，因此无法通过此容器列出或读写卷内数据。请换用挂载同一 PVC 且含 shell 的 Pod，或使用 kubectl cp、kubectl debug 临时容器等方式访问数据。",
				pvcExecUnsupportedCode
		}
	}
	if strings.Contains(combined, "executable file not found") &&
		(strings.Contains(combined, "/bin/sh") || strings.Contains(combined, `"sh"`)) {
		return "容器内无法执行 shell 命令（可执行文件不存在）。该镜像可能为极简运行时，不支持通过本平台浏览 PVC。请换用含 /bin/sh 的工作负载挂载，或使用 kubectl 方式访问卷数据。",
			pvcExecUnsupportedCode
	}
	return "", ""
}

func respondPVCExecFailure(c *gin.Context, opPrefix string, err error, stderr string) {
	if msg, code := classifyPVCExecEnvironmentError(err, stderr); code != "" {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": msg, "code": code})
		return
	}
	RespondAPIErrorMerged(c, http.StatusInternalServerError, opPrefix+": "+err.Error(), gin.H{"stderr": stderr})
}

type pvcMountCandidate struct {
	Pod       string `json:"pod"`
	Container string `json:"container"`
	MountPath string `json:"mountPath"`
}

// pvcInitContainerCurrentlyRunning 仅当该 init 容器当前处于 Running 时为 true。
// Pod 已进入 Running 后，已退出的 init 无法再 exec，列出其挂载会导致「container not found」。
func pvcInitContainerCurrentlyRunning(pod *corev1.Pod, name string) bool {
	if pod == nil || strings.TrimSpace(name) == "" {
		return false
	}
	for _, s := range pod.Status.InitContainerStatuses {
		if s.Name != name {
			continue
		}
		return s.State.Running != nil
	}
	return false
}

// pvcMountsForClaim 列出将指定 PVC 挂载到容器中的 Pod。
// 普通容器始终列出；init 容器仅在当前仍在 Running 时列出（已完成的 init 不能 exec）。
func pvcMountsForClaim(pods []corev1.Pod, pvcName string) []pvcMountCandidate {
	var out []pvcMountCandidate
	pvcName = strings.TrimSpace(pvcName)
	if pvcName == "" {
		return out
	}
	for i := range pods {
		pod := &pods[i]
		if pod.Status.Phase != corev1.PodRunning {
			continue
		}
		volToClaim := map[string]string{}
		for _, v := range pod.Spec.Volumes {
			if v.PersistentVolumeClaim != nil && v.PersistentVolumeClaim.ClaimName == pvcName {
				volToClaim[v.Name] = pvcName
			}
		}
		if len(volToClaim) == 0 {
			continue
		}
		add := func(containerName string, mounts []corev1.VolumeMount) {
			for _, vm := range mounts {
				if _, ok := volToClaim[vm.Name]; ok {
					mp := strings.TrimSpace(vm.MountPath)
					if mp == "" {
						continue
					}
					out = append(out, pvcMountCandidate{
						Pod:       pod.Name,
						Container: containerName,
						MountPath: mp,
					})
				}
			}
		}
		for _, ic := range pod.Spec.InitContainers {
			if !pvcInitContainerCurrentlyRunning(pod, ic.Name) {
				continue
			}
			add(ic.Name, ic.VolumeMounts)
		}
		for _, c := range pod.Spec.Containers {
			add(c.Name, c.VolumeMounts)
		}
	}
	return out
}

// joinUnderPVCMount 将相对路径拼到挂载点下，禁止穿越挂载根目录。
func joinUnderPVCMount(mountRoot, rel string) (string, error) {
	mountRoot = path.Clean("/" + strings.TrimPrefix(mountRoot, "/"))
	if mountRoot == "" {
		mountRoot = "/"
	}
	rel = strings.Trim(rel, "/")
	if rel == "" {
		return mountRoot, nil
	}
	for _, p := range strings.Split(rel, "/") {
		if p == "" || p == "." {
			continue
		}
		if p == ".." {
			return "", errors.New("路径非法")
		}
	}
	full := path.Clean(mountRoot + "/" + rel)
	if mountRoot == "/" {
		return full, nil
	}
	if full == mountRoot || strings.HasPrefix(full, mountRoot+"/") {
		return full, nil
	}
	return "", errors.New("路径越出挂载点")
}

func handleK8sPVCFileMounts(c *gin.Context, k8s *kubernetes.Clientset) {
	if !GuardK8s(c, k8s) {
		return
	}
	ns := c.Param("namespace")
	pvcName := c.Param("pvcName")
	if ns == "" || pvcName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 namespace 或 pvcName"})
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	list, err := k8s.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{})
	if err != nil {
		RespondAPIError500(c, "列出 Pod 失败: " + err.Error())
		return
	}
	_, err = k8s.CoreV1().PersistentVolumeClaims(ns).Get(ctx, pvcName, metav1.GetOptions{})
	if err != nil {
		if apierrors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "PVC 不存在"})
			return
		}
		RespondAPIError500(c, "读取 PVC 失败: " + err.Error())
		return
	}
	mounts := pvcMountsForClaim(list.Items, pvcName)
	out := make([]map[string]interface{}, 0, len(mounts))
	for _, m := range mounts {
		out = append(out, map[string]interface{}{
			"pod":       m.Pod,
			"container": m.Container,
			"mountPath": m.MountPath,
		})
	}
	c.JSON(http.StatusOK, gin.H{"mounts": out})
}

type pvcListEntry struct {
	Name string `json:"name"`
	Type string `json:"type"` // dir | file | link
	Size int64  `json:"size"`
}

func handleK8sPVCFileList(c *gin.Context, k8s *kubernetes.Clientset, restCfg *rest.Config) {
	if !GuardK8sREST(c, k8s, restCfg) {
		return
	}
	ns := c.Param("namespace")
	pvcName := c.Param("pvcName")
	pod := c.Query("pod")
	container := c.Query("container")
	mountRoot := c.Query("mountPath")
	rel := c.Query("path")
	if ns == "" || pvcName == "" || pod == "" || container == "" || mountRoot == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少参数: pod, container, mountPath"})
		return
	}
	full, err := joinUnderPVCMount(mountRoot, rel)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 120*time.Second)
	defer cancel()
	script := fmt.Sprintf(`cd %s || exit 1
ls -1A | while IFS= read -r f; do
  d="file"
  [ -d "$f" ] && d="dir"
  [ -L "$f" ] && d="link"
  sz=$(stat -c '%%s' "$f" 2>/dev/null || echo 0)
  printf '%%s|%%s|%%s\n' "$f" "$d" "$sz"
done
`, shellQuoteSingle(full))
	cmd := []string{"/bin/sh", "-c", script}
	stdout, stderr, err := k8sPodExecRun(ctx, k8s, restCfg, ns, pod, container, cmd, nil)
	if err != nil {
		respondPVCExecFailure(c, "执行 ls 失败", err, stderr.String())
		return
	}
	lines := strings.Split(strings.TrimSpace(stdout.String()), "\n")
	entries := make([]pvcListEntry, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "|", 3)
		if len(parts) < 3 {
			continue
		}
		name := parts[0]
		if name == "." || name == ".." {
			continue
		}
		typ := parts[1]
		sz, _ := strconv.ParseInt(parts[2], 10, 64)
		entries = append(entries, pvcListEntry{Name: name, Type: typ, Size: sz})
	}
	c.JSON(http.StatusOK, gin.H{"entries": entries, "path": rel})
}

func handleK8sPVCFileRead(c *gin.Context, k8s *kubernetes.Clientset, restCfg *rest.Config) {
	if !GuardK8sREST(c, k8s, restCfg) {
		return
	}
	ns := c.Param("namespace")
	pod := c.Query("pod")
	container := c.Query("container")
	mountRoot := c.Query("mountPath")
	rel := c.Query("path")
	if ns == "" || pod == "" || container == "" || mountRoot == "" || rel == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少参数"})
		return
	}
	full, err := joinUnderPVCMount(mountRoot, rel)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 120*time.Second)
	defer cancel()
	// 先检查是否为目录
	checkCmd := []string{"/bin/sh", "-c", fmt.Sprintf(`test -d %s && echo dir || echo file`, shellQuoteSingle(full))}
	outChk, errChk, err := k8sPodExecRun(ctx, k8s, restCfg, ns, pod, container, checkCmd, nil)
	if err != nil {
		respondPVCExecFailure(c, "stat 失败", err, errChk.String())
		return
	}
	if strings.TrimSpace(outChk.String()) == "dir" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "路径是目录，不能读取为文件"})
		return
	}
	// base64 读出，避免二进制损坏
	readScript := fmt.Sprintf(`f=%s
sz=$(stat -c '%%s' "$f" 2>/dev/null || echo 0)
if [ "$sz" -gt %d ]; then echo TOOBIG; exit 1; fi
base64 -w0 "$f" 2>/dev/null || base64 "$f" | tr -d '\n'
`, shellQuoteSingle(full), k8sPVCMaxReadBytes)
	cmd := []string{"/bin/sh", "-c", readScript}
	stdout, stderr, err := k8sPodExecRun(ctx, k8s, restCfg, ns, pod, container, cmd, nil)
	if err != nil {
		respondPVCExecFailure(c, "读取失败", err, stderr.String())
		return
	}
	b64 := strings.TrimSpace(stdout.String())
	if b64 == "TOOBIG" {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("文件超过 %d 字节限制", k8sPVCMaxReadBytes)})
		return
	}
	raw, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		RespondAPIError500(c, "解码失败: " + err.Error())
		return
	}
	text := ""
	if utf8LooksLikeText(raw) {
		text = string(raw)
	}
	c.JSON(http.StatusOK, gin.H{
		"encoding": "base64",
		"content":  b64,
		"text":     text,
		"size":     len(raw),
	})
}

func utf8LooksLikeText(b []byte) bool {
	if len(b) == 0 {
		return true
	}
	if len(b) > k8sPVCMaxReadBytes {
		return false
	}
	s := string(b)
	return strings.ToValidUTF8(s, "\uFFFD") == s && len(strings.TrimSpace(s)) > 0
}

func handleK8sPVCFileWrite(c *gin.Context, k8s *kubernetes.Clientset, restCfg *rest.Config) {
	if !GuardK8sREST(c, k8s, restCfg) {
		return
	}
	ns := c.Param("namespace")
	pod := c.Query("pod")
	container := c.Query("container")
	mountRoot := c.Query("mountPath")
	rel := c.Query("path")
	if ns == "" || pod == "" || container == "" || mountRoot == "" || rel == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少参数"})
		return
	}
	full, err := joinUnderPVCMount(mountRoot, rel)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	body, err := io.ReadAll(io.LimitReader(c.Request.Body, k8sPVCMaxWriteBytes+1))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "读取请求体失败"})
		return
	}
	if len(body) > k8sPVCMaxWriteBytes {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("内容超过 %d 字节", k8sPVCMaxWriteBytes)})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 300*time.Second)
	defer cancel()
	// mkdir -p 父目录
	parent := path.Dir(full)
	mkdirCmd := []string{"/bin/sh", "-c", fmt.Sprintf(`mkdir -p %s`, shellQuoteSingle(parent))}
	if _, stderr, err := k8sPodExecRun(ctx, k8s, restCfg, ns, pod, container, mkdirCmd, nil); err != nil {
		respondPVCExecFailure(c, "mkdir 失败", err, stderr.String())
		return
	}
	cmd := []string{"/bin/sh", "-c", fmt.Sprintf(`cat > %s`, shellQuoteSingle(full))}
	stdin := bytes.NewReader(body)
	_, stderr, err := k8sPodExecRun(ctx, k8s, restCfg, ns, pod, container, cmd, stdin)
	if err != nil {
		respondPVCExecFailure(c, "写入失败", err, stderr.String())
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "bytes": len(body)})
}

func handleK8sPVCFileDelete(c *gin.Context, k8s *kubernetes.Clientset, restCfg *rest.Config) {
	if !GuardK8sREST(c, k8s, restCfg) {
		return
	}
	ns := c.Param("namespace")
	pod := c.Query("pod")
	container := c.Query("container")
	mountRoot := c.Query("mountPath")
	rel := c.Query("path")
	if ns == "" || pod == "" || container == "" || mountRoot == "" || rel == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少参数"})
		return
	}
	full, err := joinUnderPVCMount(mountRoot, rel)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if full == path.Clean("/"+strings.TrimPrefix(mountRoot, "/")) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "禁止删除挂载根目录"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 120*time.Second)
	defer cancel()
	cmd := []string{"/bin/sh", "-c", fmt.Sprintf(`rm -rf %s`, shellQuoteSingle(full))}
	_, stderr, err := k8sPodExecRun(ctx, k8s, restCfg, ns, pod, container, cmd, nil)
	if err != nil {
		respondPVCExecFailure(c, "删除失败", err, stderr.String())
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type pvcMkdirBody struct {
	Name string `json:"name"`
}

func handleK8sPVCFileMkdir(c *gin.Context, k8s *kubernetes.Clientset, restCfg *rest.Config) {
	if !GuardK8sREST(c, k8s, restCfg) {
		return
	}
	ns := c.Param("namespace")
	pod := c.Query("pod")
	container := c.Query("container")
	mountRoot := c.Query("mountPath")
	rel := c.Query("path")
	var body pvcMkdirBody
	_ = json.NewDecoder(c.Request.Body).Decode(&body)
	name := strings.TrimSpace(body.Name)
	if ns == "" || pod == "" || container == "" || mountRoot == "" || name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少参数或目录名"})
		return
	}
	if strings.Contains(name, "/") || name == "." || name == ".." {
		c.JSON(http.StatusBadRequest, gin.H{"error": "目录名非法"})
		return
	}
	childRel := path.Join(strings.Trim(rel, "/"), name)
	full, err := joinUnderPVCMount(mountRoot, childRel)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 60*time.Second)
	defer cancel()
	cmd := []string{"/bin/sh", "-c", fmt.Sprintf(`mkdir -p %s`, shellQuoteSingle(full))}
	_, stderr, err := k8sPodExecRun(ctx, k8s, restCfg, ns, pod, container, cmd, nil)
	if err != nil {
		respondPVCExecFailure(c, "创建目录失败", err, stderr.String())
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "path": childRel})
}

type pvcRenameBody struct {
	From string `json:"from"`
	To   string `json:"to"`
}

func handleK8sPVCFileRename(c *gin.Context, k8s *kubernetes.Clientset, restCfg *rest.Config) {
	if !GuardK8sREST(c, k8s, restCfg) {
		return
	}
	ns := c.Param("namespace")
	pod := c.Query("pod")
	container := c.Query("container")
	mountRoot := c.Query("mountPath")
	rel := c.Query("path")
	var body pvcRenameBody
	if err := json.NewDecoder(c.Request.Body).Decode(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "JSON 无效"})
		return
	}
	fromName := strings.TrimSpace(body.From)
	toName := strings.TrimSpace(body.To)
	if ns == "" || pod == "" || container == "" || mountRoot == "" || fromName == "" || toName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少参数"})
		return
	}
	if strings.Contains(fromName, "/") || strings.Contains(toName, "/") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "仅支持同目录下重命名"})
		return
	}
	fromRel := path.Join(strings.Trim(rel, "/"), fromName)
	toRel := path.Join(strings.Trim(rel, "/"), toName)
	fromFull, err := joinUnderPVCMount(mountRoot, fromRel)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	toFull, err := joinUnderPVCMount(mountRoot, toRel)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 60*time.Second)
	defer cancel()
	cmd := []string{"/bin/sh", "-c", fmt.Sprintf(`mv %s %s`, shellQuoteSingle(fromFull), shellQuoteSingle(toFull))}
	_, stderr, err := k8sPodExecRun(ctx, k8s, restCfg, ns, pod, container, cmd, nil)
	if err != nil {
		respondPVCExecFailure(c, "重命名失败", err, stderr.String())
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func shellQuoteSingle(s string) string {
	return `'` + strings.ReplaceAll(s, `'`, `'"'"'`) + `'`
}

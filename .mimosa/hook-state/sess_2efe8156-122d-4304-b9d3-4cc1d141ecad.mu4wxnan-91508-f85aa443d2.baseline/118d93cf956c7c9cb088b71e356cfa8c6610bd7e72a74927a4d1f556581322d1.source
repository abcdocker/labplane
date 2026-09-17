import React, { useEffect, useMemo, useState } from "react";
import { useAppConfig } from "@/hooks/use-app-config";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/auth/auth-context";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiDeleteJson, apiGetJson, apiPostJson, apiPutJson, type AppConfig } from "@/lib/api";
import { redisAppCenterCanWrite } from "@/lib/platform-permissions";
import { toast } from "sonner";

export type RedisTemplateConfig = {
  redisImage: string;
  exporterImage?: string;
  imagePullSecret?: string;
  registryPrefixForTags?: string;
  rdbSaveLines?: string[];
  defaultAppendonly?: boolean | null;
  extraRedisServerArgs?: string[];
};

export type RedisTemplateRow = {
  id: number;
  name: string;
  description?: string;
  config: RedisTemplateConfig;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
};

function fmtErr(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message?: string }).message);
  return String(e);
}

const emptyConfig = (): RedisTemplateConfig => ({
  redisImage: "",
  exporterImage: "",
  imagePullSecret: "",
  registryPrefixForTags: "",
  rdbSaveLines: [],
  defaultAppendonly: null,
  extraRedisServerArgs: [],
});

type AppCenterRedisTemplatesProps = {
  /** 嵌入部署向导：仅下拉选模版、无列表管理 */
  variant?: "picker";
  value?: number | null;
  onChange?: (id: number | null) => void;
  disabled?: boolean;
};

const AppCenterRedisTemplates: React.FC<AppCenterRedisTemplatesProps> = ({
  variant,
  value = null,
  onChange = () => {},
  disabled,
}) => {
  const { status: auth } = useAuth();
  const configQ = useAppConfig();
  const perm = auth?.permissions ?? configQ.data?.permissions;
  const canWrite = redisAppCenterCanWrite(auth?.role, perm);
  const qc = useQueryClient();

  const listQ = useQuery({
    queryKey: ["app-center-redis-templates"],
    queryFn: ({ signal }) =>
      apiGetJson<{ templates: RedisTemplateRow[]; mysqlRequired?: boolean }>(
        "/api/app-center/redis/templates"
      , { signal }),
  });

  const templates = listQ.data?.templates ?? [];

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RedisTemplateRow | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formCfg, setFormCfg] = useState<RedisTemplateConfig>(emptyConfig);
  const [rdbText, setRdbText] = useState("");
  const [extraArgsText, setExtraArgsText] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  /** aofPreset: unset | on | off */
  const [aofPreset, setAofPreset] = useState<"unset" | "on" | "off">("unset");

  useEffect(() => {
    if (!dialogOpen) return;
    if (editing) {
      setFormName(editing.name);
      setFormDesc(editing.description ?? "");
      setFormCfg({ ...emptyConfig(), ...editing.config });
      setRdbText((editing.config.rdbSaveLines ?? []).join("\n"));
      setExtraArgsText((editing.config.extraRedisServerArgs ?? []).join("\n"));
      const a = editing.config.defaultAppendonly;
      if (a === true) setAofPreset("on");
      else if (a === false) setAofPreset("off");
      else setAofPreset("unset");
    } else {
      setFormName("");
      setFormDesc("");
      setFormCfg(emptyConfig());
      setRdbText("");
      setExtraArgsText("");
      setAofPreset("unset");
    }
  }, [dialogOpen, editing]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const rdbLines = rdbText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const extraLines = extraArgsText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const cfg: RedisTemplateConfig = {
        ...formCfg,
        redisImage: formCfg.redisImage.trim(),
        exporterImage: formCfg.exporterImage?.trim() || undefined,
        imagePullSecret: formCfg.imagePullSecret?.trim() || undefined,
        registryPrefixForTags: formCfg.registryPrefixForTags?.trim() || undefined,
        rdbSaveLines: rdbLines.length ? rdbLines : undefined,
        extraRedisServerArgs: extraLines.length ? extraLines : undefined,
      };
      if (aofPreset === "on") cfg.defaultAppendonly = true;
      else if (aofPreset === "off") cfg.defaultAppendonly = false;
      else delete cfg.defaultAppendonly;
      const body = { name: formName.trim(), description: formDesc.trim(), config: cfg };
      if (editing) {
        await apiPutJson(`/api/app-center/redis/templates/${editing.id}`, body);
        return editing.id;
      }
      const r = await apiPostJson<{ id: number }>("/api/app-center/redis/templates", body);
      return r.id;
    },
    onSuccess: async (id) => {
      toast.success(editing ? "已更新模版" : "已创建模版");
      setDialogOpen(false);
      setEditing(null);
      await qc.invalidateQueries({ queryKey: ["app-center-redis-templates"] });
      if (variant === "picker" && !editing && typeof id === "number") {
        onChange(id);
      }
    },
    onError: (e) => toast.error(fmtErr(e)),
  });

  const delMut = useMutation({
    mutationFn: (id: number) => apiDeleteJson(`/api/app-center/redis/templates/${id}`),
    onSuccess: async () => {
      toast.success("已删除");
      setDeleteId(null);
      await qc.invalidateQueries({ queryKey: ["app-center-redis-templates"] });
      if (value === deleteId) onChange(null);
    },
    onError: (e) => toast.error(fmtErr(e)),
  });

  const pickerOptions = useMemo(
    () =>
      templates.map((t) => ({
        id: t.id,
        label: t.name,
      })),
    [templates]
  );

  if (variant === "picker") {
    return (
      <div className="space-y-2">
        <Label>部署模版</Label>
        <select
          className="flex h-9 w-full max-w-md rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled || listQ.isLoading}
          value={value ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v ? parseInt(v, 10) : null);
          }}
        >
          <option value="">请选择模版…</option>
          {pickerOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        {listQ.data?.mysqlRequired ? (
          <p className="text-[11px] text-amber-800">需要 MySQL 才能使用模版中心。</p>
        ) : templates.length === 0 ? (
          <p className="text-[11px] text-amber-800">请先在「模版中心」页创建至少一个模版。</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {listQ.data?.mysqlRequired ? (
        <Alert className="border-amber-200 bg-amber-50/90">
          <AlertTitle>需要 MySQL</AlertTitle>
          <AlertDescription className="text-sm">
            模版数据存储在平台库，请配置 <code className="rounded bg-amber-100 px-1 font-mono text-xs">MYSQL_DSN</code>。
          </AlertDescription>
        </Alert>
      ) : null}

      <Card className="overflow-hidden rounded-2xl border border-slate-200/90 shadow-sm">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">Redis 部署模版</CardTitle>
              <CardDescription className="mt-1">
                定义 Redis / redis_exporter 完整镜像、命名空间拉取 Secret、RDB save 规则与可选默认 AOF；部署向导必选其一。
              </CardDescription>
            </div>
            {canWrite ? (
              <Button
                type="button"
                size="sm"
                className="gap-1 bg-emerald-600 hover:bg-emerald-700"
                disabled={listQ.data?.mysqlRequired}
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                新建模版
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {listQ.isLoading ? (
            <div className="flex items-center gap-2 p-8 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> 加载中…
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead className="w-[80px]">ID</TableHead>
                  <TableHead>名称</TableHead>
                  <TableHead className="hidden md:table-cell">Redis 镜像</TableHead>
                  <TableHead className="hidden lg:table-cell">Pull Secret</TableHead>
                  <TableHead className="w-[120px] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-sm text-slate-500">
                      暂无模版，请点击「新建模版」。
                    </TableCell>
                  </TableRow>
                ) : (
                  templates.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono text-xs">{t.id}</TableCell>
                      <TableCell>
                        <div className="font-medium text-slate-900">{t.name}</div>
                        {t.description ? (
                          <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">{t.description}</p>
                        ) : null}
                      </TableCell>
                      <TableCell className="hidden max-w-[280px] font-mono text-[11px] text-slate-600 md:table-cell">
                        {t.config.redisImage || "—"}
                      </TableCell>
                      <TableCell className="hidden font-mono text-[11px] text-slate-600 lg:table-cell">
                        {t.config.imagePullSecret || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {canWrite ? (
                          <div className="flex justify-end gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2"
                              onClick={() => {
                                setEditing(t);
                                setDialogOpen(true);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-red-600 hover:text-red-700"
                              onClick={() => setDeleteId(t.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">只读</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑模版" : "新建模版"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>名称</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="如 生产-Harbor" />
            </div>
            <div className="space-y-1">
              <Label>说明（可选）</Label>
              <Input value={formDesc} onChange={(e) => setFormDesc(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Redis 镜像（完整 repository:tag）</Label>
              <Input
                className="font-mono text-xs"
                value={formCfg.redisImage}
                onChange={(e) => setFormCfg((c) => ({ ...c, redisImage: e.target.value }))}
                placeholder="harbor.example.com/library/redis:7.2"
              />
            </div>
            <div className="space-y-1">
              <Label>redis_exporter 镜像（可选，空则部署时用默认或环境变量）</Label>
              <Input
                className="font-mono text-xs"
                value={formCfg.exporterImage ?? ""}
                onChange={(e) => setFormCfg((c) => ({ ...c, exporterImage: e.target.value }))}
                placeholder="harbor.example.com/library/redis_exporter:v1.69.0"
              />
            </div>
            <div className="space-y-1">
              <Label>imagePullSecret 名称（可选）</Label>
              <Input
                className="font-mono text-xs"
                value={formCfg.imagePullSecret ?? ""}
                onChange={(e) => setFormCfg((c) => ({ ...c, imagePullSecret: e.target.value }))}
                placeholder="regcred"
              />
            </div>
            <div className="space-y-1">
              <Label>列举标签用仓库前缀（可选，无协议）</Label>
              <Input
                className="font-mono text-xs"
                value={formCfg.registryPrefixForTags ?? ""}
                onChange={(e) => setFormCfg((c) => ({ ...c, registryPrefixForTags: e.target.value }))}
                placeholder="harbor.example.com/library"
              />
            </div>
            <div className="space-y-1">
              <Label>RDB save 规则（每行「秒 变更数」；单行 off 关闭 RDB）</Label>
              <Textarea
                className="min-h-[72px] font-mono text-xs"
                value={rdbText}
                onChange={(e) => setRdbText(e.target.value)}
                placeholder={"900 1\n300 10\n60 10000"}
              />
            </div>
            <div className="space-y-1">
              <Label>部署向导中 AOF 初始值</Label>
              <Select value={aofPreset} onValueChange={(v) => setAofPreset(v as "unset" | "on" | "off")}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unset">不覆盖（沿用向导当前默认）</SelectItem>
                  <SelectItem value="on">默认开启 AOF</SelectItem>
                  <SelectItem value="off">默认关闭 AOF</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>附加 redis-server 参数（每行一段）</Label>
              <Textarea
                className="min-h-[56px] font-mono text-xs"
                value={extraArgsText}
                onChange={(e) => setExtraArgsText(e.target.value)}
                placeholder="databases 16"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={saveMut.isPending}
              onClick={() => saveMut.mutate()}
            >
              {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId != null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除模版？</AlertDialogTitle>
            <AlertDialogDescription>已部署实例不受影响；新部署无法再选此模版。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={delMut.isPending || deleteId == null}
              onClick={() => deleteId != null && delMut.mutate(deleteId)}
            >
              删除
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AppCenterRedisTemplates;

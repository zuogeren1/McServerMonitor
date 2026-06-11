import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  fetchServers,
  saveServer,
  deleteServer,
  saveAdminConfig,
  optimizeDatabase,
  fetchConfig,
  type ServerConfig,
  type OptimizeResult,
  type AppConfig,
} from '@/lib/api'
import { useAuthStore } from '@/store/useAuthStore'
import { esc } from '@/lib/utils'

// ---- Form Data ----
interface ServerFormData {
  name: string
  serverType: 'java' | 'bedrock'
  host: string
  port: number
  rconHost: string
  rconPort: number
  rconPassword: string
  editingId: number | null
}

const EMPTY_FORM: ServerFormData = {
  name: '', serverType: 'java', host: '', port: 25565,
  rconHost: '', rconPort: 25575, rconPassword: '', editingId: null,
}

// ---- Server Form ----
function ServerForm({ form, setForm, onSave }: {
  form: ServerFormData
  setForm: (f: ServerFormData) => void
  onSave: () => void
}) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const validate = (): boolean => {
    const e: Record<string, string> = {}
    if (!form.name.trim()) e.name = '名称不能为空'
    if (!form.host.trim()) e.host = '地址不能为空'
    else if (!/^[\w.\-]+$/.test(form.host.trim())) e.host = '地址格式无效'
    if (form.port < 1 || form.port > 65535) e.port = '端口范围 1-65535'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      await saveServer({
        id: form.editingId ?? undefined,
        name: form.name.trim(),
        server_type: form.serverType,
        primary_host: form.host.trim(),
        primary_port: form.port,
        rcon_host: form.serverType === 'java' && form.rconHost ? form.rconHost.trim() : null,
        rcon_port: form.serverType === 'java' && form.rconHost ? form.rconPort : null,
        rcon_password: form.serverType === 'java' && form.rconHost ? form.rconPassword : null,
      })
      setForm(EMPTY_FORM)
      setErrors({})
      onSave()
    } catch {
      setErrors({ _form: '保存失败' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">{form.editingId ? '编辑服务器' : '添加服务器'}</h3>
      <div>
        <label className="text-sm">名称</label>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="服务器名称" />
        {errors.name && <p className="text-xs text-(--color-offline) mt-1">{errors.name}</p>}
      </div>
      <div className="flex gap-4">
        <div className="flex-1">
          <label className="text-sm">类型</label>
          <Select value={form.serverType} onValueChange={(v) => setForm({ ...form, serverType: v as 'java' | 'bedrock' })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="java">Java</SelectItem>
              <SelectItem value="bedrock">基岩</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1">
          <label className="text-sm">地址</label>
          <Input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="mc.example.com" />
          {errors.host && <p className="text-xs text-(--color-offline) mt-1">{errors.host}</p>}
        </div>
        <div className="w-24">
          <label className="text-sm">端口</label>
          <Input type="number" value={String(form.port)} onChange={(e) => setForm({ ...form, port: Number(e.target.value) || 25565 })} />
          {errors.port && <p className="text-xs text-(--color-offline) mt-1">{errors.port}</p>}
        </div>
      </div>
      {form.serverType === 'java' && (
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="text-sm text-(--color-muted)">RCON 地址（可选）</label>
            <Input value={form.rconHost} onChange={(e) => setForm({ ...form, rconHost: e.target.value })} placeholder="留空则不启用" />
          </div>
          <div className="w-24">
            <label className="text-sm text-(--color-muted)">端口</label>
            <Input type="number" value={String(form.rconPort)} onChange={(e) => setForm({ ...form, rconPort: Number(e.target.value) || 25575 })} />
          </div>
          <div className="flex-1">
            <label className="text-sm text-(--color-muted)">密码</label>
            <Input type="password" value={form.rconPassword} onChange={(e) => setForm({ ...form, rconPassword: e.target.value })} />
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? '保存中...' : form.editingId ? '更新服务器' : '保存服务器'}
        </Button>
        {form.editingId && <Button variant="outline" onClick={() => setForm(EMPTY_FORM)}>取消</Button>}
      </div>
      {errors._form && <p className="text-xs text-(--color-offline)">{errors._form}</p>}
    </div>
  )
}

// ---- Server List ----
function ServerList({ servers, onEdit, onDelete }: {
  servers: ServerConfig[]
  onEdit: (s: ServerConfig) => void
  onDelete: (s: ServerConfig) => void
}) {
  if (servers.length === 0) return <div className="text-sm text-(--color-muted)">暂无服务器</div>
  return (
    <div>
      <h3 className="font-semibold mb-3">已添加服务器</h3>
      <div className="space-y-2">
        {servers.map((s) => (
          <div key={s.id} className="flex items-center justify-between p-3 rounded bg-(--color-hover)">
            <div>
              <span className="font-medium text-sm">{esc(s.name)}</span>
              <span className="text-xs text-(--color-muted) ml-2">{s.primary_host}:{s.primary_port}</span>
            </div>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={() => onEdit(s)}>编辑</Button>
              <Button variant="destructive" size="sm" onClick={() => onDelete(s)}>删除</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---- Settings ----
function SettingsSection() {
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [checkInterval, setCheckInterval] = useState(5)
  const [offlineThreshold, setOfflineThreshold] = useState(2)
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchConfig().then((cfg) => {
      setConfig(cfg)
      setCheckInterval(cfg.check_interval)
      setOfflineThreshold(cfg.offline_threshold)
    }).catch(() => {})
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveAdminConfig({
        username: newUsername || undefined,
        password: newPassword || undefined,
        check_interval: checkInterval,
        offline_threshold: offlineThreshold,
      })
      alert('保存成功，部分修改需重启后生效')
    } catch { alert('保存失败') } finally { setSaving(false) }
  }

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">设置</h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm">用户名</label>
          <Input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="留空不修改" />
        </div>
        <div>
          <label className="text-sm">密码</label>
          <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="留空不修改" />
        </div>
        <div>
          <label className="text-sm">检测间隔（秒）</label>
          <Input type="number" value={String(checkInterval)} onChange={(e) => setCheckInterval(Number(e.target.value) || 5)} />
        </div>
        <div>
          <label className="text-sm">下线通知阈值（次）</label>
          <Input type="number" value={String(offlineThreshold)} onChange={(e) => setOfflineThreshold(Number(e.target.value) || 2)} />
        </div>
      </div>
      {config?.host != null && (
        <div className="text-xs text-(--color-muted)">当前监听: {config.host}:{config.port} | 数据库: {config.db_path}</div>
      )}
      <Button onClick={handleSave} disabled={saving}>{saving ? '保存中...' : '保存设置'}</Button>
    </div>
  )
}

// ---- Optimize ----
function OptimizeSection() {
  const [result, setResult] = useState<OptimizeResult | null>(null)
  const [loading, setLoading] = useState(false)
  const handleOptimize = async () => {
    if (!confirm('优化数据库前建议备份 monitor.db 文件。继续？')) return
    setLoading(true)
    try { setResult(await optimizeDatabase()) } catch { alert('优化失败') } finally { setLoading(false) }
  }
  return (
    <div className="space-y-3">
      <h3 className="font-semibold">数据库优化</h3>
      <p className="text-sm text-(--color-muted)">执行 VACUUM 回收空间并清理过期数据</p>
      <Button variant="outline" onClick={handleOptimize} disabled={loading}>{loading ? '优化中...' : '优化数据库'}</Button>
      {result && !result.error && (
        <div className="text-sm text-(--color-muted) space-y-0.5">
          <div>清理前: {Math.round(result.vacuum_size_before / 1024)} KB</div>
          <div>清理后: {Math.round(result.vacuum_size_after / 1024)} KB</div>
          <div>删除历史记录: {result.deleted_history} 条</div>
          <div>删除碎片会话: {result.deleted_sessions} 条</div>
        </div>
      )}
      {result?.error && <p className="text-sm text-(--color-offline)">{result.error}</p>}
    </div>
  )
}

// ---- Main Page ----
export function AdminPage() {
  const loggedIn = useAuthStore((s) => s.loggedIn)
  const requireLogin = useAuthStore((s) => s.requireLogin)
  const [form, setForm] = useState<ServerFormData>(EMPTY_FORM)
  const [servers, setServers] = useState<ServerConfig[]>([])
  const [serversLoaded, setServersLoaded] = useState(false)

  const loadServers = () => {
    fetchServers().then(setServers).catch(() => {})
  }
  useEffect(() => {
    if (!serversLoaded && loggedIn) { loadServers(); setServersLoaded(true) }
  }, [loggedIn, serversLoaded])

  const handleDelete = async (s: ServerConfig) => {
    if (!confirm(`确定删除 "${s.name}"？`)) return
    const cleanData = confirm('同时删除关联的历史数据？')
    try {
      await deleteServer(s.id, cleanData)
      setServers((prev) => prev.filter((x) => x.id !== s.id))
    } catch { /* ignore */ }
  }

  if (requireLogin && !loggedIn) {
    return <div className="p-6 text-(--color-muted)">请先登录</div>
  }

  return (
    <div className="p-6 max-w-3xl">
      <h2 className="text-xl font-bold mb-6">管理</h2>
      <ServerForm form={form} setForm={setForm} onSave={loadServers} />
      <div className="my-8 border-t border-(--color-border)" />
      <ServerList servers={servers} onEdit={(s) => setForm({ name: s.name, serverType: s.server_type, host: s.primary_host, port: s.primary_port, rconHost: s.rcon_host ?? '', rconPort: s.rcon_port ?? 25575, rconPassword: '', editingId: s.id })} onDelete={handleDelete} />
      <div className="my-8 border-t border-(--color-border)" />
      <SettingsSection />
      <div className="my-8 border-t border-(--color-border)" />
      <OptimizeSection />
    </div>
  )
}

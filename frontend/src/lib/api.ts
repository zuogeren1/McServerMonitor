import { useAuthStore } from '@/store/useAuthStore'

// ---- Error ----

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

// ---- Core fetch wrapper ----

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000) // 15s 超时

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...options?.headers },
    })

    if (res.status === 401) {
      // 登录态过期 → 清除本地状态（纯 Zustand 操作，不发网络请求）
      // 注意：不在此处调 POST /api/logout——apiFetch 自身不能发网络请求，
      // 否则登出接口也走 apiFetch 会形成循环依赖。
      // 登出接口的调用在组件层显式发起（LoginDialog 的"登出"按钮）。
      useAuthStore.getState().logout()
      throw new ApiError(401, '登录已过期')
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({} as Record<string, unknown>))
      throw new ApiError(res.status, (body.error as string) || `请求失败 (${res.status})`)
    }

    return res.json() as Promise<T>
  } catch (err) {
    if (err instanceof ApiError) throw err
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError(0, '请求超时')
    }
    throw new ApiError(0, '网络连接失败')
  } finally {
    clearTimeout(timeout)
  }
}

// ---- Types ----

export interface ServerStatus {
  server_id: number
  server_name: string
  server_type: 'java' | 'bedrock'
  online: boolean
  players: { online: number; max: number; list: { name: string; id: string | null }[] }
  latency: number | null
  version: string | null
  error: string | null
  motd_html: string | null
  motd: string | null
  host?: string
  port?: number
  has_rcon: boolean
  active_host: string | null
  active_port: number | null
  backup_statuses: BackupStatus[]
  icon?: string | null
  map_name?: string
  gamemode?: string
  brand?: string
  protocol?: number | null
}

export interface BackupStatus {
  host: string
  port: number
  online: boolean
  latency: number | null
  error: string | null
  type?: string
}

export interface ServerConfig {
  id: number
  name: string
  primary_host: string
  primary_port: number
  server_type: 'java' | 'bedrock'
  rcon_host: string | null
  rcon_port: number | null
  has_rcon: boolean
  backups: BackupAddress[]
}

export interface BackupAddress {
  id: number
  host: string
  port: number
  priority: number
}

export interface HistoryPoint {
  timestamp: number
  online: boolean
  player_count: number
  player_list: string[]
  latency: number | null
}

export type HistoryResponse = HistoryPoint[]

export interface PlayerInfo {
  name: string
  uuid: string | null
  online: boolean
  first_seen: number | null
  last_seen: number | null
  total_online_seconds: number
  current_server: string
}

export interface PlayerDetail extends PlayerInfo {
  recent_servers: RecentServer[]
  hourly_minutes: number[]
  anon_count: number
}

export interface RecentServer {
  server_id: number
  server_name: string
  login_time: number
  logout_time: number | null
}

export interface AppConfig {
  check_interval: number
  need_login: boolean
  require_login: boolean
  offline_threshold: number
  host?: string
  port?: number
  db_path?: string
}

export interface OptimizeResult {
  vacuum_size_before: number
  vacuum_size_after: number
  deleted_history: number
  deleted_sessions: number
  error?: string
}

// ---- API functions ----

export function fetchStatus(): Promise<ServerStatus[]> {
  return apiFetch<ServerStatus[]>('/api/status')
}

export function fetchSingleStatus(sid: number): Promise<ServerStatus> {
  return apiFetch<ServerStatus>(`/api/status/${sid}`)
}

export function fetchConfig(): Promise<AppConfig> {
  return apiFetch<AppConfig>('/api/config')
}

export function fetchServers(): Promise<ServerConfig[]> {
  return apiFetch<ServerConfig[]>('/api/servers')
}

export function fetchServerConfig(sid: number): Promise<ServerConfig> {
  return apiFetch<ServerConfig>(`/api/servers/${sid}`)
}

export function saveServer(data: Record<string, unknown>): Promise<{ id: number }> {
  if (data.id) {
    return apiFetch<{ id: number }>(`/api/servers/${data.id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }
  return apiFetch<{ id: number }>('/api/servers', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function deleteServer(sid: number, cleanData: boolean): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(
    `/api/servers/${sid}?clean_data=${cleanData ? '1' : '0'}`,
    { method: 'DELETE' }
  )
}

export function checkServerName(name: string): Promise<{ exists: boolean; deleted_server_name?: string }> {
  return apiFetch<{ exists: boolean; deleted_server_name?: string }>(
    `/api/servers/check-name?name=${encodeURIComponent(name)}`
  )
}

export function cleanupServerData(name: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>('/api/servers/cleanup', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export function fetchHistory(
  sid: number,
  range?: string,
  start?: string,
  end?: string
): Promise<HistoryPoint[]> {
  if (start && end) {
    return apiFetch<HistoryPoint[]>(
      `/api/servers/${sid}/history?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
    )
  }
  return apiFetch<HistoryPoint[]>(`/api/servers/${sid}/history?range=${range ?? '15m'}`)
}

export function fetchPlayerListAtTime(
  sid: number,
  ts: string
): Promise<{ players: string[] }> {
  return apiFetch<{ players: string[] }>(
    `/api/servers/${sid}/player-list?ts=${encodeURIComponent(ts)}`
  )
}

export function fetchPlayers(
  filter?: string,
  sort?: string
): Promise<PlayerInfo[]> {
  const params = new URLSearchParams()
  if (filter) params.set('filter', filter)
  if (sort) params.set('sort', sort)
  const qs = params.toString()
  return apiFetch<PlayerInfo[]>(`/api/players${qs ? '?' + qs : ''}`)
}

export function fetchPlayerDetail(name: string): Promise<PlayerDetail> {
  return apiFetch<PlayerDetail>(`/api/players/${encodeURIComponent(name)}`)
}

export function deletePlayer(name: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/api/players/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  })
}

export function login(username: string, password: string): Promise<{ ok: boolean; error?: string }> {
  return apiFetch<{ ok: boolean; error?: string }>('/api/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export function logout(): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>('/api/logout', { method: 'POST' })
}

export function saveAdminConfig(data: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  return apiFetch<{ ok: boolean; error?: string }>('/api/admin/config', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function optimizeDatabase(): Promise<OptimizeResult> {
  return apiFetch<OptimizeResult>('/api/admin/optimize', { method: 'POST' })
}

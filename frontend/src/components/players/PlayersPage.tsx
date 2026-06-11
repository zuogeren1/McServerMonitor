import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { fetchPlayers, type PlayerInfo } from '@/lib/api'
import { avatarUrl, esc, formatDuration } from '@/lib/utils'
import { useUIStore } from '@/store/useUIStore'
import { usePlayerStore } from '@/store/usePlayerStore'

export function PlayersPage() {
  const [players, setPlayers] = useState<PlayerInfo[]>([])
  const [filter, setFilter] = useState<'all' | 'online' | 'offline'>('all')
  const [sort, setSort] = useState('name')
  const [search, setSearch] = useState('')
  const setCurrentPage = useUIStore((s) => s.setCurrentPage)
  const pushNav = useUIStore((s) => s.pushNavigation)
  const setDetailName = usePlayerStore((s) => s.setDetailName)

  const loadPlayers = async () => {
    try {
      const data = await fetchPlayers(filter, sort)
      setPlayers(Array.isArray(data) ? data : [])
    } catch { /* ignore */ }
  }

  useEffect(() => { loadPlayers() }, [filter, sort])

  // 分离匿名玩家
  const regularPlayers = players.filter((p) => !p.name.includes(' '))
  const anonymousPlayers = players.filter((p) => p.name.includes(' '))

  const filterByName = (list: PlayerInfo[]) =>
    search
      ? list.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
      : list

  const filteredRegular = filterByName(regularPlayers)
  const filteredAnonymous = filterByName(anonymousPlayers)

  const currentPage = useUIStore((s) => s.currentPage)

  const openDetail = (name: string) => {
    pushNav({ page: currentPage, detailServerId: undefined })
    setDetailName(name)
    setCurrentPage('player-detail')
  }

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">玩家</h2>

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex gap-1">
          {(['all', 'online', 'offline'] as const).map((f) => (
            <Button key={f} variant={filter === f ? 'default' : 'outline'} size="sm" onClick={() => setFilter(f)}>
              {f === 'all' ? '全部' : f === 'online' ? '在线' : '离线'}
            </Button>
          ))}
        </div>
        <Input
          className="w-48"
          placeholder="搜索玩家..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={sort} onValueChange={(v) => setSort(v ?? 'name')}>
          <SelectTrigger className="w-32">
            <SelectValue>{sort === 'name' ? '名称' : sort === 'last_seen' ? '最后在线' : '在线时长'}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">名称</SelectItem>
            <SelectItem value="last_seen">最后在线</SelectItem>
            <SelectItem value="total_time">在线时长</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 匿名玩家区域 */}
      {filteredAnonymous.length > 0 && (
        <div className="mb-4 p-3 rounded border border-(--color-border) bg-(--color-hover)">
          {filteredAnonymous.map((p) => (
            <div key={p.name} className="flex items-center gap-3 px-2 py-1">
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium">{esc(p.name)}</span>
              </div>
              <span className="text-xs text-(--color-muted)">
                {formatDuration(p.total_online_seconds)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-1">
        {filteredRegular.map((p) => (
          <div
            key={p.name}
            className="flex items-center gap-3 px-3 py-2 rounded hover:bg-white/10 cursor-pointer transition-colors"
            onClick={() => openDetail(p.name)}
          >
            <img src={avatarUrl(p.uuid, p.name)} alt="" className="w-8 h-8 rounded" onError={(e) => { (e.target as HTMLImageElement).src = avatarUrl(null, '') }} />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{esc(p.name)}</div>
              <div className="text-xs text-(--color-muted)">
                {p.online ? '在线' : `最后在线: ${p.last_seen ? new Date(p.last_seen * 1000).toLocaleString('zh-CN') : '--'}`}
              </div>
            </div>
            <div className="text-sm text-(--color-muted) shrink-0">
              {formatDuration(p.total_online_seconds)}
            </div>
          </div>
        ))}
      </div>

      {regularPlayers.length === 0 && anonymousPlayers.length === 0 && (
        <div className="text-center py-16 text-(--color-muted)">暂无玩家数据</div>
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { fetchPlayers, deletePlayer, type PlayerInfo } from '@/lib/api'
import { avatarUrl, esc, formatDuration } from '@/lib/utils'

export function PlayerManagePage() {
  const [players, setPlayers] = useState<PlayerInfo[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const loadPlayers = async () => {
    try {
      const data = await fetchPlayers()
      setPlayers(data.players)
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadPlayers() }, [])

  const handleDelete = async (name: string) => {
    if (!confirm(`确定删除玩家 "${name}" 的所有数据？此操作不可撤销。`)) return
    try {
      await deletePlayer(name)
      setPlayers((prev) => prev.filter((p) => p.name !== name))
    } catch { /* ignore */ }
  }

  const filtered = players.filter((p) =>
    search ? p.name.toLowerCase().includes(search.toLowerCase()) : true
  )

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">玩家管理</h2>
      <div className="flex gap-3 mb-4">
        <Input
          className="w-64"
          placeholder="搜索玩家..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <p className="text-(--color-muted)">加载中...</p>
      ) : (
        <div className="space-y-1">
          {filtered.map((p) => (
            <div key={p.name} className="flex items-center gap-3 px-3 py-2 rounded hover:bg-(--color-hover)">
              <img src={avatarUrl(p.uuid, p.name)} alt="" className="w-8 h-8 rounded" onError={(e) => { (e.target as HTMLImageElement).src = avatarUrl(null, '') }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{esc(p.name)}</div>
              </div>
              <div className="text-sm text-(--color-muted)">{formatDuration(p.total_time)}</div>
              <Button variant="destructive" size="sm" onClick={() => handleDelete(p.name)}>删除</Button>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-16 text-(--color-muted)">暂无玩家数据</div>
          )}
        </div>
      )}
    </div>
  )
}

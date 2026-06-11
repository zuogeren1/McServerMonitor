import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { fetchPlayerDetail, type PlayerDetail as PlayerDetailType } from '@/lib/api'
import { avatarUrl, esc, formatDuration } from '@/lib/utils'
import { useUIStore } from '@/store/useUIStore'
import { usePlayerStore } from '@/store/usePlayerStore'
import { ArrowLeft, Copy, Check } from 'lucide-react'

export function PlayerDetailPage() {
  const detailName = usePlayerStore((s) => s.detailName)
  const popNav = useUIStore((s) => s.popNavigation)
  const setCurrentPage = useUIStore((s) => s.setCurrentPage)

  const [player, setPlayer] = useState<PlayerDetailType | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!detailName) return
    setLoading(true)
    fetchPlayerDetail(detailName)
      .then(setPlayer)
      .catch(() => setPlayer(null))
      .finally(() => setLoading(false))
  }, [detailName])

  const handleBack = () => {
    const prev = popNav()
    setCurrentPage(prev?.page ?? 'players')
  }

  const copyName = useCallback(async () => {
    if (!player) return
    try {
      await navigator.clipboard.writeText(player.name)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* ignore */ }
  }, [player])

  if (loading) return <div className="p-6 text-(--color-muted)">加载中...</div>
  if (!player) return (
    <div className="p-6">
      <Button variant="ghost" onClick={handleBack}><ArrowLeft size={16} className="mr-1" /> 返回</Button>
      <p className="text-(--color-muted) mt-4">未找到玩家</p>
    </div>
  )

  return (
    <div className="p-6">
      <Button variant="ghost" onClick={handleBack} className="mb-4">
        <ArrowLeft size={16} className="mr-1" /> 返回
      </Button>

      <div className="flex items-start gap-4 mb-6">
        <img src={avatarUrl(player.uuid, player.name)} alt="" className="w-16 h-16 rounded-lg" onError={(e) => { (e.target as HTMLImageElement).src = avatarUrl(null, '') }} />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold">{esc(player.name)}</h2>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={copyName} title="复制名称">
              {copied ? <Check size={14} className="text-(--color-online)" /> : <Copy size={14} />}
            </Button>
          </div>
          <div className="text-sm text-(--color-muted) mt-1 space-y-0.5">
            {player.uuid && <div>UUID: {player.uuid}</div>}
            <div>状态: {player.current_online ? '在线' : '离线'}</div>
            <div>总在线时长: {formatDuration(player.total_time)}</div>
          </div>
        </div>
      </div>

      {/* 24 小时分布 */}
      {player.hourly_distribution && player.hourly_distribution.length > 0 && (
        <div className="mb-6 rounded-lg bg-(--color-card) border border-(--color-border) p-4">
          <h3 className="font-semibold mb-3">24 小时在线时段</h3>
          <div className="h-40 flex items-end justify-between gap-px">
            {player.hourly_distribution.map((b, i) => {
              const max = Math.max(...player.hourly_distribution.map((x) => x.minutes), 1)
              const pct = (b.minutes / max) * 100
              return (
                <div key={i} className="flex-1 flex flex-col items-center">
                  <div
                    className="w-full rounded-t bg-(--color-accent)"
                    style={{ height: `${Math.max(pct, 1)}%`, opacity: pct > 0 ? 0.8 : 0.2 }}
                    title={`${i}:00 — ${b.minutes} 分钟`}
                  />
                  {i % 4 === 0 && <span className="text-xs text-(--color-muted) mt-1">{i}</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 最近游玩服务器 */}
      {player.recent_servers && player.recent_servers.length > 0 && (
        <div className="rounded-lg bg-(--color-card) border border-(--color-border) p-4">
          <h3 className="font-semibold mb-2">最近游玩服务器</h3>
          <div className="space-y-1 text-sm">
            {player.recent_servers.map((rs, i) => (
              <div key={i} className="flex justify-between">
                <span className="cursor-pointer hover:text-(--color-accent)" onClick={() => {}}>
                  {esc(rs.server_name)}
                </span>
                <span className="text-(--color-muted)">{rs.last_seen}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

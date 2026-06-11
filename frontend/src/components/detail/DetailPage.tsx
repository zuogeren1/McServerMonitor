import { useServerStore } from '@/store/useServerStore'
import { useUIStore } from '@/store/useUIStore'
import { ServerInfoPanel } from './ServerInfoPanel'
import { BackupStatusPanel } from './BackupStatusPanel'
import { RangeSelector } from './RangeSelector'
import { HistoryChart } from './HistoryChart'
import { ArrowLeft, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useState } from 'react'
import { avatarUrl, esc } from '@/lib/utils'
import { usePlayerStore } from '@/store/usePlayerStore'

export function DetailPage() {
  const statuses = useServerStore((s) => s.statuses)
  const detailServerId = useServerStore((s) => s.detailServerId)
  const popNav = useUIStore((s) => s.popNavigation)
  const setCurrentPage = useUIStore((s) => s.setCurrentPage)
  const pushNav = useUIStore((s) => s.pushNavigation)
  const setDetailName = usePlayerStore((s) => s.setDetailName)

  const server = statuses.find((x) => x.server_id === detailServerId)
  const [range, setRange] = useState('15m')
  const [customStart, setCustomStart] = useState<number | undefined>()
  const [customEnd, setCustomEnd] = useState<number | undefined>()
  const [pinned, setPinned] = useState<{ ts: number; players: string[] } | null>(null)

  const handleBack = () => {
    const prev = popNav()
    setCurrentPage(prev?.page ?? 'home')
  }

  const handleRangeChange = (newRange: string, start?: number, end?: number) => {
    setPinned(null)
    setRange(newRange)
    if (newRange === 'custom' && start && end) {
      setCustomStart(start)
      setCustomEnd(end)
    } else {
      setCustomStart(undefined)
      setCustomEnd(undefined)
    }
  }

  const handlePointClick = (ts: number, players: string[]) => {
    setPinned(ts ? { ts, players } : null)
  }

  const openPlayerDetail = (name: string) => {
    pushNav({ page: 'player-detail' })
    setDetailName(name)
    setCurrentPage('player-detail')
  }

  if (!server) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={handleBack} className="mb-4">
          <ArrowLeft size={16} className="mr-1" /> 返回
        </Button>
        <p className="text-(--color-muted)">服务器不在线或未找到</p>
      </div>
    )
  }

  const playerList = server.players.list || []
  const normalPlayers = playerList.filter((p) => !(p.name || '').includes(' '))
  const anonCount = playerList.filter((p) => (p.name || '').includes(' ')).length

  return (
    <div className="p-6">
      <Button variant="ghost" onClick={handleBack} className="mb-4">
        <ArrowLeft size={16} className="mr-1" /> 返回
      </Button>

      {/* 三卡片布局 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* 服务器信息卡片 */}
        <ServerInfoPanel server={server} />

        {/* 在线玩家卡片 */}
        <div className="rounded-lg bg-(--color-card) border border-(--color-border) p-4">
          <h3 className="font-semibold mb-3">
            在线玩家 <span className="text-(--color-muted) font-normal">({server.players.online} / {server.players.max})</span>
          </h3>
          {normalPlayers.length === 0 && anonCount === 0 ? (
            <p className="text-sm text-(--color-muted)">暂无在线玩家</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {normalPlayers.map((p) => (
                <button
                  key={p.name}
                  onClick={() => openPlayerDetail(p.name)}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-(--color-hover) transition-colors text-sm"
                  title="点击查看玩家详情"
                >
                  <img src={avatarUrl(null, p.name)} alt="" className="w-5 h-5 rounded" onError={(e) => { (e.target as HTMLImageElement).src = avatarUrl(null, '') }} />
                  <span className="truncate max-w-[100px]">{esc(p.name)}</span>
                </button>
              ))}
              {anonCount > 0 && (
                <button
                  onClick={() => openPlayerDetail('Anonymous Player')}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-(--color-hover) transition-colors text-sm opacity-70"
                  title="点击查看匿名玩家详情"
                >
                  <span>Anonymous Player x{anonCount}</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* 副地址卡片 */}
        <BackupStatusPanel server={server} />
      </div>

      {/* 图表区域 */}
      <div className="rounded-lg bg-(--color-card) border border-(--color-border) p-4">
        <RangeSelector range={range} onRangeChange={handleRangeChange} />
        <div className="mt-4">
          <HistoryChart
            serverId={server.server_id}
            range={range}
            startTs={customStart}
            endTs={customEnd}
            onPointClick={handlePointClick}
          />
        </div>
        {pinned !== null && (
          <div className="mt-4 p-3 rounded border border-(--color-border) bg-(--color-hover)">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">
                在线玩家 @ {new Date(pinned.ts * 1000).toLocaleString('zh-CN')}
              </span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setPinned(null)}>
                <X size={14} />
              </Button>
            </div>
            {pinned.players.length === 0 ? (
              <p className="text-xs text-(--color-muted)">无在线玩家</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {pinned.players.map((name) => (
                  <div key={name} className="flex items-center gap-1.5 px-2 py-1 rounded bg-(--color-card) text-sm">
                    <img src={avatarUrl(null, name)} alt="" className="w-5 h-5 rounded" onError={(e) => { (e.target as HTMLImageElement).src = avatarUrl(null, '') }} />
                    <span>{esc(name)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

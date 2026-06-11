import { useServerStore } from '@/store/useServerStore'
import { useUIStore } from '@/store/useUIStore'
import { ServerInfoPanel } from './ServerInfoPanel'
import { PlayerChipList } from './PlayerChipList'
import { BackupStatusPanel } from './BackupStatusPanel'
import { RangeSelector } from './RangeSelector'
import { HistoryChart } from './HistoryChart'
import { ArrowLeft, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useState, useEffect, useRef } from 'react'
import { avatarUrl, esc } from '@/lib/utils'

export function DetailPage() {
  const statuses = useServerStore((s) => s.statuses)
  const detailServerId = useServerStore((s) => s.detailServerId)
  const popNav = useUIStore((s) => s.popNavigation)
  const setCurrentPage = useUIStore((s) => s.setCurrentPage)

  const server = statuses.find((x) => x.server_id === detailServerId)
  const [range, setRange] = useState('15m')
  const [customStart, setCustomStart] = useState<number | undefined>()
  const [customEnd, setCustomEnd] = useState<number | undefined>()
  const [pinnedPlayers, setPinnedPlayers] = useState<string[] | null>(null)
  const [pinnedTs, setPinnedTs] = useState('')
  const chartKeyRef = useRef(0)

  // 切换到非实时模式时停止实时轮询
  useEffect(() => {
    chartKeyRef.current++
  }, [range, customStart, customEnd])

  const handleBack = () => {
    const prev = popNav()
    setCurrentPage(prev?.page ?? 'home')
  }

  const handleRangeChange = (newRange: string, start?: number, end?: number) => {
    setPinnedPlayers(null)
    setPinnedTs('')
    setRange(newRange)
    if (newRange === 'custom' && start && end) {
      setCustomStart(start)
      setCustomEnd(end)
    } else {
      setCustomStart(undefined)
      setCustomEnd(undefined)
    }
  }

  const handlePointClick = (ts: string, players: string[]) => {
    if (!ts || players.length === 0) {
      setPinnedPlayers(null)
      setPinnedTs('')
      return
    }
    setPinnedTs(ts)
    setPinnedPlayers(players)
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

  return (
    <div className="p-6">
      <Button variant="ghost" onClick={handleBack} className="mb-4">
        <ArrowLeft size={16} className="mr-1" /> 返回
      </Button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2">
          <ServerInfoPanel server={server} />
        </div>
        <div className="space-y-4">
          <PlayerChipList server={server} />
          <BackupStatusPanel server={server} />
        </div>
      </div>

      <div className="rounded-lg bg-(--color-card) border border-(--color-border) p-4">
        <RangeSelector range={range} onRangeChange={handleRangeChange} />
        <div className="mt-4">
          <HistoryChart
            key={`${chartKeyRef.current}`}
            serverId={server.server_id}
            range={range}
            startTs={customStart}
            endTs={customEnd}
            onPointClick={handlePointClick}
          />
        </div>
        {pinnedPlayers !== null && (
          <PinnedPlayers
            ts={pinnedTs}
            players={pinnedPlayers}
            onClose={() => { setPinnedPlayers(null); setPinnedTs('') }}
          />
        )}
      </div>
    </div>
  )
}

function PinnedPlayers({ ts, players, onClose }: { ts: string; players: string[]; onClose: () => void }) {
  return (
    <div className="mt-4 p-3 rounded border border-(--color-border) bg-(--color-hover)">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">
          在线玩家 @ {new Date(Number(ts) * 1000).toLocaleString('zh-CN')}
        </span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X size={14} />
        </Button>
      </div>
      {players.length === 0 ? (
        <p className="text-xs text-(--color-muted)">无在线玩家</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {players.map((name) => (
            <div key={name} className="flex items-center gap-1.5 px-2 py-1 rounded bg-(--color-card) text-sm">
              <img src={avatarUrl(null, name)} alt="" className="w-5 h-5 rounded" onError={(e) => { (e.target as HTMLImageElement).src = avatarUrl(null, '') }} />
              <span>{esc(name)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

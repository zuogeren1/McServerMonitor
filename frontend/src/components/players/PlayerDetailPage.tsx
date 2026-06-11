import { useEffect, useState, useCallback, useRef } from 'react'
import { Chart } from 'chart.js'
import { Button } from '@/components/ui/button'
import { fetchPlayerDetail, type PlayerDetail as PlayerDetailType } from '@/lib/api'
import { avatarUrl, esc, formatDuration } from '@/lib/utils'
import { useUIStore } from '@/store/useUIStore'
import { usePlayerStore } from '@/store/usePlayerStore'
import { useServerStore } from '@/store/useServerStore'
import { ArrowLeft, Copy, Check } from 'lucide-react'

function PlayerBarChart({ data }: { data: number[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)

  useEffect(() => {
    if (!canvasRef.current || data.length === 0) return
    if (chartRef.current) chartRef.current.destroy()

    const labels = Array.from({ length: 24 }, (_, i) => `${i}`)
    const ctx = canvasRef.current.getContext('2d')!
    chartRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: 'rgba(99,102,241,0.5)',
          borderColor: '#6366f1',
          borderWidth: 1,
          borderRadius: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => `${items[0].label}:00`,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              label: (ctx: any) => `${ctx.parsed.y} 分钟`,
            },
          },
        },
        scales: {
          x: {
            ticks: { color: '#94a3b8', font: { size: 9 }, maxTicksLimit: 24 },
            grid: { display: false },
          },
          y: {
            beginAtZero: true,
            ticks: { color: '#94a3b8', font: { size: 10 }, precision: 0 },
            grid: { color: 'rgba(255,255,255,0.04)' },
          },
        },
      },
    })

    return () => { chartRef.current?.destroy(); chartRef.current = null }
  }, [data])

  return (
    <div className="rounded-lg bg-(--color-card) border border-(--color-border) p-4">
      <h3 className="font-semibold mb-3">24 小时在线时段</h3>
      <div className="h-40">
        <canvas ref={canvasRef} />
      </div>
    </div>
  )
}

export function PlayerDetailPage() {
  const detailName = usePlayerStore((s) => s.detailName)
  const popNav = useUIStore((s) => s.popNavigation)
  const setCurrentPage = useUIStore((s) => s.setCurrentPage)
  const pushNav = useUIStore((s) => s.pushNavigation)
  const setDetailServerId = useServerStore((s) => s.setDetailServerId)

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

  const currentPage = useUIStore((s) => s.currentPage)

  const openServer = (serverId: number) => {
    pushNav({ page: currentPage, detailServerId: undefined })
    setDetailServerId(serverId)
    setCurrentPage('detail')
  }

  const openServerRange = (serverId: number, startTs: number, endTs: number) => {
    pushNav({ page: currentPage, detailServerId: undefined })
    setDetailServerId(serverId)
    setCurrentPage('detail')
    sessionStorage.setItem('detailCustomRange', JSON.stringify({ startTs, endTs }))
  }

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
            <div>状态: {player.online ? '在线' : '离线'}</div>
            <div>总在线时长: {formatDuration(player.total_online_seconds)}</div>
          </div>
        </div>
      </div>

      {/* 24 小时分布柱状图 */}
      {player.hourly_minutes.length > 0 && (
        <div className="mb-6">
          <PlayerBarChart data={player.hourly_minutes} />
        </div>
      )}

      {/* 最近游玩服务器 */}
      {player.recent_servers.length > 0 && (
        <div className="rounded-lg bg-(--color-card) border border-(--color-border) p-4">
          <h3 className="font-semibold mb-2">最近游玩服务器</h3>
          <div className="space-y-1 text-sm">
            {player.recent_servers.map((rs, i) => {
              const startStr = new Date(rs.login_time * 1000).toLocaleString('zh-CN')
              const endStr = rs.logout_time
                ? new Date(rs.logout_time * 1000).toLocaleString('zh-CN')
                : '现在'
              const endTs = rs.logout_time || Math.floor(Date.now() / 1000)
              return (
                <div key={i} className="flex justify-between items-center">
                  <span className="cursor-pointer hover:text-(--color-accent)" onClick={() => openServer(rs.server_id)}>
                    {esc(rs.server_name)}
                  </span>
                  <span
                    className="text-(--color-muted) cursor-pointer hover:text-(--color-accent)"
                    onClick={() => openServerRange(rs.server_id, rs.login_time, endTs)}
                    title="点击查看此时段折线图"
                  >
                    {startStr} ~ {endStr}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

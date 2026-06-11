import { useEffect, useRef, useState, useCallback } from 'react'
import { Chart, type Plugin } from 'chart.js'
import type { AnyChartInstance } from '@/plugins/chart/types'
import { crosshairPlugin } from '@/plugins/chart/crosshair'
import { scrollbarSyncPlugin, setChartBounds, setScrollbarCallback } from '@/plugins/chart/scrollbarSync'
import { appendRealtimeData } from '@/plugins/chart/realtimeAppend'
import { fetchHistory, fetchPlayerListAtTime, type HistoryPoint } from '@/lib/api'
import { ChartScrollbar } from './ChartScrollbar'

interface Props {
  serverId: number
  range: string
  startTs?: number
  endTs?: number
  onPointClick?: (ts: number, players: string[]) => void
}

function buildPointData(data: HistoryPoint[]) {
  return {
    labels: data.map((p) => p.timestamp * 1000),
    values: data.map((p) => p.online ? p.player_count : null as number | null),
  }
}

export function HistoryChart({ serverId, range, startTs, endTs, onPointClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<AnyChartInstance | null>(null)
  const historyDataRef = useRef<HistoryPoint[]>([])
  const [scrollbarPos, setScrollbarPos] = useState({ left: 0, width: 100 })
  const [fullRange, setFullRange] = useState({ min: 0, max: 0 })
  const prevRangeRef = useRef(range)

  // 加载数据并创建/更新图表
  useEffect(() => {
    let cancelled = false

    ;(async () => {
      let data: HistoryPoint[]
      let showDate = true
      if (range === 'custom' && startTs && endTs) {
        data = await fetchHistory(serverId, undefined, String(startTs), String(endTs))
        showDate = (endTs - startTs) > 86400
      } else {
        data = await fetchHistory(serverId, range)
        showDate = range !== '15m' && range !== '1h'
      }
      if (cancelled || !Array.isArray(data) || data.length === 0) return

      historyDataRef.current = data
      const { labels, values } = buildPointData(data)
      const fullMin = labels[0]
      const fullMax = labels[labels.length - 1]
      setFullRange({ min: fullMin, max: fullMax })
      setChartBounds(fullMin, fullMax)
      const dataMax = Math.max(...values.filter((v) => v != null), 0)
      const yMax = dataMax === 0 ? 5 : dataMax + Math.max(3, Math.ceil(dataMax * 0.2))
      const isR = range === '15m'
      const pointData = labels.map((l, i) => ({ x: l, y: values[i] }))

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tooltipTitle = (items: any[]) => {
        const d = new Date(items[0].parsed.x ?? 0)
        return showDate
          ? d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
          : d.toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      }

      // 已有图表 → 更新数据（保留过渡动画）
      if (chartRef.current) {
        const c = chartRef.current
        c.data.datasets[0].data = pointData
        const xOpts = c.options.scales!.x!
        xOpts.min = isR ? undefined : fullMin
        xOpts.max = isR ? undefined : fullMax
        if (c.options.scales!.y) (c.options.scales!.y as Record<string, unknown>).max = yMax
        const zoomOpts = c.options.plugins?.zoom as Record<string, Record<string, unknown>> | undefined
        if (zoomOpts) {
          zoomOpts.zoom.wheel = { enabled: !isR }
          zoomOpts.zoom.drag = { enabled: !isR, backgroundColor: 'rgba(99,102,241,0.08)', borderColor: 'rgba(99,102,241,0.3)' }
          zoomOpts.zoom.pinch = { enabled: !isR }
          zoomOpts.limits = { x: { min: fullMin, max: fullMax, minRange: 60000 } }
        }
        c.update()
        prevRangeRef.current = range
        return
      }

      // 首次创建——始终包含两个插件，scrollbarSyncPlugin 仅影响状态更新
      const activePlugins: Plugin[] = [crosshairPlugin as Plugin, scrollbarSyncPlugin as Plugin]

      const ctx = canvasRef.current!.getContext('2d')!
      chartRef.current = new Chart(ctx, {
        type: 'line',
        data: { datasets: [{ data: pointData, label: '在线玩家', borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.1)', fill: true, tension: 0.3, pointRadius: 2, pointHoverRadius: 7, pointBackgroundColor: '#6366f1', pointHoverBackgroundColor: '#f59e0b', borderWidth: 1.5, spanGaps: false }] },
        options: {
          responsive: true, maintainAspectRatio: false, parsing: false,
          animation: { duration: 400, easing: 'easeOutQuart' },
          interaction: { mode: 'index' as const, intersect: false },
          plugins: {
            legend: { display: false },
            decimation: { enabled: true, algorithm: 'lttb', samples: 400 },
            tooltip: { callbacks: { title: tooltipTitle as unknown as () => string, label: (ctx: { parsed: { y: number | null } }) => ctx.parsed.y != null ? `在线: ${ctx.parsed.y} 人` : '服务器离线' } },
            zoom: { zoom: { wheel: { enabled: !isR }, drag: { enabled: !isR, backgroundColor: 'rgba(99,102,241,0.08)', borderColor: 'rgba(99,102,241,0.3)' }, pinch: { enabled: !isR }, mode: 'x' as const }, limits: { x: { min: fullMin, max: fullMax, minRange: 60000 } } },
          },
          scales: {
            x: { type: 'time', time: { tooltipFormat: showDate ? 'MM-dd HH:mm:ss' : 'HH:mm:ss', displayFormats: showDate ? { second: 'MM-dd HH:mm:ss', minute: 'MM-dd HH:mm', hour: 'MM-dd HH:mm', day: 'MM-dd' } : { second: 'HH:mm:ss', minute: 'HH:mm', hour: 'HH:mm' } }, ...(isR ? {} : { min: fullMin, max: fullMax }), ticks: { color: '#94a3b8', maxTicksLimit: 20, font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
            y: { beginAtZero: true, max: yMax, ticks: { color: '#94a3b8', precision: 0, font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
          },
          onClick: async (_event, elements) => {
            if (elements.length === 0) { onPointClick?.(0, []); return }
            const el = elements[0].element as { $context?: { parsed: { x: number } } }
            const tsSec = el.$context?.parsed.x ? el.$context.parsed.x / 1000 : null
            if (!tsSec) return
            const pt = historyDataRef.current.find((d) => Math.abs(d.timestamp - tsSec) < 0.5)
            if (pt?.player_list.length) { onPointClick?.(pt.timestamp, pt.player_list); return }
            try { const r = await fetchPlayerListAtTime(serverId, String(tsSec)); onPointClick?.(Number(tsSec), Array.isArray(r) ? r : []) } catch { /* */ }
          },
        },
        plugins: activePlugins,
      })
      setScrollbarCallback((left: number, width: number) => setScrollbarPos({ left, width }))
      prevRangeRef.current = range
    })()

    return () => { cancelled = true }
  }, [serverId, range, startTs, endTs, onPointClick])

  // 组件销毁时清理
  useEffect(() => {
    return () => {
      setScrollbarCallback(null)
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null }
    }
  }, [])

  // 15m 实时轮询
  useEffect(() => {
    if (range !== '15m') return
    const timer = setInterval(() => appendRealtimeData(serverId, chartRef.current), 5000)
    return () => clearInterval(timer)
  }, [serverId, range])

  const handlePan = useCallback((targetMin: number, targetMax: number, _vr: number) => {
    if (!chartRef.current?.options.scales?.x) return
    chartRef.current.options.scales.x.min = targetMin
    chartRef.current.options.scales.x.max = targetMax
    chartRef.current.update('none')
  }, [])

  return (
    <div>
      <div className="relative h-80">
        <canvas ref={canvasRef} />
      </div>
      {range !== '15m' && (
        <ChartScrollbar chartRef={chartRef} leftPct={scrollbarPos.left} widthPct={scrollbarPos.width} onPan={handlePan} fullMin={fullRange.min} fullMax={fullRange.max} />
      )}
    </div>
  )
}

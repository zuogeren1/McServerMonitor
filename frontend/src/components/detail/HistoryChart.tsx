import { useEffect, useRef, useState, useCallback } from 'react'
import { Chart, type Plugin } from 'chart.js'
import type { AnyChartInstance } from '@/plugins/chart/types'
import { crosshairPlugin } from '@/plugins/chart/crosshair'
import { scrollbarSyncPlugin, setChartBounds, setScrollbarCallback } from '@/plugins/chart/scrollbarSync'
import { appendRealtimeData } from '@/plugins/chart/realtimeAppend'
import { fetchHistory, fetchPlayerListAtTime, type HistoryResponse } from '@/lib/api'
import { ChartScrollbar } from './ChartScrollbar'

interface Props {
  serverId: number
  range: string
  startTs?: number
  endTs?: number
  onPointClick?: (ts: string, players: string[]) => void
}

export function HistoryChart({ serverId, range, startTs, endTs, onPointClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<AnyChartInstance | null>(null)
  const [scrollbarPos, setScrollbarPos] = useState({ left: 0, width: 100 })
  const [fullRange, setFullRange] = useState({ min: 0, max: 0 })

  const createOrUpdate = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return

    if (chartRef.current) {
      chartRef.current.destroy()
      chartRef.current = null
    }

    let data: HistoryResponse
    let showDate = true

    if (range === 'custom' && startTs && endTs) {
      data = await fetchHistory(serverId, undefined, String(startTs), String(endTs))
      showDate = (endTs - startTs) > 86400
    } else {
      data = await fetchHistory(serverId, range)
      showDate = range !== '15m' && range !== '1h'
    }

    const rawPoints: { ts: unknown; players_online: number }[] = data.data || []
    const labels = rawPoints.map((p) => {
      const ts = p.ts
      if (typeof ts === 'number') return ts * 1000
      if (typeof ts === 'string') return new Date(ts).getTime()
      return 0
    })
    const values = rawPoints.map((p) => p.players_online)
    const fullMin = labels.length > 0 ? labels[0] : 0
    const fullMax = labels.length > 0 ? labels[labels.length - 1] : 0
    setFullRange({ min: fullMin, max: fullMax })
    setChartBounds(fullMin, fullMax)

    const dataMax = Math.max(...values.filter((v) => v != null), 0)
    const yMax = dataMax === 0 ? 5 : dataMax + Math.max(3, Math.ceil(dataMax * 0.2))

    const isRealtime = range === '15m'
    const activePlugins: Plugin[] = [crosshairPlugin as Plugin]
    if (!isRealtime) activePlugins.push(scrollbarSyncPlugin as Plugin)

    const ctx = canvas.getContext('2d')!
    const pointData = labels.map((l, i) => ({ x: l, y: values[i] }))

    const newChart = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: [{
          data: pointData,
          label: '在线玩家',
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99,102,241,0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 2,
          pointHoverRadius: 7,
          pointBackgroundColor: '#6366f1',
          pointHoverBackgroundColor: '#f59e0b',
          borderWidth: 1.5,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        parsing: false,
        animation: { duration: 400, easing: 'easeOutQuart' },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          decimation: { enabled: true, algorithm: 'lttb', samples: 400 },
          tooltip: {
            callbacks: {
              title: (items) => {
                const d = new Date(items[0].parsed.x ?? 0)
                return showDate
                  ? d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
                  : d.toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
              },
              label: (ctx) => `在线: ${ctx.parsed.y} 人`,
            },
          },
          zoom: isRealtime ? undefined : {
            zoom: {
              wheel: { enabled: true },
              drag: { enabled: true, backgroundColor: 'rgba(99,102,241,0.08)', borderColor: 'rgba(99,102,241,0.3)' },
              pinch: { enabled: true },
              mode: 'x',
            },
            limits: { x: { min: fullMin, max: fullMax, minRange: 60000 } },
          },
        },
        scales: {
          x: {
            type: 'time',
            time: {
              tooltipFormat: showDate ? 'MM-dd HH:mm:ss' : 'HH:mm:ss',
              displayFormats: showDate
                ? { second: 'MM-dd HH:mm:ss', minute: 'MM-dd HH:mm', hour: 'MM-dd HH:mm', day: 'MM-dd' }
                : { second: 'HH:mm:ss', minute: 'HH:mm', hour: 'HH:mm' },
            },
            ...(isRealtime ? {} : { min: fullMin, max: fullMax }),
            ticks: { color: '#94a3b8', maxTicksLimit: 20, font: { size: 10 } },
            grid: { color: 'rgba(255,255,255,0.04)' },
          },
          y: {
            beginAtZero: true,
            max: yMax,
            ticks: { color: '#94a3b8', precision: 0, font: { size: 10 } },
            grid: { color: 'rgba(255,255,255,0.04)' },
          },
        },
        onClick: async (_event, elements) => {
          if (elements.length === 0) {
            onPointClick?.('', [])
            return
          }
          const el = elements[0].element as { $context?: { parsed: { x: number } } }
          const tsSec = el.$context?.parsed.x ? el.$context.parsed.x / 1000 : null
          if (!tsSec) return
          try {
            const res = await fetchPlayerListAtTime(serverId, String(tsSec))
            onPointClick?.(String(tsSec), res.players || [])
          } catch { /* ignore */ }
        },
      },
      plugins: activePlugins,
    })

    chartRef.current = newChart
    setScrollbarCallback((left: number, width: number) => {
      setScrollbarPos({ left, width })
    })
  }, [serverId, range, startTs, endTs, onPointClick])

  useEffect(() => {
    createOrUpdate()
    return () => {
      setScrollbarCallback(null)
      if (chartRef.current) {
        chartRef.current.destroy()
        chartRef.current = null
      }
    }
  }, [createOrUpdate])

  useEffect(() => {
    if (range !== '15m') return
    const timer = setInterval(() => {
      appendRealtimeData(serverId, chartRef.current)
    }, 5000)
    return () => clearInterval(timer)
  }, [serverId, range])

  const handlePan = useCallback(
    (targetMin: number, targetMax: number, _viewRange: number) => {
      if (!chartRef.current?.options.scales?.x) return
      chartRef.current.options.scales.x.min = targetMin
      chartRef.current.options.scales.x.max = targetMax
      chartRef.current.update('none')
    },
    []
  )

  return (
    <div>
      <div className="relative h-80">
        <canvas ref={canvasRef} />
      </div>
      {range !== '15m' && (
        <ChartScrollbar
          chartRef={chartRef}
          leftPct={scrollbarPos.left}
          widthPct={scrollbarPos.width}
          onPan={handlePan}
          fullMin={fullRange.min}
          fullMax={fullRange.max}
        />
      )}
    </div>
  )
}

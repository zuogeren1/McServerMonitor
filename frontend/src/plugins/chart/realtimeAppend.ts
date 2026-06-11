import type { AnyChartInstance } from './types'
import { fetchHistory } from '@/lib/api'

export async function appendRealtimeData(
  serverId: number,
  chart: AnyChartInstance | null
): Promise<void> {
  if (!chart) return
  try {
    const data = await fetchHistory(serverId, '15m')
    if (!Array.isArray(data) || data.length === 0) return

    const dataset = chart.data.datasets[0]
    if (!dataset) return

    const existingTimestamps = new Set(
      (dataset.data as { x: number; y: number }[]).map((d) => d.x)
    )

    for (const point of data) {
      const ts = point.timestamp * 1000
      if (!existingTimestamps.has(ts)) {
        ;(dataset.data as { x: number; y: number }[]).push({
          x: ts,
          y: point.player_count,
        })
      }
    }

    chart.update('none')
  } catch {
    // 静默失败，下次轮询再试
  }
}

import type { AnyChartInstance } from './types'
import { fetchHistory } from '@/lib/api'
import { setChartBounds } from './scrollbarSync'

export async function appendRealtimeData(
  serverId: number,
  chart: AnyChartInstance | null
): Promise<void> {
  if (!chart) return
  try {
    const data = await fetchHistory(serverId, '15m')
    if (!Array.isArray(data) || data.length === 0) return

    const dataset = chart.data.datasets[0] as { data: { x: number; y: number | null }[] }
    if (!dataset || !dataset.data) return

    const existingTimestamps = new Set(dataset.data.map((d) => d.x))
    let hasNew = false

    for (const point of data) {
      const ts = point.timestamp * 1000
      if (!existingTimestamps.has(ts)) {
        dataset.data.push({ x: ts, y: point.online ? point.player_count : null })
        hasNew = true
      }
    }

    if (!hasNew) return

    // 滚动条/缩放限制也更新到新边界
    const timestamps = dataset.data.map((d) => d.x)
    setChartBounds(Math.min(...timestamps), Math.max(...timestamps))

    chart.update('none')
  } catch {
    // 静默失败，下次轮询再试
  }
}

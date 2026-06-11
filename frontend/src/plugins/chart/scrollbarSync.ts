import type { AnyChartInstance } from './types'

// 滚动条同步插件的外部状态——由 HistoryChart 管理
let _chartFullMin = 0
let _chartFullMax = 0
let _onUpdateScrollbar: ((leftPct: number, widthPct: number) => void) | null = null

export function setChartBounds(min: number, max: number) {
  _chartFullMin = min
  _chartFullMax = max
}

export function setScrollbarCallback(cb: ((leftPct: number, widthPct: number) => void) | null) {
  _onUpdateScrollbar = cb
}

export const scrollbarSyncPlugin = {
  id: 'scrollbarSync',
  afterUpdate(chart: AnyChartInstance) {
    const fullRange = _chartFullMax - _chartFullMin
    if (fullRange <= 0) return
    const xScale = chart.scales.x
    if (!xScale) return
    const viewRange = xScale.max - xScale.min
    const proportion = Math.max(viewRange / fullRange, 0.01)
    const leftPct = Math.max(0, ((xScale.min - _chartFullMin) / fullRange) * 100)
    const widthPct = Math.max(2, Math.min(100, proportion * 100))
    _onUpdateScrollbar?.(leftPct, widthPct)

    const targetTicks = Math.round(Math.max(5, Math.min(30, 12 / proportion)))
    const ticksOpts = chart.options.scales?.x?.ticks
    if (ticksOpts) {
      ticksOpts.maxTicksLimit = targetTicks
    }

    const chartWidth = chart.chartArea?.width || 800
    const targetSamples = Math.max(50, chartWidth * 2)
    const decOpts = chart.options.plugins?.decimation
    if (decOpts && 'samples' in decOpts) {
      ;(decOpts as { samples: number }).samples = targetSamples
    }
  },
}

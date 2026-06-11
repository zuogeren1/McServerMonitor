import type { AnyChartInstance } from './types'

export const crosshairPlugin = {
  id: 'crosshair',
  afterDraw(chart: AnyChartInstance) {
    const tooltip = (chart as AnyChartInstance).tooltip
    const active = tooltip?.getActiveElements?.()
    if (!active || active.length === 0) return
    const x = (active[0].element as { x: number }).x
    const yScale = chart.scales.y
    const ctx = chart.ctx
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(x, yScale.top)
    ctx.lineTo(x, yScale.bottom)
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 3])
    ctx.stroke()
    ctx.restore()
  },
}

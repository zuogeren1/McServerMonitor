import type { Chart } from 'chart.js'

export type LineChartInstance = Chart<'line', number[], string>
export type BarChartInstance = Chart<'bar', number[], string>
/** 公共宽松类型——ChartScrollbar 等只需调 .update()/.destroy() 的组件用 */
export type AnyChartInstance = Chart

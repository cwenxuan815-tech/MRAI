import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsCoreOption } from 'echarts/core'

// 按需注册，避免整包引入 echarts 导致产物过大
echarts.use([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer,
])

interface Props {
  option: EChartsCoreOption
  /** 图表高度，默认 300 */
  height?: number
}

/** ECharts 轻量封装：负责实例创建、配置更新、容器尺寸自适应 */
export default function EChart({ option, height = 300 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)

  // 挂载时初始化实例，并监听容器尺寸变化（侧边栏折叠、窗口缩放都会触发）
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const chart = echarts.init(container)
    chartRef.current = chart

    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(container)

    return () => {
      observer.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  // 配置变化时整体重设，保证数据刷新后图表同步
  useEffect(() => {
    chartRef.current?.setOption(option, true)
  }, [option])

  return <div ref={containerRef} style={{ width: '100%', height }} />
}

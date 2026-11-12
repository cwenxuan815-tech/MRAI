import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  App,
  Badge,
  Button,
  Card,
  Empty,
  List,
  Segmented,
  Space,
  Statistic,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import {
  AlertOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import type { EChartsCoreOption } from 'echarts/core'
import EChart from '../../components/EChart'
import RiskTag from '../../components/RiskTag'
import { fetchDoctorStats, fetchLatestAlerts } from '../../api/doctor'
import { LEVEL_META } from '../../constants/medical'
import { useDoctorSocket } from '../../hooks/useDoctorSocket'
import { formatTime } from '../../utils/format'
import type {
  AlertListItem,
  DoctorSocketMessage,
  ReportDetail,
  StatsResponse,
} from '../../types'

const { Text } = Typography

/** 大屏实时列表最多保留的条数 */
const MAX_ALERTS = 30

/** 深色大屏图表的通用提示框样式 */
const DARK_TOOLTIP = {
  backgroundColor: 'rgba(8, 19, 36, 0.94)',
  borderColor: 'rgba(56, 189, 248, 0.35)',
  borderWidth: 1,
  textStyle: { color: '#e6f4ff', fontSize: 12 },
} as const

/** 深色大屏坐标轴通用样式 */
const DARK_AXIS_LABEL = { color: 'rgba(186, 226, 255, 0.62)', fontSize: 11 } as const
const DARK_SPLIT_LINE = { lineStyle: { color: 'rgba(56, 189, 248, 0.12)' } } as const

/** 统计卡图标：彩色渐变圆底，让大屏统计更有层次 */
function StatIcon({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span
      style={{
        width: 38,
        height: 38,
        borderRadius: 11,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `linear-gradient(135deg, ${color}2e, ${color}5c)`,
        border: `1px solid ${color}55`,
        color,
        fontSize: 18,
      }}
    >
      {children}
    </span>
  )
}

/** 把 WebSocket 推送的报告详情转成大屏列表条目（与后端告警列表结构一致） */
function toAlertItem(report: ReportDetail): AlertListItem {
  return {
    event_id: report.event_id,
    report_id: report.report_id,
    patient_id: report.patient_id,
    patient_name: report.patient_name,
    department: report.department,
    overall_level: report.overall_level,
    reason: report.alerts?.[0]?.title || report.summary || '未见异常',
    status: report.status,
    created_at: report.created_at,
  }
}

/** 实时监控大屏：左侧统计卡竖排 + 中间实时报告流 + 右侧图表堆叠 */
export default function DashboardPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()

  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [alerts, setAlerts] = useState<AlertListItem[]>([])
  const [loading, setLoading] = useState(false)
  // 实时插入的行做一次高亮闪烁，便于演示时观察
  const [flashingIds, setFlashingIds] = useState<string[]>([])
  const [abnormalOnly, setAbnormalOnly] = useState(false)
  const timersRef = useRef<number[]>([])
  // 图表高度随视口自适应，保证三张图与列表一屏放下不出现整页滚动
  const [chartHeight, setChartHeight] = useState(190)

  /** 拉取统计与初始列表 */
  const loadAll = useCallback(
    async (showError = true) => {
      setLoading(true)
      try {
        const [statsData, alertData] = await Promise.all([
          fetchDoctorStats(),
          fetchLatestAlerts(MAX_ALERTS),
        ])
        setStats(statsData)
        setAlerts(alertData)
      } catch (error) {
        if (showError) message.error(`加载大屏数据失败：${(error as Error).message}`)
      } finally {
        setLoading(false)
      }
    },
    [message],
  )

  /** 报告发生变化后只刷新统计数据与图表 */
  const refreshStats = useCallback(async () => {
    try {
      setStats(await fetchDoctorStats())
    } catch {
      // 静默失败：保留上一次统计结果，避免打断演示
    }
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // 视口变化时重算右侧图表高度
  useEffect(() => {
    const update = () =>
      setChartHeight(Math.max(130, Math.floor((window.innerHeight - 360) / 3)))
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // 组件卸载时清理高亮定时器
  useEffect(
    () => () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer))
      timersRef.current = []
    },
    [],
  )

  const handleMessage = useCallback(
    (payload: DoctorSocketMessage) => {
      if (payload.type === 'event_created') {
        const report = payload.data
        const item = toAlertItem(report)

        setAlerts((prev) => [item, ...prev.filter((row) => row.event_id !== item.event_id)].slice(0, MAX_ALERTS))
        setFlashingIds((prev) => [...prev, item.event_id])
        timersRef.current.push(
          window.setTimeout(
            () => setFlashingIds((prev) => prev.filter((id) => id !== item.event_id)),
            6000,
          ),
        )

        if (report.overall_level !== 'green') {
          message.warning(
            `新异常报告：${report.patient_name || report.patient_id}（${LEVEL_META[report.overall_level]?.text ?? report.overall_level}）`,
          )
        }
        refreshStats()
        return
      }

      if (payload.type === 'report_processed') {
        setAlerts((prev) =>
          prev.map((row) =>
            row.event_id === payload.data.event_id ? { ...row, status: 'processed' } : row,
          ),
        )
        refreshStats()
      }
    },
    [message, refreshStats],
  )

  const socketStatus = useDoctorSocket(handleMessage)

  const visibleAlerts = useMemo(
    () => (abnormalOnly ? alerts.filter((item) => item.overall_level !== 'green') : alerts),
    [alerts, abnormalOnly],
  )

  /** 风险等级分布饼图（深色配色） */
  const pieOption = useMemo<EChartsCoreOption>(
    () => ({
      tooltip: { trigger: 'item', formatter: '{b}：{c} 份（{d}%）', ...DARK_TOOLTIP },
      legend: {
        bottom: 0,
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: 'rgba(186, 226, 255, 0.7)', fontSize: 11 },
      },
      series: [
        {
          type: 'pie',
          radius: ['46%', '70%'],
          center: ['50%', '42%'],
          itemStyle: { borderColor: 'rgba(6, 15, 30, 1)', borderWidth: 2 },
          label: { formatter: '{b}\n{c} 份', color: 'rgba(214, 240, 255, 0.85)', fontSize: 11 },
          labelLine: { lineStyle: { color: 'rgba(56, 189, 248, 0.35)' } },
          data: (stats?.level_distribution ?? []).map((item) => ({
            name: item.name,
            value: item.value,
            itemStyle: item.level ? { color: LEVEL_META[item.level].color } : undefined,
          })),
        },
      ],
    }),
    [stats],
  )

  /** 科室报告统计柱状图（深色配色） */
  const barOption = useMemo<EChartsCoreOption>(() => {
    const source = stats?.department_stats ?? []
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, ...DARK_TOOLTIP },
      grid: { left: 8, right: 16, bottom: 4, top: 20, containLabel: true },
      xAxis: {
        type: 'category',
        data: source.map((item) => item.name),
        axisLabel: { ...DARK_AXIS_LABEL, interval: 0, rotate: source.length > 5 ? 30 : 0 },
        axisLine: { lineStyle: { color: 'rgba(56, 189, 248, 0.22)' } },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        axisLabel: DARK_AXIS_LABEL,
        splitLine: DARK_SPLIT_LINE,
      },
      series: [
        {
          type: 'bar',
          barMaxWidth: 30,
          itemStyle: {
            borderRadius: [5, 5, 0, 0],
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: '#22d3ee' },
                { offset: 1, color: 'rgba(37, 99, 235, 0.35)' },
              ],
            },
          },
          label: { show: true, position: 'top', color: 'rgba(186, 226, 255, 0.8)', fontSize: 11 },
          data: source.map((item) => item.value),
        },
      ],
    }
  }, [stats])

  /** 最近 7 天报告趋势折线图（深色配色） */
  const lineOption = useMemo<EChartsCoreOption>(() => {
    const trend = stats?.trend ?? []
    return {
      tooltip: { trigger: 'axis', ...DARK_TOOLTIP },
      legend: {
        top: 0,
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: 'rgba(186, 226, 255, 0.7)', fontSize: 11 },
      },
      grid: { left: 8, right: 16, bottom: 4, top: 30, containLabel: true },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: trend.map((item) => item.date.slice(5)),
        axisLabel: DARK_AXIS_LABEL,
        axisLine: { lineStyle: { color: 'rgba(56, 189, 248, 0.22)' } },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        axisLabel: DARK_AXIS_LABEL,
        splitLine: DARK_SPLIT_LINE,
      },
      series: [
        {
          name: '报告总数',
          type: 'line',
          smooth: true,
          symbolSize: 6,
          itemStyle: { color: '#22d3ee' },
          lineStyle: { width: 2, shadowBlur: 12, shadowColor: 'rgba(34, 211, 238, 0.6)' },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(34, 211, 238, 0.32)' },
                { offset: 1, color: 'rgba(34, 211, 238, 0.02)' },
              ],
            },
          },
          data: trend.map((item) => item.total),
        },
        {
          name: '异常报告',
          type: 'line',
          smooth: true,
          symbolSize: 6,
          itemStyle: { color: '#fbbf24' },
          lineStyle: { width: 2 },
          data: trend.map((item) => item.abnormal),
        },
      ],
    }
  }, [stats])

  const cards = stats?.cards

  const statusBadge = {
    open: { status: 'processing' as const, text: '实时连接中' },
    connecting: { status: 'warning' as const, text: '连接中...' },
    closed: { status: 'error' as const, text: '连接已断开' },
  }[socketStatus]

  /** 左侧统计卡竖排数据 */
  const statCards = [
    {
      title: '今日报告数量',
      value: cards?.total_today ?? 0,
      suffix: '份',
      color: '#38bdf8',
      valueColor: '#7dd3fc',
      icon: <FileTextOutlined />,
    },
    {
      title: '异常报告数量',
      value: cards?.abnormal_today ?? 0,
      suffix: '份',
      color: LEVEL_META.yellow.color,
      valueColor: '#fbbf24',
      icon: <AlertOutlined />,
    },
    {
      title: '高风险患者',
      value: cards?.high_risk_patients ?? 0,
      suffix: '人',
      color: LEVEL_META.red.color,
      valueColor: '#f87171',
      icon: <ThunderboltOutlined />,
    },
    {
      title: '待处理报告',
      value: cards?.pending ?? 0,
      suffix: '份',
      color: '#818cf8',
      valueColor: '#a5b4fc',
      icon: <ClockCircleOutlined />,
    },
  ]

  return (
    <div className="evp-dash-grid">
      {/* 左栏：统计卡竖排 */}
      <div className="evp-dash-col">
        {statCards.map((item) => (
          <Card
            key={item.title}
            className="evp-dark-card evp-dash-stat"
            size="small"
            styles={{ body: { padding: 16 } }}
          >
            <Statistic
              title={item.title}
              value={item.value}
              suffix={item.suffix}
              valueStyle={{ color: item.valueColor, fontSize: 28, fontWeight: 700 }}
              prefix={<StatIcon color={item.color}>{item.icon}</StatIcon>}
            />
          </Card>
        ))}
      </div>

      {/* 中栏：实时报告流（WebSocket 推送自动插入） */}
      <Card
        className="evp-dark-card evp-dash-fill"
        size="small"
        title={
          <Space size={12}>
            <span>实时报告流</span>
            <Badge status={statusBadge.status} text={statusBadge.text} />
          </Space>
        }
        extra={
          <Space size={12}>
            <Segmented
              size="small"
              value={abnormalOnly ? 'abnormal' : 'all'}
              onChange={(value) => setAbnormalOnly(value === 'abnormal')}
              options={[
                { label: '全部', value: 'all' },
                { label: '只看异常', value: 'abnormal' },
              ]}
            />
            <Button
              size="small"
              icon={<ReloadOutlined />}
              loading={loading}
              onClick={() => loadAll()}
            >
              刷新
            </Button>
          </Space>
        }
        styles={{ body: { padding: 0 } }}
      >
        {visibleAlerts.length === 0 ? (
          <Empty
            style={{ padding: '48px 0' }}
            description={
              loading ? '正在加载...' : '暂无报告，患者上传后此处会自动出现新记录'
            }
          />
        ) : (
          <List
            size="small"
            dataSource={visibleAlerts}
            renderItem={(item) => {
              const isFlashing = flashingIds.includes(item.event_id)
              return (
                <List.Item
                  className={isFlashing ? 'evp-flash' : undefined}
                  style={{
                    padding: '12px 18px',
                    cursor: 'pointer',
                    borderInlineStart: `3px solid ${LEVEL_META[item.overall_level]?.color ?? '#475569'}`,
                  }}
                  onClick={() => navigate(`/doctor/report/${item.event_id}`)}
                >
                  <div style={{ width: '100%' }}>
                    <Space size={10} wrap style={{ marginBottom: 4 }}>
                      <Text strong style={{ color: '#e6f4ff' }}>
                        {item.patient_name || item.patient_id}
                      </Text>
                      <Text style={{ fontSize: 12, color: 'rgba(186, 226, 255, 0.5)' }}>
                        {item.patient_id}
                      </Text>
                      <Tag style={{ margin: 0 }}>{item.department || '未知科室'}</Tag>
                      <RiskTag level={item.overall_level} />
                      <Tag
                        color={item.status === 'processed' ? 'success' : 'processing'}
                        style={{ margin: 0 }}
                      >
                        {item.status === 'processed' ? '已处理' : '待处理'}
                      </Tag>
                      {isFlashing && (
                        <Tag color="blue" style={{ margin: 0 }}>
                          新
                        </Tag>
                      )}
                    </Space>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 16,
                        fontSize: 13,
                      }}
                    >
                      <Text
                        ellipsis
                        style={{ maxWidth: '78%', color: 'rgba(186, 226, 255, 0.68)' }}
                      >
                        {item.reason}
                      </Text>
                      <Tooltip title={item.created_at ?? ''}>
                        <Text
                          style={{
                            fontSize: 12,
                            whiteSpace: 'nowrap',
                            color: 'rgba(186, 226, 255, 0.5)',
                          }}
                        >
                          {formatTime(item.created_at)}
                        </Text>
                      </Tooltip>
                    </div>
                  </div>
                </List.Item>
              )
            }}
          />
        )}
      </Card>

      {/* 右栏：图表堆叠 */}
      <div className="evp-dash-col">
        <Card
          className="evp-dark-card evp-dash-chart"
          size="small"
          title="风险等级分布"
          styles={{ body: { padding: 6 } }}
        >
          <EChart option={pieOption} height={chartHeight} />
        </Card>
        <Card
          className="evp-dark-card evp-dash-chart"
          size="small"
          title="科室报告统计"
          styles={{ body: { padding: 6 } }}
        >
          {stats?.department_stats?.length ? (
            <EChart option={barOption} height={chartHeight} />
          ) : (
            <Empty
              style={{ padding: `${Math.max(24, chartHeight / 2 - 24)}px 0` }}
              description="暂无科室数据"
            />
          )}
        </Card>
        <Card
          className="evp-dark-card evp-dash-chart"
          size="small"
          title="最近 7 天报告趋势"
          styles={{ body: { padding: 6 } }}
        >
          <EChart option={lineOption} height={chartHeight} />
        </Card>
      </div>

      <div className="evp-dash-footnote">
        <Text style={{ fontSize: 12, color: 'rgba(148, 197, 233, 0.55)' }}>
          <CheckCircleOutlined style={{ marginRight: 6 }} />
          大屏数据来自后端 SQLite 实时统计；患者提交报告后，新记录通过 WebSocket 自动推送，无需刷新页面。
        </Text>
      </div>
    </div>
  )
}

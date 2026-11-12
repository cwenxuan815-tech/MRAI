import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { fetchPatientReports } from '../../api/patient'
import RiskTag from '../../components/RiskTag'
import { STATUS_META } from '../../constants/medical'
import { formatTime } from '../../utils/format'
import { setLastPatientId } from '../../utils/storage'
import type { ReportItem } from '../../types'

const { Paragraph, Title } = Typography

const PAGE_SIZE = 10

/** 历史报告页：按患者编号查询历史报告列表 */
export default function HistoryPage() {
  const { patient_id: routePatientId = '' } = useParams()
  const navigate = useNavigate()

  const [keyword, setKeyword] = useState(routePatientId === '-' ? '' : routePatientId)
  const [items, setItems] = useState<ReportItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const hasPatientId = Boolean(routePatientId) && routePatientId !== '-'

  const load = useCallback(
    async (targetPage: number) => {
      if (!hasPatientId) return
      setLoading(true)
      setError(null)
      try {
        const { data, notice: fallbackNotice } = await fetchPatientReports(
          routePatientId,
          targetPage,
          PAGE_SIZE,
        )
        setItems(data.items ?? [])
        setTotal(data.total ?? 0)
        setPage(targetPage)
        setNotice(fallbackNotice ?? null)
        setLastPatientId(routePatientId)
      } catch (err) {
        setItems([])
        setTotal(0)
        setError((err as Error)?.message || '历史报告加载失败')
      } finally {
        setLoading(false)
      }
    },
    [hasPatientId, routePatientId],
  )

  useEffect(() => {
    setKeyword(routePatientId === '-' ? '' : routePatientId)
    setPage(1)
    load(1)
  }, [routePatientId, load])

  const handleSearch = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return
    navigate(`/patient/history/${trimmed}`)
  }

  const columns: ColumnsType<ReportItem> = [
    {
      title: '时间',
      dataIndex: 'created_at',
      width: 160,
      render: (value: string | null) => formatTime(value),
    },
    {
      title: '报告编号',
      dataIndex: 'report_id',
      width: 190,
      render: (value: string | null, record) => (
        <a onClick={() => navigate(`/patient/result/${record.event_id}`)}>{value || record.event_id}</a>
      ),
    },
    {
      title: '风险等级',
      dataIndex: 'overall_level',
      width: 120,
      render: (value: ReportItem['overall_level']) => <RiskTag level={value} />,
    },
    {
      title: '摘要',
      dataIndex: 'summary',
      ellipsis: true,
      render: (value: string | null) => (
        <span style={{ color: '#595959' }}>{value || '-'}</span>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (value: ReportItem['status']) => {
        const meta = STATUS_META[value] ?? STATUS_META.pending
        return <Tag color={meta.color}>{meta.text}</Tag>
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_, record) => (
        <a onClick={() => navigate(`/patient/result/${record.event_id}`)}>查看详情</a>
      ),
    },
  ]

  const searchBar = (
    <Input.Search
      allowClear
      enterButton={
        <span>
          <SearchOutlined /> 查询
        </span>
      }
      placeholder="请输入患者编号，例如 P001"
      style={{ maxWidth: 360 }}
      value={keyword}
      onChange={(event) => setKeyword(event.target.value)}
      onSearch={handleSearch}
    />
  )

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <Card
        title={hasPatientId ? `历史报告 · 患者 ${routePatientId}` : '历史报告查询'}
        extra={
          hasPatientId ? (
            <Button icon={<ReloadOutlined />} onClick={() => load(page)}>
              刷新
            </Button>
          ) : null
        }
        style={{ borderRadius: 16 }}
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {searchBar}

          {!hasPatientId ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="请输入患者编号后查询历史检查报告"
            />
          ) : (
            <>
              {notice && <Alert type="warning" showIcon message={notice} />}
              {error && <Alert type="error" showIcon message={error} />}

              <Table<ReportItem>
                rowKey="event_id"
                size="middle"
                loading={loading}
                columns={columns}
                dataSource={items}
                scroll={{ x: 900 }}
                locale={{ emptyText: <Empty description="暂无历史检查报告" /> }}
                pagination={{
                  current: page,
                  pageSize: PAGE_SIZE,
                  total,
                  showSizeChanger: false,
                  showTotal: (count) => `共 ${count} 条报告`,
                  onChange: (targetPage) => load(targetPage),
                }}
              />

              <Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 12 }}>
                点击报告编号或「查看详情」可查看该次检查的完整 AI 分析结果。
              </Paragraph>
            </>
          )}
        </Space>
      </Card>

      {hasPatientId && (
        <Card style={{ borderRadius: 16 }}>
          <Title level={5} style={{ marginTop: 0 }}>
            温馨提示
          </Title>
          <Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 13 }}>
            历史报告按生成时间倒序排列。若报告状态为「待处理」，表示医护人员尚未完成本次结果的确认与处置。
          </Paragraph>
        </Card>
      )}
    </Space>
  )
}

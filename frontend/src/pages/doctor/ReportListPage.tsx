import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  App,
  Button,
  Card,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import RiskTag from '../../components/RiskTag'
import { fetchDoctorReports } from '../../api/doctor'
import { formatTime } from '../../utils/format'
import type { ReportItem, ReportListResponse } from '../../types'

const { Text } = Typography

/** 报告管理列表：支持 patient_id 搜索、风险等级与状态筛选、分页 */
export default function ReportListPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()

  const [keyword, setKeyword] = useState('')
  const [patientId, setPatientId] = useState('')
  const [level, setLevel] = useState<string>('')
  const [status, setStatus] = useState<string>('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [data, setData] = useState<ReportListResponse | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await fetchDoctorReports({ patientId, level, status, page, pageSize }))
    } catch (error) {
      message.error(`加载报告列表失败：${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }, [patientId, level, status, page, pageSize, message])

  useEffect(() => {
    load()
  }, [load])

  const resetFilters = () => {
    setKeyword('')
    setPatientId('')
    setLevel('')
    setStatus('')
    setPage(1)
  }

  const columns: ColumnsType<ReportItem> = [
    {
      title: '报告编号',
      dataIndex: 'event_id',
      width: 140,
      render: (value: string) => <Text copyable={{ text: value }}>{value}</Text>,
    },
    { title: '患者编号', dataIndex: 'patient_id', width: 110 },
    { title: '患者姓名', dataIndex: 'patient_name', width: 110, render: (v) => v || '-' },
    { title: '科室', dataIndex: 'department', width: 120, render: (v) => v || '-' },
    {
      title: '风险等级',
      dataIndex: 'overall_level',
      width: 120,
      render: (value) => <RiskTag level={value} />,
    },
    {
      title: '摘要',
      dataIndex: 'summary',
      ellipsis: true,
      render: (value: string | null) => (
        <Tooltip title={value || ''}>
          <span>{value || '-'}</span>
        </Tooltip>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (value: string) => (
        <Tag color={value === 'processed' ? 'success' : 'processing'} style={{ margin: 0 }}>
          {value === 'processed' ? '已处理' : '待处理'}
        </Tag>
      ),
    },
    {
      title: '上传时间',
      dataIndex: 'created_at',
      width: 160,
      render: (value: string | null) => formatTime(value),
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_, record) => (
        <Button type="link" size="small" onClick={() => navigate(`/doctor/report/${record.event_id}`)}>
          查看详情
        </Button>
      ),
    },
  ]

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card size="small">
        <Space wrap size={12}>
          <Input
            allowClear
            style={{ width: 220 }}
            placeholder="按患者编号搜索，如 P001"
            prefix={<SearchOutlined />}
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            onPressEnter={() => {
              setPatientId(keyword.trim())
              setPage(1)
            }}
          />
          <Button
            type="primary"
            onClick={() => {
              setPatientId(keyword.trim())
              setPage(1)
            }}
          >
            搜索
          </Button>

          <Select
            style={{ width: 140 }}
            placeholder="风险等级"
            value={level || undefined}
            allowClear
            onChange={(value) => {
              setLevel(value || '')
              setPage(1)
            }}
            options={[
              { value: 'green', label: '正常' },
              { value: 'yellow', label: '异常提醒' },
              { value: 'red', label: '高风险' },
            ]}
          />

          <Select
            style={{ width: 140 }}
            placeholder="处理状态"
            value={status || undefined}
            allowClear
            onChange={(value) => {
              setStatus(value || '')
              setPage(1)
            }}
            options={[
              { value: 'pending', label: '待处理' },
              { value: 'processed', label: '已处理' },
            ]}
          />

          <Button onClick={resetFilters}>重置</Button>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={load}>
            刷新
          </Button>
        </Space>
      </Card>

      <Card size="small" styles={{ body: { padding: 0 } }}>
        <Table<ReportItem>
          rowKey="event_id"
          size="middle"
          loading={loading}
          columns={columns}
          dataSource={data?.items ?? []}
          scroll={{ x: 1180 }}
          onRow={(record) => ({
            onClick: () => navigate(`/doctor/report/${record.event_id}`),
            style: { cursor: 'pointer' },
          })}
          pagination={{
            current: page,
            pageSize,
            total: data?.total ?? 0,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 份报告`,
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPageSize !== pageSize ? 1 : nextPage)
              setPageSize(nextPageSize)
            },
          }}
        />
      </Card>
    </Space>
  )
}

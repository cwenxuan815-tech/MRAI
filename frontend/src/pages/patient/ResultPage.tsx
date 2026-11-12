import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Result,
  Row,
  Skeleton,
  Space,
  Tag,
  Typography,
} from 'antd'
import {
  ArrowLeftOutlined,
  CheckCircleFilled,
  FileTextOutlined,
  HistoryOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { fetchReportDetail } from '../../api/patient'
import AlertCard from '../../components/AlertCard'
import RiskTag from '../../components/RiskTag'
import { LEVEL_META, STATUS_META } from '../../constants/medical'
import { formatTime, toPatientAlerts } from '../../utils/format'
import { setLastPatientId } from '../../utils/storage'
import type { ReportDetail } from '../../types'

const { Paragraph, Title, Text } = Typography

/** 检查结果页：展示患者信息、风险等级、AI 摘要与异常提醒列表 */
export default function ResultPage() {
  const { event_id: eventId = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const routeState = (location.state ?? {}) as { notice?: string; source?: string }

  const [detail, setDetail] = useState<ReportDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(routeState.notice ?? null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, notice: fallbackNotice } = await fetchReportDetail(eventId)
      setDetail(data)
      if (fallbackNotice) setNotice(fallbackNotice)
      if (data.patient_id) setLastPatientId(data.patient_id)
    } catch (err) {
      setError((err as Error)?.message || '报告加载失败')
      setDetail(null)
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <Card style={{ borderRadius: 16 }}>
        <Skeleton active paragraph={{ rows: 8 }} />
      </Card>
    )
  }

  if (error || !detail) {
    return (
      <Card style={{ borderRadius: 16 }}>
        <Result
          status="warning"
          title="报告加载失败"
          subTitle={error || '未找到对应的报告记录'}
          extra={[
            <Button key="retry" type="primary" icon={<ReloadOutlined />} onClick={load}>
              重新加载
            </Button>,
            <Button key="back" onClick={() => navigate('/patient/upload')}>
              返回上传页
            </Button>,
          ]}
        />
      </Card>
    )
  }

  const levelMeta = LEVEL_META[detail.overall_level] ?? LEVEL_META.green
  const statusMeta = STATUS_META[detail.status] ?? STATUS_META.pending
  const alerts = toPatientAlerts(detail.alerts)

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      {notice && <Alert type="warning" showIcon message={notice} />}

      {/* 风险等级总览 */}
      <Card
        style={{
          borderRadius: 16,
          borderTop: `4px solid ${levelMeta.color}`,
          background: `linear-gradient(180deg, ${levelMeta.color}14 0%, #ffffff 100%)`,
        }}
      >
        <Row align="middle" gutter={[16, 16]}>
          <Col flex="auto">
            <Space align="center" size={12} wrap>
              <Title level={4} style={{ margin: 0, color: levelMeta.color }}>
                {levelMeta.text}
              </Title>
              <RiskTag level={detail.overall_level} showDot={false} />
              {detail.status === 'processed' && (
                <Tag color={statusMeta.color}>
                  <CheckCircleFilled /> {statusMeta.text}
                </Tag>
              )}
            </Space>
            <Paragraph style={{ margin: '10px 0 0', color: '#595959' }}>
              {levelMeta.description}
            </Paragraph>
          </Col>
          <Col>
            <Space>
              <Button
                icon={<HistoryOutlined />}
                onClick={() => navigate(`/patient/history/${detail.patient_id}`)}
              >
                历史报告
              </Button>
              <Button type="primary" icon={<ArrowLeftOutlined />} onClick={() => navigate('/patient/upload')}>
                返回上传页
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 患者信息 + 报告信息 */}
      <Row gutter={[20, 20]}>
        <Col xs={24} lg={12}>
          <Card title="患者信息" style={{ borderRadius: 16, height: '100%' }}>
            <Descriptions column={1} size="small" styles={{ label: { width: 80, color: '#8c8c8c' } }}>
              <Descriptions.Item label="姓名">
                {detail.patient_name || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="患者编号">{detail.patient_id}</Descriptions.Item>
              <Descriptions.Item label="科室">{detail.department || '-'}</Descriptions.Item>
              <Descriptions.Item label="床位">{detail.bed || '-'}</Descriptions.Item>
              <Descriptions.Item label="医生">{detail.doctor_name || '-'}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="报告信息" style={{ borderRadius: 16, height: '100%' }}>
            <Descriptions column={1} size="small" styles={{ label: { width: 80, color: '#8c8c8c' } }}>
              <Descriptions.Item label="报告编号">
                {detail.report_id || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="事件编号">
                <Text code style={{ fontSize: 12 }}>
                  {detail.event_id}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="生成时间">
                {formatTime(detail.created_at)}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={statusMeta.color}>{statusMeta.text}</Tag>
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>

      {/* AI 分析摘要 */}
      <Card
        title={
          <Space>
            <FileTextOutlined style={{ color: '#0ea5e9' }} />
            <span>AI 分析摘要</span>
          </Space>
        }
        style={{ borderRadius: 16 }}
      >
        <Paragraph style={{ marginBottom: 0, lineHeight: 1.9, color: '#262626' }}>
          {detail.summary || '本次报告未生成分析摘要。'}
        </Paragraph>
      </Card>

      {/* 异常提醒列表 */}
      <Card
        title={`异常提醒（${alerts.length}）`}
        style={{ borderRadius: 16 }}
        styles={{ body: { paddingBottom: alerts.length ? 4 : 24 } }}
      >
        {alerts.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="本次检查未发现需要关注的异常指标"
          />
        ) : (
          alerts.map((alert, index) => (
            <AlertCard key={`${alert.title}-${index}`} alert={alert} index={index + 1} />
          ))
        )}
      </Card>

      <Alert
        type="info"
        showIcon
        message="以上内容由 AI 自动生成，仅供临床参考，不作为最终诊断依据。"
      />
    </Space>
  )
}

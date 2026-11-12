import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  App,
  Button,
  Card,
  Col,
  Collapse,
  Descriptions,
  Empty,
  Form,
  Image,
  Input,
  Modal,
  Result,
  Row,
  Space,
  Spin,
  Tag,
  Timeline,
  Typography,
} from 'antd'
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  FileProtectOutlined,
} from '@ant-design/icons'
import AlertCard from '../../components/AlertCard'
import RiskTag from '../../components/RiskTag'
import { fetchReportDetail, submitProcess } from '../../api/doctor'
import { formatTime, toPatientAlerts } from '../../utils/format'
import type { ReportDetail, ReportFile } from '../../types'

const { Text, Paragraph } = Typography

/** 图片类型文件直接用图像预览，其余（PDF）用新窗口打开 */
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg']

function isImageFile(filename: string): boolean {
  const lower = filename.toLowerCase()
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

/** 报告详情页：完整报告信息 + 原始报告查看 + 确认处理 */
export default function ReportDetailPage() {
  const { event_id: eventId = '' } = useParams()
  const navigate = useNavigate()
  const { message } = App.useApp()

  const [detail, setDetail] = useState<ReportDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm<{ result: string; remark: string }>()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setDetail(await fetchReportDetail(eventId))
      setNotFound(false)
    } catch (error) {
      setNotFound(true)
      message.error(`加载报告详情失败：${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }, [eventId, message])

  useEffect(() => {
    load()
  }, [load])

  /** 提交处置结果 */
  const handleProcess = async () => {
    const values = await form.validateFields()
    setSubmitting(true)
    try {
      const updated = await submitProcess(eventId, {
        result: values.result.trim(),
        remark: values.remark.trim(),
      })
      setDetail(updated)
      setModalOpen(false)
      form.resetFields()
      message.success('已确认处理，报告状态更新为「已处理」')
    } catch (error) {
      message.error(`处置失败：${(error as Error).message}`)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <Spin style={{ display: 'block', margin: '80px auto' }} />
      </Card>
    )
  }

  if (notFound || !detail) {
    return (
      <Result
        status="404"
        title="报告不存在"
        subTitle={`未找到报告 ${eventId}，请确认报告编号是否正确。`}
        extra={
          <Button type="primary" onClick={() => navigate('/doctor/reports')}>
            返回报告管理
          </Button>
        }
      />
    )
  }

  const processed = detail.status === 'processed'
  const alerts = toPatientAlerts(detail.alerts)

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card size="small">
        <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start">
          <Space align="start" size={16}>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/doctor/reports')}>
              返回
            </Button>
            <Space direction="vertical" size={4}>
              <Space size={10} wrap>
                <Text strong style={{ fontSize: 18 }}>
                  {detail.patient_name || detail.patient_id}
                </Text>
                <RiskTag level={detail.overall_level} />
                <Tag color={processed ? 'success' : 'processing'} style={{ margin: 0 }}>
                  {processed ? '已处理' : '待处理'}
                </Tag>
              </Space>
              <Text type="secondary" style={{ fontSize: 12 }}>
                事件编号 {detail.event_id}
                {detail.report_id ? ` · 报告编号 ${detail.report_id}` : ''}
              </Text>
            </Space>
          </Space>

          <Button
            type="primary"
            icon={<CheckCircleOutlined />}
            disabled={processed}
            onClick={() => setModalOpen(true)}
          >
            {processed ? '已处理完成' : '确认处理'}
          </Button>
        </Space>
      </Card>

      <Row gutter={16}>
        <Col xs={24} lg={14}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card size="small" title="患者信息">
              <Descriptions column={2} size="small" styles={{ label: { color: '#8c8c8c' } }}>
                <Descriptions.Item label="患者姓名">{detail.patient_name || '-'}</Descriptions.Item>
                <Descriptions.Item label="患者编号">{detail.patient_id}</Descriptions.Item>
                <Descriptions.Item label="科室">{detail.department || '-'}</Descriptions.Item>
                <Descriptions.Item label="床位">{detail.bed || '-'}</Descriptions.Item>
                <Descriptions.Item label="主治医生">
                  {detail.doctor_name || detail.doctor_id || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="责任护士">{detail.nurse_id || '-'}</Descriptions.Item>
                <Descriptions.Item label="报告时间" span={2}>
                  {formatTime(detail.created_at)}
                </Descriptions.Item>
              </Descriptions>
            </Card>

            <Card size="small" title="AI 分析结论">
              <Paragraph style={{ marginBottom: alerts.length ? 16 : 0 }}>
                {detail.summary || '暂无摘要'}
              </Paragraph>

              {alerts.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="本次分析未发现异常指标"
                />
              ) : (
                alerts.map((alert, index) => (
                  <AlertCard key={`${alert.title}-${index}`} alert={alert} index={index + 1} />
                ))
              )}
            </Card>
          </Space>
        </Col>

        <Col xs={24} lg={10}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card
              size="small"
              title={
                <Space>
                  <FileProtectOutlined />
                  原始上传报告
                </Space>
              }
            >
              {detail.files.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无原始文件" />
              ) : (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  {detail.files.map((file: ReportFile) => (
                    <div
                      key={file.id}
                      style={{
                        border: '1px solid #e6f0fa',
                        borderRadius: 10,
                        padding: 12,
                        background: '#fafcff',
                      }}
                    >
                      <Space size={8} style={{ marginBottom: 8 }}>
                        {isImageFile(file.filename) ? (
                          <FileImageOutlined style={{ color: '#0ea5e9' }} />
                        ) : (
                          <FilePdfOutlined style={{ color: '#ff4d4f' }} />
                        )}
                        <Text ellipsis style={{ maxWidth: 220 }}>
                          {file.filename}
                        </Text>
                      </Space>
                      <div>
                        {isImageFile(file.filename) ? (
                          <Image src={file.url} width={180} style={{ borderRadius: 6 }} />
                        ) : (
                          <Button
                            size="small"
                            type="primary"
                            ghost
                            icon={<FilePdfOutlined />}
                            href={file.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            在新窗口打开 PDF
                          </Button>
                        )}
                      </div>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        上传时间：{formatTime(file.upload_time)}
                      </Text>
                    </div>
                  ))}
                </Space>
              )}
            </Card>

            <Card size="small" title="处置记录">
              {detail.treatments.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚未处置" />
              ) : (
                <Timeline
                  items={detail.treatments.map((item) => ({
                    color: 'green',
                    children: (
                      <Space direction="vertical" size={2}>
                        <Text strong>{item.result || '已处理'}</Text>
                        {item.remark && <Text type="secondary">{item.remark}</Text>}
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {formatTime(item.created_at)}
                        </Text>
                      </Space>
                    ),
                  }))}
                />
              )}
            </Card>

            <Card size="small" styles={{ body: { padding: 0 } }}>
              <Collapse
                ghost
                items={[
                  {
                    key: 'json',
                    label: '查看完整报告 JSON',
                    children: (
                      <pre
                        style={{
                          maxHeight: 320,
                          overflow: 'auto',
                          fontSize: 12,
                          margin: 0,
                          background: '#f6f8fa',
                          padding: 12,
                          borderRadius: 6,
                        }}
                      >
                        {JSON.stringify(detail, null, 2)}
                      </pre>
                    ),
                  },
                ]}
              />
            </Card>
          </Space>
        </Col>
      </Row>

      <Modal
        title="确认处理报告"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleProcess}
        confirmLoading={submitting}
        okText="提交处置"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            label="处理结果"
            name="result"
            rules={[{ required: true, message: '请填写处理结果' }]}
          >
            <Input placeholder="例如：已通知主治医生，安排复查血常规" />
          </Form.Item>
          <Form.Item
            label="备注"
            name="remark"
            rules={[{ required: true, message: '请填写备注' }]}
          >
            <Input.TextArea rows={3} placeholder="补充说明，例如：患者已转入监护室" />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  )
}

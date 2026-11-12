import { useEffect, useRef, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Input,
  Progress,
  Row,
  Space,
  Steps,
  Tag,
  Typography,
  Upload,
} from 'antd'
import {
  InboxOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import type { UploadFile } from 'antd/es/upload/interface'
import { useNavigate } from 'react-router-dom'
import { uploadReport } from '../../api/patient'
import PatientAIChat from '../../components/PatientAIChat'
import { ACCEPT_TYPES, ANALYSIS_STAGES, MAX_FILE_SIZE } from '../../constants/medical'
import { setLastPatientId } from '../../utils/storage'

const { Dragger } = Upload
const { Paragraph, Text, Title } = Typography

/** Hero 左侧的卖点条目 */
const HERO_POINTS = [
  {
    icon: <ThunderboltOutlined />,
    color: '#0ea5e9',
    title: '秒级结构化解析',
    desc: '由 Dify Workflow 自动抽取风险等级、异常指标与处置建议',
  },
  {
    icon: <SafetyCertificateOutlined />,
    color: '#10b981',
    title: '风险三级提醒',
    desc: '正常 / 异常提醒 / 高风险分级标识，异常结果自动推送医生',
  },
  {
    icon: <TeamOutlined />,
    color: '#6366f1',
    title: '医护闭环处理',
    desc: '医生在报告管理中确认处置，状态实时回写患者端',
  },
]

/** 患者上传页：左侧品牌 Hero + 右侧上传卡片，底部横向展示分析流程 */
export default function UploadPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()

  const [patientId, setPatientId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [stageIndex, setStageIndex] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  /** mock 降级专用提示：与真实错误分开展示，避免被误认为真实分析结果 */
  const [mockAlert, setMockAlert] = useState<string | null>(null)

  const timerRef = useRef<number | null>(null)

  // 组件卸载时清理定时器，避免内存泄漏
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current)
    }
  }, [])

  /** 分析阶段定时推进（真实接口返回后立即结束） */
  const startStageTicker = () => {
    setStageIndex(0)
    timerRef.current = window.setInterval(() => {
      setStageIndex((prev) => (prev < ANALYSIS_STAGES.length - 1 ? prev + 1 : prev))
    }, 1200)
  }

  const stopStageTicker = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  /** 上传前的本地校验：类型 + 大小 */
  const beforeUpload = (candidate: File) => {
    const suffix = `.${candidate.name.split('.').pop()?.toLowerCase() ?? ''}`
    if (!ACCEPT_TYPES.split(',').includes(suffix)) {
      message.error('仅支持 PNG / JPG 格式的检查报告')
      return Upload.LIST_IGNORE
    }
    if (candidate.size > MAX_FILE_SIZE) {
      message.error('文件过大，最大支持 20MB')
      return Upload.LIST_IGNORE
    }
    setNotice(null)
    setMockAlert(null)
    return false // 阻止自动上传，改为点击按钮时统一提交
  }

  const handleSubmit = async () => {
    const trimmedId = patientId.trim()
    if (!trimmedId) {
      message.warning('请先输入患者编号')
      return
    }
    if (!file) {
      message.warning('请先选择要上传的检查报告文件')
      return
    }

    setNotice(null)
    setMockAlert(null)
    setAnalyzing(true)
    startStageTicker()

    try {
      const { data, source, notice: fallbackNotice } = await uploadReport(trimmedId, file)
      stopStageTicker()
      setStageIndex(ANALYSIS_STAGES.length)
      setLastPatientId(trimmedId)

      if (source === 'mock') {
        setMockAlert(fallbackNotice ?? '后端接口异常，当前展示本地演示数据')
        message.warning('后端接口异常，已使用本地演示数据')
      } else {
        message.success('AI 分析完成')
      }

      // 稍作停顿让用户看到分析完成，再跳转结果页
      window.setTimeout(() => {
        navigate(`/patient/result/${data.event_id}`, {
          state: { source, notice: fallbackNotice },
        })
      }, 600)
    } catch (error) {
      stopStageTicker()
      setAnalyzing(false)
      setStageIndex(0)
      const text = (error as Error)?.message || '上传失败，请稍后重试'
      setNotice(text)
      message.error(text)
    }
  }

  const started = analyzing || stageIndex > 0

  return (
    <Space direction="vertical" size={28} style={{ width: '100%', display: 'flex' }}>
      {/* 首屏：左品牌 Hero + 右上传卡片 */}
      <Row gutter={[48, 32]} align="middle">
        <Col xs={24} lg={11}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Tag
              style={{
                margin: 0,
                width: 'fit-content',
                padding: '5px 14px',
                borderRadius: 999,
                border: '1px solid rgba(14, 165, 233, 0.28)',
                background: 'rgba(14, 165, 233, 0.10)',
                color: '#0369a1',
                fontSize: 12,
              }}
            >
              AI 智能分析 · Dify Workflow 驱动
            </Tag>

            <Title
              style={{
                margin: 0,
                fontSize: 'clamp(28px, 3.2vw, 42px)',
                lineHeight: 1.22,
                letterSpacing: -0.6,
                color: '#0f2b46',
              }}
            >
              让 AI 读懂
              <br />
              <span
                style={{
                  background: 'linear-gradient(120deg, #06b6d4 0%, #0ea5e9 45%, #2563eb 100%)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                每一份检查报告
              </span>
            </Title>

            <Paragraph style={{ margin: 0, fontSize: 15, lineHeight: 1.9, color: '#475569' }}>
              上传 PNG / JPG 格式的检查报告，系统自动识别异常指标、生成结构化提醒，
              并同步至医护端，形成「患者上传 → AI 分析 → 医生处置」的完整闭环。
            </Paragraph>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {HERO_POINTS.map((point) => (
                <div key={point.title} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <span
                    style={{
                      flex: 'none',
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 19,
                      color: point.color,
                      background: `linear-gradient(135deg, ${point.color}26, ${point.color}4d)`,
                    }}
                  >
                    {point.icon}
                  </span>
                  <div>
                    <Text strong style={{ display: 'block', fontSize: 14.5, color: '#0f2b46' }}>
                      {point.title}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12.5 }}>
                      {point.desc}
                    </Text>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Col>

        <Col xs={24} lg={13}>
          <Card
            style={{ borderRadius: 20 }}
            styles={{ body: { padding: 28 } }}
            title={
              <Space size={10}>
                <ThunderboltOutlined style={{ color: '#0ea5e9' }} />
                <span>上传检查报告</span>
              </Space>
            }
            extra={
              <Text type="secondary" style={{ fontSize: 12 }}>
                仅支持 PNG / JPG，最大 20MB
              </Text>
            }
          >
            <Space direction="vertical" size={20} style={{ width: '100%' }}>
              <div>
                <Text strong>患者编号</Text>
                <Input
                  size="large"
                  style={{ marginTop: 8 }}
                  placeholder="请输入患者编号，例如 P001"
                  value={patientId}
                  disabled={analyzing}
                  maxLength={32}
                  onChange={(event) => setPatientId(event.target.value)}
                  onPressEnter={handleSubmit}
                />
                <Paragraph type="secondary" style={{ marginTop: 6, marginBottom: 0, fontSize: 12 }}>
                  首次使用该编号上传时，系统会自动创建患者档案，无需提前注册。
                </Paragraph>
              </div>

              <div>
                <Text strong>检查报告文件</Text>
                <Dragger
                  style={{ marginTop: 8 }}
                  accept={ACCEPT_TYPES}
                  maxCount={1}
                  disabled={analyzing}
                  beforeUpload={beforeUpload}
                  onChange={({ fileList }) => {
                    const latest = fileList[fileList.length - 1] as UploadFile | undefined
                    setFile((latest?.originFileObj as File) ?? null)
                  }}
                >
                  <p className="ant-upload-drag-icon">
                    <InboxOutlined />
                  </p>
                  <p className="ant-upload-text">点击或拖拽文件到此处上传</p>
                  <p className="ant-upload-hint">支持 PNG / JPG，单个文件不超过 20MB</p>
                </Dragger>
              </div>

              <Button
                type="primary"
                size="large"
                block
                icon={<ThunderboltOutlined />}
                loading={analyzing}
                onClick={handleSubmit}
              >
                {analyzing ? 'AI 分析中，请稍候...' : '开始上传并分析'}
              </Button>

              {mockAlert && (
                <Alert
                  type="warning"
                  showIcon
                  style={{ borderRadius: 12 }}
                  message="当前展示的是本地演示数据，并非真实 AI 分析结果"
                  description={mockAlert}
                />
              )}

              {notice && (
                <Alert type="error" showIcon style={{ borderRadius: 12 }} message={notice} />
              )}
            </Space>
          </Card>
        </Col>
      </Row>

      {/* 分析流程：横向步骤条 */}
      <Card
        style={{ borderRadius: 20 }}
        title="AI 分析流程"
        extra={
          analyzing ? (
            <Text style={{ fontSize: 12, color: '#0ea5e9' }}>正在调用 Dify Workflow...</Text>
          ) : started ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              分析已完成，正在跳转结果页...
            </Text>
          ) : null
        }
      >
        <Steps
          current={started ? stageIndex : 0}
          status={analyzing ? 'process' : undefined}
          items={ANALYSIS_STAGES.map((title) => ({ title }))}
        />

        {started && (
          <Progress
            style={{ marginTop: 20, marginBottom: 0 }}
            percent={Math.round(((stageIndex + 1) / ANALYSIS_STAGES.length) * 100)}
            status={analyzing ? 'active' : 'success'}
          />
        )}

        <Paragraph
          type="secondary"
          style={{ marginTop: 20, marginBottom: 0, fontSize: 12, lineHeight: 1.85 }}
        >
          正常链路下由 Dify Workflow 返回真实分析结果；仅当后端接口异常降级到本地演示数据时，
          才会由患者编号末位数字决定演示场景：末位为 3 / 6 / 9 输出正常（green），末位为 1 / 4 / 7
          输出异常提醒（yellow），末位为 2 / 5 / 8 输出高风险（red）。例如 P003 为正常、P001
          为异常提醒、P002 为高风险。
        </Paragraph>
      </Card>

      <PatientAIChat />
    </Space>
  )
}

import { Alert, Card, Space, Typography } from 'antd'
import { RobotOutlined } from '@ant-design/icons'

const { Text } = Typography

/**
 * Dify 智能助手 WebApp 地址：
 * 由环境变量 VITE_DIFY_WEBAPP_URL 提供（写入 frontend/.env.local，该文件不入库）。
 * 未配置时不渲染 iframe，只提示配置方式，避免把内网地址写死在源码里。
 */
const DIFY_WEBAPP_URL = import.meta.env.VITE_DIFY_WEBAPP_URL || ''

/**
 * 患者端 AI 健康助手：通过 iframe 嵌入 Dify Agent WebApp。
 * 纯前端嵌入，不经后端代理、不落库、不保存聊天记录。
 */
export default function PatientAIChat() {
  const title = (
    <Space size={8}>
      <RobotOutlined style={{ color: '#0ea5e9' }} />
      <span>AI 健康助手</span>
    </Space>
  )

  if (!DIFY_WEBAPP_URL) {
    return (
      <Card title={title} style={{ borderRadius: 16 }}>
        <Alert
          type="info"
          showIcon
          message="未配置 AI 助手地址"
          description="在 frontend/.env.local 中设置 VITE_DIFY_WEBAPP_URL 为你的 Dify Agent WebApp 地址，重启前端后即可启用。"
        />
      </Card>
    )
  }

  return (
    <Card
      title={title}
      style={{ borderRadius: 16 }}
      styles={{ body: { padding: 0 } }}
    >
      <iframe
        src={DIFY_WEBAPP_URL}
        title="AI 健康助手"
        style={{
          width: '100%',
          height: '100%',
          minHeight: 700,
          border: 'none',
          display: 'block',
          borderRadius: '0 0 16px 16px',
        }}
        allow="microphone;clipboard-write"
      />
      <div style={{ padding: '10px 16px', borderTop: '1px solid #f0f0f0' }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          该助手由 Dify 智能体提供，仅用于健康咨询参考，不替代医生诊断；对话内容不会保存。
        </Text>
      </div>
    </Card>
  )
}

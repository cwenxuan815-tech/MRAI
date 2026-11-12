import { Alert, Layout, Menu, Typography } from 'antd'
import {
  CloudUploadOutlined,
  HistoryOutlined,
  MedicineBoxOutlined,
} from '@ant-design/icons'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { getLastPatientId } from '../utils/storage'

const { Header, Content, Footer } = Layout
const { Text, Title } = Typography

/**
 * 患者端整体布局：轻量毛玻璃顶栏 + 全宽内容区。
 * 首屏的左右分栏 Hero 由具体页面（如上传页）自行排布。
 */
export default function PatientLayout() {
  const navigate = useNavigate()
  const location = useLocation()

  const selectedKey = location.pathname.includes('/history') ? 'history' : 'upload'

  const handleMenuClick = ({ key }: { key: string }) => {
    if (key === 'upload') {
      navigate('/patient/upload')
      return
    }
    // 历史报告需要 patient_id，优先使用本机记录过的最近一次患者编号
    const lastPatientId = getLastPatientId()
    navigate(`/patient/history/${lastPatientId || '-'}`)
  }

  return (
    <Layout style={{ minHeight: '100vh', background: 'transparent' }}>
      <Header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 28,
          padding: '0 32px',
          height: 68,
          lineHeight: 1,
          background: 'rgba(255, 255, 255, 0.76)',
          backdropFilter: 'blur(14px)',
          borderBottom: '1px solid rgba(14, 165, 233, 0.16)',
          boxShadow: '0 6px 26px rgba(14, 116, 180, 0.07)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, #06b6d4 0%, #2563eb 100%)',
              boxShadow: '0 6px 16px rgba(14, 165, 233, 0.35)',
            }}
          >
            <MedicineBoxOutlined style={{ fontSize: 21, color: '#fff' }} />
          </div>
          <div>
            <Title level={5} style={{ margin: 0, color: '#0c4a6e' }}>
              医疗检查报告智能分析平台
            </Title>
            <Text type="secondary" style={{ fontSize: 10, letterSpacing: 1.6 }}>
              AI REPORT ANALYSIS
            </Text>
          </div>
        </div>

        <Menu
          mode="horizontal"
          selectedKeys={[selectedKey]}
          onClick={handleMenuClick}
          style={{
            flex: 1,
            minWidth: 240,
            background: 'transparent',
            borderBottom: 'none',
            fontWeight: 500,
          }}
          items={[
            { key: 'upload', icon: <CloudUploadOutlined />, label: '上传报告' },
            { key: 'history', icon: <HistoryOutlined />, label: '历史报告' },
          ]}
        />

        <span
          style={{
            color: '#fff',
            fontSize: 12,
            fontWeight: 500,
            padding: '5px 15px',
            borderRadius: 999,
            background: 'linear-gradient(120deg, #0ea5e9 0%, #2563eb 100%)',
            boxShadow: '0 4px 14px rgba(14, 165, 233, 0.32)',
            whiteSpace: 'nowrap',
          }}
        >
          患者端
        </span>
      </Header>

      <Content style={{ padding: '28px 32px 8px', maxWidth: 1240, width: '100%', margin: '0 auto' }}>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 24, borderRadius: 14 }}
          message="本系统由 AI 辅助生成分析建议，结果仅供参考，最终诊断请以医生意见为准。"
        />
        <Outlet />
      </Content>

      <Footer style={{ textAlign: 'center', color: '#94a3b8', background: 'transparent', fontSize: 12 }}>
        医疗检查报告智能分析 MVP · 患者端
      </Footer>
    </Layout>
  )
}

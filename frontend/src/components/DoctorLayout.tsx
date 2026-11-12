import { Layout, Menu, Tag, Typography } from 'antd'
import {
  DashboardOutlined,
  FileTextOutlined,
  MedicineBoxOutlined,
} from '@ant-design/icons'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useState } from 'react'

const { Header, Sider, Content } = Layout
const { Title, Text } = Typography

/** 医护端侧边菜单 */
const MENU_ITEMS = [
  { key: '/doctor/dashboard', icon: <DashboardOutlined />, label: '实时监控大屏' },
  { key: '/doctor/reports', icon: <FileTextOutlined />, label: '报告管理' },
]

/** 深色科技风底纹：深蓝黑底 + 青蓝径向光晕 */
const DARK_SHELL_BG = {
  backgroundColor: '#050c1a',
  backgroundImage: [
    'radial-gradient(900px 520px at 12% -10%, rgba(14, 165, 233, 0.20), transparent 62%)',
    'radial-gradient(760px 460px at 92% 8%, rgba(37, 99, 235, 0.18), transparent 60%)',
    'radial-gradient(680px 420px at 60% 108%, rgba(6, 182, 212, 0.14), transparent 62%)',
  ].join(','),
} as const

/** 医护端整体布局：大屏页深色科技风外壳，其余页面沿用浅色工作台 */
export default function DoctorLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)

  // 监控大屏独占深色科技风外壳，报告管理/详情保持浅色工作台
  const isDashboard = location.pathname.startsWith('/doctor/dashboard')

  // 报告详情页（/doctor/report/xxx）仍归属「报告管理」菜单
  const selectedKey = location.pathname.startsWith('/doctor/report')
    ? '/doctor/reports'
    : location.pathname

  return (
    <Layout style={{ minHeight: '100vh', ...(isDashboard ? DARK_SHELL_BG : undefined) }}>
      <Sider
        theme="dark"
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={216}
        style={{
          background: 'linear-gradient(180deg, #061225 0%, #081a33 60%, #0a2140 100%)',
          borderInlineEnd: '1px solid rgba(56, 189, 248, 0.14)',
          boxShadow: '2px 0 22px rgba(2, 8, 20, 0.5)',
        }}
      >
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            color: '#e2f2ff',
            fontSize: collapsed ? 18 : 15,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            borderBottom: '1px solid rgba(56, 189, 248, 0.12)',
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, #22d3ee, #2563eb)',
              boxShadow: '0 0 16px rgba(34, 211, 238, 0.45)',
            }}
          >
            <MedicineBoxOutlined style={{ fontSize: 18, color: '#fff' }} />
          </div>
          {!collapsed && '报告管理中心'}
        </div>

        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          style={{ background: 'transparent', borderInlineEnd: 'none', padding: '8px' }}
          onClick={({ key }) => navigate(key)}
          items={MENU_ITEMS}
        />
      </Sider>

      <Layout style={isDashboard ? { background: 'transparent' } : undefined}>
        <Header
          style={
            isDashboard
              ? {
                  background: 'rgba(5, 14, 30, 0.72)',
                  backdropFilter: 'blur(12px)',
                  padding: '0 24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  height: 64,
                  borderBottom: '1px solid rgba(56, 189, 248, 0.16)',
                  boxShadow: '0 8px 30px rgba(2, 8, 20, 0.45)',
                }
              : {
                  background: 'rgba(255,255,255,0.9)',
                  backdropFilter: 'blur(8px)',
                  padding: '0 24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  boxShadow: '0 1px 4px rgba(15, 76, 129, 0.08)',
                  height: 64,
                }
          }
        >
          <Title
            level={5}
            style={{ margin: 0, color: isDashboard ? '#dff2ff' : undefined }}
          >
            {location.pathname.startsWith('/doctor/report/')
              ? '报告详情'
              : location.pathname.startsWith('/doctor/reports')
                ? '报告管理'
                : '实时监控大屏'}
          </Title>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Tag color="blue" style={{ margin: 0 }}>
              医护端
            </Tag>
            <Text
              type={isDashboard ? undefined : 'secondary'}
              style={{ fontSize: 12, color: isDashboard ? 'rgba(186, 226, 255, 0.62)' : undefined }}
            >
              值班医护 · 张医生
            </Text>
          </div>
        </Header>

        <Content style={{ padding: isDashboard ? 18 : 20, background: 'transparent' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}

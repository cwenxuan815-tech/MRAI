import React from 'react'
import ReactDOM from 'react-dom/client'
import { App as AntdApp, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles/global.css'

dayjs.locale('zh-cn')

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#0ea5e9',
          colorInfo: '#0ea5e9',
          colorLink: '#0ea5e9',
          colorSuccess: '#10b981',
          colorWarning: '#f59e0b',
          colorError: '#ef4444',
          borderRadius: 12,
          fontSize: 14,
          colorBgLayout: '#e8f4fb',
          colorText: '#1f2937',
        },
        components: {
          Card: {
            borderRadiusLG: 16,
            boxShadowTertiary: '0 8px 30px rgba(14, 165, 233, 0.12)',
          },
          Button: {
            borderRadius: 10,
            controlHeight: 38,
          },
          Table: {
            headerBg: '#e0f2fe',
            headerColor: '#0c4a6e',
          },
          Menu: {
            itemBorderRadius: 10,
          },
          Input: {
            borderRadius: 10,
          },
          Select: {
            borderRadius: 10,
          },
        },
      }}
    >
      <AntdApp>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  </React.StrictMode>,
)

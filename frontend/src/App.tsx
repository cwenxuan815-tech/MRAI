import { Button, Result } from 'antd'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import DoctorLayout from './components/DoctorLayout'
import PatientLayout from './components/PatientLayout'
import DashboardPage from './pages/doctor/DashboardPage'
import ReportDetailPage from './pages/doctor/ReportDetailPage'
import ReportListPage from './pages/doctor/ReportListPage'
import HistoryPage from './pages/patient/HistoryPage'
import ResultPage from './pages/patient/ResultPage'
import UploadPage from './pages/patient/UploadPage'

/** 404 页面 */
function NotFound() {
  const navigate = useNavigate()
  return (
    <Result
      status="404"
      title="404"
      subTitle="抱歉，您访问的页面不存在。"
      extra={
        <Button type="primary" onClick={() => navigate('/patient/upload')}>
          返回患者端首页
        </Button>
      }
    />
  )
}

/** 患者端 + 医护端路由表 */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/patient/upload" replace />} />
      <Route path="/patient" element={<Navigate to="/patient/upload" replace />} />

      <Route element={<PatientLayout />}>
        <Route path="/patient/upload" element={<UploadPage />} />
        <Route path="/patient/result/:event_id" element={<ResultPage />} />
        <Route path="/patient/history/:patient_id" element={<HistoryPage />} />
      </Route>

      {/* 医护端：Ant Design Pro 风格布局（左侧菜单 + 顶部栏） */}
      <Route path="/doctor" element={<DoctorLayout />}>
        <Route index element={<Navigate to="/doctor/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="reports" element={<ReportListPage />} />
        <Route path="report/:event_id" element={<ReportDetailPage />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

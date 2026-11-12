/** 全局类型定义：与 Backend / Dify 返回结构保持一致 */

/** 风险等级 */
export type RiskLevel = 'green' | 'yellow' | 'red'

/** 报告处置状态 */
export type ReportStatus = 'pending' | 'processed'

/** 数据来源：backend = 真实接口，mock = 本地兜底演示数据 */
export type DataSource = 'backend' | 'mock'

/** 后端返回的单条异常提醒（字段名与 Backend 一致） */
export interface AlertItem {
  risk_type: string
  title: string
  reason: string
  suggestion: string
  missing_data: string
  level: RiskLevel
}

/** 患者端展示用的提醒结构：title / message / recommendation / missing_data */
export interface PatientAlert {
  title: string
  message: string
  recommendation: string
  missing_data: string
  level: RiskLevel
}

/** 报告（列表项） */
export interface ReportItem {
  id: number
  event_id: string
  report_id: string | null
  patient_id: string
  patient_name: string | null
  department: string | null
  bed: string | null
  doctor_id: string | null
  doctor_name: string | null
  nurse_id: string | null
  overall_level: RiskLevel
  summary: string | null
  alerts: AlertItem[]
  status: ReportStatus
  created_at: string | null
}

/** 原始上传文件 */
export interface ReportFile {
  id: number
  filename: string
  path: string
  url: string
  upload_time: string | null
}

/** 医护处置记录 */
export interface TreatmentItem {
  id: number
  remark: string | null
  result: string | null
  created_at: string | null
}

/** 报告详情 */
export interface ReportDetail extends ReportItem {
  files: ReportFile[]
  treatments: TreatmentItem[]
}

/** 报告分页列表 */
export interface ReportListResponse {
  total: number
  page: number
  page_size: number
  items: ReportItem[]
}

/** 患者信息 */
export interface PatientInfo {
  patient_id: string
  name: string | null
  department: string | null
  bed: string | null
  doctor_name: string | null
  updated_at: string | null
}

/** 带数据来源标记的返回结果，页面据此提示"当前为离线演示数据" */
export interface Sourced<T> {
  data: T
  source: DataSource
  /** 降级原因（接口异常时的提示文案） */
  notice?: string
}

/* ---------------- 医护端 ---------------- */

/** 大屏实时报警条目（对应 GET /api/doctor/alerts/latest） */
export interface AlertListItem {
  event_id: string
  report_id: string | null
  patient_id: string
  patient_name: string | null
  department: string | null
  overall_level: RiskLevel
  reason: string
  status: ReportStatus
  created_at: string | null
}

/** 大屏顶部统计卡 */
export interface StatsCards {
  total_today: number
  abnormal_today: number
  high_risk_patients: number
  pending: number
}

/** 饼图 / 柱状图数据项 */
export interface ChartDatum {
  name: string
  value: number
  level?: RiskLevel
}

/** 折线图数据项 */
export interface TrendDatum {
  date: string
  total: number
  abnormal: number
}

/** 大屏统计数据（对应 GET /api/doctor/stats） */
export interface StatsResponse {
  cards: StatsCards
  level_distribution: ChartDatum[]
  department_stats: ChartDatum[]
  trend: TrendDatum[]
}

/** 医护处置请求体 */
export interface ProcessPayload {
  /** 处理结果 */
  result: string
  /** 处理备注 */
  remark: string
}

/** 医护端 WebSocket 消息（服务端 -> 客户端） */
export type DoctorSocketMessage =
  | { type: 'connected'; data: { connections: number } }
  | { type: 'event_created'; data: ReportDetail }
  | { type: 'report_processed'; data: { event_id: string; status: ReportStatus } }
  | { type: 'pong' }

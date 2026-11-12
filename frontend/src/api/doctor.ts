import { http } from './client'
import type {
  AlertListItem,
  ProcessPayload,
  ReportDetail,
  ReportListResponse,
  StatsResponse,
} from '../types'

/**
 * 医护端接口层。
 * 医护端直接依赖后端实时数据（大屏与 WebSocket 无法用本地数据替代），
 * 因此不做 Mock 降级：请求失败时如实抛出错误，由页面提示并允许重试。
 */

/** 大屏统计：GET /api/doctor/stats */
export async function fetchDoctorStats(): Promise<StatsResponse> {
  const { data } = await http.get<StatsResponse>('/doctor/stats')
  return data
}

/** 大屏实时报警列表（初始数据）：GET /api/doctor/alerts/latest */
export async function fetchLatestAlerts(limit = 20): Promise<AlertListItem[]> {
  const { data } = await http.get<AlertListItem[]>('/doctor/alerts/latest', {
    params: { limit },
  })
  return data
}

/** 报告列表：GET /api/reports（支持 patient_id / level / status / 分页） */
export async function fetchDoctorReports(params: {
  patientId?: string
  level?: string
  status?: string
  page?: number
  pageSize?: number
}): Promise<ReportListResponse> {
  const { data } = await http.get<ReportListResponse>('/reports', {
    params: {
      patient_id: params.patientId || undefined,
      level: params.level || undefined,
      status: params.status || undefined,
      page: params.page ?? 1,
      page_size: params.pageSize ?? 10,
    },
  })
  return data
}

/** 报告详情（含原始文件与处置记录）：GET /api/reports/{event_id} */
export async function fetchReportDetail(eventId: string): Promise<ReportDetail> {
  const { data } = await http.get<ReportDetail>(`/reports/${eventId}`)
  return data
}

/** 医护确认处理：POST /api/reports/{event_id}/process */
export async function submitProcess(
  eventId: string,
  payload: ProcessPayload,
): Promise<ReportDetail> {
  const { data } = await http.post<ReportDetail>(`/reports/${eventId}/process`, payload)
  return data
}

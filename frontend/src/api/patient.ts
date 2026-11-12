import { generateMockReport } from './mockData'
import { getMockReport, listMockReports, saveMockReport } from './mockStore'
import { http, shouldFallbackToMock } from './client'
import type {
  PatientInfo,
  ReportDetail,
  ReportListResponse,
  Sourced,
} from '../types'

/**
 * 患者端接口层。
 * 规则：优先请求 Backend 真实接口；仅当后端不可用 / 5xx 时降级到本地 Mock，
 * 并在返回值中标记 source 与 notice，由页面提示用户。
 */

/** 从异常对象中取出可读的提示文案 */
function toNotice(error: unknown, fallbackText: string): string {
  const message = (error as Error)?.message
  return message ? `${fallbackText}（${message}）` : fallbackText
}

/** 上传报告并触发 Dify 分析：POST /api/reports/upload */
export async function uploadReport(
  patientId: string,
  file: File,
): Promise<Sourced<ReportDetail>> {
  const form = new FormData()
  form.append('patient_id', patientId)
  form.append('file', file)

  try {
    const { data } = await http.post<ReportDetail>('/reports/upload', form)
    return { data, source: 'backend' }
  } catch (error) {
    if (!shouldFallbackToMock(error)) throw error

    const mock = generateMockReport(patientId)
    saveMockReport(mock)
    return {
      data: mock,
      source: 'mock',
      notice: toNotice(error, '后端接口异常，已切换为本地演示数据'),
    }
  }
}

/** 查询报告详情：GET /api/reports/{event_id} */
export async function fetchReportDetail(
  eventId: string,
): Promise<Sourced<ReportDetail>> {
  try {
    const { data } = await http.get<ReportDetail>(`/reports/${eventId}`)
    return { data, source: 'backend' }
  } catch (error) {
    const mock = getMockReport(eventId)
    // 只有 Mock 中存在该报告时才降级，否则如实抛出错误
    if (!mock || !shouldFallbackToMock(error)) throw error
    return {
      data: mock,
      source: 'mock',
      notice: toNotice(error, '后端接口异常，已切换为本地演示数据'),
    }
  }
}

/** 查询患者历史报告：GET /api/reports?patient_id=xxx */
export async function fetchPatientReports(
  patientId: string,
  page = 1,
  pageSize = 10,
): Promise<Sourced<ReportListResponse>> {
  try {
    const { data } = await http.get<ReportListResponse>('/reports', {
      params: { patient_id: patientId, page, page_size: pageSize },
    })
    return { data, source: 'backend' }
  } catch (error) {
    if (!shouldFallbackToMock(error)) throw error

    const items = listMockReports(patientId)
    return {
      data: { total: items.length, page: 1, page_size: pageSize, items },
      source: 'mock',
      notice: toNotice(error, '后端接口异常，已切换为本地演示数据'),
    }
  }
}

/** 查询患者信息：GET /api/patients/{patient_id}（失败返回 null，不阻断页面） */
export async function fetchPatientInfo(patientId: string): Promise<PatientInfo | null> {
  try {
    const { data } = await http.get<PatientInfo>(`/patients/${patientId}`)
    return data
  } catch {
    return null
  }
}

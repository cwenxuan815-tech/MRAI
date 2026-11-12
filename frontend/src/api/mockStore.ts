import type { ReportDetail, ReportItem } from '../types'

/**
 * 本地 Mock 报告存储（localStorage）：
 * 当后端不可用而降级到 Mock 时，把生成的报告缓存下来，
 * 保证「上传 -> 结果页 -> 历史页」在离线演示时依然连贯。
 */

const STORAGE_KEY = 'evp.mock.reports'

function readAll(): ReportDetail[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as ReportDetail[]) : []
  } catch {
    return []
  }
}

function writeAll(list: ReportDetail[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 100)))
  } catch {
    // localStorage 不可用时静默忽略，不影响主流程
  }
}

/** 保存/覆盖一条 Mock 报告 */
export function saveMockReport(report: ReportDetail): void {
  const list = readAll().filter((item) => item.event_id !== report.event_id)
  writeAll([report, ...list])
}

/** 按 event_id 读取 Mock 报告 */
export function getMockReport(eventId: string): ReportDetail | null {
  return readAll().find((item) => item.event_id === eventId) ?? null
}

/** 读取某患者的 Mock 报告列表（按时间倒序） */
export function listMockReports(patientId: string): ReportItem[] {
  return readAll()
    .filter((item) => item.patient_id === patientId)
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
}

import dayjs from 'dayjs'
import type { AlertItem, PatientAlert, RiskLevel } from '../types'

/**
 * 把后端 alerts 映射为患者端展示字段：
 * reason -> message，suggestion -> recommendation
 */
export function toPatientAlerts(alerts: AlertItem[] | null | undefined): PatientAlert[] {
  if (!Array.isArray(alerts)) return []
  return alerts.map((item) => ({
    title: item.title || '异常提醒',
    message: item.reason || '暂无详细说明',
    recommendation: item.suggestion || '请遵医嘱复查',
    missing_data: item.missing_data || '无',
    level: (item.level || 'yellow') as RiskLevel,
  }))
}

/** 统一时间展示格式 */
export function formatTime(value: string | null | undefined): string {
  if (!value) return '-'
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : value
}

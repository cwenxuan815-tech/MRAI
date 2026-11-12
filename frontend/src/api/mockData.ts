import type { ReportDetail, RiskLevel } from '../types'

/**
 * 本地 Mock 数据生成器：与 backend/services/mock_data.py 保持一致的场景规则，
 * 用于后端不可用时的演示兜底。patient_id 末位字符决定风险等级：
 * green / yellow / red 三种场景循环。
 */

interface Scenario {
  patient_name: string
  department: string
  bed: string
  doctor_name: string
  summary: string
  alerts: Array<{
    risk_type: string
    title: string
    reason: string
    suggestion: string
    missing_data: string
  }>
}

const SCENARIOS: Record<RiskLevel, Scenario> = {
  green: {
    patient_name: '王建国',
    department: '呼吸内科',
    bed: '21床',
    doctor_name: '赵医生',
    summary: '本次血常规各项指标均处于正常参考范围，未见明显异常，建议按计划定期复查。',
    alerts: [],
  },
  yellow: {
    patient_name: '黄新群',
    department: '肿瘤科',
    bed: '12床',
    doctor_name: '张医生',
    summary:
      '白细胞计数轻度升高，中性粒细胞比例偏高，提示可能存在轻度感染或炎症反应；血红蛋白略低于参考下限，建议结合临床症状进一步观察。',
    alerts: [
      {
        risk_type: '炎症指标异常',
        title: '白细胞计数升高',
        reason: 'WBC 11.2×10^9/L，高于参考上限 10.0×10^9/L',
        suggestion: '建议复查血常规，结合体温与临床症状判断是否存在感染',
        missing_data: 'C反应蛋白(CRP)',
      },
      {
        risk_type: '贫血倾向',
        title: '血红蛋白偏低',
        reason: 'HGB 108 g/L，低于参考下限 115 g/L',
        suggestion: '建议补充铁代谢相关检查，关注饮食营养',
        missing_data: '血清铁、铁蛋白',
      },
    ],
  },
  red: {
    patient_name: '翠花',
    department: '血液科',
    bed: '03床',
    doctor_name: '李医生',
    summary:
      '血小板计数显著降低，凝血功能存在出血风险；同时伴白细胞异常增高，高度提示血液系统疾病进展，建议立即通知主管医生并复查。',
    alerts: [
      {
        risk_type: '出血风险',
        title: '血小板计数显著降低',
        reason: 'PLT 42×10^9/L，远低于参考下限 125×10^9/L',
        suggestion: '立即通知主管医生，避免剧烈活动与有创操作，必要时申请输注血小板',
        missing_data: '凝血四项',
      },
      {
        risk_type: '感染风险',
        title: '白细胞异常增高',
        reason: 'WBC 28.6×10^9/L，明显高于参考上限 10.0×10^9/L',
        suggestion: '建议尽快完善外周血涂片与骨髓穿刺检查',
        missing_data: '外周血涂片',
      },
    ],
  },
}

/** 与后端一致：按 patient_id 末位字符决定场景 */
export function resolveMockLevel(patientId: string): RiskLevel {
  const tail = patientId.trim().slice(-1) || '0'
  const levels: RiskLevel[] = ['green', 'yellow', 'red']
  return levels[tail.charCodeAt(0) % 3]
}

/** 生成一条本地 Mock 报告详情 */
export function generateMockReport(patientId: string): ReportDetail {
  const level = resolveMockLevel(patientId)
  const scenario = SCENARIOS[level]
  const now = new Date()
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate(),
  ).padStart(2, '0')}`
  const random = Math.random().toString(16).slice(2, 10).toUpperCase()

  return {
    id: Date.now(),
    event_id: `EVTMOCK${random}`,
    report_id: `RPT${stamp}${random.slice(0, 4)}`,
    patient_id: patientId,
    patient_name: scenario.patient_name,
    department: scenario.department,
    bed: scenario.bed,
    doctor_id: null,
    doctor_name: scenario.doctor_name,
    nurse_id: null,
    overall_level: level,
    summary: scenario.summary,
    alerts: scenario.alerts.map((alert) => ({ ...alert, level })),
    status: 'pending',
    created_at: now.toISOString().slice(0, 19),
    files: [],
    treatments: [],
  }
}

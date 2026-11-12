import type { ReportStatus, RiskLevel } from '../types'

/** 风险等级的展示文案与配色 */
export const LEVEL_META: Record<
  RiskLevel,
  { text: string; color: string; tagColor: string; description: string }
> = {
  green: {
    text: '正常',
    color: '#52c41a',
    tagColor: 'green',
    description: '各项检查指标处于正常参考范围，请保持定期复查。',
  },
  yellow: {
    text: '异常提醒',
    color: '#faad14',
    tagColor: 'gold',
    description: '存在需要关注的异常指标，建议尽快咨询主治医生。',
  },
  red: {
    text: '高风险',
    color: '#ff4d4f',
    tagColor: 'red',
    description: '存在高风险指标，请立即联系医护人员进行处理。',
  },
}

/** 报告状态文案 */
export const STATUS_META: Record<ReportStatus, { text: string; color: string }> = {
  pending: { text: '待处理', color: 'processing' },
  processed: { text: '已处理', color: 'success' },
}

/** 上传分析阶段（上传后依次展示，营造分析过程） */
export const ANALYSIS_STAGES = ['正在AI分析...', 'OCR解析...', '指标检测...', '风险评估...']

/** 允许上传的文件类型（仅图片：Dify 起始节点的 report_image 变量只接受 image/audio） */
export const ACCEPT_TYPES = '.png,.jpg,.jpeg'

/** 单文件大小上限 20MB（与后端 MAX_UPLOAD_SIZE 保持一致） */
export const MAX_FILE_SIZE = 20 * 1024 * 1024

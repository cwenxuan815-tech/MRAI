import { Tag } from 'antd'
import { LEVEL_META } from '../constants/medical'
import type { RiskLevel } from '../types'

interface Props {
  level: RiskLevel | string | null | undefined
  /** 是否显示圆点前缀 */
  showDot?: boolean
}

/** 风险等级标签：green 正常 / yellow 异常提醒 / red 高风险 */
export default function RiskTag({ level, showDot = true }: Props) {
  const meta = LEVEL_META[(level as RiskLevel) ?? 'green'] ?? LEVEL_META.green
  return (
    <Tag
      color={meta.tagColor}
      style={{ fontSize: 13, padding: '2px 10px', borderRadius: 6, margin: 0 }}
    >
      {showDot && (
        <span
          style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: meta.color,
            marginRight: 6,
            verticalAlign: 'middle',
          }}
        />
      )}
      {meta.text}
    </Tag>
  )
}

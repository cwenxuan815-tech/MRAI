import { Card, Descriptions, Tag, Typography } from 'antd'
import {
  BulbOutlined,
  ExclamationCircleOutlined,
  FileSearchOutlined,
} from '@ant-design/icons'
import { LEVEL_META } from '../constants/medical'
import type { PatientAlert } from '../types'

interface Props {
  alert: PatientAlert
  /** 序号，从 1 开始 */
  index: number
}

const { Paragraph } = Typography

/** 单条异常提醒卡片：展示 title / message / recommendation / missing_data */
export default function AlertCard({ alert, index }: Props) {
  const meta = LEVEL_META[alert.level] ?? LEVEL_META.yellow

  return (
    <Card
      size="small"
      style={{
        marginBottom: 16,
        borderLeft: `4px solid ${meta.color}`,
        borderRadius: 8,
      }}
      styles={{ body: { padding: 16 } }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <ExclamationCircleOutlined style={{ color: meta.color, fontSize: 16 }} />
        <span style={{ fontSize: 15, fontWeight: 600 }}>
          {index}. {alert.title}
        </span>
        <Tag color={meta.tagColor} style={{ margin: 0 }}>
          {meta.text}
        </Tag>
      </div>

      <Descriptions column={1} size="small" styles={{ label: { width: 96, color: '#8c8c8c' } }}>
        <Descriptions.Item label="异常说明">
          <Paragraph style={{ marginBottom: 0 }}>{alert.message}</Paragraph>
        </Descriptions.Item>
        <Descriptions.Item
          label={
            <span>
              <BulbOutlined style={{ marginRight: 4 }} />
              建议
            </span>
          }
        >
          <Paragraph style={{ marginBottom: 0, color: '#0284c7' }}>
            {alert.recommendation}
          </Paragraph>
        </Descriptions.Item>
        <Descriptions.Item
          label={
            <span>
              <FileSearchOutlined style={{ marginRight: 4 }} />
              缺失数据
            </span>
          }
        >
          <Paragraph style={{ marginBottom: 0, color: '#8c8c8c' }}>
            {alert.missing_data}
          </Paragraph>
        </Descriptions.Item>
      </Descriptions>
    </Card>
  )
}

import { useEffect, useRef, useState } from 'react'
import type { DoctorSocketMessage } from '../types'

/** WebSocket 连接状态 */
export type SocketStatus = 'connecting' | 'open' | 'closed'

/** 断线重连间隔 / 心跳间隔 */
const RECONNECT_DELAY = 3000
const HEARTBEAT_INTERVAL = 25000

/** 开发环境走 Vite 代理（/ws -> 后端 8000），生产环境走同源地址 */
function resolveSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${protocol}://${window.location.host}/ws/doctor`
}

/**
 * 医护端实时通道：
 * - 自动重连（断开后 3s 重试）
 * - 25s 心跳保活，避免长时间无数据被中间层断开
 * - 收到的消息交给 onMessage 处理（用 ref 保存，避免因回调变化反复重建连接）
 */
export function useDoctorSocket(
  onMessage: (message: DoctorSocketMessage) => void,
): SocketStatus {
  const [status, setStatus] = useState<SocketStatus>('connecting')
  const handlerRef = useRef(onMessage)
  handlerRef.current = onMessage

  useEffect(() => {
    let socket: WebSocket | null = null
    let reconnectTimer: number | undefined
    let heartbeatTimer: number | undefined
    let disposed = false

    const connect = () => {
      if (disposed) return
      setStatus('connecting')
      socket = new WebSocket(resolveSocketUrl())

      socket.onopen = () => {
        setStatus('open')
        heartbeatTimer = window.setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'ping' }))
          }
        }, HEARTBEAT_INTERVAL)
      }

      socket.onmessage = (event) => {
        try {
          handlerRef.current(JSON.parse(event.data) as DoctorSocketMessage)
        } catch {
          // 非法消息直接忽略，不影响连接
        }
      }

      socket.onclose = () => {
        window.clearInterval(heartbeatTimer)
        setStatus('closed')
        if (disposed) return
        reconnectTimer = window.setTimeout(connect, RECONNECT_DELAY)
      }

      socket.onerror = () => socket?.close()
    }

    connect()

    return () => {
      disposed = true
      window.clearTimeout(reconnectTimer)
      window.clearInterval(heartbeatTimer)
      socket?.close()
    }
  }, [])

  return status
}

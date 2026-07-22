import SockJS from 'sockjs-client'
import { over } from 'stompjs'
import type { Client } from 'stompjs'

export interface CaNotification {
  type: 'BIND' | 'UNBIND' | 'DISTRIBUTE' | 'REVOKE' | 'ERROR' | string
  message: string
  timestamp: string
}

const RECONNECT_DELAY_MS = 5000

// 连接 CA 系统通知 WebSocket（SockJS + STOMP），返回断开函数。
// 用登录拿到的 JWT 认证，订阅当前用户的个人消息频道。
export function connectCaNotifications(
  token: string,
  onMessage: (notification: CaNotification) => void,
): () => void {
  let disposed = false
  let client: Client | null = null
  let reconnectTimer: number | undefined

  function connect() {
    if (disposed) return
    const socket = new SockJS(`/ws?token=${encodeURIComponent(token)}`)
    client = over(socket)
    client.debug = () => {}
    client.connect(
      {},
      () => {
        if (disposed) return
        client?.subscribe('/user/queue/notifications', (msg) => {
          try {
            onMessage(JSON.parse(msg.body) as CaNotification)
          } catch {
            // 忽略无法解析的消息
          }
        })
      },
      () => {
        if (disposed) return
        reconnectTimer = window.setTimeout(connect, RECONNECT_DELAY_MS)
      },
    )
  }

  connect()

  return () => {
    disposed = true
    if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer)
    try {
      client?.disconnect(() => {})
    } catch {
      // 忽略断开时的异常
    }
  }
}

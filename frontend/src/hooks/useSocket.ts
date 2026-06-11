import { useEffect, useRef } from 'react'
import { getSocket, _offlineCounts, _offlineNotified } from '@/lib/socket'
import { useServerStore } from '@/store/useServerStore'

export function useSocket() {
  const setStatuses = useServerStore((s) => s.setStatuses)
  const prevStatusesRef = useRef<ReturnType<typeof useServerStore.getState>['statuses']>([])

  useEffect(() => {
    const socket = getSocket()

    const handleStatusUpdate = (data: unknown) => {
      // 服务器发送的是 plain array，也可能包在 { statuses: [...] } 中
      const raw = (data as Record<string, unknown>)?.statuses ?? data
      const statuses = Array.isArray(raw) ? raw as ReturnType<typeof useServerStore.getState>['statuses'] : []
      if (!Array.isArray(statuses)) return

      setStatuses(statuses)
      checkNotifications(statuses, prevStatusesRef.current)
      prevStatusesRef.current = statuses
      updateFavicon(statuses)
    }

    socket.on('status_update', handleStatusUpdate)
    return () => {
      socket.off('status_update', handleStatusUpdate)
    }
  }, [setStatuses])
}

function checkNotifications(
  current: ReturnType<typeof useServerStore.getState>['statuses'],
  previous: ReturnType<typeof useServerStore.getState>['statuses']
) {
  // 通知逻辑——从原 app.js 迁移
  // 使用 socket.ts 模块级 _offlineCounts / _offlineNotified
  // 详细实现将在阶段 5 完善
  void previous
  for (const s of current) {
    if (!s.online) {
      const count = (_offlineCounts.get(s.id) ?? 0) + 1
      _offlineCounts.set(s.id, count)
    } else {
      _offlineCounts.set(s.id, 0)
      if (_offlineNotified.has(s.id)) {
        _offlineNotified.delete(s.id)
      }
    }
  }
}

function updateFavicon(statuses: ReturnType<typeof useServerStore.getState>['statuses']) {
  const onlineCount = statuses.filter((s) => s.online).length
  const total = statuses.length
  if (total === 0) return

  const canvas = document.getElementById('faviconCanvas') as HTMLCanvasElement | null
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.clearRect(0, 0, 64, 64)
  let color = '#22c55e'
  if (onlineCount === 0) color = '#ef4444'
  else if (onlineCount < total) color = '#f97316'

  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(32, 32, 28, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#fff'
  ctx.font = 'bold 24px system-ui'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(onlineCount), 32, 32)
}

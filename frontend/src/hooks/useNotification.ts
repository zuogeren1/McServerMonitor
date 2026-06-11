import { useState, useCallback } from 'react'

export function useNotification() {
  const [permission, setPermission] = useState<NotificationPermission>(() => {
    return 'Notification' in window ? Notification.permission : 'denied'
  })

  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) return false
    const result = await Notification.requestPermission()
    setPermission(result)
    return result === 'granted'
  }, [])

  const notify = useCallback(
    (title: string, options?: NotificationOptions) => {
      if (permission !== 'granted') return
      try {
        new Notification(title, options)
      } catch {
        // 忽略通知发送失败
      }
    },
    [permission]
  )

  return { permission, requestPermission, notify }
}

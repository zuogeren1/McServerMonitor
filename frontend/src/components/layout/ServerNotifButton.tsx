import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Bell, BellOff } from 'lucide-react'

export function useServerNotif() {
  const [enabled, setEnabled] = useState(() => localStorage.getItem('serverNotif') === 'true')

  const toggle = useCallback(() => {
    if (enabled) {
      setEnabled(false)
      localStorage.setItem('serverNotif', 'false')
      return
    }
    // 请求通知权限
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then((p) => {
        if (p === 'granted') {
          setEnabled(true)
          localStorage.setItem('serverNotif', 'true')
        }
      })
    } else {
      setEnabled(true)
      localStorage.setItem('serverNotif', 'true')
    }
  }, [enabled])

  return { enabled, toggle }
}

export function usePlayerNotif(serverId: number) {
  const [enabled, setEnabled] = useState(() => {
    try {
      const store = JSON.parse(localStorage.getItem('playerNotifServers') || '{}')
      return !!store[String(serverId)]
    } catch { return false }
  })

  const toggle = useCallback(() => {
    try {
      const store = JSON.parse(localStorage.getItem('playerNotifServers') || '{}')
      if (enabled) {
        delete store[String(serverId)]
      } else {
        if ('Notification' in window && Notification.permission === 'default') {
          Notification.requestPermission().then((p) => {
            if (p === 'granted') {
              store[String(serverId)] = true
              localStorage.setItem('playerNotifServers', JSON.stringify(store))
              setEnabled(true)
            }
          })
          return
        }
        store[String(serverId)] = true
      }
      localStorage.setItem('playerNotifServers', JSON.stringify(store))
      setEnabled(!enabled)
    } catch { /* */ }
  }, [serverId, enabled])

  return { enabled, toggle }
}

export function ServerNotifButton() {
  const { enabled, toggle } = useServerNotif()
  return (
    <Button variant={enabled ? 'default' : 'outline'} size="sm" onClick={toggle}>
      {enabled ? <Bell size={14} className="mr-1" /> : <BellOff size={14} className="mr-1" />}
      {enabled ? '通知: 开' : '通知: 关'}
    </Button>
  )
}

export function PlayerNotifButton({ serverId, hasRcon }: { serverId: number; hasRcon: boolean }) {
  const { enabled, toggle } = usePlayerNotif(serverId)
  return (
    <Button
      variant={enabled ? 'default' : 'outline'}
      size="sm"
      onClick={toggle}
      title={hasRcon ? 'RCON 已启用，不受玩家数量限制' : '仅在玩家数量小于等于12位时进行通知'}
    >
      {enabled ? <Bell size={14} className="mr-1" /> : <BellOff size={14} className="mr-1" />}
      {enabled ? '玩家通知: 开' : '玩家通知: 关'}
    </Button>
  )
}

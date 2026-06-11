import { useEffect, useState, useRef } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Sidebar } from '@/components/layout/Sidebar'
import { MobileMenu } from '@/components/layout/MobileMenu'
import { HomePage } from '@/components/home/HomePage'
import { ServersPage } from '@/components/home/ServersPage'
import { DetailPage } from '@/components/detail/DetailPage'
import { PlayersPage } from '@/components/players/PlayersPage'
import { PlayerDetailPage } from '@/components/players/PlayerDetailPage'
import { AdminPage } from '@/components/admin/AdminPage'
import { PlayerManagePage } from '@/components/admin/PlayerManagePage'
import { LoginDialog } from '@/components/modals/LoginDialog'
import { useSocket } from '@/hooks/useSocket'
import { useTheme } from '@/hooks/useTheme'
import { useNotification } from '@/hooks/useNotification'
import { useUIStore } from '@/store/useUIStore'
import { useAuthStore } from '@/store/useAuthStore'
import { useServerStore } from '@/store/useServerStore'
import { cn } from '@/lib/utils'
import { fetchConfig } from '@/lib/api'
import type { ServerStatus } from '@/lib/api'
import { _offlineCounts, _offlineNotified } from '@/lib/socket'

function PageContent() {
  const page = useUIStore((s) => s.currentPage)
  switch (page) {
    case 'home': return <HomePage />
    case 'servers': return <ServersPage />
    case 'detail': return <DetailPage />
    case 'players': return <PlayersPage />
    case 'player-detail': return <PlayerDetailPage />
    case 'admin': return <AdminPage />
    case 'player-manage': return <PlayerManagePage />
    default: return <HomePage />
  }
}

function useNotificationSystem() {
  const { notify, permission, requestPermission } = useNotification()
  const prevStatusesRef = useRef<ServerStatus[]>([])
  const statuses = useServerStore((s) => s.statuses)
  const serverNotifEnabled = useRef(true)

  // 页面初始化时从 localStorage 恢复状态
  useEffect(() => {
    const stored = localStorage.getItem('serverNotifEnabled')
    if (stored !== null) serverNotifEnabled.current = stored === '1'
  }, [])

  useEffect(() => {
    if (permission !== 'granted') return

    const current = statuses
    const prev = prevStatusesRef.current

    for (const s of current) {
      // 服务器上线/离线通知
      if (!s.online) {
        const count = (_offlineCounts.get(s.id) ?? 0) + 1
        _offlineCounts.set(s.id, count)
      } else {
        _offlineCounts.set(s.id, 0)
        if (serverNotifEnabled.current && prev.length > 0) {
          const prevS = prev.find((x) => x.id === s.id)
          if (prevS && !prevS.online && _offlineNotified.has(s.id)) {
            notify(`${s.name} 已上线`, { body: `服务器已恢复在线`, icon: '/favicon.svg' })
          }
          _offlineNotified.delete(s.id)
        }
      }
    }

    prevStatusesRef.current = current
  }, [statuses, permission, notify])

  return { permission, requestPermission, serverNotifEnabled }
}

function App() {
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed)
  const [loginOpen, setLoginOpen] = useState(false)
  const { requestPermission, serverNotifEnabled } = useNotificationSystem()

  // 初始化
  useSocket()
  useTheme()

  useEffect(() => {
    fetchConfig().then((cfg) => {
      useAuthStore.getState().setRequireLogin(cfg.require_login)
      if (cfg.need_login) setLoginOpen(true)
    }).catch(() => {})

    // 请求通知权限
    if ('Notification' in window && Notification.permission === 'default') {
      requestPermission()
    }
  }, [requestPermission])

  // 暴露 API 到 window 给外部调用（如导航到管理页时检查登录）
  useEffect(() => {
    const checkLogin = () => {
      const store = useAuthStore.getState()
      if (store.requireLogin && !store.loggedIn) {
        setLoginOpen(true)
        return false
      }
      return true
    }
    ;(window as unknown as Record<string, unknown>)._mcCheckLogin = checkLogin

    const toggleNotif = () => {
      serverNotifEnabled.current = !serverNotifEnabled.current
      localStorage.setItem('serverNotifEnabled', serverNotifEnabled.current ? '1' : '0')
    }
    ;(window as unknown as Record<string, unknown>)._mcToggleNotif = toggleNotif
  }, [serverNotifEnabled])

  return (
    <TooltipProvider>
      <div className="flex h-screen bg-(--color-bg) text-(--color-text)">
        <Sidebar />
        <MobileMenu />
        <main
          className={cn(
            'flex-1 overflow-auto transition-[margin] duration-200',
            sidebarCollapsed ? 'ml-[var(--sidebar-narrow)]' : 'ml-[var(--sidebar-wide)]',
            'max-md:ml-0'
          )}
        >
          <PageContent />
        </main>
        <canvas id="faviconCanvas" width="64" height="64" style={{ display: 'none' }} />
      </div>

      <LoginDialog open={loginOpen} onClose={() => setLoginOpen(false)} />
    </TooltipProvider>
  )
}

export default App

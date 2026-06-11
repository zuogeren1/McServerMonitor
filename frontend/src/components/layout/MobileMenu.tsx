import { Menu } from 'lucide-react'
import { useUIStore } from '@/store/useUIStore'
import { useMediaQuery } from '@/hooks/useMediaQuery'

export function MobileMenu() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUIStore((s) => s.setSidebarCollapsed)
  const isMobile = useMediaQuery('(max-width: 767px)')

  if (!isMobile) return null

  return (
    <button
      onClick={() => toggleSidebar(!collapsed)}
      className="fixed top-3 left-3 z-30 p-2 rounded-md bg-(--color-card) border border-(--color-border) text-(--color-text) hover:bg-white/10 transition-colors"
      title="菜单"
    >
      <Menu size={20} />
    </button>
  )
}

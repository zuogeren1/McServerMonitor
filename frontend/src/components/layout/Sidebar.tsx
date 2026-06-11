import { useUIStore } from '@/store/useUIStore'
import { useTheme } from '@/hooks/useTheme'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import {
  Cuboid,
  Home,
  Server,
  Users,
  List,
  Settings,
  ChevronLeft,
  Sun,
  Moon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { page: 'home', label: '首页', icon: Home },
  { page: 'servers', label: '服务器', icon: Server },
  { page: 'players', label: '玩家', icon: Users },
] as const

const ADMIN_ITEMS = [
  { page: 'player-manage', label: '玩家管理', icon: List },
  { page: 'admin', label: '管理', icon: Settings },
] as const

export function Sidebar() {
  const currentPage = useUIStore((s) => s.currentPage)
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUIStore((s) => s.setSidebarCollapsed)
  const setCurrentPage = useUIStore((s) => s.setCurrentPage)
  const isMobile = useMediaQuery('(max-width: 767px)')
  const { theme, toggleTheme } = useTheme()

  const navTo = (page: string) => {
    setCurrentPage(page)
    if (isMobile) toggleSidebar(true) // 移动端导航后自动收起
  }

  return (
    <>
      {/* 移动端遮罩 */}
      {isMobile && !collapsed && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => toggleSidebar(true)}
        />
      )}

      <aside
        className={cn(
          'fixed top-0 left-0 z-50 flex flex-col h-full transition-all duration-200',
          'bg-(--color-sidebar-bg) border-r border-(--color-border)',
          isMobile
            ? cn(
                collapsed ? '-translate-x-full' : 'translate-x-0',
                'w-[var(--sidebar-wide)]'
              )
            : cn(
                collapsed ? 'w-[var(--sidebar-narrow)]' : 'w-[var(--sidebar-wide)]'
              )
        )}
      >
        {/* 头部 */}
        <div className="flex items-center gap-2 px-4 h-14 border-b border-(--color-border) shrink-0">
          <div className="flex items-center justify-center w-7 h-7 text-(--color-accent)">
            <Cuboid size={24} />
          </div>
          {!collapsed && (
            <h2 className="text-sm font-semibold whitespace-nowrap overflow-hidden">
              MC Monitor
            </h2>
          )}
          {!collapsed && (
            <button
              onClick={toggleTheme}
              className="ml-auto p-1 rounded hover:bg-white/10 transition-colors"
              title="切换主题"
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          )}
        </div>

        {/* 导航 */}
        <nav className="flex-1 flex flex-col gap-0.5 px-2 py-3 overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <NavButton
              key={item.page}
              icon={item.icon}
              label={item.label}
              active={currentPage === item.page}
              collapsed={collapsed}
              onClick={() => navTo(item.page)}
            />
          ))}

          <div className="my-2 border-t border-(--color-border)" />

          {ADMIN_ITEMS.map((item) => (
            <NavButton
              key={item.page}
              icon={item.icon}
              label={item.label}
              active={currentPage === item.page}
              collapsed={collapsed}
              onClick={() => navTo(item.page)}
            />
          ))}
        </nav>

        {/* 折叠按钮（桌面端） */}
        {!isMobile && (
          <div className="p-2 border-t border-(--color-border)">
            <button
              onClick={() => toggleSidebar(!collapsed)}
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-(--color-muted) hover:bg-white/10 hover:text-(--color-text) transition-colors text-sm"
              title={collapsed ? '展开侧边栏' : '收起侧边栏'}
            >
              <span
                className={cn(
                  'flex items-center justify-center w-6 h-6 transition-transform',
                  collapsed && 'rotate-180'
                )}
              >
                <ChevronLeft size={16} />
              </span>
              {!collapsed && <span>收起侧边栏</span>}
            </button>
          </div>
        )}
      </aside>
    </>
  )
}

function NavButton({
  icon: Icon,
  label,
  active,
  collapsed,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number }>
  label: string
  active: boolean
  collapsed: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm w-full',
        active
          ? 'bg-(--color-accent)/15 text-(--color-accent)'
          : 'text-(--color-muted) hover:bg-white/10 hover:text-(--color-text)'
      )}
    >
      <span className="flex items-center justify-center w-5 h-5 shrink-0">
        <Icon size={20} />
      </span>
      {!collapsed && <span className="whitespace-nowrap overflow-hidden">{label}</span>}
    </button>
  )
}

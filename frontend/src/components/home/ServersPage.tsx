import { ServerCard } from './ServerCard'
import { useServerStore } from '@/store/useServerStore'

export function ServersPage() {
  const statuses = useServerStore((s) => s.statuses)
  const total = statuses.length

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-xl font-bold">服务器</h2>
      </div>
      {total === 0 ? (
        <div className="text-center py-16 text-(--color-muted)">
          <p className="text-lg">暂无服务器</p>
          <p className="text-sm mt-1">前往管理页面添加服务器</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {statuses.map((s) => (
            <ServerCard key={s.server_id} server={s} showMotd />
          ))}
        </div>
      )}
    </div>
  )
}

import { useServerStore } from '@/store/useServerStore'

export function StatsBar() {
  const statuses = useServerStore((s) => s.statuses)
  const total = statuses.length
  const online = statuses.filter((s: { online: boolean }) => s.online).length

  return (
    <div className="flex gap-4 mb-6">
      <div className="flex-1 rounded-lg bg-(--color-card) border border-(--color-border) p-4 text-center">
        <div className="text-2xl font-bold">{total}</div>
        <div className="text-sm text-(--color-muted)">服务器总数</div>
      </div>
      <div className="flex-1 rounded-lg bg-(--color-card) border border-(--color-border) p-4 text-center">
        <div className="text-2xl font-bold" style={{ color: 'var(--color-online)' }}>
          {online}
        </div>
        <div className="text-sm text-(--color-muted)">在线</div>
      </div>
    </div>
  )
}

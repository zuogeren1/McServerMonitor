import type { ServerStatus } from '@/lib/api'
import { avatarUrl, esc } from '@/lib/utils'

interface Props {
  server: ServerStatus
  onPlayerClick?: (name: string) => void
}

export function PlayerChipList({ server: s }: Props) {
  // mcstatus 返回的在线玩家列表在 status 中不直接返回
  // 实际玩家数据通过 /api/status/<id> 获取，或由后端在 status_update 中推送
  // 此处展示人数，玩家芯片列表在阶段 6 结合 Chart.js 完善
  return (
    <div className="rounded-lg bg-(--color-card) border border-(--color-border) p-4">
      <h3 className="font-semibold mb-3">
        在线玩家 <span className="text-(--color-muted) font-normal">({s.players.online} / {s.players.max})</span>
      </h3>
      {s.players.online === 0 ? (
        <p className="text-sm text-(--color-muted)">暂无在线玩家</p>
      ) : (
        <p className="text-sm text-(--color-muted)">
          {s.players.online} 名玩家在线
          <br />
          <span className="text-xs">点击玩家名称可在图表中查看详情</span>
        </p>
      )}
    </div>
  )
}

export function PlayerChip({ name, uuid, onClick }: { name: string; uuid?: string | null; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-white/10 transition-colors text-sm"
    >
      <img
        src={avatarUrl(uuid ?? null, name)}
        alt=""
        className="w-6 h-6 rounded"
        onError={(e) => {
          (e.target as HTMLImageElement).src = avatarUrl(null, '')
        }}
      />
      <span className="truncate max-w-[120px]">{esc(name)}</span>
    </button>
  )
}

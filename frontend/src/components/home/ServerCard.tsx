import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { fmtAddr, esc } from '@/lib/utils'
import { useUIStore } from '@/store/useUIStore'
import { useServerStore } from '@/store/useServerStore'
import type { ServerStatus } from '@/lib/api'

interface Props {
  server: ServerStatus
  showMotd?: boolean
}

export function ServerCard({ server: s, showMotd }: Props) {
  const currentPage = useUIStore((s) => s.currentPage)
  const setCurrentPage = useUIStore((s) => s.setCurrentPage)
  const pushNav = useUIStore((s) => s.pushNavigation)
  const setDetailServerId = useServerStore((s) => s.setDetailServerId)

  const openDetail = () => {
    pushNav({ page: currentPage, detailServerId: undefined })
    setDetailServerId(s.server_id)
    setCurrentPage('detail')
  }

  const bkp = (s.backup_statuses || []).filter((b) => b.type === 'backup' || b.online !== undefined)
  const backupOnline = bkp.filter((b) => b.online).length
  const backupColor =
    backupOnline === bkp.length
      ? 'var(--color-online)'
      : backupOnline > 0
        ? '#f59e0b'
        : 'var(--color-offline)'

  return (
    <Card
      className="cursor-pointer transition-colors hover:border-[#6366f1] hover:bg-[#6366f1]/10"
      onClick={openDetail}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-base truncate flex items-center gap-2">
              {esc(s.server_name)}
              <Badge
  className={`text-xs shrink-0 font-bold border-0 py-0.5 px-1.5 rounded ${s.server_type === 'bedrock' ? 'type-badge-bedrock' : 'type-badge-java'}`}
  style={s.server_type === 'bedrock'
    ? { background: '#1e3a5f', color: '#60a5fa' }
    : { background: '#422006', color: '#fbbf24' }}>
  {s.server_type === 'bedrock' ? '基岩' : 'Java'}
</Badge>
            </div>
            <div className="text-xs text-(--color-muted) mt-0.5">
              {fmtAddr(s.active_host ?? '', s.active_port)}
            </div>
          </div>
          <Badge
            variant="outline"
            className="shrink-0 ml-2"
            style={{
              color: s.online ? 'var(--color-online)' : 'var(--color-offline)',
              borderColor: s.online ? 'var(--color-online)' : 'var(--color-offline)',
            }}
          >
            {s.online ? '在线' : '离线'}
          </Badge>
        </div>

        <div className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <div className="text-xs text-(--color-muted)">延迟</div>
            <div>{s.latency != null ? `${s.latency} ms` : '--'}</div>
          </div>
          <div>
            <div className="text-xs text-(--color-muted)">版本</div>
            <div className="truncate">{s.version || '--'}</div>
          </div>
          <div>
            <div className="text-xs text-(--color-muted)">玩家</div>
            <div>{s.players.online} / {s.players.max}</div>
          </div>
        </div>

        {bkp.length > 0 && (
          <div className="mt-2 text-sm">
            <span className="text-xs text-(--color-muted)">副地址 </span>
            <span style={{ color: backupColor }}>
              {backupOnline} / {bkp.length}
            </span>
          </div>
        )}

        {showMotd && s.motd_html && (
          <div
            className="mt-3 text-xs font-mono whitespace-pre-wrap break-words"
            style={{ fontFamily: "'Consolas','Courier New',monospace" }}
            dangerouslySetInnerHTML={{ __html: s.motd_html }}
          />
        )}
      </CardContent>
    </Card>
  )
}

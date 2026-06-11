import type { ServerStatus } from '@/lib/api'
import { fmtAddr } from '@/lib/utils'

interface Props {
  server: ServerStatus
}

export function BackupStatusPanel({ server: s }: Props) {
  const all = s.backup_statuses || []

  return (
    <div className="rounded-lg bg-(--color-card) border border-(--color-border) p-4">
      <h3 className="font-semibold mb-2">地址状态</h3>
      <div className="space-y-1.5 text-sm">
        {all.length === 0 ? (
          <span className="text-(--color-muted)">
            {fmtAddr(s.active_host ?? '', s.active_port)}
            <span className="ml-2" style={{ color: s.online ? 'var(--color-online)' : 'var(--color-offline)' }}>
              {s.online ? s.latency != null ? `${s.latency} ms` : '在线' : '离线'}
            </span>
          </span>
        ) : (
          all.map((b, i) => (
            <div key={i} className="flex items-center justify-between">
              <span className="text-(--color-muted) truncate mr-2">
                {fmtAddr(b.host, b.port)}
              </span>
              <span
                className="shrink-0"
                style={{ color: b.online ? 'var(--color-online)' : 'var(--color-offline)' }}
              >
                {b.online
                  ? b.latency != null
                    ? `${b.latency} ms`
                    : '在线'
                  : b.error || '离线'}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

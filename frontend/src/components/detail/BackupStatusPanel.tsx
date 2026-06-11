import type { ServerStatus } from '@/lib/api'
import { fmtAddr } from '@/lib/utils'

interface Props {
  server: ServerStatus
}

export function BackupStatusPanel({ server: s }: Props) {
  const backups = (s.backup_statuses || []).filter((b) => b.type === 'backup')

  return (
    <div className="rounded-lg bg-(--color-card) border border-(--color-border) p-4">
      <h3 className="font-semibold mb-2">副地址状态</h3>
      {backups.length === 0 ? (
        <p className="text-sm text-(--color-muted)">无副地址</p>
      ) : (
        <div className="space-y-1.5 text-sm">
          {backups.map((b, i) => (
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
          ))}
        </div>
      )}
    </div>
  )
}

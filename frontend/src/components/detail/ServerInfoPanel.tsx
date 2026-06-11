import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { type ServerStatus } from '@/lib/api'
import { fmtAddr, esc } from '@/lib/utils'
import { Check, Copy } from 'lucide-react'
import { useState, useCallback } from 'react'

interface Props {
  server: ServerStatus
}

export function ServerInfoPanel({ server: s }: Props) {
  const addr = fmtAddr(s.active_host ?? '', s.active_port)
  const [copied, setCopied] = useState(false)

  const copyAddr = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(addr)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* ignore */ }
  }, [addr])

  return (
    <div className="rounded-lg bg-(--color-card) border border-(--color-border) p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg">
          {esc(s.server_name)}
          {' '}
          <Badge
          className={`text-xs font-bold border-0 py-0.5 px-1.5 rounded ${s.server_type === 'bedrock' ? 'type-badge-bedrock' : 'type-badge-java'}`}
          style={s.server_type === 'bedrock'
            ? { background: '#1e3a5f', color: '#60a5fa' }
            : { background: '#422006', color: '#fbbf24' }}>
          {s.server_type === 'bedrock' ? '基岩' : 'Java'}
        </Badge>
        </h3>
        <Badge
          variant="outline"
          style={{
            color: s.online ? 'var(--color-online)' : 'var(--color-offline)',
            borderColor: s.online ? 'var(--color-online)' : 'var(--color-offline)',
          }}
        >
          {s.online ? '在线' : '离线'}
        </Badge>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-(--color-muted)">{esc(addr)}</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={copyAddr} title="复制地址">
          {copied ? <Check size={14} className="text-(--color-online)" /> : <Copy size={14} />}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div><span className="text-(--color-muted)">延迟：</span>{s.latency != null ? `${s.latency} ms` : '--'}</div>
        <div><span className="text-(--color-muted)">版本：</span>{s.version || '--'}</div>
      </div>

      {s.motd_html && (
        <div
          className="text-xs font-mono whitespace-pre-wrap break-words p-2 rounded bg-(--color-hover)"
          style={{ fontFamily: "'Consolas','Courier New',monospace" }}
          dangerouslySetInnerHTML={{ __html: s.motd_html }}
        />
      )}
    </div>
  )
}

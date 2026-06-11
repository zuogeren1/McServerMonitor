import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { login, fetchConfig } from '@/lib/api'
import { useAuthStore } from '@/store/useAuthStore'

interface Props {
  open: boolean
  onClose: () => void
}

export function LoginDialog({ open, onClose }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const setLoggedIn = useAuthStore((s) => s.setLoggedIn)
  const setRequireLogin = useAuthStore((s) => s.setRequireLogin)

  const handleLogin = async () => {
    setError('')
    setLoading(true)
    try {
      const res = await login(username, password)
      if (res.ok) {
        setLoggedIn(true)
        fetchConfig().then((c) => setRequireLogin(c.require_login)).catch(() => {})
        onClose()
      } else {
        setError(res.error || '登录失败')
      }
    } catch {
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>登录</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder="用户名"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          />
          <Input
            type="password"
            placeholder="密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          />
          {error && <p className="text-sm text-(--color-offline)">{error}</p>}
          <Button className="w-full" onClick={handleLogin} disabled={loading}>
            {loading ? '登录中...' : '登录'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

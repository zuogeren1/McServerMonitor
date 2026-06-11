import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function esc(str: string | null | undefined): string {
  if (!str) return ""
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export function fmtAddr(host: string, port: number | null | undefined): string {
  if (port == null) return esc(host)
  return esc(host) + ":" + port
}

export function avatarUrl(uuid: string | null, name: string): string {
  const id = uuid ? uuid.trim() : ""
  if (id) return `https://crafthead.net/avatar/${encodeURIComponent(id)}`
  const cleanName = (name || "").trim()
  if (!cleanName || cleanName.includes(" "))
    return "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22%3E%3Crect width=%2220%22 height=%2220%22 fill=%22%23475569%22/%3E%3C/svg%3E"
  return `https://crafthead.net/avatar/${encodeURIComponent(cleanName)}`
}

export function formatDuration(sec: number | null | undefined): string {
  if (!sec || sec < 60) return Math.round(sec ?? 0) + "秒"
  if (sec < 3600) return Math.round(sec / 60) + "分"
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  if (m === 0) return h + "小时"
  return h + "小时" + m + "分"
}

import { create } from 'zustand'
import type { ServerStatus } from '@/lib/api'

interface ServerState {
  statuses: ServerStatus[]
  detailServerId: number | null

  setStatuses: (statuses: ServerStatus[]) => void
  setDetailServerId: (id: number | null) => void
}

export const useServerStore = create<ServerState>((set) => ({
  statuses: [],
  detailServerId: null,

  setStatuses: (statuses) => set({ statuses }),
  setDetailServerId: (id) => set({ detailServerId: id }),
}))

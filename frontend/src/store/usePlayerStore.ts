import { create } from 'zustand'
import type { PlayerInfo } from '@/lib/api'

interface PlayerState {
  players: PlayerInfo[]
  filter: 'all' | 'online' | 'offline'
  sort: string
  search: string
  detailName: string | null

  setPlayers: (players: PlayerInfo[]) => void
  setFilter: (filter: 'all' | 'online' | 'offline') => void
  setSort: (sort: string) => void
  setSearch: (search: string) => void
  setDetailName: (name: string | null) => void
}

export const usePlayerStore = create<PlayerState>((set) => ({
  players: [],
  filter: 'all',
  sort: 'name',
  search: '',
  detailName: null,

  setPlayers: (players) => set({ players }),
  setFilter: (filter) => set({ filter }),
  setSort: (sort) => set({ sort }),
  setSearch: (search) => set({ search }),
  setDetailName: (name) => set({ detailName: name }),
}))

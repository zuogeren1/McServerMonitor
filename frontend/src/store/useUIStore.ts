import { create } from 'zustand'

interface UIState {
  sidebarCollapsed: boolean
  currentPage: string
  navigationStack: { page: string; detailServerId?: number }[]

  setSidebarCollapsed: (v: boolean) => void
  setCurrentPage: (page: string) => void
  pushNavigation: (entry: { page: string; detailServerId?: number }) => void
  popNavigation: () => { page: string; detailServerId?: number } | undefined
}

export const useUIStore = create<UIState>((set, get) => ({
  sidebarCollapsed: localStorage.getItem('sidebarCollapsed') === '1',
  currentPage: 'home',
  navigationStack: [],

  setSidebarCollapsed: (v) => {
    localStorage.setItem('sidebarCollapsed', v ? '1' : '0')
    set({ sidebarCollapsed: v })
  },
  setCurrentPage: (page) => set({ currentPage: page }),
  pushNavigation: (entry) =>
    set((s) => ({ navigationStack: [...s.navigationStack, entry] })),
  popNavigation: () => {
    const stack = get().navigationStack
    if (stack.length === 0) return undefined
    const entry = stack[stack.length - 1]
    set({ navigationStack: stack.slice(0, -1) })
    return entry
  },
}))

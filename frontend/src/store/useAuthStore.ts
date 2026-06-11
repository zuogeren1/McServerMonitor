import { create } from 'zustand'

interface AuthState {
  loggedIn: boolean
  requireLogin: boolean

  setLoggedIn: (v: boolean) => void
  setRequireLogin: (v: boolean) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  loggedIn: false,
  requireLogin: true,

  setLoggedIn: (v) => set({ loggedIn: v }),
  setRequireLogin: (v) => set({ requireLogin: v }),
  logout: () => set({ loggedIn: false }),
}))

import { create } from 'zustand'

export interface User {
  id: string; name: string; email: string; role: string;
  tenantId: string; tenantName: string; plan: string;
}

interface AuthState {
  user: User | null; token: string | null; isAuthenticated: boolean;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: (() => { try { return JSON.parse(localStorage.getItem('iot_user') || 'null') } catch { return null } })(),
  token: localStorage.getItem('iot_token'),
  isAuthenticated: !!localStorage.getItem('iot_token'),
  setAuth: (user, token) => {
    localStorage.setItem('iot_token', token)
    localStorage.setItem('iot_user', JSON.stringify(user))
    set({ user, token, isAuthenticated: true })
  },
  logout: () => {
    localStorage.removeItem('iot_token')
    localStorage.removeItem('iot_user')
    set({ user: null, token: null, isAuthenticated: false })
  },
}))

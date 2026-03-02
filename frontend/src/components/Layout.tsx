import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../store/auth'
import { useQuery } from '@tanstack/react-query'
import { alertsApi } from '../services/api'
import { useState } from 'react'
import {
  LayoutDashboard, Cpu, BookOpen, MapPin, Bell, Zap,
  BarChart3, Users, Settings, LogOut, Radio, Shield, Menu
} from 'lucide-react'

const nav = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/devices', icon: Cpu, label: 'Dispositivos IoT' },
  { to: '/library', icon: BookOpen, label: 'Biblioteca' },
  { to: '/trackers', icon: MapPin, label: 'Rastreadores GPS' },
  { to: '/alerts', icon: Bell, label: 'Alertas' },
  { to: '/automations', icon: Zap, label: 'Automações' },
  { to: '/analytics', icon: BarChart3, label: 'Análise & IA' },
  { to: '/users', icon: Users, label: 'Usuários' },
  { to: '/settings', icon: Settings, label: 'Configurações' },
]

const roles: Record<string, string> = { superadmin: 'Super Admin', admin: 'Administrador', operator: 'Operador', viewer: 'Visualizador' }

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const { data: unread } = useQuery({
    queryKey: ['unread'],
    queryFn: () => alertsApi.unreadCount().then(r => r.data),
    refetchInterval: 30000,
  })

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      {open && <div className="fixed inset-0 bg-black/60 z-20 lg:hidden" onClick={() => setOpen(false)} />}

      <aside className={`fixed lg:static inset-y-0 left-0 z-30 w-64 bg-gray-900 border-r border-gray-800 flex flex-col transition-transform duration-300 ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-800">
          <div className="w-9 h-9 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center">
            <Radio className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">IoT Platform</p>
            <p className="text-xs text-gray-500 truncate max-w-[130px]">{user?.tenantName}</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {nav.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} onClick={() => setOpen(false)}
              className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all relative ${isActive ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/20' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}>
              <Icon size={18} className="flex-shrink-0" />
              <span>{label}</span>
              {to === '/alerts' && (unread?.count > 0) && (
                <span className="ml-auto bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                  {unread.count > 9 ? '9+' : unread.count}
                </span>
              )}
            </NavLink>
          ))}
          {user?.role === 'superadmin' && (
            <NavLink to="/superadmin" onClick={() => setOpen(false)}
              className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all mt-2 border ${isActive ? 'bg-purple-500/15 text-purple-400 border-purple-500/20' : 'text-purple-400/70 hover:bg-purple-500/10 hover:text-purple-300 border-purple-500/20'}`}>
              <Shield size={18} />
              <span>Super Admin</span>
            </NavLink>
          )}
        </nav>

        {/* User */}
        <div className="px-3 py-3 border-t border-gray-800">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-800/50">
            <div className="w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold text-sm flex-shrink-0">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-200 truncate">{user?.name}</p>
              <p className="text-xs text-gray-500">{roles[user?.role || 'viewer']}</p>
            </div>
            <button onClick={() => { logout(); navigate('/login') }} className="text-gray-500 hover:text-red-400 transition-colors" title="Sair">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-gray-900 border-b border-gray-800">
          <button onClick={() => setOpen(true)} className="text-gray-400 hover:text-white"><Menu size={22} /></button>
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-cyan-400" />
            <span className="font-bold text-white text-sm">IoT Platform</span>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

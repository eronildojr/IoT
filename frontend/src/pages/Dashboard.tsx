import { useQuery } from '@tanstack/react-query'
import { devicesApi, alertsApi } from '../services/api'
import { useAuth } from '../store/auth'
import { Link } from 'react-router-dom'
import { Cpu, Wifi, WifiOff, AlertTriangle, MapPin, Battery, Bell, Activity, TrendingUp, Zap, BookOpen } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

const PIE_COLORS = ['#10b981', '#6b7280', '#f59e0b', '#ef4444']

export default function Dashboard() {
  const { user } = useAuth()

  const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: () => devicesApi.stats().then(r => r.data), refetchInterval: 30000 })
  const { data: devData } = useQuery({ queryKey: ['devices-dash'], queryFn: () => devicesApi.list({ limit: 6 }).then(r => r.data) })
  const { data: alertData } = useQuery({ queryKey: ['alerts-dash'], queryFn: () => alertsApi.list({ limit: 5 }).then(r => r.data) })

  const pieData = stats ? [
    { name: 'Online', value: +stats.online || 0 },
    { name: 'Offline', value: +stats.offline || 0 },
    { name: 'Alerta', value: +stats.warning || 0 },
    { name: 'Erro', value: +stats.error || 0 },
  ].filter(d => d.value > 0) : []

  const chartData = Array.from({ length: 12 }, (_, i) => ({
    t: `${String(i * 2).padStart(2, '0')}h`,
    online: Math.floor(Math.random() * 20) + 5,
    alerts: Math.floor(Math.random() * 4),
  }))

  const cards = [
    { label: 'Total', value: stats?.total || 0, icon: Cpu, cls: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' },
    { label: 'Online', value: stats?.online || 0, icon: Wifi, cls: 'text-green-400 bg-green-500/10 border-green-500/20' },
    { label: 'Offline', value: stats?.offline || 0, icon: WifiOff, cls: 'text-gray-400 bg-gray-500/10 border-gray-500/20' },
    { label: 'Alertas', value: stats?.warning || 0, icon: AlertTriangle, cls: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' },
    { label: 'Rastreadores', value: stats?.trackers || 0, icon: MapPin, cls: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
    { label: 'Bateria Baixa', value: stats?.low_battery || 0, icon: Battery, cls: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
  ]

  const statusDot: Record<string, string> = { online: 'bg-green-400', offline: 'bg-gray-600', warning: 'bg-yellow-400', error: 'bg-red-400', provisioning: 'bg-blue-400' }
  const sevCls: Record<string, string> = { critical: 'bg-red-500/10 border-red-500/30 text-red-400', warning: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400', info: 'bg-blue-500/10 border-blue-500/30 text-blue-400' }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">Bem-vindo, {user?.name} · {user?.tenantName}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-700">
          <Activity size={14} className="text-green-400" />
          <span>Tempo real</span>
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {cards.map(({ label, value, icon: Icon, cls }) => (
          <div key={label} className="card p-4">
            <div className={`inline-flex p-2 rounded-lg border mb-3 ${cls}`}><Icon size={18} /></div>
            <div className="text-2xl font-bold text-white">{value}</div>
            <div className="text-xs font-medium text-gray-400 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card p-5">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2"><TrendingUp size={16} className="text-cyan-400" /> Atividade (24h)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="gOnline" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="t" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px', color: '#f3f4f6' }} />
              <Area type="monotone" dataKey="online" stroke="#06b6d4" fill="url(#gOnline)" strokeWidth={2} name="Online" />
              <Area type="monotone" dataKey="alerts" stroke="#f59e0b" fill="none" strokeWidth={2} strokeDasharray="4 4" name="Alertas" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2"><Cpu size={16} className="text-cyan-400" /> Status</h3>
          {pieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={3}>
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {pieData.map((item, i) => (
                  <div key={item.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i] }} />
                      <span className="text-gray-400">{item.name}</span>
                    </div>
                    <span className="text-white font-medium">{item.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 text-gray-600">
              <Cpu size={28} className="mb-2 opacity-30" />
              <p className="text-sm">Sem dispositivos</p>
              <Link to="/library" className="text-cyan-400 text-xs mt-1 hover:underline">Adicionar</Link>
            </div>
          )}
        </div>
      </div>

      {/* Bottom */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white flex items-center gap-2"><Cpu size={16} className="text-cyan-400" /> Dispositivos Recentes</h3>
            <Link to="/devices" className="text-xs text-cyan-400 hover:text-cyan-300">Ver todos →</Link>
          </div>
          {devData?.devices?.length > 0 ? (
            <div className="space-y-2">
              {devData.devices.map((d: any) => (
                <Link key={d.id} to={`/devices/${d.id}`} className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/50 hover:bg-gray-800 transition-colors">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot[d.status] || 'bg-gray-600'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-200 truncate">{d.name}</p>
                    <p className="text-xs text-gray-500">{d.protocol?.toUpperCase()} · {d.identifier}</p>
                  </div>
                  <span className="text-xs text-gray-500">{d.status}</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-600">
              <Cpu size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhum dispositivo</p>
              <Link to="/library" className="text-cyan-400 text-xs mt-1 hover:underline inline-block">Adicionar da biblioteca</Link>
            </div>
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white flex items-center gap-2"><Bell size={16} className="text-cyan-400" /> Alertas Recentes</h3>
            <Link to="/alerts" className="text-xs text-cyan-400 hover:text-cyan-300">Ver todos →</Link>
          </div>
          {alertData?.length > 0 ? (
            <div className="space-y-2">
              {alertData.map((a: any) => (
                <div key={a.id} className={`flex items-start gap-3 p-3 rounded-lg border ${sevCls[a.severity] || sevCls.info} ${a.is_read ? 'opacity-50' : ''}`}>
                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{a.message}</p>
                    <p className="text-xs opacity-70 mt-0.5">{a.device_name} · {new Date(a.created_at).toLocaleString('pt-BR')}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-600">
              <Bell size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhum alerta</p>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card p-5">
        <h3 className="font-semibold text-white mb-4 flex items-center gap-2"><Zap size={16} className="text-cyan-400" /> Ações Rápidas</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { to: '/library', label: 'Adicionar Dispositivo', icon: BookOpen, c: 'text-cyan-400' },
            { to: '/trackers', label: 'Ver Rastreadores', icon: MapPin, c: 'text-blue-400' },
            { to: '/alerts', label: 'Gerenciar Alertas', icon: Bell, c: 'text-yellow-400' },
            { to: '/automations', label: 'Nova Automação', icon: Zap, c: 'text-purple-400' },
          ].map(({ to, label, icon: Icon, c }) => (
            <Link key={to} to={to} className="flex flex-col items-center gap-2 p-4 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-600 transition-all text-center">
              <Icon size={20} className={c} />
              <span className="text-xs text-gray-300 font-medium">{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

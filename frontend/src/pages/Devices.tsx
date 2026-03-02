import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { devicesApi } from '../services/api'
import { Link } from 'react-router-dom'
import { Plus, Search, Cpu, Wifi, WifiOff, AlertTriangle, Trash2, Edit, RefreshCw, MapPin } from 'lucide-react'

const statusBadge: Record<string, string> = {
  online: 'badge-online', offline: 'badge-offline', warning: 'badge-warning', error: 'badge-error', provisioning: 'badge-warning'
}
const statusDot: Record<string, string> = {
  online: 'bg-green-400 shadow-green-400/50 shadow-sm', offline: 'bg-gray-600', warning: 'bg-yellow-400', error: 'bg-red-400', provisioning: 'bg-blue-400'
}
const protocolColor: Record<string, string> = {
  mqtt: 'text-cyan-400 bg-cyan-500/10', lorawan: 'text-purple-400 bg-purple-500/10', wifi: 'text-blue-400 bg-blue-500/10',
  lte: 'text-green-400 bg-green-500/10', bluetooth: 'text-indigo-400 bg-indigo-500/10', custom: 'text-gray-400 bg-gray-500/10'
}

export default function Devices() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [protocol, setProtocol] = useState('')

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['devices', search, status, protocol],
    queryFn: () => devicesApi.list({ search: search || undefined, status: status || undefined, protocol: protocol || undefined, limit: 50 }).then(r => r.data),
  })

  const del = useMutation({
    mutationFn: (id: string) => devicesApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['devices'] }),
  })

  const devices = data?.devices || []

  return (
    <div className="p-6 space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dispositivos IoT</h1>
          <p className="text-gray-500 text-sm mt-0.5">{data?.total || 0} dispositivos cadastrados</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => refetch()} className="btn-secondary flex items-center gap-2"><RefreshCw size={16} /> Atualizar</button>
          <Link to="/library" className="btn-primary flex items-center gap-2"><Plus size={16} /> Adicionar</Link>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome ou identificador..." className="input pl-9" />
        </div>
        <select value={status} onChange={e => setStatus(e.target.value)} className="input w-auto">
          <option value="">Todos os status</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="warning">Alerta</option>
          <option value="error">Erro</option>
        </select>
        <select value={protocol} onChange={e => setProtocol(e.target.value)} className="input w-auto">
          <option value="">Todos os protocolos</option>
          <option value="mqtt">MQTT</option>
          <option value="lorawan">LoRaWAN</option>
          <option value="wifi">Wi-Fi</option>
          <option value="lte">LTE/4G</option>
          <option value="bluetooth">Bluetooth</option>
        </select>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card p-5 animate-pulse">
              <div className="h-4 bg-gray-800 rounded w-3/4 mb-3" />
              <div className="h-3 bg-gray-800 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : devices.length === 0 ? (
        <div className="card p-12 text-center">
          <Cpu size={40} className="mx-auto mb-4 text-gray-700" />
          <h3 className="text-lg font-medium text-gray-400 mb-2">Nenhum dispositivo encontrado</h3>
          <p className="text-gray-600 text-sm mb-4">Adicione dispositivos da biblioteca ou cadastre manualmente</p>
          <Link to="/library" className="btn-primary inline-flex items-center gap-2"><Plus size={16} /> Adicionar da Biblioteca</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {devices.map((d: any) => (
            <div key={d.id} className="card p-5 hover:border-gray-700 transition-colors group">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${statusDot[d.status] || 'bg-gray-600'}`} />
                  <div>
                    <Link to={`/devices/${d.id}`} className="font-semibold text-gray-200 hover:text-cyan-400 transition-colors">{d.name}</Link>
                    <p className="text-xs text-gray-500 font-mono mt-0.5">{d.identifier}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Link to={`/devices/${d.id}`} className="p-1.5 text-gray-500 hover:text-cyan-400 hover:bg-gray-800 rounded-lg transition-colors"><Edit size={14} /></Link>
                  <button onClick={() => { if (confirm('Deletar dispositivo?')) del.mutate(d.id) }} className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors"><Trash2 size={14} /></button>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${protocolColor[d.protocol] || protocolColor.custom}`}>{d.protocol?.toUpperCase()}</span>
                <span className={statusBadge[d.status] || 'badge-offline'}>
                  <span className={`w-1.5 h-1.5 rounded-full ${d.status === 'online' ? 'bg-green-400' : d.status === 'warning' ? 'bg-yellow-400' : 'bg-gray-500'}`} />
                  {d.status}
                </span>
                {d.type === 'tracker' && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">GPS</span>}
              </div>

              {d.model_name && <p className="text-xs text-gray-600 mt-2">{d.model_name}</p>}

              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-800 text-xs text-gray-600">
                <span>{d.last_seen_at ? `Visto: ${new Date(d.last_seen_at).toLocaleString('pt-BR')}` : 'Nunca visto'}</span>
                {d.battery_level != null && (
                  <span className={d.battery_level < 20 ? 'text-red-400' : 'text-gray-500'}>🔋 {d.battery_level}%</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

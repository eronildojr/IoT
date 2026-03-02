import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { traccarApi } from '../services/api'
import { MapPin, Wifi, WifiOff, Settings, RefreshCw, Navigation, Gauge, Battery, X, Loader2 } from 'lucide-react'
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet'
import L from 'leaflet'

// Ícone personalizado para marcadores
const createIcon = (color: string) => L.divIcon({
  html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 0 6px ${color}"></div>`,
  className: '',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})

const onlineIcon = createIcon('#10b981')
const offlineIcon = createIcon('#6b7280')

export default function Trackers() {
  const [selected, setSelected] = useState<any>(null)
  const [showConfig, setShowConfig] = useState(false)
  const [configForm, setConfigForm] = useState({ serverUrl: '', adminUser: 'admin', adminPass: 'admin' })
  const [configuring, setConfiguring] = useState(false)
  const [configError, setConfigError] = useState('')

  const { data: status, refetch: refetchStatus } = useQuery({
    queryKey: ['traccar-status'],
    queryFn: () => traccarApi.status().then(r => r.data),
    refetchInterval: 60000,
  })

  const { data: devices = [], isLoading: loadingDevices, refetch: refetchDevices } = useQuery({
    queryKey: ['traccar-devices'],
    queryFn: () => traccarApi.devices().then(r => r.data),
    enabled: status?.connected,
    refetchInterval: 30000,
  })

  const { data: positions = [], refetch: refetchPos } = useQuery({
    queryKey: ['traccar-positions'],
    queryFn: () => traccarApi.positions().then(r => r.data),
    enabled: status?.connected,
    refetchInterval: 15000,
  })

  const posMap: Record<number, any> = {}
  positions.forEach((p: any) => { posMap[p.deviceId] = p })

  const handleConfigure = async (e: React.FormEvent) => {
    e.preventDefault(); setConfiguring(true); setConfigError('')
    try {
      await traccarApi.configure(configForm)
      setShowConfig(false)
      refetchStatus()
    } catch (err: any) {
      setConfigError(err.response?.data?.error || 'Erro ao conectar')
    } finally { setConfiguring(false) }
  }

  const refresh = () => { refetchDevices(); refetchPos() }

  const mapCenter: [number, number] = (() => {
    const pos = positions.find((p: any) => p.latitude && p.longitude)
    return pos ? [pos.latitude, pos.longitude] : [-15.7942, -47.8822]
  })()

  return (
    <div className="p-6 space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Rastreadores GPS</h1>
          <p className="text-gray-500 text-sm mt-0.5">Integração com Traccar</p>
        </div>
        <div className="flex gap-3">
          <button onClick={refresh} className="btn-secondary flex items-center gap-2"><RefreshCw size={16} /> Atualizar</button>
          <button onClick={() => setShowConfig(true)} className="btn-secondary flex items-center gap-2"><Settings size={16} /> Configurar Traccar</button>
        </div>
      </div>

      {/* Status Traccar */}
      <div className={`card p-4 flex items-center gap-3 border ${status?.connected ? 'border-green-500/20 bg-green-500/5' : 'border-yellow-500/20 bg-yellow-500/5'}`}>
        {status?.connected ? <Wifi size={18} className="text-green-400" /> : <WifiOff size={18} className="text-yellow-400" />}
        <div>
          <p className={`font-medium text-sm ${status?.connected ? 'text-green-400' : 'text-yellow-400'}`}>
            {status?.connected ? 'Traccar Conectado' : 'Traccar não configurado'}
          </p>
          <p className="text-xs text-gray-500">
            {status?.connected ? `${devices.length} dispositivos · ${positions.length} posições ativas` : status?.message || 'Configure o servidor Traccar para rastreamento GPS'}
          </p>
        </div>
        {!status?.connected && (
          <button onClick={() => setShowConfig(true)} className="ml-auto btn-primary text-sm py-1.5">Configurar</button>
        )}
      </div>

      {status?.connected && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Mapa */}
          <div className="xl:col-span-2 card overflow-hidden" style={{ height: '500px' }}>
            <MapContainer center={mapCenter} zoom={10} style={{ height: '100%', width: '100%' }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
              {devices.map((d: any) => {
                const pos = posMap[d.id]
                if (!pos?.latitude) return null
                const isOnline = d.status === 'online'
                return (
                  <Marker key={d.id} position={[pos.latitude, pos.longitude]} icon={isOnline ? onlineIcon : offlineIcon}
                    eventHandlers={{ click: () => setSelected({ device: d, pos }) }}>
                    <Popup>
                      <div className="text-sm">
                        <p className="font-bold">{d.name}</p>
                        <p className="text-gray-600">{pos.speed?.toFixed(1)} km/h</p>
                        <p className="text-gray-500 text-xs">{new Date(pos.fixTime).toLocaleString('pt-BR')}</p>
                      </div>
                    </Popup>
                  </Marker>
                )
              })}
            </MapContainer>
          </div>

          {/* Lista de dispositivos */}
          <div className="card overflow-hidden flex flex-col" style={{ height: '500px' }}>
            <div className="p-4 border-b border-gray-800">
              <h3 className="font-semibold text-white text-sm">{devices.length} Rastreadores</h3>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-gray-800">
              {devices.length === 0 ? (
                <div className="p-8 text-center text-gray-600">
                  <MapPin size={28} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhum rastreador</p>
                </div>
              ) : devices.map((d: any) => {
                const pos = posMap[d.id]
                const isOnline = d.status === 'online'
                return (
                  <button key={d.id} onClick={() => setSelected({ device: d, pos })}
                    className={`w-full p-4 text-left hover:bg-gray-800/50 transition-colors ${selected?.device?.id === d.id ? 'bg-gray-800/50' : ''}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isOnline ? 'bg-green-400' : 'bg-gray-600'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-200 text-sm truncate">{d.name}</p>
                        {pos ? (
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-gray-500 flex items-center gap-1"><Gauge size={11} /> {pos.speed?.toFixed(1)} km/h</span>
                            {pos.attributes?.batteryLevel && <span className="text-xs text-gray-500 flex items-center gap-1"><Battery size={11} /> {pos.attributes.batteryLevel}%</span>}
                          </div>
                        ) : <p className="text-xs text-gray-600">Sem posição</p>}
                      </div>
                      <Navigation size={14} className={isOnline ? 'text-green-400' : 'text-gray-600'} />
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Detalhes do selecionado */}
      {selected && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white">{selected.device.name}</h3>
            <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-gray-300"><X size={18} /></button>
          </div>
          {selected.pos && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Velocidade', value: `${selected.pos.speed?.toFixed(1)} km/h` },
                { label: 'Latitude', value: selected.pos.latitude?.toFixed(6) },
                { label: 'Longitude', value: selected.pos.longitude?.toFixed(6) },
                { label: 'Altitude', value: `${selected.pos.altitude?.toFixed(0)}m` },
                { label: 'Ignição', value: selected.pos.attributes?.ignition ? '✓ Ligada' : '✗ Desligada' },
                { label: 'Bateria', value: selected.pos.attributes?.batteryLevel ? `${selected.pos.attributes.batteryLevel}%` : 'N/A' },
                { label: 'Última posição', value: new Date(selected.pos.fixTime).toLocaleString('pt-BR') },
                { label: 'Status', value: selected.device.status },
              ].map(({ label, value }) => (
                <div key={label} className="bg-gray-800 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">{label}</p>
                  <p className="font-semibold text-gray-200 text-sm">{value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal Configurar Traccar */}
      {showConfig && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <h3 className="font-semibold text-white">Configurar Traccar</h3>
              <button onClick={() => setShowConfig(false)} className="text-gray-500 hover:text-gray-300"><X size={20} /></button>
            </div>
            <form onSubmit={handleConfigure} className="p-6 space-y-4">
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-xs text-blue-400">
                Informe o endereço do seu servidor Traccar. Ex: <span className="font-mono">http://104.251.216.31:8082</span>
              </div>
              <div>
                <label className="label">URL do servidor Traccar</label>
                <input value={configForm.serverUrl} onChange={e => setConfigForm(p => ({ ...p, serverUrl: e.target.value }))} required className="input" placeholder="http://seu-servidor:8082" />
              </div>
              <div>
                <label className="label">Usuário admin</label>
                <input value={configForm.adminUser} onChange={e => setConfigForm(p => ({ ...p, adminUser: e.target.value }))} className="input" />
              </div>
              <div>
                <label className="label">Senha admin</label>
                <input type="password" value={configForm.adminPass} onChange={e => setConfigForm(p => ({ ...p, adminPass: e.target.value }))} className="input" />
              </div>
              {configError && <p className="text-red-400 text-sm">{configError}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowConfig(false)} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" disabled={configuring} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {configuring ? <><Loader2 size={16} className="animate-spin" /> Conectando...</> : 'Conectar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

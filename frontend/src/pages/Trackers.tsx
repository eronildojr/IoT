import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { traccarApi } from '../services/api'
import { MapPin, Wifi, WifiOff, Settings, RefreshCw, Navigation, Gauge, Battery, X, Loader2, Plus, Trash2, ExternalLink, Zap } from 'lucide-react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'

const createIcon = (color: string) => L.divIcon({
  html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 0 8px ${color}"></div>`,
  className: '',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})
const onlineIcon = createIcon('#10b981')
const offlineIcon = createIcon('#6b7280')
const unknownIcon = createIcon('#f59e0b')

const CATEGORY_ICONS: Record<string, string> = {
  car: '🚗', truck: '🚛', motorcycle: '🏍️', boat: '⛵',
  person: '👤', bicycle: '🚲', animal: '🐾', default: '📍'
}

export default function Trackers() {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<any>(null)
  const [showConfig, setShowConfig] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [configForm, setConfigForm] = useState({ serverUrl: '', adminUser: 'admin@iotplatform.com', adminPass: 'Admin@IoT2024!' })
  const [addForm, setAddForm] = useState({ name: '', uniqueId: '', phone: '', model: '', category: 'car' })
  const [filter, setFilter] = useState('all')
  const [activeTab, setActiveTab] = useState<'map' | 'embed'>('map')

  const { data: status, refetch: refetchStatus, isLoading: loadingStatus } = useQuery({
    queryKey: ['traccar-status'],
    queryFn: () => traccarApi.status().then(r => r.data),
    refetchInterval: 60000,
  })

  const { data: mapUrlData } = useQuery({
    queryKey: ['traccar-map-url'],
    queryFn: () => traccarApi.mapUrl().then(r => r.data),
    enabled: status?.connected,
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

  const configureMutation = useMutation({
    mutationFn: (data: any) => traccarApi.configure(data),
    onSuccess: () => { setShowConfig(false); refetchStatus(); qc.invalidateQueries({ queryKey: ['traccar-devices'] }) },
  })

  const autoConfigMutation = useMutation({
    mutationFn: () => traccarApi.autoConfigure(),
    onSuccess: () => { refetchStatus(); qc.invalidateQueries({ queryKey: ['traccar-devices'] }) },
  })

  const addDeviceMutation = useMutation({
    mutationFn: (data: any) => traccarApi.createDevice(data),
    onSuccess: () => { setShowAdd(false); setAddForm({ name: '', uniqueId: '', phone: '', model: '', category: 'car' }); refetchDevices() },
  })

  const deleteDeviceMutation = useMutation({
    mutationFn: (id: number) => traccarApi.deleteDevice(id),
    onSuccess: () => { setSelected(null); refetchDevices() },
  })

  const refresh = () => { refetchDevices(); refetchPos() }

  const filteredDevices = devices.filter((d: any) => {
    if (filter === 'online') return d.status === 'online'
    if (filter === 'offline') return d.status !== 'online'
    return true
  })

  const mapCenter: [number, number] = (() => {
    const pos = positions.find((p: any) => p.latitude && p.longitude)
    return pos ? [pos.latitude, pos.longitude] : [-15.7942, -47.8822]
  })()

  const onlineCount = devices.filter((d: any) => d.status === 'online').length
  const offlineCount = devices.filter((d: any) => d.status !== 'online').length

  // URL pública do Traccar para embed
  const traccarPublicUrl = mapUrlData?.url || null

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Rastreadores GPS</h1>
          <p className="text-gray-500 text-sm mt-0.5">Monitoramento em tempo real via Traccar</p>
        </div>
        <div className="flex gap-3">
          {status?.connected && (
            <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2">
              <Plus size={16} /> Adicionar Rastreador
            </button>
          )}
          <button onClick={refresh} className="btn-secondary flex items-center gap-2">
            <RefreshCw size={16} /> Atualizar
          </button>
          <button onClick={() => setShowConfig(true)} className="btn-secondary flex items-center gap-2">
            <Settings size={16} /> Configurar
          </button>
        </div>
      </div>

      {/* Status Bar */}
      <div className={`card p-4 flex items-center gap-4 border ${status?.connected ? 'border-green-500/20 bg-green-500/5' : 'border-yellow-500/20 bg-yellow-500/5'}`}>
        {loadingStatus ? (
          <Loader2 size={18} className="text-gray-400 animate-spin" />
        ) : status?.connected ? (
          <Wifi size={18} className="text-green-400" />
        ) : (
          <WifiOff size={18} className="text-yellow-400" />
        )}
        <div className="flex-1">
          <p className={`font-medium text-sm ${status?.connected ? 'text-green-400' : 'text-yellow-400'}`}>
            {status?.connected ? '✓ Traccar Conectado e Funcionando' : 'Traccar não configurado'}
          </p>
          <p className="text-xs text-gray-500">
            {status?.connected
              ? `${devices.length} rastreadores · ${onlineCount} online · ${offlineCount} offline · Atualiza a cada 15s`
              : status?.message || 'Configure o servidor Traccar para habilitar o rastreamento GPS'}
          </p>
        </div>
        {!status?.connected && (
          <div className="flex gap-2">
            <button
              onClick={() => autoConfigMutation.mutate()}
              disabled={autoConfigMutation.isPending}
              className="btn-primary text-sm py-1.5 flex items-center gap-1.5"
            >
              {autoConfigMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
              Auto-Configurar
            </button>
            <button onClick={() => setShowConfig(true)} className="btn-secondary text-sm py-1.5">Manual</button>
          </div>
        )}
        {status?.connected && traccarPublicUrl && (
          <a href={traccarPublicUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary text-sm py-1.5 flex items-center gap-1.5">
            <ExternalLink size={14} /> Abrir Traccar
          </a>
        )}
      </div>

      {/* Stats */}
      {status?.connected && (
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Total', value: devices.length, color: 'text-white' },
            { label: 'Online', value: onlineCount, color: 'text-green-400' },
            { label: 'Offline', value: offlineCount, color: 'text-red-400' },
            { label: 'Com posição', value: positions.filter((p: any) => p.valid).length, color: 'text-blue-400' },
          ].map(s => (
            <div key={s.label} className="card p-4">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-gray-500 text-sm">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Main Content */}
      {status?.connected && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Mapa / Embed */}
          <div className="xl:col-span-2 card overflow-hidden" style={{ height: '520px' }}>
            {/* Tabs */}
            <div className="flex border-b border-gray-800">
              <button
                onClick={() => setActiveTab('map')}
                className={`px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'map' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-500 hover:text-gray-300'}`}
              >
                🗺️ Mapa OpenStreetMap
              </button>
              <button
                onClick={() => setActiveTab('embed')}
                className={`px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'embed' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-500 hover:text-gray-300'}`}
              >
                📡 Interface Traccar Completa
              </button>
            </div>

            {activeTab === 'map' ? (
              <div style={{ height: 'calc(100% - 45px)' }}>
                <MapContainer center={mapCenter} zoom={10} style={{ height: '100%', width: '100%' }}>
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
                  {devices.map((d: any) => {
                    const pos = posMap[d.id]
                    if (!pos?.latitude) return null
                    const isOnline = d.status === 'online'
                    return (
                      <Marker
                        key={d.id}
                        position={[pos.latitude, pos.longitude]}
                        icon={isOnline ? onlineIcon : offlineIcon}
                        eventHandlers={{ click: () => setSelected({ device: d, pos }) }}
                      >
                        <Popup>
                          <div className="text-sm min-w-[160px]">
                            <p className="font-bold text-gray-800">{d.name}</p>
                            <p className="text-gray-600">{CATEGORY_ICONS[d.category] || '📍'} {d.category || 'Veículo'}</p>
                            <p className="text-gray-600">🚀 {(pos.speed * 1.852).toFixed(1)} km/h</p>
                            <p className="text-gray-500 text-xs mt-1">{new Date(pos.fixTime).toLocaleString('pt-BR')}</p>
                          </div>
                        </Popup>
                      </Marker>
                    )
                  })}
                </MapContainer>
              </div>
            ) : (
              <div style={{ height: 'calc(100% - 45px)' }} className="relative">
                {traccarPublicUrl ? (
                  <iframe
                    src={traccarPublicUrl}
                    className="w-full h-full border-0"
                    title="Traccar Interface"
                    allow="geolocation"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-500">
                    <div className="text-center">
                      <div className="text-4xl mb-3">📡</div>
                      <p className="text-sm">URL do Traccar não disponível</p>
                      <p className="text-xs text-gray-600 mt-1">Configure o servidor Traccar com o IP público</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Lista de Rastreadores */}
          <div className="card overflow-hidden flex flex-col" style={{ height: '520px' }}>
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <h3 className="font-semibold text-white text-sm">{filteredDevices.length} Rastreadores</h3>
              <div className="flex gap-1">
                {['all', 'online', 'offline'].map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-2 py-1 rounded text-xs transition-colors ${filter === f ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                  >
                    {f === 'all' ? 'Todos' : f === 'online' ? '🟢' : '🔴'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-gray-800">
              {loadingDevices ? (
                <div className="p-8 text-center text-gray-600">
                  <Loader2 size={24} className="mx-auto mb-2 animate-spin opacity-50" />
                  <p className="text-sm">Carregando...</p>
                </div>
              ) : filteredDevices.length === 0 ? (
                <div className="p-8 text-center text-gray-600">
                  <MapPin size={28} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhum rastreador</p>
                  <button onClick={() => setShowAdd(true)} className="mt-2 text-blue-400 text-xs underline">Adicionar agora</button>
                </div>
              ) : filteredDevices.map((d: any) => {
                const pos = posMap[d.id]
                const isOnline = d.status === 'online'
                const isSelected = selected?.device?.id === d.id
                return (
                  <div
                    key={d.id}
                    onClick={() => setSelected({ device: d, pos })}
                    className={`p-4 cursor-pointer hover:bg-gray-800/50 transition-colors group ${isSelected ? 'bg-blue-900/20 border-l-2 border-blue-500' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{CATEGORY_ICONS[d.category] || '📍'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-200 text-sm truncate">{d.name}</p>
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isOnline ? 'bg-green-400' : 'bg-gray-600'}`} />
                        </div>
                        <p className="text-xs text-gray-600 truncate">{d.uniqueId}</p>
                        {pos ? (
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                              <Gauge size={10} /> {(pos.speed * 1.852).toFixed(1)} km/h
                            </span>
                            {pos.attributes?.batteryLevel && (
                              <span className="text-xs text-gray-500 flex items-center gap-1">
                                <Battery size={10} /> {pos.attributes.batteryLevel}%
                              </span>
                            )}
                          </div>
                        ) : <p className="text-xs text-gray-600 mt-0.5">Sem posição</p>}
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); if (confirm('Remover rastreador?')) deleteDeviceMutation.mutate(d.id) }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-300 transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Detalhes do Selecionado */}
      {selected && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{CATEGORY_ICONS[selected.device.category] || '📍'}</span>
              <div>
                <h3 className="font-semibold text-white">{selected.device.name}</h3>
                <p className="text-xs text-gray-500">IMEI: {selected.device.uniqueId}</p>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${selected.device.status === 'online' ? 'bg-green-500/20 text-green-400' : 'bg-gray-700 text-gray-400'}`}>
                {selected.device.status === 'online' ? '● Online' : '● Offline'}
              </span>
            </div>
            <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-gray-300"><X size={18} /></button>
          </div>
          {selected.pos ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Velocidade', value: `${(selected.pos.speed * 1.852).toFixed(1)} km/h`, icon: '🚀' },
                { label: 'Latitude', value: selected.pos.latitude?.toFixed(6), icon: '📍' },
                { label: 'Longitude', value: selected.pos.longitude?.toFixed(6), icon: '📍' },
                { label: 'Altitude', value: `${selected.pos.altitude?.toFixed(0)}m`, icon: '⛰️' },
                { label: 'Ignição', value: selected.pos.attributes?.ignition ? '✓ Ligada' : '✗ Desligada', icon: '🔑' },
                { label: 'Bateria', value: selected.pos.attributes?.batteryLevel ? `${selected.pos.attributes.batteryLevel}%` : 'N/A', icon: '🔋' },
                { label: 'Última posição', value: new Date(selected.pos.fixTime).toLocaleString('pt-BR'), icon: '🕐' },
                { label: 'Modelo', value: selected.device.model || 'N/A', icon: '📟' },
              ].map(({ label, value, icon }) => (
                <div key={label} className="bg-gray-800 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">{icon} {label}</p>
                  <p className="font-semibold text-gray-200 text-sm">{value}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">Sem posição registrada para este dispositivo.</p>
          )}
        </div>
      )}

      {/* Protocolos Suportados */}
      {status?.connected && (
        <div className="card p-5">
          <h3 className="font-semibold text-white mb-4">📡 Protocolos GPS Suportados</h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { name: 'OsmAnd', port: 5055, desc: 'App móvel Android/iOS' },
              { name: 'Teltonika', port: 5001, desc: 'Rastreadores Teltonika' },
              { name: 'GT06/Coban', port: 5002, desc: 'Rastreadores chineses' },
              { name: 'H02', port: 5013, desc: 'Rastreadores H02' },
              { name: 'GPS103/TK103', port: 5023, desc: 'TK103 e similares' },
            ].map(p => (
              <div key={p.name} className="bg-gray-800 rounded-lg p-3 border border-gray-700">
                <p className="font-medium text-blue-400 text-sm">{p.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">Porta: {p.port}</p>
                <p className="text-xs text-gray-600 mt-1">{p.desc}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-600 mt-3">
            Servidor: <span className="font-mono text-gray-400">104.237.5.59</span> — Configure seu rastreador apontando para este IP com a porta do protocolo correspondente.
          </p>
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
            <div className="p-6 space-y-4">
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-xs text-blue-400">
                <strong>Auto-configuração disponível!</strong> Se o Traccar está no mesmo servidor, clique em "Auto-Configurar" acima. Ou configure manualmente abaixo.
              </div>
              <div>
                <label className="label">URL do servidor Traccar</label>
                <input value={configForm.serverUrl} onChange={e => setConfigForm(p => ({ ...p, serverUrl: e.target.value }))} className="input" placeholder="http://104.237.5.59:8082" />
              </div>
              <div>
                <label className="label">Email admin</label>
                <input value={configForm.adminUser} onChange={e => setConfigForm(p => ({ ...p, adminUser: e.target.value }))} className="input" />
              </div>
              <div>
                <label className="label">Senha admin</label>
                <input type="password" value={configForm.adminPass} onChange={e => setConfigForm(p => ({ ...p, adminPass: e.target.value }))} className="input" />
              </div>
              {configureMutation.isError && (
                <p className="text-red-400 text-sm">{(configureMutation.error as any)?.response?.data?.error || 'Erro ao conectar'}</p>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowConfig(false)} className="btn-secondary flex-1">Cancelar</button>
                <button
                  onClick={() => configureMutation.mutate(configForm)}
                  disabled={configureMutation.isPending}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  {configureMutation.isPending ? <><Loader2 size={16} className="animate-spin" /> Conectando...</> : 'Conectar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Adicionar Rastreador */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <h3 className="font-semibold text-white">Adicionar Rastreador GPS</h3>
              <button onClick={() => setShowAdd(false)} className="text-gray-500 hover:text-gray-300"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="label">Nome do Veículo / Ativo *</label>
                <input value={addForm.name} onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))} className="input" placeholder="Ex: Caminhão 001" />
              </div>
              <div>
                <label className="label">IMEI / ID Único *</label>
                <input value={addForm.uniqueId} onChange={e => setAddForm(p => ({ ...p, uniqueId: e.target.value }))} className="input" placeholder="Ex: 123456789012345" />
              </div>
              <div>
                <label className="label">Telefone (SIM Card)</label>
                <input value={addForm.phone} onChange={e => setAddForm(p => ({ ...p, phone: e.target.value }))} className="input" placeholder="Ex: +5511999999999" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Modelo</label>
                  <input value={addForm.model} onChange={e => setAddForm(p => ({ ...p, model: e.target.value }))} className="input" placeholder="Ex: GT06N" />
                </div>
                <div>
                  <label className="label">Categoria</label>
                  <select value={addForm.category} onChange={e => setAddForm(p => ({ ...p, category: e.target.value }))} className="input">
                    <option value="car">🚗 Carro</option>
                    <option value="truck">🚛 Caminhão</option>
                    <option value="motorcycle">🏍️ Moto</option>
                    <option value="boat">⛵ Barco</option>
                    <option value="person">👤 Pessoa</option>
                    <option value="bicycle">🚲 Bicicleta</option>
                    <option value="animal">🐾 Animal</option>
                    <option value="default">📍 Outro</option>
                  </select>
                </div>
              </div>
              {addDeviceMutation.isError && (
                <p className="text-red-400 text-sm">{(addDeviceMutation.error as any)?.response?.data?.error || 'Erro ao adicionar'}</p>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowAdd(false)} className="btn-secondary flex-1">Cancelar</button>
                <button
                  onClick={() => addDeviceMutation.mutate(addForm)}
                  disabled={addDeviceMutation.isPending || !addForm.name || !addForm.uniqueId}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  {addDeviceMutation.isPending ? <><Loader2 size={16} className="animate-spin" /> Adicionando...</> : <><Plus size={16} /> Adicionar</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

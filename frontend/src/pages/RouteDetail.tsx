import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { routesApi } from '../services/api'
import {
  ArrowLeft, MapPin, Navigation, Clock, Truck, CheckCircle, XCircle,
  Zap, Loader2, Copy, Check, Upload, Plus, Trash2, X, AlertTriangle
} from 'lucide-react'
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet'
import L from 'leaflet'

const stopIcon = (seq: number, status: string) => {
  const color = status === 'completed' ? '#10b981' : status === 'failed' ? '#ef4444' : status === 'arrived' ? '#f59e0b' : '#06b6d4'
  return L.divIcon({
    html: `<div style="width:24px;height:24px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:bold">${seq}</div>`,
    className: '', iconSize: [24, 24], iconAnchor: [12, 12],
  })
}
const startIcon = L.divIcon({
  html: '<div style="width:28px;height:28px;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;color:white;font-size:14px">S</div>',
  className: '', iconSize: [28, 28], iconAnchor: [14, 14],
})

const statusCls: Record<string, string> = {
  pending: 'text-gray-400 bg-gray-500/10', arrived: 'text-yellow-400 bg-yellow-500/10',
  completed: 'text-green-400 bg-green-500/10', failed: 'text-red-400 bg-red-500/10', skipped: 'text-gray-500 bg-gray-600/10',
}
const statusLabel: Record<string, string> = {
  pending: 'Pendente', arrived: 'Chegou', completed: 'Entregue', failed: 'Falhou', skipped: 'Pulado',
}

export default function RouteDetail() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const [copied, setCopied] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ address: '', customerName: '', customerPhone: '', notes: '' })

  const { data: route, isLoading } = useQuery({
    queryKey: ['route', id],
    queryFn: () => routesApi.get(id!).then(r => r.data),
    refetchInterval: 15000,
  })

  const { data: geoData } = useQuery({
    queryKey: ['route-geo', id],
    queryFn: () => routesApi.geometry(id!).then(r => r.data),
    enabled: !!route && (route.stops || []).some((s: any) => s.lat),
  })

  const optimize = useMutation({
    mutationFn: () => routesApi.optimize(id!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['route', id] }),
  })
  const addStop = useMutation({
    mutationFn: (d: any) => routesApi.addStop(id!, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['route', id] }); setShowAdd(false); setAddForm({ address: '', customerName: '', customerPhone: '', notes: '' }) },
  })
  const deleteStop = useMutation({
    mutationFn: (stopId: string) => routesApi.deleteStop(id!, stopId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['route', id] }),
  })

  const copyLink = () => {
    if (!route?.driver_token) return
    navigator.clipboard.writeText(`${window.location.origin}/driver/${route.driver_token}`)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  if (isLoading) return <div className="p-6"><div className="animate-pulse"><div className="h-8 bg-gray-800 rounded w-1/3 mb-4" /><div className="card p-6 h-96" /></div></div>

  if (!route) return <div className="p-6 text-center"><p className="text-gray-500">Rota nao encontrada</p><Link to="/routing" className="text-cyan-400">Voltar</Link></div>

  const stops = route.stops || []
  const geoStops = stops.filter((s: any) => s.lat && s.lng)
  const mapCenter: [number, number] = route.start_lat && route.start_lng
    ? [route.start_lat, route.start_lng]
    : geoStops.length > 0 ? [geoStops[0].lat, geoStops[0].lng] : [-23.55, -46.63]

  const polyline = geoData?.geometry?.coordinates?.map((c: number[]) => [c[1], c[0]]) || []

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/routing" className="p-2 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded-lg"><ArrowLeft size={20} /></Link>
        <div className="flex-1">
          <h1 className="page-title">{route.name}</h1>
          <p className="text-gray-500 text-sm">{new Date(route.date).toLocaleDateString('pt-BR')} · {stops.length} paradas · {route.total_distance_km || 0} km · {Math.round(route.total_duration_min || 0)} min</p>
        </div>
        <div className="flex gap-2">
          {(route.status === 'draft') && stops.length >= 2 && (
            <button onClick={() => optimize.mutate()} disabled={optimize.isPending} className="btn-primary flex items-center gap-2">
              {optimize.isPending ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />} Otimizar Rota
            </button>
          )}
          {route.driver_token && (
            <button onClick={copyLink} className="btn-secondary flex items-center gap-2">
              {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />} Link Motorista
            </button>
          )}
          <button onClick={() => setShowAdd(true)} className="btn-secondary flex items-center gap-2"><Plus size={16} /> Parada</button>
        </div>
      </div>

      {/* Info + Driver */}
      {route.driver_name && (
        <div className="card p-4 flex items-center gap-4 border-purple-500/20 bg-purple-500/5">
          <Truck size={20} className="text-purple-400" />
          <div>
            <p className="text-white font-medium">{route.driver_name}</p>
            <p className="text-xs text-gray-500">{route.vehicle_type} {route.vehicle_plate && `· ${route.vehicle_plate}`} {route.driver_phone && `· ${route.driver_phone}`}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* Mapa */}
        <div className="xl:col-span-3 card overflow-hidden" style={{ height: '500px' }}>
          <MapContainer center={mapCenter} zoom={12} style={{ height: '100%', width: '100%' }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
            {polyline.length > 0 && <Polyline positions={polyline} pathOptions={{ color: '#06b6d4', weight: 4, opacity: 0.8 }} />}
            {route.start_lat && route.start_lng && (
              <Marker position={[route.start_lat, route.start_lng]} icon={startIcon}>
                <Popup><b>Ponto de Partida</b><br />{route.start_address}</Popup>
              </Marker>
            )}
            {geoStops.map((s: any) => (
              <Marker key={s.id} position={[s.lat, s.lng]} icon={stopIcon(s.sequence_order, s.status)}>
                <Popup>
                  <div className="text-sm min-w-[180px]">
                    <p className="font-bold">#{s.sequence_order} {s.customer_name || 'Parada'}</p>
                    <p className="text-gray-600 text-xs">{s.address}</p>
                    {s.customer_phone && <p className="text-xs">{s.customer_phone}</p>}
                    <p className="text-xs mt-1">{statusLabel[s.status]}</p>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

        {/* Lista de paradas */}
        <div className="xl:col-span-2 card overflow-hidden flex flex-col" style={{ height: '500px' }}>
          <div className="p-4 border-b border-gray-800 flex items-center justify-between">
            <h3 className="font-semibold text-white text-sm">{stops.length} Paradas</h3>
            <span className="text-xs text-gray-500">{stops.filter((s: any) => s.status === 'completed').length} entregues</span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-800">
            {stops.length === 0 ? (
              <div className="p-8 text-center text-gray-600">
                <MapPin size={28} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhuma parada</p>
                <p className="text-xs text-gray-600 mt-1">Importe enderecos ou adicione manualmente</p>
              </div>
            ) : stops.map((s: any) => (
              <div key={s.id} className="p-3 hover:bg-gray-800/30 transition-colors group">
                <div className="flex items-start gap-3">
                  <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white ${
                    s.status === 'completed' ? 'bg-green-500' : s.status === 'failed' ? 'bg-red-500' : s.status === 'arrived' ? 'bg-yellow-500' : 'bg-cyan-500'
                  }`}>{s.sequence_order}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-200 font-medium truncate">{s.customer_name || s.address.split(',')[0]}</p>
                    <p className="text-xs text-gray-500 truncate">{s.address}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${statusCls[s.status]}`}>{statusLabel[s.status]}</span>
                      {!s.geocoded && <span className="text-xs text-orange-400 flex items-center gap-0.5"><AlertTriangle size={10} /> Sem GPS</span>}
                      {s.distance_from_prev_km > 0 && <span className="text-xs text-gray-600">{s.distance_from_prev_km} km</span>}
                    </div>
                  </div>
                  {route.status === 'draft' && (
                    <button onClick={() => deleteStop.mutate(s.id)} className="opacity-0 group-hover:opacity-100 p-1 text-red-400"><Trash2 size={13} /></button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modal Adicionar Parada */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <h3 className="font-semibold text-white">Adicionar Parada</h3>
              <button onClick={() => setShowAdd(false)} className="text-gray-500 hover:text-gray-300"><X size={20} /></button>
            </div>
            <form onSubmit={e => { e.preventDefault(); addStop.mutate(addForm) }} className="p-6 space-y-4">
              <div><label className="label">Endereco *</label><input value={addForm.address} onChange={e => setAddForm(p => ({ ...p, address: e.target.value }))} required className="input" placeholder="Rua, numero - Cidade, UF" /></div>
              <div><label className="label">Cliente</label><input value={addForm.customerName} onChange={e => setAddForm(p => ({ ...p, customerName: e.target.value }))} className="input" /></div>
              <div><label className="label">Telefone</label><input value={addForm.customerPhone} onChange={e => setAddForm(p => ({ ...p, customerPhone: e.target.value }))} className="input" /></div>
              <div><label className="label">Observacoes</label><input value={addForm.notes} onChange={e => setAddForm(p => ({ ...p, notes: e.target.value }))} className="input" /></div>
              {addStop.error && <p className="text-red-400 text-sm">{(addStop.error as any).response?.data?.error || 'Erro'}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAdd(false)} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" disabled={addStop.isPending} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {addStop.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Adicionar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

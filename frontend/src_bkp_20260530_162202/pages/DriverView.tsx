import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { driverRouteApi } from '../services/api'
import {
  MapPin, Navigation, Clock, CheckCircle, XCircle, AlertTriangle,
  Play, Phone, MessageSquare, ChevronDown, ChevronUp, Loader2, Truck
} from 'lucide-react'

const statusCls: Record<string, string> = {
  pending: 'border-gray-700 bg-gray-800',
  arrived: 'border-yellow-500/30 bg-yellow-500/5',
  completed: 'border-green-500/30 bg-green-500/5',
  failed: 'border-red-500/30 bg-red-500/5',
  skipped: 'border-gray-600 bg-gray-800/50 opacity-60',
}

export default function DriverView() {
  const { token } = useParams<{ token: string }>()
  const [route, setRoute] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updating, setUpdating] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [started, setStarted] = useState(false)
  const [showFail, setShowFail] = useState<string | null>(null)
  const [failReason, setFailReason] = useState('')

  const loadRoute = useCallback(async () => {
    try {
      const r = await driverRouteApi.get(token!)
      setRoute(r.data)
      setStarted(r.data.status === 'in_progress' || r.data.status === 'completed')
    } catch (e: any) {
      setError(e.response?.data?.error || 'Rota nao encontrada')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { loadRoute() }, [loadRoute])

  // Enviar posicao GPS a cada 30s
  useEffect(() => {
    if (!started || !token) return
    let watchId: number
    const sendPos = (pos: GeolocationPosition) => {
      driverRouteApi.sendPosition(token, {
        lat: pos.coords.latitude, lng: pos.coords.longitude,
        speed: pos.coords.speed, heading: pos.coords.heading,
        accuracy: pos.coords.accuracy,
      }).catch(() => {})
    }
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(sendPos, () => {}, {
        enableHighAccuracy: true, maximumAge: 15000, timeout: 10000,
      })
    }
    return () => { if (watchId) navigator.geolocation.clearWatch(watchId) }
  }, [started, token])

  // Auto-refresh a cada 30s
  useEffect(() => {
    const iv = setInterval(loadRoute, 30000)
    return () => clearInterval(iv)
  }, [loadRoute])

  const startRoute = async () => {
    try {
      await driverRouteApi.start(token!)
      setStarted(true)
      loadRoute()
    } catch (e: any) {
      alert(e.response?.data?.error || 'Erro ao iniciar')
    }
  }

  const updateStop = async (stopId: string, status: string, failureReason?: string) => {
    setUpdating(stopId)
    try {
      await driverRouteApi.updateStop(token!, stopId, { status, failureReason })
      await loadRoute()
      setShowFail(null); setFailReason('')
    } catch (e: any) {
      alert(e.response?.data?.error || 'Erro')
    } finally {
      setUpdating('')
    }
  }

  const openNav = (address: string) => {
    const encoded = encodeURIComponent(address)
    // Tenta abrir no Google Maps (funciona em Android e iOS)
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=driving`, '_blank')
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-center">
        <Loader2 size={36} className="mx-auto text-cyan-400 animate-spin mb-3" />
        <p className="text-gray-400">Carregando rota...</p>
      </div>
    </div>
  )

  if (error) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="text-center">
        <AlertTriangle size={48} className="mx-auto text-red-400 mb-4" />
        <h1 className="text-xl font-bold text-white mb-2">Rota nao encontrada</h1>
        <p className="text-gray-500">{error}</p>
      </div>
    </div>
  )

  const stops = route.stops || []
  const completedCount = stops.filter((s: any) => s.status === 'completed' || s.status === 'skipped').length
  const progress = stops.length > 0 ? Math.round((completedCount / stops.length) * 100) : 0
  const nextStop = stops.find((s: any) => s.status === 'pending')
  const isCompleted = route.status === 'completed'

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header fixo */}
      <div className="sticky top-0 z-10 bg-gray-900 border-b border-gray-800 px-4 py-3 safe-area-top">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center">
              <Truck className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <p className="font-bold text-white text-sm">{route.name}</p>
              <p className="text-xs text-gray-500">{route.tenant_name} · {new Date(route.date).toLocaleDateString('pt-BR')}</p>
            </div>
          </div>
          {route.driver_name && (
            <div className="text-right">
              <p className="text-xs text-gray-400">{route.driver_name}</p>
              <p className="text-xs text-gray-600">{route.vehicle_plate}</p>
            </div>
          )}
        </div>

        {/* Barra de progresso */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-gray-400">{completedCount}/{stops.length} entregas</span>
            <span className="font-bold text-cyan-400">{progress}%</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-2.5">
            <div className="bg-gradient-to-r from-cyan-500 to-green-500 h-2.5 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="bg-gray-800 rounded-lg p-2 text-center">
            <p className="text-lg font-bold text-white">{stops.length}</p>
            <p className="text-xs text-gray-500">Paradas</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-2 text-center">
            <p className="text-lg font-bold text-cyan-400">{route.total_distance_km || '?'}</p>
            <p className="text-xs text-gray-500">km</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-2 text-center">
            <p className="text-lg font-bold text-purple-400">{route.total_duration_min ? Math.round(route.total_duration_min) : '?'}</p>
            <p className="text-xs text-gray-500">min</p>
          </div>
        </div>
      </div>

      {/* Botao Iniciar */}
      {!started && !isCompleted && (
        <div className="px-4 py-6">
          <button onClick={startRoute}
            className="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-bold text-lg rounded-2xl flex items-center justify-center gap-3 shadow-lg shadow-cyan-500/20 active:scale-[0.98] transition-transform">
            <Play size={24} /> INICIAR ROTA
          </button>
        </div>
      )}

      {/* Rota concluida */}
      {isCompleted && (
        <div className="px-4 py-6">
          <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-6 text-center">
            <CheckCircle size={48} className="mx-auto text-green-400 mb-3" />
            <h2 className="text-xl font-bold text-green-400">Rota Concluida!</h2>
            <p className="text-gray-400 text-sm mt-1">{completedCount} entregas realizadas</p>
          </div>
        </div>
      )}

      {/* Proxima parada destacada */}
      {started && nextStop && !isCompleted && (
        <div className="px-4 pt-4">
          <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-2xl p-4">
            <p className="text-xs text-cyan-400 font-semibold uppercase mb-2">Proxima Entrega</p>
            <p className="text-white font-bold text-lg">{nextStop.customer_name || `Parada #${nextStop.sequence_order}`}</p>
            <p className="text-gray-400 text-sm mt-1">{nextStop.address}</p>
            {nextStop.notes && <p className="text-yellow-400 text-xs mt-1">{nextStop.notes}</p>}
            <div className="flex gap-2 mt-3">
              <button onClick={() => openNav(nextStop.address)}
                className="flex-1 py-3 bg-blue-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
                <Navigation size={18} /> Navegar
              </button>
              {nextStop.customer_phone && (
                <a href={`tel:${nextStop.customer_phone}`}
                  className="py-3 px-4 bg-green-500 text-white rounded-xl flex items-center justify-center active:scale-[0.98]">
                  <Phone size={18} />
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lista de paradas */}
      <div className="px-4 py-4 space-y-2 pb-24">
        {stops.map((s: any) => {
          const isExpanded = expanded === s.id
          const isNext = nextStop?.id === s.id && started
          return (
            <div key={s.id} className={`rounded-xl border transition-all ${isNext ? 'border-cyan-500/40 bg-cyan-500/5' : statusCls[s.status]}`}>
              <button onClick={() => setExpanded(isExpanded ? null : s.id)}
                className="w-full p-4 flex items-center gap-3 text-left">
                <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold text-white ${
                  s.status === 'completed' ? 'bg-green-500' : s.status === 'failed' ? 'bg-red-500' : s.status === 'arrived' ? 'bg-yellow-500' : 'bg-gray-600'
                }`}>
                  {s.status === 'completed' ? <CheckCircle size={16} /> : s.status === 'failed' ? <XCircle size={16} /> : s.sequence_order}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-medium text-sm truncate ${s.status === 'completed' ? 'text-green-400 line-through' : s.status === 'failed' ? 'text-red-400' : 'text-gray-200'}`}>
                    {s.customer_name || `Parada #${s.sequence_order}`}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{s.address}</p>
                </div>
                {s.distance_from_prev_km > 0 && <span className="text-xs text-gray-600">{s.distance_from_prev_km}km</span>}
                {isExpanded ? <ChevronUp size={16} className="text-gray-600" /> : <ChevronDown size={16} className="text-gray-600" />}
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 space-y-3 border-t border-gray-800 pt-3">
                  <p className="text-sm text-gray-300">{s.address}</p>
                  {s.complement && <p className="text-xs text-gray-500">{s.complement}</p>}
                  {s.notes && <p className="text-xs text-yellow-400 bg-yellow-500/10 rounded-lg p-2">{s.notes}</p>}
                  {s.customer_phone && (
                    <a href={`tel:${s.customer_phone}`} className="text-sm text-blue-400 flex items-center gap-1"><Phone size={14} /> {s.customer_phone}</a>
                  )}

                  {started && s.status === 'pending' && (
                    <div className="flex gap-2">
                      <button onClick={() => openNav(s.address)} className="flex-1 py-2.5 bg-blue-500 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 active:scale-[0.98]">
                        <Navigation size={15} /> Navegar
                      </button>
                      <button onClick={() => updateStop(s.id, 'arrived')} disabled={updating === s.id}
                        className="flex-1 py-2.5 bg-yellow-500 text-gray-900 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 active:scale-[0.98]">
                        {updating === s.id ? <Loader2 size={15} className="animate-spin" /> : <MapPin size={15} />} Cheguei
                      </button>
                    </div>
                  )}

                  {started && s.status === 'arrived' && (
                    <div className="flex gap-2">
                      <button onClick={() => updateStop(s.id, 'completed')} disabled={updating === s.id}
                        className="flex-1 py-3 bg-green-500 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 active:scale-[0.98]">
                        {updating === s.id ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle size={15} />} Entregue
                      </button>
                      <button onClick={() => setShowFail(s.id)}
                        className="py-3 px-4 bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-sm font-medium active:scale-[0.98]">
                        <XCircle size={15} />
                      </button>
                    </div>
                  )}

                  {s.status === 'completed' && s.completed_at && (
                    <p className="text-xs text-green-400">Entregue em {new Date(s.completed_at).toLocaleString('pt-BR')}</p>
                  )}
                  {s.status === 'failed' && s.failure_reason && (
                    <p className="text-xs text-red-400">Motivo: {s.failure_reason}</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Modal Falha */}
      {showFail && (
        <div className="fixed inset-0 bg-black/80 flex items-end justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md">
            <div className="p-5 space-y-4">
              <h3 className="font-bold text-white text-lg">Motivo da falha</h3>
              <div className="grid grid-cols-2 gap-2">
                {['Ausente', 'Endereco errado', 'Recusou entrega', 'Outro'].map(r => (
                  <button key={r} onClick={() => setFailReason(r)}
                    className={`p-3 rounded-xl border text-sm font-medium transition-all ${failReason === r ? 'border-red-500 bg-red-500/10 text-red-400' : 'border-gray-700 bg-gray-800 text-gray-400'}`}>
                    {r}
                  </button>
                ))}
              </div>
              <input value={failReason} onChange={e => setFailReason(e.target.value)} className="input" placeholder="Ou descreva..." />
              <div className="flex gap-2">
                <button onClick={() => { setShowFail(null); setFailReason('') }} className="btn-secondary flex-1">Cancelar</button>
                <button onClick={() => updateStop(showFail, 'failed', failReason)} disabled={!failReason || updating === showFail}
                  className="flex-1 py-2.5 bg-red-500 text-white rounded-xl font-bold flex items-center justify-center gap-1.5">
                  {updating === showFail ? <Loader2 size={15} className="animate-spin" /> : <XCircle size={15} />} Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

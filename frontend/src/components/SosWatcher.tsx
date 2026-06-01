import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { sosApi, SosAlert } from '../services/api'
import { Siren, X, MapPin, BatteryLow } from 'lucide-react'

const POLL_MS = 6000

/** Beep curto de alerta usando Web Audio (sem arquivo externo). */
function beep() {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.value = 880
    gain.gain.value = 0.08
    osc.connect(gain); gain.connect(ctx.destination)
    osc.start()
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.18)
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.36)
    osc.stop(ctx.currentTime + 0.54)
    setTimeout(() => ctx.close().catch(() => {}), 800)
  } catch { /* silencioso */ }
}

export default function SosWatcher() {
  const navigate = useNavigate()
  const location = useLocation()
  const onMap = location.pathname.startsWith('/mapa')   // no mapa o alerta aparece no próprio mapa
  const baselineRef = useRef<number | null>(null)   // maior id conhecido na 1a carga (não alerta)
  const seenRef = useRef<Set<number>>(new Set())
  const [popup, setPopup] = useState<SosAlert | null>(null)

  const { data } = useQuery({
    queryKey: ['sos-watch'],
    queryFn: () => sosApi.recent(30),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: true,
  })

  useEffect(() => {
    if (!Array.isArray(data) || data.length === 0) return
    const maxId = Math.max(...data.map(a => a.id))
    // Primeira carga: estabelece a linha de base e NÃO dispara pop-up para alertas antigos.
    if (baselineRef.current === null) { baselineRef.current = maxId; return }

    const novos = data
      .filter(a => a.id > (baselineRef.current as number) && !seenRef.current.has(a.id))
      .sort((a, b) => b.id - a.id)

    if (novos.length) {
      novos.forEach(a => seenRef.current.add(a.id))
      baselineRef.current = maxId
      // No mapa, o próprio mapa mostra o alerta (pop-up on-map por 30s). Fora dele, modal na tela.
      if (!onMap) {
        setPopup(novos[0]) // mostra o mais recente
        beep()
      }
    }
  }, [data, onMap])

  // Se o usuário entrar no mapa com um modal aberto, fecha (o mapa assume).
  useEffect(() => { if (onMap) setPopup(null) }, [onMap])

  if (!popup) return null

  const lat = Number(popup.latitude)
  const lng = Number(popup.longitude)
  const hasLoc = Number.isFinite(lat) && Number.isFinite(lng)

  const irAoMapa = () => {
    setPopup(null)
    navigate('/mapa', {
      state: {
        focus: {
          lat, lng,
          label: popup.device_name || popup.dev_eui || 'Alerta SOS',
          battery: popup.battery_level,
          triggered_at: popup.triggered_at,
          id: popup.id,
        },
      },
    })
  }

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border-2 border-red-500/70 bg-gray-900 shadow-2xl shadow-red-900/40 overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 bg-red-600/15 border-b border-red-500/40">
          <div className="w-11 h-11 rounded-full bg-red-500/20 border border-red-500/50 flex items-center justify-center animate-pulse">
            <Siren className="w-6 h-6 text-red-400" />
          </div>
          <div>
            <p className="text-lg font-bold text-red-300 tracking-wide">🆘 ALERTA SOS</p>
            <p className="text-xs text-gray-400">Botão de pânico acionado</p>
          </div>
          <button onClick={() => setPopup(null)} className="ml-auto text-gray-500 hover:text-gray-200">
            <X size={20} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Dispositivo</span>
            <span className="text-gray-100 font-medium">{popup.device_name || '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">DevEui</span>
            <span className="text-gray-300 font-mono text-xs">{popup.dev_eui || '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Bateria</span>
            <span className={`font-medium flex items-center gap-1 ${Number(popup.battery_level) <= 20 ? 'text-red-400' : 'text-gray-100'}`}>
              {Number(popup.battery_level) <= 20 && <BatteryLow size={14} />}
              {popup.battery_level != null ? `${popup.battery_level}%` : '—'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Local</span>
            <span className="text-gray-300 font-mono text-xs">
              {hasLoc ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : 'sem GPS'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Acionado em</span>
            <span className="text-gray-300 text-xs">{new Date(popup.triggered_at).toLocaleString('pt-BR')}</span>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-800 flex gap-3">
          <button onClick={() => setPopup(null)} className="px-4 py-2 text-sm text-gray-400 hover:text-white">
            Dispensar
          </button>
          <button
            onClick={irAoMapa}
            disabled={!hasLoc}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white"
          >
            <MapPin size={16} />
            {hasLoc ? 'Ver no mapa' : 'Sem localização'}
          </button>
        </div>
      </div>
    </div>
  )
}

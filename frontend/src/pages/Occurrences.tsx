import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { eventsApi, ipCamerasApi } from '../services/api'
import { AlertTriangle, Camera as CameraIcon, Car, ScanFace, User, Move, ShieldAlert, Activity, RefreshCw } from 'lucide-react'

// Tipos de evento conhecidos (event_type em ip_camera_events) → rótulo/ícone/cor
const TYPE_META: Record<string, { label: string; icon: any; color: string }> = {
  motion:        { label: 'Movimento',     icon: Move,        color: 'bg-slate-600' },
  face:          { label: 'Face',          icon: ScanFace,    color: 'bg-purple-600' },
  lpr:           { label: 'Placa (LPR)',   icon: Car,         color: 'bg-blue-600' },
  intrusion:     { label: 'Intrusão',      icon: ShieldAlert, color: 'bg-red-600' },
  line_crossing: { label: 'Linha cruzada', icon: Activity,    color: 'bg-orange-600' },
  person:        { label: 'Pessoa',        icon: User,        color: 'bg-teal-600' },
  tampering:     { label: 'Violação',      icon: AlertTriangle, color: 'bg-red-700' },
  unknown:       { label: 'Desconhecido',  icon: CameraIcon,  color: 'bg-gray-600' },
}

const SEVERITY_RING: Record<string, string> = {
  critical: 'ring-red-500',
  warning: 'ring-amber-500',
  info: 'ring-slate-600',
}

function metaFor(t: string) {
  return TYPE_META[t] || { label: t || '—', icon: CameraIcon, color: 'bg-gray-600' }
}

// Detalhe relevante por tipo, extraído do payload
function detailFor(ev: any): string | null {
  const p = ev?.payload || {}
  if (ev.event_type === 'lpr') {
    const plate = p.plate || p.licensePlate
    return plate ? `Placa: ${plate}${p.vehicle_type ? ' · ' + p.vehicle_type : ''}` : null
  }
  if (ev.event_type === 'face') {
    const name = p.person_name
    const conf = p.confidence != null ? ` (${Number(p.confidence).toFixed(0)}%)` : ''
    return name ? `${name}${conf}` : (p.confidence != null ? `Confiança ${Number(p.confidence).toFixed(0)}%` : null)
  }
  if (p.description) return String(p.description)
  return null
}

function fmtTime(s: string): string {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const PAGE = 50

export default function Occurrences() {
  const [type, setType] = useState('')
  const [cameraId, setCameraId] = useState('')
  const [since, setSince] = useState('')
  const [offset, setOffset] = useState(0)

  const { data: camsRaw } = useQuery({
    queryKey: ['occ-cameras'],
    queryFn: () => ipCamerasApi.list().then(r => r.data),
  })
  const cameras: any[] = Array.isArray(camsRaw) ? camsRaw : (camsRaw?.cameras || camsRaw?.items || [])
  const camName = useMemo(() => {
    const m: Record<number, string> = {}
    cameras.forEach((c: any) => { m[c.id] = c.name })
    return m
  }, [cameras])

  const params = {
    event_type: type || undefined,
    camera_id: cameraId || undefined,
    since: since ? new Date(since).toISOString() : undefined,
    limit: PAGE,
    offset,
  }

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['occurrences', type, cameraId, since, offset],
    queryFn: () => eventsApi.list(params).then(r => r.data),
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  })

  const events: any[] = Array.isArray(data?.events) ? data.events : (Array.isArray(data) ? data : [])
  const total: number = data?.total ?? events.length

  function changeFilter(setter: (v: string) => void, v: string) {
    setter(v)
    setOffset(0)
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <AlertTriangle className="text-amber-400" size={24} /> Ocorrências
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Eventos de câmeras (todos os tipos) · {total} no total
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm"
        >
          <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} /> Atualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-5 bg-slate-800/60 p-4 rounded-xl border border-slate-700">
        <div className="flex flex-col">
          <label className="text-xs text-gray-400 mb-1">Tipo</label>
          <select
            value={type}
            onChange={e => changeFilter(setType, e.target.value)}
            className="bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm min-w-[160px]"
          >
            <option value="">Todos os tipos</option>
            {Object.entries(TYPE_META).map(([k, m]) => (
              <option key={k} value={k}>{m.label}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-400 mb-1">Câmera</label>
          <select
            value={cameraId}
            onChange={e => changeFilter(setCameraId, e.target.value)}
            className="bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm min-w-[180px]"
          >
            <option value="">Todas as câmeras</option>
            {cameras.map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-400 mb-1">Desde</label>
          <input
            type="datetime-local"
            value={since}
            onChange={e => changeFilter(setSince, e.target.value)}
            className="bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm"
          />
        </div>
        {(type || cameraId || since) && (
          <div className="flex flex-col justify-end">
            <button
              onClick={() => { setType(''); setCameraId(''); setSince(''); setOffset(0) }}
              className="px-3 py-2 text-sm text-gray-300 hover:text-white underline"
            >
              Limpar filtros
            </button>
          </div>
        )}
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="text-center text-gray-400 py-12">Carregando ocorrências…</div>
      ) : events.length === 0 ? (
        <div className="text-center text-gray-500 py-12 bg-slate-800/40 rounded-xl border border-slate-700">
          Nenhuma ocorrência encontrada com os filtros atuais.
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((ev: any) => {
            const meta = metaFor(ev.event_type)
            const Icon = meta.icon
            const detail = detailFor(ev)
            const ring = SEVERITY_RING[ev.severity] || 'ring-slate-600'
            return (
              <div
                key={ev.id}
                className="flex items-center gap-4 bg-slate-800/60 hover:bg-slate-800 border border-slate-700 rounded-xl p-3"
              >
                {/* Snapshot */}
                <div className={`w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-slate-900 ring-2 ${ring} flex items-center justify-center`}>
                  {ev.snapshot_url ? (
                    <img src={ev.snapshot_url} alt="snapshot" className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <Icon size={22} className="text-slate-500" />
                  )}
                </div>
                {/* Badge tipo */}
                <div className="flex-shrink-0">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold text-white ${meta.color}`}>
                    <Icon size={13} /> {meta.label}
                  </span>
                </div>
                {/* Conteúdo */}
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm font-medium truncate">
                    {camName[ev.camera_id] || `Câmera ${ev.camera_id}`}
                  </div>
                  {detail && <div className="text-gray-300 text-sm truncate">{detail}</div>}
                </div>
                {/* Horário */}
                <div className="text-right flex-shrink-0">
                  <div className="text-gray-400 text-xs">{fmtTime(ev.received_at || ev.occurred_at)}</div>
                  {ev.acknowledged_at && (
                    <div className="text-emerald-400 text-[11px] mt-0.5">✓ reconhecido</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Paginação */}
      {!isLoading && total > PAGE && (
        <div className="flex items-center justify-between mt-5">
          <button
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE))}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm"
          >
            ← Anteriores
          </button>
          <span className="text-gray-400 text-sm">
            {offset + 1}–{Math.min(offset + PAGE, total)} de {total}
          </span>
          <button
            disabled={offset + PAGE >= total}
            onClick={() => setOffset(offset + PAGE)}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm"
          >
            Próximas →
          </button>
        </div>
      )}
    </div>
  )
}

import { useQuery } from '@tanstack/react-query'
import { Signal, RefreshCw, Network, Camera, MapPin, Wifi } from 'lucide-react'
import { statusApi, traccarApi } from '../services/api'
import { useAuth } from '../store/auth'

// Item normalizado vindo do backend (/status/overview) ou montado no front (trackers)
type StatusItem = {
  type: string
  id: number | string
  name: string
  group: string
  online: boolean
  last_seen: string | null
  detail?: string | null
}

const SECTION_ORDER = ['VPNs', 'Câmeras IP', 'Rastreadores GPS', 'Agentes WalkieFleet'] as const

const SECTION_ICON: Record<string, any> = {
  'VPNs': Network,
  'Câmeras IP': Camera,
  'Rastreadores GPS': MapPin,
  'Agentes WalkieFleet': Wifi,
}

function agoText(ts: string | null): string {
  if (!ts) return ''
  const ms = Date.now() - new Date(ts).getTime()
  if (isNaN(ms)) return ''
  const s = Math.floor(ms / 1000)
  if (s < 60) return `há ${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `há ${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `há ${h}h`
  return `há ${Math.floor(h / 24)}d`
}

export default function Status() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'
  // VPNs só para admin/superadmin (o backend também já omite a fonte p/ não-admin)
  const sections = SECTION_ORDER.filter(s => s !== 'VPNs' || isAdmin)

  // 1) VPNs + Câmeras IP + Agentes WF (agregador do iot_backend)
  const overview = useQuery({
    queryKey: ['status-overview'],
    queryFn: () => statusApi.overview().then(r => r.data),
    refetchInterval: 20000,
  })

  // 2) Rastreadores GPS — direto do bridge (Traccar), mesclado no cliente
  const trackers = useQuery({
    queryKey: ['status-traccar-devices'],
    queryFn: () => traccarApi.devices().then(r => r.data),
    refetchInterval: 20000,
  })

  // ── Normalização defensiva (gotcha React Query v5 + shape {devices,...}) ──
  const backendItems: StatusItem[] = Array.isArray(overview.data?.items) ? overview.data.items : []

  const rawDevices = trackers.data
  const deviceArr: any[] = Array.isArray(rawDevices)
    ? rawDevices
    : (Array.isArray(rawDevices?.devices) ? rawDevices.devices : [])

  const trackerItems: StatusItem[] = deviceArr
    .filter((d: any) => {
      const uid = (d?.uniqueId || '').toString()
      const nm = (d?.name || '').toString()
      return !uid.startsWith('demo-') && !nm.startsWith('[DEMO]') // sem mock
    })
    .map((d: any) => ({
      type: 'tracker',
      id: d.id,
      name: d.name || `Device #${d.id}`,
      group: 'Rastreadores GPS',
      online: d.status === 'online',
      last_seen: d.lastUpdate || null,
      detail: d.status || 'unknown',
    }))

  // ── Agrupar por seção ──
  const bySection: Record<string, StatusItem[]> = {}
  for (const it of [...backendItems, ...trackerItems]) {
    if (!bySection[it.group]) bySection[it.group] = []
    bySection[it.group].push(it)
  }

  const allItems = [...backendItems, ...trackerItems]
  const totalOnline = allItems.filter(i => i.online).length
  const totalAll = allItems.length

  const loading = overview.isLoading || trackers.isLoading
  const overviewError = overview.isError

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Signal className="text-cyan-400" /> Status / Presença
          </h1>
          <p className="text-sm text-white/60 mt-1">
            {overview.data?.generated_at
              ? `Atualizado ${agoText(overview.data.generated_at)} · auto-refresh 20s`
              : 'Carregando…'}
            {!loading && (
              <span className="ml-2 font-semibold text-white/80">
                {totalOnline} online / {totalAll} total
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => { overview.refetch(); trackers.refetch() }}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/80 text-sm border border-white/10"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Atualizar
        </button>
      </div>

      {overviewError && (
        <div className="mb-4 p-3 rounded-lg bg-red-900/20 border border-red-500/40 text-red-300 text-sm">
          Falha ao carregar o agregador de status. Tentando novamente automaticamente…
        </div>
      )}

      {loading && allItems.length === 0 ? (
        <div className="text-white/50 py-12 text-center">Carregando status…</div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {sections.map(section => {
            const list = bySection[section] || []
            const Icon = SECTION_ICON[section] || Signal
            const online = list.filter(i => i.online).length
            const isTrackerSection = section === 'Rastreadores GPS'
            const sectionErr = isTrackerSection ? trackers.isError : overviewError
            return (
              <div key={section} className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-white font-semibold flex items-center gap-2">
                    <Icon size={18} className="text-cyan-400" /> {section}
                  </h2>
                  <span className="text-xs text-white/60">
                    {online} online / {list.length} total
                  </span>
                </div>

                {sectionErr ? (
                  <p className="text-sm text-red-300/80">Fonte indisponível no momento.</p>
                ) : list.length === 0 ? (
                  <p className="text-sm text-white/40">Nenhum item.</p>
                ) : (
                  <ul className="space-y-1">
                    {list.map(item => (
                      <li
                        key={`${item.type}-${item.id}`}
                        className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-white/5"
                      >
                        <span
                          className={`flex-shrink-0 w-2.5 h-2.5 rounded-full ${item.online ? 'bg-green-400' : 'bg-red-500'}`}
                          title={item.online ? 'ON' : 'OFF'}
                        />
                        <span className="text-sm text-white/90 truncate flex-1">{item.name}</span>
                        <span className="text-xs text-white/45 truncate max-w-[40%] text-right">
                          {item.detail}
                        </span>
                        <span className={`text-xs whitespace-nowrap ${item.online ? 'text-green-300/80' : 'text-white/40'}`}>
                          {item.online
                            ? (item.last_seen ? agoText(item.last_seen) : 'online')
                            : 'offline'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

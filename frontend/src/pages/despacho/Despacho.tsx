import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Loader2, X, Search, MapPin, Send, RefreshCw, Inbox, AlertTriangle, Crosshair, Headphones, Filter,
} from 'lucide-react'
import { MapBase, MapMarkerSpec } from '../../components/MapBase'
import { whatsappApi, routesApi } from '../../services/api'
import {
  useDispatchMetrics, useOccurrences, useWfAgents, useNeighborhoods,
  useCreateManualOccurrence, useDispatchWf, useOccurrence, useCategories,
  WaOccurrence, WaWfAgent,
} from '../whatsapp/hooks'
import { PRIORITY, LEVELS, Level, isLevel } from '../whatsapp/priority'

const FALLBACK_CENTER = { lat: -8.05, lng: -34.9 } // Recife/PE
const STATUSES = ['', 'pending_classification', 'pending_manual', 'dispatched', 'closed']

function confidencePct(v: string | number | null): number {
  const n = typeof v === 'string' ? parseFloat(v) : (v ?? 0)
  return Math.round((n || 0) * 100)
}
const STATUS_BADGE: Record<string, string> = {
  dispatched: 'bg-green-500/20 text-green-400 border-green-500/30',
  pending_manual: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  pending_classification: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  closed: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
}
function OriginBadge({ source }: { source?: string | null }) {
  const manual = source === 'manual'
  return <span className={`text-[10px] px-1.5 py-0.5 rounded border ${manual ? 'bg-purple-500/15 text-purple-300 border-purple-500/30' : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'}`}>{manual ? 'Manual' : 'WhatsApp'}</span>
}
function PriorityChip({ level }: { level: Level | null }) {
  if (!level || !isLevel(level)) return <span className="text-[10px] text-gray-500">—</span>
  return <span className={`text-[10px] px-1.5 py-0.5 rounded text-white ${PRIORITY[level].badge}`}>{PRIORITY[level].label.split(' ')[0]}</span>
}
const agentColor = (a: WaWfAgent) => a.status === 'available' ? '#22c55e' : a.allocated ? '#eab308' : '#64748b'
const agentDot = (a: WaWfAgent) => a.status === 'available' ? '🟢' : a.allocated ? '🟡' : '⚪'

function MetricCard({ label, value, hint, accent }: { label: string; value: number | string; hint?: string; accent?: string }) {
  return (
    <div className={`rounded-xl border p-3 ${accent || 'bg-gray-800/50 border-gray-700'}`}>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-xl font-bold text-white mt-0.5">{value}</p>
      {hint && <p className="text-[11px] text-gray-500">{hint}</p>}
    </div>
  )
}

// ─── Modal: registrar ocorrência (com pin no mapa) ────────────────
function RegisterModal({ categories, onClose, onCreated }: { categories: any[]; onClose: () => void; onCreated: (id: number) => void }) {
  const create = useCreateManualOccurrence()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [description, setDescription] = useState('')
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null)
  const [addr, setAddr] = useState('')
  const [geocoding, setGeocoding] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const searchAddr = async () => {
    if (!addr.trim()) return
    setGeocoding(true); setErr(null)
    try {
      const r = await routesApi.geocode(addr.trim())
      if (r.data?.found && Number.isFinite(r.data.lat) && Number.isFinite(r.data.lng)) {
        setPos({ lat: r.data.lat, lng: r.data.lng })
      } else setErr('Endereço não encontrado — clique no mapa para fixar o local.')
    } catch { setErr('Falha na busca — clique no mapa para fixar o local.') }
    finally { setGeocoding(false) }
  }

  const submit = () => {
    setErr(null)
    if (!pos) { setErr('Defina a localização (busca ou clique no mapa).'); return }
    if (!description.trim()) { setErr('Descrição é obrigatória.'); return }
    create.mutate(
      { name: name || undefined, phone: phone || undefined, latitude: pos.lat, longitude: pos.lng, category_id: categoryId ? Number(categoryId) : undefined, description: description.trim() },
      { onSuccess: (occ: any) => { if (occ?.id) onCreated(occ.id); onClose() }, onError: (e: any) => setErr(e?.response?.data?.error || 'Erro ao registrar.') },
    )
  }

  const markers: MapMarkerSpec[] = pos ? [{ id: 'new', lat: pos.lat, lng: pos.lng, color: '#ef4444', icon: '📍', label: 'Local da ocorrência', isSelected: true }] : []

  return (
    <div className="fixed inset-0 bg-black/70 z-[2000] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-3xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Registrar ocorrência</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={20} /></button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-gray-400 mb-1 block">Nome (opcional)</label>
                <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" /></div>
              <div><label className="text-xs text-gray-400 mb-1 block">Telefone (opcional)</label>
                <input value={phone} onChange={e => setPhone(e.target.value)} className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" /></div>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Categoria (opcional — vazio = IA classifica)</label>
              <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm">
                <option value="">— IA classifica —</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Descrição *</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" placeholder="Descreva a ocorrência…" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Endereço</label>
              <div className="flex gap-2">
                <input value={addr} onChange={e => setAddr(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); searchAddr() } }}
                  placeholder="Buscar endereço…" className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
                <button onClick={searchAddr} disabled={geocoding} className="px-3 py-2 bg-gray-700 text-gray-200 rounded-lg text-sm hover:bg-gray-600 disabled:opacity-40">
                  {geocoding ? <Loader2 className="animate-spin" size={15} /> : <Search size={15} />}
                </button>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">{pos ? `Local: ${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}` : 'Busque um endereço ou clique no mapa →'}</p>
            </div>
          </div>
          <div className="rounded-xl overflow-hidden border border-gray-700" style={{ minHeight: 320 }}>
            <MapBase forceLeaflet center={pos || FALLBACK_CENTER} zoom={pos ? 15 : 11} markers={markers}
              onClick={(lat, lng) => setPos({ lat, lng })} style={{ height: '100%', minHeight: 320 }} />
          </div>
        </div>
        {err && <p className="text-sm text-amber-400 mt-3">{err}</p>}
        <div className="flex gap-3 mt-4">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-gray-600 text-gray-300 text-sm hover:bg-gray-800">Cancelar</button>
          <button onClick={submit} disabled={create.isPending}
            className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-40 flex items-center justify-center gap-2">
            {create.isPending ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />} Registrar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Painel lateral: detalhe + agentes WF + despacho ──────────────
function DispatchPanel({ occurrenceId, neighborhood, categories, onClose, onFilterNeighborhood }: {
  occurrenceId: number; neighborhood: string; categories: any[]
  onClose: () => void; onFilterNeighborhood: (n: string) => void
}) {
  const qc = useQueryClient()
  const { data: occ, isLoading } = useOccurrence(occurrenceId)
  const { data: agents } = useWfAgents({ occurrenceId, neighborhood: neighborhood || undefined })
  const dispatch = useDispatchWf(occurrenceId)
  const [selAgent, setSelAgent] = useState<WaWfAgent | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['wa-occurrence', occurrenceId] })
    qc.invalidateQueries({ queryKey: ['wa-occurrences'] })
  }
  const redispatch = useMutation({ mutationFn: () => whatsappApi.redispatch(occurrenceId), onSuccess: () => { setMsg('IA reprocessada.'); invalidate() }, onError: (e: any) => setMsg('Erro: ' + (e?.response?.data?.error || e.message)) })
  const setCategory = useMutation({ mutationFn: (catId: number | null) => whatsappApi.setCategory(occurrenceId, catId), onSuccess: () => { setMsg('Categoria atualizada.'); invalidate() } })

  const agentList = Array.isArray(agents) ? agents : []
  const catList = Array.isArray(categories) ? categories.filter((c: any) => c.active) : []

  const doDispatch = () => {
    if (!selAgent) return
    setMsg(null)
    dispatch.mutate({ wf_user_id: selAgent.wf_user_id, wf_device_id: selAgent.wf_device_id }, {
      onSuccess: (r: any) => {
        if (r?.wf_delivery === 'unavailable')
          setMsg('Ocorrência despachada e registrada. Notificação no WalkieFleet pendente (canal indisponível).')
        else
          setMsg(`Despachado e notificado no WalkieFleet (entrega: ${r?.wf?.job_status || 'enviada'}).`)
      },
      onError: (e: any) => setMsg('Erro ao despachar: ' + (e?.response?.data?.error || e.message)),
    })
  }

  if (isLoading || !occ) return (
    <div className="fixed inset-0 bg-black/60 z-[2000] flex justify-end" onClick={onClose}>
      <div className="w-full max-w-xl h-full bg-gray-900 border-l border-gray-700 p-6 flex items-center justify-center" onClick={e => e.stopPropagation()}>
        <Loader2 className="animate-spin text-gray-400" size={20} />
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/60 z-[2000] flex justify-end" onClick={onClose}>
      <div className="w-full max-w-xl h-full bg-gray-900 border-l border-gray-700 shadow-2xl overflow-y-auto p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">{occ.name || occ.phone} <OriginBadge source={occ.source} /></h3>
            <p className="text-xs text-gray-400">#{occ.id} · {new Date(occ.created_at).toLocaleString('pt-BR')} · {occ.phone}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={20} /></button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <PriorityChip level={occ.priority_level} />
          <span className={`text-xs px-2 py-1 rounded-full border ${STATUS_BADGE[occ.status] || STATUS_BADGE.closed}`}>{occ.status}</span>
          {(occ.neighborhood || occ.city) && (
            <button onClick={() => onFilterNeighborhood(occ.neighborhood || occ.city || '')}
              className="text-xs px-2 py-1 rounded-full border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10 flex items-center gap-1">
              <Filter size={11} /> {occ.neighborhood || occ.city} — filtrar agentes
            </button>
          )}
        </div>

        {/* IA */}
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-3">
          <div className="flex items-center justify-between mb-1"><span className="text-xs text-gray-400 uppercase">Sugestão da IA</span><span className="text-xs text-gray-500">{occ.ai_method || '—'}</span></div>
          <div className="flex items-center gap-3">
            <span className="text-white text-sm font-medium">{occ.category_name || '— não classificada —'}</span>
            <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden"><div className="h-full bg-cyan-500" style={{ width: `${confidencePct(occ.ai_confidence)}%` }} /></div>
            <span className="text-sm text-cyan-400 font-mono w-12 text-right">{confidencePct(occ.ai_confidence)}%</span>
          </div>
        </div>

        {/* Descrição + áudio */}
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-3 space-y-2">
          <span className="text-xs text-gray-400 uppercase">Descrição</span>
          <p className="text-sm text-gray-200">{occ.description_transcribed || occ.description_raw || '—'}</p>
          {occ.audio_url && <audio controls src={occ.audio_url} className="w-full h-9" />}
        </div>

        {/* Agentes WF */}
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-3 space-y-2">
          <span className="text-xs text-gray-400 uppercase">Agentes no WalkieFleet {neighborhood ? `· ${neighborhood}` : ''}</span>
          <div className="space-y-1 max-h-56 overflow-y-auto">
            {agentList.length === 0 && <p className="text-xs text-gray-500">Nenhum agente WF {neighborhood ? 'neste bairro' : 'disponível'}.</p>}
            {agentList.map(a => (
              <button key={a.wf_device_id} onClick={() => setSelAgent(a)}
                className={`w-full text-left rounded-lg border p-2 flex items-center gap-2 transition ${selAgent?.wf_device_id === a.wf_device_id ? 'bg-cyan-500/10 border-cyan-500/40' : 'bg-gray-800 border-gray-700 hover:bg-gray-700/40'}`}>
                <span>{agentDot(a)}</span>
                <span className="text-sm text-white flex-1 truncate">{a.name}</span>
                <span className="text-[11px] text-gray-400">{a.neighborhood || 'bairro indefinido'}</span>
                <span className="text-[11px] text-cyan-400 font-mono w-16 text-right">{a.distance_m != null ? `${a.distance_m} m` : '—'}</span>
              </button>
            ))}
          </div>
          <button disabled={!selAgent || !selAgent.online || dispatch.isPending} onClick={doDispatch}
            className="w-full py-2 mt-1 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-40 flex items-center justify-center gap-2">
            {dispatch.isPending ? <Loader2 className="animate-spin" size={15} /> : <Send size={15} />}
            Despachar {selAgent ? `→ ${selAgent.name}` : ''}
          </button>
          {selAgent && !selAgent.online && <p className="text-[11px] text-amber-400">Agente offline no WF — selecione um agente online para despachar.</p>}
        </div>

        {/* Ações existentes */}
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-3 space-y-3">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Corrigir categoria</label>
            <select value={occ.category_id ?? ''} onChange={e => setCategory.mutate(e.target.value ? Number(e.target.value) : null)}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm">
              <option value="">— sem categoria —</option>
              {catList.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex items-center justify-between">
            <button onClick={() => redispatch.mutate()} disabled={redispatch.isPending}
              className="px-3 py-2 bg-gray-700 text-gray-200 rounded-lg text-sm hover:bg-gray-600 disabled:opacity-40 flex items-center gap-2">
              {redispatch.isPending ? <Loader2 className="animate-spin" size={15} /> : <RefreshCw size={15} />} Reprocessar IA
            </button>
            {occ.dispatched_wf_username && <span className="text-xs text-green-400">→ {occ.dispatched_wf_username}{occ.dispatched_distance_m != null ? ` (${occ.dispatched_distance_m} m)` : ''}</span>}
          </div>
          {msg && <p className="text-xs text-cyan-400">{msg}</p>}
        </div>
      </div>
    </div>
  )
}

// ─── Tela principal (ABA Despacho única) ──────────────────────────
export default function Despacho() {
  const { data: metrics } = useDispatchMetrics()
  const { data: nbhData } = useNeighborhoods()
  const { data: cats } = useCategories()
  const categories = Array.isArray(cats) ? cats : []

  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState<Level | ''>('')
  const [search, setSearch] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [selected, setSelected] = useState<number | null>(null)
  const [showRegister, setShowRegister] = useState(false)
  const [mapKey, setMapKey] = useState(0)

  const { data: occData, isLoading, isError } = useOccurrences({ status: status || undefined })
  const { data: wfAgents } = useWfAgents({ neighborhood: neighborhood || undefined })

  const list = useMemo(() => {
    let arr = Array.isArray(occData?.occurrences) ? occData!.occurrences : []
    if (priority) arr = arr.filter(o => o.priority_level === priority)
    if (search.trim()) {
      const s = search.trim().toLowerCase()
      arr = arr.filter(o => (o.name || '').toLowerCase().includes(s) || (o.phone || '').toLowerCase().includes(s) || (o.category_name || '').toLowerCase().includes(s) || (o.description_raw || o.description_transcribed || '').toLowerCase().includes(s))
    }
    return arr
  }, [occData, priority, search])

  const agentsLayer = useMemo(() => Array.isArray(wfAgents) ? wfAgents : [], [wfAgents])

  const selectedOcc = useMemo(() => list.find(o => o.id === selected) || null, [list, selected])
  const center = useMemo(() => {
    if (selectedOcc?.latitude != null && selectedOcc?.longitude != null) return { lat: selectedOcc.latitude, lng: selectedOcc.longitude }
    const o = list.find(x => x.latitude != null && x.longitude != null)
    if (o) return { lat: o.latitude!, lng: o.longitude! }
    const a = agentsLayer.find(x => x.lat != null && x.lng != null)
    if (a) return { lat: a.lat!, lng: a.lng! }
    return FALLBACK_CENTER
  }, [selectedOcc, list, agentsLayer])

  const markers: MapMarkerSpec[] = useMemo(() => {
    const m: MapMarkerSpec[] = []
    for (const o of list) {
      if (o.latitude == null || o.longitude == null) continue
      const color = (o.priority_level && PRIORITY[o.priority_level as Level]?.color) || '#9ca3af'
      m.push({ id: `occ-${o.id}`, lat: o.latitude, lng: o.longitude, color, icon: '📍', isSelected: selected === o.id, label: `#${o.id} ${o.name || ''} — ${o.category_name || 'sem categoria'}`, onClick: () => setSelected(o.id) })
    }
    for (const a of agentsLayer) {
      if (a.lat == null || a.lng == null) continue
      m.push({ id: `ag-${a.wf_device_id}`, lat: a.lat, lng: a.lng, color: agentColor(a), icon: '🚓', label: `${a.name} — ${a.status}${a.neighborhood ? ` · ${a.neighborhood}` : ''}` })
    }
    return m
  }, [list, agentsLayer, selected])

  const selectFromList = (id: number) => { setSelected(id); setMapKey(k => k + 1) }
  const byPrio = metrics?.occurrences.by_priority

  return (
    <div className="flex flex-col h-full">
      {/* Header + métricas */}
      <div className="px-6 pt-5 pb-3 border-b border-gray-800">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
          <div className="flex items-center gap-2"><Headphones size={20} className="text-cyan-400" /><h1 className="text-2xl font-bold text-white">Despacho</h1></div>
          <button onClick={() => setShowRegister(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 flex items-center gap-2"><Plus size={16} /> Registrar ocorrência</button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <MetricCard label="Total" value={metrics?.occurrences.total ?? 0} hint="ocorrências" />
          <MetricCard label="Agentes disponíveis" value={metrics?.agents.available ?? 0} hint="próximos e livres" accent="bg-green-500/10 border-green-500/30" />
          <MetricCard label="Pendentes" value={metrics?.occurrences.pending_manual ?? 0} hint="aguardando" accent="bg-amber-500/10 border-amber-500/30" />
          {LEVELS.map(l => (
            <MetricCard key={l} label={PRIORITY[l].label.split(' ')[0]} value={byPrio ? byPrio[l] : 0} accent="bg-gray-800/50 border-gray-700" />
          ))}
        </div>
      </div>

      {/* Conteúdo: lista (esq) + mapa (dir) */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-5 gap-0">
        {/* Lista + filtros */}
        <div className="lg:col-span-2 border-r border-gray-800 flex flex-col min-h-0">
          <div className="p-3 space-y-2 border-b border-gray-800">
            <div className="flex gap-2">
              <select value={neighborhood} onChange={e => setNeighborhood(e.target.value)} className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-2 py-1.5 text-white text-xs">
                <option value="">Todos os bairros</option>
                {(nbhData?.neighborhoods || []).map(n => <option key={n} value={n}>{n}</option>)}
                {(nbhData?.cities || []).map(c => <option key={'c-' + c} value={c}>{c} (cidade)</option>)}
              </select>
              <select value={status} onChange={e => setStatus(e.target.value)} className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-2 py-1.5 text-white text-xs">
                {STATUSES.map(s => <option key={s} value={s}>{s || 'Todos status'}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <select value={priority} onChange={e => setPriority(e.target.value as Level | '')} className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-2 py-1.5 text-white text-xs">
                <option value="">Todas prioridades</option>
                {LEVELS.map(l => <option key={l} value={l}>{PRIORITY[l].label.split(' ')[0]}</option>)}
              </select>
              <div className="flex-1 flex items-center gap-1 bg-gray-800 border border-gray-600 rounded-lg px-2">
                <Search size={13} className="text-gray-500" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar…" className="flex-1 bg-transparent py-1.5 text-white text-xs outline-none" />
              </div>
            </div>
            {neighborhood && <button onClick={() => setNeighborhood('')} className="text-[11px] text-cyan-400 hover:underline">Bairro: {neighborhood} · limpar filtro de agentes</button>}
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {isLoading ? <div className="text-center py-10 text-gray-400"><Loader2 className="animate-spin inline mr-2" size={16} />Carregando…</div>
              : isError ? <div className="text-center py-10 text-red-400">Erro ao carregar.</div>
              : list.length === 0 ? <div className="text-center py-10 text-gray-500"><Inbox className="mx-auto mb-2 opacity-50" size={26} />Nenhuma ocorrência.</div>
              : list.map(o => (
                <button key={o.id} onClick={() => selectFromList(o.id)}
                  className={`w-full text-left rounded-lg border p-2.5 transition ${o.id === selected ? 'bg-cyan-500/10 border-cyan-500/40' : 'bg-gray-800/50 border-gray-700 hover:bg-gray-700/40'}`}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-white font-medium text-sm truncate">{o.name || o.phone}</span>
                    <span className="text-[10px] text-gray-500 whitespace-nowrap">{new Date(o.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p className="text-xs text-gray-400 line-clamp-1 mb-1.5">{o.description_transcribed || o.description_raw || '—'}</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <OriginBadge source={o.source} />
                    <PriorityChip level={o.priority_level} />
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-200">{o.category_name || 'sem cat.'}</span>
                    <span className="text-[10px] text-cyan-400 font-mono">{o.ai_confidence != null ? `${confidencePct(o.ai_confidence)}%` : ''}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${STATUS_BADGE[o.status] || STATUS_BADGE.closed}`}>{o.status}</span>
                    {o.dispatched_wf_username && <span className="text-[10px] text-green-400">→ {o.dispatched_wf_username}</span>}
                  </div>
                </button>
              ))}
          </div>
        </div>

        {/* Mapa */}
        <div className="lg:col-span-3 relative min-h-[360px]">
          <MapBase key={mapKey} forceLeaflet center={center} zoom={selectedOcc ? 14 : 12} markers={markers} style={{ height: '100%', minHeight: 360 }} />
          <div className="absolute bottom-3 left-3 z-[1000] bg-slate-900/90 border border-white/15 rounded-lg px-3 py-2 text-[11px] text-gray-200 space-y-1 pointer-events-none">
            <div>📍 ocorrência (cor = prioridade)</div>
            <div>🚓 🟢 disponível · 🟡 alocado · ⚪ offline {neighborhood ? `· filtrado: ${neighborhood}` : ''}</div>
          </div>
          {markers.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="bg-slate-900/80 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-300 flex items-center gap-2"><Crosshair size={16} /> Sem pontos para exibir.</div>
            </div>
          )}
        </div>
      </div>

      {showRegister && <RegisterModal categories={categories} onClose={() => setShowRegister(false)} onCreated={(id) => selectFromList(id)} />}
      {selected != null && <DispatchPanel occurrenceId={selected} neighborhood={neighborhood} categories={categories} onClose={() => setSelected(null)} onFilterNeighborhood={(n) => setNeighborhood(n)} />}
    </div>
  )
}

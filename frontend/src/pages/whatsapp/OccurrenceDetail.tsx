import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { MapPin, RefreshCw, Send, Loader2 } from 'lucide-react'
import { MapBase, MapMarkerSpec } from '../../components/MapBase'
import { whatsappApi } from '../../services/api'
import { useOccurrence, useAvailableAgents, useCategories } from './hooks'

const RECIFE = { lat: -8.05, lng: -34.9 }

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

export default function OccurrenceDetail({ occurrenceId }: { occurrenceId: number }) {
  const qc = useQueryClient()
  const { data: occ, isLoading } = useOccurrence(occurrenceId)
  const { data: agents } = useAvailableAgents(occurrenceId)
  const { data: categories } = useCategories()
  const [selectedAgent, setSelectedAgent] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => { setSelectedAgent(''); setMsg(null) }, [occurrenceId])

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['wa-occurrence', occurrenceId] })
    qc.invalidateQueries({ queryKey: ['wa-pending'] })
    qc.invalidateQueries({ queryKey: ['wa-occurrences'] })
    qc.invalidateQueries({ queryKey: ['wa-agents', occurrenceId] })
  }

  const assign = useMutation({
    mutationFn: (wf: string) => whatsappApi.assign(occurrenceId, wf),
    onSuccess: () => { setMsg('Ocorrência despachada.'); invalidate() },
    onError: (e: any) => setMsg('Erro ao despachar: ' + (e?.response?.data?.error || e.message)),
  })
  const setCategory = useMutation({
    mutationFn: (catId: number | null) => whatsappApi.setCategory(occurrenceId, catId),
    onSuccess: () => { setMsg('Categoria atualizada.'); invalidate() },
  })
  const redispatch = useMutation({
    mutationFn: () => whatsappApi.redispatch(occurrenceId),
    onSuccess: () => { setMsg('IA reprocessada.'); invalidate() },
    onError: (e: any) => setMsg('Erro ao reprocessar: ' + (e?.response?.data?.error || e.message)),
  })

  if (isLoading || !occ) {
    return <div className="flex items-center justify-center h-64 text-gray-400"><Loader2 className="animate-spin mr-2" size={18} /> Carregando…</div>
  }

  const agentList = Array.isArray(agents) ? agents : []
  const catList = Array.isArray(categories) ? categories.filter(c => c.active) : []
  const hasCoords = occ.latitude != null && occ.longitude != null

  const markers: MapMarkerSpec[] = []
  if (hasCoords) markers.push({ id: 'occ', lat: occ.latitude!, lng: occ.longitude!, color: '#ef4444', icon: '📍', label: `Ocorrência: ${occ.name || occ.phone}`, isSelected: true })
  agentList.forEach(a => {
    if (a.last_lat != null && a.last_lng != null)
      markers.push({ id: 'ag-' + a.wf_username, lat: a.last_lat, lng: a.last_lng, color: a.fresh ? '#06b6d4' : '#64748b', icon: '🚓', label: `${a.wf_username}${a.distance_m != null ? ` — ${a.distance_m} m` : ''}${a.fresh ? '' : ' (sem posição fresca)'}` })
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-semibold text-white">{occ.name || occ.phone}</h3>
          <p className="text-xs text-gray-400">#{occ.id} · {new Date(occ.created_at).toLocaleString('pt-BR')} · {occ.phone}</p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full border ${STATUS_BADGE[occ.status] || STATUS_BADGE.closed}`}>{occ.status}</span>
      </div>

      {/* Mapa */}
      <div className="rounded-xl overflow-hidden border border-gray-700" style={{ height: 280 }}>
        {hasCoords ? (
          <MapBase forceLeaflet center={{ lat: occ.latitude!, lng: occ.longitude! }} zoom={14} markers={markers} style={{ height: 280 }} />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm"><MapPin size={16} className="mr-2" /> Sem coordenadas</div>
        )}
      </div>

      {/* IA: categoria sugerida + confiança */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400 uppercase tracking-wider">Sugestão da IA</span>
          <span className="text-xs text-gray-500">{occ.ai_method || '—'}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-white font-medium">{occ.category_name || '— não classificada —'}</span>
          <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-cyan-500" style={{ width: `${confidencePct(occ.ai_confidence)}%` }} />
          </div>
          <span className="text-sm text-cyan-400 font-mono w-12 text-right">{confidencePct(occ.ai_confidence)}%</span>
        </div>
      </div>

      {/* Descrição + áudio */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 space-y-2">
        <span className="text-xs text-gray-400 uppercase tracking-wider">Descrição</span>
        {occ.description_raw && <p className="text-sm text-gray-200">{occ.description_raw}</p>}
        {occ.description_transcribed && (
          <p className="text-sm text-gray-300"><span className="text-gray-500">Transcrição: </span>{occ.description_transcribed}</p>
        )}
        {!occ.description_raw && !occ.description_transcribed && <p className="text-sm text-gray-500">—</p>}
        {occ.audio_url && (
          <audio controls src={occ.audio_url} className="w-full mt-2 h-9" />
        )}
      </div>

      {/* Ações: categoria + agente + despacho */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 space-y-3">
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Categoria</label>
          <select value={occ.category_id ?? ''} onChange={e => setCategory.mutate(e.target.value ? Number(e.target.value) : null)}
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm">
            <option value="">— sem categoria —</option>
            {catList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Agente</label>
          <div className="flex gap-2">
            <select value={selectedAgent} onChange={e => setSelectedAgent(e.target.value)}
              className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm">
              <option value="">Selecione um agente…</option>
              {agentList.map(a => (
                <option key={a.wf_username} value={a.wf_username}>
                  {a.wf_username}{a.display_name ? ` (${a.display_name})` : ''}{a.distance_m != null ? ` — ${a.distance_m} m` : ''}{a.fresh ? '' : ' · sem GPS'}
                </option>
              ))}
            </select>
            <button disabled={!selectedAgent || assign.isPending} onClick={() => assign.mutate(selectedAgent)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-40 flex items-center gap-2">
              {assign.isPending ? <Loader2 className="animate-spin" size={15} /> : <Send size={15} />} Despachar
            </button>
          </div>
          {agentList.length === 0 && <p className="text-xs text-gray-500 mt-1">Nenhum agente disponível (Traccar offline ou sem posições).</p>}
        </div>
        <div className="flex items-center justify-between pt-1">
          <button onClick={() => redispatch.mutate()} disabled={redispatch.isPending}
            className="px-3 py-2 bg-gray-700 text-gray-200 rounded-lg text-sm hover:bg-gray-600 disabled:opacity-40 flex items-center gap-2">
            {redispatch.isPending ? <Loader2 className="animate-spin" size={15} /> : <RefreshCw size={15} />} Reprocessar IA
          </button>
          {occ.dispatched_wf_username && (
            <span className="text-xs text-green-400">→ {occ.dispatched_wf_username}{occ.dispatched_distance_m != null ? ` (${occ.dispatched_distance_m} m)` : ''}</span>
          )}
        </div>
        {msg && <p className="text-xs text-cyan-400">{msg}</p>}
      </div>
    </div>
  )
}

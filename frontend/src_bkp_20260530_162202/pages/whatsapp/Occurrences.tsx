import { useState } from 'react'
import { X } from 'lucide-react'
import { useOccurrences } from './hooks'
import OccurrenceDetail from './OccurrenceDetail'

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

const STATUSES = ['', 'pending_classification', 'pending_manual', 'dispatched', 'closed']

export default function Occurrences() {
  const [filters, setFilters] = useState<{ status?: string; from?: string; to?: string }>({})
  const { data, isLoading, isError } = useOccurrences(filters)
  const [detailId, setDetailId] = useState<number | null>(null)

  const list = Array.isArray(data?.occurrences) ? data!.occurrences : []
  const set = (k: string, v: string) => setFilters(f => ({ ...f, [k]: v || undefined }))

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">WhatsApp · Ocorrências</h1>
        <p className="text-gray-400 text-sm mt-1">{data?.total ?? 0} ocorrência(s) registradas.</p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-4 items-end">
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Status</label>
          <select value={filters.status || ''} onChange={e => set('status', e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm">
            {STATUSES.map(s => <option key={s} value={s}>{s || 'Todos'}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">De</label>
          <input type="date" value={filters.from?.slice(0, 10) || ''} onChange={e => set('from', e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Até</label>
          <input type="date" value={filters.to?.slice(0, 10) || ''} onChange={e => set('to', e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
        </div>
        {(filters.status || filters.from || filters.to) && (
          <button onClick={() => setFilters({})} className="px-3 py-2 text-sm text-gray-400 hover:text-white">Limpar</button>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Carregando…</div>
      ) : isError ? (
        <div className="text-center py-12 text-red-400">Erro ao carregar ocorrências.</div>
      ) : (
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left px-3 py-3 text-gray-400 font-medium">#</th>
                <th className="text-left px-3 py-3 text-gray-400 font-medium">Data</th>
                <th className="text-left px-3 py-3 text-gray-400 font-medium">Cidadão</th>
                <th className="text-left px-3 py-3 text-gray-400 font-medium">Categoria</th>
                <th className="text-center px-3 py-3 text-gray-400 font-medium">Confiança</th>
                <th className="text-center px-3 py-3 text-gray-400 font-medium">Método IA</th>
                <th className="text-center px-3 py-3 text-gray-400 font-medium">Status</th>
                <th className="text-left px-3 py-3 text-gray-400 font-medium">Agente</th>
                <th className="text-right px-3 py-3 text-gray-400 font-medium">Dist.</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr><td colSpan={9} className="text-center py-8 text-gray-500">Nenhuma ocorrência encontrada.</td></tr>
              )}
              {list.map(o => (
                <tr key={o.id} onClick={() => setDetailId(o.id)} className="border-b border-gray-700/50 hover:bg-gray-700/20 cursor-pointer">
                  <td className="px-3 py-3 text-gray-400">{o.id}</td>
                  <td className="px-3 py-3 text-gray-300 whitespace-nowrap">{new Date(o.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="px-3 py-3 text-white">{o.name || o.phone}</td>
                  <td className="px-3 py-3 text-gray-300">{o.category_name || '—'}</td>
                  <td className="px-3 py-3 text-center text-cyan-400 font-mono">{o.ai_confidence != null ? `${confidencePct(o.ai_confidence)}%` : '—'}</td>
                  <td className="px-3 py-3 text-center text-gray-400 text-xs">{o.ai_method || '—'}</td>
                  <td className="px-3 py-3 text-center">
                    <span className={`text-xs px-2 py-1 rounded-full border ${STATUS_BADGE[o.status] || STATUS_BADGE.closed}`}>{o.status}</span>
                  </td>
                  <td className="px-3 py-3 text-gray-300">{o.dispatched_wf_username || '—'}</td>
                  <td className="px-3 py-3 text-right text-gray-400">{o.dispatched_distance_m != null ? `${o.dispatched_distance_m} m` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detalhe em modal — backdrop z-[2000] (gotcha Leaflet: pane GPU pinta sobre z menor) */}
      {detailId != null && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[2000] p-4" onClick={() => setDetailId(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-2xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-end mb-2">
              <button onClick={() => setDetailId(null)} className="text-gray-400 hover:text-white"><X size={20} /></button>
            </div>
            <OccurrenceDetail occurrenceId={detailId} />
          </div>
        </div>
      )}
    </div>
  )
}

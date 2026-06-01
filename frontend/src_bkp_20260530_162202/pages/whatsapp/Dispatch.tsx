import { useState, useEffect } from 'react'
import { Loader2, Inbox } from 'lucide-react'
import { usePendingOccurrences, WaOccurrence } from './hooks'
import OccurrenceDetail from './OccurrenceDetail'

function confidencePct(v: string | number | null): number {
  const n = typeof v === 'string' ? parseFloat(v) : (v ?? 0)
  return Math.round((n || 0) * 100)
}

/** Heurística de motivo (o detalhe traz o log preciso). */
function reasonHint(o: WaOccurrence): { label: string; cls: string } {
  if (o.category_id == null || confidencePct(o.ai_confidence) < 50)
    return { label: 'baixa confiança', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' }
  return { label: 'sem agente no raio', cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' }
}

export default function Dispatch() {
  const { data: pending, isLoading } = usePendingOccurrences()
  const list = Array.isArray(pending) ? pending : []
  const [selected, setSelected] = useState<number | null>(null)

  // Auto-seleciona o primeiro item se nada selecionado.
  useEffect(() => {
    if (selected == null && list.length > 0) setSelected(list[0].id)
    if (selected != null && list.length > 0 && !list.some(o => o.id === selected)) setSelected(list[0].id)
  }, [list, selected])

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">WhatsApp · Despacho Manual</h1>
        <p className="text-gray-400 text-sm mt-1">{list.length} ocorrência(s) aguardando despacho manual.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Esquerda: lista */}
        <div className="lg:col-span-2 space-y-2 lg:max-h-[calc(100vh-200px)] lg:overflow-y-auto pr-1">
          {isLoading ? (
            <div className="text-center py-12 text-gray-400"><Loader2 className="animate-spin inline mr-2" size={18} /> Carregando…</div>
          ) : list.length === 0 ? (
            <div className="text-center py-12 text-gray-500 bg-gray-800/40 border border-gray-700 rounded-xl">
              <Inbox className="mx-auto mb-2 opacity-50" size={28} /> Nenhuma ocorrência pendente.
            </div>
          ) : list.map(o => {
            const reason = reasonHint(o)
            const active = o.id === selected
            return (
              <button key={o.id} onClick={() => setSelected(o.id)}
                className={`w-full text-left rounded-xl border p-3 transition ${active ? 'bg-cyan-500/10 border-cyan-500/40' : 'bg-gray-800/50 border-gray-700 hover:bg-gray-700/40'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-white font-medium text-sm truncate">{o.name || o.phone}</span>
                  <span className="text-[11px] text-gray-500">{new Date(o.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <p className="text-xs text-gray-400 line-clamp-2 mb-2">{o.description_transcribed || o.description_raw || '—'}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-700 text-gray-200">{o.category_name || 'sem categoria'}</span>
                  <div className="flex items-center gap-1">
                    <div className="w-14 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-cyan-500" style={{ width: `${confidencePct(o.ai_confidence)}%` }} />
                    </div>
                    <span className="text-[11px] text-cyan-400 font-mono">{confidencePct(o.ai_confidence)}%</span>
                  </div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full border ${reason.cls}`}>{reason.label}</span>
                </div>
              </button>
            )
          })}
        </div>

        {/* Direita: detalhe */}
        <div className="lg:col-span-3">
          {selected != null ? (
            <OccurrenceDetail occurrenceId={selected} />
          ) : (
            <div className="text-center py-20 text-gray-500 bg-gray-800/40 border border-gray-700 rounded-xl">
              Selecione uma ocorrência à esquerda.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

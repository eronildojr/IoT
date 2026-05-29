import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Wifi, WifiOff, Loader2, RefreshCw, BrainCircuit, AlertTriangle, Save } from 'lucide-react'
import { whatsappApi } from '../../services/api'
import { useWaConfig, useConnection, useAiHealth } from './hooks'

/** Mapeia o estado bruto da Whatsmiau/Evolution para um badge. */
function parseConnState(data: any): { label: string; color: string; dot: string } {
  const raw = String(data?.instance?.state ?? data?.state ?? data?.status ?? (data?.connected ? 'open' : '')).toLowerCase()
  if (raw === 'open' || raw === 'connected') return { label: 'Conectado', color: 'text-green-400', dot: 'bg-green-500' }
  if (raw === 'connecting' || raw === 'qr') return { label: 'Conectando', color: 'text-amber-400', dot: 'bg-amber-500' }
  return { label: 'Desconectado', color: 'text-red-400', dot: 'bg-red-500' }
}

export default function WhatsAppConfig() {
  const qc = useQueryClient()
  const { data: cfg, isLoading } = useWaConfig()
  const { data: conn, isFetching: connLoading } = useConnection()
  const { data: ai } = useAiHealth()

  const [form, setForm] = useState<any>({ bot_enabled: false, welcome_message: '', confidence_threshold: 0.55, dispatch_max_radius_m: 15000 })
  const [qrBust, setQrBust] = useState(() => whatsappApi.qrUrl())
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (cfg) setForm({
      bot_enabled: !!cfg.bot_enabled,
      welcome_message: cfg.welcome_message || '',
      confidence_threshold: parseFloat(cfg.confidence_threshold ?? 0.55),
      dispatch_max_radius_m: Number(cfg.dispatch_max_radius_m ?? 15000),
    })
  }, [cfg])

  const save = useMutation({
    mutationFn: () => whatsappApi.saveConfig(form),
    onSuccess: () => { setSaved(true); qc.invalidateQueries({ queryKey: ['wa-config'] }); setTimeout(() => setSaved(false), 2500) },
  })

  const state = parseConnState(conn)
  const connected = state.label === 'Conectado'
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">WhatsApp · Configuração</h1>
        <p className="text-gray-400 text-sm mt-1">Conexão do número, bot de ocorrências e status da IA.</p>
      </div>

      {!form.bot_enabled && (
        <div className="mb-5 flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-amber-300 text-sm">
          <AlertTriangle size={18} /> Bot em modo de teste — mensagens não são enviadas ao WhatsApp.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Conexão + QR */}
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">Status da conexão</h2>
            <span className={`flex items-center gap-2 text-sm font-medium ${state.color}`}>
              <span className={`w-2.5 h-2.5 rounded-full ${state.dot} ${connLoading ? 'animate-pulse' : ''}`} />
              {connected ? <Wifi size={15} /> : <WifiOff size={15} />} {state.label}
            </span>
          </div>

          {!connected ? (
            <div className="text-center">
              <p className="text-xs text-gray-400 mb-3">Escaneie o QR Code no WhatsApp (Aparelhos conectados) para conectar o número.</p>
              <div className="inline-block bg-white p-2 rounded-lg">
                <img src={qrBust} alt="QR Code" width={220} height={220} style={{ display: 'block' }}
                  onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.2' }} />
              </div>
              <div>
                <button onClick={() => setQrBust(whatsappApi.qrUrl())}
                  className="mt-3 px-3 py-2 bg-gray-700 text-gray-200 rounded-lg text-sm hover:bg-gray-600 inline-flex items-center gap-2">
                  <RefreshCw size={15} /> Atualizar QR
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-green-400">Número conectado e pronto para receber mensagens.</p>
          )}
        </div>

        {/* Status IA */}
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Status da IA (groupates_ai)</h2>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <BrainCircuit size={18} className={ai?.reachable ? 'text-cyan-400' : 'text-gray-500'} />
              <span className="text-sm text-gray-300">Serviço:</span>
              <span className={`text-xs px-2 py-1 rounded-full border ${ai?.reachable ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'}`}>
                {ai?.reachable ? 'online' : 'offline'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-300">Chave OpenAI:</span>
              <span className={`text-xs px-2 py-1 rounded-full border ${ai?.openai_configured ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-amber-500/20 text-amber-400 border-amber-500/30'}`}>
                {ai?.openai_configured ? 'configurada' : 'não configurada'}
              </span>
            </div>
            {!ai?.openai_configured && <p className="text-xs text-gray-500">Sem a chave, a classificação cai no fallback/manual.</p>}
          </div>
        </div>
      </div>

      {/* Form do bot */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-5 mt-5">
        <h2 className="text-sm font-semibold text-white mb-4">Configurações do bot</h2>
        {isLoading ? (
          <div className="text-gray-400 text-sm flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> Carregando…</div>
        ) : (
          <div className="space-y-5 max-w-2xl">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={form.bot_enabled} onChange={e => set('bot_enabled', e.target.checked)}
                className="w-4 h-4 accent-cyan-500" />
              <span className="text-sm text-gray-200">Bot habilitado (envia mensagens reais ao WhatsApp)</span>
            </label>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">Mensagem de boas-vindas</label>
              <textarea value={form.welcome_message} onChange={e => set('welcome_message', e.target.value)} rows={3}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm resize-none" />
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">
                Limiar de confiança: <span className="text-cyan-400 font-mono">{Number(form.confidence_threshold).toFixed(2)}</span>
              </label>
              <input type="range" min={0} max={1} step={0.01} value={form.confidence_threshold}
                onChange={e => set('confidence_threshold', parseFloat(e.target.value))} className="w-full accent-cyan-500" />
              <p className="text-xs text-gray-500 mt-1">Abaixo do limiar → despacho manual.</p>
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">Raio máximo de despacho (metros)</label>
              <input type="number" value={form.dispatch_max_radius_m} onChange={e => set('dispatch_max_radius_m', Number(e.target.value))}
                className="w-48 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
            </div>

            <div className="flex items-center gap-3">
              <button onClick={() => save.mutate()} disabled={save.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-40 flex items-center gap-2">
                {save.isPending ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />} Salvar
              </button>
              {saved && <span className="text-sm text-green-400">Salvo!</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

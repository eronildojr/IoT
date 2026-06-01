import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { vpnApi } from '../services/api'
import {
  Shield, Plus, Pencil, Trash2, Power, PowerOff, Copy, Check, X,
  Activity, RefreshCw, Lock, ChevronDown, AlertCircle,
} from 'lucide-react'

// ── helpers ──────────────────────────────────────────────────────────────
function fmtBytes(n: number): string {
  if (!n) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(n) / Math.log(1024))
  return `${(n / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${u[i]}`
}
function fmtHandshake(ts: string | null): string {
  if (!ts) return 'nunca'
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (s < 0) return 'agora'
  if (s < 60) return `há ${s}s`
  if (s < 3600) return `há ${Math.floor(s / 60)}min`
  if (s < 86400) return `há ${Math.floor(s / 3600)}h`
  return `há ${Math.floor(s / 86400)}d`
}

type Tunnel = {
  id: number; name: string; interface_name: string; address: string | null
  endpoint: string | null; allowed_ips: string[]; public_key: string | null
  our_public_key: string | null; listen_port: number | null; dns: string | null
  keepalive: number | null; is_managed: boolean; enabled: boolean
  status: 'pending' | 'up' | 'down' | 'error'; last_handshake_at: string | null
  bytes_rx: number; bytes_tx: number; last_error: string | null; notes: string | null
}

const emptyForm = {
  id: 0, name: '', endpoint: '', allowed_ips: '', address: '',
  peer_public_key: '', listen_port: '', dns: '', keepalive: '25', enabled: false,
}

function CopyBtn({ value }: { value: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500) }}
      className="text-gray-400 hover:text-cyan-400 transition-colors" title="Copiar">
      {done ? <Check size={15} className="text-green-400" /> : <Copy size={15} />}
    </button>
  )
}

// ── status pill ──────────────────────────────────────────────────────────
function StatusPill({ t }: { t: Tunnel }) {
  if (!t.is_managed) return <span className="badge-warning"><Lock size={11} /> Protegido</span>
  if (!t.public_key) return <span className="badge-warning"><AlertCircle size={11} /> Aguardando chave do peer</span>
  if (!t.enabled) return <span className="badge-offline">Desativado</span>
  if (t.status === 'up') return <span className="badge-online">Conectado</span>
  if (t.status === 'error') return <span className="badge-error">Erro</span>
  if (t.status === 'pending') return <span className="badge-warning">Subindo…</span>
  return <span className="badge-offline">Desconectado</span>
}

export default function Vpn() {
  const qc = useQueryClient()
  const { data: tunnels = [], isLoading } = useQuery<Tunnel[]>({
    queryKey: ['vpn-tunnels'],
    queryFn: () => vpnApi.list().then(r => r.data),
    refetchInterval: 15000,
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['vpn-tunnels'] })

  const [modal, setModal] = useState<null | 'new' | 'edit'>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [advanced, setAdvanced] = useState(false)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState<Tunnel | null>(null) // pós-criação: mostra chave pública
  const [diag, setDiag] = useState<{ t: Tunnel; ip: string; running: boolean; result: any } | null>(null)

  const openNew = () => { setForm({ ...emptyForm }); setAdvanced(false); setErr(''); setCreated(null); setModal('new') }
  const openEdit = (t: Tunnel) => {
    setForm({
      id: t.id, name: t.name, endpoint: t.endpoint || '', allowed_ips: (t.allowed_ips || []).join(', '),
      address: t.address || '', peer_public_key: t.public_key || '', listen_port: t.listen_port?.toString() || '',
      dns: t.dns || '', keepalive: t.keepalive?.toString() || '', enabled: t.enabled,
    })
    setAdvanced(!!(t.address || t.public_key || t.listen_port || t.dns)); setErr(''); setCreated(t); setModal('edit')
  }

  const save = async () => {
    setErr(''); setSaving(true)
    const payload: any = {
      name: form.name.trim(),
      endpoint: form.endpoint.trim(),
      allowed_ips: form.allowed_ips,
      address: form.address.trim(),
      peer_public_key: form.peer_public_key.trim(),
      listen_port: form.listen_port ? Number(form.listen_port) : null,
      dns: form.dns.trim(),
      keepalive: form.keepalive ? Number(form.keepalive) : null,
      enabled: form.enabled,
    }
    try {
      if (modal === 'new') {
        const r = await vpnApi.create(payload)
        setCreated(r.data)        // exibe a chave pública gerada p/ copiar
        await refresh()
        // mantém o modal aberto mostrando a chave; usuário fecha manualmente
        setModal('edit'); setForm(f => ({ ...f, id: r.data.id }))
      } else {
        await vpnApi.update(form.id, payload)
        await refresh(); setModal(null)
      }
    } catch (e: any) {
      setErr(e.response?.data?.message || e.response?.data?.error || 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  const toggle = async (t: Tunnel) => {
    try { await vpnApi.update(t.id, { enabled: !t.enabled }); await refresh() }
    catch (e: any) { alert(e.response?.data?.message || e.response?.data?.error || 'Erro ao alterar') }
  }
  const remove = async (t: Tunnel) => {
    if (!confirm(`Remover a VPN "${t.name}"? Esta ação não pode ser desfeita.`)) return
    try { await vpnApi.delete(t.id); await refresh() }
    catch (e: any) { alert(e.response?.data?.error || 'Erro ao remover') }
  }
  const runDiag = async () => {
    if (!diag) return
    setDiag({ ...diag, running: true, result: null })
    try {
      const r = await vpnApi.diagnose(diag.t.id, diag.ip.trim() || undefined as any)
      setDiag(d => d && { ...d, running: false, result: r.data })
    } catch (e: any) {
      setDiag(d => d && { ...d, running: false, result: { error: e.response?.data?.error || 'falhou' } })
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center">
            <Shield className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Redes / VPN</h1>
            <p className="text-sm text-gray-500">Túneis WireGuard para alcançar câmeras em redes remotas</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} className="btn-secondary" title="Atualizar"><RefreshCw size={16} /></button>
          <button onClick={openNew} className="btn-primary flex items-center gap-2"><Plus size={16} /> Nova VPN</button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center text-gray-500 py-16">Carregando…</div>
      ) : tunnels.length === 0 ? (
        <div className="card p-10 text-center text-gray-500">
          <Shield className="w-10 h-10 mx-auto mb-3 opacity-40" />
          Nenhuma VPN cadastrada. Crie uma para conectar câmeras de outro site.
        </div>
      ) : (
        <div className="grid gap-3">
          {tunnels.map(t => (
            <div key={t.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-white">{t.name}</span>
                    <span className="text-xs text-gray-500 font-mono">{t.interface_name}</span>
                    <StatusPill t={t} />
                  </div>
                  <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1 text-xs text-gray-400">
                    <div><span className="text-gray-600">Faixa:</span> {(t.allowed_ips || []).join(', ') || '—'}</div>
                    <div><span className="text-gray-600">Endpoint:</span> {t.endpoint || '—'}</div>
                    <div><span className="text-gray-600">Handshake:</span> {fmtHandshake(t.last_handshake_at)}</div>
                    <div><span className="text-gray-600">Tráfego:</span> ↓{fmtBytes(t.bytes_rx)} ↑{fmtBytes(t.bytes_tx)}</div>
                  </div>
                  {t.our_public_key && (
                    <div className="mt-2 flex items-center gap-2 text-xs">
                      <span className="text-gray-600">Nossa chave pública:</span>
                      <code className="text-cyan-300 bg-gray-800/60 px-2 py-0.5 rounded font-mono truncate max-w-[280px]">{t.our_public_key}</code>
                      <CopyBtn value={t.our_public_key} />
                    </div>
                  )}
                  {t.last_error && t.status === 'error' && (
                    <p className="mt-1 text-xs text-red-400/80 truncate max-w-md">{t.last_error}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {t.is_managed ? (
                    <>
                      <button onClick={() => toggle(t)} disabled={!t.enabled && !t.public_key}
                        className={`p-2 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${t.enabled ? 'text-green-400 hover:bg-green-500/10' : 'text-gray-400 hover:bg-gray-800'}`}
                        title={!t.public_key ? 'Complete a configuração antes de ativar' : t.enabled ? 'Desativar' : 'Ativar'}>
                        {t.enabled ? <Power size={16} /> : <PowerOff size={16} />}
                      </button>
                      <button onClick={() => setDiag({ t, ip: '', running: false, result: null })}
                        className="p-2 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-cyan-400" title="Diagnosticar">
                        <Activity size={16} />
                      </button>
                      <button onClick={() => openEdit(t)} className="p-2 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-cyan-400" title="Editar">
                        <Pencil size={16} />
                      </button>
                      <button onClick={() => remove(t)} className="p-2 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-red-400" title="Remover">
                        <Trash2 size={16} />
                      </button>
                    </>
                  ) : (
                    <span className="text-xs text-gray-600 flex items-center gap-1 px-2"><Lock size={12} /> somente leitura</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Modal criar/editar ──────────────────────────────────────────── */}
      {modal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[200] p-4 overflow-y-auto">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-lg my-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">{modal === 'new' ? 'Nova VPN' : `Editar — ${form.name}`}</h3>
              <button onClick={() => setModal(null)} className="text-gray-500 hover:text-white"><X size={18} /></button>
            </div>

            {/* chave pública gerada (pós-criação / edição) */}
            {created?.our_public_key && (
              <div className="mb-4 p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
                <p className="text-xs text-cyan-300 font-medium mb-1">Chave pública gerada no servidor</p>
                <p className="text-[11px] text-gray-400 mb-2">Repasse a quem hospeda o servidor VPN remoto. A chave privada nunca sai do servidor.</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-cyan-200 bg-gray-950/60 px-2 py-1.5 rounded font-mono text-xs truncate">{created.our_public_key}</code>
                  <CopyBtn value={created.our_public_key} />
                </div>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="label">Nome do site</label>
                <input className="input" value={form.name} placeholder="Ex.: Filial ARS"
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="label">Endpoint do servidor VPN</label>
                <input className="input" value={form.endpoint} placeholder="vpn.exemplo.com:51820"
                  onChange={e => setForm(f => ({ ...f, endpoint: e.target.value }))} />
              </div>
              <div>
                <label className="label">Faixa /24 das câmeras</label>
                <input className="input" value={form.allowed_ips} placeholder="10.0.251.0/24"
                  onChange={e => setForm(f => ({ ...f, allowed_ips: e.target.value }))} />
                <p className="text-xs text-gray-600 mt-1">Sub-rede onde estão as câmeras. Deve ser distinta das demais VPNs.</p>
              </div>

              <button onClick={() => setAdvanced(a => !a)} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-cyan-400">
                <ChevronDown size={15} className={`transition-transform ${advanced ? 'rotate-180' : ''}`} /> Avançado
              </button>
              {advanced && (
                <div className="space-y-3 pl-1 border-l border-gray-800">
                  <div className="pl-3">
                    <label className="label">Chave pública do peer remoto</label>
                    <input className="input font-mono text-xs" value={form.peer_public_key} placeholder="base64 (44 caracteres)"
                      onChange={e => setForm(f => ({ ...f, peer_public_key: e.target.value }))} />
                    <p className="text-xs text-gray-600 mt-1">Quem hospeda a VPN devolve esta chave. Sem ela o túnel não conecta.</p>
                  </div>
                  <div className="pl-3">
                    <label className="label">Endereço do túnel (nosso IP)</label>
                    <input className="input" value={form.address} placeholder="10.10.0.2/32"
                      onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
                  </div>
                  <div className="pl-3 grid grid-cols-3 gap-2">
                    <div>
                      <label className="label">Porta</label>
                      <input className="input" value={form.listen_port} placeholder="auto"
                        onChange={e => setForm(f => ({ ...f, listen_port: e.target.value }))} />
                    </div>
                    <div>
                      <label className="label">Keepalive</label>
                      <input className="input" value={form.keepalive} placeholder="25"
                        onChange={e => setForm(f => ({ ...f, keepalive: e.target.value }))} />
                    </div>
                    <div>
                      <label className="label">DNS</label>
                      <input className="input" value={form.dns} placeholder="—"
                        onChange={e => setForm(f => ({ ...f, dns: e.target.value }))} />
                    </div>
                  </div>
                </div>
              )}

              {modal === 'edit' && (
                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                  <input type="checkbox" checked={form.enabled}
                    onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))} className="accent-cyan-500" />
                  Túnel ativo (conectar)
                </label>
              )}

              {err && <p className="text-red-400 text-sm flex items-center gap-1.5"><AlertCircle size={14} /> {err}</p>}
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={() => setModal(null)} className="btn-secondary flex-1">Fechar</button>
              <button onClick={save} disabled={saving || form.name.trim().length < 2} className="btn-primary flex-1">
                {saving ? 'Salvando…' : modal === 'new' ? 'Criar e gerar chave' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal diagnóstico ───────────────────────────────────────────── */}
      {diag && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[200] p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Diagnóstico — {diag.t.name}</h3>
              <button onClick={() => setDiag(null)} className="text-gray-500 hover:text-white"><X size={18} /></button>
            </div>
            <div className="flex gap-2 mb-3">
              <input className="input" placeholder="IP da câmera (opcional, ex.: 10.0.251.111)"
                value={diag.ip} onChange={e => setDiag(d => d && { ...d, ip: e.target.value })} />
              <button onClick={runDiag} disabled={diag.running} className="btn-primary whitespace-nowrap">
                {diag.running ? '…' : 'Testar'}
              </button>
            </div>
            {diag.result && (
              <pre className="text-xs text-gray-300 bg-gray-950/60 rounded-lg p-3 overflow-auto max-h-72 whitespace-pre-wrap">
                {JSON.stringify(diag.result, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

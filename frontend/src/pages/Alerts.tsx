import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { alertsApi, devicesApi } from '../services/api'
import { Bell, BellOff, Plus, Trash2, X, Loader2, Check, AlertTriangle, Info } from 'lucide-react'

const sevCls: Record<string, string> = {
  critical: 'bg-red-500/10 border-red-500/30 text-red-400',
  warning: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
  info: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
}
const sevIcon: Record<string, any> = { critical: AlertTriangle, warning: AlertTriangle, info: Info }

export default function Alerts() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'alerts' | 'rules'>('alerts')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ name: '', deviceId: '', field: '', operator: '>', threshold: '', severity: 'warning' })

  const { data: alerts = [] } = useQuery({ queryKey: ['alerts-list'], queryFn: () => alertsApi.list({ limit: 100 }).then(r => r.data), refetchInterval: 30000 })
  const { data: rules = [] } = useQuery({ queryKey: ['alert-rules'], queryFn: () => alertsApi.rules.list().then(r => r.data) })
  const { data: devData } = useQuery({ queryKey: ['devices-alerts'], queryFn: () => devicesApi.list({ limit: 100 }).then(r => r.data) })

  const markAll = useMutation({ mutationFn: () => alertsApi.markAllRead(), onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts-list'] }) })
  const markOne = useMutation({ mutationFn: (id: string) => alertsApi.markRead(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts-list'] }) })
  const delRule = useMutation({ mutationFn: (id: string) => alertsApi.rules.delete(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['alert-rules'] }) })
  const createRule = useMutation({
    mutationFn: (d: any) => alertsApi.rules.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['alert-rules'] }); setShowModal(false) },
  })

  const unread = alerts.filter((a: any) => !a.is_read).length

  return (
    <div className="p-6 space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Alertas</h1>
          <p className="text-gray-500 text-sm mt-0.5">{unread} não lidos</p>
        </div>
        <div className="flex gap-3">
          {tab === 'alerts' && unread > 0 && (
            <button onClick={() => markAll.mutate()} className="btn-secondary flex items-center gap-2"><BellOff size={16} /> Marcar todos lidos</button>
          )}
          {tab === 'rules' && (
            <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2"><Plus size={16} /> Nova Regra</button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1 w-fit">
        {(['alerts', 'rules'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === t ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/20' : 'text-gray-500 hover:text-gray-300'}`}>
            {t === 'alerts' ? `Alertas (${alerts.length})` : `Regras (${rules.length})`}
          </button>
        ))}
      </div>

      {tab === 'alerts' && (
        <div className="space-y-2">
          {alerts.length === 0 ? (
            <div className="card p-12 text-center"><Bell size={40} className="mx-auto mb-4 text-gray-700" /><p className="text-gray-500">Nenhum alerta</p></div>
          ) : alerts.map((a: any) => {
            const Icon = sevIcon[a.severity] || Info
            return (
              <div key={a.id} className={`card p-4 border flex items-start gap-4 ${sevCls[a.severity] || sevCls.info} ${a.is_read ? 'opacity-50' : ''}`}>
                <Icon size={18} className="flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{a.message}</p>
                  <p className="text-xs opacity-70 mt-0.5">{a.device_name} · {new Date(a.created_at).toLocaleString('pt-BR')}</p>
                </div>
                {!a.is_read && (
                  <button onClick={() => markOne.mutate(a.id)} className="text-xs opacity-70 hover:opacity-100 flex items-center gap-1 flex-shrink-0"><Check size={14} /> Lido</button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {tab === 'rules' && (
        <div className="space-y-3">
          {rules.length === 0 ? (
            <div className="card p-12 text-center">
              <Bell size={40} className="mx-auto mb-4 text-gray-700" />
              <p className="text-gray-500 mb-4">Nenhuma regra configurada</p>
              <button onClick={() => setShowModal(true)} className="btn-primary inline-flex items-center gap-2"><Plus size={16} /> Criar Regra</button>
            </div>
          ) : rules.map((r: any) => (
            <div key={r.id} className="card p-4 flex items-center gap-4">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${r.is_active ? 'bg-green-400' : 'bg-gray-600'}`} />
              <div className="flex-1">
                <p className="font-medium text-gray-200">{r.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {r.device_name} · <span className="font-mono">{r.field} {r.operator} {r.threshold}</span> · {r.severity}
                </p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full border ${sevCls[r.severity] || sevCls.info}`}>{r.severity}</span>
              <button onClick={() => { if (confirm('Deletar regra?')) delRule.mutate(r.id) }} className="p-1.5 text-gray-600 hover:text-red-400 transition-colors"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}

      {/* Modal Nova Regra */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <h3 className="font-semibold text-white">Nova Regra de Alerta</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-300"><X size={20} /></button>
            </div>
            <form onSubmit={e => { e.preventDefault(); createRule.mutate(form) }} className="p-6 space-y-4">
              <div>
                <label className="label">Nome da regra</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required className="input" placeholder="Ex: Temperatura Alta" />
              </div>
              <div>
                <label className="label">Dispositivo</label>
                <select value={form.deviceId} onChange={e => setForm(p => ({ ...p, deviceId: e.target.value }))} className="input">
                  <option value="">Todos os dispositivos</option>
                  {devData?.devices?.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">Campo</label>
                  <input value={form.field} onChange={e => setForm(p => ({ ...p, field: e.target.value }))} required className="input font-mono" placeholder="temperature" />
                </div>
                <div>
                  <label className="label">Operador</label>
                  <select value={form.operator} onChange={e => setForm(p => ({ ...p, operator: e.target.value }))} className="input">
                    {['>', '<', '>=', '<=', '==', '!='].map(op => <option key={op} value={op}>{op}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Valor</label>
                  <input value={form.threshold} onChange={e => setForm(p => ({ ...p, threshold: e.target.value }))} required className="input" placeholder="30" />
                </div>
              </div>
              <div>
                <label className="label">Severidade</label>
                <select value={form.severity} onChange={e => setForm(p => ({ ...p, severity: e.target.value }))} className="input">
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              {createRule.error && <p className="text-red-400 text-sm">{(createRule.error as any).response?.data?.error || 'Erro'}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" disabled={createRule.isPending} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {createRule.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Criar Regra
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

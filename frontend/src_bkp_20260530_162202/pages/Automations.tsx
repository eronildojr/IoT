import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { automationsApi, devicesApi } from '../services/api'
import { Zap, Plus, Trash2, X, Loader2, ToggleLeft, ToggleRight, ArrowRight } from 'lucide-react'

export default function Automations() {
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({
    name: '', description: '', triggerDeviceId: '', triggerField: '',
    triggerOperator: '>', triggerValue: '', actionType: 'notification',
    actionDeviceId: '', actionCommand: '', actionWebhookUrl: '',
  })

  const { data: automations = [] } = useQuery({ queryKey: ['automations'], queryFn: () => automationsApi.list().then(r => r.data) })
  const { data: devData } = useQuery({ queryKey: ['devices-auto'], queryFn: () => devicesApi.list({ limit: 100 }).then(r => r.data) })

  const create = useMutation({
    mutationFn: (d: any) => automationsApi.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['automations'] }); setShowModal(false) },
  })
  const toggle = useMutation({
    mutationFn: ({ id, isActive }: any) => automationsApi.update(id, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automations'] }),
  })
  const del = useMutation({
    mutationFn: (id: string) => automationsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automations'] }),
  })

  const devices = devData?.devices || []

  const actionTypeLabel: Record<string, string> = {
    notification: '🔔 Notificação', command: '⚡ Comando', webhook: '🌐 Webhook',
  }

  return (
    <div className="p-6 space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Automações</h1>
          <p className="text-gray-500 text-sm mt-0.5">Regras no-code entre dispositivos</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2"><Plus size={16} /> Nova Automação</button>
      </div>

      {automations.length === 0 ? (
        <div className="card p-12 text-center">
          <Zap size={40} className="mx-auto mb-4 text-gray-700" />
          <h3 className="text-lg font-medium text-gray-400 mb-2">Nenhuma automação configurada</h3>
          <p className="text-gray-600 text-sm mb-4">Crie regras para automatizar ações entre dispositivos</p>
          <button onClick={() => setShowModal(true)} className="btn-primary inline-flex items-center gap-2"><Plus size={16} /> Criar Automação</button>
        </div>
      ) : (
        <div className="space-y-3">
          {automations.map((a: any) => (
            <div key={a.id} className={`card p-5 border transition-colors ${a.is_active ? 'border-gray-800' : 'border-gray-800 opacity-60'}`}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-2 h-2 rounded-full ${a.is_active ? 'bg-green-400' : 'bg-gray-600'}`} />
                    <h3 className="font-semibold text-gray-200">{a.name}</h3>
                    {a.trigger_count > 0 && <span className="text-xs text-gray-600">Disparou {a.trigger_count}x</span>}
                  </div>
                  {a.description && <p className="text-sm text-gray-500 mb-3">{a.description}</p>}

                  {/* Fluxo visual */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="bg-gray-800 rounded-lg px-3 py-2 text-sm">
                      <p className="text-xs text-gray-500 mb-0.5">SE</p>
                      <p className="text-gray-300 font-medium">{a.trigger_device_name}</p>
                      <p className="text-xs text-cyan-400 font-mono">{a.trigger_field} {a.trigger_operator} {a.trigger_value}</p>
                    </div>
                    <ArrowRight size={18} className="text-gray-600 flex-shrink-0" />
                    <div className="bg-gray-800 rounded-lg px-3 py-2 text-sm">
                      <p className="text-xs text-gray-500 mb-0.5">ENTÃO</p>
                      <p className="text-gray-300 font-medium">{actionTypeLabel[a.action_type] || a.action_type}</p>
                      {a.action_device_name && <p className="text-xs text-purple-400">{a.action_device_name}</p>}
                      {a.action_webhook_url && <p className="text-xs text-blue-400 font-mono truncate max-w-[200px]">{a.action_webhook_url}</p>}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-4">
                  <button onClick={() => toggle.mutate({ id: a.id, isActive: !a.is_active })} className="text-gray-500 hover:text-cyan-400 transition-colors">
                    {a.is_active ? <ToggleRight size={24} className="text-cyan-400" /> : <ToggleLeft size={24} />}
                  </button>
                  <button onClick={() => { if (confirm('Deletar automação?')) del.mutate(a.id) }} className="p-1.5 text-gray-600 hover:text-red-400 transition-colors"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg my-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <h3 className="font-semibold text-white">Nova Automação</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-300"><X size={20} /></button>
            </div>
            <form onSubmit={e => { e.preventDefault(); create.mutate(form) }} className="p-6 space-y-4">
              <div>
                <label className="label">Nome</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required className="input" placeholder="Ex: Ligar ventilador se temp > 30°C" />
              </div>
              <div>
                <label className="label">Descrição (opcional)</label>
                <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="input" />
              </div>

              <div className="bg-gray-800/50 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">SE (Gatilho)</p>
                <div>
                  <label className="label">Dispositivo gatilho</label>
                  <select value={form.triggerDeviceId} onChange={e => setForm(p => ({ ...p, triggerDeviceId: e.target.value }))} required className="input">
                    <option value="">Selecionar dispositivo...</option>
                    {devices.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="label">Campo</label>
                    <input value={form.triggerField} onChange={e => setForm(p => ({ ...p, triggerField: e.target.value }))} required className="input font-mono" placeholder="temperature" />
                  </div>
                  <div>
                    <label className="label">Operador</label>
                    <select value={form.triggerOperator} onChange={e => setForm(p => ({ ...p, triggerOperator: e.target.value }))} className="input">
                      {['>', '<', '>=', '<=', '==', '!='].map(op => <option key={op} value={op}>{op}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Valor</label>
                    <input value={form.triggerValue} onChange={e => setForm(p => ({ ...p, triggerValue: e.target.value }))} required className="input" placeholder="30" />
                  </div>
                </div>
              </div>

              <div className="bg-gray-800/50 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">ENTÃO (Ação)</p>
                <div>
                  <label className="label">Tipo de ação</label>
                  <select value={form.actionType} onChange={e => setForm(p => ({ ...p, actionType: e.target.value }))} className="input">
                    <option value="notification">Notificação no app</option>
                    <option value="command">Enviar comando a dispositivo</option>
                    <option value="webhook">Chamar Webhook</option>
                  </select>
                </div>
                {form.actionType === 'command' && (
                  <>
                    <div>
                      <label className="label">Dispositivo destino</label>
                      <select value={form.actionDeviceId} onChange={e => setForm(p => ({ ...p, actionDeviceId: e.target.value }))} className="input">
                        <option value="">Selecionar...</option>
                        {devices.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">Comando</label>
                      <input value={form.actionCommand} onChange={e => setForm(p => ({ ...p, actionCommand: e.target.value }))} className="input font-mono" placeholder="relay/on" />
                    </div>
                  </>
                )}
                {form.actionType === 'webhook' && (
                  <div>
                    <label className="label">URL do Webhook</label>
                    <input value={form.actionWebhookUrl} onChange={e => setForm(p => ({ ...p, actionWebhookUrl: e.target.value }))} className="input" placeholder="https://..." />
                  </div>
                )}
              </div>

              {create.error && <p className="text-red-400 text-sm">{(create.error as any).response?.data?.error || 'Erro'}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" disabled={create.isPending} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {create.isPending ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />} Criar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

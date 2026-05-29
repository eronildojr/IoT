import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'

// ─── Types ────────────────────────────────────────────────
interface BillingCycle {
  id: number
  data_inicio: string
  data_fim: string
  descricao: string
  status: 'aberto' | 'pago' | 'cancelado'
  valor_total: number
  total_items: number
  total_calculado: number
}

interface BillingItem {
  id: number
  descricao: string
  quantidade: number
  valor_unitario: number
  valor_total: number
}

interface Payment {
  id: number
  customer_id: number
  customer_name: string
  cycle_id: number
  cycle_inicio: string
  cycle_fim: string
  valor: number
  metodo_pagamento: string
  data_pagamento: string
  status: string
}

interface BillingDashboard {
  summary: {
    total_customers: number
    contracts_ativos: number
    mrr: number
    cycles_abertos: number
    valor_pendente: number
    recebido_30d: number
  }
  recentPayments: Payment[]
  openCycles: BillingCycle[]
}

// ─── Helpers ──────────────────────────────────────────────
const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('pt-BR') : '-'

// ─── Modal Novo Ciclo ─────────────────────────────────────
function CycleModal({ onClose, onSave }: { onClose: () => void; onSave: (data: any) => void }) {
  const [form, setForm] = useState({
    data_inicio: new Date().toISOString().split('T')[0],
    data_fim: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    descricao: '',
    status: 'aberto',
  })
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold text-white mb-4">Novo Ciclo de Faturamento</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Data Início</label>
            <input type="date" value={form.data_inicio} onChange={e => setForm({ ...form, data_inicio: e.target.value })}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Data Fim</label>
            <input type="date" value={form.data_fim} onChange={e => setForm({ ...form, data_fim: e.target.value })}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Descrição</label>
            <input type="text" value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })}
              placeholder="Ex: Mensalidade Junho/2025"
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-gray-600 text-gray-300 text-sm hover:bg-gray-800">Cancelar</button>
          <button onClick={() => onSave(form)} className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700">Criar Ciclo</button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal Adicionar Item ─────────────────────────────────
function ItemModal({ cycleId, onClose, onSave }: { cycleId: number; onClose: () => void; onSave: (data: any) => void }) {
  const [form, setForm] = useState({ descricao: '', quantidade: 1, valor_unitario: '' })
  const total = parseFloat(form.valor_unitario || '0') * form.quantidade
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold text-white mb-4">Adicionar Item ao Ciclo #{cycleId}</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Descrição</label>
            <input type="text" value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })}
              placeholder="Ex: Mensalidade plano Pro"
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Quantidade</label>
              <input type="number" min="1" value={form.quantidade} onChange={e => setForm({ ...form, quantidade: parseInt(e.target.value) || 1 })}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Valor Unitário (R$)</label>
              <input type="number" step="0.01" value={form.valor_unitario} onChange={e => setForm({ ...form, valor_unitario: e.target.value })}
                placeholder="0,00"
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg px-3 py-2 text-sm text-gray-300">
            Total: <span className="text-white font-semibold">{fmt(total)}</span>
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-gray-600 text-gray-300 text-sm hover:bg-gray-800">Cancelar</button>
          <button onClick={() => onSave({ ...form, valor_unitario: parseFloat(form.valor_unitario) })}
            className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700">Adicionar</button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal Registrar Pagamento ────────────────────────────
function PaymentModal({ cycleId, customers, onClose, onSave }: { cycleId: number; customers: any[]; onClose: () => void; onSave: (data: any) => void }) {
  const [form, setForm] = useState({
    customer_id: customers[0]?.id || '',
    valor: '',
    metodo_pagamento: 'pix',
    data_pagamento: new Date().toISOString().split('T')[0],
    observacoes: '',
  })
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold text-white mb-4">Registrar Pagamento — Ciclo #{cycleId}</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Cliente</label>
            <select value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm">
              {customers.map(c => <option key={c.id} value={c.id}>{c.razao_social}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Valor (R$)</label>
              <input type="number" step="0.01" value={form.valor} onChange={e => setForm({ ...form, valor: e.target.value })}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Método</label>
              <select value={form.metodo_pagamento} onChange={e => setForm({ ...form, metodo_pagamento: e.target.value })}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm">
                <option value="pix">PIX</option>
                <option value="boleto">Boleto</option>
                <option value="cartao">Cartão</option>
                <option value="transferencia">Transferência</option>
                <option value="dinheiro">Dinheiro</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Data do Pagamento</label>
            <input type="date" value={form.data_pagamento} onChange={e => setForm({ ...form, data_pagamento: e.target.value })}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Observações</label>
            <input type="text" value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-gray-600 text-gray-300 text-sm hover:bg-gray-800">Cancelar</button>
          <button onClick={() => onSave({ ...form, cycle_id: cycleId, valor: parseFloat(form.valor) })}
            className="flex-1 py-2 rounded-lg bg-green-600 text-white text-sm hover:bg-green-700">Registrar</button>
        </div>
      </div>
    </div>
  )
}

// ─── Componente Principal ─────────────────────────────────
export default function Billing() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'dashboard' | 'cycles' | 'payments'>('dashboard')
  const [selectedCycle, setSelectedCycle] = useState<BillingCycle | null>(null)
  const [showCycleModal, setShowCycleModal] = useState(false)
  const [showItemModal, setShowItemModal] = useState<number | null>(null)
  const [showPaymentModal, setShowPaymentModal] = useState<number | null>(null)

  const { data: dashboard } = useQuery<BillingDashboard>({
    queryKey: ['billing-dashboard'],
    queryFn: () => api.get('/billing/dashboard').then(r => r.data),
  })

  const { data: cycles = [] } = useQuery<BillingCycle[]>({
    queryKey: ['billing-cycles'],
    queryFn: () => api.get('/billing/cycles').then(r => r.data),
  })

  const { data: cycleDetail } = useQuery({
    queryKey: ['billing-cycle', selectedCycle?.id],
    queryFn: () => selectedCycle ? api.get(`/billing/cycles/${selectedCycle.id}`).then(r => r.data) : null,
    enabled: !!selectedCycle,
  })

  const { data: payments = [] } = useQuery<Payment[]>({
    queryKey: ['billing-payments'],
    queryFn: () => api.get('/billing/payments').then(r => r.data),
  })

  const { data: customers = [] } = useQuery<any[]>({
    queryKey: ['customers'],
    queryFn: () => api.get('/customers').then(r => r.data),
  })

  const createCycle = useMutation({
    mutationFn: (data: any) => api.post('/billing/cycles', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['billing-cycles'] }); qc.invalidateQueries({ queryKey: ['billing-dashboard'] }); setShowCycleModal(false) },
  })

  const addItem = useMutation({
    mutationFn: ({ cycleId, data }: { cycleId: number; data: any }) => api.post(`/billing/cycles/${cycleId}/items`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['billing-cycles'] }); qc.invalidateQueries({ queryKey: ['billing-cycle', showItemModal] }); setShowItemModal(null) },
  })

  const registerPayment = useMutation({
    mutationFn: (data: any) => api.post('/billing/payments', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['billing-payments'] }); qc.invalidateQueries({ queryKey: ['billing-cycles'] }); qc.invalidateQueries({ queryKey: ['billing-dashboard'] }); setShowPaymentModal(null) },
  })

  const updateCycleStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => api.put(`/billing/cycles/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['billing-cycles'] }),
  })

  const statusColor = (s: string) => {
    if (s === 'pago') return 'bg-green-500/20 text-green-400 border-green-500/30'
    if (s === 'aberto') return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
    return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Faturamento</h1>
          <p className="text-gray-400 text-sm mt-1">Gerencie ciclos, cobranças e pagamentos</p>
        </div>
        <button onClick={() => setShowCycleModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 flex items-center gap-2">
          <span>+</span> Novo Ciclo
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-800/50 rounded-lg p-1 mb-6 w-fit">
        {(['dashboard', 'cycles', 'payments'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === t ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>
            {t === 'dashboard' ? 'Resumo' : t === 'cycles' ? 'Ciclos' : 'Pagamentos'}
          </button>
        ))}
      </div>

      {/* ── Dashboard Tab ── */}
      {tab === 'dashboard' && dashboard && (
        <div className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { label: 'Clientes', value: dashboard.summary.total_customers, color: 'text-blue-400' },
              { label: 'Contratos Ativos', value: dashboard.summary.contracts_ativos, color: 'text-green-400' },
              { label: 'MRR', value: fmt(dashboard.summary.mrr), color: 'text-emerald-400' },
              { label: 'Ciclos Abertos', value: dashboard.summary.cycles_abertos, color: 'text-yellow-400' },
              { label: 'Valor Pendente', value: fmt(dashboard.summary.valor_pendente), color: 'text-orange-400' },
              { label: 'Recebido 30d', value: fmt(dashboard.summary.recebido_30d), color: 'text-purple-400' },
            ].map(kpi => (
              <div key={kpi.label} className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
                <p className="text-xs text-gray-400 mb-1">{kpi.label}</p>
                <p className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* Ciclos em aberto */}
          {dashboard.openCycles.length > 0 && (
            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-3">Ciclos em Aberto</h3>
              <div className="space-y-2">
                {dashboard.openCycles.map(c => (
                  <div key={c.id} className="flex items-center justify-between py-2 border-b border-gray-700/50 last:border-0">
                    <div>
                      <p className="text-sm text-white">{c.descricao || `Ciclo #${c.id}`}</p>
                      <p className="text-xs text-gray-400">{fmtDate(c.data_inicio)} — {fmtDate(c.data_fim)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-yellow-400">{fmt(c.valor_total)}</p>
                      <p className="text-xs text-gray-400">{c.total_items} item(s)</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pagamentos recentes */}
          {dashboard.recentPayments.length > 0 && (
            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-3">Pagamentos Recentes</h3>
              <div className="space-y-2">
                {dashboard.recentPayments.map(p => (
                  <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-700/50 last:border-0">
                    <div>
                      <p className="text-sm text-white">{p.customer_name}</p>
                      <p className="text-xs text-gray-400">{fmtDate(p.data_pagamento)} · {p.metodo_pagamento.toUpperCase()}</p>
                    </div>
                    <p className="text-sm font-semibold text-green-400">{fmt(p.valor)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Cycles Tab ── */}
      {tab === 'cycles' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Lista de ciclos */}
          <div className="space-y-3">
            {cycles.length === 0 && (
              <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-8 text-center text-gray-400 text-sm">
                Nenhum ciclo criado ainda. Clique em "Novo Ciclo" para começar.
              </div>
            )}
            {cycles.map(c => (
              <div key={c.id}
                onClick={() => setSelectedCycle(c)}
                className={`bg-gray-800/50 border rounded-xl p-4 cursor-pointer hover:border-blue-500/50 transition-colors ${selectedCycle?.id === c.id ? 'border-blue-500' : 'border-gray-700'}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">{c.descricao || `Ciclo #${c.id}`}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{fmtDate(c.data_inicio)} — {fmtDate(c.data_fim)}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{c.total_items || 0} item(s)</p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-bold text-white">{fmt(c.valor_total)}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${statusColor(c.status)}`}>{c.status}</span>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={e => { e.stopPropagation(); setShowItemModal(c.id) }}
                    className="text-xs px-3 py-1 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-600/30">
                    + Item
                  </button>
                  <button onClick={e => { e.stopPropagation(); setShowPaymentModal(c.id) }}
                    className="text-xs px-3 py-1 bg-green-600/20 text-green-400 border border-green-500/30 rounded-lg hover:bg-green-600/30">
                    Registrar Pagamento
                  </button>
                  {c.status === 'aberto' && (
                    <button onClick={e => { e.stopPropagation(); updateCycleStatus.mutate({ id: c.id, status: 'cancelado' }) }}
                      className="text-xs px-3 py-1 bg-red-600/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-600/30">
                      Cancelar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Detalhe do ciclo selecionado */}
          {selectedCycle && cycleDetail && (
            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-4">
                {cycleDetail.descricao || `Ciclo #${cycleDetail.id}`}
                <span className={`ml-2 text-xs px-2 py-0.5 rounded-full border ${statusColor(cycleDetail.status)}`}>{cycleDetail.status}</span>
              </h3>
              <div className="space-y-2">
                {(!cycleDetail.items || cycleDetail.items.length === 0) && (
                  <p className="text-gray-500 text-sm text-center py-4">Nenhum item neste ciclo</p>
                )}
                {cycleDetail.items?.map((item: BillingItem) => (
                  <div key={item.id} className="flex items-center justify-between py-2 border-b border-gray-700/50 last:border-0">
                    <div>
                      <p className="text-sm text-white">{item.descricao}</p>
                      <p className="text-xs text-gray-400">{item.quantidade}x {fmt(item.valor_unitario)}</p>
                    </div>
                    <p className="text-sm font-semibold text-white">{fmt(item.valor_total)}</p>
                  </div>
                ))}
              </div>
              {cycleDetail.items?.length > 0 && (
                <div className="mt-4 pt-3 border-t border-gray-700 flex justify-between">
                  <span className="text-sm text-gray-400">Total</span>
                  <span className="text-base font-bold text-white">{fmt(cycleDetail.valor_total)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Payments Tab ── */}
      {tab === 'payments' && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Cliente</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Ciclo</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Método</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Data</th>
                <th className="text-right px-4 py-3 text-gray-400 font-medium">Valor</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 && (
                <tr><td colSpan={5} className="text-center py-8 text-gray-500">Nenhum pagamento registrado</td></tr>
              )}
              {payments.map(p => (
                <tr key={p.id} className="border-b border-gray-700/50 hover:bg-gray-700/20">
                  <td className="px-4 py-3 text-white">{p.customer_name}</td>
                  <td className="px-4 py-3 text-gray-400">
                    {fmtDate(p.cycle_inicio)} — {fmtDate(p.cycle_fim)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-1 bg-blue-500/20 text-blue-400 rounded-full border border-blue-500/30">
                      {p.metodo_pagamento?.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{fmtDate(p.data_pagamento)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-green-400">{fmt(p.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modais */}
      {showCycleModal && <CycleModal onClose={() => setShowCycleModal(false)} onSave={data => createCycle.mutate(data)} />}
      {showItemModal !== null && <ItemModal cycleId={showItemModal} onClose={() => setShowItemModal(null)} onSave={data => addItem.mutate({ cycleId: showItemModal, data })} />}
      {showPaymentModal !== null && <PaymentModal cycleId={showPaymentModal} customers={customers} onClose={() => setShowPaymentModal(null)} onSave={data => registerPayment.mutate(data)} />}
    </div>
  )
}

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'

interface Contract {
  id: number
  customer_id: number
  customer_name: string
  customer_cnpj: string
  numero_contrato: string
  descricao: string
  valor_mensal: number
  data_inicio: string
  data_fim: string
  status: 'ativo' | 'encerrado' | 'suspenso'
  observacoes: string
  created_at: string
}

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
const fmtDate = (d: string) => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '-'

function ContractModal({ contract, customers, onClose, onSave }: {
  contract?: Contract; customers: any[]; onClose: () => void; onSave: (data: any) => void
}) {
  const [form, setForm] = useState(contract ? {
    customer_id: contract.customer_id,
    numero_contrato: contract.numero_contrato || '',
    descricao: contract.descricao || '',
    valor_mensal: contract.valor_mensal || 0,
    data_inicio: contract.data_inicio?.split('T')[0] || '',
    data_fim: contract.data_fim?.split('T')[0] || '',
    status: contract.status || 'ativo',
    observacoes: contract.observacoes || '',
  } : {
    customer_id: customers[0]?.id || '',
    numero_contrato: '',
    descricao: '',
    valor_mensal: 0,
    data_inicio: new Date().toISOString().split('T')[0],
    data_fim: '',
    status: 'ativo',
    observacoes: '',
  })

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-white mb-5">{contract ? 'Editar Contrato' : 'Novo Contrato'}</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Cliente *</label>
            <select value={form.customer_id} onChange={e => set('customer_id', e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm">
              {customers.map(c => <option key={c.id} value={c.id}>{c.razao_social}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Número do Contrato *</label>
              <input value={form.numero_contrato} onChange={e => set('numero_contrato', e.target.value)}
                placeholder="CT-2025-001"
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Valor Mensal (R$)</label>
              <input type="number" step="0.01" value={form.valor_mensal} onChange={e => set('valor_mensal', parseFloat(e.target.value) || 0)}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Descrição</label>
            <input value={form.descricao} onChange={e => set('descricao', e.target.value)}
              placeholder="Ex: Contrato de monitoramento mensal"
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Data Início</label>
              <input type="date" value={form.data_inicio} onChange={e => set('data_inicio', e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Data Fim</label>
              <input type="date" value={form.data_fim} onChange={e => set('data_fim', e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm">
                <option value="ativo">Ativo</option>
                <option value="suspenso">Suspenso</option>
                <option value="encerrado">Encerrado</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Observações</label>
            <textarea value={form.observacoes} onChange={e => set('observacoes', e.target.value)} rows={3}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm resize-none" />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-gray-600 text-gray-300 text-sm">Cancelar</button>
          <button onClick={() => onSave(form)} className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700">
            {contract ? 'Salvar' : 'Criar Contrato'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Contracts() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('todos')
  const [showModal, setShowModal] = useState(false)
  const [editContract, setEditContract] = useState<Contract | undefined>()
  const [confirmDelete, setConfirmDelete] = useState<Contract | null>(null)

  const { data: contracts = [], isLoading } = useQuery<Contract[]>({
    queryKey: ['contracts', statusFilter],
    queryFn: () => api.get('/contracts', { params: statusFilter !== 'todos' ? { status: statusFilter } : {} }).then(r => r.data),
  })

  const { data: customers = [] } = useQuery<any[]>({
    queryKey: ['customers'],
    queryFn: () => api.get('/customers').then(r => r.data),
  })

  const create = useMutation({
    mutationFn: (data: any) => api.post('/contracts', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contracts'] }); setShowModal(false) },
  })

  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => api.put(`/contracts/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contracts'] }); setEditContract(undefined) },
  })

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/contracts/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contracts'] }); setConfirmDelete(null) },
  })

  const filtered = contracts.filter(c =>
    c.numero_contrato?.toLowerCase().includes(search.toLowerCase()) ||
    c.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.descricao?.toLowerCase().includes(search.toLowerCase())
  )

  const mrr = contracts.filter(c => c.status === 'ativo').reduce((s, c) => s + (c.valor_mensal || 0), 0)

  const statusColor = (s: string) => {
    if (s === 'ativo') return 'bg-green-500/20 text-green-400 border-green-500/30'
    if (s === 'suspenso') return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
    return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Contratos</h1>
          <p className="text-gray-400 text-sm mt-1">
            {contracts.filter(c => c.status === 'ativo').length} ativo(s) · MRR: <span className="text-green-400 font-semibold">{fmt(mrr)}</span>
          </p>
        </div>
        <button onClick={() => setShowModal(true)} disabled={customers.length === 0}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
          <span>+</span> Novo Contrato
        </button>
      </div>

      {customers.length === 0 && (
        <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-400 text-sm">
          Cadastre ao menos um cliente antes de criar contratos.
        </div>
      )}

      <div className="flex gap-3 mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por número, cliente ou descrição..."
          className="flex-1 max-w-sm bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm placeholder-gray-500" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm">
          <option value="todos">Todos os status</option>
          <option value="ativo">Ativo</option>
          <option value="suspenso">Suspenso</option>
          <option value="encerrado">Encerrado</option>
        </select>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Carregando...</div>
      ) : (
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Número</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Cliente</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Descrição</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Vigência</th>
                <th className="text-right px-4 py-3 text-gray-400 font-medium">Valor/Mês</th>
                <th className="text-center px-4 py-3 text-gray-400 font-medium">Status</th>
                <th className="text-right px-4 py-3 text-gray-400 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-gray-500">
                  {search ? 'Nenhum contrato encontrado' : 'Nenhum contrato cadastrado.'}
                </td></tr>
              )}
              {filtered.map(c => (
                <tr key={c.id} className="border-b border-gray-700/50 hover:bg-gray-700/20">
                  <td className="px-4 py-3 text-blue-400 font-mono text-xs">{c.numero_contrato}</td>
                  <td className="px-4 py-3">
                    <p className="text-white">{c.customer_name}</p>
                    {c.customer_cnpj && <p className="text-xs text-gray-400">{c.customer_cnpj}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-300 max-w-xs truncate">{c.descricao || '-'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {fmtDate(c.data_inicio)}<br />
                    {c.data_fim ? `até ${fmtDate(c.data_fim)}` : 'Indeterminado'}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-white">{fmt(c.valor_mensal)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${statusColor(c.status)}`}>{c.status}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setEditContract(c)}
                        className="text-xs px-3 py-1 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600">Editar</button>
                      <button onClick={() => setConfirmDelete(c)}
                        className="text-xs px-3 py-1 bg-red-600/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-600/30">Excluir</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && <ContractModal customers={customers} onClose={() => setShowModal(false)} onSave={data => create.mutate(data)} />}
      {editContract && <ContractModal contract={editContract} customers={customers} onClose={() => setEditContract(undefined)} onSave={data => update.mutate({ id: editContract.id, data })} />}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold text-white mb-2">Confirmar Exclusão</h3>
            <p className="text-gray-400 text-sm mb-5">
              Excluir contrato <strong className="text-white">{confirmDelete.numero_contrato}</strong>?
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 py-2 rounded-lg border border-gray-600 text-gray-300 text-sm">Cancelar</button>
              <button onClick={() => remove.mutate(confirmDelete.id)} className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700">Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

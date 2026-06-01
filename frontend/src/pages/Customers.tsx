import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'

interface Customer {
  id: number
  razao_social: string
  cnpj: string
  email: string
  telefone: string
  endereco: string
  cidade: string
  estado: string
  cep: string
  contato_nome: string
  contato_email: string
  contato_telefone: string
  observacoes: string
  total_contracts: number
  created_at: string
}

const emptyForm = {
  razao_social: '', cnpj: '', email: '', telefone: '',
  endereco: '', cidade: '', estado: '', cep: '',
  contato_nome: '', contato_email: '', contato_telefone: '', observacoes: '',
}

function CustomerModal({ customer, onClose, onSave }: { customer?: Customer; onClose: () => void; onSave: (data: any) => void }) {
  const [form, setForm] = useState(customer ? {
    razao_social: customer.razao_social || '', cnpj: customer.cnpj || '', email: customer.email || '',
    telefone: customer.telefone || '', endereco: customer.endereco || '', cidade: customer.cidade || '',
    estado: customer.estado || '', cep: customer.cep || '', contato_nome: customer.contato_nome || '',
    contato_email: customer.contato_email || '', contato_telefone: customer.contato_telefone || '',
    observacoes: customer.observacoes || '',
  } : { ...emptyForm })

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-white mb-5">{customer ? 'Editar Cliente' : 'Novo Cliente'}</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs text-gray-400 mb-1 block">Razão Social *</label>
              <input value={form.razao_social} onChange={e => set('razao_social', e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">CNPJ</label>
              <input value={form.cnpj} onChange={e => set('cnpj', e.target.value)} placeholder="00.000.000/0000-00"
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">E-mail</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Telefone</label>
              <input value={form.telefone} onChange={e => set('telefone', e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">CEP</label>
              <input value={form.cep} onChange={e => set('cep', e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-gray-400 mb-1 block">Endereço</label>
              <input value={form.endereco} onChange={e => set('endereco', e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Cidade</label>
              <input value={form.cidade} onChange={e => set('cidade', e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Estado</label>
              <input value={form.estado} onChange={e => set('estado', e.target.value)} maxLength={2} placeholder="SP"
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
          </div>

          <div className="border-t border-gray-700 pt-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Contato Principal</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Nome</label>
                <input value={form.contato_nome} onChange={e => set('contato_nome', e.target.value)}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">E-mail</label>
                <input type="email" value={form.contato_email} onChange={e => set('contato_email', e.target.value)}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Telefone</label>
                <input value={form.contato_telefone} onChange={e => set('contato_telefone', e.target.value)}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">Observações</label>
            <textarea value={form.observacoes} onChange={e => set('observacoes', e.target.value)} rows={3}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm resize-none" />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-gray-600 text-gray-300 text-sm hover:bg-gray-800">Cancelar</button>
          <button onClick={() => onSave(form)} className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700">
            {customer ? 'Salvar' : 'Criar Cliente'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Customers() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editCustomer, setEditCustomer] = useState<Customer | undefined>()
  const [confirmDelete, setConfirmDelete] = useState<Customer | null>(null)

  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ['customers'],
    queryFn: () => api.get('/customers').then(r => r.data),
  })

  const create = useMutation({
    mutationFn: (data: any) => api.post('/customers', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); setShowModal(false) },
  })

  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => api.put(`/customers/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); setEditCustomer(undefined) },
  })

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/customers/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); setConfirmDelete(null) },
  })

  const filtered = customers.filter(c =>
    c.razao_social?.toLowerCase().includes(search.toLowerCase()) ||
    c.cnpj?.includes(search) ||
    c.email?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Clientes</h1>
          <p className="text-gray-400 text-sm mt-1">{customers.length} cliente(s) cadastrado(s)</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 flex items-center gap-2">
          <span>+</span> Novo Cliente
        </button>
      </div>

      <div className="mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por razão social, CNPJ ou e-mail..."
          className="w-full max-w-md bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm placeholder-gray-500" />
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Carregando...</div>
      ) : (
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Razão Social</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">CNPJ</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">E-mail</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Telefone</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Cidade/UF</th>
                <th className="text-center px-4 py-3 text-gray-400 font-medium">Contratos</th>
                <th className="text-right px-4 py-3 text-gray-400 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-gray-500">
                  {search ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado. Clique em "Novo Cliente" para começar.'}
                </td></tr>
              )}
              {filtered.map(c => (
                <tr key={c.id} className="border-b border-gray-700/50 hover:bg-gray-700/20">
                  <td className="px-4 py-3">
                    <p className="text-white font-medium">{c.razao_social}</p>
                    {c.contato_nome && <p className="text-xs text-gray-400">{c.contato_nome}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-300">{c.cnpj || '-'}</td>
                  <td className="px-4 py-3 text-gray-300">{c.email || '-'}</td>
                  <td className="px-4 py-3 text-gray-300">{c.telefone || '-'}</td>
                  <td className="px-4 py-3 text-gray-300">
                    {c.cidade ? `${c.cidade}/${c.estado}` : '-'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-xs px-2 py-1 bg-blue-500/20 text-blue-400 rounded-full border border-blue-500/30">
                      {c.total_contracts || 0}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setEditCustomer(c)}
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

      {showModal && <CustomerModal onClose={() => setShowModal(false)} onSave={data => create.mutate(data)} />}
      {editCustomer && <CustomerModal customer={editCustomer} onClose={() => setEditCustomer(undefined)} onSave={data => update.mutate({ id: editCustomer.id, data })} />}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold text-white mb-2">Confirmar Exclusão</h3>
            <p className="text-gray-400 text-sm mb-5">
              Tem certeza que deseja excluir <strong className="text-white">{confirmDelete.razao_social}</strong>?
              Esta ação não pode ser desfeita.
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

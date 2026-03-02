import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usersApi } from '../services/api'
import { useAuth } from '../store/auth'
import { Users as UsersIcon, Plus, Trash2, X, Loader2, Shield, Eye, Edit3 } from 'lucide-react'

const roleLabel: Record<string, string> = { admin: 'Administrador', operator: 'Operador', viewer: 'Visualizador' }
const roleCls: Record<string, string> = {
  admin: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  operator: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  viewer: 'text-gray-400 bg-gray-500/10 border-gray-500/20',
}

export default function Users() {
  const qc = useQueryClient()
  const { user: me } = useAuth()
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'operator' })

  const { data: users = [], isLoading } = useQuery({ queryKey: ['users'], queryFn: () => usersApi.list().then(r => r.data) })

  const create = useMutation({
    mutationFn: (d: any) => usersApi.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setShowModal(false); setForm({ name: '', email: '', password: '', role: 'operator' }) },
  })
  const del = useMutation({
    mutationFn: (id: string) => usersApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })

  const canManage = me?.role === 'admin' || me?.role === 'superadmin'

  return (
    <div className="p-6 space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Usuários</h1>
          <p className="text-gray-500 text-sm mt-0.5">{users.length} usuários na organização</p>
        </div>
        {canManage && (
          <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2"><Plus size={16} /> Novo Usuário</button>
        )}
      </div>

      {/* Níveis de acesso */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { role: 'admin', icon: Shield, desc: 'Acesso total: gerenciar usuários, dispositivos, configurações' },
          { role: 'operator', icon: Edit3, desc: 'Pode adicionar/editar dispositivos e criar automações' },
          { role: 'viewer', icon: Eye, desc: 'Somente visualização de dados e alertas' },
        ].map(({ role, icon: Icon, desc }) => (
          <div key={role} className={`card p-4 border ${roleCls[role]}`}>
            <div className="flex items-center gap-2 mb-2">
              <Icon size={16} />
              <span className="font-semibold text-sm">{roleLabel[role]}</span>
            </div>
            <p className="text-xs opacity-70">{desc}</p>
          </div>
        ))}
      </div>

      {/* Tabela */}
      {isLoading ? (
        <div className="card p-8 text-center text-gray-600"><Loader2 size={24} className="mx-auto animate-spin mb-2" /><p>Carregando...</p></div>
      ) : users.length === 0 ? (
        <div className="card p-12 text-center">
          <UsersIcon size={40} className="mx-auto mb-4 text-gray-700" />
          <p className="text-gray-500">Nenhum usuário</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-gray-800">
              <tr>
                {['Nome', 'E-mail', 'Perfil', 'Criado em', ''].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {users.map((u: any) => (
                <tr key={u.id} className="hover:bg-gray-800/30 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm font-bold text-gray-300">
                        {u.name?.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-gray-200">{u.name}</span>
                      {u.id === me?.id && <span className="text-xs text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded">Você</span>}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-gray-400 text-sm">{u.email}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${roleCls[u.role] || roleCls.viewer}`}>{roleLabel[u.role] || u.role}</span>
                  </td>
                  <td className="px-5 py-3 text-gray-500 text-sm">{new Date(u.created_at).toLocaleDateString('pt-BR')}</td>
                  <td className="px-5 py-3">
                    {canManage && u.id !== me?.id && (
                      <button onClick={() => { if (confirm(`Remover ${u.name}?`)) del.mutate(u.id) }} className="p-1.5 text-gray-600 hover:text-red-400 transition-colors"><Trash2 size={14} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <h3 className="font-semibold text-white">Novo Usuário</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-300"><X size={20} /></button>
            </div>
            <form onSubmit={e => { e.preventDefault(); create.mutate(form) }} className="p-6 space-y-4">
              <div>
                <label className="label">Nome</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required className="input" placeholder="João Silva" />
              </div>
              <div>
                <label className="label">E-mail</label>
                <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} required className="input" placeholder="joao@empresa.com" />
              </div>
              <div>
                <label className="label">Senha inicial</label>
                <input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} required minLength={8} className="input" placeholder="Mínimo 8 caracteres" />
              </div>
              <div>
                <label className="label">Perfil de acesso</label>
                <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} className="input">
                  <option value="viewer">Visualizador</option>
                  <option value="operator">Operador</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
              {create.error && <p className="text-red-400 text-sm">{(create.error as any).response?.data?.error || 'Erro'}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" disabled={create.isPending} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {create.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Criar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

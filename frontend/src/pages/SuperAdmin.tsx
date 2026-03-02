import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { superadminApi } from '../services/api'
import { Shield, Plus, Edit, X, Loader2, Building2, Users, Cpu } from 'lucide-react'

const planCls: Record<string, string> = {
  free: 'text-gray-400 bg-gray-500/10 border-gray-500/20',
  starter: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  pro: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  enterprise: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
}

export default function SuperAdmin() {
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState({ name: '', adminEmail: '', adminName: '', adminPassword: '', plan: 'starter', maxDevices: 50, maxUsers: 10 })

  const { data: tenants = [], isLoading } = useQuery({ queryKey: ['tenants'], queryFn: () => superadminApi.tenants().then(r => r.data) })

  const create = useMutation({
    mutationFn: (d: any) => superadminApi.createTenant(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tenants'] }); setShowModal(false) },
  })
  const update = useMutation({
    mutationFn: ({ id, d }: any) => superadminApi.updateTenant(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tenants'] }); setEditing(null) },
  })

  const openEdit = (t: any) => {
    setEditing(t)
    setForm({ ...form, plan: t.plan, maxDevices: t.max_devices, maxUsers: t.max_users, name: t.name, adminEmail: '', adminName: '', adminPassword: '' })
  }

  const totalDevices = tenants.reduce((s: number, t: any) => s + (parseInt(t.device_count) || 0), 0)
  const totalUsers = tenants.reduce((s: number, t: any) => s + (parseInt(t.user_count) || 0), 0)

  return (
    <div className="p-6 space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2"><Shield size={24} className="text-purple-400" /> Super Admin</h1>
          <p className="text-gray-500 text-sm mt-0.5">Gestão de organizações e planos</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2"><Plus size={16} /> Nova Organização</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Organizações', value: tenants.length, icon: Building2, cls: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
          { label: 'Total Usuários', value: totalUsers, icon: Users, cls: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' },
          { label: 'Total Dispositivos', value: totalDevices, icon: Cpu, cls: 'text-green-400 bg-green-500/10 border-green-500/20' },
        ].map(({ label, value, icon: Icon, cls }) => (
          <div key={label} className="card p-5">
            <div className={`inline-flex p-2 rounded-lg border mb-3 ${cls}`}><Icon size={18} /></div>
            <div className="text-2xl font-bold text-white">{value}</div>
            <div className="text-xs text-gray-400 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Tabela de tenants */}
      {isLoading ? (
        <div className="card p-8 text-center text-gray-600"><Loader2 size={24} className="mx-auto animate-spin mb-2" /></div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-gray-800">
              <tr>
                {['Organização', 'Plano', 'Dispositivos', 'Usuários', 'Criada em', ''].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {tenants.map((t: any) => (
                <tr key={t.id} className="hover:bg-gray-800/30 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-gray-700 flex items-center justify-center text-sm font-bold text-gray-300">{t.name?.charAt(0)}</div>
                      <div>
                        <p className="font-medium text-gray-200">{t.name}</p>
                        <p className="text-xs text-gray-500">{t.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${planCls[t.plan] || planCls.free}`}>{t.plan}</span>
                  </td>
                  <td className="px-5 py-3 text-gray-400 text-sm">{t.device_count || 0} / {t.max_devices}</td>
                  <td className="px-5 py-3 text-gray-400 text-sm">{t.user_count || 0} / {t.max_users}</td>
                  <td className="px-5 py-3 text-gray-500 text-sm">{new Date(t.created_at).toLocaleDateString('pt-BR')}</td>
                  <td className="px-5 py-3">
                    <button onClick={() => openEdit(t)} className="p-1.5 text-gray-600 hover:text-cyan-400 transition-colors"><Edit size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Criar */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md my-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <h3 className="font-semibold text-white">Nova Organização</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-300"><X size={20} /></button>
            </div>
            <form onSubmit={e => { e.preventDefault(); create.mutate(form) }} className="p-6 space-y-4">
              <div><label className="label">Nome da organização</label><input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required className="input" placeholder="Empresa XYZ" /></div>
              <div><label className="label">E-mail do admin</label><input type="email" value={form.adminEmail} onChange={e => setForm(p => ({ ...p, adminEmail: e.target.value }))} required className="input" /></div>
              <div><label className="label">Nome do admin</label><input value={form.adminName} onChange={e => setForm(p => ({ ...p, adminName: e.target.value }))} required className="input" /></div>
              <div><label className="label">Senha do admin</label><input type="password" value={form.adminPassword} onChange={e => setForm(p => ({ ...p, adminPassword: e.target.value }))} required minLength={8} className="input" /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="label">Plano</label>
                  <select value={form.plan} onChange={e => setForm(p => ({ ...p, plan: e.target.value }))} className="input">
                    {['free', 'starter', 'pro', 'enterprise'].map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div><label className="label">Máx. Disp.</label><input type="number" value={form.maxDevices} onChange={e => setForm(p => ({ ...p, maxDevices: +e.target.value }))} className="input" /></div>
                <div><label className="label">Máx. Users</label><input type="number" value={form.maxUsers} onChange={e => setForm(p => ({ ...p, maxUsers: +e.target.value }))} className="input" /></div>
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

      {/* Modal Editar */}
      {editing && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <h3 className="font-semibold text-white">Editar: {editing.name}</h3>
              <button onClick={() => setEditing(null)} className="text-gray-500 hover:text-gray-300"><X size={20} /></button>
            </div>
            <form onSubmit={e => { e.preventDefault(); update.mutate({ id: editing.id, d: { plan: form.plan, maxDevices: form.maxDevices, maxUsers: form.maxUsers } }) }} className="p-6 space-y-4">
              <div><label className="label">Plano</label>
                <select value={form.plan} onChange={e => setForm(p => ({ ...p, plan: e.target.value }))} className="input">
                  {['free', 'starter', 'pro', 'enterprise'].map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Máx. Dispositivos</label><input type="number" value={form.maxDevices} onChange={e => setForm(p => ({ ...p, maxDevices: +e.target.value }))} className="input" /></div>
                <div><label className="label">Máx. Usuários</label><input type="number" value={form.maxUsers} onChange={e => setForm(p => ({ ...p, maxUsers: +e.target.value }))} className="input" /></div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditing(null)} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" disabled={update.isPending} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {update.isPending ? <Loader2 size={16} className="animate-spin" /> : <Edit size={16} />} Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

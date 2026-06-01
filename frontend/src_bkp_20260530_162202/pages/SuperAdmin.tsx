import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { superadminApi } from '../services/api'
import {
  Shield, Plus, Edit, X, Loader2, Building2, Users, Cpu,
  ToggleLeft, ToggleRight, Eye, Trash2, Camera, MapPin,
  Wifi, CheckCircle, XCircle, AlertTriangle, RefreshCw,
  ChevronDown, ChevronUp, Search, Filter
} from 'lucide-react'

const PLANS = [
  { value: 'basic', label: 'Basic', color: 'text-gray-400 bg-gray-500/10 border-gray-500/20', maxDevices: 10, maxUsers: 5 },
  { value: 'starter', label: 'Starter', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20', maxDevices: 50, maxUsers: 10 },
  { value: 'pro', label: 'Pro', color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20', maxDevices: 200, maxUsers: 30 },
  { value: 'enterprise', label: 'Enterprise', color: 'text-purple-400 bg-purple-500/10 border-purple-500/20', maxDevices: 9999, maxUsers: 9999 },
]

const planInfo = (plan: string) => PLANS.find(p => p.value === plan) || PLANS[0]

const UsageBar = ({ used, max }: { used: number; max: number }) => {
  const pct = max > 0 ? Math.min((used / max) * 100, 100) : 0
  const color = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-yellow-500' : 'bg-cyan-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-14 text-right">{used} / {max === 9999 ? '∞' : max}</span>
    </div>
  )
}

const emptyForm = {
  name: '', adminEmail: '', adminName: '', adminPassword: '',
  plan: 'starter', maxDevices: 50, maxUsers: 10,
  phone: '', notes: ''
}

export default function SuperAdmin() {
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [viewTenant, setViewTenant] = useState<any>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [search, setSearch] = useState('')
  const [filterPlan, setFilterPlan] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [expandedTenant, setExpandedTenant] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<any>(null)

  const { data: tenants = [], isLoading, refetch } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => superadminApi.tenants().then(r => r.data),
    refetchInterval: 30000,
  })

  const { data: tenantDetail } = useQuery({
    queryKey: ['tenant-detail', viewTenant?.id],
    queryFn: () => viewTenant ? superadminApi.getTenantDetail(viewTenant.id).then(r => r.data) : null,
    enabled: !!viewTenant,
  })

  const create = useMutation({
    mutationFn: (d: any) => superadminApi.createTenant(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tenants'] }); setShowModal(false); setForm({ ...emptyForm }) },
  })

  const update = useMutation({
    mutationFn: ({ id, d }: any) => superadminApi.updateTenant(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tenants'] }); setEditing(null) },
  })

  const toggleActive = useMutation({
    mutationFn: ({ id, is_active }: any) => superadminApi.updateTenant(id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenants'] }),
  })

  const deleteTenant = useMutation({
    mutationFn: (id: string) => superadminApi.deleteTenant(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tenants'] }); setConfirmDelete(null) },
  })

  const openEdit = (t: any) => {
    setEditing(t)
    setForm({ ...emptyForm, plan: t.plan, maxDevices: t.max_devices, maxUsers: t.max_users, name: t.name, phone: t.phone || '' })
  }

  const selectPlan = (plan: string) => {
    const p = planInfo(plan)
    setForm(prev => ({ ...prev, plan, maxDevices: p.maxDevices, maxUsers: p.maxUsers }))
  }

  // Filtros
  const filtered = tenants.filter((t: any) => {
    const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.email?.toLowerCase().includes(search.toLowerCase()) || t.slug?.toLowerCase().includes(search.toLowerCase())
    const matchPlan = filterPlan === 'all' || t.plan === filterPlan
    const matchStatus = filterStatus === 'all' || (filterStatus === 'active' ? t.is_active : !t.is_active)
    return matchSearch && matchPlan && matchStatus
  })

  const totalDevices = tenants.reduce((s: number, t: any) => s + (parseInt(t.device_count) || 0), 0)
  const totalUsers = tenants.reduce((s: number, t: any) => s + (parseInt(t.user_count) || 0), 0)
  const activeCount = tenants.filter((t: any) => t.is_active).length

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Shield size={22} className="text-purple-400" />
            Super Admin
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">Gestão de organizações, planos e clientes</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => refetch()} className="btn-secondary flex items-center gap-2 px-3 py-2">
            <RefreshCw size={14} />
          </button>
          <button onClick={() => { setForm({ ...emptyForm }); setShowModal(true) }} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Nova Organização
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Organizações', value: tenants.length, icon: Building2, cls: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
          { label: 'Ativas', value: activeCount, icon: CheckCircle, cls: 'text-green-400 bg-green-500/10 border-green-500/20' },
          { label: 'Total Usuários', value: totalUsers, icon: Users, cls: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' },
          { label: 'Total Dispositivos', value: totalDevices, icon: Cpu, cls: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
        ].map(({ label, value, icon: Icon, cls }) => (
          <div key={label} className="card p-5">
            <div className={`inline-flex p-2 rounded-lg border mb-3 ${cls}`}><Icon size={18} /></div>
            <div className="text-2xl font-bold text-white">{value}</div>
            <div className="text-xs text-gray-400 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="card p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar organização..."
            className="input pl-9 py-2 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-gray-500" />
          <select value={filterPlan} onChange={e => setFilterPlan(e.target.value)} className="input py-2 text-sm">
            <option value="all">Todos os planos</option>
            {PLANS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input py-2 text-sm">
          <option value="all">Todos os status</option>
          <option value="active">Ativas</option>
          <option value="inactive">Inativas</option>
        </select>
        {(search || filterPlan !== 'all' || filterStatus !== 'all') && (
          <button onClick={() => { setSearch(''); setFilterPlan('all'); setFilterStatus('all') }} className="text-xs text-gray-500 hover:text-gray-300">
            Limpar filtros
          </button>
        )}
      </div>

      {/* Tabela */}
      {isLoading ? (
        <div className="card p-12 text-center text-gray-600">
          <Loader2 size={28} className="mx-auto animate-spin mb-3" />
          <p className="text-sm">Carregando organizações...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center text-gray-600">
          <Building2 size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhuma organização encontrada</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="border-b border-gray-800">
              <tr>
                {['Organização', 'Plano', 'Dispositivos', 'Usuários', 'Status', 'Criada em', 'Ações'].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {filtered.map((t: any) => {
                const plan = planInfo(t.plan)
                const isExpanded = expandedTenant === t.id
                return (
                  <>
                    <tr key={t.id} className={`hover:bg-gray-800/20 transition-colors ${!t.is_active ? 'opacity-50' : ''}`}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center text-sm font-bold text-gray-200 border border-gray-700">
                            {t.name?.charAt(0)?.toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-gray-200 text-sm">{t.name}</p>
                            <p className="text-xs text-gray-500">{t.slug} · {t.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${plan.color}`}>{plan.label}</span>
                      </td>
                      <td className="px-5 py-3 min-w-32">
                        <UsageBar used={parseInt(t.device_count) || 0} max={t.max_devices} />
                      </td>
                      <td className="px-5 py-3 min-w-32">
                        <UsageBar used={parseInt(t.user_count) || 0} max={t.max_users} />
                      </td>
                      <td className="px-5 py-3">
                        <button
                          onClick={() => toggleActive.mutate({ id: t.id, is_active: !t.is_active })}
                          className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${t.is_active ? 'text-green-400 hover:text-red-400' : 'text-gray-500 hover:text-green-400'}`}
                          title={t.is_active ? 'Clique para suspender' : 'Clique para ativar'}
                        >
                          {t.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                          {t.is_active ? 'Ativa' : 'Suspensa'}
                        </button>
                      </td>
                      <td className="px-5 py-3 text-gray-500 text-sm">
                        {new Date(t.created_at).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setExpandedTenant(isExpanded ? null : t.id)}
                            className="p-1.5 text-gray-600 hover:text-cyan-400 transition-colors"
                            title="Ver detalhes"
                          >
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                          <button
                            onClick={() => openEdit(t)}
                            className="p-1.5 text-gray-600 hover:text-blue-400 transition-colors"
                            title="Editar"
                          >
                            <Edit size={14} />
                          </button>
                          {t.slug !== 'superadmin' && (
                            <button
                              onClick={() => setConfirmDelete(t)}
                              className="p-1.5 text-gray-600 hover:text-red-400 transition-colors"
                              title="Excluir"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Linha expandida com detalhes */}
                    {isExpanded && (
                      <tr key={`${t.id}-detail`} className="bg-gray-900/40">
                        <td colSpan={7} className="px-5 py-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div className="space-y-1">
                              <p className="text-xs text-gray-500 uppercase font-semibold">Identificação</p>
                              <p className="text-gray-300"><span className="text-gray-500">ID:</span> <span className="font-mono text-xs">{t.id.slice(0, 8)}...</span></p>
                              <p className="text-gray-300"><span className="text-gray-500">Slug:</span> {t.slug}</p>
                              {t.phone && <p className="text-gray-300"><span className="text-gray-500">Tel:</span> {t.phone}</p>}
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs text-gray-500 uppercase font-semibold">Limites do Plano</p>
                              <p className="text-gray-300"><span className="text-gray-500">Dispositivos:</span> {t.max_devices === 9999 ? 'Ilimitado' : t.max_devices}</p>
                              <p className="text-gray-300"><span className="text-gray-500">Usuários:</span> {t.max_users === 9999 ? 'Ilimitado' : t.max_users}</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs text-gray-500 uppercase font-semibold">Uso Atual</p>
                              <p className="text-gray-300"><span className="text-gray-500">Dispositivos:</span> {t.device_count || 0}</p>
                              <p className="text-gray-300"><span className="text-gray-500">Usuários:</span> {t.user_count || 0}</p>
                              <p className="text-gray-300"><span className="text-gray-500">Câmeras:</span> {t.camera_count || 0}</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs text-gray-500 uppercase font-semibold">Datas</p>
                              <p className="text-gray-300"><span className="text-gray-500">Criado:</span> {new Date(t.created_at).toLocaleDateString('pt-BR')}</p>
                              <p className="text-gray-300"><span className="text-gray-500">Atualizado:</span> {new Date(t.updated_at).toLocaleDateString('pt-BR')}</p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
          <div className="px-5 py-3 border-t border-gray-800 text-xs text-gray-600">
            {filtered.length} de {tenants.length} organizações
          </div>
        </div>
      )}

      {/* Modal Criar */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg my-4 shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <div>
                <h3 className="font-semibold text-white text-lg">Nova Organização</h3>
                <p className="text-xs text-gray-500 mt-0.5">Cria o tenant e o usuário administrador</p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-300 p-1">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={e => { e.preventDefault(); create.mutate(form) }} className="p-6 space-y-5">

              {/* Dados da organização */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Dados da Organização</p>
                <div className="space-y-3">
                  <div>
                    <label className="label">Nome da organização *</label>
                    <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required className="input" placeholder="Ex: Haras Santa Maria" />
                  </div>
                  <div>
                    <label className="label">Telefone</label>
                    <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className="input" placeholder="(61) 99999-9999" />
                  </div>
                </div>
              </div>

              {/* Dados do admin */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Usuário Administrador</p>
                <div className="space-y-3">
                  <div>
                    <label className="label">Nome do admin *</label>
                    <input value={form.adminName} onChange={e => setForm(p => ({ ...p, adminName: e.target.value }))} required className="input" placeholder="João Silva" />
                  </div>
                  <div>
                    <label className="label">E-mail do admin *</label>
                    <input type="email" value={form.adminEmail} onChange={e => setForm(p => ({ ...p, adminEmail: e.target.value }))} required className="input" placeholder="admin@empresa.com" />
                  </div>
                  <div>
                    <label className="label">Senha do admin *</label>
                    <input type="password" value={form.adminPassword} onChange={e => setForm(p => ({ ...p, adminPassword: e.target.value }))} required minLength={8} className="input" placeholder="Mínimo 8 caracteres" />
                  </div>
                </div>
              </div>

              {/* Plano */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Plano</p>
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {PLANS.map(p => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => selectPlan(p.value)}
                      className={`py-2 px-3 rounded-lg border text-xs font-medium transition-all ${form.plan === p.value ? p.color + ' border-current' : 'text-gray-500 border-gray-700 hover:border-gray-500'}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Máx. Dispositivos</label>
                    <input type="number" value={form.maxDevices} onChange={e => setForm(p => ({ ...p, maxDevices: +e.target.value }))} className="input" min={1} />
                  </div>
                  <div>
                    <label className="label">Máx. Usuários</label>
                    <input type="number" value={form.maxUsers} onChange={e => setForm(p => ({ ...p, maxUsers: +e.target.value }))} className="input" min={1} />
                  </div>
                </div>
              </div>

              {create.error && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <AlertTriangle size={14} className="text-red-400 flex-shrink-0" />
                  <p className="text-red-400 text-sm">{(create.error as any).response?.data?.error || 'Erro ao criar organização'}</p>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" disabled={create.isPending} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {create.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  {create.isPending ? 'Criando...' : 'Criar Organização'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Editar */}
      {editing && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <div>
                <h3 className="font-semibold text-white text-lg">Editar Organização</h3>
                <p className="text-xs text-gray-500 mt-0.5">{editing.name}</p>
              </div>
              <button onClick={() => setEditing(null)} className="text-gray-500 hover:text-gray-300 p-1"><X size={20} /></button>
            </div>
            <form onSubmit={e => {
              e.preventDefault()
              update.mutate({ id: editing.id, d: { plan: form.plan, max_devices: form.maxDevices, max_users: form.maxUsers, phone: form.phone } })
            }} className="p-6 space-y-5">

              <div>
                <label className="label">Telefone</label>
                <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className="input" placeholder="(61) 99999-9999" />
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Plano</p>
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {PLANS.map(p => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => selectPlan(p.value)}
                      className={`py-2 px-3 rounded-lg border text-xs font-medium transition-all ${form.plan === p.value ? p.color + ' border-current' : 'text-gray-500 border-gray-700 hover:border-gray-500'}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Máx. Dispositivos</label>
                    <input type="number" value={form.maxDevices} onChange={e => setForm(p => ({ ...p, maxDevices: +e.target.value }))} className="input" min={1} />
                  </div>
                  <div>
                    <label className="label">Máx. Usuários</label>
                    <input type="number" value={form.maxUsers} onChange={e => setForm(p => ({ ...p, maxUsers: +e.target.value }))} className="input" min={1} />
                  </div>
                </div>
              </div>

              {update.error && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <AlertTriangle size={14} className="text-red-400 flex-shrink-0" />
                  <p className="text-red-400 text-sm">{(update.error as any).response?.data?.error || 'Erro ao atualizar'}</p>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setEditing(null)} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" disabled={update.isPending} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {update.isPending ? <Loader2 size={16} className="animate-spin" /> : <Edit size={16} />}
                  {update.isPending ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Confirmar Exclusão */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-red-500/30 rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/10 rounded-lg border border-red-500/20">
                <AlertTriangle size={20} className="text-red-400" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Confirmar Exclusão</h3>
                <p className="text-xs text-gray-500">Esta ação é irreversível</p>
              </div>
            </div>
            <p className="text-sm text-gray-400">
              Tem certeza que deseja excluir a organização <span className="text-white font-medium">{confirmDelete.name}</span>? Todos os dados serão permanentemente removidos.
            </p>
            {deleteTenant.error && (
              <p className="text-red-400 text-sm">{(deleteTenant.error as any).response?.data?.error || 'Erro ao excluir'}</p>
            )}
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="btn-secondary flex-1">Cancelar</button>
              <button
                onClick={() => deleteTenant.mutate(confirmDelete.id)}
                disabled={deleteTenant.isPending}
                className="flex-1 py-2 px-4 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {deleteTenant.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { routesApi, driversApi } from '../services/api'
import { Link } from 'react-router-dom'
import {
  Route, Plus, Trash2, X, Loader2, MapPin, Upload, Navigation,
  Zap, Clock, Truck, CheckCircle, AlertTriangle, Copy, Check,
  Users, Calendar, BarChart3, Search, ExternalLink, Play
} from 'lucide-react'

const statusCls: Record<string, string> = {
  draft: 'text-gray-400 bg-gray-500/10 border-gray-500/20',
  optimized: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  assigned: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  in_progress: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  completed: 'text-green-400 bg-green-500/10 border-green-500/20',
  cancelled: 'text-red-400 bg-red-500/10 border-red-500/20',
}
const statusLabel: Record<string, string> = {
  draft: 'Rascunho', optimized: 'Otimizada', assigned: 'Atribuída',
  in_progress: 'Em Andamento', completed: 'Concluída', cancelled: 'Cancelada',
}

export default function Routing() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [showImport, setShowImport] = useState<string | null>(null)
  const [showAssign, setShowAssign] = useState<string | null>(null)
  const [showDriverModal, setShowDriverModal] = useState(false)
  const [tab, setTab] = useState<'routes' | 'drivers'>('routes')
  const [copied, setCopied] = useState('')
  const [csvText, setCsvText] = useState('')
  const [createForm, setCreateForm] = useState({ name: '', date: new Date().toISOString().split('T')[0], startAddress: '', endAddress: '', notes: '' })
  const [driverForm, setDriverForm] = useState({ name: '', phone: '', email: '', vehiclePlate: '', vehicleType: 'car' })
  const [statusFilter, setStatusFilter] = useState('')

  const { data: routesData, isLoading: loadingRoutes } = useQuery({
    queryKey: ['routes', statusFilter],
    queryFn: () => routesApi.list({ status: statusFilter || undefined, limit: 50 }).then(r => r.data),
  })
  const { data: drivers = [] } = useQuery({ queryKey: ['drivers'], queryFn: () => driversApi.list().then(r => r.data) })

  const createRoute = useMutation({
    mutationFn: (d: any) => routesApi.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['routes'] }); setShowCreate(false); setCreateForm({ name: '', date: new Date().toISOString().split('T')[0], startAddress: '', endAddress: '', notes: '' }) },
  })
  const deleteRoute = useMutation({
    mutationFn: (id: string) => routesApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['routes'] }),
  })
  const optimizeRoute = useMutation({
    mutationFn: (id: string) => routesApi.optimize(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['routes'] }),
  })
  const importStops = useMutation({
    mutationFn: ({ id, stops }: { id: string; stops: any[] }) => routesApi.importStops(id, stops),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['routes'] }); setShowImport(null); setCsvText('') },
  })
  const assignDriver = useMutation({
    mutationFn: ({ id, driverId }: { id: string; driverId: string }) => routesApi.assign(id, driverId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['routes'] }); setShowAssign(null) },
  })
  const createDriver = useMutation({
    mutationFn: (d: any) => driversApi.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['drivers'] }); setShowDriverModal(false); setDriverForm({ name: '', phone: '', email: '', vehiclePlate: '', vehicleType: 'car' }) },
  })
  const deleteDriver = useMutation({
    mutationFn: (id: string) => driversApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drivers'] }),
  })

  const parseCSV = (text: string) => {
    const lines = text.trim().split('\n')
    if (lines.length < 2) return []
    const header = lines[0].toLowerCase().split(/[,;\t]/).map(h => h.trim())
    return lines.slice(1).map(line => {
      const cols = line.split(/[,;\t]/).map(c => c.trim())
      const obj: any = {}
      header.forEach((h, i) => {
        if (h.includes('endere') || h === 'address' || h === 'endereco') obj.address = cols[i]
        else if (h.includes('complem')) obj.complement = cols[i]
        else if (h.includes('cliente') || h.includes('nome') || h.includes('name') || h.includes('customer')) obj.customerName = cols[i]
        else if (h.includes('telefone') || h.includes('phone') || h.includes('fone') || h.includes('cel')) obj.customerPhone = cols[i]
        else if (h.includes('obs') || h.includes('note') || h.includes('nota')) obj.notes = cols[i]
        else if (h.includes('peso') || h.includes('weight')) obj.weightKg = cols[i]
        else if (h === 'lat' || h === 'latitude') obj.lat = cols[i]
        else if (h === 'lng' || h === 'lon' || h === 'longitude') obj.lng = cols[i]
      })
      if (!obj.address && cols[0]) obj.address = cols[0]
      return obj
    }).filter(o => o.address)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setCsvText(ev.target?.result as string || '')
    reader.readAsText(file)
  }

  const copyLink = (token: string) => {
    const link = `${window.location.origin}/driver/${token}`
    navigator.clipboard.writeText(link)
    setCopied(token)
    setTimeout(() => setCopied(''), 2000)
  }

  const routes = routesData?.routes || []

  return (
    <div className="p-6 space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Roteirizacao</h1>
          <p className="text-gray-500 text-sm mt-0.5">Otimize rotas e envie para seus motoristas</p>
        </div>
        <div className="flex gap-3">
          {tab === 'routes' && <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2"><Plus size={16} /> Nova Rota</button>}
          {tab === 'drivers' && <button onClick={() => setShowDriverModal(true)} className="btn-primary flex items-center gap-2"><Plus size={16} /> Novo Motorista</button>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1 w-fit">
        {[
          { id: 'routes' as const, label: `Rotas (${routesData?.total || 0})`, icon: Route },
          { id: 'drivers' as const, label: `Motoristas (${drivers.length})`, icon: Users },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === t.id ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/20' : 'text-gray-500 hover:text-gray-300'}`}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {/* TAB: ROTAS */}
      {tab === 'routes' && (
        <>
          {/* Filtros */}
          <div className="flex gap-3 flex-wrap">
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input w-auto">
              <option value="">Todos os status</option>
              {Object.entries(statusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>

          {loadingRoutes ? (
            <div className="card p-8 text-center"><Loader2 size={24} className="mx-auto animate-spin text-gray-600" /></div>
          ) : routes.length === 0 ? (
            <div className="card p-12 text-center">
              <Route size={40} className="mx-auto mb-4 text-gray-700" />
              <h3 className="text-lg font-medium text-gray-400 mb-2">Nenhuma rota criada</h3>
              <p className="text-gray-600 text-sm mb-4">Crie uma rota, importe enderecos e otimize o percurso</p>
              <button onClick={() => setShowCreate(true)} className="btn-primary inline-flex items-center gap-2"><Plus size={16} /> Criar Rota</button>
            </div>
          ) : (
            <div className="space-y-3">
              {routes.map((r: any) => (
                <div key={r.id} className="card p-5 hover:border-gray-700 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Link to={`/routing/${r.id}`} className="font-semibold text-gray-200 hover:text-cyan-400 transition-colors text-lg">{r.name}</Link>
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusCls[r.status]}`}>{statusLabel[r.status]}</span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-500 flex-wrap">
                        <span className="flex items-center gap-1"><Calendar size={13} /> {new Date(r.date).toLocaleDateString('pt-BR')}</span>
                        <span className="flex items-center gap-1"><MapPin size={13} /> {r.total_stops} paradas</span>
                        {r.total_distance_km > 0 && <span className="flex items-center gap-1"><Navigation size={13} /> {r.total_distance_km} km</span>}
                        {r.total_duration_min > 0 && <span className="flex items-center gap-1"><Clock size={13} /> {Math.round(r.total_duration_min)} min</span>}
                        {r.driver_name && <span className="flex items-center gap-1"><Truck size={13} /> {r.driver_name} {r.vehicle_plate && `(${r.vehicle_plate})`}</span>}
                        {r.completed_stops > 0 && <span className="flex items-center gap-1"><CheckCircle size={13} /> {r.completed_stops}/{r.total_stops}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      {r.status === 'draft' && r.total_stops === 0 && (
                        <button onClick={() => setShowImport(r.id)} className="btn-secondary text-xs py-1.5 flex items-center gap-1.5"><Upload size={13} /> Importar</button>
                      )}
                      {r.status === 'draft' && r.total_stops > 0 && (
                        <button onClick={() => setShowImport(r.id)} className="btn-secondary text-xs py-1.5 flex items-center gap-1.5"><Upload size={13} /> +Paradas</button>
                      )}
                      {(r.status === 'draft') && r.total_stops >= 2 && (
                        <button onClick={() => optimizeRoute.mutate(r.id)} disabled={optimizeRoute.isPending}
                          className="btn-primary text-xs py-1.5 flex items-center gap-1.5">
                          {optimizeRoute.isPending ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />} Otimizar
                        </button>
                      )}
                      {(r.status === 'optimized' || r.status === 'draft') && r.total_stops > 0 && (
                        <button onClick={() => setShowAssign(r.id)} className="btn-secondary text-xs py-1.5 flex items-center gap-1.5"><Truck size={13} /> Atribuir</button>
                      )}
                      {r.driver_token && (r.status === 'assigned' || r.status === 'in_progress') && (
                        <button onClick={() => copyLink(r.driver_token)} className="btn-secondary text-xs py-1.5 flex items-center gap-1.5">
                          {copied === r.driver_token ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
                          Link Motorista
                        </button>
                      )}
                      <Link to={`/routing/${r.id}`} className="btn-secondary text-xs py-1.5 flex items-center gap-1.5"><ExternalLink size={13} /> Detalhes</Link>
                      {r.status === 'draft' && (
                        <button onClick={() => { if (confirm('Deletar rota?')) deleteRoute.mutate(r.id) }}
                          className="p-1.5 text-gray-600 hover:text-red-400 transition-colors"><Trash2 size={14} /></button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* TAB: MOTORISTAS */}
      {tab === 'drivers' && (
        <div className="space-y-3">
          {drivers.length === 0 ? (
            <div className="card p-12 text-center">
              <Truck size={40} className="mx-auto mb-4 text-gray-700" />
              <h3 className="text-lg font-medium text-gray-400 mb-2">Nenhum motorista cadastrado</h3>
              <button onClick={() => setShowDriverModal(true)} className="btn-primary inline-flex items-center gap-2"><Plus size={16} /> Cadastrar Motorista</button>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full">
                <thead className="border-b border-gray-800">
                  <tr>
                    {['Motorista', 'Telefone', 'Veiculo', 'Placa', 'Rotas Ativas', ''].map(h => (
                      <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {drivers.map((d: any) => (
                    <tr key={d.id} className="hover:bg-gray-800/30">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: d.avatar_color }}>
                            {d.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-gray-200">{d.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-gray-400 text-sm">{d.phone || '-'}</td>
                      <td className="px-5 py-3 text-gray-400 text-sm capitalize">{d.vehicle_type}</td>
                      <td className="px-5 py-3 text-gray-400 text-sm font-mono">{d.vehicle_plate || '-'}</td>
                      <td className="px-5 py-3 text-gray-400 text-sm">{d.active_routes || 0}</td>
                      <td className="px-5 py-3">
                        <button onClick={() => { if (confirm(`Remover ${d.name}?`)) deleteDriver.mutate(d.id) }}
                          className="p-1.5 text-gray-600 hover:text-red-400"><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL: Criar Rota */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <h3 className="font-semibold text-white">Nova Rota</h3>
              <button onClick={() => setShowCreate(false)} className="text-gray-500 hover:text-gray-300"><X size={20} /></button>
            </div>
            <form onSubmit={e => { e.preventDefault(); createRoute.mutate(createForm) }} className="p-6 space-y-4">
              <div>
                <label className="label">Nome da rota *</label>
                <input value={createForm.name} onChange={e => setCreateForm(p => ({ ...p, name: e.target.value }))} required className="input" placeholder="Ex: Entregas Zona Sul - Segunda" />
              </div>
              <div>
                <label className="label">Data</label>
                <input type="date" value={createForm.date} onChange={e => setCreateForm(p => ({ ...p, date: e.target.value }))} className="input" />
              </div>
              <div>
                <label className="label">Endereco de partida</label>
                <input value={createForm.startAddress} onChange={e => setCreateForm(p => ({ ...p, startAddress: e.target.value }))} className="input" placeholder="Ex: Rua Augusta, 100 - Sao Paulo, SP" />
              </div>
              <div>
                <label className="label">Endereco de retorno (opcional)</label>
                <input value={createForm.endAddress} onChange={e => setCreateForm(p => ({ ...p, endAddress: e.target.value }))} className="input" placeholder="Mesmo do ponto de partida se vazio" />
              </div>
              <div>
                <label className="label">Observacoes</label>
                <input value={createForm.notes} onChange={e => setCreateForm(p => ({ ...p, notes: e.target.value }))} className="input" placeholder="Notas sobre a rota..." />
              </div>
              {createRoute.error && <p className="text-red-400 text-sm">{(createRoute.error as any).response?.data?.error || 'Erro'}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" disabled={createRoute.isPending} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {createRoute.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Criar Rota
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Importar Paradas */}
      {showImport && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl my-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <h3 className="font-semibold text-white">Importar Enderecos</h3>
              <button onClick={() => { setShowImport(null); setCsvText('') }} className="text-gray-500 hover:text-gray-300"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 text-sm text-blue-400">
                <p className="font-semibold mb-1">Formato aceito: CSV (separado por virgula, ponto-e-virgula ou tab)</p>
                <p className="text-xs text-blue-400/70">Colunas: <code>endereco, complemento, cliente, telefone, observacao, peso, lat, lng</code></p>
                <p className="text-xs text-blue-400/70 mt-1">Minimo: coluna <code>endereco</code>. Os enderecos serao geocodificados automaticamente.</p>
              </div>
              <div>
                <label className="label">Upload de arquivo CSV</label>
                <input type="file" accept=".csv,.txt,.tsv" onChange={handleFileUpload} className="input" />
              </div>
              <div>
                <label className="label">Ou cole os dados aqui (CSV)</label>
                <textarea value={csvText} onChange={e => setCsvText(e.target.value)} rows={8} className="input font-mono text-xs"
                  placeholder={`endereco;cliente;telefone\nRua Augusta 100, Sao Paulo;Joao Silva;11999999999\nAv Paulista 1000, Sao Paulo;Maria Santos;11988888888`} />
              </div>
              {csvText && (
                <div className="bg-gray-800 rounded-lg p-3">
                  <p className="text-xs text-gray-400 mb-1">{parseCSV(csvText).length} enderecos detectados</p>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {parseCSV(csvText).slice(0, 10).map((s: any, i: number) => (
                      <p key={i} className="text-xs text-gray-300"><span className="text-gray-600">{i + 1}.</span> {s.address} {s.customerName && <span className="text-cyan-400">({s.customerName})</span>}</p>
                    ))}
                    {parseCSV(csvText).length > 10 && <p className="text-xs text-gray-600">... e mais {parseCSV(csvText).length - 10}</p>}
                  </div>
                </div>
              )}
              {importStops.error && <p className="text-red-400 text-sm">{(importStops.error as any).response?.data?.error || 'Erro na importação'}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowImport(null); setCsvText('') }} className="btn-secondary flex-1">Cancelar</button>
                <button
                  onClick={() => { const stops = parseCSV(csvText); if (stops.length > 0) importStops.mutate({ id: showImport, stops }) }}
                  disabled={importStops.isPending || !csvText || parseCSV(csvText).length === 0}
                  className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {importStops.isPending ? <><Loader2 size={16} className="animate-spin" /> Importando e geocodificando...</> : <><Upload size={16} /> Importar {parseCSV(csvText).length} enderecos</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Atribuir Motorista */}
      {showAssign && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <h3 className="font-semibold text-white">Atribuir Motorista</h3>
              <button onClick={() => setShowAssign(null)} className="text-gray-500 hover:text-gray-300"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-3">
              {drivers.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-gray-500 mb-2">Nenhum motorista cadastrado</p>
                  <button onClick={() => { setShowAssign(null); setTab('drivers'); setShowDriverModal(true) }} className="btn-primary text-sm">Cadastrar Motorista</button>
                </div>
              ) : drivers.map((d: any) => (
                <button key={d.id} onClick={() => assignDriver.mutate({ id: showAssign, driverId: d.id })}
                  disabled={assignDriver.isPending}
                  className="w-full flex items-center gap-3 p-4 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-cyan-500/30 transition-all text-left">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold" style={{ backgroundColor: d.avatar_color }}>
                    {d.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-200">{d.name}</p>
                    <p className="text-xs text-gray-500">{d.vehicle_type} {d.vehicle_plate && `· ${d.vehicle_plate}`} {d.phone && `· ${d.phone}`}</p>
                  </div>
                  <Truck size={16} className="text-gray-600" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Novo Motorista */}
      {showDriverModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <h3 className="font-semibold text-white">Novo Motorista</h3>
              <button onClick={() => setShowDriverModal(false)} className="text-gray-500 hover:text-gray-300"><X size={20} /></button>
            </div>
            <form onSubmit={e => { e.preventDefault(); createDriver.mutate(driverForm) }} className="p-6 space-y-4">
              <div>
                <label className="label">Nome *</label>
                <input value={driverForm.name} onChange={e => setDriverForm(p => ({ ...p, name: e.target.value }))} required className="input" placeholder="Nome completo" />
              </div>
              <div>
                <label className="label">Telefone (WhatsApp)</label>
                <input value={driverForm.phone} onChange={e => setDriverForm(p => ({ ...p, phone: e.target.value }))} className="input" placeholder="+5511999999999" />
              </div>
              <div>
                <label className="label">Email</label>
                <input type="email" value={driverForm.email} onChange={e => setDriverForm(p => ({ ...p, email: e.target.value }))} className="input" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Placa</label>
                  <input value={driverForm.vehiclePlate} onChange={e => setDriverForm(p => ({ ...p, vehiclePlate: e.target.value }))} className="input" placeholder="ABC-1234" />
                </div>
                <div>
                  <label className="label">Veiculo</label>
                  <select value={driverForm.vehicleType} onChange={e => setDriverForm(p => ({ ...p, vehicleType: e.target.value }))} className="input">
                    <option value="car">Carro</option>
                    <option value="motorcycle">Moto</option>
                    <option value="truck">Caminhao</option>
                    <option value="van">Van</option>
                    <option value="bicycle">Bicicleta</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowDriverModal(false)} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" disabled={createDriver.isPending} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {createDriver.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Cadastrar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

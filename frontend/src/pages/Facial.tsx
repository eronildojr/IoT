import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { ScanFace, Plus, Trash2, Edit2, X, Upload, Eye, Shield, ShieldOff, Users, Activity, Camera, Search, Filter } from 'lucide-react'

interface Person {
  id: number
  name: string
  role: string | null
  department: string | null
  photo_url: string | null
  access_level: 'allowed' | 'blocked' | 'vip'
  notes: string | null
  created_at: string
}

interface FacialEvent {
  id: number
  event_type: 'recognized' | 'unknown' | 'blocked'
  confidence: number | null
  snapshot_url: string | null
  face_crop_url: string | null
  location: string | null
  detected_at: string
  person_name: string | null
  person_role: string | null
  access_level: string | null
  camera_name: string | null
}

interface Stats {
  total_persons: string
  total_events: string
  recognized: string
  unknown_faces: string
  blocked: string
  last_24h: string
}

const ACCESS_LABELS: Record<string, { label: string; color: string }> = {
  allowed: { label: 'Permitido', color: 'text-green-400 bg-green-500/10 border-green-500/30' },
  blocked: { label: 'Bloqueado', color: 'text-red-400 bg-red-500/10 border-red-500/30' },
  vip:     { label: 'VIP',       color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30' },
}

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  recognized: { label: 'Reconhecido', color: 'text-green-400 bg-green-500/10 border-green-500/30' },
  unknown:    { label: 'Desconhecido', color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30' },
  blocked:    { label: 'Bloqueado',   color: 'text-red-400 bg-red-500/10 border-red-500/30' },
}

export default function Facial() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'persons' | 'events' | 'stats'>('persons')
  const [showModal, setShowModal] = useState(false)
  const [editPerson, setEditPerson] = useState<Person | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [eventFilter, setEventFilter] = useState('all')
  const [previewEvent, setPreviewEvent] = useState<FacialEvent | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', role: '', department: '', access_level: 'allowed', notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const { data: statsData } = useQuery<Stats>({
    queryKey: ['facial-stats'],
    queryFn: () => api.get('/facial/stats').then(r => r.data),
    refetchInterval: 30000,
  })

  const { data: personsData, isLoading: loadingPersons } = useQuery<{ persons: Person[] }>({
    queryKey: ['facial-persons'],
    queryFn: () => api.get('/facial/persons').then(r => r.data),
  })

  const { data: eventsData, isLoading: loadingEvents } = useQuery<{ events: FacialEvent[]; total: number }>({
    queryKey: ['facial-events', eventFilter],
    queryFn: () => api.get(`/facial/events?limit=100${eventFilter !== 'all' ? `&event_type=${eventFilter}` : ''}`).then(r => r.data),
    enabled: tab === 'events',
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/facial/persons/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['facial-persons'] }),
  })

  const deleteEventMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/facial/events/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['facial-events'] }),
  })

  const openCreate = () => {
    setEditPerson(null)
    setForm({ name: '', role: '', department: '', access_level: 'allowed', notes: '' })
    setPhotoFile(null)
    setPhotoPreview(null)
    setError('')
    setShowModal(true)
  }

  const openEdit = (p: Person) => {
    setEditPerson(p)
    setForm({ name: p.name, role: p.role || '', department: p.department || '', access_level: p.access_level, notes: p.notes || '' })
    setPhotoFile(null)
    setPhotoPreview(p.photo_url || null)
    setError('')
    setShowModal(true)
  }

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    const reader = new FileReader()
    reader.onload = ev => setPhotoPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Nome é obrigatório'); return }
    setSaving(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('name', form.name)
      formData.append('role', form.role)
      formData.append('department', form.department)
      formData.append('access_level', form.access_level)
      formData.append('notes', form.notes)
      if (photoFile) formData.append('photo', photoFile)

      if (editPerson) {
        await api.put(`/facial/persons/${editPerson.id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      } else {
        await api.post('/facial/persons', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      }
      qc.invalidateQueries({ queryKey: ['facial-persons'] })
      qc.invalidateQueries({ queryKey: ['facial-stats'] })
      setShowModal(false)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const filteredPersons = (personsData?.persons || []).filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.department || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.role || '').toLowerCase().includes(searchTerm.toLowerCase())
  )

  const stats = statsData

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
            <ScanFace className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Reconhecimento Facial</h1>
            <p className="text-sm text-gray-400">Gestão de pessoas e controle de acesso por biometria facial</p>
          </div>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors">
          <Plus size={16} />
          Cadastrar Pessoa
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Pessoas', value: stats.total_persons, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
            { label: 'Eventos', value: stats.total_events, color: 'text-gray-300', bg: 'bg-gray-500/10 border-gray-500/20' },
            { label: 'Reconhecidos', value: stats.recognized, color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' },
            { label: 'Desconhecidos', value: stats.unknown_faces, color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
            { label: 'Bloqueados', value: stats.blocked, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
            { label: 'Últimas 24h', value: stats.last_24h, color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
          ].map(s => (
            <div key={s.label} className={`rounded-xl border p-3 ${s.bg}`}>
              <p className="text-xs text-gray-400 mb-1">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-800/50 rounded-xl p-1 w-fit">
        {[
          { key: 'persons', label: 'Banco de Faces', icon: Users },
          { key: 'events', label: 'Eventos', icon: Activity },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.key ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
            <t.icon size={15} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Persons Tab */}
      {tab === 'persons' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar por nome, cargo ou departamento..."
                className="w-full pl-9 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
              />
            </div>
            <span className="text-sm text-gray-400">{filteredPersons.length} pessoa(s)</span>
          </div>

          {loadingPersons ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredPersons.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <ScanFace size={40} className="text-gray-600 mb-3" />
              <p className="text-gray-400 font-medium">Nenhuma pessoa cadastrada</p>
              <p className="text-gray-500 text-sm mt-1">Clique em "Cadastrar Pessoa" para adicionar ao banco de faces</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredPersons.map(person => (
                <div key={person.id} className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-4 hover:border-purple-500/30 transition-all group">
                  <div className="flex items-start gap-3">
                    <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-700 flex-shrink-0 border border-gray-600">
                      {person.photo_url ? (
                        <img src={person.photo_url} alt={person.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ScanFace size={24} className="text-gray-500" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold text-sm truncate">{person.name}</p>
                      {person.role && <p className="text-gray-400 text-xs truncate">{person.role}</p>}
                      {person.department && <p className="text-gray-500 text-xs truncate">{person.department}</p>}
                      <span className={`inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full text-xs font-medium border ${ACCESS_LABELS[person.access_level]?.color || 'text-gray-400'}`}>
                        {person.access_level === 'allowed' ? <Shield size={10} /> : <ShieldOff size={10} />}
                        {ACCESS_LABELS[person.access_level]?.label || person.access_level}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-700/50 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEdit(person)}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-xs transition-colors">
                      <Edit2 size={12} /> Editar
                    </button>
                    <button onClick={() => { if (confirm(`Remover ${person.name}?`)) deleteMutation.mutate(person.id) }}
                      className="flex items-center justify-center gap-1 px-2 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs transition-colors border border-red-500/20">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Events Tab */}
      {tab === 'events' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter size={15} className="text-gray-400" />
              <span className="text-sm text-gray-400">Filtrar:</span>
            </div>
            {['all', 'recognized', 'unknown', 'blocked'].map(f => (
              <button key={f} onClick={() => setEventFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${eventFilter === f ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                {f === 'all' ? 'Todos' : EVENT_LABELS[f]?.label || f}
              </button>
            ))}
          </div>

          {loadingEvents ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !eventsData?.events?.length ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <Activity size={40} className="text-gray-600 mb-3" />
              <p className="text-gray-400 font-medium">Nenhum evento registrado</p>
              <p className="text-gray-500 text-sm mt-1">Os eventos de reconhecimento facial aparecerão aqui</p>
            </div>
          ) : (
            <div className="bg-gray-800/40 border border-gray-700/50 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700/50 bg-gray-800/60">
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Pessoa</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Evento</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Câmera</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Confiança</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Data/Hora</th>
                    <th className="text-right px-4 py-3 text-gray-400 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/30">
                  {eventsData.events.map(ev => (
                    <tr key={ev.id} className="hover:bg-gray-700/20 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-white font-medium">{ev.person_name || 'Desconhecido'}</p>
                          {ev.person_role && <p className="text-gray-500 text-xs">{ev.person_role}</p>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${EVENT_LABELS[ev.event_type]?.color || 'text-gray-400'}`}>
                          {EVENT_LABELS[ev.event_type]?.label || ev.event_type}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-gray-300">
                          <Camera size={13} className="text-gray-500" />
                          <span className="text-xs">{ev.camera_name || '—'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {ev.confidence ? (
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                              <div className="h-full bg-purple-500 rounded-full" style={{ width: `${ev.confidence}%` }} />
                            </div>
                            <span className="text-xs text-gray-400">{ev.confidence.toFixed(1)}%</span>
                          </div>
                        ) : <span className="text-gray-600 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {new Date(ev.detected_at).toLocaleString('pt-BR')}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {(ev.snapshot_url || ev.face_crop_url) && (
                            <button onClick={() => setPreviewEvent(ev)}
                              className="p-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors">
                              <Eye size={13} />
                            </button>
                          )}
                          <button onClick={() => { if (confirm('Remover evento?')) deleteEventMutation.mutate(ev.id) }}
                            className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal Cadastro/Edição */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
              <h2 className="text-lg font-bold text-white">
                {editPerson ? 'Editar Pessoa' : 'Cadastrar Pessoa'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Foto */}
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-xl overflow-hidden bg-gray-800 border border-gray-700 flex-shrink-0">
                  {photoPreview ? (
                    <img src={photoPreview} alt="preview" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ScanFace size={28} className="text-gray-600" />
                    </div>
                  )}
                </div>
                <div>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                  <button onClick={() => fileRef.current?.click()}
                    className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors border border-gray-700">
                    <Upload size={14} />
                    {photoPreview ? 'Trocar foto' : 'Adicionar foto'}
                  </button>
                  <p className="text-xs text-gray-500 mt-1">JPG, PNG até 5MB</p>
                </div>
              </div>

              {/* Campos */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Nome *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Nome completo"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Cargo</label>
                  <input value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                    placeholder="Ex: Funcionário"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Departamento</label>
                  <input value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                    placeholder="Ex: TI"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Nível de Acesso</label>
                  <select value={form.access_level} onChange={e => setForm(f => ({ ...f, access_level: e.target.value }))}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500">
                    <option value="allowed">Permitido</option>
                    <option value="vip">VIP</option>
                    <option value="blocked">Bloqueado</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Observações</label>
                  <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Observações opcionais..."
                    rows={2}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none" />
                </div>
              </div>

              {error && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-700">
              <button onClick={() => setShowModal(false)}
                className="px-4 py-2 text-gray-400 hover:text-white text-sm transition-colors">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
                {saving ? 'Salvando...' : editPerson ? 'Salvar Alterações' : 'Cadastrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Preview de Evento */}
      {previewEvent && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
              <h2 className="text-lg font-bold text-white">Snapshot do Evento</h2>
              <button onClick={() => setPreviewEvent(null)} className="text-gray-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {previewEvent.snapshot_url && (
                <div>
                  <p className="text-xs text-gray-400 mb-2">Snapshot da Câmera</p>
                  <img src={previewEvent.snapshot_url} alt="snapshot" className="w-full rounded-xl border border-gray-700" />
                </div>
              )}
              {previewEvent.face_crop_url && (
                <div>
                  <p className="text-xs text-gray-400 mb-2">Recorte do Rosto</p>
                  <img src={previewEvent.face_crop_url} alt="face crop" className="w-32 rounded-xl border border-gray-700" />
                </div>
              )}
              <div className="bg-gray-800 rounded-xl p-3 space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Pessoa:</span>
                  <span className="text-white">{previewEvent.person_name || 'Desconhecido'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Tipo:</span>
                  <span className={EVENT_LABELS[previewEvent.event_type]?.color?.split(' ')[0] || 'text-gray-300'}>
                    {EVENT_LABELS[previewEvent.event_type]?.label || previewEvent.event_type}
                  </span>
                </div>
                {previewEvent.confidence && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Confiança:</span>
                    <span className="text-white">{previewEvent.confidence.toFixed(1)}%</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Data/Hora:</span>
                  <span className="text-white">{new Date(previewEvent.detected_at).toLocaleString('pt-BR')}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

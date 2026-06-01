import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { ScanFace, Plus, Trash2, Edit2, X, Upload, Eye, Shield, ShieldOff, Users, Activity, Camera, Search, AlertTriangle, Bell, CheckCircle, Clock } from 'lucide-react'

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

interface Suspect {
  id: number
  name: string
  reason: string | null
  photo_url: string | null
  severity: 'high' | 'medium' | 'low'
  active: boolean
  notes: string | null
  created_at: string
}

interface SuspectEvent {
  id: number
  alert_person_id: number
  alert_person_name: string
  camera_id: number | null
  camera_name: string | null
  location: string | null
  snapshot_url: string | null
  confidence: number | null
  acknowledged: boolean
  acknowledged_at: string | null
  detected_at: string
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

const SEVERITY_LABELS: Record<string, { label: string; color: string }> = {
  high:   { label: 'Alta',  color: 'text-red-400 bg-red-500/10 border-red-500/30' },
  medium: { label: 'Média', color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30' },
  low:    { label: 'Baixa', color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
}

export default function Facial() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'persons' | 'events' | 'suspects' | 'suspect-alerts'>('persons')
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

  // Suspect modal state
  const [showSuspectModal, setShowSuspectModal] = useState(false)
  const [editSuspect, setEditSuspect] = useState<Suspect | null>(null)
  const [suspectForm, setSuspectForm] = useState({ name: '', reason: '', severity: 'high', notes: '' })
  const [suspectPhotoFile, setSuspectPhotoFile] = useState<File | null>(null)
  const [suspectPhotoPreview, setSuspectPhotoPreview] = useState<string | null>(null)
  const suspectFileRef = useRef<HTMLInputElement>(null)
  const [suspectSaving, setSuspectSaving] = useState(false)
  const [suspectError, setSuspectError] = useState('')
  const [previewSuspectAlert, setPreviewSuspectAlert] = useState<SuspectEvent | null>(null)
  const [unreadAlerts, setUnreadAlerts] = useState(0)

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

  // Suspects queries
  const { data: suspectsData, isLoading: loadingSuspects } = useQuery<Suspect[]>({
    queryKey: ['suspects'],
    queryFn: () => api.get('/employees-alerts/alerts').then(r => Array.isArray(r.data) ? r.data : []),
  })

  const { data: suspectAlertsData, isLoading: loadingSuspectAlerts } = useQuery<SuspectEvent[]>({
    queryKey: ['suspect-alerts'],
    queryFn: () => api.get('/employees-alerts/alerts/events?limit=100').then(r => Array.isArray(r.data) ? r.data : []),
    refetchInterval: tab === 'suspect-alerts' ? 10000 : false,
  })

  // Count unread
  useEffect(() => {
    if (suspectAlertsData) {
      setUnreadAlerts(suspectAlertsData.filter(e => !e.acknowledged).length)
    }
  }, [suspectAlertsData])

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/facial/persons/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['facial-persons'] }),
  })

  const deleteEventMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/facial/events/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['facial-events'] }),
  })

  const deleteSuspectMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/employees-alerts/alerts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suspects'] }),
  })

  const acknowledgeMutation = useMutation({
    mutationFn: (id: number) => api.put(`/employees-alerts/alerts/events/${id}/acknowledge`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suspect-alerts'] }),
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
    setPhotoPreview(p.photo_url)
    setError('')
    setShowModal(true)
  }

  const openCreateSuspect = () => {
    setEditSuspect(null)
    setSuspectForm({ name: '', reason: '', severity: 'high', notes: '' })
    setSuspectPhotoFile(null)
    setSuspectPhotoPreview(null)
    setSuspectError('')
    setShowSuspectModal(true)
  }

  const openEditSuspect = (s: Suspect) => {
    setEditSuspect(s)
    setSuspectForm({ name: s.name, reason: s.reason || '', severity: s.severity, notes: s.notes || '' })
    setSuspectPhotoFile(null)
    setSuspectPhotoPreview(s.photo_url)
    setSuspectError('')
    setShowSuspectModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Nome é obrigatório'); return }
    setSaving(true); setError('')
    try {
      const fd = new FormData()
      fd.append('name', form.name)
      fd.append('role', form.role)
      fd.append('department', form.department)
      fd.append('access_level', form.access_level)
      fd.append('notes', form.notes)
      if (photoFile) fd.append('photo', photoFile)
      if (editPerson) {
        await api.put(`/facial/persons/${editPerson.id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      } else {
        await api.post('/facial/persons', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      }
      qc.invalidateQueries({ queryKey: ['facial-persons'] })
      qc.invalidateQueries({ queryKey: ['facial-stats'] })
      setShowModal(false)
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  const handleSaveSuspect = async () => {
    if (!suspectForm.name.trim()) { setSuspectError('Nome é obrigatório'); return }
    setSuspectSaving(true); setSuspectError('')
    try {
      const fd = new FormData()
      fd.append('name', suspectForm.name)
      fd.append('reason', suspectForm.reason)
      fd.append('severity', suspectForm.severity)
      fd.append('notes', suspectForm.notes)
      if (suspectPhotoFile) fd.append('photo', suspectPhotoFile)
      if (editSuspect) {
        await api.put(`/employees-alerts/alerts/${editSuspect.id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      } else {
        await api.post('/employees-alerts/alerts', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      }
      qc.invalidateQueries({ queryKey: ['suspects'] })
      setShowSuspectModal(false)
    } catch (e: any) {
      setSuspectError(e?.response?.data?.error || 'Erro ao salvar')
    } finally { setSuspectSaving(false) }
  }

  const filteredPersons = (personsData?.persons || []).filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.role || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.department || '').toLowerCase().includes(searchTerm.toLowerCase())
  )

  const filteredSuspects = (suspectsData || []).filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.reason || '').toLowerCase().includes(searchTerm.toLowerCase())
  )

  const stats = statsData

  const importEmployees = useMutation({
    mutationFn: () => api.post('/facial/persons/import-employees'),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['facial-persons'] })
      qc.invalidateQueries({ queryKey: ['facial-stats'] })
      const d = res.data
      alert(`Importação: ${d.imported} importados, ${d.skipped} já existiam.`)
    },
    onError: () => alert('Erro ao importar funcionários'),
  })
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
            <ScanFace size={20} className="text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Reconhecimento Facial</h1>
            <p className="text-sm text-gray-400">Banco de faces, eventos e integração com câmeras Hikvision</p>
          </div>
        </div>
        {tab === 'persons' && (
          <div className="flex gap-2">
            <button onClick={() => { if(window.confirm('Importar funcionários com foto para o Banco de Faces?')) importEmployees.mutate() }}
              disabled={importEmployees.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors">
              <Users size={16} /> {importEmployees.isPending ? 'Importando...' : 'Importar Funcionários'}
            </button>
            <button onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-medium transition-colors">
              <Plus size={16} /> Cadastrar Pessoa
            </button>
          </div>
        )}
        {tab === 'suspects' && (
          <button onClick={openCreateSuspect}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium transition-colors">
            <Plus size={16} /> Cadastrar Suspeito
          </button>
        )}
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Pessoas', value: stats.total_persons, color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
            { label: 'Eventos', value: stats.total_events, color: 'text-gray-300', bg: 'bg-gray-500/10 border-gray-500/20' },
            { label: 'Reconhecidos', value: stats.recognized, color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' },
            { label: 'Desconhecidos', value: stats.unknown_faces, color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
            { label: 'Bloqueados', value: stats.blocked, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
            { label: 'Últimas 24h', value: stats.last_24h, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
          ].map(s => (
            <div key={s.label} className={`rounded-xl border p-3 ${s.bg}`}>
              <p className="text-xs text-gray-400">{s.label}</p>
              <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value ?? '—'}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-800/50 rounded-xl p-1 w-fit flex-wrap">
        {[
          { key: 'persons', label: 'Banco de Faces', icon: Users },
          { key: 'events', label: 'Eventos', icon: Activity },
          { key: 'suspects', label: 'Cadastro Suspeitos', icon: AlertTriangle },
          { key: 'suspect-alerts', label: `Alertas${unreadAlerts > 0 ? ` (${unreadAlerts})` : ''}`, icon: Bell },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.key
                ? t.key === 'suspects' || t.key === 'suspect-alerts'
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-700 text-white'
                : 'text-gray-400 hover:text-gray-200'
            }`}>
            <t.icon size={15} />
            {t.label}
            {t.key === 'suspect-alerts' && unreadAlerts > 0 && (
              <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
            )}
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
            <select value={eventFilter} onChange={e => setEventFilter(e.target.value)}
              className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500">
              <option value="all">Todos os eventos</option>
              <option value="recognized">Reconhecidos</option>
              <option value="unknown">Desconhecidos</option>
              <option value="blocked">Bloqueados</option>
            </select>
            <span className="text-sm text-gray-400">{eventsData?.total ?? 0} evento(s)</span>
          </div>
          {loadingEvents ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (eventsData?.events || []).length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <Activity size={40} className="text-gray-600 mb-3" />
              <p className="text-gray-400 font-medium">Nenhum evento registrado</p>
            </div>
          ) : (
            <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700/50">
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Snapshot</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Pessoa</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Tipo</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Câmera</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Data/Hora</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {(eventsData?.events || []).map(ev => (
                    <tr key={ev.id} className="border-b border-gray-700/30 hover:bg-gray-700/20 transition-colors">
                      <td className="px-4 py-3">
                        {ev.snapshot_url ? (
                          <img src={ev.snapshot_url} alt="snap" className="w-12 h-9 object-cover rounded-lg border border-gray-600" />
                        ) : (
                          <div className="w-12 h-9 bg-gray-700 rounded-lg flex items-center justify-center">
                            <Camera size={14} className="text-gray-500" />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-white font-medium">{ev.person_name || 'Desconhecido'}</p>
                        {ev.person_role && <p className="text-gray-400 text-xs">{ev.person_role}</p>}
                        {ev.confidence && <p className="text-gray-500 text-xs">{ev.confidence.toFixed(1)}%</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${EVENT_LABELS[ev.event_type]?.color || 'text-gray-400'}`}>
                          {EVENT_LABELS[ev.event_type]?.label || ev.event_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-300 text-xs">{ev.camera_name || ev.location || '—'}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{new Date(ev.detected_at).toLocaleString('pt-BR')}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {(ev.snapshot_url || ev.face_crop_url) && (
                            <button onClick={() => setPreviewEvent(ev)}
                              className="p-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors">
                              <Eye size={13} />
                            </button>
                          )}
                          <button onClick={() => { if (confirm('Remover evento?')) deleteEventMutation.mutate(ev.id) }}
                            className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors border border-red-500/20">
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

      {/* Suspects Tab */}
      {tab === 'suspects' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar por nome ou motivo..."
                className="w-full pl-9 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
              />
            </div>
            <span className="text-sm text-gray-400">{filteredSuspects.length} suspeito(s)</span>
          </div>

          {/* Alert banner */}
          <div className="flex items-center gap-3 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl">
            <AlertTriangle size={18} className="text-red-400 flex-shrink-0" />
            <p className="text-sm text-red-300">
              Pessoas cadastradas aqui serão <strong>monitoradas automaticamente</strong> pelas câmeras. 
              Um alerta será emitido imediatamente quando detectadas.
            </p>
          </div>

          {loadingSuspects ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredSuspects.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <AlertTriangle size={40} className="text-gray-600 mb-3" />
              <p className="text-gray-400 font-medium">Nenhum suspeito cadastrado</p>
              <p className="text-gray-500 text-sm mt-1">Cadastre pessoas para monitoramento e alerta automático</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredSuspects.map(suspect => (
                <div key={suspect.id} className={`bg-gray-800/60 border rounded-xl p-4 transition-all group ${
                  suspect.active ? 'border-red-500/30 hover:border-red-500/50' : 'border-gray-700/50 opacity-60'
                }`}>
                  <div className="flex items-start gap-3">
                    <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-700 flex-shrink-0 border border-red-500/30">
                      {suspect.photo_url ? (
                        <img src={suspect.photo_url} alt={suspect.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <AlertTriangle size={24} className="text-red-500/50" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold text-sm truncate">{suspect.name}</p>
                      {suspect.reason && <p className="text-gray-400 text-xs truncate mt-0.5">{suspect.reason}</p>}
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${SEVERITY_LABELS[suspect.severity]?.color || 'text-gray-400'}`}>
                          {SEVERITY_LABELS[suspect.severity]?.label || suspect.severity}
                        </span>
                        {!suspect.active && (
                          <span className="text-xs text-gray-500">Inativo</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-700/50 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEditSuspect(suspect)}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-xs transition-colors">
                      <Edit2 size={12} /> Editar
                    </button>
                    <button onClick={() => { if (confirm(`Remover ${suspect.name} da lista?`)) deleteSuspectMutation.mutate(suspect.id) }}
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

      {/* Suspect Alerts Tab */}
      {tab === 'suspect-alerts' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">{(suspectAlertsData || []).length} alerta(s)</span>
            {unreadAlerts > 0 && (
              <span className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-1 rounded-full">
                {unreadAlerts} não confirmado(s)
              </span>
            )}
          </div>

          {loadingSuspectAlerts ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (suspectAlertsData || []).length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <Bell size={40} className="text-gray-600 mb-3" />
              <p className="text-gray-400 font-medium">Nenhum alerta registrado</p>
              <p className="text-gray-500 text-sm mt-1">Alertas aparecerão aqui quando suspeitos forem detectados</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(suspectAlertsData || []).map(alert => (
                <div key={alert.id} className={`flex items-start gap-4 p-4 rounded-xl border transition-all ${
                  alert.acknowledged
                    ? 'bg-gray-800/30 border-gray-700/30'
                    : 'bg-red-500/5 border-red-500/30 shadow-lg shadow-red-500/5'
                }`}>
                  {/* Snapshot */}
                  <div className="w-16 h-12 rounded-lg overflow-hidden bg-gray-700 flex-shrink-0 border border-gray-600">
                    {alert.snapshot_url ? (
                      <img src={alert.snapshot_url} alt="snap" className="w-full h-full object-cover cursor-pointer"
                        onClick={() => setPreviewSuspectAlert(alert)} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Camera size={16} className="text-gray-500" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {!alert.acknowledged && (
                        <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse flex-shrink-0" />
                      )}
                      <p className="text-white font-semibold text-sm">{alert.alert_person_name}</p>
                      {alert.confidence && (
                        <span className="text-xs text-gray-400 bg-gray-700 px-2 py-0.5 rounded-full">
                          {Number(alert.confidence).toFixed(1)}% confiança
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      {alert.camera_name && (
                        <span className="flex items-center gap-1">
                          <Camera size={11} /> {alert.camera_name}
                        </span>
                      )}
                      {alert.location && (
                        <span>{alert.location}</span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock size={11} /> {new Date(alert.detected_at).toLocaleString('pt-BR')}
                      </span>
                    </div>
                    {alert.acknowledged && alert.acknowledged_at && (
                      <p className="text-xs text-green-400 mt-1">
                        ✓ Confirmado em {new Date(alert.acknowledged_at).toLocaleString('pt-BR')}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {alert.snapshot_url && (
                      <button onClick={() => setPreviewSuspectAlert(alert)}
                        className="p-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors">
                        <Eye size={14} />
                      </button>
                    )}
                    {!alert.acknowledged && (
                      <button onClick={() => acknowledgeMutation.mutate(alert.id)}
                        className="flex items-center gap-1 px-3 py-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-lg text-xs transition-colors border border-green-500/20">
                        <CheckCircle size={13} /> Confirmar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal Cadastro/Edição Pessoa */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
              <h2 className="text-lg font-bold text-white">{editPerson ? 'Editar Pessoa' : 'Cadastrar Pessoa'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Photo upload */}
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-xl overflow-hidden bg-gray-800 border-2 border-dashed border-gray-600 flex items-center justify-center cursor-pointer hover:border-purple-500 transition-colors"
                  onClick={() => fileRef.current?.click()}>
                  {photoPreview ? (
                    <img src={photoPreview} alt="preview" className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      <Upload size={20} className="text-gray-500" />
                      <span className="text-xs text-gray-500">Foto</span>
                    </div>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) { setPhotoFile(f); setPhotoPreview(URL.createObjectURL(f)) }
                  }} />
                <div className="flex-1">
                  <p className="text-sm text-gray-300">Foto do rosto</p>
                  <p className="text-xs text-gray-500 mt-1">Clique para selecionar uma imagem</p>
                  {photoFile && <p className="text-xs text-purple-400 mt-1">{photoFile.name}</p>}
                </div>
              </div>
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
                    placeholder="Ex: Segurança"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Departamento</label>
                  <input value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                    placeholder="Ex: Operações"
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

      {/* Modal Cadastro Suspeito */}
      {showSuspectModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-red-500/30 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
              <div className="flex items-center gap-2">
                <AlertTriangle size={18} className="text-red-400" />
                <h2 className="text-lg font-bold text-white">{editSuspect ? 'Editar Suspeito' : 'Cadastrar Suspeito'}</h2>
              </div>
              <button onClick={() => setShowSuspectModal(false)} className="text-gray-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Photo upload */}
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-xl overflow-hidden bg-gray-800 border-2 border-dashed border-red-500/30 flex items-center justify-center cursor-pointer hover:border-red-500 transition-colors"
                  onClick={() => suspectFileRef.current?.click()}>
                  {suspectPhotoPreview ? (
                    <img src={suspectPhotoPreview} alt="preview" className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      <Upload size={20} className="text-red-500/50" />
                      <span className="text-xs text-gray-500">Foto</span>
                    </div>
                  )}
                </div>
                <input ref={suspectFileRef} type="file" accept="image/*" className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) { setSuspectPhotoFile(f); setSuspectPhotoPreview(URL.createObjectURL(f)) }
                  }} />
                <div className="flex-1">
                  <p className="text-sm text-gray-300">Foto do suspeito</p>
                  <p className="text-xs text-gray-500 mt-1">Foto clara do rosto para reconhecimento</p>
                  {suspectPhotoFile && <p className="text-xs text-red-400 mt-1">{suspectPhotoFile.name}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Nome / Apelido *</label>
                  <input value={suspectForm.name} onChange={e => setSuspectForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Nome ou apelido do suspeito"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Motivo / Ocorrência</label>
                  <input value={suspectForm.reason} onChange={e => setSuspectForm(f => ({ ...f, reason: e.target.value }))}
                    placeholder="Ex: Furto em 15/05/2026 - Loja X"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Severidade do Alerta</label>
                  <select value={suspectForm.severity} onChange={e => setSuspectForm(f => ({ ...f, severity: e.target.value }))}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-red-500">
                    <option value="high">Alta — Alerta imediato</option>
                    <option value="medium">Média — Notificação</option>
                    <option value="low">Baixa — Registro</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Observações</label>
                  <textarea value={suspectForm.notes} onChange={e => setSuspectForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Descrição física, histórico, etc..."
                    rows={2}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500 resize-none" />
                </div>
              </div>
              {suspectError && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{suspectError}</p>}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-700">
              <button onClick={() => setShowSuspectModal(false)}
                className="px-4 py-2 text-gray-400 hover:text-white text-sm transition-colors">
                Cancelar
              </button>
              <button onClick={handleSaveSuspect} disabled={suspectSaving}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
                {suspectSaving ? 'Salvando...' : editSuspect ? 'Salvar Alterações' : 'Cadastrar Suspeito'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Preview Evento */}
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

      {/* Modal Preview Alerta Suspeito */}
      {previewSuspectAlert && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-red-500/30 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
              <div className="flex items-center gap-2">
                <AlertTriangle size={18} className="text-red-400" />
                <h2 className="text-lg font-bold text-white">Alerta de Suspeito</h2>
              </div>
              <button onClick={() => setPreviewSuspectAlert(null)} className="text-gray-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {previewSuspectAlert.snapshot_url && (
                <img src={previewSuspectAlert.snapshot_url} alt="snapshot" className="w-full rounded-xl border border-red-500/20" />
              )}
              <div className="bg-gray-800 rounded-xl p-3 space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Suspeito:</span>
                  <span className="text-red-300 font-semibold">{previewSuspectAlert.alert_person_name}</span>
                </div>
                {previewSuspectAlert.camera_name && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Câmera:</span>
                    <span className="text-white">{previewSuspectAlert.camera_name}</span>
                  </div>
                )}
                {previewSuspectAlert.confidence && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Confiança:</span>
                    <span className="text-white">{Number(previewSuspectAlert.confidence).toFixed(1)}%</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Detectado em:</span>
                  <span className="text-white">{new Date(previewSuspectAlert.detected_at).toLocaleString('pt-BR')}</span>
                </div>
              </div>
              {!previewSuspectAlert.acknowledged && (
                <button onClick={() => { acknowledgeMutation.mutate(previewSuspectAlert.id); setPreviewSuspectAlert(null) }}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors">
                  <CheckCircle size={16} /> Confirmar Alerta
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


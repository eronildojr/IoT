import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { camerasApi, jimiApi, devicesApi, ipCamerasApi, vpnApi, eventsApi } from '../services/api'
import { useAuth } from '../store/auth'
import {
  Camera, CameraOff, Plus, Search, X, Loader2, Trash2, Wifi, WifiOff,
  Video, Eye, AlertTriangle, MapPin, Play, Smartphone,
  Navigation, Image, Send, ChevronDown, Truck, Radio,
  Monitor, Settings, CheckCircle, XCircle, Edit2, Power,
  Crosshair, LocateFixed
} from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix Leaflet default marker icons in Vite
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// ─── Jimi constants ────────────────────────────────────────────

const STATUS_MAP: Record<string, { color: string; label: string; icon: any }> = {
  online: { color: 'text-green-400 bg-green-500/15 border-green-500/20', label: 'Online', icon: Wifi },
  offline: { color: 'text-gray-400 bg-gray-700/50 border-gray-600', label: 'Offline', icon: WifiOff },
  unknown: { color: 'text-yellow-400 bg-yellow-500/15 border-yellow-500/20', label: 'Desconhecido', icon: AlertTriangle },
}

const CAMERA_TYPES: Record<string, { label: string; desc: string }> = {
  front: { label: 'Frontal', desc: 'Câmera voltada para a estrada' },
  internal: { label: 'Interna', desc: 'Câmera voltada para o motorista' },
  both: { label: 'Ambas', desc: 'Frontal + Interna' },
}

interface CameraForm {
  name: string
  imei: string
  cameraType: string
  vehicleId: string
  location: string
}

const EMPTY_FORM: CameraForm = {
  name: '', imei: '', cameraType: 'both', vehicleId: '', location: '',
}

// ─── IP Camera constants ───────────────────────────────────────

const MANUFACTURERS = [
  { value: 'hikvision', label: 'Hikvision' },
  { value: 'intelbras', label: 'Intelbras' },
  { value: 'dahua', label: 'Dahua' },
  { value: 'axis', label: 'Axis' },
  { value: 'reolink', label: 'Reolink' },
  { value: 'hanwha', label: 'Hanwha / Samsung' },
  { value: 'bosch', label: 'Bosch' },
  { value: 'uniview', label: 'Uniview' },
  { value: 'vivotek', label: 'Vivotek' },
  { value: 'pelco', label: 'Pelco' },
  { value: 'flir', label: 'FLIR' },
  { value: 'avigilon', label: 'Avigilon' },
  { value: 'generic', label: 'Genérica' },
  { value: 'other', label: 'Outro fabricante' },
]

const ANALYTICS_TYPES_OPTIONS = [
  { value: 'lpr', label: 'LPR (Leitura de Placas)' },
  { value: 'intrusion', label: 'Detecção de Intrusão' },
  { value: 'line_crossing', label: 'Cruzamento de Linha' },
  { value: 'person', label: 'Detecção de Pessoa' },
  { value: 'face', label: 'Reconhecimento Facial' },
  { value: 'motion', label: 'Detecção de Movimento' },
]

interface IpCameraForm {
  name: string
  manufacturer: string
  model: string
  ip_address: string
  http_port: number
  rtsp_port: number
  rtsp_path: string
  username: string
  password: string
  latitude: number | ''
  longitude: number | ''
  location_desc: string
  active: boolean
  analytics_enabled: boolean
  analytics_types: string[]
  notes: string
  vpn_tunnel_id: number | ''
}

const EMPTY_IP_FORM: IpCameraForm = {
  name: '',
  manufacturer: 'hikvision',
  model: '',
  ip_address: '',
  http_port: 80,
  rtsp_port: 554,
  rtsp_path: '/Streaming/Channels/101',
  username: 'admin',
  password: '',
  latitude: '',
  longitude: '',
  location_desc: '',
  active: true,
  analytics_enabled: false,
  analytics_types: [],
  vpn_tunnel_id: '',
  notes: '',
}

// ─── Main component ────────────────────────────────────────────

export default function Cameras() {
  const [tab, setTab] = useState<'jimi' | 'ip' | 'events'>('jimi')

  return (
    <div className="space-y-6">
      {/* Tab buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => setTab('jimi')}
          className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
            tab === 'jimi'
              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
              : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-600'
          }`}
        >
          <span className="flex items-center gap-2"><Truck size={16} /> Veiculares (Jimi)</span>
        </button>
        <button
          onClick={() => setTab('ip')}
          className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
            tab === 'ip'
              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
              : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-600'
          }`}
        >
          <span className="flex items-center gap-2"><Monitor size={16} /> Fixas (IP)</span>
        </button>
        <button
          onClick={() => setTab('events')}
          className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
            tab === 'events'
              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
              : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-600'
          }`}
        >
          <span className="flex items-center gap-2"><AlertTriangle size={16} /> Eventos</span>
        </button>
      </div>

      {tab === 'jimi' && <JimiTab />}
      {tab === 'ip' && <IpTab />}
      {tab === 'events' && <EventsTab />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// ═══  JIMI TAB  ═══════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════

function JimiTab() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'
  const canEdit = isAdmin || user?.role === 'operator'

  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [selected, setSelected] = useState<any>(null)
  const [form, setForm] = useState<CameraForm>(EMPTY_FORM)
  const [searchQ, setSearchQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [imeiValid, setImeiValid] = useState<null | boolean>(null)
  const [imeiMsg, setImeiMsg] = useState('')
  const [streamUrl, setStreamUrl] = useState<string | null>(null)
  const [streamLoading, setStreamLoading] = useState(false)
  const [locationData, setLocationData] = useState<any>(null)
  const [errorModal, setErrorModal] = useState<{ title: string; message: string; fields?: string[] } | null>(null)

  // Queries
  const { data: rawCameras, isLoading } = useQuery({ queryKey: ['cameras', statusFilter, searchQ], queryFn: () => camerasApi.list({ status: statusFilter || undefined, search: searchQ || undefined }).then(r => r.data) })
  const cameras = Array.isArray(rawCameras) ? rawCameras : []
  const { data: stats } = useQuery({ queryKey: ['camera-stats'], queryFn: () => camerasApi.stats().then(r => r.data) })
  const { data: rawVehicles } = useQuery({ queryKey: ['devices-for-cameras'], queryFn: () => devicesApi.list().then(r => r.data) })
  const vehicles = Array.isArray(rawVehicles) ? rawVehicles : (rawVehicles as any)?.devices || []

  // Mutations
  const createMut = useMutation({
    mutationFn: (d: any) => camerasApi.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cameras'] }); qc.invalidateQueries({ queryKey: ['camera-stats'] }); closeForm() },
  })
  const updateMut = useMutation({
    mutationFn: ({ id, d }: any) => camerasApi.update(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cameras'] }); qc.invalidateQueries({ queryKey: ['camera-stats'] }); closeForm() },
  })
  const deleteMut = useMutation({
    mutationFn: (id: string) => camerasApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cameras'] }); qc.invalidateQueries({ queryKey: ['camera-stats'] }); setSelected(null) },
  })

  function closeForm() { setShowAdd(false); setEditing(null); setForm(EMPTY_FORM); setImeiValid(null); setImeiMsg('') }

  function openEdit(cam: any) {
    setForm({ name: cam.name, imei: cam.imei, cameraType: cam.camera_type || 'both', vehicleId: cam.vehicle_id || '', location: cam.location || '' })
    setEditing(cam); setShowAdd(true); setImeiValid(true)
  }

  function handleSave() {
    const payload = { name: form.name, imei: form.imei, cameraType: form.cameraType, vehicleId: form.vehicleId || null, location: form.location || null }
    if (editing) { updateMut.mutate({ id: editing.id, d: payload }) }
    else { createMut.mutate(payload) }
  }

  async function validateImei() {
    if (!/^\d{15}$/.test(form.imei)) { setImeiValid(false); setImeiMsg('IMEI deve ter 15 dígitos'); return }
    setImeiMsg('Validando...'); setImeiValid(null)
    try {
      const { data } = await camerasApi.validateImei(form.imei)
      setImeiValid(data.ok); setImeiMsg(data.message)
    } catch { setImeiValid(false); setImeiMsg('Erro ao validar IMEI') }
  }

  async function openLiveStream(cam: any) {
    setStreamLoading(true); setStreamUrl(null); setErrorModal(null)
    try {
      const { data } = await jimiApi.startStream(cam.imei, 1)
      if (data.ok) {
        // Open API retorna stream_url (iframe), IoT Hub retorna stream.flv/rtmp
        const url = data.stream_url || data.stream?.flv || data.stream?.rtmp
        if (url) { setStreamUrl(url) }
        else { setErrorModal({ title: 'Stream indisponivel', message: 'URL do stream nao foi retornada pela API JIMI.' }) }
      } else if (data.error === 'not_configured') {
        setErrorModal({
          title: 'JIMI IoT Hub nao configurado',
          message: 'Para usar o Live Stream, configure as credenciais:',
          fields: data.missing_fields || ['App Key', 'App Secret'],
        })
      } else {
        setErrorModal({ title: 'Falha no Live Stream', message: data.error || data.message || 'Erro desconhecido' })
      }
    } catch (err: any) {
      const resp = err.response?.data
      if (resp?.error === 'not_configured') {
        setErrorModal({
          title: 'JIMI IoT Hub nao configurado',
          message: resp.message || 'Configure as credenciais antes de usar o Live Stream.',
          fields: resp.missing_fields,
        })
      } else {
        setErrorModal({ title: 'Erro de conexao', message: resp?.error || err.message || 'Falha ao conectar com JIMI IoT Hub' })
      }
    }
    finally { setStreamLoading(false) }
  }

  async function fetchLocation(cam: any) {
    try {
      // Usar dados do banco (preenchidos via push GPS)
      setLocationData(cam.last_lat ? { ok: true, lat: cam.last_lat, lng: cam.last_lng, speed: cam.speed || 0, gps_time: cam.last_gps_time } : null)
    } catch { setLocationData(null) }
  }

  async function capturePhoto(cam: any) {
    try {
      const { data } = await jimiApi.takePhoto(cam.imei, 1)
      if (data.ok) {
        const code = data.result?.data?._code
        if (code === '100') setErrorModal({ title: 'Foto solicitada', message: 'Comando enviado! A foto sera recebida via push quando o upload completar.' })
        else if (code === '300') setErrorModal({ title: 'Dispositivo offline', message: 'A camera nao esta conectada no momento.' })
        else setErrorModal({ title: 'Comando enviado', message: data.result?.data?._msg || 'Aguardando resposta do dispositivo.' })
      } else if (data.error === 'not_configured') {
        setErrorModal({ title: 'JIMI nao configurado', message: data.message || 'Configure as credenciais em Configuracoes.', fields: data.missing_fields })
      } else {
        setErrorModal({ title: 'Erro', message: data.error || 'Falha ao enviar comando' })
      }
    } catch (err: any) { setErrorModal({ title: 'Erro', message: err.response?.data?.error || 'Falha na comunicacao' }) }
  }

  async function checkStatus(cam: any) {
    // Status vem via push (pushevent/pushgps), não precisa consultar API
    qc.invalidateQueries({ queryKey: ['cameras'] })
    qc.invalidateQueries({ queryKey: ['camera-stats'] })
    const st = STATUS_MAP[cam.status] || STATUS_MAP.unknown
    alert(`${cam.name}: ${st.label}${cam.last_seen ? ' | Último sinal: ' + new Date(cam.last_seen).toLocaleString('pt-BR') : ''}`)
  }

  // Open detail
  function openDetail(cam: any) {
    setSelected(cam); setStreamUrl(null); setLocationData(null)
    fetchLocation(cam)
  }

  const saving = createMut.isPending || updateMut.isPending

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Camera className="text-cyan-400" size={28} /> Câmeras JIMI
          </h1>
          <p className="text-gray-400 text-sm mt-1">Câmeras veiculares JC400D — acesso via 4G/IMEI</p>
        </div>
        {canEdit && (
          <button onClick={() => { setForm(EMPTY_FORM); setShowAdd(true) }} className="flex items-center gap-2 px-4 py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl font-medium transition-all">
            <Plus size={18} /> Nova Câmera
          </button>
        )}
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total', value: stats.total, color: 'text-white', icon: Camera },
            { label: 'Online', value: stats.online, color: 'text-green-400', icon: Wifi },
            { label: 'Offline', value: stats.offline, color: 'text-gray-400', icon: WifiOff },
            { label: 'Dual (Ambas)', value: stats.both, color: 'text-cyan-400', icon: Video },
          ].map(s => (
            <div key={s.label} className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <s.icon size={20} className={s.color} />
                <div>
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-gray-500 text-xs">{s.label}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Buscar por nome, IMEI ou local..." className="w-full pl-10 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm focus:border-cyan-500/50 focus:outline-none" />
        </div>
        {['', 'online', 'offline', 'unknown'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${statusFilter === s ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-600'}`}>
            {s === '' ? 'Todas' : STATUS_MAP[s]?.label || s}
          </button>
        ))}
      </div>

      {/* Camera Grid */}
      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>
      ) : cameras.length === 0 ? (
        <div className="text-center py-20">
          <Camera size={48} className="mx-auto mb-4 text-gray-600" />
          <p className="text-gray-400 text-lg font-medium">Nenhuma câmera cadastrada</p>
          <p className="text-gray-500 text-sm mt-1">Adicione uma câmera JIMI JC400D pelo IMEI do dispositivo</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {cameras.map((cam: any) => {
            const st = STATUS_MAP[cam.status] || STATUS_MAP.unknown
            const StIcon = st.icon
            const typeInfo = CAMERA_TYPES[cam.camera_type] || CAMERA_TYPES.both
            return (
              <div key={cam.id} className="bg-gray-800/50 border border-gray-700/50 rounded-xl overflow-hidden hover:border-gray-600 transition-all group cursor-pointer" onClick={() => openDetail(cam)}>
                {/* Top bar */}
                <div className="p-4 pb-3">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white font-semibold truncate">{cam.name}</h3>
                      <p className="text-gray-500 text-xs font-mono mt-0.5">IMEI: {cam.imei}</p>
                    </div>
                    <span className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border ${st.color}`}>
                      <StIcon size={12} /> {st.label}
                    </span>
                  </div>

                  {/* Info chips */}
                  <div className="flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-500/15 text-orange-400 border border-orange-500/20 rounded-full text-xs">
                      <Smartphone size={10} /> JIMI 4G
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-500/15 text-blue-400 border border-blue-500/20 rounded-full text-xs">
                      <Video size={10} /> {typeInfo.label}
                    </span>
                    {cam.vehicle_name && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-500/15 text-purple-400 border border-purple-500/20 rounded-full text-xs">
                        <Truck size={10} /> {cam.vehicle_name}
                      </span>
                    )}
                    {cam.location && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-700/50 text-gray-400 border border-gray-600 rounded-full text-xs">
                        <MapPin size={10} /> {cam.location}
                      </span>
                    )}
                  </div>
                  {/* GPS info */}
                  {cam.last_lat && (
                    <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><Navigation size={10} className="text-green-400" /> {Number(cam.last_lat).toFixed(5)}, {Number(cam.last_lng).toFixed(5)}</span>
                      {cam.speed > 0 && <span>{cam.speed} km/h</span>}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="px-4 pb-4 flex gap-2">
                  <button onClick={e => { e.stopPropagation(); openLiveStream(cam) }} className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg text-xs font-medium transition-all">
                    <Play size={12} /> Ao Vivo
                  </button>
                  <button onClick={e => { e.stopPropagation(); capturePhoto(cam) }} className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 rounded-lg text-xs font-medium transition-all">
                    <Image size={12} /> Capturar
                  </button>
                  <button onClick={e => { e.stopPropagation(); checkStatus(cam) }} className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20 rounded-lg text-xs font-medium transition-all">
                    <Radio size={12} /> Status
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ══ Modal: Detalhe da Câmera ══ */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={() => { setSelected(null); setStreamUrl(null) }}>
          <div className="bg-gray-900 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gray-700" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-800">
              <div>
                <h2 className="text-xl font-bold text-white">{selected.name}</h2>
                <p className="text-gray-500 text-sm font-mono">IMEI: {selected.imei}</p>
              </div>
              <button onClick={() => { setSelected(null); setStreamUrl(null) }} className="p-2 hover:bg-gray-800 rounded-lg"><X size={20} className="text-gray-400" /></button>
            </div>

            <div className="p-5 space-y-5">
              {/* Live Stream Area */}
              <div className="aspect-video bg-black rounded-xl overflow-hidden relative">
                {streamUrl ? (
                  <iframe src={streamUrl} className="w-full h-full" allowFullScreen allow="autoplay; encrypted-media" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center">
                    <Video size={48} className="text-gray-700 mb-3" />
                    <button onClick={() => openLiveStream(selected)} disabled={streamLoading} className="flex items-center gap-2 px-6 py-3 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded-xl font-medium transition-all">
                      {streamLoading ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
                      {streamLoading ? 'Conectando...' : 'Ver ao Vivo'}
                    </button>
                    <p className="text-gray-600 text-xs mt-2">Stream via plataforma JIMI/TrackSolid</p>
                  </div>
                )}
                {streamUrl && (
                  <div className="absolute top-3 left-3 flex items-center gap-1 px-2 py-1 bg-red-500/30 border border-red-500/40 rounded-full">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-xs text-red-300 font-medium">AO VIVO</span>
                  </div>
                )}
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-3">
                <InfoItem label="Tipo" value={CAMERA_TYPES[selected.camera_type]?.label || 'Ambas'} />
                <InfoItem label="Veículo" value={selected.vehicle_name || '—'} />
                <InfoItem label="Local/Frota" value={selected.location || '—'} />
                <InfoItem label="Status" value={(STATUS_MAP[selected.status] || STATUS_MAP.unknown).label} />
                <InfoItem label="Último sinal" value={selected.last_seen ? new Date(selected.last_seen).toLocaleString('pt-BR') : '—'} />
                <InfoItem label="Cadastrado" value={new Date(selected.created_at).toLocaleString('pt-BR')} />
              </div>

              {/* Location */}
              {locationData && locationData.ok && (
                <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4">
                  <h4 className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-2"><Navigation size={14} className="text-cyan-400" /> Localização GPS</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-gray-500">Lat: <span className="text-white">{locationData.lat}</span></span>
                    <span className="text-gray-500">Lng: <span className="text-white">{locationData.lng}</span></span>
                    <span className="text-gray-500">Velocidade: <span className="text-white">{locationData.speed} km/h</span></span>
                    <span className="text-gray-500">GPS: <span className="text-white">{locationData.gps_time || '—'}</span></span>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                <button onClick={() => openLiveStream(selected)} disabled={streamLoading} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-sm font-medium transition-all">
                  <Play size={14} /> Ao Vivo
                </button>
                <button onClick={() => capturePhoto(selected)} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 rounded-xl text-sm font-medium transition-all">
                  <Image size={14} /> Capturar Foto
                </button>
                <button onClick={() => fetchLocation(selected)} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20 rounded-xl text-sm font-medium transition-all">
                  <Navigation size={14} /> Localização
                </button>
              </div>

              {/* Edit / Delete */}
              {canEdit && (
                <div className="flex gap-2 pt-2 border-t border-gray-800">
                  <button onClick={() => { openEdit(selected); setSelected(null) }} className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-sm font-medium transition-all">
                    Editar
                  </button>
                  {isAdmin && (
                    <button onClick={() => { if (confirm(`Excluir ${selected.name}?`)) deleteMut.mutate(selected.id) }} className="px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-sm font-medium transition-all">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ Modal: Adicionar/Editar Câmera ══ */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={closeForm}>
          <div className="bg-gray-900 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-gray-700" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-800">
              <h2 className="text-lg font-bold text-white">{editing ? 'Editar' : 'Nova'} Câmera JIMI</h2>
              <button onClick={closeForm} className="p-2 hover:bg-gray-800 rounded-lg"><X size={20} className="text-gray-400" /></button>
            </div>

            <div className="p-5 space-y-4">
              {/* Nome */}
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Nome da câmera *</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Caminhão 01 - Frente" className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm focus:border-cyan-500/50 focus:outline-none" />
              </div>

              {/* IMEI */}
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">IMEI do dispositivo *</label>
                <div className="flex gap-2">
                  <input value={form.imei} onChange={e => { setForm({ ...form, imei: e.target.value.replace(/\D/g, '').slice(0, 15) }); setImeiValid(null) }} placeholder="868120145233604" maxLength={15} className={`flex-1 px-4 py-2.5 bg-gray-800 border rounded-xl text-white text-sm font-mono focus:outline-none ${imeiValid === false ? 'border-red-500/50' : imeiValid === true ? 'border-green-500/50' : 'border-gray-700 focus:border-cyan-500/50'}`} />
                  <button onClick={validateImei} disabled={form.imei.length !== 15} className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-30 text-white rounded-xl text-sm transition-all">
                    Validar
                  </button>
                </div>
                {imeiMsg && (
                  <p className={`text-xs mt-1 ${imeiValid === false ? 'text-red-400' : imeiValid === true ? 'text-green-400' : 'text-gray-500'}`}>{imeiMsg}</p>
                )}
                <p className="text-xs text-gray-600 mt-1">15 dígitos numéricos — encontrado na etiqueta do dispositivo</p>
              </div>

              {/* Tipo de Câmera */}
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Tipo de câmera</label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(CAMERA_TYPES).map(([val, info]) => (
                    <button key={val} onClick={() => setForm({ ...form, cameraType: val })} className={`p-3 rounded-xl border text-center transition-all ${form.cameraType === val ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'}`}>
                      <p className="text-sm font-medium">{info.label}</p>
                      <p className="text-[10px] mt-0.5 opacity-60">{info.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Veículo vinculado */}
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Veículo vinculado</label>
                <select value={form.vehicleId} onChange={e => setForm({ ...form, vehicleId: e.target.value })} className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm focus:border-cyan-500/50 focus:outline-none appearance-none">
                  <option value="">— Nenhum —</option>
                  {vehicles.map((v: any) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </div>

              {/* Local / Frota */}
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Local / Frota</label>
                <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Ex: Haras Elite, Frota SP" className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm focus:border-cyan-500/50 focus:outline-none" />
              </div>

              {/* Errors */}
              {(createMut.error || updateMut.error) && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <p className="text-red-400 text-sm">{(createMut.error as any)?.response?.data?.error || (updateMut.error as any)?.response?.data?.error || 'Erro ao salvar'}</p>
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-3 pt-2">
                <button onClick={closeForm} className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-medium transition-all">Cancelar</button>
                <button onClick={handleSave} disabled={saving || !form.name || !form.imei || form.imei.length !== 15} className="flex-1 py-2.5 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-30 text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2">
                  {saving && <Loader2 size={16} className="animate-spin" />}
                  {editing ? 'Salvar' : 'Cadastrar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ Modal: Live Stream (fullscreen) ══ */}
      {streamUrl && !selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90" onClick={() => setStreamUrl(null)}>
          <div className="w-full max-w-4xl aspect-video relative" onClick={e => e.stopPropagation()}>
            <iframe src={streamUrl} className="w-full h-full rounded-xl" allowFullScreen allow="autoplay; encrypted-media" />
            <button onClick={() => setStreamUrl(null)} className="absolute top-3 right-3 p-2 bg-black/60 hover:bg-black/80 rounded-full"><X size={20} className="text-white" /></button>
            <div className="absolute top-3 left-3 flex items-center gap-1 px-2 py-1 bg-red-500/30 border border-red-500/40 rounded-full">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs text-red-300 font-medium">AO VIVO</span>
            </div>
          </div>
        </div>
      )}

      {/* Error/Info Modal */}
      {errorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={() => setErrorModal(null)}>
          <div className="bg-gray-900 rounded-2xl w-full max-w-md border border-gray-700 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle size={24} className="text-yellow-400 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="text-white font-semibold text-lg">{errorModal.title}</h3>
                <p className="text-gray-400 text-sm mt-1">{errorModal.message}</p>
              </div>
            </div>
            {errorModal.fields && errorModal.fields.length > 0 && (
              <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4 mb-4">
                <p className="text-gray-500 text-xs mb-2">Campos pendentes:</p>
                {errorModal.fields.map(f => (
                  <div key={f} className="flex items-center gap-2 text-sm text-yellow-400/80 py-0.5">
                    <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full" /> {f}
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-3">
              {errorModal.fields && (
                <a href="/settings" className="flex-1 py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl text-sm font-medium text-center transition-all">
                  Ir para Configuracoes
                </a>
              )}
              <button onClick={() => setErrorModal(null)} className={`${errorModal.fields ? '' : 'flex-1'} py-2.5 px-6 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-sm font-medium transition-all`}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// ═══  IP CAMERAS TAB  ═════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════

function IpTab() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'
  const canEdit = isAdmin || user?.role === 'operator'

  const [showForm, setShowForm] = useState(false)
  const [editingIp, setEditingIp] = useState<any>(null)
  const [form, setForm] = useState<IpCameraForm>(EMPTY_IP_FORM)
  const [showLive, setShowLive] = useState<any>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null)
  const [testResult, setTestResult] = useState<{ id: number; status: 'loading' | 'ok' | 'error'; msg?: string } | null>(null)
  const [snapshotBust, setSnapshotBust] = useState(0)

  // Auto-refresh snapshots every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      setSnapshotBust(Date.now())
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  // Queries
  const { data: rawIpCameras } = useQuery({
    queryKey: ['ip-cameras'],
    queryFn: () => ipCamerasApi.list().then(r => r.data),
  })
  const ipCameras = Array.isArray(rawIpCameras) ? rawIpCameras : []
  const isLoading = rawIpCameras === undefined

  // Mutations
  const createMut = useMutation({
    mutationFn: (d: any) => ipCamerasApi.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ip-cameras'] }); closeForm() },
  })
  const updateMut = useMutation({
    mutationFn: ({ id, d }: any) => ipCamerasApi.update(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ip-cameras'] }); closeForm() },
  })
  const deleteMut = useMutation({
    mutationFn: (id: number) => ipCamerasApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ip-cameras'] }); setDeleteConfirm(null) },
  })

  function closeForm() {
    setShowForm(false)
    setEditingIp(null)
    setForm(EMPTY_IP_FORM)
  }

  function openAdd() {
    setForm(EMPTY_IP_FORM)
    setEditingIp(null)
    setShowForm(true)
  }

  function openEdit(cam: any) {
    setForm({
      name: cam.name || '',
      manufacturer: cam.manufacturer || 'generic',
      model: cam.model || '',
      ip_address: cam.ip_address || '',
      http_port: cam.http_port || 80,
      rtsp_port: cam.rtsp_port || 554,
      rtsp_path: cam.rtsp_path || '/Streaming/Channels/101',
      username: cam.username || '',
      password: '',
      latitude: cam.latitude != null ? cam.latitude : '',
      longitude: cam.longitude != null ? cam.longitude : '',
      location_desc: cam.location_desc || '',
      active: cam.active !== false,
      analytics_enabled: cam.analytics_enabled || false,
      analytics_types: cam.analytics_types || [],
      notes: cam.notes || '',
      vpn_tunnel_id: cam.vpn_tunnel_id || '',
    })
    setEditingIp(cam)
    setShowForm(true)
  }

  function handleSave() {
    const payload: any = { ...form }
    if (payload.latitude === '') delete payload.latitude
    if (payload.longitude === '') delete payload.longitude
    if (payload.vpn_tunnel_id === '' || payload.vpn_tunnel_id === undefined) payload.vpn_tunnel_id = null
    // On edit, only send password if not empty
    if (editingIp && !payload.password) {
      delete payload.password
    }
    if (editingIp) {
      updateMut.mutate({ id: editingIp.id, d: payload })
    } else {
      createMut.mutate(payload)
    }
  }

  async function handleTestConnection(id: number) {
    setTestResult({ id, status: 'loading' })
    try {
      const { data } = await ipCamerasApi.testConnection(id)
      setTestResult({ id, status: data.ok || data.success ? 'ok' : 'error', msg: data.message || data.error })
    } catch (err: any) {
      setTestResult({ id, status: 'error', msg: err.response?.data?.error || 'Falha na conexão' })
    }
    setTimeout(() => setTestResult(null), 5000)
  }

  function toggleAnalyticsType(type: string) {
    setForm(prev => ({
      ...prev,
      analytics_types: prev.analytics_types.includes(type)
        ? prev.analytics_types.filter(t => t !== type)
        : [...prev.analytics_types, type],
    }))
  }

  const saving = createMut.isPending || updateMut.isPending
  const canSave = form.name && form.ip_address && form.username

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Monitor className="text-cyan-400" size={28} /> Câmeras IP Fixas
          </h1>
          <p className="text-gray-400 text-sm mt-1">Câmeras IP fixas (Hikvision, Intelbras, etc.) com streaming HLS</p>
        </div>
        {canEdit && (
          <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl font-medium transition-all">
            <Plus size={18} /> Nova Câmera IP
          </button>
        )}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>
      ) : ipCameras.length === 0 ? (
        <div className="text-center py-20">
          <Monitor size={48} className="mx-auto mb-4 text-gray-600" />
          <p className="text-gray-400 text-lg font-medium">Nenhuma câmera IP cadastrada</p>
          <p className="text-gray-500 text-sm mt-1">Adicione câmeras fixas Hikvision, Intelbras ou genéricas</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {ipCameras.map((cam: any) => (
            <div key={cam.id} className="bg-gray-800/50 border border-gray-700/50 rounded-xl overflow-hidden hover:border-gray-600 transition-all group">
              {/* Snapshot thumbnail */}
              <div className="aspect-video bg-black relative overflow-hidden">
                {cam.shinobi_monitor_id ? (
                  <>
                    <img
                      src={ipCamerasApi.snapshotUrl(cam.id, true) + `&token=${localStorage.getItem('iot_token') || ''}` + (snapshotBust ? `&_b=${snapshotBust}` : '')}
                      alt={cam.name}
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setShowLive(cam)}
                        className="flex items-center gap-2 px-4 py-2 bg-red-500/80 hover:bg-red-500 text-white rounded-xl font-medium transition-all"
                      >
                        <Play size={16} /> Ao Vivo
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-800 text-white/50">
                    <div className="text-center px-4">
                      <CameraOff size={28} className="mx-auto mb-2 text-white/40" />
                      <p className="text-sm font-medium">Aguardando sincronização</p>
                      <p className="text-xs mt-1 text-white/40">Clique em "Testar" para reconectar</p>
                    </div>
                  </div>
                )}
                {/* Status badge */}
                <div className={`absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cam.active ? 'bg-green-500/15 text-green-400 border-green-500/20' : 'bg-gray-700/50 text-gray-400 border-gray-600'}`}>
                  <Power size={10} /> {cam.active ? 'Ativa' : 'Inativa'}
                </div>
              </div>

              {/* Info */}
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-semibold truncate">{cam.name}</h3>
                    <p className="text-gray-500 text-xs font-mono mt-0.5">{cam.ip_address}:{cam.http_port}</p>
                  </div>
                </div>

                {/* Chips */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-500/15 text-blue-400 border border-blue-500/20 rounded-full text-xs">
                    <Camera size={10} /> {MANUFACTURERS.find(m => m.value === cam.manufacturer)?.label || cam.manufacturer}
                  </span>
                  {cam.model && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-700/50 text-gray-400 border border-gray-600 rounded-full text-xs">
                      {cam.model}
                    </span>
                  )}
                  {cam.location_desc && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-700/50 text-gray-400 border border-gray-600 rounded-full text-xs">
                      <MapPin size={10} /> {cam.location_desc}
                    </span>
                  )}
                  {cam.analytics_enabled && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-500/15 text-purple-400 border border-purple-500/20 rounded-full text-xs">
                      <Eye size={10} /> Analytics
                    </span>
                  )}
                </div>

                {/* Test connection result */}
                {testResult && testResult.id === cam.id && (
                  <div className={`mb-3 p-2 rounded-lg text-xs flex items-center gap-2 ${testResult.status === 'loading' ? 'bg-gray-700/50 text-gray-400' : testResult.status === 'ok' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                    {testResult.status === 'loading' && <Loader2 size={12} className="animate-spin" />}
                    {testResult.status === 'ok' && <CheckCircle size={12} />}
                    {testResult.status === 'error' && <XCircle size={12} />}
                    {testResult.status === 'loading' ? 'Testando conexão...' : testResult.msg || (testResult.status === 'ok' ? 'Conexão OK' : 'Falha')}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  <button onClick={() => setShowLive(cam)} className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg text-xs font-medium transition-all">
                    <Play size={12} /> Ao Vivo
                  </button>
                  <button onClick={() => handleTestConnection(cam.id)} className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20 rounded-lg text-xs font-medium transition-all">
                    <Wifi size={12} /> Testar
                  </button>
                  {canEdit && (
                    <button onClick={() => openEdit(cam)} className="flex items-center justify-center gap-1.5 py-2 px-3 bg-gray-700/50 hover:bg-gray-700 text-gray-300 border border-gray-600 rounded-lg text-xs font-medium transition-all">
                      <Edit2 size={12} />
                    </button>
                  )}
                  {isAdmin && (
                    <button onClick={() => setDeleteConfirm(cam)} className="flex items-center justify-center gap-1.5 py-2 px-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg text-xs font-medium transition-all">
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══ Delete Confirmation Modal ══ */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-gray-900 rounded-2xl w-full max-w-sm border border-gray-700 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle size={24} className="text-red-400 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="text-white font-semibold text-lg">Excluir câmera?</h3>
                <p className="text-gray-400 text-sm mt-1">
                  Tem certeza que deseja excluir <strong className="text-white">{deleteConfirm.name}</strong>? Esta ação não pode ser desfeita.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-sm font-medium transition-all">
                Cancelar
              </button>
              <button
                onClick={() => deleteMut.mutate(deleteConfirm.id)}
                disabled={deleteMut.isPending}
                className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
              >
                {deleteMut.isPending && <Loader2 size={14} className="animate-spin" />}
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Form Modal (Create/Edit) ══ */}
      {showForm && (
        <IpCameraFormModal
          form={form}
          setForm={setForm}
          editing={editingIp}
          saving={saving}
          canSave={!!canSave}
          onSave={handleSave}
          onClose={closeForm}
          toggleAnalyticsType={toggleAnalyticsType}
          error={createMut.error || updateMut.error}
        />
      )}

      {/* ══ Live View Modal (HLS) ══ */}
      {showLive && (
        <IpLiveModal camera={showLive} onClose={() => setShowLive(null)} />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// ═══  IP Camera Form Modal with Leaflet map  ═════════════════
// ═══════════════════════════════════════════════════════════════

function IpCameraFormModal({
  form,
  setForm,
  editing,
  saving,
  canSave,
  onSave,
  onClose,
  toggleAnalyticsType,
  error,
}: {
  form: IpCameraForm
  setForm: React.Dispatch<React.SetStateAction<IpCameraForm>>
  editing: any
  saving: boolean
  canSave: boolean
  onSave: () => void
  onClose: () => void
  toggleAnalyticsType: (type: string) => void
  error: any
}) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const [vpnTunnels, setVpnTunnels] = useState<any[]>([])

  useEffect(() => {
    vpnApi.list().then(r => setVpnTunnels(Array.isArray(r.data) ? r.data.filter((t: any) => t.enabled) : [])).catch(() => {})
  }, [])

  // Initialize Leaflet map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    const lat = typeof form.latitude === 'number' ? form.latitude : -15.78
    const lng = typeof form.longitude === 'number' ? form.longitude : -47.93

    const map = L.map(mapContainerRef.current, {
      center: [lat, lng],
      zoom: typeof form.latitude === 'number' ? 15 : 4,
      zoomControl: true,
    })

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', {
      attribution: '&copy; CartoDB',
      maxZoom: 19,
    }).addTo(map)

    // Add marker if coordinates exist
    if (typeof form.latitude === 'number' && typeof form.longitude === 'number') {
      const marker = L.marker([form.latitude, form.longitude], { draggable: true }).addTo(map)
      marker.on('dragend', () => {
        const pos = marker.getLatLng()
        setForm(prev => ({ ...prev, latitude: parseFloat(pos.lat.toFixed(6)), longitude: parseFloat(pos.lng.toFixed(6)) }))
      })
      markerRef.current = marker
    }

    // Click to place marker
    map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat: clickLat, lng: clickLng } = e.latlng
      setForm(prev => ({ ...prev, latitude: parseFloat(clickLat.toFixed(6)), longitude: parseFloat(clickLng.toFixed(6)) }))
      if (markerRef.current) {
        markerRef.current.setLatLng(e.latlng)
      } else {
        const marker = L.marker(e.latlng, { draggable: true }).addTo(map)
        marker.on('dragend', () => {
          const pos = marker.getLatLng()
          setForm(prev => ({ ...prev, latitude: parseFloat(pos.lat.toFixed(6)), longitude: parseFloat(pos.lng.toFixed(6)) }))
        })
        markerRef.current = marker
      }
    })

    mapRef.current = map

    // Delay invalidateSize to avoid rendering issues in modal
    setTimeout(() => map.invalidateSize(), 200)

    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync marker when lat/lng fields change externally (e.g. geolocation button)
  const syncMarkerToForm = useCallback((lat: number, lng: number) => {
    if (!mapRef.current) return
    const latlng = L.latLng(lat, lng)
    if (markerRef.current) {
      markerRef.current.setLatLng(latlng)
    } else {
      const marker = L.marker(latlng, { draggable: true }).addTo(mapRef.current)
      marker.on('dragend', () => {
        const pos = marker.getLatLng()
        setForm(prev => ({ ...prev, latitude: parseFloat(pos.lat.toFixed(6)), longitude: parseFloat(pos.lng.toFixed(6)) }))
      })
      markerRef.current = marker
    }
    mapRef.current.setView(latlng, 15)
  }, [setForm])

  function useMyLocation() {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = parseFloat(pos.coords.latitude.toFixed(6))
        const lng = parseFloat(pos.coords.longitude.toFixed(6))
        setForm(prev => ({ ...prev, latitude: lat, longitude: lng }))
        syncMarkerToForm(lat, lng)
      },
      () => { alert('Não foi possível obter a localização.') }
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div className="bg-gray-900 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gray-700" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <h2 className="text-lg font-bold text-white">{editing ? 'Editar' : 'Nova'} Câmera IP</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-lg"><X size={20} className="text-gray-400" /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Row: Name + Manufacturer */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Nome *</label>
              <input value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} placeholder="Ex: Entrada Principal" className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm focus:border-cyan-500/50 focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Fabricante</label>
              <select value={form.manufacturer} onChange={e => setForm(prev => ({ ...prev, manufacturer: e.target.value }))} className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm focus:border-cyan-500/50 focus:outline-none appearance-none">
                {MANUFACTURERS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row: Model */}
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Modelo</label>
            <input value={form.model} onChange={e => setForm(prev => ({ ...prev, model: e.target.value }))} placeholder="Ex: DS-2CD2143G2-I" className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm focus:border-cyan-500/50 focus:outline-none" />
          </div>

          {/* Row: IP + Ports */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">IP *</label>
              <input value={form.ip_address} onChange={e => setForm(prev => ({ ...prev, ip_address: e.target.value }))} placeholder="192.168.1.100" className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm font-mono focus:border-cyan-500/50 focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Porta HTTP</label>
              <input type="number" value={form.http_port} onChange={e => setForm(prev => ({ ...prev, http_port: parseInt(e.target.value) || 80 }))} className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm font-mono focus:border-cyan-500/50 focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Porta RTSP</label>
              <input type="number" value={form.rtsp_port} onChange={e => setForm(prev => ({ ...prev, rtsp_port: parseInt(e.target.value) || 554 }))} className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm font-mono focus:border-cyan-500/50 focus:outline-none" />
            </div>
          </div>

          {/* RTSP Path */}
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Caminho RTSP</label>
            <input value={form.rtsp_path} onChange={e => setForm(prev => ({ ...prev, rtsp_path: e.target.value }))} placeholder="/Streaming/Channels/101" className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm font-mono focus:border-cyan-500/50 focus:outline-none" />
          </div>

          {/* Credentials */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Usuário *</label>
              <input value={form.username} onChange={e => setForm(prev => ({ ...prev, username: e.target.value }))} placeholder="admin" className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm focus:border-cyan-500/50 focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">
                Senha {editing ? '' : '*'}
              </label>
              <input
                type="password"
                value={form.password}
                onChange={e => setForm(prev => ({ ...prev, password: e.target.value }))}
                placeholder={editing ? 'Deixe em branco para manter a atual' : 'Senha da câmera'}
                className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm focus:border-cyan-500/50 focus:outline-none"
              />
              {editing && (
                <p className="text-xs text-gray-600 mt-1">Deixe em branco para manter a senha atual</p>
              )}
            </div>
          </div>

          {/* VPN / Rede */}
          {vpnTunnels.length > 0 && (
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">VPN / Rede</label>
              <select value={form.vpn_tunnel_id} onChange={e => setForm(prev => ({ ...prev, vpn_tunnel_id: e.target.value === '' ? '' : Number(e.target.value) }))}
                className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm focus:border-cyan-500/50 focus:outline-none appearance-none">
                <option value="">Direto (IP público)</option>
                {vpnTunnels.map((v: any) => (
                  <option key={v.id} value={v.id}>{v.name} ({v.interface_name}) — {(v.allowed_ips || []).join(', ')}</option>
                ))}
              </select>
              <p className="text-xs text-gray-600 mt-1">Se a câmera está atrás de uma VPN, selecione o tunnel aqui</p>
            </div>
          )}

          {/* Location description */}
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Descrição do local</label>
            <input value={form.location_desc} onChange={e => setForm(prev => ({ ...prev, location_desc: e.target.value }))} placeholder="Ex: Portaria principal, Galpão 3" className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm focus:border-cyan-500/50 focus:outline-none" />
          </div>

          {/* Map */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm text-gray-400">Localização no mapa</label>
              <button type="button" onClick={useMyLocation} className="flex items-center gap-1 px-3 py-1 bg-gray-800 hover:bg-gray-700 text-cyan-400 border border-gray-700 rounded-lg text-xs font-medium transition-all">
                <LocateFixed size={12} /> Usar minha localização
              </button>
            </div>
            <div ref={mapContainerRef} className="w-full h-48 rounded-xl overflow-hidden border border-gray-700" />
            <div className="grid grid-cols-2 gap-4 mt-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Latitude</label>
                <input
                  type="number"
                  step="0.000001"
                  value={form.latitude}
                  onChange={e => {
                    const val = e.target.value === '' ? '' as const : parseFloat(e.target.value)
                    setForm(prev => ({ ...prev, latitude: val }))
                    if (typeof val === 'number' && typeof form.longitude === 'number') {
                      syncMarkerToForm(val, form.longitude)
                    }
                  }}
                  placeholder="-15.780000"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs font-mono focus:border-cyan-500/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Longitude</label>
                <input
                  type="number"
                  step="0.000001"
                  value={form.longitude}
                  onChange={e => {
                    const val = e.target.value === '' ? '' as const : parseFloat(e.target.value)
                    setForm(prev => ({ ...prev, longitude: val }))
                    if (typeof val === 'number' && typeof form.latitude === 'number') {
                      syncMarkerToForm(form.latitude, val)
                    }
                  }}
                  placeholder="-47.930000"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs font-mono focus:border-cyan-500/50 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Active toggle */}
          <div className="flex items-center justify-between bg-gray-800/50 border border-gray-700/50 rounded-xl p-4">
            <div>
              <p className="text-white text-sm font-medium">Câmera ativa</p>
              <p className="text-gray-500 text-xs">Desative para parar o monitoramento sem excluir</p>
            </div>
            <button
              type="button"
              onClick={() => setForm(prev => ({ ...prev, active: !prev.active }))}
              className={`relative w-11 h-6 rounded-full transition-colors ${form.active ? 'bg-cyan-500' : 'bg-gray-600'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${form.active ? 'translate-x-5' : ''}`} />
            </button>
          </div>

          {/* Analytics toggle */}
          <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white text-sm font-medium">Analytics (IA)</p>
                <p className="text-gray-500 text-xs">Ativar análise inteligente de vídeo</p>
              </div>
              <button
                type="button"
                onClick={() => setForm(prev => ({ ...prev, analytics_enabled: !prev.analytics_enabled, analytics_types: !prev.analytics_enabled ? prev.analytics_types : [] }))}
                className={`relative w-11 h-6 rounded-full transition-colors ${form.analytics_enabled ? 'bg-purple-500' : 'bg-gray-600'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${form.analytics_enabled ? 'translate-x-5' : ''}`} />
              </button>
            </div>

            {form.analytics_enabled && (
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-700/50">
                {ANALYTICS_TYPES_OPTIONS.map(opt => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer group">
                    <div
                      onClick={() => toggleAnalyticsType(opt.value)}
                      className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                        form.analytics_types.includes(opt.value)
                          ? 'bg-purple-500 border-purple-400'
                          : 'bg-gray-700 border-gray-600 group-hover:border-gray-500'
                      }`}
                    >
                      {form.analytics_types.includes(opt.value) && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span className="text-xs text-gray-300">{opt.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Observações</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Anotações internas sobre esta câmera..."
              rows={2}
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm focus:border-cyan-500/50 focus:outline-none resize-none"
            />
          </div>

          {/* Errors */}
          {/* Webhook URL (edit only) */}
          {editing && <WebhookSection cameraId={editing.id} />}

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
              <p className="text-red-400 text-sm">{(error as any)?.response?.data?.error || 'Erro ao salvar'}</p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-medium transition-all">Cancelar</button>
            <button
              onClick={onSave}
              disabled={saving || !canSave}
              className="flex-1 py-2.5 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-30 text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2"
            >
              {saving && <Loader2 size={16} className="animate-spin" />}
              {editing ? 'Salvar' : 'Cadastrar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// ═══  IP Live View Modal (HLS.js + MJPEG fallback)  ════════════
// ═══════════════════════════════════════════════════════════════

function IpLiveModal({ camera, onClose }: { camera: any; onClose: () => void }) {
  const [status, setStatus] = useState<'loading' | 'syncing' | 'playing' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [streamMode, setStreamMode] = useState<'hls' | 'mjpeg' | null>(null)
  const [mjpegUrl, setMjpegUrl] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<any>(null)

  useEffect(() => {
    let cancelled = false
    async function startStream() {
      try {
        let info: any = null
        try {
          const { data } = await ipCamerasApi.streamInfo(camera.id)
          info = data
        } catch (err: any) {
          if (err.response?.status === 409) {
            if (cancelled) return
            setStatus('syncing')
            try {
              await ipCamerasApi.testConnection(camera.id)
              const { data } = await ipCamerasApi.streamInfo(camera.id)
              info = data
            } catch (syncErr: any) {
              if (!cancelled) {
                setStatus('error')
                setErrorMsg('Câmera não sincronizada com o servidor de stream. Clique em "Testar" no card da câmera e aguarde 15s.')
              }
              return
            }
          } else {
            throw err
          }
        }
        if (cancelled || !info) return

        const token = localStorage.getItem('iot_token') || ''

        // Try HLS first
        if (info.hls) {
          const hlsUrl = info.hls + (info.hls.includes('?') ? '&' : '?') + 'token=' + token
          const Hls = (await import('hls.js')).default
          if (Hls.isSupported() && videoRef.current) {
            const hls = new Hls({
              enableWorker: false,
              lowLatencyMode: true,
              backBufferLength: 10,
              xhrSetup: (xhr: any) => {
                xhr.setRequestHeader('Authorization', 'Bearer ' + token)
              }
            })
            hlsRef.current = hls
            hls.loadSource(hlsUrl)
            hls.attachMedia(videoRef.current)
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              if (!cancelled) {
                videoRef.current?.play().catch(() => {})
                setStreamMode('hls')
                setStatus('playing')
              }
            })
            hls.on(Hls.Events.ERROR, (_: any, data: any) => {
              if (data.fatal && !cancelled) {
                hls.destroy()
                if (info.mjpeg) {
                  setMjpegUrl(info.mjpeg + (info.mjpeg.includes('?') ? '&' : '?') + 'token=' + token)
                  setStreamMode('mjpeg')
                  setStatus('playing')
                } else {
                  setStatus('error')
                  setErrorMsg('HLS indisponível. Verifique se o Shinobi está processando o stream.')
                }
              }
            })
            return
          } else if (videoRef.current?.canPlayType('application/vnd.apple.mpegurl')) {
            videoRef.current.src = hlsUrl
            videoRef.current.play().catch(() => {})
            setStreamMode('hls')
            setStatus('playing')
            return
          }
        }

        // Fallback: MJPEG
        if (info.mjpeg) {
          setMjpegUrl(info.mjpeg + (info.mjpeg.includes('?') ? '&' : '?') + 'token=' + token)
          setStreamMode('mjpeg')
          setStatus('playing')
          return
        }

        setStatus('error')
        setErrorMsg('Nenhum stream disponível para esta câmera.')
      } catch (err: any) {
        if (!cancelled) {
          setStatus('error')
          setErrorMsg(err.response?.data?.error || err.message || 'Falha ao obter informações do stream.')
        }
      }
    }
    startStream()
    return () => {
      cancelled = true
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    }
  }, [camera.id])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90" onClick={onClose}>
      <div className="w-full max-w-4xl relative" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            {status === 'playing' && (
              <div className="flex items-center gap-1 px-2 py-1 bg-red-500/30 border border-red-500/40 rounded-full">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs text-red-300 font-medium">AO VIVO</span>
              </div>
            )}
            {status === 'syncing' && (
              <div className="flex items-center gap-1 px-2 py-1 bg-amber-500/30 border border-amber-500/40 rounded-full">
                <Loader2 size={10} className="animate-spin text-amber-300" />
                <span className="text-xs text-amber-300 font-medium">SINCRONIZANDO</span>
              </div>
            )}
            <h3 className="text-white font-semibold">{camera.name}</h3>
            <span className="text-gray-500 text-sm font-mono">{camera.ip_address}</span>
            {streamMode && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700">
                {streamMode === 'hls' ? '📡 HLS' : '🎥 MJPEG'}
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-2 bg-black/60 hover:bg-black/80 rounded-full">
            <X size={20} className="text-white" />
          </button>
        </div>

        <div className="aspect-video bg-black rounded-xl overflow-hidden relative">
          <video
            ref={videoRef}
            className={`w-full h-full object-contain ${streamMode === 'hls' ? 'block' : 'hidden'}`}
            autoPlay
            muted
            playsInline
            controls
          />
          {streamMode === 'mjpeg' && mjpegUrl && (
            <img
              src={mjpegUrl}
              alt={camera.name}
              className="w-full h-full object-contain"
              onLoad={() => setStatus('playing')}
              onError={() => { setStatus('error'); setErrorMsg('Stream MJPEG desconectado') }}
            />
          )}
          {(status === 'loading' || status === 'syncing') && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">
              <Loader2 size={40} className="animate-spin text-cyan-400 mb-3" />
              <p className="text-gray-400 text-sm">
                {status === 'syncing' ? 'Sincronizando câmera com servidor de stream...' : 'Conectando ao stream...'}
              </p>
              <p className="text-gray-600 text-xs mt-1">
                {status === 'syncing' ? 'Aguarde até 30 segundos' : 'Tentando HLS → MJPEG'}
              </p>
            </div>
          )}
          {status === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">
              <AlertTriangle size={40} className="text-red-400 mb-3" />
              <p className="text-red-400 font-medium mb-1">Falha no stream</p>
              <p className="text-gray-500 text-sm text-center max-w-md px-4">{errorMsg}</p>
              <button
                onClick={() => { setStatus('loading'); setStreamMode(null); setMjpegUrl(null); setErrorMsg('') }}
                className="mt-4 px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/30 rounded-xl text-sm font-medium transition-all"
              >
                🔄 Tentar novamente
              </button>
            </div>
          )}
        </div>

        {status === 'playing' && (
          <div className="mt-2 flex items-center justify-between text-xs text-gray-600">
            <span>{(camera.manufacturer || 'generic').toUpperCase()} · {camera.ip_address}:{camera.rtsp_port || 554}</span>
            <span>{streamMode === 'hls' ? 'Baixa latência via HLS' : 'Stream MJPEG'}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ═══  Shared helpers  ═════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-800/30 rounded-lg p-3">
      <p className="text-gray-500 text-xs">{label}</p>
      <p className="text-white text-sm font-medium mt-0.5">{value}</p>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// ═══  EVENTS TAB  ═════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════

const EVENT_TYPE_INFO: Record<string, { icon: string; label: string }> = {
  motion: { icon: '🏃', label: 'Movimento' },
  lpr: { icon: '🚗', label: 'Placa (LPR)' },
  intrusion: { icon: '🚨', label: 'Intrusão' },
  line_crossing: { icon: '↔️', label: 'Cruzamento' },
  face: { icon: '👤', label: 'Face' },
  person: { icon: '🚶', label: 'Pessoa' },
  tampering: { icon: '🔧', label: 'Adulteração' },
  unknown: { icon: '❔', label: 'Desconhecido' },
}

const SEVERITY_BORDER: Record<string, string> = {
  info: 'border-l-gray-500',
  warning: 'border-l-yellow-500',
  critical: 'border-l-red-500',
}

function fmtRelative(iso: string) {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60000) return `${Math.round(ms / 1000)}s atrás`
  if (ms < 3600000) return `${Math.round(ms / 60000)}min atrás`
  if (ms < 86400000) return `${Math.round(ms / 3600000)}h atrás`
  return `${Math.round(ms / 86400000)}d atrás`
}

function EventsTab() {
  const [events, setEvents] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [cameras, setCameras] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<any>(null)
  const [newCount, setNewCount] = useState(0)
  const lastMaxId = useRef(0)

  // Filters
  const [filterCam, setFilterCam] = useState<string>('')
  const [filterType, setFilterType] = useState<string>('')
  const [filterSev, setFilterSev] = useState<string>('')
  const [filterHours, setFilterHours] = useState<number>(24)

  useEffect(() => {
    ipCamerasApi.list().then(r => {
      const d = r.data
      setCameras(Array.isArray(d) ? d : [])
    }).catch(() => {})
  }, [])

  useEffect(() => {
    setNewCount(0)
    load(true)
  }, [filterCam, filterType, filterSev, filterHours])

  useEffect(() => {
    const i = setInterval(() => load(false), 10000)
    return () => clearInterval(i)
  }, [filterCam, filterType, filterSev, filterHours])

  async function load(reset: boolean) {
    try {
      const since = filterHours > 0
        ? new Date(Date.now() - filterHours * 3600000).toISOString()
        : undefined
      const { data } = await eventsApi.list({
        camera_id: filterCam || undefined,
        event_type: filterType || undefined,
        severity: filterSev || undefined,
        since,
        limit: 50,
      })
      const list = Array.isArray(data.events) ? data.events : []
      if (reset) {
        setEvents(list)
        setTotal(data.total || 0)
        lastMaxId.current = list[0]?.id ? Number(list[0].id) : 0
        setLoading(false)
      } else {
        const newest = list.filter((e: any) => Number(e.id) > lastMaxId.current)
        if (newest.length > 0) setNewCount(prev => prev + newest.length)
      }
    } catch {
      setLoading(false)
    }
  }

  function showLatest() {
    setNewCount(0)
    load(true)
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <AlertTriangle className="text-cyan-400" size={22} /> Eventos
          </h2>
          <p className="text-gray-400 text-sm mt-1">{total} evento{total !== 1 ? 's' : ''} no período</p>
        </div>
        {newCount > 0 && (
          <button onClick={showLatest}
            className="bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 px-4 py-2 rounded-xl font-medium animate-pulse text-sm">
            ⬆ {newCount} novo{newCount !== 1 ? 's' : ''}
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <label className="block text-xs">
          <span className="text-gray-400 block mb-1">Câmera</span>
          <select value={filterCam} onChange={e => setFilterCam(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-xs">
            <option value="">Todas</option>
            {cameras.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="block text-xs">
          <span className="text-gray-400 block mb-1">Tipo</span>
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-xs">
            <option value="">Todos</option>
            {Object.entries(EVENT_TYPE_INFO).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
          </select>
        </label>
        <label className="block text-xs">
          <span className="text-gray-400 block mb-1">Severidade</span>
          <select value={filterSev} onChange={e => setFilterSev(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-xs">
            <option value="">Todas</option>
            <option value="info">Info</option>
            <option value="warning">Atenção</option>
            <option value="critical">Crítico</option>
          </select>
        </label>
        <label className="block text-xs">
          <span className="text-gray-400 block mb-1">Período</span>
          <select value={filterHours} onChange={e => setFilterHours(Number(e.target.value))}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-xs">
            <option value={1}>Última hora</option>
            <option value={24}>Últimas 24h</option>
            <option value={168}>Últimos 7 dias</option>
            <option value={0}>Tudo</option>
          </select>
        </label>
      </div>

      {loading && events.length === 0 && <p className="text-gray-400 mt-6">Carregando…</p>}

      {!loading && events.length === 0 && (
        <div className="text-center py-12 text-gray-500 border border-dashed border-gray-700 rounded-xl">
          Nenhum evento no período selecionado.
        </div>
      )}

      <div className="space-y-2">
        {events.map((ev: any) => {
          const info = EVENT_TYPE_INFO[ev.event_type] || EVENT_TYPE_INFO.unknown
          const border = SEVERITY_BORDER[ev.severity] || SEVERITY_BORDER.info
          const payload = typeof ev.payload === 'string' ? JSON.parse(ev.payload) : (ev.payload || {})
          const headline = payload.plate ? `Placa ${payload.plate}` : payload.description || payload.parse_error || null
          const camName = cameras.find((c: any) => c.id === ev.camera_id)?.name
          return (
            <button key={ev.id} onClick={() => setSelected(ev)}
              className={`w-full bg-gray-800/60 border border-gray-700/50 ${border} border-l-4 rounded-xl p-3 hover:bg-gray-800 transition-colors text-left flex gap-3 items-stretch`}>
              <div className="w-28 aspect-video bg-gray-900 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden">
                {ev.snapshot_url ? (
                  <img src={ev.snapshot_url} alt="" className="w-full h-full object-cover"
                       onError={e => { (e.target as HTMLImageElement).style.opacity = '0.2' }} />
                ) : (
                  <span className="text-2xl opacity-30">{info.icon}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-base">{info.icon}</span>
                  <span className="font-medium text-white">{info.label}</span>
                  <span className="text-xs text-gray-500">{fmtRelative(ev.received_at)}</span>
                  {ev.severity === 'critical' && (
                    <span className="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/30">CRÍTICO</span>
                  )}
                </div>
                <div className="text-sm text-gray-300 mt-1 truncate">
                  {camName && <span className="text-gray-500">📷 {camName} · </span>}
                  {headline || <span className="text-gray-600 italic">sem descrição</span>}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {new Date(ev.occurred_at).toLocaleString('pt-BR')}
                  {ev.dispatch_status === 'selected' && ev.dispatched_to_wf_username && (
                    <span className="ml-2 text-cyan-300">📍 → {ev.dispatched_to_wf_username}{ev.dispatched_to_distance_m != null && ` (${(ev.dispatched_to_distance_m/1000).toFixed(1)}km)`}</span>
                  )}
                  {ev.dispatch_status === 'no_agent_in_radius' && <span className="ml-2 text-amber-400">⚠ sem agente no raio</span>}
                  {ev.dispatch_status === 'traccar_error' && <span className="ml-2 text-red-400">❌ erro Traccar</span>}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
               onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-800">
              <div>
                <h3 className="text-lg font-bold text-white">Evento #{selected.id} — {(EVENT_TYPE_INFO[selected.event_type] || EVENT_TYPE_INFO.unknown).label}</h3>
                <p className="text-gray-500 text-sm mt-1">
                  {cameras.find((c: any) => c.id === selected.camera_id)?.name || `Câmera ${selected.camera_id}`}
                </p>
              </div>
              <button onClick={() => setSelected(null)} className="p-2 hover:bg-gray-800 rounded-lg">
                <X size={20} className="text-gray-400" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {selected.snapshot_url ? (
                <img src={selected.snapshot_url} alt="snapshot" className="w-full max-h-[400px] object-contain bg-black rounded-xl" />
              ) : (
                <div className="bg-gray-800/50 rounded-xl p-8 text-center text-gray-500">Sem snapshot</div>
              )}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-gray-800/30 rounded-lg p-3"><p className="text-gray-500 text-xs">Tipo</p><p className="text-white">{selected.event_type}</p></div>
                <div className="bg-gray-800/30 rounded-lg p-3"><p className="text-gray-500 text-xs">Severidade</p><p className="text-white">{selected.severity}</p></div>
                <div className="bg-gray-800/30 rounded-lg p-3"><p className="text-gray-500 text-xs">Ocorrido em</p><p className="text-white">{new Date(selected.occurred_at).toLocaleString('pt-BR')}</p></div>
                <div className="bg-gray-800/30 rounded-lg p-3"><p className="text-gray-500 text-xs">Recebido em</p><p className="text-white">{new Date(selected.received_at).toLocaleString('pt-BR')}</p></div>
              </div>
              {(() => {
                const p = typeof selected.payload === 'string' ? JSON.parse(selected.payload) : (selected.payload || {})
                const keys = Object.keys(p)
                if (!keys.length) return null
                return (
                  <div>
                    <h4 className="text-sm font-medium text-gray-300 mb-2">Dados extraídos</h4>
                    <div className="bg-gray-800/50 rounded-xl p-3 grid grid-cols-2 gap-2 text-xs">
                      {keys.map(k => (
                        <div key={k}><span className="text-gray-400">{k}:</span>{' '}<span className="text-white">{typeof p[k] === 'object' ? JSON.stringify(p[k]) : String(p[k] ?? '—')}</span></div>
                      ))}
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// ═══  WEBHOOK SECTION (in camera edit form)  ══════════════════
// ═══════════════════════════════════════════════════════════════

function WebhookSection({ cameraId }: { cameraId: number }) {
  const [url, setUrl] = useState<string>('')
  const [show, setShow] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    eventsApi.getWebhookUrl(cameraId).then(r => setUrl(r.data?.url || '')).catch(() => {})
  }, [cameraId])

  async function copyUrl() {
    if (!url) return
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function regenerate() {
    if (!confirm('Regenerar token vai INVALIDAR a URL atual. Continuar?')) return
    setRegenerating(true)
    try {
      await eventsApi.regenerateToken(cameraId)
      const fresh = await eventsApi.getWebhookUrl(cameraId)
      setUrl(fresh.data?.url || '')
    } finally { setRegenerating(false) }
  }

  return (
    <div className="border-t border-gray-800 pt-4 mt-4">
      <button type="button" onClick={() => setShow(s => !s)}
        className="text-sm text-gray-300 hover:text-white font-medium">
        {show ? '▼' : '▶'} 🔗 Webhook (eventos)
      </button>
      {show && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-gray-500">
            Configure esta URL no painel da câmera. Hikvision: System → Network → HTTP Listening. Intelbras: Eventos → Push HTTP.
          </p>
          <div className="flex gap-2">
            <input readOnly value={url || 'carregando…'}
              className="flex-1 bg-gray-950 border border-gray-700 rounded-xl px-3 py-2 text-xs text-cyan-300 font-mono" />
            <button type="button" onClick={copyUrl}
              className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded-xl text-xs">
              {copied ? '✓ Copiado' : '📋 Copiar'}
            </button>
          </div>
          <button type="button" onClick={regenerate} disabled={regenerating}
            className="text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 px-3 py-1.5 rounded-xl disabled:opacity-50">
            {regenerating ? 'Regenerando…' : '🔄 Regenerar token (invalida URL atual)'}
          </button>
        </div>
      )}
    </div>
  )
}

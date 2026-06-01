// TODO Google Maps migration: esta tela usa Polyline (rota), Polygon e Circle (geofences),
// useMapEvents (drawMode) e divIcon customizados do react-leaflet. Manter em Leaflet até
// re-implementar essas primitivas com google.maps.Polyline/Polygon/Circle e DrawingManager.
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { traccarApi } from '../services/api'
import {
  MapPin, Wifi, WifiOff, Settings, RefreshCw, Navigation, Gauge, Battery,
  X, Loader2, Plus, Trash2, ExternalLink, Zap, Power, PowerOff, Send,
  Shield, Bell, FileText, Clock, ChevronRight, Layers, PenTool,
  Circle, Square, AlertTriangle, Play, StopCircle, Eye, Download, Pencil
} from 'lucide-react'
import { MapContainer, TileLayer, Popup, Polyline, Circle as LCircle, Polygon, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import '../setupLeafletCluster' // expõe window.L = L ANTES do plugin (senão markerClusterGroup fica undefined)
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import 'leaflet.markercluster'
import { BASE_LAYERS, useBaseLayer, BaseLayerToggle } from '../components/MapBase'
import { MapErrorBoundary } from '../components/MapErrorBoundary'

// ═══════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════

const CATEGORY_ICONS: Record<string, string> = {
  car: '🚗', truck: '🚛', motorcycle: '🏍️', bus: '🚌', boat: '⛵',
  person: '👤', bicycle: '🚲', animal: '🐾', default: '📍'
}

const knotsToKmh = (knots: number) => (knots * 1.852).toFixed(1)

// ════════════════════════════════════════════════════════════
// Markers agrupados (leaflet.markercluster) — evita "borrão" de
// viaturas paradas no mesmo endereço. Cor reflete estado:
// cinza=parado/congelado (frozen), verde=movendo, ciano=ativo.
// ════════════════════════════════════════════════════════════
function ClusteredMarkers({ devices, selectedId, onSelect }: {
  devices: any[]
  selectedId?: number
  onSelect: (d: any) => void
}) {
  const map = useMap()
  const layerRef = useRef<any>(null)

  useEffect(() => {
    if (!map) return
    let cancelled = false
    const Lx = L as any

    const ensureGroup = () => {
      if (!layerRef.current) {
        layerRef.current = typeof Lx.markerClusterGroup === 'function'
          ? Lx.markerClusterGroup({
              maxClusterRadius: 40,
              spiderfyOnMaxZoom: true,
              showCoverageOnHover: false,
              disableClusteringAtZoom: 18,
            })
          : L.layerGroup()
        map.addLayer(layerRef.current)
      }
      return layerRef.current
    }

    const build = () => {
      if (cancelled) return
      const valid = (devices || []).filter((d: any) => Number.isFinite(d.lat) && Number.isFinite(d.lng))
      if (valid.length === 0) return // não limpa em frames vazios transientes (evita flicker)
      const grp = ensureGroup()
      grp.clearLayers()
      valid.forEach((d: any) => {
        const kmh = (d.speed || 0) * 1.852
        const color = d.frozen ? '#64748b' : (kmh > 3 ? '#10b981' : '#06b6d4')
        const sel = d.id === selectedId
        const size = sel ? 22 : 16
        const icon = L.divIcon({
          className: '',
          html: `<div style="background:${color};width:${size}px;height:${size}px;border-radius:50%;border:3px solid ${sel ? '#fbbf24' : '#fff'};box-shadow:0 2px 6px rgba(0,0,0,.4);"></div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        })
        const mk = L.marker([d.lat, d.lng], { icon, title: d.name })
        mk.on('click', () => onSelect(d))
        if (d.name) mk.bindTooltip(`${d.name} — ${knotsToKmh(d.speed || 0)} km/h${d.frozen ? ' · parado' : ''}`)
        grp.addLayer(mk)
      })
      // markercluster só projeta os ícones com o mapa já dimensionado e com view
      // pronta; num container flex isso atrasa. Recalcula tamanho + clusters.
      try {
        map.invalidateSize(false)
        if (typeof grp.refreshClusters === 'function') grp.refreshClusters()
        // nuclear: re-anexa o grupo p/ forçar onAdd/re-render com o tamanho atual
        if (map.hasLayer(grp)) { map.removeLayer(grp); map.addLayer(grp) }
      } catch {}
    }

    // espera a view inicial do mapa (whenReady) e ainda re-tenta após o layout assentar
    map.whenReady(build)
    const ts = [120, 450, 1000, 2000].map(d => setTimeout(build, d))
    return () => { cancelled = true; ts.forEach(clearTimeout) }
  }, [map, devices, selectedId, onSelect])

  useEffect(() => {
    return () => {
      if (map && layerRef.current) {
        map.removeLayer(layerRef.current)
        layerRef.current = null
      }
    }
  }, [map])

  return null
}
const metersToKm = (m: number) => (m / 1000).toFixed(1)

const timeAgo = (dateStr: string) => {
  if (!dateStr) return 'N/A'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

const todayRange = () => {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const to = now.toISOString()
  return { from, to }
}

type Tab = 'devices' | 'groups' | 'geofences' | 'alerts'
type Modal = null | 'config' | 'addDevice' | 'editDevice' | 'reports' | 'commands' | 'addGeofence' | 'addGroup' | 'addNotification'

// ═══════════════════════════════════════════════
// Map sub-components
// ═══════════════════════════════════════════════

function FlyTo({ lat, lng, zoom }: { lat: number; lng: number; zoom?: number }) {
  const map = useMap()
  useEffect(() => { if (lat && lng) map.flyTo([lat, lng], zoom || 15, { duration: 1 }) }, [lat, lng])
  return null
}

function DrawCircle({ onDraw }: { onDraw: (center: [number, number], radius: number) => void }) {
  const [center, setCenter] = useState<[number, number] | null>(null)
  const [radius, setRadius] = useState(0)
  useMapEvents({
    click(e) {
      if (!center) { setCenter([e.latlng.lat, e.latlng.lng]) }
      else { onDraw(center, radius || 500); setCenter(null); setRadius(0) }
    },
    mousemove(e) {
      if (center) {
        const dist = e.latlng.distanceTo(L.latLng(center[0], center[1]))
        setRadius(Math.round(dist))
      }
    }
  })
  if (!center) return null
  return <LCircle center={center} radius={radius || 100} pathOptions={{ color: '#06b6d4', fillOpacity: 0.15 }} />
}

// ═══════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════

export default function Trackers() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('devices')
  const [modal, setModal] = useState<Modal>(null)
  const [selected, setSelected] = useState<any>(null)
  const [filter, setFilter] = useState('all')
  const [groupFilter, setGroupFilter] = useState<number | null>(null)
  const [routeData, setRouteData] = useState<any[]>([])
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number } | null>(null)
  const [activeLayer, setActiveLayer] = useBaseLayer()
  const tileLayer = BASE_LAYERS[activeLayer]
  const [drawMode, setDrawMode] = useState<'circle' | 'polygon' | null>(null)
  const [polygonPoints, setPolygonPoints] = useState<[number, number][]>([])
  const [reportTab, setReportTab] = useState('route')
  const [reportPeriod, setReportPeriod] = useState('today')
  const [reportFrom, setReportFrom] = useState('')
  const [reportTo, setReportTo] = useState('')
  const [reportData, setReportData] = useState<any>(null)
  const [reportLoading, setReportLoading] = useState(false)

  // ── Forms ──
  const [configForm, setConfigForm] = useState({ serverUrl: '', adminUser: 'admin@groupates.com', adminPass: 'Admin@2024!' })
  const [addForm, setAddForm] = useState({ name: '', uniqueId: '', phone: '', model: '', category: 'car', groupId: 0 })
  const [editing, setEditing] = useState<any>(null)
  const [editForm, setEditForm] = useState({ name: '', uniqueId: '', phone: '', model: '', category: 'car', groupId: 0 })
  const [geofenceForm, setGeofenceForm] = useState({ name: '', description: '', area: '', type: 'circle' as 'circle' | 'polygon' })
  const [groupForm, setGroupForm] = useState({ name: '' })
  const [notifForm, setNotifForm] = useState({ type: 'deviceOnline', notificators: 'web' })
  const [commandForm, setCommandForm] = useState({ type: '', attributes: {} as any })

  // ── Queries ──
  const { data: status, refetch: refetchStatus } = useQuery({
    queryKey: ['traccar-status'],
    queryFn: () => traccarApi.status().then(r => r.data),
    refetchInterval: 60000,
  })

  const { data: devices = [], isLoading: loadingDevices, refetch: refetchDevices } = useQuery({
    queryKey: ['traccar-devices'],
    queryFn: () => traccarApi.devices().then(r => r.data),
    enabled: !!status?.connected,
    refetchInterval: 10000,
  })

  const { data: groups = [] } = useQuery({
    queryKey: ['traccar-groups'],
    queryFn: () => traccarApi.groups().then(r => r.data),
    enabled: !!status?.connected,
  })

  const { data: geofences = [], refetch: refetchGeofences } = useQuery({
    queryKey: ['traccar-geofences'],
    queryFn: () => traccarApi.geofences().then(r => r.data),
    enabled: !!status?.connected,
  })

  const { data: notifications = [], refetch: refetchNotifications } = useQuery({
    queryKey: ['traccar-notifications'],
    queryFn: () => traccarApi.notifications().then(r => r.data),
    enabled: !!status?.connected,
  })

  const { data: mapUrlData } = useQuery({
    queryKey: ['traccar-map-url'],
    queryFn: () => traccarApi.mapUrl().then(r => r.data),
    enabled: !!status?.connected,
  })

  // ── Mutations ──
  const configureMut = useMutation({
    mutationFn: (d: any) => traccarApi.configure(d),
    onSuccess: () => { setModal(null); refetchStatus(); qc.invalidateQueries({ queryKey: ['traccar-devices'] }) },
  })
  const autoConfigMut = useMutation({
    mutationFn: () => traccarApi.autoConfigure(),
    onSuccess: () => { refetchStatus(); qc.invalidateQueries({ queryKey: ['traccar-devices'] }) },
  })
  const addDeviceMut = useMutation({
    mutationFn: (d: any) => traccarApi.createDevice(d),
    onSuccess: () => { setModal(null); setAddForm({ name: '', uniqueId: '', phone: '', model: '', category: 'car', groupId: 0 }); refetchDevices() },
  })
  const editDeviceMut = useMutation({
    mutationFn: (d: any) => traccarApi.updateDevice(editing!.id, { id: editing!.id, ...d }),
    onSuccess: (r: any) => {
      // Mantém selecionado atualizado com novos campos
      const updated = r?.data || r
      if (updated && selected?.id === editing?.id) setSelected({ ...selected, ...updated })
      setEditing(null); setModal(null); refetchDevices()
    },
  })
  const deleteDeviceMut = useMutation({
    mutationFn: (id: number) => traccarApi.deleteDevice(id),
    onSuccess: () => { setSelected(null); refetchDevices() },
  })
  const createGroupMut = useMutation({
    mutationFn: (d: any) => traccarApi.createGroup(d),
    onSuccess: () => { setModal(null); setGroupForm({ name: '' }); qc.invalidateQueries({ queryKey: ['traccar-groups'] }) },
  })
  const deleteGroupMut = useMutation({
    mutationFn: (id: number) => traccarApi.deleteGroup(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['traccar-groups'] }),
  })
  const createGeofenceMut = useMutation({
    mutationFn: (d: any) => traccarApi.createGeofence(d),
    onSuccess: () => { setModal(null); setGeofenceForm({ name: '', description: '', area: '', type: 'circle' }); refetchGeofences() },
  })
  const deleteGeofenceMut = useMutation({
    mutationFn: (id: number) => traccarApi.deleteGeofence(id),
    onSuccess: () => refetchGeofences(),
  })
  const createNotifMut = useMutation({
    mutationFn: (d: any) => traccarApi.createNotification(d),
    onSuccess: () => { setModal(null); refetchNotifications() },
  })
  const deleteNotifMut = useMutation({
    mutationFn: (id: number) => traccarApi.deleteNotification(id),
    onSuccess: () => refetchNotifications(),
  })
  const sendCommandMut = useMutation({
    mutationFn: (d: any) => traccarApi.sendCommand(d),
    onSuccess: () => { alert('Comando enviado!'); setModal(null) },
  })

  // ── Computed ──
  const filteredDevices = useMemo(() => {
    let list = devices
    if (filter === 'online') list = list.filter((d: any) => d.status === 'online')
    if (filter === 'offline') list = list.filter((d: any) => d.status !== 'online')
    if (groupFilter) list = list.filter((d: any) => d.groupId === groupFilter)
    return list
  }, [devices, filter, groupFilter])

  const onlineCount = devices.filter((d: any) => d.status === 'online').length
  const offlineCount = devices.length - onlineCount

  const mapCenter: [number, number] = useMemo(() => {
    const d = devices.find((d: any) => d.lat && d.lng)
    return d ? [d.lat, d.lng] : [-15.7942, -47.8822]
  }, [devices])

  // ── Load route for selected device ──
  const loadRoute = useCallback(async (deviceId: number) => {
    const { from, to } = todayRange()
    try {
      const r = await traccarApi.history(deviceId, from, to)
      setRouteData(r.data || [])
    } catch { setRouteData([]) }
  }, [])

  useEffect(() => {
    if (selected) loadRoute(selected.id)
    else setRouteData([])
  }, [selected?.id])

  // Pré-preencher form de edição
  useEffect(() => {
    if (editing) {
      setEditForm({
        name: editing.name || '',
        uniqueId: editing.uniqueId || '',
        phone: editing.phone || '',
        model: editing.model || '',
        category: editing.category || 'car',
        groupId: editing.groupId || 0,
      })
      editDeviceMut.reset()
    }
  }, [editing])

  // ── Load report ──
  const loadReport = async (type: string) => {
    if (!selected) return
    setReportLoading(true)
    let from: string, to: string
    if (reportPeriod === 'today') { const r = todayRange(); from = r.from; to = r.to }
    else if (reportPeriod === '7d') { from = new Date(Date.now() - 7 * 86400000).toISOString(); to = new Date().toISOString() }
    else if (reportPeriod === '30d') { from = new Date(Date.now() - 30 * 86400000).toISOString(); to = new Date().toISOString() }
    else { from = reportFrom ? new Date(reportFrom).toISOString() : todayRange().from; to = reportTo ? new Date(reportTo).toISOString() : todayRange().to }
    try {
      const r = await traccarApi.report(type, selected.id, from, to)
      setReportData(r.data)
    } catch (e: any) { setReportData(null); alert('Erro ao gerar relatório: ' + (e.response?.data?.error || e.message)) }
    setReportLoading(false)
  }

  // ── Handle geofence draw complete ──
  const handleCircleDraw = (center: [number, number], radius: number) => {
    const area = `CIRCLE (${center[1]} ${center[0]}, ${radius})`
    setGeofenceForm(p => ({ ...p, area }))
    setDrawMode(null)
    setModal('addGeofence')
  }

  // ── Parse geofence area for display ──
  const parseGeofenceArea = (area: string): { type: string; center?: [number, number]; radius?: number; points?: [number, number][] } => {
    if (!area) return { type: 'unknown' }
    const circleMatch = area.match(/CIRCLE\s*\(\s*([\d.-]+)\s+([\d.-]+)\s*,\s*([\d.]+)\s*\)/)
    if (circleMatch) return { type: 'circle', center: [parseFloat(circleMatch[2]), parseFloat(circleMatch[1])], radius: parseFloat(circleMatch[3]) }
    const polyMatch = area.match(/POLYGON\s*\(\((.*?)\)\)/)
    if (polyMatch) {
      const points = polyMatch[1].split(',').map(p => {
        const [lng, lat] = p.trim().split(/\s+/).map(Number)
        return [lat, lng] as [number, number]
      })
      return { type: 'polygon', points }
    }
    return { type: 'unknown' }
  }

  const refresh = () => { refetchDevices(); refetchGeofences() }

  // ═══════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════

  if (!status?.connected) {
    return (
      <div className="p-6 space-y-6">
        <div className="page-header">
          <div><h1 className="page-title">Rastreadores GPS</h1><p className="text-gray-500 text-sm mt-0.5">Monitoramento em tempo real via Traccar</p></div>
        </div>
        <div className="card p-8 text-center space-y-4">
          <WifiOff size={48} className="mx-auto text-gray-600" />
          <h2 className="text-xl font-semibold text-white">Traccar nao configurado</h2>
          <p className="text-gray-500 text-sm max-w-md mx-auto">Configure a conexao com o servidor Traccar para habilitar o rastreamento GPS em tempo real.</p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => autoConfigMut.mutate()} disabled={autoConfigMut.isPending} className="btn-primary flex items-center gap-2">
              {autoConfigMut.isPending ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />} Auto-Configurar
            </button>
            <button onClick={() => setModal('config')} className="btn-secondary">Configuracao Manual</button>
          </div>
          {autoConfigMut.isError && <p className="text-red-400 text-sm">Erro: {(autoConfigMut.error as any)?.response?.data?.error || 'Falha na conexao'}</p>}
        </div>
        {renderConfigModal()}
      </div>
    )
  }

  return (
    <div className="p-4 h-[calc(100vh-0px)] flex flex-col gap-4 overflow-hidden">
      {/* Header compacto */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-white">Rastreadores GPS</h1>
          <span className="badge-online text-xs">{onlineCount} online</span>
          {offlineCount > 0 && <span className="badge-offline text-xs">{offlineCount} offline</span>}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setModal('addDevice')} className="btn-primary text-sm py-1.5 flex items-center gap-1.5"><Plus size={14} /> Dispositivo</button>
          <button onClick={refresh} className="btn-secondary text-sm py-1.5 flex items-center gap-1.5"><RefreshCw size={14} /></button>
          <button onClick={() => setModal('config')} className="btn-secondary text-sm py-1.5"><Settings size={14} /></button>
        </div>
      </div>

      {/* Main layout: Map + Sidebar */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Mapa — 70% */}
        <div className="flex-[7] card overflow-hidden relative">
          <MapErrorBoundary>
          <MapContainer center={mapCenter} zoom={12} style={{ height: '100%', width: '100%' }} zoomControl={false}>
            <TileLayer
              key={activeLayer}
              url={tileLayer.url}
              subdomains={(tileLayer.subdomains ?? 'abc') as any}
              attribution={tileLayer.attribution}
              maxZoom={tileLayer.maxZoom}
            />

            {flyTarget && <FlyTo lat={flyTarget.lat} lng={flyTarget.lng} />}

            {/* Device markers (agrupados em cluster p/ evitar borrão de viaturas paradas) */}
            <ClusteredMarkers
              devices={filteredDevices}
              selectedId={selected?.id}
              onSelect={(d: any) => { setSelected(d); setFlyTarget({ lat: d.lat, lng: d.lng }) }}
            />

            {/* Route polyline */}
            {routeData.length > 1 && (
              <Polyline positions={routeData.filter((p: any) => p.latitude && p.longitude).map((p: any) => [p.latitude, p.longitude])}
                pathOptions={{ color: '#06b6d4', weight: 3, opacity: 0.8 }} />
            )}

            {/* Geofences on map */}
            {geofences.map((gf: any) => {
              const parsed = parseGeofenceArea(gf.area)
              if (parsed.type === 'circle' && parsed.center && parsed.radius) {
                return <LCircle key={gf.id} center={parsed.center} radius={parsed.radius}
                  pathOptions={{ color: '#f59e0b', fillOpacity: 0.1, dashArray: '5 5' }}>
                  <Popup><span className="text-sm font-semibold">{gf.name}</span></Popup>
                </LCircle>
              }
              if (parsed.type === 'polygon' && parsed.points) {
                return <Polygon key={gf.id} positions={parsed.points}
                  pathOptions={{ color: '#f59e0b', fillOpacity: 0.1, dashArray: '5 5' }}>
                  <Popup><span className="text-sm font-semibold">{gf.name}</span></Popup>
                </Polygon>
              }
              return null
            })}

            {/* Draw mode */}
            {drawMode === 'circle' && <DrawCircle onDraw={handleCircleDraw} />}
          </MapContainer>
          </MapErrorBoundary>

          {/* Map overlay controls */}
          <BaseLayerToggle
            active={activeLayer}
            onChange={setActiveLayer}
            className="absolute top-3 right-3 z-[1000]"
          />
          <div className="absolute top-3 right-44 z-[1000] flex flex-col gap-1">
            <button onClick={() => { setDrawMode(drawMode === 'circle' ? null : 'circle'); setTab('geofences') }}
              className={`p-2 rounded-lg shadow-lg text-xs ${drawMode === 'circle' ? 'bg-cyan-500 text-white' : 'bg-gray-900 text-gray-300 border border-gray-700'}`}
              title="Desenhar cerca circular">
              <Circle size={16} />
            </button>
          </div>
          {drawMode && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000] bg-gray-900/90 text-gray-200 text-xs px-4 py-2 rounded-lg border border-gray-700">
              Clique no mapa para definir o centro, depois clique novamente para definir o raio
            </div>
          )}
        </div>

        {/* Sidebar — 30% */}
        <div className="flex-[3] flex flex-col min-w-[320px] max-w-[420px]">
          {/* Tabs */}
          <div className="flex border-b border-gray-800 mb-0 flex-shrink-0">
            {([
              { key: 'devices', label: 'Dispositivos', icon: MapPin },
              { key: 'groups', label: 'Grupos', icon: Layers },
              { key: 'geofences', label: 'Cercas', icon: Shield },
              { key: 'alerts', label: 'Alertas', icon: Bell },
            ] as const).map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 border-b-2 transition-colors ${tab === t.key ? 'text-cyan-400 border-cyan-400' : 'text-gray-500 border-transparent hover:text-gray-300'}`}>
                <t.icon size={13} /> {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {tab === 'devices' && renderDevicesTab()}
            {tab === 'groups' && renderGroupsTab()}
            {tab === 'geofences' && renderGeofencesTab()}
            {tab === 'alerts' && renderAlertsTab()}
          </div>
        </div>
      </div>

      {/* Modals */}
      {modal === 'config' && renderConfigModal()}
      {modal === 'addDevice' && renderAddDeviceModal()}
      {modal === 'editDevice' && renderEditDeviceModal()}
      {modal === 'reports' && renderReportsModal()}
      {modal === 'commands' && renderCommandsModal()}
      {modal === 'addGeofence' && renderAddGeofenceModal()}
      {modal === 'addGroup' && renderAddGroupModal()}
      {modal === 'addNotification' && renderAddNotificationModal()}
    </div>
  )

  // ═══════════════════════════════════════════════
  // TAB: DISPOSITIVOS
  // ═══════════════════════════════════════════════

  function renderDevicesTab() {
    return (
      <div className="flex flex-col h-full">
        {/* Filtros */}
        <div className="flex gap-1 p-2 border-b border-gray-800 flex-shrink-0">
          {(['all', 'online', 'offline'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-2.5 py-1 rounded text-xs ${filter === f ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-500 hover:bg-gray-800'}`}>
              {f === 'all' ? `Todos (${devices.length})` : f === 'online' ? `Online (${onlineCount})` : `Offline (${offlineCount})`}
            </button>
          ))}
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {loadingDevices ? (
            <div className="p-8 text-center"><Loader2 size={24} className="mx-auto animate-spin text-gray-600" /></div>
          ) : filteredDevices.length === 0 ? (
            <div className="p-8 text-center text-gray-600">
              <MapPin size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhum dispositivo</p>
            </div>
          ) : filteredDevices.map((d: any) => (
            <div key={d.id} onClick={() => { setSelected(d); if (d.lat && d.lng) setFlyTarget({ lat: d.lat, lng: d.lng }) }}
              className={`p-3 cursor-pointer hover:bg-gray-800/50 border-b border-gray-800/50 transition-colors ${selected?.id === d.id ? 'bg-cyan-500/5 border-l-2 border-l-cyan-500' : ''}`}>
              <div className="flex items-center gap-2.5">
                <span className="text-base">{CATEGORY_ICONS[d.category] || '📍'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-gray-200 text-sm truncate">{d.name}</span>
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${d.status === 'online' ? 'bg-green-400' : 'bg-gray-600'}`} />
                  </div>
                  <p className="text-[11px] text-gray-600 truncate">{d.uniqueId}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {d.speed > 0 && <span className="text-[11px] text-gray-500">{knotsToKmh(d.speed)} km/h</span>}
                    {d.ignition !== undefined && <span className={`text-[11px] ${d.ignition ? 'text-green-500' : 'text-gray-600'}`}>{d.ignition ? '🔑 ON' : '🔑 OFF'}</span>}
                    {d.battery && <span className="text-[11px] text-gray-500">🔋{d.battery}%</span>}
                    <span className="text-[11px] text-gray-600 ml-auto">{timeAgo(d.lastUpdate || d.fixTime)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); setEditing(d); setModal('editDevice') }}
                  title="Editar"
                  className="p-1.5 rounded hover:bg-white/10 text-cyan-400 flex-shrink-0"
                >
                  <Pencil size={13} />
                </button>
                <ChevronRight size={14} className="text-gray-700 flex-shrink-0" />
              </div>
            </div>
          ))}
        </div>

        {/* Device detail panel */}
        {selected && (
          <div className="border-t border-gray-700 bg-gray-900/80 p-3 flex-shrink-0 max-h-[45%] overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">{CATEGORY_ICONS[selected.category] || '📍'}</span>
                <div>
                  <h4 className="font-semibold text-white text-sm">{selected.name}</h4>
                  <p className="text-[11px] text-gray-500">IMEI: {selected.uniqueId}</p>
                </div>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${selected.status === 'online' ? 'bg-green-500/20 text-green-400' : 'bg-gray-700 text-gray-400'}`}>
                  {selected.status === 'online' ? 'Online' : 'Offline'}
                </span>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-600 hover:text-gray-300"><X size={16} /></button>
            </div>

            {/* Detail grid */}
            <div className="grid grid-cols-2 gap-1.5 mb-2">
              {[
                { l: 'Posicao', v: selected.lat ? `${selected.lat.toFixed(5)}, ${selected.lng.toFixed(5)}` : 'N/A' },
                { l: 'Velocidade', v: `${knotsToKmh(selected.speed || 0)} km/h` },
                { l: 'Ignicao', v: selected.ignition === undefined ? 'N/A' : selected.ignition ? '✓ Ligada' : '✗ Desligada' },
                { l: 'Bateria', v: selected.battery ? `${selected.battery}%` : 'N/A' },
                { l: 'Altitude', v: selected.altitude ? `${selected.altitude.toFixed(0)}m` : 'N/A' },
                { l: 'Hodometro', v: selected.odometer ? `${metersToKm(selected.odometer)} km` : 'N/A' },
              ].map(i => (
                <div key={i.l} className="bg-gray-800/60 rounded px-2 py-1.5">
                  <p className="text-[10px] text-gray-500">{i.l}</p>
                  <p className="text-xs font-medium text-gray-200">{i.v}</p>
                </div>
              ))}
            </div>
            {selected.address && <p className="text-[11px] text-gray-400 mb-2 truncate" title={selected.address}>📍 {selected.address}</p>}

            {/* Action buttons */}
            <div className="flex gap-1.5">
              <button onClick={() => { setReportTab('route'); setModal('reports') }} className="btn-secondary text-[11px] py-1 px-2 flex items-center gap-1"><FileText size={12} /> Relatorios</button>
              <button onClick={() => setModal('commands')} className="btn-secondary text-[11px] py-1 px-2 flex items-center gap-1"><Send size={12} /> Comandos</button>
              <button onClick={() => { setEditing(selected); setModal('editDevice') }}
                title="Editar"
                className="ml-auto text-cyan-400 hover:text-cyan-300 p-1"><Pencil size={14} /></button>
              <button onClick={() => { if (confirm('Remover este dispositivo?')) deleteDeviceMut.mutate(selected.id) }}
                title="Remover"
                className="text-red-400 hover:text-red-300 p-1"><Trash2 size={14} /></button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ═══════════════════════════════════════════════
  // TAB: GRUPOS
  // ═══════════════════════════════════════════════

  function renderGroupsTab() {
    return (
      <div className="flex flex-col h-full">
        <div className="p-2 border-b border-gray-800 flex items-center justify-between">
          <span className="text-sm text-gray-400 font-medium">{groups.length} grupos</span>
          <button onClick={() => setModal('addGroup')} className="btn-primary text-xs py-1 px-2 flex items-center gap-1"><Plus size={12} /> Novo</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div onClick={() => setGroupFilter(null)} className={`p-3 cursor-pointer hover:bg-gray-800/50 border-b border-gray-800/50 ${!groupFilter ? 'bg-cyan-500/5 border-l-2 border-l-cyan-500' : ''}`}>
            <div className="flex items-center gap-2">
              <Layers size={14} className="text-gray-400" />
              <span className="text-sm text-gray-200">Todos os dispositivos</span>
              <span className="ml-auto text-xs text-gray-500">{devices.length}</span>
            </div>
          </div>
          {groups.map((g: any) => {
            const count = devices.filter((d: any) => d.groupId === g.id).length
            return (
              <div key={g.id} onClick={() => setGroupFilter(g.id)} className={`p-3 cursor-pointer hover:bg-gray-800/50 border-b border-gray-800/50 group ${groupFilter === g.id ? 'bg-cyan-500/5 border-l-2 border-l-cyan-500' : ''}`}>
                <div className="flex items-center gap-2">
                  <Layers size={14} className="text-cyan-400" />
                  <span className="text-sm text-gray-200">{g.name}</span>
                  <span className="ml-auto text-xs text-gray-500">{count}</span>
                  <button onClick={e => { e.stopPropagation(); if (confirm('Remover grupo?')) deleteGroupMut.mutate(g.id) }}
                    className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 p-0.5"><Trash2 size={12} /></button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════
  // TAB: GEOFENCES
  // ═══════════════════════════════════════════════

  function renderGeofencesTab() {
    return (
      <div className="flex flex-col h-full">
        <div className="p-2 border-b border-gray-800 flex items-center justify-between">
          <span className="text-sm text-gray-400 font-medium">{geofences.length} cercas</span>
          <div className="flex gap-1">
            <button onClick={() => setDrawMode(drawMode === 'circle' ? null : 'circle')}
              className={`text-xs py-1 px-2 rounded flex items-center gap-1 ${drawMode === 'circle' ? 'bg-cyan-500 text-white' : 'btn-secondary'}`}>
              <PenTool size={12} /> Desenhar
            </button>
            <button onClick={() => setModal('addGeofence')} className="btn-primary text-xs py-1 px-2 flex items-center gap-1"><Plus size={12} /> Manual</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {geofences.length === 0 ? (
            <div className="p-8 text-center text-gray-600">
              <Shield size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhuma cerca</p>
              <p className="text-xs mt-1">Desenhe no mapa ou adicione manualmente</p>
            </div>
          ) : geofences.map((gf: any) => {
            const parsed = parseGeofenceArea(gf.area)
            return (
              <div key={gf.id} className="p-3 border-b border-gray-800/50 group hover:bg-gray-800/50 cursor-pointer"
                onClick={() => {
                  if (parsed.center) setFlyTarget({ lat: parsed.center[0], lng: parsed.center[1] })
                  else if (parsed.points?.length) setFlyTarget({ lat: parsed.points[0][0], lng: parsed.points[0][1] })
                }}>
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full border-2 ${parsed.type === 'circle' ? 'border-yellow-400' : 'border-orange-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-200 truncate">{gf.name}</p>
                    <p className="text-[11px] text-gray-500">
                      {parsed.type === 'circle' && parsed.radius ? `Raio: ${parsed.radius}m` : parsed.type === 'polygon' ? `${parsed.points?.length || 0} pontos` : gf.area?.slice(0, 40)}
                    </p>
                    {gf.description && <p className="text-[11px] text-gray-600 truncate">{gf.description}</p>}
                  </div>
                  <button onClick={e => { e.stopPropagation(); if (confirm('Remover cerca?')) deleteGeofenceMut.mutate(gf.id) }}
                    className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 p-0.5"><Trash2 size={12} /></button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════
  // TAB: ALERTAS / NOTIFICAÇÕES
  // ═══════════════════════════════════════════════

  function renderAlertsTab() {
    const NOTIF_TYPES: Record<string, string> = {
      deviceOnline: 'Dispositivo Online', deviceOffline: 'Dispositivo Offline',
      deviceMoving: 'Em Movimento', deviceStopped: 'Parado',
      deviceOverspeed: 'Excesso Velocidade', ignitionOn: 'Ignicao Ligada',
      ignitionOff: 'Ignicao Desligada', geofenceEnter: 'Entrou na Cerca',
      geofenceExit: 'Saiu da Cerca', alarm: 'Alarme / SOS',
      maintenance: 'Manutencao',
    }
    return (
      <div className="flex flex-col h-full">
        <div className="p-2 border-b border-gray-800 flex items-center justify-between">
          <span className="text-sm text-gray-400 font-medium">{notifications.length} notificacoes</span>
          <button onClick={() => setModal('addNotification')} className="btn-primary text-xs py-1 px-2 flex items-center gap-1"><Plus size={12} /> Nova</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-gray-600">
              <Bell size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhuma notificacao</p>
              <p className="text-xs mt-1">Configure alertas para eventos dos dispositivos</p>
            </div>
          ) : notifications.map((n: any) => (
            <div key={n.id} className="p-3 border-b border-gray-800/50 group hover:bg-gray-800/50">
              <div className="flex items-center gap-2">
                <Bell size={14} className="text-yellow-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-200">{NOTIF_TYPES[n.type] || n.type}</p>
                  <p className="text-[11px] text-gray-500">Via: {n.notificators || 'web'} {n.always ? '(todos)' : ''}</p>
                </div>
                <button onClick={() => { if (confirm('Remover notificacao?')) deleteNotifMut.mutate(n.id) }}
                  className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 p-0.5"><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════
  // MODAL: CONFIGURAÇÃO TRACCAR
  // ═══════════════════════════════════════════════

  function renderConfigModal() {
    if (modal !== 'config') return null
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[2000] p-4">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md">
          <div className="flex items-center justify-between p-5 border-b border-gray-800">
            <h3 className="font-semibold text-white">Configurar Traccar</h3>
            <button onClick={() => setModal(null)} className="text-gray-500 hover:text-gray-300"><X size={20} /></button>
          </div>
          <div className="p-5 space-y-3">
            <div>
              <label className="label">URL do servidor Traccar</label>
              <input value={configForm.serverUrl} onChange={e => setConfigForm(p => ({ ...p, serverUrl: e.target.value }))} className="input" placeholder="http://traccar:8082" />
            </div>
            <div>
              <label className="label">Email admin</label>
              <input value={configForm.adminUser} onChange={e => setConfigForm(p => ({ ...p, adminUser: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="label">Senha admin</label>
              <input type="password" value={configForm.adminPass} onChange={e => setConfigForm(p => ({ ...p, adminPass: e.target.value }))} className="input" />
            </div>
            {configureMut.isError && <p className="text-red-400 text-sm">{(configureMut.error as any)?.response?.data?.error || 'Erro'}</p>}
            <div className="flex gap-3 pt-2">
              <button onClick={() => setModal(null)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={() => configureMut.mutate(configForm)} disabled={configureMut.isPending} className="btn-primary flex-1">
                {configureMut.isPending ? 'Conectando...' : 'Conectar'}
              </button>
            </div>
            {mapUrlData?.url && (
              <a href={mapUrlData.url} target="_blank" rel="noopener noreferrer" className="block text-center text-xs text-cyan-400 underline mt-2">
                Abrir painel Traccar externo
              </a>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════
  // MODAL: ADICIONAR DISPOSITIVO
  // ═══════════════════════════════════════════════

  function renderAddDeviceModal() {
    const errData: any = (addDeviceMut.error as any)?.response?.data
    const errMessage: string | null = addDeviceMut.isError ? (errData?.message || errData?.error || 'Erro ao adicionar dispositivo') : null
    const errField: string | null = addDeviceMut.isError ? (errData?.field || null) : null
    const inputCls = (field: string) => `input ${errField === field ? 'border-red-500 focus:border-red-500' : ''}`
    const clearErr = () => { if (addDeviceMut.isError) addDeviceMut.reset() }
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[2000] p-4">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md">
          <div className="flex items-center justify-between p-5 border-b border-gray-800">
            <h3 className="font-semibold text-white">Adicionar Rastreador GPS</h3>
            <button onClick={() => { addDeviceMut.reset(); setModal(null) }} className="text-gray-500 hover:text-gray-300"><X size={20} /></button>
          </div>
          <div className="p-5 space-y-3">
            {errMessage && (
              <div className="bg-red-900/40 border border-red-500/40 text-red-200 text-sm rounded p-3">
                {errMessage}
              </div>
            )}
            <div>
              <label className="label">Nome *</label>
              <input value={addForm.name} onChange={e => { clearErr(); setAddForm(p => ({ ...p, name: e.target.value })) }} className={inputCls('name')} placeholder="Ex: Caminhao 001" />
            </div>
            <div>
              <label className="label">IMEI / ID Unico *</label>
              <input value={addForm.uniqueId} onChange={e => { clearErr(); setAddForm(p => ({ ...p, uniqueId: e.target.value })) }} className={inputCls('uniqueId')} placeholder="Ex: 123456789012345" />
            </div>
            <div>
              <label className="label">Telefone (SIM)</label>
              <input value={addForm.phone} onChange={e => setAddForm(p => ({ ...p, phone: e.target.value }))} className="input" placeholder="+5511999999999" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Modelo</label>
                <input value={addForm.model} onChange={e => setAddForm(p => ({ ...p, model: e.target.value }))} className="input" placeholder="GT06N" />
              </div>
              <div>
                <label className="label">Categoria</label>
                <select value={addForm.category} onChange={e => setAddForm(p => ({ ...p, category: e.target.value }))} className="input">
                  {Object.entries(CATEGORY_ICONS).map(([k, v]) => <option key={k} value={k}>{v} {k}</option>)}
                </select>
              </div>
            </div>
            {groups.length > 0 && (
              <div>
                <label className="label">Grupo</label>
                <select value={addForm.groupId} onChange={e => setAddForm(p => ({ ...p, groupId: Number(e.target.value) }))} className="input">
                  <option value={0}>Nenhum</option>
                  {groups.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button onClick={() => { addDeviceMut.reset(); setModal(null) }} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={() => addDeviceMut.mutate(addForm)} disabled={addDeviceMut.isPending || !addForm.name || !addForm.uniqueId} className="btn-primary flex-1">
                {addDeviceMut.isPending ? 'Adicionando...' : 'Adicionar'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════
  // MODAL: EDITAR DISPOSITIVO
  // ═══════════════════════════════════════════════

  function renderEditDeviceModal() {
    if (!editing) return null
    const errData: any = (editDeviceMut.error as any)?.response?.data
    const errMessage: string | null = editDeviceMut.isError ? (errData?.message || errData?.error || 'Erro ao atualizar dispositivo') : null
    const errField: string | null = editDeviceMut.isError ? (errData?.field || null) : null
    const inputCls = (field: string) => `input ${errField === field ? 'border-red-500 focus:border-red-500' : ''}`
    const clearErr = () => { if (editDeviceMut.isError) editDeviceMut.reset() }
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[2000] p-4">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md z-[2001]">
          <div className="flex items-center justify-between p-5 border-b border-gray-800">
            <div>
              <h3 className="font-semibold text-white">Editar Rastreador GPS</h3>
              <p className="text-xs text-gray-500">ID Traccar: {editing.id}</p>
            </div>
            <button onClick={() => { editDeviceMut.reset(); setEditing(null); setModal(null) }} className="text-gray-500 hover:text-gray-300"><X size={20} /></button>
          </div>
          <div className="p-5 space-y-3">
            {errMessage && (
              <div className="bg-red-900/40 border border-red-500/40 text-red-200 text-sm rounded p-3">
                {errMessage}
              </div>
            )}
            <div>
              <label className="label">Nome *</label>
              <input value={editForm.name} onChange={e => { clearErr(); setEditForm(p => ({ ...p, name: e.target.value })) }} className={inputCls('name')} placeholder="Ex: Caminhao 001" />
            </div>
            <div>
              <label className="label">IMEI / ID Unico *</label>
              <input value={editForm.uniqueId} onChange={e => { clearErr(); setEditForm(p => ({ ...p, uniqueId: e.target.value })) }} className={inputCls('uniqueId')} placeholder="Ex: 123456789012345" />
            </div>
            <div>
              <label className="label">Telefone (SIM)</label>
              <input value={editForm.phone} onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))} className="input" placeholder="+5511999999999" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Modelo</label>
                <input value={editForm.model} onChange={e => setEditForm(p => ({ ...p, model: e.target.value }))} className="input" placeholder="GT06N" />
              </div>
              <div>
                <label className="label">Categoria</label>
                <select value={editForm.category} onChange={e => setEditForm(p => ({ ...p, category: e.target.value }))} className="input">
                  {Object.entries(CATEGORY_ICONS).map(([k, v]) => <option key={k} value={k}>{v} {k}</option>)}
                </select>
              </div>
            </div>
            {groups.length > 0 && (
              <div>
                <label className="label">Grupo</label>
                <select value={editForm.groupId} onChange={e => setEditForm(p => ({ ...p, groupId: Number(e.target.value) }))} className="input">
                  <option value={0}>Nenhum</option>
                  {groups.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button onClick={() => { editDeviceMut.reset(); setEditing(null); setModal(null) }} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={() => editDeviceMut.mutate(editForm)} disabled={editDeviceMut.isPending || !editForm.name || !editForm.uniqueId} className="btn-primary flex-1">
                {editDeviceMut.isPending ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════
  // MODAL: RELATÓRIOS
  // ═══════════════════════════════════════════════

  function renderReportsModal() {
    if (!selected) return null
    const tabs = [
      { key: 'route', label: 'Rota', icon: Navigation },
      { key: 'trips', label: 'Viagens', icon: Play },
      { key: 'stops', label: 'Paradas', icon: StopCircle },
      { key: 'summary', label: 'Resumo', icon: FileText },
      { key: 'events', label: 'Eventos', icon: Bell },
    ]

    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[2000] p-4">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
          <div className="flex items-center justify-between p-5 border-b border-gray-800 flex-shrink-0">
            <div>
              <h3 className="font-semibold text-white">Relatorios — {selected.name}</h3>
              <p className="text-xs text-gray-500">IMEI: {selected.uniqueId}</p>
            </div>
            <button onClick={() => { setModal(null); setReportData(null) }} className="text-gray-500 hover:text-gray-300"><X size={20} /></button>
          </div>

          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Report tabs */}
            <div className="flex border-b border-gray-800 flex-shrink-0">
              {tabs.map(t => (
                <button key={t.key} onClick={() => { setReportTab(t.key); setReportData(null) }}
                  className={`flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 border-b-2 transition-colors ${reportTab === t.key ? 'text-cyan-400 border-cyan-400' : 'text-gray-500 border-transparent'}`}>
                  <t.icon size={13} /> {t.label}
                </button>
              ))}
            </div>

            {/* Period selector */}
            <div className="flex items-center gap-2 p-3 border-b border-gray-800 flex-shrink-0">
              {['today', '7d', '30d', 'custom'].map(p => (
                <button key={p} onClick={() => setReportPeriod(p)}
                  className={`px-2.5 py-1 rounded text-xs ${reportPeriod === p ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-500 hover:bg-gray-800'}`}>
                  {p === 'today' ? 'Hoje' : p === '7d' ? '7 dias' : p === '30d' ? '30 dias' : 'Personalizado'}
                </button>
              ))}
              {reportPeriod === 'custom' && (
                <>
                  <input type="datetime-local" value={reportFrom} onChange={e => setReportFrom(e.target.value)} className="input text-xs py-1 w-auto" />
                  <input type="datetime-local" value={reportTo} onChange={e => setReportTo(e.target.value)} className="input text-xs py-1 w-auto" />
                </>
              )}
              <button onClick={() => loadReport(reportTab)} disabled={reportLoading}
                className="btn-primary text-xs py-1 px-3 flex items-center gap-1 ml-auto">
                {reportLoading ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />} Gerar
              </button>
            </div>

            {/* Report data */}
            <div className="flex-1 overflow-auto p-3">
              {reportLoading ? (
                <div className="text-center py-12"><Loader2 size={24} className="mx-auto animate-spin text-gray-600" /></div>
              ) : !reportData ? (
                <div className="text-center py-12 text-gray-600"><p className="text-sm">Selecione o periodo e clique em "Gerar"</p></div>
              ) : Array.isArray(reportData) && reportData.length === 0 ? (
                <div className="text-center py-12 text-gray-600"><p className="text-sm">Sem dados para o periodo selecionado</p></div>
              ) : (
                <>
                  {/* Route report */}
                  {reportTab === 'route' && Array.isArray(reportData) && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead><tr className="text-gray-500 border-b border-gray-800">
                          <th className="text-left py-2 px-2">Hora</th><th className="text-left py-2 px-2">Lat</th><th className="text-left py-2 px-2">Lng</th>
                          <th className="text-left py-2 px-2">Vel.</th><th className="text-left py-2 px-2">Endereco</th>
                        </tr></thead>
                        <tbody>{reportData.slice(0, 200).map((p: any, i: number) => (
                          <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                            <td className="py-1.5 px-2 text-gray-300">{p.fixTime ? new Date(p.fixTime).toLocaleTimeString('pt-BR') : '-'}</td>
                            <td className="py-1.5 px-2 text-gray-400">{p.latitude?.toFixed(5)}</td>
                            <td className="py-1.5 px-2 text-gray-400">{p.longitude?.toFixed(5)}</td>
                            <td className="py-1.5 px-2 text-gray-300">{knotsToKmh(p.speed || 0)}</td>
                            <td className="py-1.5 px-2 text-gray-500 truncate max-w-[200px]">{p.address || '-'}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                      <p className="text-xs text-gray-600 mt-2">{reportData.length} pontos</p>
                    </div>
                  )}

                  {/* Trips report */}
                  {reportTab === 'trips' && Array.isArray(reportData) && (
                    <div className="space-y-2">
                      {reportData.map((t: any, i: number) => (
                        <div key={i} className="bg-gray-800/50 rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <Play size={12} className="text-green-400" />
                            <span className="text-xs text-gray-300">{t.startTime ? new Date(t.startTime).toLocaleString('pt-BR') : '-'}</span>
                            <span className="text-gray-600">→</span>
                            <StopCircle size={12} className="text-red-400" />
                            <span className="text-xs text-gray-300">{t.endTime ? new Date(t.endTime).toLocaleString('pt-BR') : '-'}</span>
                          </div>
                          <div className="grid grid-cols-4 gap-2 text-xs">
                            <div><span className="text-gray-500">Distancia:</span> <span className="text-gray-200">{metersToKm(t.distance || 0)} km</span></div>
                            <div><span className="text-gray-500">Duracao:</span> <span className="text-gray-200">{t.duration ? Math.round(t.duration / 60000) + ' min' : '-'}</span></div>
                            <div><span className="text-gray-500">Vel. Max:</span> <span className="text-gray-200">{knotsToKmh(t.maxSpeed || 0)} km/h</span></div>
                            <div><span className="text-gray-500">Vel. Media:</span> <span className="text-gray-200">{knotsToKmh(t.averageSpeed || 0)} km/h</span></div>
                          </div>
                          {t.startAddress && <p className="text-[11px] text-gray-500 mt-1">De: {t.startAddress}</p>}
                          {t.endAddress && <p className="text-[11px] text-gray-500">Para: {t.endAddress}</p>}
                        </div>
                      ))}
                      {reportData.length === 0 && <p className="text-center text-gray-600 text-sm py-4">Nenhuma viagem no periodo</p>}
                    </div>
                  )}

                  {/* Stops report */}
                  {reportTab === 'stops' && Array.isArray(reportData) && (
                    <div className="space-y-2">
                      {reportData.map((s: any, i: number) => (
                        <div key={i} className="bg-gray-800/50 rounded-lg p-3 flex items-start gap-3">
                          <StopCircle size={16} className="text-orange-400 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-xs text-gray-300">{s.startTime ? new Date(s.startTime).toLocaleString('pt-BR') : '-'} — {s.endTime ? new Date(s.endTime).toLocaleString('pt-BR') : '-'}</p>
                            <p className="text-xs text-gray-400">Duracao: {s.duration ? Math.round(s.duration / 60000) + ' min' : '-'}</p>
                            {s.address && <p className="text-[11px] text-gray-500 mt-0.5">{s.address}</p>}
                            {s.engineHours && <p className="text-[11px] text-gray-500">Motor: {Math.round(s.engineHours / 3600000)}h</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Summary report */}
                  {reportTab === 'summary' && Array.isArray(reportData) && reportData[0] && (
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { l: 'Distancia Total', v: `${metersToKm(reportData[0].distance || 0)} km` },
                        { l: 'Vel. Maxima', v: `${knotsToKmh(reportData[0].maxSpeed || 0)} km/h` },
                        { l: 'Vel. Media', v: `${knotsToKmh(reportData[0].averageSpeed || 0)} km/h` },
                        { l: 'Horas Motor', v: reportData[0].engineHours ? `${(reportData[0].engineHours / 3600000).toFixed(1)}h` : 'N/A' },
                        { l: 'Combustivel Gasto', v: reportData[0].spentFuel ? `${reportData[0].spentFuel.toFixed(1)}L` : 'N/A' },
                        { l: 'Inicio', v: reportData[0].startTime ? new Date(reportData[0].startTime).toLocaleString('pt-BR') : '-' },
                      ].map(i => (
                        <div key={i.l} className="bg-gray-800/50 rounded-lg p-4">
                          <p className="text-xs text-gray-500 mb-1">{i.l}</p>
                          <p className="text-lg font-bold text-white">{i.v}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Events report */}
                  {reportTab === 'events' && Array.isArray(reportData) && (
                    <div className="space-y-1">
                      {reportData.map((ev: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 py-1.5 border-b border-gray-800/50">
                          <AlertTriangle size={12} className="text-yellow-400 flex-shrink-0" />
                          <span className="text-xs text-gray-300">{ev.type}</span>
                          <span className="text-[11px] text-gray-500 ml-auto">{ev.eventTime ? new Date(ev.eventTime).toLocaleString('pt-BR') : '-'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════
  // MODAL: COMANDOS
  // ═══════════════════════════════════════════════

  function renderCommandsModal() {
    if (!selected) return null
    const quickCommands = [
      { type: 'engineStop', label: 'Parar Motor', icon: PowerOff, color: 'text-red-400', confirm: true },
      { type: 'engineResume', label: 'Retomar Motor', icon: Power, color: 'text-green-400', confirm: true },
      { type: 'positionSingle', label: 'Solicitar Posicao', icon: MapPin, color: 'text-blue-400', confirm: false },
    ]

    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[2000] p-4">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md">
          <div className="flex items-center justify-between p-5 border-b border-gray-800">
            <div>
              <h3 className="font-semibold text-white">Comandos — {selected.name}</h3>
              <p className="text-xs text-gray-500">IMEI: {selected.uniqueId}</p>
            </div>
            <button onClick={() => setModal(null)} className="text-gray-500 hover:text-gray-300"><X size={20} /></button>
          </div>
          <div className="p-5 space-y-3">
            <p className="text-xs text-yellow-400/80 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2">
              Comandos sao enviados diretamente ao rastreador. Use com cuidado.
            </p>
            <div className="space-y-2">
              {quickCommands.map(cmd => (
                <button key={cmd.type} onClick={() => {
                  if (cmd.confirm && !confirm(`Tem certeza que deseja "${cmd.label}"?`)) return
                  sendCommandMut.mutate({ deviceId: selected.id, type: cmd.type })
                }}
                  disabled={sendCommandMut.isPending}
                  className="w-full flex items-center gap-3 p-3 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors text-left">
                  <cmd.icon size={18} className={cmd.color} />
                  <span className="text-sm text-gray-200 font-medium">{cmd.label}</span>
                  <Send size={14} className="ml-auto text-gray-600" />
                </button>
              ))}
            </div>
            {sendCommandMut.isError && <p className="text-red-400 text-sm">{(sendCommandMut.error as any)?.response?.data?.error || 'Erro ao enviar comando'}</p>}
          </div>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════
  // MODAL: ADICIONAR GEOFENCE
  // ═══════════════════════════════════════════════

  function renderAddGeofenceModal() {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[2000] p-4">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md">
          <div className="flex items-center justify-between p-5 border-b border-gray-800">
            <h3 className="font-semibold text-white">Criar Cerca Geografica</h3>
            <button onClick={() => setModal(null)} className="text-gray-500 hover:text-gray-300"><X size={20} /></button>
          </div>
          <div className="p-5 space-y-3">
            <div>
              <label className="label">Nome *</label>
              <input value={geofenceForm.name} onChange={e => setGeofenceForm(p => ({ ...p, name: e.target.value }))} className="input" placeholder="Ex: Garagem Central" />
            </div>
            <div>
              <label className="label">Descricao</label>
              <input value={geofenceForm.description} onChange={e => setGeofenceForm(p => ({ ...p, description: e.target.value }))} className="input" placeholder="Opcional" />
            </div>
            <div>
              <label className="label">Area (WKT) *</label>
              <textarea value={geofenceForm.area} onChange={e => setGeofenceForm(p => ({ ...p, area: e.target.value }))} className="input h-20 text-xs font-mono"
                placeholder="CIRCLE (-43.17 -22.90, 500)&#10;ou POLYGON((-43.17 -22.90, -43.16 -22.90, ...))" />
              <p className="text-[10px] text-gray-600 mt-1">Dica: Use o botao "Desenhar" na aba Cercas para criar automaticamente</p>
            </div>
            {createGeofenceMut.isError && <p className="text-red-400 text-sm">{(createGeofenceMut.error as any)?.response?.data?.error || 'Erro'}</p>}
            <div className="flex gap-3 pt-2">
              <button onClick={() => setModal(null)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={() => createGeofenceMut.mutate(geofenceForm)} disabled={createGeofenceMut.isPending || !geofenceForm.name || !geofenceForm.area}
                className="btn-primary flex-1">{createGeofenceMut.isPending ? 'Criando...' : 'Criar Cerca'}</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════
  // MODAL: ADICIONAR GRUPO
  // ═══════════════════════════════════════════════

  function renderAddGroupModal() {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[2000] p-4">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm">
          <div className="flex items-center justify-between p-5 border-b border-gray-800">
            <h3 className="font-semibold text-white">Novo Grupo</h3>
            <button onClick={() => setModal(null)} className="text-gray-500 hover:text-gray-300"><X size={20} /></button>
          </div>
          <div className="p-5 space-y-3">
            <div>
              <label className="label">Nome do grupo *</label>
              <input value={groupForm.name} onChange={e => setGroupForm({ name: e.target.value })} className="input" placeholder="Ex: Frota SP" />
            </div>
            {createGroupMut.isError && <p className="text-red-400 text-sm">{(createGroupMut.error as any)?.response?.data?.error || 'Erro'}</p>}
            <div className="flex gap-3 pt-2">
              <button onClick={() => setModal(null)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={() => createGroupMut.mutate(groupForm)} disabled={createGroupMut.isPending || !groupForm.name}
                className="btn-primary flex-1">{createGroupMut.isPending ? 'Criando...' : 'Criar'}</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════
  // MODAL: ADICIONAR NOTIFICAÇÃO
  // ═══════════════════════════════════════════════

  function renderAddNotificationModal() {
    const types = [
      { value: 'deviceOnline', label: 'Dispositivo Online' },
      { value: 'deviceOffline', label: 'Dispositivo Offline' },
      { value: 'deviceMoving', label: 'Em Movimento' },
      { value: 'deviceStopped', label: 'Parado' },
      { value: 'deviceOverspeed', label: 'Excesso de Velocidade' },
      { value: 'ignitionOn', label: 'Ignicao Ligada' },
      { value: 'ignitionOff', label: 'Ignicao Desligada' },
      { value: 'geofenceEnter', label: 'Entrou na Cerca' },
      { value: 'geofenceExit', label: 'Saiu da Cerca' },
      { value: 'alarm', label: 'Alarme / SOS' },
    ]
    const channels = [
      { value: 'web', label: 'Web (Push)' },
      { value: 'mail', label: 'Email' },
      { value: 'sms', label: 'SMS' },
      { value: 'web,mail', label: 'Web + Email' },
    ]

    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[2000] p-4">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md">
          <div className="flex items-center justify-between p-5 border-b border-gray-800">
            <h3 className="font-semibold text-white">Nova Notificacao</h3>
            <button onClick={() => setModal(null)} className="text-gray-500 hover:text-gray-300"><X size={20} /></button>
          </div>
          <div className="p-5 space-y-3">
            <div>
              <label className="label">Tipo de evento</label>
              <select value={notifForm.type} onChange={e => setNotifForm(p => ({ ...p, type: e.target.value }))} className="input">
                {types.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Canal de notificacao</label>
              <select value={notifForm.notificators} onChange={e => setNotifForm(p => ({ ...p, notificators: e.target.value }))} className="input">
                {channels.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            {createNotifMut.isError && <p className="text-red-400 text-sm">{(createNotifMut.error as any)?.response?.data?.error || 'Erro'}</p>}
            <div className="flex gap-3 pt-2">
              <button onClick={() => setModal(null)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={() => createNotifMut.mutate(notifForm)} disabled={createNotifMut.isPending}
                className="btn-primary flex-1">{createNotifMut.isPending ? 'Criando...' : 'Criar'}</button>
            </div>
          </div>
        </div>
      </div>
    )
  }
}

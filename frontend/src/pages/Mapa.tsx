// TODO Google Maps migration: esta tela usa a API Leaflet vanilla (L.map, L.layerGroup,
// L.marker, fitBounds) com layers e clusters customizados. Manter em Leaflet até
// re-implementar com google.maps.Map e MarkerClusterer.
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { mapApi, MapOverview } from '../services/api'
import { BASE_LAYERS, useBaseLayer, BaseLayerToggle } from '../components/MapBase'
import { MapErrorBoundary } from '../components/MapErrorBoundary'

const REFRESH_MS = 15_000

interface Filters {
  trackers: boolean
  agents: boolean
  ip: boolean
  jimi: boolean
  iot: boolean
  events: boolean
}

export default function Mapa() {
  const mapRef = useRef<HTMLDivElement>(null)
  const leafletRef = useRef<L.Map | null>(null)
  const tileLayerRef = useRef<L.TileLayer | null>(null)
  const layersRef = useRef<Record<keyof Filters, L.LayerGroup> | null>(null)
  const [data, setData] = useState<MapOverview | null>(null)
  const [filters, setFilters] = useState<Filters>({
    trackers: true, agents: true, ip: true, jimi: true, iot: true, events: true,
  })
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [activeLayer, setActiveLayer] = useBaseLayer()

  useEffect(() => {
    if (!mapRef.current || leafletRef.current) return
    const map = L.map(mapRef.current).setView([-23.55, -46.63], 11)
    layersRef.current = {
      trackers: L.layerGroup().addTo(map),
      agents:   L.layerGroup().addTo(map),
      ip:       L.layerGroup().addTo(map),
      jimi:     L.layerGroup().addTo(map),
      iot:      L.layerGroup().addTo(map),
      events:   L.layerGroup().addTo(map),
    }
    leafletRef.current = map
    setTimeout(() => map.invalidateSize(), 50)
    return () => { map.remove(); leafletRef.current = null; layersRef.current = null; tileLayerRef.current = null }
  }, [])

  useEffect(() => {
    const map = leafletRef.current
    if (!map) return
    const next = BASE_LAYERS[activeLayer]
    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current)
    tileLayerRef.current = L.tileLayer(next.url, {
      attribution: next.attribution,
      maxZoom: next.maxZoom,
      subdomains: next.subdomains ?? 'abc',
    }).addTo(map)
  }, [activeLayer])

  useEffect(() => {
    let cancelled = false
    async function refresh() {
      try {
        const o = await mapApi.overview()
        if (!cancelled) { setData(o); setLastRefresh(new Date()) }
      } catch (e) {
        console.error('[map] refresh failed', e)
      } finally { if (!cancelled) setLoading(false) }
    }
    refresh()
    const i = setInterval(refresh, REFRESH_MS)
    return () => { cancelled = true; clearInterval(i) }
  }, [])

  useEffect(() => {
    if (!data || !layersRef.current) return
    const Lg = layersRef.current
    Object.values(Lg).forEach(l => l.clearLayers())

    const ipCams = Array.isArray(data.ip_cameras) ? data.ip_cameras : []
    const jimi   = Array.isArray(data.jimi_cameras) ? data.jimi_cameras : []
    const agents = Array.isArray(data.agents) ? data.agents : []
    const trackers = Array.isArray(data.trackers) ? data.trackers : []
    const events = Array.isArray(data.events) ? data.events : []
    const iot = Array.isArray(data.iot_devices) ? data.iot_devices : []

    if (filters.trackers) trackers.forEach(t => addPin(Lg.trackers, t.latitude, t.longitude, pinIcon('purple', '🚗'), buildTrackerPopup(t)))
    if (filters.agents)   agents.forEach(a   => addPin(Lg.agents,   a.latitude, a.longitude, pinIcon('blue',  '📻'), buildAgentPopup(a)))
    if (filters.ip)       ipCams.forEach(c   => addPin(Lg.ip,       Number(c.latitude), Number(c.longitude), pinIcon('green', '📷'), buildIpCameraPopup(c)))
    if (filters.jimi)     jimi.forEach(c     => addPin(Lg.jimi,     Number(c.latitude), Number(c.longitude), pinIcon('yellow','🚐'), buildJimiPopup(c)))
    if (filters.iot)      iot.forEach(d      => addPin(Lg.iot,      Number(d.latitude), Number(d.longitude), pinIcon('cyan',  '💡'), buildIotPopup(d)))
    if (filters.events)   events.forEach(e   => addPin(Lg.events,   Number(e.latitude), Number(e.longitude), eventIcon(e.severity), buildEventPopup(e)))
  }, [data, filters])

  function fitToVisible() {
    if (!data || !leafletRef.current) return
    const points: [number, number][] = []
    if (filters.trackers) (data.trackers || []).forEach(p => points.push([p.latitude, p.longitude]))
    if (filters.agents)   (data.agents || []).forEach(p => points.push([p.latitude, p.longitude]))
    if (filters.ip)       (data.ip_cameras || []).forEach(p => points.push([Number(p.latitude), Number(p.longitude)]))
    if (filters.jimi)     (data.jimi_cameras || []).forEach(p => points.push([Number(p.latitude), Number(p.longitude)]))
    if (filters.iot)      (data.iot_devices || []).forEach(p => points.push([Number(p.latitude), Number(p.longitude)]))
    if (filters.events)   (data.events || []).forEach(p => points.push([Number(p.latitude), Number(p.longitude)]))
    if (!points.length) return
    leafletRef.current.fitBounds(points, { padding: [50, 50], maxZoom: 16 })
  }

  const c = {
    trackers: data?.trackers?.length ?? 0,
    agents:   data?.agents?.length ?? 0,
    ip:       data?.ip_cameras?.length ?? 0,
    jimi:     data?.jimi_cameras?.length ?? 0,
    iot:      data?.iot_devices?.length ?? 0,
    events:   data?.events?.length ?? 0,
  }
  const total = c.trackers + c.agents + c.ip + c.jimi + c.iot + c.events

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-gray-800 bg-gray-900 flex justify-between items-start gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-100">🗺️ Central de Operações</h1>
          <p className="text-xs text-gray-400">
            Tudo num mapa só · {lastRefresh ? `atualizado ${timeSince(lastRefresh)}` : '…'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Toggle label="🚗 Rastreadores" count={c.trackers} active={filters.trackers}
            onChange={v => setFilters(f => ({ ...f, trackers: v }))} />
          <Toggle label="📻 WF" count={c.agents} active={filters.agents}
            onChange={v => setFilters(f => ({ ...f, agents: v }))} />
          <Toggle label="📷 IP" count={c.ip} active={filters.ip}
            onChange={v => setFilters(f => ({ ...f, ip: v }))} />
          <Toggle label="🚐 Jimi" count={c.jimi} active={filters.jimi}
            onChange={v => setFilters(f => ({ ...f, jimi: v }))} />
          <Toggle label="💡 IoT" count={c.iot} active={filters.iot}
            onChange={v => setFilters(f => ({ ...f, iot: v }))} />
          <Toggle label="🚨 Eventos" count={c.events} active={filters.events}
            onChange={v => setFilters(f => ({ ...f, events: v }))} />
          <button onClick={fitToVisible}
            className="bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs px-3 py-1.5 rounded">
            🎯 Centralizar
          </button>
        </div>
      </div>

      <div className="flex-1 relative min-h-0">
        {loading && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1500] bg-gray-900/90 border border-gray-700 rounded px-4 py-2 text-sm text-gray-300">
            Carregando…
          </div>
        )}
        {!loading && total === 0 && (
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 z-[1500] bg-gray-900 border border-gray-700 rounded-lg p-6 text-center max-w-md">
            <p className="text-gray-300 font-medium">Mapa vazio</p>
            <p className="text-xs text-gray-500 mt-2">
              Ainda não há rastreadores online, agentes ativos, câmeras com coordenadas, dispositivos IoT ou eventos recentes pra mostrar.
              Cadastre os recursos nas páginas correspondentes ou aguarde dados chegarem.
            </p>
          </div>
        )}
        <MapErrorBoundary>
          <div ref={mapRef} className="absolute inset-0" />
          <BaseLayerToggle active={activeLayer} onChange={setActiveLayer} />
        </MapErrorBoundary>
      </div>
    </div>
  )
}

function Toggle({ label, count, active, onChange }: { label: string; count: number; active: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={`inline-flex items-center gap-1.5 cursor-pointer text-xs select-none ${active ? 'text-gray-100' : 'text-gray-500'}`}>
      <input type="checkbox" checked={active} onChange={e => onChange(e.target.checked)} />
      <span>{label}</span>
      <span className={`px-1.5 py-0.5 rounded ${active ? 'bg-cyan-500/20 text-cyan-300' : 'bg-gray-700 text-gray-500'}`}>{count}</span>
    </label>
  )
}

function addPin(layer: L.LayerGroup, lat: number, lng: number, icon: L.DivIcon, popupHtml: string) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
  L.marker([lat, lng], { icon }).bindPopup(popupHtml, { maxWidth: 320 }).addTo(layer)
}

function pinIcon(color: string, emoji: string): L.DivIcon {
  const colorMap: Record<string, string> = {
    purple: '#a855f7', blue: '#3b82f6', green: '#22c55e',
    yellow: '#eab308', cyan: '#06b6d4',
  }
  const bg = colorMap[color] || color
  return L.divIcon({
    className: 'custom-pin',
    iconSize: [32, 32], iconAnchor: [16, 16],
    html: `<div style="background:${bg};border:2px solid white;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 6px rgba(0,0,0,.6);font-size:14px">${emoji}</div>`,
  })
}

function eventIcon(severity: string): L.DivIcon {
  const color = severity === 'critical' ? '#ef4444' : severity === 'warning' ? '#f97316' : '#64748b'
  return L.divIcon({
    className: 'custom-pin',
    iconSize: [28, 28], iconAnchor: [14, 14],
    html: `<div style="background:${color};border:2px solid white;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 8px ${color};font-size:12px">🚨</div>`,
  })
}

function escapeHtml(s: any): string {
  if (s == null) return ''
  return String(s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]!))
}

function demoBadge(d: any): string {
  return d?.demo
    ? '<span style="background:#a855f7;color:white;font-size:9px;font-weight:600;padding:2px 6px;border-radius:3px;margin-left:6px;letter-spacing:.5px">DEMO</span>'
    : ''
}

function timeSince(d: Date): string {
  const sec = Math.round((Date.now() - d.getTime()) / 1000)
  if (sec < 60) return `há ${sec}s`
  return `há ${Math.round(sec / 60)}min`
}

function buildTrackerPopup(t: any): string {
  const speed = ((t.speed_knots || 0) * 1.852).toFixed(1)
  return `
    <div style="min-width:220px">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="font-size:18px">🚗</span><strong>${escapeHtml(t.name)}</strong>${demoBadge(t)}</div>
      <div style="font-size:11px;color:#94a3b8">Rastreador Traccar · status ${escapeHtml(t.status)}</div>
      <div style="font-size:11px;color:#cbd5e1;margin-top:6px">
        Velocidade: ${speed} km/h<br>
        Atualizado: ${new Date(t.fix_time).toLocaleString('pt-BR')}
      </div>
      <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px">
        <a href="/trackers?device=${t.device_id}" style="background:#334155;color:#cbd5e1;padding:3px 8px;border-radius:4px;text-decoration:none;font-size:11px">Ver no Trackers</a>
      </div>
    </div>`
}

function buildAgentPopup(a: any): string {
  const speed = ((a.speed_knots || 0) * 1.852).toFixed(1)
  return `
    <div style="min-width:220px">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="font-size:18px">📻</span><strong>${escapeHtml(a.wf_username)}</strong>${demoBadge(a)}</div>
      <div style="font-size:11px;color:#94a3b8">Agente WalkieFleet${a.display_name ? ' · ' + escapeHtml(a.display_name) : ''}</div>
      <div style="font-size:11px;color:#cbd5e1;margin-top:6px">
        Velocidade: ${speed} km/h<br>
        Atualizado: ${new Date(a.fix_time).toLocaleString('pt-BR')}
      </div>
      <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px">
        <a href="/walkiefleet?agent=${encodeURIComponent(a.wf_username)}" style="background:#334155;color:#cbd5e1;padding:3px 8px;border-radius:4px;text-decoration:none;font-size:11px">Abrir WalkieFleet</a>
      </div>
    </div>`
}

function buildIpCameraPopup(c: any): string {
  const snap = c.shinobi_monitor_id ? `/api/ip-cameras/${c.id}/snapshot?t=${Date.now()}` : null
  return `
    <div style="min-width:240px">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="font-size:18px">📷</span><strong>${escapeHtml(c.name)}</strong>${demoBadge(c)}</div>
      <div style="font-size:11px;color:#94a3b8">${escapeHtml(c.manufacturer)}${c.location_desc ? ' · ' + escapeHtml(c.location_desc) : ''}</div>
      ${snap ? `<img src="${snap}" style="width:100%;margin-top:6px;border-radius:4px;background:#000;max-height:140px;object-fit:cover" onerror="this.style.display='none'">` : ''}
      <div style="font-size:11px;color:#cbd5e1;margin-top:4px">
        ${c.events_received_count || 0} evento(s)${c.last_event_received_at ? '<br>último: ' + new Date(c.last_event_received_at).toLocaleString('pt-BR') : ''}
      </div>
      <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px">
        <a href="/cameras?live=${c.id}" style="background:#334155;color:#cbd5e1;padding:3px 8px;border-radius:4px;text-decoration:none;font-size:11px">Ao vivo</a>
        <a href="/cameras?eventsCam=${c.id}" style="background:#334155;color:#cbd5e1;padding:3px 8px;border-radius:4px;text-decoration:none;font-size:11px">Eventos</a>
      </div>
    </div>`
}

function buildJimiPopup(c: any): string {
  return `
    <div style="min-width:220px">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="font-size:18px">🚐</span><strong>${escapeHtml(c.name)}</strong>${demoBadge(c)}</div>
      <div style="font-size:11px;color:#94a3b8">Câmera Jimi · IMEI ${escapeHtml(c.imei)}</div>
      <div style="font-size:11px;color:#cbd5e1;margin-top:6px">
        Status: ${escapeHtml(c.status)}${c.last_position_at ? '<br>Última posição: ' + new Date(c.last_position_at).toLocaleString('pt-BR') : ''}
      </div>
      <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px">
        <a href="/cameras?jimi=${c.id}" style="background:#334155;color:#cbd5e1;padding:3px 8px;border-radius:4px;text-decoration:none;font-size:11px">Detalhes</a>
      </div>
    </div>`
}

function buildIotPopup(d: any): string {
  const stateLine = d.state && typeof d.state === 'object'
    ? Object.entries(d.state).map(([k, v]) => `${escapeHtml(k)}: ${escapeHtml(typeof v === 'object' ? JSON.stringify(v) : v)}`).join('<br>')
    : escapeHtml(d.status || '')
  const onlinePill = d.online === false
    ? '<span style="background:#64748b;color:white;font-size:9px;padding:2px 6px;border-radius:3px;margin-left:6px">OFFLINE</span>'
    : '<span style="background:#22c55e;color:white;font-size:9px;padding:2px 6px;border-radius:3px;margin-left:6px">ONLINE</span>'
  return `
    <div style="min-width:220px">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap"><span style="font-size:18px">💡</span><strong>${escapeHtml(d.name)}</strong>${demoBadge(d)}${onlinePill}</div>
      <div style="font-size:11px;color:#94a3b8">${escapeHtml(d.vendor || 'tuya')} · ${escapeHtml(d.device_type)}${d.location_desc ? ' · ' + escapeHtml(d.location_desc) : ''}</div>
      <div style="font-size:11px;color:#cbd5e1;margin-top:6px;line-height:1.5">${stateLine}</div>
      <div style="margin-top:8px"><a href="/tuya" style="background:#334155;color:#cbd5e1;padding:3px 8px;border-radius:4px;text-decoration:none;font-size:11px">Painel IoT</a></div>
    </div>`
}

function buildEventPopup(e: any): string {
  const ICONS: Record<string, string> = { motion:'🏃', lpr:'🚗', intrusion:'🚨', line_crossing:'↔', face:'👤', person:'🚶', tampering:'🔧' }
  const icon = ICONS[e.event_type] || '❔'
  const headline = e.payload?.plate ? `Placa ${e.payload.plate}` : e.payload?.description || ''
  const dispatch = e.dispatched_to_wf_username
    ? `<div style="color:#67e8f9;font-size:11px;margin-top:4px">📍 → ${escapeHtml(e.dispatched_to_wf_username)}${e.dispatched_to_distance_m != null ? ' (' + (e.dispatched_to_distance_m/1000).toFixed(1) + ' km)' : ''}</div>`
    : e.dispatch_status === 'no_agent_in_radius'
      ? `<div style="color:#fbbf24;font-size:11px;margin-top:4px">⚠ nenhum agente no raio</div>`
      : ''
  return `
    <div style="min-width:240px">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="font-size:16px">${icon}</span><strong>${escapeHtml(e.event_type)}${e.severity === 'critical' ? ' · CRÍTICO' : ''}</strong>${demoBadge(e)}</div>
      <div style="font-size:11px;color:#94a3b8">${escapeHtml(e.camera_name)}</div>
      ${headline ? `<div style="margin-top:2px;font-size:12px">${escapeHtml(headline)}</div>` : ''}
      ${e.snapshot_url ? `<img src="${escapeHtml(e.snapshot_url)}" style="width:100%;margin-top:6px;border-radius:4px;background:#000;max-height:140px;object-fit:cover" onerror="this.style.display='none'">` : ''}
      ${dispatch}
      <div style="font-size:11px;color:#94a3b8;margin-top:4px">${new Date(e.received_at).toLocaleString('pt-BR')}</div>
      <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px">
        <a href="/cameras?event=${e.id}" style="background:#334155;color:#cbd5e1;padding:3px 8px;border-radius:4px;text-decoration:none;font-size:11px">Detalhes</a>
      </div>
    </div>`
}

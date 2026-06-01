import { useEffect, useState, useRef, ReactNode, CSSProperties } from 'react'
import { APIProvider, Map, useMap } from '@vis.gl/react-google-maps'
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap as useLeafletMap } from 'react-leaflet'
import { MarkerClusterer } from '@googlemaps/markerclusterer'
import 'leaflet/dist/leaflet.css'

export type MapMarkerSpec = {
  id: string | number
  lat: number
  lng: number
  label?: string
  color?: string
  icon?: string
  onClick?: () => void
  isSelected?: boolean
}

export type MapBaseProps = {
  center?: { lat: number; lng: number }
  zoom?: number
  markers?: MapMarkerSpec[]
  mapType?: 'roadmap' | 'satellite' | 'hybrid' | 'terrain'
  showTrafficLayer?: boolean
  className?: string
  style?: CSSProperties
  children?: ReactNode
  onClick?: (lat: number, lng: number) => void
  /** Forçar Leaflet mesmo com chave válida (ex: tela com Polyline/Polygon ainda não migrados) */
  forceLeaflet?: boolean
  /** Ocultar toggle de basemap (default: visível) */
  hideBaseLayerToggle?: boolean
}

const GOOGLE_KEY = ((import.meta as any).env?.VITE_GOOGLE_MAPS_KEY || '').trim()
export const HAS_VALID_GOOGLE_KEY = !!GOOGLE_KEY && GOOGLE_KEY !== 'GOOGLE_MAPS_KEY' && GOOGLE_KEY.startsWith('AIza')

export type BaseLayer = 'streets' | 'dark' | 'satellite'

export const BASE_LAYERS: Record<BaseLayer, {
  label: string
  url: string
  subdomains?: string
  attribution: string
  maxZoom: number
  icon: string
}> = {
  streets: {
    label: 'Ruas',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    subdomains: 'abc',
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
    icon: '🗺️',
  },
  dark: {
    label: 'Escuro',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    subdomains: 'abcd',
    attribution: '© OpenStreetMap, © CARTO',
    maxZoom: 19,
    icon: '🌙',
  },
  satellite: {
    label: 'Satélite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    subdomains: 'abc',
    attribution: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    maxZoom: 19,
    icon: '🛰️',
  },
}

const STORAGE_KEY = 'iot_basemap_pref'
const DEFAULT_LAYER: BaseLayer = 'dark'

export function useBaseLayer(): [BaseLayer, (l: BaseLayer) => void] {
  const [activeLayer, setActiveLayer] = useState<BaseLayer>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as BaseLayer | null
      if (stored && BASE_LAYERS[stored]) return stored
    } catch {}
    return DEFAULT_LAYER
  })

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, activeLayer) } catch {}
  }, [activeLayer])

  return [activeLayer, setActiveLayer]
}

export function BaseLayerToggle({
  active,
  onChange,
  className = 'absolute top-4 right-4 z-[1000]',
}: { active: BaseLayer; onChange: (l: BaseLayer) => void; className?: string }) {
  const [open, setOpen] = useState(false)

  return (
    <div
      className={className}
      onClick={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
      onWheel={e => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="bg-slate-900/90 border border-white/15 backdrop-blur-sm rounded-lg px-3 py-2 text-sm text-white shadow-lg hover:bg-slate-800 flex items-center gap-2"
        title="Mudar estilo do mapa"
      >
        <span>{BASE_LAYERS[active].icon}</span>
        <span className="font-medium">{BASE_LAYERS[active].label}</span>
        <span className="text-white/40 text-xs">▾</span>
      </button>

      {open && (
        <div className="mt-1 bg-slate-900/95 border border-white/15 rounded-lg overflow-hidden shadow-xl min-w-[160px]">
          {(Object.keys(BASE_LAYERS) as BaseLayer[]).map(key => (
            <button
              key={key}
              type="button"
              onClick={() => { onChange(key); setOpen(false) }}
              className={`w-full px-4 py-2 text-sm flex items-center gap-2 hover:bg-cyan-500/20 transition ${
                active === key ? 'bg-cyan-500/30 text-cyan-200' : 'text-white/90'
              }`}
            >
              <span>{BASE_LAYERS[key].icon}</span>
              <span>{BASE_LAYERS[key].label}</span>
              {active === key && <span className="ml-auto text-cyan-300">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function MapBase({
  center = { lat: -15.7942, lng: -47.8822 },
  zoom = 12,
  markers = [],
  mapType,
  showTrafficLayer = false,
  className = 'w-full h-full',
  style,
  children,
  onClick,
  forceLeaflet,
  hideBaseLayerToggle,
}: MapBaseProps) {
  const [googleFailed, setGoogleFailed] = useState(false)
  const [activeLayer, setActiveLayer] = useBaseLayer()

  const useLeaflet = forceLeaflet || !HAS_VALID_GOOGLE_KEY || googleFailed

  if (useLeaflet) {
    return (
      <div className={`${className} relative`} style={style}>
        <MapBaseLeaflet
          center={center}
          zoom={zoom}
          markers={markers}
          onClick={onClick}
          activeLayer={activeLayer}
        >
          {children}
        </MapBaseLeaflet>
        {!hideBaseLayerToggle && (
          <BaseLayerToggle active={activeLayer} onChange={setActiveLayer} />
        )}
      </div>
    )
  }

  const googleMapType: 'roadmap' | 'satellite' | 'hybrid' | 'terrain' = mapType ?? ({
    streets: 'roadmap',
    dark: 'roadmap',
    satellite: 'hybrid',
  } as const)[activeLayer]

  return (
    <div className={`${className} relative`} style={style}>
      <APIProvider apiKey={GOOGLE_KEY} onError={() => setGoogleFailed(true)} libraries={['places', 'geometry', 'marker']}>
        <Map
          defaultCenter={center}
          defaultZoom={zoom}
          mapTypeId={googleMapType}
          gestureHandling="greedy"
          disableDefaultUI={false}
          mapId="GROUPATES_IOT_MAP"
          style={{ width: '100%', height: '100%' }}
          onClick={(ev: any) => {
            const ll = ev.detail?.latLng
            if (ll && onClick) onClick(ll.lat, ll.lng)
          }}
        >
          <GoogleMarkers markers={markers} />
          {showTrafficLayer && <TrafficLayer />}
          {children}
        </Map>
      </APIProvider>
      {!hideBaseLayerToggle && (
        <BaseLayerToggle active={activeLayer} onChange={setActiveLayer} />
      )}
    </div>
  )
}

function GoogleMarkers({ markers }: { markers: MapMarkerSpec[] }) {
  const map = useMap()
  const markerRefs = useRef<Record<string, any>>({})

  useEffect(() => {
    if (!map || !(window as any).google?.maps?.marker) return
    Object.values(markerRefs.current).forEach((m: any) => { if (m) m.map = null })
    markerRefs.current = {}

    const AdvCtor = (window as any).google.maps.marker.AdvancedMarkerElement
    if (!AdvCtor) return

    markers.forEach(m => {
      const el = document.createElement('div')
      el.style.cssText = `
        background: ${m.color || '#06b6d4'};
        width: 28px; height: 28px; border-radius: 50%;
        border: 3px solid ${m.isSelected ? '#fbbf24' : '#fff'};
        box-shadow: 0 2px 6px rgba(0,0,0,0.4);
        display: flex; align-items: center; justify-content: center;
        font-size: 14px; color: #fff;
        ${m.isSelected ? 'transform: scale(1.4); z-index: 10;' : ''}
      `
      if (m.icon) el.textContent = m.icon

      const adv = new AdvCtor({
        map,
        position: { lat: m.lat, lng: m.lng },
        content: el,
        title: m.label || '',
      })
      if (m.onClick) adv.addListener('click', m.onClick)
      markerRefs.current[String(m.id)] = adv
    })
  }, [map, markers])

  return null
}

function TrafficLayer() {
  const map = useMap()
  useEffect(() => {
    if (!map || !(window as any).google?.maps?.TrafficLayer) return
    const layer = new (window as any).google.maps.TrafficLayer()
    layer.setMap(map)
    return () => layer.setMap(null)
  }, [map])
  return null
}

function MapBaseLeaflet({
  center,
  zoom,
  markers,
  children,
  onClick,
  activeLayer,
}: MapBaseProps & { activeLayer: BaseLayer }) {
  const layer = BASE_LAYERS[activeLayer]
  return (
    <MapContainer
      center={[center!.lat, center!.lng]}
      zoom={zoom}
      style={{ width: '100%', height: '100%', background: '#1e293b' }}
    >
      <TileLayer
        key={activeLayer}
        url={layer.url}
        subdomains={(layer.subdomains ?? 'abc') as any}
        attribution={layer.attribution}
        maxZoom={layer.maxZoom}
      />
      {markers?.map(m => (
        <CircleMarker
          key={m.id}
          center={[m.lat, m.lng]}
          radius={m.isSelected ? 12 : 8}
          pathOptions={{
            color: m.isSelected ? '#fbbf24' : '#fff',
            fillColor: m.color || '#06b6d4',
            fillOpacity: 1,
            weight: 3,
          }}
          eventHandlers={{ click: () => m.onClick?.() }}
        >
          {m.label && <Tooltip>{m.label}</Tooltip>}
        </CircleMarker>
      ))}
      {children}
      <LeafletClickHandler onClick={onClick} />
    </MapContainer>
  )
}

function LeafletClickHandler({ onClick }: { onClick?: (lat: number, lng: number) => void }) {
  const m = useLeafletMap()
  useEffect(() => {
    if (!onClick) return
    const h = (e: any) => onClick(e.latlng.lat, e.latlng.lng)
    m.on('click', h)
    return () => { m.off('click', h) }
  }, [m, onClick])
  return null
}

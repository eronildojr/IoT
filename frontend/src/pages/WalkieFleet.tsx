/**
 * WalkieFleet page — embeds the standalone Dispatch Console UI inside the
 * platform layout via iframe at /wf-dispatch/. A postMessage bridge connects
 * this wrapper to the iframe so the React side can react to PTT/SOS/message
 * events and send commands (focus device, switch tab, send message, fire SOS).
 *
 * Deep link: /walkiefleet?agent=<deviceId> auto-focuses that radio inside the
 * iframe and opens the Dispatch tab. Works even on first load — the wrapper
 * waits for the iframe:ready handshake before sending cmd:focus-device.
 *
 * Persistência (Prompt 24): cada evento do bridge é forwarded ao backend via
 * POST /api/walkiefleet/events/* com JWT do React (tenant-scoped). Snapshot
 * periódico de 60s garante que devices/groups não fiquem stale após reload.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/store/auth'

const ENVELOPE_SOURCE = 'groupates-bridge'
const PROTOCOL_VERSION = 1

type IframeMeta = { login?: string; deviceId?: string; serverVersion?: string | null }

export default function WalkieFleet() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [searchParams] = useSearchParams()
  const [bridgeReady, setBridgeReady] = useState(false)
  const [iframeMeta, setIframeMeta] = useState<IframeMeta | null>(null)
  const token = useAuth((s) => s.token)

  const agentParam = searchParams.get('agent')

  // Force the parent <main> to behave as a flex container so the iframe can
  // stretch to fill it without scroll bleed.
  useEffect(() => {
    const main = document.querySelector('main') as HTMLElement | null
    if (!main) return
    const prev = {
      display: main.style.display,
      overflow: main.style.overflow,
      padding: main.style.padding,
    }
    main.style.display = 'flex'
    main.style.flexDirection = 'column'
    main.style.overflow = 'hidden'
    main.style.padding = '0'
    return () => {
      main.style.display = prev.display
      main.style.overflow = prev.overflow
      main.style.padding = prev.padding
    }
  }, [])

  const sendToIframe = useCallback((type: string, payload?: unknown) => {
    const win = iframeRef.current?.contentWindow
    if (!win) return
    win.postMessage(
      {
        source: ENVELOPE_SOURCE,
        version: PROTOCOL_VERSION,
        type,
        payload: payload || null,
        ts: Date.now(),
      },
      window.location.origin,
    )
  }, [])

  const postEvent = useCallback(
    async (path: string, body: any) => {
      if (!token) return
      try {
        const r = await fetch(`/api/walkiefleet${path}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        })
        if (!r.ok) console.warn(`[WF bridge] falha persistindo ${path}: HTTP ${r.status}`)
      } catch (err) {
        console.warn(`[WF bridge] erro de rede em ${path}:`, err)
      }
    },
    [token],
  )

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return
      const data = e.data as { source?: string; version?: number; type?: string; payload?: any }
      if (!data || data.source !== ENVELOPE_SOURCE || data.version !== PROTOCOL_VERSION) return

      switch (data.type) {
        case 'iframe:ready':
          setBridgeReady(true)
          setIframeMeta(data.payload || {})
          if (agentParam) sendToIframe('cmd:focus-device', { deviceId: agentParam })
          // Pede snapshots iniciais para popular DB
          sendToIframe('cmd:list-devices')
          sendToIframe('cmd:list-groups')
          break

        case 'devices:snapshot':
          postEvent('/events/devices-snapshot', { devices: data.payload?.devices ?? [] })
          break

        case 'groups:snapshot':
          postEvent('/events/groups-snapshot', { groups: data.payload?.groups ?? [] })
          break

        case 'device:status':
          // mini-snapshot de 1 device
          postEvent('/events/devices-snapshot', { devices: [data.payload] })
          break

        case 'message:received':
          postEvent('/events/message', { direction: 'in', ...(data.payload || {}) })
          break

        case 'message:sent':
          postEvent('/events/message', { direction: 'out', ...(data.payload || {}) })
          break

        case 'ptt:start':
          postEvent('/events/ptt-start', data.payload || {})
          break

        case 'ptt:end':
          postEvent('/events/ptt-end', data.payload || {})
          break

        case 'gps:update':
          postEvent('/events/gps', data.payload || {})
          break

        case 'sos:fired':
          postEvent('/events/message', {
            direction: 'in',
            jobId: `sos-${Date.now()}`,
            conversationType: 'group',
            toGroupId: data.payload?.groupId ?? null,
            text: '🆘 SOS disparado',
            isSos: true,
            ts: data.payload?.ts ?? Date.now(),
          })
          break

        case 'error':
          console.error('[WF bridge] erro do iframe:', data.payload)
          break
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [agentParam, sendToIframe, postEvent])

  // Re-aplica deep-link se o parâmetro ?agent= mudar depois do bridge subir.
  useEffect(() => {
    if (bridgeReady && agentParam) {
      sendToIframe('cmd:focus-device', { deviceId: agentParam })
    }
  }, [agentParam, bridgeReady, sendToIframe])

  // Snapshot periódico (60s) — fallback caso DATAEX CHANGE não emita evento individual.
  useEffect(() => {
    if (!bridgeReady) return
    const interval = setInterval(() => {
      sendToIframe('cmd:list-devices')
      sendToIframe('cmd:list-groups')
    }, 60_000)
    return () => clearInterval(interval)
  }, [bridgeReady, sendToIframe])

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 12px',
          fontSize: 11,
          color: bridgeReady ? '#86efac' : '#94a3b8',
          background: '#0a0e17',
          borderBottom: '1px solid #1e2d3d',
          flex: '0 0 auto',
        }}
      >
        <span>WalkieFleet PTT</span>
        <span>
          {bridgeReady
            ? `Bridge ativo · ${iframeMeta?.login ?? '?'} · ${(iframeMeta?.deviceId ?? '').slice(0, 8)}…`
            : 'Aguardando iframe…'}
        </span>
      </div>
      <iframe
        ref={iframeRef}
        src="/wf-dispatch/"
        title="WalkieFleet Dispatch"
        allow="microphone; camera; geolocation; autoplay; fullscreen"
        style={{
          flex: '1 1 auto',
          width: '100%',
          height: '100%',
          border: 0,
          display: 'block',
          background: '#0a0e17',
        }}
      />
    </>
  )
}

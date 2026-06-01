/**
 * Iframe do WalkieFleet que NUNCA é desmontado (Prompt 38).
 *
 * Montado UMA ÚNICA VEZ no layout raiz (components/Layout.tsx), fora do <Routes>.
 * Trocar de rota no React não destrói este componente — ele apenas alterna
 * visibilidade via CSS. Assim a sessão WF (servidor single-login) fica ativa o
 * tempo todo e nunca há competição de login → acaba o "Login em uso".
 *
 * CRÍTICO: esconder com `left:-99999px` + `visibility:hidden` (NÃO `display:none`).
 * `display:none` faz alguns browsers SUSPENDEREM o iframe (timers, áudio, WS
 * throttling). Mover para fora da tela mantém o iframe 100% vivo em background
 * (áudio do PTT continua tocando, WebSocket continua, sessão não cai).
 *
 * Toda a ponte (postMessage ↔ backend) que antes vivia em pages/WalkieFleet.tsx
 * foi migrada para cá, sem perda de funcionalidade.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/store/auth'

const ENVELOPE_SOURCE = 'groupates-bridge'
const PROTOCOL_VERSION = 1

type IframeMeta = { login?: string; displayName?: string; deviceId?: string; serverVersion?: string | null }

export default function PersistentWalkieFleet() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [bridgeReady, setBridgeReady] = useState(false)
  const [iframeMeta, setIframeMeta] = useState<IframeMeta | null>(null)
  const token = useAuth((s) => s.token)

  const agentParam = searchParams.get('agent')

  // VISÍVEL apenas na rota /walkiefleet. Nas demais, escondido mas VIVO.
  const isVisible = location.pathname.startsWith('/walkiefleet')

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
          console.warn('[WF SOS] disparado:', data.payload)
          // Auditoria dedicada (Prompt 26) + linha em messages para o feed
          postEvent('/events/sos', data.payload || {})
          postEvent('/events/message', {
            direction: 'in',
            jobId: data.payload?.callId || `sos-${Date.now()}`,
            conversationType: 'group',
            toGroupId: data.payload?.groupId ?? null,
            text: '🆘 SOS disparado',
            isSos: true,
            ts: data.payload?.ts ?? Date.now(),
          })
          break

        case 'sos:ended':
          postEvent('/events/sos-end', data.payload || {})
          break

        case 'command:response':
          postEvent('/events/command-response', data.payload || {})
          break

        case 'config:save':
          (async () => {
            try {
              const r = await fetch('/api/walkiefleet/config', {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(data.payload || {}),
              })
              const body = await r.json().catch(() => ({}))
              if (r.ok) {
                sendToIframe('cmd:config-saved', { ok: true, changed: body.changed })
                sendToIframe('cmd:reconnect', {})
              } else {
                sendToIframe('cmd:config-saved', { ok: false, error: body.error || `HTTP ${r.status}` })
              }
            } catch (err: any) {
              sendToIframe('cmd:config-saved', { ok: false, error: err?.message || String(err) })
            }
          })()
          break

        case 'history:request':
          (async () => {
            const { conversationType, peerId, before } = data.payload || {}
            try {
              const qs = new URLSearchParams({
                conversationType: conversationType || '',
                peerId: peerId || '',
                ...(before ? { before: String(before) } : {}),
                limit: '50',
              }).toString()
              const r = await fetch(`/api/walkiefleet/messages/history?${qs}`, {
                headers: { Authorization: `Bearer ${token}` },
              })
              const body = await r.json().catch(() => ({}))
              sendToIframe('history:loaded', { conversationType, peerId, messages: body.messages || [] })
            } catch (err) {
              sendToIframe('history:loaded', { conversationType, peerId, messages: [], error: String(err) })
            }
          })()
          break

        case 'ptt:recording-ready':
          (async () => {
            try {
              const { callId, durationMs, blob } = data.payload || {}
              if (!blob || !callId) return
              const fd = new FormData()
              fd.append('audio', blob, `${callId}.wav`)
              fd.append('callId', callId)
              fd.append('durationMs', String(durationMs ?? ''))
              const r = await fetch('/api/walkiefleet/recordings', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: fd,
              })
              const body = await r.json().catch(() => ({}))
              if (r.ok) console.log('[WF] recording uploaded:', body.url)
              else console.error('[WF] recording upload erro:', body.error || r.status)
            } catch (err) {
              console.error('[WF] recording upload erro:', err)
            }
          })()
          break

        case 'memory:stats':
          // telemetria de memória do iframe (Prompt 34) — apenas observabilidade
          break

        case 'session:scheduled-restart':
          // Restart programado de sessão (12h) — Prompt 35-FIX-2. Auditoria opcional.
          console.log('[WF] Restart programado de sessão (12h):', data.payload)
          postEvent('/events/session-restart', data.payload || {})
          break

        case 'error':
          console.error('[WF bridge] erro do iframe:', data.payload)
          break
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [agentParam, sendToIframe, postEvent, token])

  // Após o handshake, busca a config do tenant (com JWT) e injeta no iframe (Prompt 31)
  useEffect(() => {
    if (!bridgeReady || !token) return
    ;(async () => {
      try {
        const r = await fetch('/api/walkiefleet/config', { headers: { Authorization: `Bearer ${token}` } })
        if (!r.ok) return
        const cfg = await r.json()
        sendToIframe('cmd:set-config', {
          wfServerHost: cfg.host ?? cfg.wfServerHost ?? '',
          wfServerPort: cfg.port ?? cfg.wfServerPort ?? 5058,
          wfDispatcherLogin: cfg.login ?? cfg.wfDispatcherLogin ?? '',
          wfDispatcherPass: '', // nunca devolver a senha ao iframe
        })
      } catch (e) {
        console.warn('[WF] falha ao buscar config', e)
      }
    })()
  }, [bridgeReady, token, sendToIframe])

  // Após o handshake, busca o grupo de emergência (alvo do SOS) e injeta no iframe (Prompt 26)
  useEffect(() => {
    if (!bridgeReady || !token) return
    ;(async () => {
      try {
        const r = await fetch('/api/walkiefleet/groups/emergency', { headers: { Authorization: `Bearer ${token}` } })
        const data = await r.json().catch(() => ({}))
        if (data.group) {
          sendToIframe('cmd:set-emergency-group', { groupId: data.group.groupId, groupName: data.group.name })
        } else {
          console.warn('[WF] Nenhum grupo Emergency configurado:', data.reason)
          sendToIframe('cmd:set-emergency-group', { groupId: null, reason: data.reason || 'não configurado' })
        }
      } catch (e) {
        console.error('[WF] erro buscando grupo Emergency:', e)
      }
    })()
  }, [bridgeReady, token, sendToIframe])

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
    <div
      aria-hidden={!isVisible}
      style={{
        // Sempre absolute para sobrepor a área de conteúdo (<main relative>).
        position: 'absolute',
        display: 'flex',
        flexDirection: 'column',
        // ESCONDER sem desmontar: empurra para fora da tela (mantém iframe vivo).
        left: isVisible ? 0 : '-99999px',
        top: 0,
        right: isVisible ? 0 : 'auto',
        bottom: isVisible ? 0 : 'auto',
        width: '100%',
        height: '100%',
        visibility: isVisible ? 'visible' : 'hidden',
        pointerEvents: isVisible ? 'auto' : 'none',
        zIndex: isVisible ? 1 : -1,
        background: '#0a0e17',
      }}
    >
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
            ? `Bridge ativo · ${iframeMeta?.displayName ?? iframeMeta?.login ?? '?'} · ${(iframeMeta?.deviceId ?? '').slice(0, 8)}…`
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
    </div>
  )
}

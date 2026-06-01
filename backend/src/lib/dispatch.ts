/**
 * Motor de despacho compartilhado (Fase 3A).
 *
 * Extraído de routes/index.ts SEM mudança de comportamento: o despacho de
 * câmeras (dispatchEventAsync) e o de ocorrências WhatsApp (waPipeline) usam
 * a MESMA lógica de "agente mais próximo" — lê wf_agents, busca posições no
 * Traccar, filtra por frescor (valid + fixTime < 5min) e calcula haversine.
 */
import axios from 'axios';
import { query, queryOne } from '../config/db';

export const AGENT_ONLINE_MS = 300000; // 5 min

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export async function getTraccar(tenantId: string) {
  const t = await queryOne<any>('SELECT traccar_server_url,traccar_admin_user,traccar_admin_pass FROM tenants WHERE id=$1', [tenantId]);
  if (!t?.traccar_server_url) return null;
  return { base: t.traccar_server_url.replace(/\/$/, ''), auth: { username: t.traccar_admin_user || 'admin', password: t.traccar_admin_pass || 'admin' } };
}

export async function getTraccarPositions(tenantId: string): Promise<any[]> {
  const cfg = await getTraccar(tenantId);
  if (!cfg) throw new Error('traccar_not_configured');
  const r = await axios.get(`${cfg.base}/api/positions`, { auth: cfg.auth, timeout: 5000 });
  return Array.isArray(r.data) ? r.data : [];
}

export interface AgentRow {
  id: number;
  wf_username: string;
  display_name: string | null;
  traccar_device_id: number;
}

export interface ConsideredAgent {
  wf_username: string;
  traccar_device_id: number;
  distance_m: number | null;
  fresh: boolean;
}

export interface NearestAgentResult {
  agent: AgentRow | null;
  distance_m: number | null;
  reason: 'ok' | 'no_enabled_agents' | 'traccar_error' | 'no_agent_in_radius';
  error?: string;
  considered: ConsideredAgent[];
}

/**
 * Acha o agente WF habilitado mais próximo de (lat,lng) dentro de maxRadiusM,
 * usando posições frescas (valid + fixTime < AGENT_ONLINE_MS) do Traccar.
 * Reúne também a lista de agentes considerados (para auditoria).
 */
export async function findNearestAgent(
  lat: number, lng: number, maxRadiusM: number, tenantId: string
): Promise<NearestAgentResult> {
  const agents = await query<AgentRow>(
    'SELECT id, wf_username, display_name, traccar_device_id FROM wf_agents WHERE enabled=true AND traccar_device_id IS NOT NULL'
  );
  if (!agents.length) {
    return { agent: null, distance_m: null, reason: 'no_enabled_agents', considered: [] };
  }

  let positions: any[];
  try {
    positions = await getTraccarPositions(tenantId);
  } catch (e: any) {
    return { agent: null, distance_m: null, reason: 'traccar_error', error: e.message, considered: [] };
  }

  const now = Date.now();
  const freshPos = new Map<number, any>();
  for (const p of positions) {
    if (p.valid && (now - new Date(p.fixTime).getTime()) < AGENT_ONLINE_MS)
      freshPos.set(p.deviceId, p);
  }

  const considered: ConsideredAgent[] = [];
  let best: { agent: AgentRow; dist: number } | null = null;
  for (const ag of agents) {
    const pos = freshPos.get(ag.traccar_device_id);
    if (!pos) {
      considered.push({ wf_username: ag.wf_username, traccar_device_id: ag.traccar_device_id, distance_m: null, fresh: false });
      continue;
    }
    const dist = haversineMeters(lat, lng, pos.latitude, pos.longitude);
    considered.push({ wf_username: ag.wf_username, traccar_device_id: ag.traccar_device_id, distance_m: Math.round(dist), fresh: true });
    if (dist > maxRadiusM) continue;
    if (!best || dist < best.dist) best = { agent: ag, dist };
  }

  if (!best) return { agent: null, distance_m: null, reason: 'no_agent_in_radius', considered };
  return { agent: best.agent, distance_m: Math.round(best.dist), reason: 'ok', considered };
}

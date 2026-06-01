/**
 * Agentes logados no WalkieFleet (Script 33).
 * Fonte = walkiefleet_devices (populado pelo DATAEX devices-snapshot): device_id
 * (=Destination Base64), wf_user_id, login/wf_user_name, status, last_location.
 * Enriquecido com alocação (Script 29), bairro (geocoding reverso) e, se houver
 * occurrenceId, distância haversine (reusa lib/dispatch).
 */
import { query, queryOne } from '../config/db';
import { haversineMeters } from '../lib/dispatch';
import { getAllocationMap } from './waDispatch';
import { reverseGeocode } from './geocode';
import { normalize } from '../utils/priority';

export interface WfAgent {
  wf_user_id: string | null;
  wf_device_id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  online: boolean;
  status: string;
  allocated: boolean;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  distance_m: number | null;
}

export async function getWfAgents(
  tenantId: string | null,
  opts: { neighborhood?: string; city?: string; occurrenceId?: number } = {},
): Promise<WfAgent[]> {
  if (!tenantId) return [];

  const rows = await query<any>(
    `SELECT device_id, wf_user_id, wf_user_name, login, name, status,
            last_location_lat AS lat, last_location_lng AS lng
       FROM walkiefleet_devices
      WHERE tenant_id=$1
      ORDER BY login`,
    [tenantId],
  );

  const alloc = await getAllocationMap();

  // Coordenadas da ocorrência (opcional) para distância/ordenação.
  let occLat: number | null = null, occLng: number | null = null;
  if (opts.occurrenceId) {
    const occ = await queryOne<any>('SELECT latitude, longitude FROM wa_occurrences WHERE id=$1', [opts.occurrenceId]);
    if (occ && occ.latitude != null && occ.longitude != null) { occLat = Number(occ.latitude); occLng = Number(occ.longitude); }
  }

  const out: WfAgent[] = [];
  for (const r of rows) {
    const online = r.status === 'online';
    const name = r.wf_user_name || r.login || String(r.device_id).slice(0, 12);
    const allocated = (alloc.get(r.login) || 0) > 0;
    const geo = await reverseGeocode(r.lat, r.lng); // cacheado
    let distance_m: number | null = null;
    if (occLat != null && occLng != null && r.lat != null && r.lng != null) {
      distance_m = Math.round(haversineMeters(occLat, occLng, Number(r.lat), Number(r.lng)));
    }
    let status = r.status || 'offline';
    if (r.status === 'sos') status = 'sos';
    else if (allocated) status = 'allocated';
    else if (online) status = 'available';
    else status = 'offline';

    out.push({
      wf_user_id: r.wf_user_id || null,
      wf_device_id: r.device_id,
      name,
      lat: r.lat != null ? Number(r.lat) : null,
      lng: r.lng != null ? Number(r.lng) : null,
      online, status, allocated,
      neighborhood: geo.neighborhood, city: geo.city, state: geo.state,
      distance_m,
    });
  }

  // Filtro por bairro/cidade (case-insensitive, sem acento).
  let filtered = out;
  if (opts.neighborhood) {
    const n = normalize(opts.neighborhood);
    filtered = filtered.filter((a) => a.neighborhood && normalize(a.neighborhood).includes(n));
  }
  if (opts.city) {
    const c = normalize(opts.city);
    filtered = filtered.filter((a) => a.city && normalize(a.city).includes(c));
  }

  // Ordena por distância se houver ocorrência de referência.
  if (occLat != null && occLng != null) {
    filtered.sort((x, y) => {
      if (x.distance_m == null) return 1;
      if (y.distance_m == null) return -1;
      return x.distance_m - y.distance_m;
    });
  }

  return filtered;
}

/** Bairros/cidades distintos detectados (agentes online + ocorrências) p/ o dropdown. */
export async function getNeighborhoods(tenantId: string | null): Promise<{ neighborhoods: string[]; cities: string[] }> {
  const set = new Set<string>();
  const cities = new Set<string>();

  // De ocorrências já geocodadas (barato — sem chamada externa).
  const occ = await query<any>(
    "SELECT DISTINCT neighborhood, city FROM wa_occurrences WHERE neighborhood IS NOT NULL OR city IS NOT NULL",
  ).catch(() => []);
  for (const r of occ) { if (r.neighborhood) set.add(r.neighborhood); if (r.city) cities.add(r.city); }

  // Dos agentes (usa cache de geocoding; só agentes online para não varrer tudo).
  if (tenantId) {
    const agents = await getWfAgents(tenantId, {});
    for (const a of agents) {
      if (a.neighborhood) set.add(a.neighborhood);
      if (a.city) cities.add(a.city);
    }
  }

  return {
    neighborhoods: [...set].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    cities: [...cities].sort((a, b) => a.localeCompare(b, 'pt-BR')),
  };
}

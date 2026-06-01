/**
 * Geocoding reverso (bairro/cidade) via Nominatim/OpenStreetMap, com cache em
 * geo_cache. Dado REAL — nunca inventa bairro: em falha/incerteza retorna null.
 *
 * Regras Nominatim: máx 1 req/s e User-Agent próprio. Serializamos as chamadas
 * com um gap mínimo e cacheamos por lat/lng arredondado (~11 m).
 */
import axios from 'axios';
import { query, queryOne } from '../config/db';

const NOMINATIM_URL = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT = process.env.GEOCODE_USER_AGENT || 'GroupATES-IoT-Dispatch/1.0 (suporte@groupates.com)';
const MIN_GAP_MS = 1100; // > 1 req/s

export interface GeoResult { neighborhood: string | null; city: string | null; state: string | null }
const EMPTY: GeoResult = { neighborhood: null, city: null, state: null };

const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

// Serializa as chamadas externas respeitando o rate limit.
let chain: Promise<any> = Promise.resolve();
let lastCall = 0;
function schedule<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = MIN_GAP_MS - (Date.now() - lastCall);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    return fn();
  });
  // Mantém a corrente viva mesmo em erro.
  chain = run.then(() => undefined, () => undefined);
  return run;
}

/**
 * Resolve bairro/cidade de uma coordenada. Usa cache; só bate no Nominatim em
 * cache-miss. Em qualquer erro retorna nulls (a UI mostra "bairro indefinido").
 */
export async function reverseGeocode(lat: number | null | undefined, lng: number | null | undefined): Promise<GeoResult> {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return { ...EMPTY };
  const latR = round4(lat), lngR = round4(lng);

  const cached = await queryOne<any>(
    'SELECT neighborhood, city, state FROM geo_cache WHERE lat_round=$1 AND lng_round=$2',
    [latR, lngR],
  ).catch(() => null);
  if (cached) return { neighborhood: cached.neighborhood, city: cached.city, state: cached.state };

  let result: GeoResult = { ...EMPTY };
  let raw: any = null;
  try {
    const r = await schedule(() => axios.get(NOMINATIM_URL, {
      params: { lat: latR, lon: lngR, format: 'json', addressdetails: 1, zoom: 16 },
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'pt-BR' },
      timeout: 8000,
    }));
    raw = r.data;
    const a = r.data?.address || {};
    result = {
      neighborhood: a.suburb || a.neighbourhood || a.city_district || a.quarter || a.borough || null,
      city: a.city || a.town || a.village || a.municipality || null,
      state: a.state || null,
    };
  } catch (e: any) {
    console.warn(`[geocode] reverse falhou (${latR},${lngR}): ${e.message}`);
    return { ...EMPTY }; // não cacheia falha — tenta de novo numa próxima
  }

  // Cacheia apenas resultados obtidos (mesmo que parciais).
  await query(
    `INSERT INTO geo_cache (lat_round, lng_round, neighborhood, city, state, raw, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,NOW())
     ON CONFLICT (lat_round, lng_round) DO UPDATE SET
       neighborhood=EXCLUDED.neighborhood, city=EXCLUDED.city, state=EXCLUDED.state,
       raw=EXCLUDED.raw, updated_at=NOW()`,
    [latR, lngR, result.neighborhood, result.city, result.state, raw ? JSON.stringify(raw) : null],
  ).catch((e) => console.warn('[geocode] cache write fail:', e.message));

  return result;
}

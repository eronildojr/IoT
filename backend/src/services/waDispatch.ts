/**
 * Métricas de despacho + disponibilidade real de agentes (Script 29).
 *
 * Tudo aditivo e somente leitura: reaproveita o MOTOR DE POSIÇÃO existente
 * (lib/dispatch: getTraccarPositions/AGENT_ONLINE_MS) e a mesma noção de
 * "fresco" do despacho de câmeras e do waPipeline. NÃO recria motor de posição
 * nem altera o despacho de câmera.
 *
 * "Alocado" = agente é o dispatched_wf_username de alguma ocorrência aberta.
 * Fontes de alocação (mesmo campo wf_username em ambas):
 *   - wa_occurrences com status='dispatched' (ainda não 'closed'/'resolved');
 *   - ip_camera_events com dispatch_status='selected', não reconhecidas e
 *     recentes (janela curta, para não prender o agente indefinidamente).
 */
import { query, queryOne } from '../config/db';
import { getTraccarPositions, AGENT_ONLINE_MS } from '../lib/dispatch';
import { getDefaultTenantId } from './waPipeline';

// Ocorrência WhatsApp "aberta" = despachada e ainda não encerrada.
const WA_OPEN_CLAUSE = "status='dispatched' AND dispatched_wf_username IS NOT NULL";
// Janela de relevância da alocação por evento de câmera (atendimento em curso).
const CAMERA_ALLOC_WINDOW = "12 hours";

export interface AgentStatus {
  wf_username: string;
  display_name: string | null;
  last_lat: number | null;
  last_lng: number | null;
  fixTime: string | null;
  fresh: boolean;
  allocated: boolean;
  open_occurrences: number;
}

/**
 * Mapa wf_username -> nº de atendimentos abertos (WhatsApp + câmera).
 * Combinar as duas fontes evita marcar como livre um agente já em atendimento.
 */
export async function getAllocationMap(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const add = (u: string | null, n: number) => {
    if (!u) return;
    map.set(u, (map.get(u) || 0) + n);
  };

  const waRows = await query<any>(
    `SELECT dispatched_wf_username AS wf_username, COUNT(*)::int AS open_count
       FROM wa_occurrences WHERE ${WA_OPEN_CLAUSE} GROUP BY 1`
  );
  for (const r of waRows) add(r.wf_username, r.open_count);

  // Câmera: usa o mesmo wf_username. Só conta atendimento em curso (selecionado,
  // não reconhecido, recente) — assim não prende o agente para sempre.
  try {
    const camRows = await query<any>(
      `SELECT dispatched_to_wf_username AS wf_username, COUNT(*)::int AS open_count
         FROM ip_camera_events
        WHERE dispatch_status='selected'
          AND dispatched_to_wf_username IS NOT NULL
          AND acknowledged_at IS NULL
          AND dispatched_at > NOW() - INTERVAL '${CAMERA_ALLOC_WINDOW}'
        GROUP BY 1`
    );
    for (const r of camRows) add(r.wf_username, r.open_count);
  } catch (e: any) {
    // Tabela/colunas de câmera ausentes não devem derrubar as métricas.
    console.warn('[wa-dispatch] alocação por câmera indisponível:', e.message);
  }

  return map;
}

/**
 * Lista os agentes habilitados com posição (frescor) + estado de alocação.
 * Reaproveita exatamente o mesmo critério de frescor de lib/dispatch.
 */
export async function getAgentsStatus(tenantId: string | null): Promise<AgentStatus[]> {
  const agents = await query<any>(
    'SELECT wf_username, display_name, traccar_device_id FROM wf_agents WHERE enabled=true AND traccar_device_id IS NOT NULL ORDER BY id'
  );

  let positions: any[] = [];
  if (tenantId) {
    try { positions = await getTraccarPositions(tenantId); }
    catch (e: any) { console.warn('[wa-dispatch] traccar offline:', e.message); }
  }

  const now = Date.now();
  const posByDevice = new Map<number, any>();
  for (const p of positions) posByDevice.set(p.deviceId, p);

  const alloc = await getAllocationMap();

  return agents.map((a) => {
    const pos = posByDevice.get(a.traccar_device_id);
    const fresh = !!(pos && pos.valid && (now - new Date(pos.fixTime).getTime()) < AGENT_ONLINE_MS);
    const open = alloc.get(a.wf_username) || 0;
    return {
      wf_username: a.wf_username,
      display_name: a.display_name ?? null,
      last_lat: pos ? pos.latitude : null,
      last_lng: pos ? pos.longitude : null,
      fixTime: pos ? pos.fixTime : null,
      fresh,
      allocated: open > 0,
      open_occurrences: open,
    };
  });
}

/** Cards de métricas de despacho — tudo derivado de dados reais. */
export async function getDispatchMetrics(tenantId: string | null) {
  const occ = await queryOne<any>(`
    SELECT
      COUNT(*)::int                                                   AS total,
      COUNT(*) FILTER (WHERE created_at::date = NOW()::date)::int     AS today,
      COUNT(*) FILTER (WHERE status='pending_manual')::int            AS pending_manual,
      COUNT(*) FILTER (WHERE status='dispatched')::int                AS dispatched,
      COUNT(*) FILTER (WHERE status IN ('closed','resolved'))::int    AS closed,
      COUNT(*) FILTER (WHERE priority_level='critical')::int          AS critical,
      COUNT(*) FILTER (WHERE priority_level='high')::int              AS high,
      COUNT(*) FILTER (WHERE priority_level='medium')::int            AS medium,
      COUNT(*) FILTER (WHERE priority_level='low')::int               AS low
    FROM wa_occurrences`);

  const agents = await getAgentsStatus(tenantId);
  const fresh = agents.filter((a) => a.fresh).length;
  const allocated = agents.filter((a) => a.allocated).length;
  const available = agents.filter((a) => a.fresh && !a.allocated).length;

  return {
    occurrences: {
      total: occ?.total ?? 0,
      today: occ?.today ?? 0,
      pending_manual: occ?.pending_manual ?? 0,
      dispatched: occ?.dispatched ?? 0,
      closed: occ?.closed ?? 0,
      by_priority: {
        critical: occ?.critical ?? 0,
        high: occ?.high ?? 0,
        medium: occ?.medium ?? 0,
        low: occ?.low ?? 0,
      },
    },
    agents: {
      total: agents.length,
      fresh,
      available,
      allocated,
    },
  };
}

/** Payload único para o mapa: ocorrências geolocalizadas + agentes. */
export async function getDispatchMap(
  tenantId: string | null, opts: { status?: string; days?: number }
) {
  const where: string[] = ['o.latitude IS NOT NULL', 'o.longitude IS NOT NULL'];
  const vals: any[] = [];
  let i = 1;
  if (opts.status) { where.push(`o.status=$${i++}`); vals.push(opts.status); }
  if (opts.days && Number.isFinite(opts.days)) {
    where.push(`o.created_at >= NOW() - ($${i++} || ' days')::interval`);
    vals.push(String(Math.trunc(opts.days)));
  }

  const occurrences = await query<any>(
    `SELECT o.id, o.name, o.latitude AS lat, o.longitude AS lng,
            o.priority_level, o.priority_score, c.name AS category_name,
            o.status, o.dispatched_wf_username, o.created_at
       FROM wa_occurrences o
       LEFT JOIN wa_categories c ON c.id = o.category_id
      WHERE ${where.join(' AND ')}
      ORDER BY o.created_at DESC`,
    vals
  );

  const agents = (await getAgentsStatus(tenantId)).map((a) => ({
    wf_username: a.wf_username,
    display_name: a.display_name,
    lat: a.last_lat,
    lng: a.last_lng,
    fresh: a.fresh,
    allocated: a.allocated,
  }));

  return { occurrences, agents };
}

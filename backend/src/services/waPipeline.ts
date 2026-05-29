/**
 * Pipeline de classificação semântica + despacho inteligente de ocorrências.
 *
 * - Classifica via groupates_ai (/classify), reaproveitando embeddings das
 *   categorias.
 * - Despacha reutilizando o MOTOR EXISTENTE (../lib/dispatch.findNearestAgent),
 *   o mesmo do despacho de câmeras (Fase 3A). Não há motor paralelo.
 * - Tolerante a falha: erro em IA/Traccar → pending_manual, nunca derruba nada.
 * - Auditoria completa em wa_dispatch_log.
 */
import axios from 'axios';
import { query, queryOne } from '../config/db';
import { sendText } from './whatsmiau';
import { findNearestAgent } from '../lib/dispatch';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://groupates_ai:8090';

// ─── helpers ──────────────────────────────────────────────────────
async function getDefaultTenantId(): Promise<string | null> {
  const t = await queryOne<any>('SELECT id FROM tenants ORDER BY created_at LIMIT 1');
  return t?.id ?? null;
}

async function getConfig(): Promise<any> {
  return queryOne<any>('SELECT * FROM wa_config ORDER BY id LIMIT 1');
}

async function logDispatch(
  occurrenceId: number, action: string, wfUsername: string | null,
  distanceM: number | null, actor: string | null, detail: any
): Promise<void> {
  try {
    await query(
      `INSERT INTO wa_dispatch_log(occurrence_id, action, wf_username, distance_m, actor, detail)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [occurrenceId, action, wfUsername, distanceM, actor, detail ? JSON.stringify(detail) : null]
    );
  } catch (e: any) {
    console.error('[wa-pipeline] falha ao logar despacho:', e.message);
  }
}

interface CategoryPayload {
  id: number; name: string; priority: number;
  embedding: number[] | null; keywords: string[]; synonyms: string[];
}

async function loadActiveCategories(): Promise<CategoryPayload[]> {
  const cats = await query<any>(
    'SELECT id, name, priority, embedding FROM wa_categories WHERE active=true ORDER BY id'
  );
  const out: CategoryPayload[] = [];
  for (const c of cats) {
    const kws = await query<any>('SELECT term, is_synonym FROM wa_keywords WHERE category_id=$1', [c.id]);
    out.push({
      id: c.id, name: c.name, priority: c.priority,
      embedding: Array.isArray(c.embedding) ? c.embedding : null,
      keywords: kws.filter((k) => !k.is_synonym).map((k) => k.term),
      synonyms: kws.filter((k) => k.is_synonym).map((k) => k.term),
    });
  }
  return out;
}

// ─── embeddings de categoria (no salvar / reembed) ─────────────────
export function buildEmbedSource(name: string, keywords: string[], synonyms: string[]): string {
  return [name, ...(keywords || []), ...(synonyms || [])].filter(Boolean).join(' ').trim();
}

/**
 * Gera e salva o embedding de uma categoria. Se a chave OpenAI não estiver
 * configurada (ou erro), salva embedding=null e mantém embedding_source — a
 * classificação cairá no fallback GPT/manual até reprocessar (reembed).
 */
export async function embedCategory(categoryId: number): Promise<boolean> {
  const cat = await queryOne<any>('SELECT id, name FROM wa_categories WHERE id=$1', [categoryId]);
  if (!cat) return false;
  const kws = await query<any>('SELECT term, is_synonym FROM wa_keywords WHERE category_id=$1', [categoryId]);
  const keywords = kws.filter((k) => !k.is_synonym).map((k) => k.term);
  const synonyms = kws.filter((k) => k.is_synonym).map((k) => k.term);
  const source = buildEmbedSource(cat.name, keywords, synonyms);

  try {
    const r = await axios.post(`${AI_SERVICE_URL}/embed`, { text: source }, { timeout: 30_000 });
    const embedding = r.data?.embedding;
    if (!Array.isArray(embedding)) throw new Error('embedding inválido');
    await query(
      'UPDATE wa_categories SET embedding=$1, embedding_source=$2, updated_at=NOW() WHERE id=$3',
      [JSON.stringify(embedding), source, categoryId]
    );
    console.log(`[wa-pipeline] embedding gerado p/ categoria ${categoryId} (${embedding.length}d)`);
    return true;
  } catch (e: any) {
    await query(
      'UPDATE wa_categories SET embedding=NULL, embedding_source=$1, updated_at=NOW() WHERE id=$2',
      [source, categoryId]
    );
    console.warn(`[wa-pipeline] embedding categoria ${categoryId} falhou (${e.message}); salvo embedding=null`);
    return false;
  }
}

export async function reembedAll(): Promise<{ total: number; embedded: number }> {
  const cats = await query<any>('SELECT id FROM wa_categories WHERE active=true');
  let embedded = 0;
  for (const c of cats) if (await embedCategory(c.id)) embedded++;
  return { total: cats.length, embedded };
}

// ─── despacho (reutiliza o motor existente) ────────────────────────
async function autoDispatch(
  occ: any, cfg: any, action: 'auto' | 'redispatch', extraDetail: any = {}
): Promise<void> {
  const categoryName = occ.category_id
    ? (await queryOne<any>('SELECT name FROM wa_categories WHERE id=$1', [occ.category_id]))?.name
    : null;

  if (occ.latitude == null || occ.longitude == null) {
    await query('UPDATE wa_occurrences SET status=$1, updated_at=NOW() WHERE id=$2', ['pending_manual', occ.id]);
    await logDispatch(occ.id, action, null, null, null, { ...extraDetail, reason: 'no_coords' });
    return;
  }

  const tenantId = await getDefaultTenantId();
  if (!tenantId) {
    await query('UPDATE wa_occurrences SET status=$1, updated_at=NOW() WHERE id=$2', ['pending_manual', occ.id]);
    await logDispatch(occ.id, action, null, null, null, { ...extraDetail, reason: 'no_tenant' });
    await sendText(occ.phone, 'Sua ocorrência foi registrada e está em análise pela nossa equipe.');
    return;
  }

  const radius = cfg.dispatch_max_radius_m;
  const result = await findNearestAgent(Number(occ.latitude), Number(occ.longitude), radius, tenantId);
  const detail = { ...extraDetail, radius_m: radius, dispatch_reason: result.reason, considered: result.considered };

  if (!result.agent) {
    // Sem agente fresco no raio (ou Traccar offline / sem agentes) → manual.
    await query('UPDATE wa_occurrences SET status=$1, updated_at=NOW() WHERE id=$2', ['pending_manual', occ.id]);
    await logDispatch(occ.id, action, null, null, null, detail);
    console.log(`[wa-pipeline] ocorrência ${occ.id} → pending_manual (${result.reason})`);
    await sendText(occ.phone, 'Sua ocorrência foi registrada e está em análise pela nossa equipe. Em breve retornaremos.');
    return;
  }

  await query(
    `UPDATE wa_occurrences SET status='dispatched', dispatched_wf_username=$1,
       dispatched_distance_m=$2, dispatched_at=NOW(), updated_at=NOW() WHERE id=$3`,
    [result.agent.wf_username, result.distance_m, occ.id]
  );
  await logDispatch(occ.id, action, result.agent.wf_username, result.distance_m, null, detail);
  console.log(`[wa-pipeline] ocorrência ${occ.id} → ${result.agent.wf_username} (${result.distance_m}m)`);

  // Notifica o cidadão. (O agente: o despacho de câmera apenas REGISTRA o
  // 'selected' no banco — não há canal automático ao WF; seguimos o mesmo.)
  const catLabel = categoryName ? `*${categoryName}*` : 'sua solicitação';
  await sendText(occ.phone, `Sua ocorrência foi classificada como ${catLabel} e encaminhada à equipe mais próxima.`);
}

/** Pipeline principal: classifica e despacha uma ocorrência pending_classification. */
export async function runClassificationAndDispatch(occurrenceId: number): Promise<void> {
  const occ = await queryOne<any>('SELECT * FROM wa_occurrences WHERE id=$1', [occurrenceId]);
  if (!occ) { console.warn(`[wa-pipeline] ocorrência ${occurrenceId} não encontrada`); return; }

  const cfg = await getConfig();
  const threshold = Number(cfg?.confidence_threshold ?? 0.55);
  const text = (occ.description_transcribed || occ.description_raw || '').trim();

  try {
    if (!text) throw new Error('descrição vazia');
    const categories = await loadActiveCategories();
    if (!categories.length) {
      await query('UPDATE wa_occurrences SET status=$1, updated_at=NOW() WHERE id=$2', ['pending_manual', occurrenceId]);
      await logDispatch(occurrenceId, 'auto', null, null, null, { reason: 'no_categories' });
      await sendText(occ.phone, 'Sua ocorrência foi registrada e está em análise pela nossa equipe.');
      return;
    }

    const r = await axios.post(
      `${AI_SERVICE_URL}/classify`,
      { text, categories, threshold },
      { timeout: 60_000 }
    );
    const cls = r.data || {};
    const categoryId: number | null = cls.category_id ?? null;
    const confidence: number = Number(cls.confidence ?? 0);
    const method: string = cls.method || 'unknown';
    const scores = cls.scores || [];

    await query(
      'UPDATE wa_occurrences SET category_id=$1, ai_confidence=$2, ai_method=$3, updated_at=NOW() WHERE id=$4',
      [categoryId, confidence, method, occurrenceId]
    );
    occ.category_id = categoryId;

    const detailBase = { scores, method, confidence, threshold, category_name: cls.category_name ?? null };

    if (categoryId != null && confidence >= threshold) {
      // Despacho automático (passo 6).
      await autoDispatch(occ, cfg, 'auto', detailBase);
    } else {
      // Baixa confiança → despacho manual.
      await query('UPDATE wa_occurrences SET status=$1, updated_at=NOW() WHERE id=$2', ['pending_manual', occurrenceId]);
      await logDispatch(occurrenceId, 'auto', null, null, null, { ...detailBase, reason: 'low_confidence' });
      console.log(`[wa-pipeline] ocorrência ${occurrenceId} → pending_manual (low_confidence ${confidence}<${threshold})`);
      await sendText(occ.phone, 'Sua ocorrência foi registrada e está em análise pela nossa equipe. Em breve retornaremos.');
    }
  } catch (e: any) {
    console.error(`[wa-pipeline] ocorrência ${occurrenceId} erro:`, e.message);
    await query('UPDATE wa_occurrences SET status=$1, updated_at=NOW() WHERE id=$2', ['pending_manual', occurrenceId]).catch(() => {});
    await logDispatch(occurrenceId, 'auto', null, null, null, { reason: 'pipeline_error', error: e.message });
  }
}

/** Despacho manual explícito (endpoint /assign). */
export async function manualAssign(occurrenceId: number, wfUsername: string, actor: string): Promise<{ ok: boolean; distance_m: number | null; error?: string }> {
  const occ = await queryOne<any>('SELECT * FROM wa_occurrences WHERE id=$1', [occurrenceId]);
  if (!occ) return { ok: false, distance_m: null, error: 'occurrence_not_found' };

  // Tenta obter a distância até o agente escolhido reutilizando o motor.
  let distanceM: number | null = null;
  try {
    const tenantId = await getDefaultTenantId();
    if (tenantId && occ.latitude != null && occ.longitude != null) {
      const cfg = await getConfig();
      const radius = Number(cfg?.dispatch_max_radius_m ?? 15000);
      const result = await findNearestAgent(Number(occ.latitude), Number(occ.longitude), radius, tenantId);
      const match = result.considered.find((c) => c.wf_username === wfUsername);
      if (match) distanceM = match.distance_m;
    }
  } catch (e: any) {
    console.warn('[wa-pipeline] manualAssign: distância indisponível:', e.message);
  }

  await query(
    `UPDATE wa_occurrences SET status='dispatched', dispatched_wf_username=$1,
       dispatched_distance_m=$2, dispatched_at=NOW(), updated_at=NOW() WHERE id=$3`,
    [wfUsername, distanceM, occurrenceId]
  );
  await logDispatch(occurrenceId, 'manual', wfUsername, distanceM, actor, { manual: true });

  const categoryName = occ.category_id
    ? (await queryOne<any>('SELECT name FROM wa_categories WHERE id=$1', [occ.category_id]))?.name
    : null;
  const catLabel = categoryName ? `*${categoryName}*` : 'sua solicitação';
  await sendText(occ.phone, `Sua ocorrência (${catLabel}) foi encaminhada à equipe responsável.`);
  return { ok: true, distance_m: distanceM };
}

/** Reexecuta o passo 6 (despacho) de uma ocorrência já classificada. */
export async function redispatch(occurrenceId: number): Promise<void> {
  const occ = await queryOne<any>('SELECT * FROM wa_occurrences WHERE id=$1', [occurrenceId]);
  if (!occ) return;
  const cfg = await getConfig();
  await autoDispatch(occ, cfg, 'redispatch', { redispatch: true });
}

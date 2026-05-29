/**
 * Rotas WhatsApp (/api/whatsapp).
 *  - POST /webhook         → recebe eventos da Whatsmiau (auth por token, público)
 *  - GET/PUT /config       → configuração do bot (admin)
 *  - GET /connection       → proxy do connectionState (admin)
 *  - GET /qr               → proxy do QR PNG (admin)
 */
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import axios from 'axios';
import { query, queryOne } from '../config/db';
import { auth, requireRole } from '../middleware/auth';
import * as whatsmiau from '../services/whatsmiau';
import { handleIncoming } from '../services/waConversation';
import { embedCategory, reembedAll, manualAssign, redispatch } from '../services/waPipeline';
import { getTraccarPositions, haversineMeters, AGENT_ONLINE_MS } from '../lib/dispatch';

const router = Router();

// ─── Webhook (público, auth por X-Webhook-Token) ──────────────────
function tokenOk(provided: string | undefined): boolean {
  const expected = process.env.WA_WEBHOOK_SECRET || '';
  if (!expected || !provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function logIncoming(envelope: any): Promise<void> {
  try {
    const data = envelope?.data || {};
    const phone = String(data?.key?.remoteJid || '').split('@')[0].replace(/\D/g, '') || null;
    const type = envelope?.event || data?.messageType || 'unknown';
    let content: string | null = null;
    const msg = data?.message;
    if (msg?.conversation) content = msg.conversation;
    else if (msg?.extendedTextMessage?.text) content = msg.extendedTextMessage.text;
    else if (msg?.audioMessage) content = '[audio]';
    else if (msg?.locationMessage) content = '[location]';
    else if (msg?.imageMessage) content = '[image]';
    await query(
      'INSERT INTO wa_messages_log(phone, direction, type, content, raw) VALUES($1,$2,$3,$4,$5)',
      [phone, 'in', type, content, JSON.stringify(envelope)]
    );
  } catch (e: any) {
    console.error('[wa-webhook] falha ao logar entrada:', e.message);
  }
}

async function processWebhook(envelope: any): Promise<void> {
  await logIncoming(envelope);

  const event = envelope?.event;
  const data = envelope?.data || {};

  // connection.update → apenas logar (já gravado acima)
  if (event === 'connection.update') {
    console.log('[wa-webhook] connection.update:', JSON.stringify(data?.state ?? data));
    return;
  }

  // Só tratamos messages.upsert
  if (event !== 'messages.upsert') {
    console.log(`[wa-webhook] evento ignorado: ${event}`);
    return;
  }

  // Ignora mensagens enviadas por nós (fromMe)
  if (data?.key?.fromMe === true) {
    console.log('[wa-webhook] fromMe=true, ignorando');
    return;
  }

  await handleIncoming(envelope);
}

router.post('/webhook', (req: Request, res: Response) => {
  const provided = (req.headers['x-webhook-token'] as string) || undefined;
  if (!tokenOk(provided)) {
    console.warn(`[wa-webhook] token inválido de ${req.ip}`);
    return res.status(401).json({ error: 'unauthorized' });
  }

  const envelope = req.body;
  // Responde 200 imediatamente; processa de forma assíncrona.
  res.status(200).json({ ok: true });
  setImmediate(() =>
    processWebhook(envelope).catch((e) =>
      console.error('[wa-webhook] erro no processamento:', e.message)
    )
  );
});

// ─── Config (admin) ───────────────────────────────────────────────
router.get('/config', auth, async (_req: Request, res: Response) => {
  try {
    const cfg = await queryOne<any>('SELECT * FROM wa_config ORDER BY id LIMIT 1');
    return res.json(cfg || {});
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

router.put('/config', auth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const allowed = ['instance_name', 'bot_enabled', 'welcome_message', 'confidence_threshold', 'dispatch_max_radius_m'];
    const fields = allowed.filter((k) => k in req.body);
    if (!fields.length) return res.status(400).json({ error: 'nenhum campo válido' });

    const existing = await queryOne<any>('SELECT id FROM wa_config ORDER BY id LIMIT 1');
    const sets = fields.map((k, i) => `${k}=$${i + 1}`);
    const vals = fields.map((k) => req.body[k]);

    if (existing) {
      const updated = await queryOne<any>(
        `UPDATE wa_config SET ${sets.join(', ')}, updated_at=NOW() WHERE id=$${fields.length + 1} RETURNING *`,
        [...vals, existing.id]
      );
      return res.json(updated);
    }
    const cols = fields.join(', ');
    const ph = fields.map((_, i) => `$${i + 1}`).join(', ');
    const created = await queryOne<any>(
      `INSERT INTO wa_config (${cols}) VALUES (${ph}) RETURNING *`, vals
    );
    return res.json(created);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ─── Connection / QR (admin, proxy Whatsmiau) ─────────────────────
router.get('/connection', auth, async (_req: Request, res: Response) => {
  try {
    const state = await whatsmiau.getConnectionState();
    return res.json(state);
  } catch (e: any) {
    return res.status(502).json({ error: e.message });
  }
});

// Health da IA (proxy groupates_ai/health) — para o chip "Status da IA".
router.get('/ai-health', auth, async (_req: Request, res: Response) => {
  const url = (process.env.AI_SERVICE_URL || 'http://groupates_ai:8090') + '/health';
  try {
    const r = await axios.get(url, { timeout: 5000 });
    return res.json({ reachable: true, ...r.data });
  } catch (e: any) {
    return res.json({ reachable: false, openai_configured: false, error: e.message });
  }
});

router.get('/qr', auth, async (_req: Request, res: Response) => {
  try {
    const png = await whatsmiau.getQrImage();
    res.setHeader('Content-Type', 'image/png');
    return res.send(png);
  } catch (e: any) {
    return res.status(502).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════
// CATEGORIAS / PALAVRAS-CHAVE
// ════════════════════════════════════════════════════════════════
async function setKeywords(categoryId: number, keywords: string[], synonyms: string[]): Promise<void> {
  await query('DELETE FROM wa_keywords WHERE category_id=$1', [categoryId]);
  for (const t of keywords || []) {
    const term = String(t).trim();
    if (term) await query('INSERT INTO wa_keywords(category_id, term, is_synonym) VALUES($1,$2,false)', [categoryId, term]);
  }
  for (const t of synonyms || []) {
    const term = String(t).trim();
    if (term) await query('INSERT INTO wa_keywords(category_id, term, is_synonym) VALUES($1,$2,true)', [categoryId, term]);
  }
}

async function categoryWithTerms(cat: any): Promise<any> {
  const kws = await query<any>('SELECT term, is_synonym FROM wa_keywords WHERE category_id=$1 ORDER BY id', [cat.id]);
  return {
    id: cat.id, name: cat.name, priority: cat.priority, active: cat.active,
    embedded: Array.isArray(cat.embedding) && cat.embedding.length > 0,
    embedding_source: cat.embedding_source,
    keywords: kws.filter((k) => !k.is_synonym).map((k) => k.term),
    synonyms: kws.filter((k) => k.is_synonym).map((k) => k.term),
    created_at: cat.created_at, updated_at: cat.updated_at,
  };
}

router.get('/categories', auth, async (_req: Request, res: Response) => {
  try {
    const cats = await query<any>('SELECT * FROM wa_categories ORDER BY priority DESC, id');
    const out = [];
    for (const c of cats) out.push(await categoryWithTerms(c));
    return res.json(out);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

router.post('/categories', auth, requireRole('admin', 'operator'), async (req: Request, res: Response) => {
  try {
    const { name, priority, keywords, synonyms } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'name obrigatório' });
    const created = await queryOne<any>(
      'INSERT INTO wa_categories(name, priority) VALUES($1,$2) RETURNING *',
      [String(name).trim(), Number.isFinite(priority) ? priority : 1]
    );
    await setKeywords(created.id, keywords || [], synonyms || []);
    await embedCategory(created.id); // gera embedding (ou null se sem chave)
    const fresh = await queryOne<any>('SELECT * FROM wa_categories WHERE id=$1', [created.id]);
    return res.status(201).json(await categoryWithTerms(fresh));
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

router.put('/categories/:id', auth, requireRole('admin', 'operator'), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const cat = await queryOne<any>('SELECT id FROM wa_categories WHERE id=$1', [id]);
    if (!cat) return res.status(404).json({ error: 'categoria não encontrada' });
    const { name, priority, keywords, synonyms, active } = req.body;

    const sets: string[] = []; const vals: any[] = []; let i = 1;
    if (name !== undefined) { sets.push(`name=$${i++}`); vals.push(String(name).trim()); }
    if (priority !== undefined) { sets.push(`priority=$${i++}`); vals.push(priority); }
    if (active !== undefined) { sets.push(`active=$${i++}`); vals.push(!!active); }
    if (sets.length) {
      vals.push(id);
      await query(`UPDATE wa_categories SET ${sets.join(', ')}, updated_at=NOW() WHERE id=$${i}`, vals);
    }

    const termsChanged = keywords !== undefined || synonyms !== undefined;
    if (termsChanged) await setKeywords(id, keywords || [], synonyms || []);
    // Re-embed se nome ou termos mudaram.
    if (name !== undefined || termsChanged) await embedCategory(id);

    const fresh = await queryOne<any>('SELECT * FROM wa_categories WHERE id=$1', [id]);
    return res.json(await categoryWithTerms(fresh));
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// Soft delete — preserva histórico de ocorrências.
router.delete('/categories/:id', auth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const r = await queryOne<any>('UPDATE wa_categories SET active=false, updated_at=NOW() WHERE id=$1 RETURNING id', [id]);
    if (!r) return res.status(404).json({ error: 'categoria não encontrada' });
    return res.json({ ok: true, id, soft_deleted: true });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

router.post('/categories/reembed', auth, requireRole('admin', 'operator'), async (_req: Request, res: Response) => {
  try {
    const result = await reembedAll();
    return res.json({ ok: true, ...result });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════
// OCORRÊNCIAS / DESPACHO MANUAL
// ════════════════════════════════════════════════════════════════
const OCC_SELECT = `
  SELECT o.id, o.phone, o.name, o.latitude, o.longitude,
         o.description_raw, o.description_transcribed, o.audio_url,
         o.category_id, c.name AS category_name,
         o.ai_confidence, o.ai_method, o.status,
         o.dispatched_wf_username, o.dispatched_distance_m, o.dispatched_at,
         o.created_at, o.updated_at
  FROM wa_occurrences o
  LEFT JOIN wa_categories c ON c.id = o.category_id`;

router.get('/occurrences', auth, async (req: Request, res: Response) => {
  try {
    const where: string[] = []; const vals: any[] = []; let i = 1;
    if (req.query.status) { where.push(`o.status=$${i++}`); vals.push(String(req.query.status)); }
    if (req.query.from) { where.push(`o.created_at>=$${i++}`); vals.push(new Date(String(req.query.from))); }
    if (req.query.to) { where.push(`o.created_at<=$${i++}`); vals.push(new Date(String(req.query.to))); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const offset = Number(req.query.offset) || 0;
    const rows = await query(`${OCC_SELECT} ${w} ORDER BY o.id DESC LIMIT ${limit} OFFSET ${offset}`, vals);
    const total = await queryOne<any>(`SELECT COUNT(*)::int AS n FROM wa_occurrences o ${w}`, vals);
    return res.json({ occurrences: rows, total: total?.n || 0 });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

router.get('/occurrences/pending', auth, async (_req: Request, res: Response) => {
  try {
    const rows = await query(`${OCC_SELECT} WHERE o.status='pending_manual' ORDER BY o.id DESC`);
    return res.json({ occurrences: rows, total: rows.length });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

router.get('/occurrences/:id', auth, async (req: Request, res: Response) => {
  try {
    const occ = await queryOne(`${OCC_SELECT} WHERE o.id=$1`, [Number(req.params.id)]);
    if (!occ) return res.status(404).json({ error: 'ocorrência não encontrada' });
    const dispatches = await query('SELECT * FROM wa_dispatch_log WHERE occurrence_id=$1 ORDER BY id', [Number(req.params.id)]);
    return res.json({ ...occ, dispatch_log: dispatches });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

router.post('/occurrences/:id/assign', auth, requireRole('admin', 'operator'), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { wf_username } = req.body;
    if (!wf_username) return res.status(400).json({ error: 'wf_username obrigatório' });
    const result = await manualAssign(id, String(wf_username), req.user?.email || 'unknown');
    if (!result.ok) return res.status(404).json({ error: result.error });
    return res.json({ ok: true, wf_username, distance_m: result.distance_m });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

router.put('/occurrences/:id/category', auth, requireRole('admin', 'operator'), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { category_id } = req.body;
    const r = await queryOne<any>(
      'UPDATE wa_occurrences SET category_id=$1, updated_at=NOW() WHERE id=$2 RETURNING id, category_id',
      [category_id ?? null, id]
    );
    if (!r) return res.status(404).json({ error: 'ocorrência não encontrada' });
    return res.json({ ok: true, ...r });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

router.post('/occurrences/:id/redispatch', auth, requireRole('admin', 'operator'), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const occ = await queryOne<any>('SELECT id FROM wa_occurrences WHERE id=$1', [id]);
    if (!occ) return res.status(404).json({ error: 'ocorrência não encontrada' });
    await redispatch(id);
    const fresh = await queryOne(`${OCC_SELECT} WHERE o.id=$1`, [id]);
    return res.json({ ok: true, occurrence: fresh });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════
// AGENTES DISPONÍVEIS (dropdown do despacho manual)
// ════════════════════════════════════════════════════════════════
router.get('/agents/available', auth, async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const agents = await query<any>(
      'SELECT id, wf_username, display_name, traccar_device_id FROM wf_agents WHERE enabled=true AND traccar_device_id IS NOT NULL ORDER BY id'
    );

    let positions: any[] = [];
    try { positions = await getTraccarPositions(tenantId); }
    catch (e: any) { console.warn('[wa-agents] traccar offline:', e.message); }

    const now = Date.now();
    const posByDevice = new Map<number, any>();
    for (const p of positions) posByDevice.set(p.deviceId, p);

    // Coordenadas da ocorrência (opcional) para distância/ordenação.
    let occLat: number | null = null, occLng: number | null = null;
    if (req.query.occurrenceId) {
      const occ = await queryOne<any>('SELECT latitude, longitude FROM wa_occurrences WHERE id=$1', [Number(req.query.occurrenceId)]);
      if (occ && occ.latitude != null && occ.longitude != null) {
        occLat = Number(occ.latitude); occLng = Number(occ.longitude);
      }
    }

    const out = agents.map((a) => {
      const pos = posByDevice.get(a.traccar_device_id);
      const fresh = !!(pos && pos.valid && (now - new Date(pos.fixTime).getTime()) < AGENT_ONLINE_MS);
      let distance_m: number | null = null;
      if (pos && occLat != null && occLng != null) {
        distance_m = Math.round(haversineMeters(occLat, occLng, pos.latitude, pos.longitude));
      }
      return {
        wf_username: a.wf_username,
        display_name: a.display_name,
        last_lat: pos ? pos.latitude : null,
        last_lng: pos ? pos.longitude : null,
        fixTime: pos ? pos.fixTime : null,
        fresh,
        distance_m,
      };
    });

    if (occLat != null && occLng != null) {
      out.sort((x, y) => {
        if (x.distance_m == null) return 1;
        if (y.distance_m == null) return -1;
        return x.distance_m - y.distance_m;
      });
    }
    return res.json(out);
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

export default router;

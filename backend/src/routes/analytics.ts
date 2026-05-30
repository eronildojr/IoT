import { Router, Request, Response } from 'express';
import { query, queryOne } from '../config/db';
import { auth, requireRole } from '../middleware/auth';

const router = Router();

// Mapeamento de analíticos disponíveis por modelo de câmera
const ANALYTICS_BY_MODEL: Record<string, string[]> = {
  'DS-2CD1021G0-I': ['motion_detection', 'human_detection', 'ir_night'],
  'DS-2CD1043G2-LIU': ['human_detection', 'intrusion', 'line_crossing', 'strobe_alarm', 'siren_alarm', 'ir_night'],
  'DS-2CD2T47G2-LSU/SL': ['colorvu', 'human_detection', 'vehicle_detection', 'intrusion', 'line_crossing', 'strobe_alarm', 'siren_alarm'],
  'DS-TCG406-E': ['motion_detection', 'ir_night'],
  'iDS-2CD7A46G0-IZHS': ['face_recognition', 'human_detection', 'vehicle_detection', 'intrusion', 'line_crossing', 'behavior_analysis', 'people_counting', 'ir_night'],
};

const ANALYTIC_LABELS: Record<string, { label: string; description: string; icon: string; category: string }> = {
  motion_detection:  { label: 'Detecção de Movimento',      description: 'Detecta qualquer movimento na cena',                          icon: 'activity',     category: 'detection' },
  human_detection:   { label: 'Detecção Humana',            description: 'Identifica presença de pessoas na cena',                      icon: 'user',         category: 'detection' },
  intrusion:         { label: 'Detecção de Intrusão',       description: 'Alerta quando objeto entra em zona proibida',                 icon: 'shield-alert',  category: 'security' },
  line_crossing:     { label: 'Cruzamento de Linha',        description: 'Alerta quando objeto cruza linha virtual',                    icon: 'git-branch',   category: 'security' },
  strobe_alarm:      { label: 'Alarme Estroboscópico',      description: 'Luz de alerta visual integrada na câmera',                    icon: 'zap',          category: 'alarm' },
  siren_alarm:       { label: 'Sirene de Alarme',           description: 'Alarme sonoro integrado na câmera',                           icon: 'bell',         category: 'alarm' },
  colorvu:           { label: 'ColorVu (Colorido 24h)',     description: 'Imagem colorida mesmo no escuro total',                       icon: 'sun',          category: 'imaging' },
  ir_night:          { label: 'Visão Noturna IR',           description: 'Infravermelho para visão noturna',                            icon: 'moon',         category: 'imaging' },
  face_recognition:  { label: 'Reconhecimento Facial',      description: 'Identifica e compara rostos com banco de dados',              icon: 'scan-face',    category: 'ai' },
  vehicle_detection: { label: 'Detecção de Veículos',       description: 'Detecta e classifica veículos (carro, moto, caminhão)',       icon: 'car',          category: 'detection' },
  behavior_analysis: { label: 'Análise Comportamental',     description: 'Detecta aglomeração, objeto abandonado, etc.',                icon: 'brain',        category: 'ai' },
  people_counting:   { label: 'Contagem de Pessoas',        description: 'Conta pessoas entrando e saindo da área',                     icon: 'users',        category: 'ai' },
};

// GET /api/analytics/camera/:cameraId — analíticos de uma câmera
router.get('/camera/:cameraId', auth, async (req: Request, res: Response) => {
  try {
    const analytics = await query(
      `SELECT ca.*, ic.model, ic.name as camera_name
       FROM camera_analytics ca
       JOIN ip_cameras ic ON ca.camera_id = ic.id
       WHERE ca.camera_id = $1
       ORDER BY ca.analytic_type`,
      [req.params.cameraId]
    );
    // Enriquecer com labels
    const enriched = analytics.map(a => ({
      ...a,
      ...(ANALYTIC_LABELS[a.analytic_type] || { label: a.analytic_type, description: '', icon: 'settings', category: 'other' })
    }));
    res.json({ analytics: enriched, labels: ANALYTIC_LABELS });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/labels — todos os labels disponíveis
router.get('/labels', auth, async (_req: Request, res: Response) => {
  res.json({ labels: ANALYTIC_LABELS, byModel: ANALYTICS_BY_MODEL });
});

// PUT /api/analytics/:id — atualizar configuração de um analítico
router.put('/:id', auth, requireRole('admin', 'operator'), async (req: Request, res: Response) => {
  try {
    const { enabled, sensitivity, schedule_24h, schedule_start, schedule_end, alert_enabled, config } = req.body;
    const [analytic] = await query(
      `UPDATE camera_analytics SET
         enabled = COALESCE($1, enabled),
         sensitivity = COALESCE($2, sensitivity),
         schedule_24h = COALESCE($3, schedule_24h),
         schedule_start = $4,
         schedule_end = $5,
         alert_enabled = COALESCE($6, alert_enabled),
         config = COALESCE($7, config),
         updated_at = NOW()
       WHERE id = $8 RETURNING *`,
      [enabled, sensitivity, schedule_24h, schedule_start || null, schedule_end || null,
       alert_enabled, config ? JSON.stringify(config) : null, req.params.id]
    );
    res.json({ analytic });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/analytics/camera/:cameraId/toggle — habilitar/desabilitar analítico
router.post('/camera/:cameraId/toggle', auth, requireRole('admin', 'operator'), async (req: Request, res: Response) => {
  try {
    const { analytic_type, enabled } = req.body;
    const existing = await queryOne(
      'SELECT id FROM camera_analytics WHERE camera_id=$1 AND analytic_type=$2',
      [req.params.cameraId, analytic_type]
    );
    if (existing) {
      const [analytic] = await query(
        'UPDATE camera_analytics SET enabled=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
        [enabled, existing.id]
      );
      res.json({ analytic });
    } else {
      const [analytic] = await query(
        'INSERT INTO camera_analytics (camera_id, analytic_type, enabled) VALUES ($1,$2,$3) RETURNING *',
        [req.params.cameraId, analytic_type, enabled]
      );
      res.json({ analytic });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/events — eventos de analíticos
router.get('/events', auth, async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenant_id;
    const { camera_id, analytic_type, limit = 50, offset = 0 } = req.query;
    let where = 'cae.tenant_id = $1';
    const params: any[] = [tenantId];
    if (camera_id) { params.push(camera_id); where += ` AND cae.camera_id = $${params.length}`; }
    if (analytic_type) { params.push(analytic_type); where += ` AND cae.analytic_type = $${params.length}`; }
    params.push(Number(limit), Number(offset));
    const events = await query(
      `SELECT cae.*, ic.name as camera_name, ic.location
       FROM camera_analytic_events cae
       LEFT JOIN ip_cameras ic ON cae.camera_id = ic.id
       WHERE ${where}
       ORDER BY cae.detected_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const [countRow] = await query(
      `SELECT COUNT(*)::int as total FROM camera_analytic_events cae WHERE ${where}`,
      params.slice(0, params.length - 2)
    );
    res.json({ events, total: countRow?.total || 0 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/analytics/events — registrar evento
router.post('/events', auth, async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenant_id;
    const { camera_id, analytic_type, event_data, confidence, snapshot_url, location } = req.body;
    const [event] = await query(
      `INSERT INTO camera_analytic_events (tenant_id, camera_id, analytic_type, event_data, confidence, snapshot_url, location)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [tenantId, camera_id || null, analytic_type, JSON.stringify(event_data || {}),
       confidence || null, snapshot_url || null, location || null]
    );
    res.json({ event });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/analytics/events/:id/acknowledge
router.put('/events/:id/acknowledge', auth, async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenant_id;
    await query(
      'UPDATE camera_analytic_events SET acknowledged=true WHERE id=$1 AND tenant_id=$2',
      [req.params.id, tenantId]
    );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/stats — estatísticas gerais
router.get('/stats', auth, async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenant_id;
    const stats = await query(
      `SELECT analytic_type, COUNT(*)::int as total,
              COUNT(*) FILTER (WHERE detected_at > NOW() - INTERVAL '24 hours')::int as last_24h
       FROM camera_analytic_events
       WHERE tenant_id = $1
       GROUP BY analytic_type ORDER BY total DESC`,
      [tenantId]
    );
    res.json({ stats });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
